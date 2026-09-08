/**
 * Generate a fresh VAPID key pair for Web Push (RFC 8292).
 *
 *   node scripts/gen-vapid.js
 *
 * Then:
 *   - put VAPID_PUBLIC_KEY into push-config.js  (safe to commit — it IS public)
 *   - set  VAPID_PRIVATE_KEY  as a Supabase Edge Function secret:
 *       supabase secrets set VAPID_PRIVATE_KEY=<value> VAPID_SUBJECT=mailto:you@domain
 *   - never commit the private key
 */
const { generateKeyPairSync } = require('crypto');

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });

const rawPublic = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(pub.x, 'base64url'),
  Buffer.from(pub.y, 'base64url'),
]).toString('base64url');

console.log('VAPID_PUBLIC_KEY  (client applicationServerKey, commit in push-config.js):');
console.log('  ' + rawPublic + '\n');
console.log('VAPID_PRIVATE_KEY (Supabase secret — DO NOT COMMIT):');
console.log('  ' + priv.d + '\n');
console.log('Set the subject too, e.g.:');
console.log('  supabase secrets set VAPID_PUBLIC_KEY=' + rawPublic);
console.log('  supabase secrets set VAPID_PRIVATE_KEY=' + priv.d);
console.log('  supabase secrets set VAPID_SUBJECT=mailto:admin@buyselltradesxm.com');
