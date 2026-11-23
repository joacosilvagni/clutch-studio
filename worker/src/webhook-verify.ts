import { base64ToBytes, crc32 } from './crypto';

/**
 * Self-verification of PayPal webhook signatures (PayPal's documented preferred method):
 *   signature = RSA-SHA256( "<transmission_id>|<transmission_time>|<webhook_id>|<crc32(raw body)>" )
 * verified with the public key of the certificate at PAYPAL-CERT-URL.
 *
 * The certificate URL comes from the request, so it is attacker-controlled: it must be HTTPS on a
 * PayPal host, otherwise anyone could point us at their own certificate. TLS to that host is what
 * makes the certificate trustworthy.
 */
export function isAllowedCertUrl(raw: string | null): boolean {
  if (!raw) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return (
    u.protocol === 'https:' &&
    u.port === '' &&
    u.username === '' &&
    u.password === '' &&
    (u.hostname === 'api.paypal.com' ||
      u.hostname === 'api-m.paypal.com' ||
      u.hostname === 'api.sandbox.paypal.com' ||
      u.hostname === 'api-m.sandbox.paypal.com')
  );
}

const keyCache = new Map<string, CryptoKey>();

export async function verifyWebhookSelf(opts: {
  headers: Headers;
  rawBody: string;
  webhookId: string;
  fetchImpl: typeof fetch;
}): Promise<boolean> {
  const { headers, rawBody, webhookId, fetchImpl } = opts;
  const algo = headers.get('paypal-auth-algo');
  const certUrl = headers.get('paypal-cert-url');
  const transmissionId = headers.get('paypal-transmission-id');
  const transmissionTime = headers.get('paypal-transmission-time');
  const sig = headers.get('paypal-transmission-sig');
  if (algo !== 'SHA256withRSA' || !transmissionId || !transmissionTime || !sig) return false;
  if (!isAllowedCertUrl(certUrl)) return false;

  let key = keyCache.get(certUrl!);
  if (!key) {
    const res = await fetchImpl(certUrl!);
    if (!res.ok) return false;
    const spki = spkiFromPem(await res.text());
    key = await crypto.subtle.importKey('spki', spki, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    keyCache.set(certUrl!, key);
  }
  const crc = crc32(new TextEncoder().encode(rawBody));
  const message = new TextEncoder().encode(`${transmissionId}|${transmissionTime}|${webhookId}|${crc}`);
  let sigBytes: Uint8Array;
  try {
    sigBytes = base64ToBytes(sig);
  } catch {
    return false;
  }
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sigBytes, message);
}

export function _resetKeyCacheForTests(): void {
  keyCache.clear();
}

// --- minimal DER reader: just enough to pull SubjectPublicKeyInfo out of an X.509 certificate ---

interface Tlv {
  tag: number;
  start: number; // start of the whole TLV
  contentStart: number;
  end: number; // exclusive
}

function readTlv(buf: Uint8Array, pos: number): Tlv {
  const tag = buf[pos]!;
  let len = buf[pos + 1]!;
  let contentStart = pos + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    if (n === 0 || n > 4) throw new Error('unsupported DER length');
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[pos + 2 + i]!;
    contentStart += n;
  }
  const end = contentStart + len;
  if (end > buf.length) throw new Error('truncated DER');
  return { tag, start: pos, contentStart, end };
}

function children(buf: Uint8Array, parent: Tlv): Tlv[] {
  const out: Tlv[] = [];
  for (let p = parent.contentStart; p < parent.end; ) {
    const t = readTlv(buf, p);
    out.push(t);
    p = t.end;
  }
  return out;
}

export function spkiFromPem(pem: string): ArrayBuffer {
  const m = pem.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
  if (!m) throw new Error('no certificate in PEM');
  const der = base64ToBytes(m[1]!.replace(/\s+/g, ''));
  const cert = readTlv(der, 0);
  const tbs = children(der, cert)[0]!;
  const fields = children(der, tbs);
  // tbsCertificate: [0] version (optional), serial, signature, issuer, validity, subject, subjectPublicKeyInfo
  const offset = fields[0]!.tag === 0xa0 ? 1 : 0;
  const spki = fields[offset + 5];
  if (!spki || spki.tag !== 0x30) throw new Error('SubjectPublicKeyInfo not found');
  return der.slice(spki.start, spki.end).buffer;
}
