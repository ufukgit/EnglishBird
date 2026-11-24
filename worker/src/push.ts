// Yüksüz (boş) Web Push. Yük olmadığı için şifreleme gerekmez; yalnızca VAPID imzası.
// Bildirim metni service worker'da sabittir.

export interface PushSubscriptionJson {
  endpoint: string;
  keys?: { p256dh: string; auth: string };
}

export interface Vapid {
  publicKey: string; // base64url, ham (65 bayt) P-256 genel anahtar
  privateJwk: JsonWebKey;
  subject: string; // https://… veya mailto:…
}

const b64url = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function vapidJwt(audience: string, v: Vapid): Promise<string> {
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = b64url(
    enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: v.subject })),
  );
  const key = await crypto.subtle.importKey('jwk', v.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

export async function sendEmptyPush(sub: PushSubscriptionJson, v: Vapid): Promise<number> {
  const audience = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(audience, v);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: `vapid t=${jwt}, k=${v.publicKey}`,
      ttl: '3000',
      urgency: 'normal',
      topic: 'daily',
      'content-length': '0',
    },
  });
  return res.status;
}
