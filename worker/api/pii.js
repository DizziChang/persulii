/* 個資加密（AES-GCM）與電話雜湊（HMAC-SHA256）
   金鑰只放 Cloudflare Secrets：
     PII_KEY         32 bytes，base64      openssl rand -base64 32
     PHONE_HASH_KEY  任意長度隨機字串       openssl rand -base64 32
   密文格式：v1:<base64(12 bytes IV + ciphertext)>
   換金鑰時新增 v2 前綴即可並存，不必一次重寫全表。 */

import { HttpError } from './util.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const cache = new Map();

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function aesKey(env) {
  if (!env.PII_KEY) throw new HttpError(500, 'missing_secret', '尚未設定 PII_KEY');
  const k = 'aes:' + env.PII_KEY;
  if (!cache.has(k)) {
    const raw = b64ToBytes(env.PII_KEY);
    if (raw.length !== 32) throw new HttpError(500, 'bad_secret', 'PII_KEY 必須是 32 bytes 的 base64');
    cache.set(k, crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
  }
  return cache.get(k);
}

async function hmacKey(env) {
  if (!env.PHONE_HASH_KEY) throw new HttpError(500, 'missing_secret', '尚未設定 PHONE_HASH_KEY');
  const k = 'hmac:' + env.PHONE_HASH_KEY;
  if (!cache.has(k)) {
    cache.set(k, crypto.subtle.importKey('raw', enc.encode(env.PHONE_HASH_KEY),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  }
  return cache.get(k);
}

export async function encrypt(env, plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(env), enc.encode(String(plain))));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return 'v1:' + bytesToB64(out);
}

export async function decrypt(env, stored) {
  if (!stored) return null;
  if (!stored.startsWith('v1:')) throw new HttpError(500, 'bad_cipher', '無法辨識的密文版本');
  const buf = b64ToBytes(stored.slice(3));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, await aesKey(env), buf.slice(12));
  return dec.decode(pt);
}

export async function phoneHash(env, normalizedPhone) {
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(normalizedPhone)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
