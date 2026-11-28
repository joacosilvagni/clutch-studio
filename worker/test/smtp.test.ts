import { describe, it, expect, afterEach } from 'vitest';
import { _setSmtpConnectForTests, buildMime, smtpSend, type SmtpSocket } from '../src/smtp';
import { sendMail } from '../src/mail';
import { scriptedFetch } from './helpers';
import type { Env } from '../src/env';

/** A scripted SMTP server: answers each command line, records what the client sent. */
function fakeServer(over: { auth?: string } = {}) {
  const sent: string[] = [];
  let host = '';
  let port = 0;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const connect = (h: string, p: number): SmtpSocket => {
    host = h;
    port = p;
    let ctrl!: ReadableStreamDefaultController<Uint8Array>;
    const readable = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) });
    const say = (s: string) => ctrl.enqueue(enc.encode(s + '\r\n'));
    say('220 smtp.gmail.com ESMTP ready');
    let buf = '';
    let inData = false;
    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        buf += dec.decode(chunk);
        let i: number;
        while ((i = buf.indexOf('\r\n')) !== -1) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 2);
          sent.push(line);
          if (inData) {
            if (line === '.') {
              inData = false;
              say('250 2.0.0 OK queued');
            }
            continue;
          }
          if (line.startsWith('EHLO')) say('250-smtp.gmail.com\r\n250-AUTH LOGIN PLAIN\r\n250 SMTPUTF8');
          else if (line.startsWith('AUTH PLAIN')) say(over.auth ?? '235 2.7.0 Accepted');
          else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) say('250 OK');
          else if (line === 'DATA') {
            inData = true;
            say('354 Go ahead');
          } else if (line === 'QUIT') say('221 bye');
        }
      },
    });
    return { readable, writable, close: async () => void ctrl.close() };
  };
  return { connect, sent, where: () => `${host}:${port}` };
}

const cfg = { host: 'smtp.gmail.com', port: 465, user: 'shop@gmail.com', password: 'abcd efgh ijkl mnop' };
const msg = { from: 'shop@gmail.com', fromName: 'Clutch Studio', to: 'buyer@example.com', subject: 'Your order ✓', html: '<p>.hi</p>', text: 'line\n.starts with dot' };

afterEach(() => _setSmtpConnectForTests(null));

describe('smtp', () => {
  it('authenticates with AUTH PLAIN and sends a multipart message', async () => {
    const srv = fakeServer();
    _setSmtpConnectForTests(srv.connect);
    await smtpSend(cfg, msg);
    expect(srv.where()).toBe('smtp.gmail.com:465');
    const auth = srv.sent.find((l) => l.startsWith('AUTH PLAIN '))!;
    expect(atob(auth.slice(11))).toBe('\0shop@gmail.com\0abcd efgh ijkl mnop');
    expect(srv.sent).toContain('MAIL FROM:<shop@gmail.com>');
    expect(srv.sent).toContain('RCPT TO:<buyer@example.com>');
    expect(srv.sent).toContain('Subject: =?UTF-8?B?WW91ciBvcmRlciDinJM=?=');
    expect(srv.sent.at(-1)).toBe('QUIT');
  });

  it('fails on rejected credentials', async () => {
    const srv = fakeServer({ auth: '535 5.7.8 Username and Password not accepted' });
    _setSmtpConnectForTests(srv.connect);
    await expect(smtpSend(cfg, msg)).rejects.toThrow('smtp_auth_535');
  });

  it('builds MIME without header injection and with base64 bodies', () => {
    const mime = buildMime({ ...msg, to: 'a@b.c\r\nBcc: evil@x.y', subject: 'Hi\r\nBcc: evil@x.y' }, new Date('2026-11-28T12:00:00Z'), 'id1');
    expect(mime).not.toMatch(/^Bcc:/m);
    expect(mime).toContain('Content-Transfer-Encoding: base64');
    expect(mime).toContain('Message-ID: <id1@gmail.com>');
  });
});

describe('sendMail transport choice', () => {
  const base = { PAYPAL_ENV: 'sandbox', MAIL_FROM: 'Clutch Studio <onboarding@resend.dev>' } as unknown as Env;
  const resend = () => scriptedFetch([(url) => (url === 'https://api.resend.com/emails' ? Response.json({ id: 'x' }) : undefined)]);
  const m = { to: 'buyer@example.com', subject: 's', html: 'h', text: 't', idempotencyKey: 'k' };

  it('uses Gmail when configured and does not call Resend', async () => {
    const srv = fakeServer();
    _setSmtpConnectForTests(srv.connect);
    const f = resend();
    expect(await sendMail({ ...base, GMAIL_USER: 'shop@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop', RESEND_API_KEY: 're' }, f.fn, m)).toBe(true);
    expect(f.calls).toHaveLength(0);
    // spaces in the app password (as Google shows it) are removed
    expect(atob(srv.sent.find((l) => l.startsWith('AUTH PLAIN '))!.slice(11))).toBe('\0shop@gmail.com\0abcdefghijklmnop');
    expect(srv.sent).toContain('From: Clutch Studio <shop@gmail.com>');
  });

  it('falls back to Resend when Gmail fails, and to nothing without a key', async () => {
    _setSmtpConnectForTests(fakeServer({ auth: '535 no' }).connect);
    const f = resend();
    expect(await sendMail({ ...base, GMAIL_USER: 'shop@gmail.com', GMAIL_APP_PASSWORD: 'x', RESEND_API_KEY: 're' }, f.fn, m)).toBe(true);
    expect(f.calls).toHaveLength(1);
    expect(await sendMail({ ...base, GMAIL_USER: 'shop@gmail.com', GMAIL_APP_PASSWORD: 'x' }, f.fn, m)).toBe(false);
  });

  it('uses Resend alone when Gmail is not configured', async () => {
    const f = resend();
    expect(await sendMail({ ...base, RESEND_API_KEY: 're' }, f.fn, m)).toBe(true);
    expect(f.calls).toHaveLength(1);
  });
});
