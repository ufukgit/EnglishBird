// Web Push için VAPID anahtar çifti üretir. Çıktıdaki iki değeri `wrangler secret put` ile ekle.
import { webcrypto as crypto } from 'node:crypto';

const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = Buffer.from(await crypto.subtle.exportKey('raw', kp.publicKey));
const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
console.log('VAPID_PUBLIC_KEY =', raw.toString('base64url'));
console.log('VAPID_PRIVATE_JWK =', JSON.stringify(jwk));
