/**
 * Validates the Web Push (RFC 8291 aes128gcm / RFC 8188) encryption used by
 * supabase/functions/send-push/index.ts.
 *
 * 1. Decrypts the RFC 8291 Appendix A worked example and checks the plaintext
 *    (validates HKDF chain, nonce, header parsing against the spec).
 * 2. Round-trips: generate a UA key pair, encrypt, decrypt, compare
 *    (validates the encrypt path end to end).
 *
 * Runs on Node's Web Crypto (globalThis.crypto.subtle), same primitives Deno
 * uses in the Edge Function.
 *
 * Run: node scripts/push-crypto-check.js
 */
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

const b64urlToBytes = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '='.repeat((4 - (s.length % 4)) % 4);
  return new Uint8Array(Buffer.from(s, 'base64'));
};
const bytesToB64url = (b) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url');
const concat = (...ps) => {
  const out = new Uint8Array(ps.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of ps) { out.set(p, o); o += p.length; }
  return out;
};

async function hkdf(salt, ikm, info, length) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// jwk import for a raw P-256 private "d" needs x/y — derive them by importing
// the matching public point. For the test we build full JWKs directly.
async function importEcdhPrivateFromRaw(dB64, pubRaw) {
  const jwk = {
    kty: 'EC', crv: 'P-256', d: dB64,
    x: bytesToB64url(pubRaw.slice(1, 33)), y: bytesToB64url(pubRaw.slice(33, 65)), ext: true,
  };
  return subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
}

// ---- the function under test (mirror of index.ts encryptPayload) ----
async function encryptPayload(plaintext, uaP256dh, uaAuth, opts = {}) {
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  let asPriv, asPublicRaw;
  if (opts.asPrivateB64 && opts.asPublicRaw) {
    asPriv = await importEcdhPrivateFromRaw(opts.asPrivateB64, opts.asPublicRaw);
    asPublicRaw = opts.asPublicRaw;
  } else {
    const pair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    asPriv = pair.privateKey;
    asPublicRaw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  }
  const uaPubKey = await subtle.importKey('raw', uaP256dh, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaPubKey }, asPriv, 256));

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaP256dh, asPublicRaw);
  const ikm = await hkdf(uaAuth, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const padded = concat(plaintext, new Uint8Array([0x02]));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, padded));

  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096);
  const header = concat(salt, rs, new Uint8Array([asPublicRaw.length]), asPublicRaw);
  return concat(header, ct);
}

// ---- independent decrypt (uses the UA private key) ----
async function decryptPayload(body, uaPrivateB64, uaPublicRaw, uaAuth) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublicRaw = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);

  const uaPriv = await importEcdhPrivateFromRaw(uaPrivateB64, uaPublicRaw);
  const asPubKey = await subtle.importKey('raw', asPublicRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asPubKey }, uaPriv, 256));

  const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublicRaw, asPublicRaw);
  const ikm = await hkdf(uaAuth, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, ct));
  // strip the 0x02 record delimiter and any trailing zero padding
  let endIdx = pt.length - 1;
  while (endIdx >= 0 && pt[endIdx] === 0) endIdx--;
  return pt.slice(0, endIdx); // drop the delimiter byte at endIdx
}

const results = [];
const check = (n, ok, d) => { results.push(ok); console.log((ok ? '  PASS  ' : '  FAIL  ') + n + (d ? '  — ' + d : '')); };

(async () => {
  // ---- 1. RFC 8291 Appendix A vector (decrypt direction) ----
  const V = {
    plaintext: 'When I grow up, I want to be a watermelon',
    ua_private: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
    ua_public: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth_secret: 'BTBZMqHH6r4Tts7J_aSIgg',
    ciphertext: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  };
  try {
    const uaPub = b64urlToBytes(V.ua_public);
    const out = await decryptPayload(
      b64urlToBytes(V.ciphertext),
      V.ua_private, uaPub, b64urlToBytes(V.auth_secret),
    );
    check('RFC 8291 Appendix A vector decrypts to the known plaintext',
      dec.decode(out) === V.plaintext, JSON.stringify(dec.decode(out)));
  } catch (e) {
    check('RFC 8291 Appendix A vector decrypts to the known plaintext', false, String(e));
  }

  // ---- 2. round-trip with a fresh UA key pair ----
  const uaPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPubRaw = new Uint8Array(await subtle.exportKey('raw', uaPair.publicKey));
  const uaPrivJwk = await subtle.exportKey('jwk', uaPair.privateKey);
  const uaAuth = crypto.getRandomValues(new Uint8Array(16));
  const msg = enc.encode(JSON.stringify({ title: 'Nouveau message', body: 'Bonjour 👋 dispo ?', url: '/marketplace.html?conv=12:abc' }));

  const body = await encryptPayload(msg, uaPubRaw, uaAuth);
  check('encrypted body header: salt(16)+rs(4)+idlen(1)+keyid', body.length > 21 && body[20] === 65);
  check('rs field == 4096', new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0) === 4096);

  const back = await decryptPayload(body, uaPrivJwk.d, uaPubRaw, uaAuth);
  check('round-trip: decrypt(encrypt(msg)) === msg', dec.decode(back) === dec.decode(msg), dec.decode(back).slice(0, 60));

  // wrong auth secret must fail to decrypt (integrity)
  let tampered = false;
  try { await decryptPayload(body, uaPrivJwk.d, uaPubRaw, crypto.getRandomValues(new Uint8Array(16))); }
  catch { tampered = true; }
  check('decrypt with wrong auth secret is rejected', tampered);

  const passed = results.filter(Boolean).length;
  console.log('\n' + passed + '/' + results.length + ' checks passed.');
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
