// Minimal SMTP client over Cloudflare TCP sockets, for sending through Gmail with an app password
// (smtp.gmail.com:465, implicit TLS, AUTH PLAIN). No domain needed; Gmail allows ~500 messages a day.
// Credentials come from Worker secrets (GMAIL_USER, GMAIL_APP_PASSWORD), never from the repo.

export interface SmtpSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
}
export type SmtpConnect = (host: string, port: number) => SmtpSocket | Promise<SmtpSocket>;

export interface SmtpMessage {
  from: string; // bare address used for MAIL FROM (the authenticated Gmail account)
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

let connectOverride: SmtpConnect | null = null;
/** Tests replace the socket; production uses cloudflare:sockets. */
export function _setSmtpConnectForTests(fn: SmtpConnect | null): void {
  connectOverride = fn;
}

async function defaultConnect(host: string, port: number): Promise<SmtpSocket> {
  const { connect } = await import('cloudflare:sockets');
  return connect({ hostname: host, port }, { secureTransport: 'on', allowHalfOpen: false }) as unknown as SmtpSocket;
}

const enc = new TextEncoder();
const b64 = (s: string) => {
  let bin = '';
  for (const b of enc.encode(s)) bin += String.fromCharCode(b);
  return btoa(bin);
};
const wrap76 = (s: string) => s.replace(/.{1,76}/g, '$&\r\n');
// RFC 2047 encoded-word for non-ASCII header text (subjects, display names).
const header = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

export function buildMime(m: SmtpMessage, now: Date, id: string): string {
  const boundary = `cs-${id}`;
  const domain = m.from.split('@')[1] ?? 'localhost';
  return [
    `From: ${header(clean(m.fromName))} <${clean(m.from)}>`,
    `To: <${clean(m.to)}>`,
    `Subject: ${header(clean(m.subject))}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${id}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(m.text)),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(m.html)),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

/** Reads one (possibly multi-line) SMTP reply and returns its code. */
class Reader {
  private buf = '';
  private dec = new TextDecoder();
  constructor(private r: ReadableStreamDefaultReader<Uint8Array>) {}
  async reply(): Promise<{ code: number; text: string }> {
    const lines: string[] = [];
    for (;;) {
      let nl: number;
      while ((nl = this.buf.indexOf('\n')) === -1) {
        const { value, done } = await this.r.read();
        if (done) throw new Error('smtp_connection_closed');
        this.buf += this.dec.decode(value, { stream: true });
        if (this.buf.length > 64 * 1024) throw new Error('smtp_reply_too_long');
      }
      const line = this.buf.slice(0, nl).replace(/\r$/, '');
      this.buf = this.buf.slice(nl + 1);
      lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) return { code: Number(line.slice(0, 3)), text: lines.join('\n') };
      if (!/^\d{3}-/.test(line)) throw new Error('smtp_bad_reply');
    }
  }
}

/** Sends one message. Throws on any protocol or auth failure (the caller decides what to do). */
export async function smtpSend(
  cfg: { host: string; port: number; user: string; password: string },
  m: SmtpMessage,
  now = new Date(),
): Promise<void> {
  const socket = await (connectOverride ?? defaultConnect)(cfg.host, cfg.port);
  const writer = socket.writable.getWriter();
  const reader = new Reader(socket.readable.getReader());
  const send = (line: string) => writer.write(enc.encode(line + '\r\n'));
  const expect = async (ok: number[], step: string) => {
    const r = await reader.reply();
    if (!ok.includes(r.code)) throw new Error(`smtp_${step}_${r.code}`);
  };
  try {
    await expect([220], 'greeting');
    await send('EHLO clutch-studio');
    await expect([250], 'ehlo');
    await send(`AUTH PLAIN ${b64(`\0${cfg.user}\0${cfg.password}`)}`);
    await expect([235], 'auth');
    await send(`MAIL FROM:<${clean(m.from)}>`);
    await expect([250], 'mail_from');
    await send(`RCPT TO:<${clean(m.to)}>`);
    await expect([250, 251], 'rcpt_to');
    await send('DATA');
    await expect([354], 'data');
    const body = buildMime(m, now, crypto.randomUUID()).replace(/^\./gm, '..'); // dot-stuffing
    await writer.write(enc.encode(body + '\r\n.\r\n'));
    await expect([250], 'sent');
    await send('QUIT').catch(() => undefined);
  } finally {
    await socket.close().catch(() => undefined);
  }
}
