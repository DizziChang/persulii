/* 身分驗證
   會員：前端 LIFF 取得 ID Token，放在 Authorization: Bearer，後端向 LINE 驗證。
   管理員：兩道門
     1. Cloudflare Access（email 驗證碼）— 驗 Cf-Access-Jwt-Assertion
     2. LINE Login（伺服器端 OAuth）→ 簽章 cookie，且 line_user_id 必須在 admins 白名單
   一律不信任前端傳來的 User ID。

   需要的設定（Cloudflare 後台 → Worker → Settings → Variables and Secrets）：
     LINE_LOGIN_CHANNEL_ID      變數，LINE Login channel ID（LIFF 掛在這個 channel 底下）
     LINE_LOGIN_CHANNEL_SECRET  Secret
     LIFF_ID                    變數
     SESSION_SECRET             Secret，openssl rand -base64 32
     ACCESS_TEAM_DOMAIN         變數，例：persulii.cloudflareaccess.com
     ACCESS_AUD                 變數，Access 應用程式的 Application Audience (AUD) Tag */

import { HttpError, devAuthOn, uuid } from './util.js';

const enc = new TextEncoder();

/* ── 會員：LINE ID Token ─────────────────────────────────── */

export async function verifyIdToken(env, url, idToken) {
  if (!idToken) throw new HttpError(401, 'no_token', '請從 LINE 開啟');
  // 本機測試：dev:<userId>:<暱稱>
  if (idToken.startsWith('dev:')) {
    if (!devAuthOn(env, url)) throw new HttpError(401, 'bad_token', '登入已失效，請重新開啟');
    const [, sub, name = '測試會員'] = idToken.split(':');
    return { sub, name, picture: null };
  }
  if (!env.LINE_LOGIN_CHANNEL_ID) throw new HttpError(500, 'missing_config', '尚未設定 LINE_LOGIN_CHANNEL_ID');
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: idToken, client_id: env.LINE_LOGIN_CHANNEL_ID })
  });
  if (!res.ok) throw new HttpError(401, 'bad_token', '登入已失效，請重新開啟');
  const p = await res.json();
  if (!p.sub) throw new HttpError(401, 'bad_token', '登入已失效，請重新開啟');
  return { sub: p.sub, name: p.name || '', picture: p.picture || null };
}

export function bearer(request) {
  const h = request.headers.get('Authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

/* ── 管理員 session cookie ───────────────────────────────── */

const COOKIE = 'ps_admin';
const STATE_COOKIE = 'ps_admin_state';
const SESSION_HOURS = 12;

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function sessionKey(env) {
  if (!env.SESSION_SECRET) throw new HttpError(500, 'missing_secret', '尚未設定 SESSION_SECRET');
  return crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function signSession(env, payload) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await sessionKey(env), enc.encode(body)));
  return body + '.' + b64url(sig);
}

async function readSession(env, token) {
  const [body, sig] = (token || '').split('.');
  if (!body || !sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await sessionKey(env), b64urlToBytes(sig), enc.encode(body));
  if (!ok) return null;
  const p = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
  return p.exp > Date.now() ? p : null;
}

function getCookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function cookie(url, name, value, maxAge) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/* ── Cloudflare Access JWT ───────────────────────────────── */

let certCache = { at: 0, keys: null, domain: null };

async function accessKeys(domain) {
  if (certCache.keys && certCache.domain === domain && Date.now() - certCache.at < 3600_000) return certCache.keys;
  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new HttpError(503, 'access_certs', '無法取得 Cloudflare Access 憑證');
  const { keys } = await res.json();
  certCache = { at: Date.now(), keys, domain };
  return keys;
}

async function verifyAccess(env, request, url) {
  if (devAuthOn(env, url)) return true;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    throw new HttpError(503, 'access_not_configured', 'Cloudflare Access 尚未設定，後台暫不開放');
  }
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) throw new HttpError(403, 'access_required', '請先通過 Cloudflare Access 驗證');
  const [h, p, s] = jwt.split('.');
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));
  const jwk = (await accessKeys(env.ACCESS_TEAM_DOMAIN)).find((k) => k.kid === header.kid);
  if (!jwk) throw new HttpError(403, 'access_invalid', 'Access 驗證失敗');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), enc.encode(h + '.' + p));
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!ok || !aud.includes(env.ACCESS_AUD) || payload.exp * 1000 < Date.now()) {
    throw new HttpError(403, 'access_invalid', 'Access 驗證失敗');
  }
  return true;
}

/** 每支 /api/admin/* 都先過這裡；回傳 admins 列 */
export async function requireAdmin(env, request, url) {
  await verifyAccess(env, request, url);
  const s = await readSession(env, getCookie(request, COOKIE));
  if (!s) throw new HttpError(401, 'login_required', '請先用 LINE 登入');
  const admin = await env.DB.prepare('SELECT * FROM admins WHERE line_user_id = ? AND is_active = 1').bind(s.uid).first();
  if (!admin) throw new HttpError(403, 'not_admin', '無權限');
  return admin;
}

/* ── 管理員 LINE Login（伺服器端 OAuth）──────────────────── */

function safeNext(next) {
  return typeof next === 'string' && /^\/admin\/(members|orders)(\/|$)/.test(next) ? next : '/admin/members/';
}

export async function adminLogin(env, request, url) {
  await verifyAccess(env, request, url);
  const next = safeNext(url.searchParams.get('next'));

  if (devAuthOn(env, url)) {
    // 本機：直接以測試管理員登入，白名單沒有就補一筆
    const uid = 'U_dev_admin';
    await env.DB.prepare('INSERT OR IGNORE INTO admins (id, name, line_user_id, is_active) VALUES (?, ?, ?, 1)')
      .bind(uuid(), '測試管理員', uid).run();
    const token = await signSession(env, { uid, exp: Date.now() + SESSION_HOURS * 3600_000 });
    return new Response(null, { status: 302, headers: { Location: next, 'Set-Cookie': cookie(url, COOKIE, token, SESSION_HOURS * 3600) } });
  }

  if (!env.LINE_LOGIN_CHANNEL_ID) throw new HttpError(500, 'missing_config', '尚未設定 LINE_LOGIN_CHANNEL_ID');
  const state = uuid();
  const auth = new URL('https://access.line.me/oauth2/v2.1/authorize');
  auth.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.LINE_LOGIN_CHANNEL_ID,
    redirect_uri: url.origin + '/api/admin/auth/callback',
    state,
    scope: 'openid profile'
  });
  return new Response(null, {
    status: 302,
    headers: { Location: auth.toString(), 'Set-Cookie': cookie(url, STATE_COOKIE, state + '|' + next, 600) }
  });
}

export async function adminCallback(env, request, url) {
  await verifyAccess(env, request, url);
  const [state, next] = (getCookie(request, STATE_COOKIE) || '').split('|');
  if (!state || state !== url.searchParams.get('state')) throw new HttpError(400, 'bad_state', '登入逾時，請重新登入');
  const code = url.searchParams.get('code');
  if (!code) throw new HttpError(400, 'no_code', '登入已取消');

  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: url.origin + '/api/admin/auth/callback',
      client_id: env.LINE_LOGIN_CHANNEL_ID,
      client_secret: env.LINE_LOGIN_CHANNEL_SECRET
    })
  });
  if (!tokenRes.ok) throw new HttpError(401, 'line_token', 'LINE 登入失敗');
  const { id_token } = await tokenRes.json();
  const who = await verifyIdToken(env, url, id_token);

  const clearState = cookie(url, STATE_COOKIE, '', 0);
  const admin = await env.DB.prepare('SELECT id FROM admins WHERE line_user_id = ? AND is_active = 1').bind(who.sub).first();
  if (!admin) {
    // 不在白名單：顯示自己的 LINE User ID，方便老闆把人加進 admins
    const h = new Headers({ Location: '/admin/members/?denied=' + encodeURIComponent(who.sub) });
    h.append('Set-Cookie', clearState);
    return new Response(null, { status: 302, headers: h });
  }
  const token = await signSession(env, { uid: who.sub, exp: Date.now() + SESSION_HOURS * 3600_000 });
  const h = new Headers({ Location: safeNext(next) });
  h.append('Set-Cookie', cookie(url, COOKIE, token, SESSION_HOURS * 3600));
  h.append('Set-Cookie', clearState);
  return new Response(null, { status: 302, headers: h });
}

export function adminLogout(url) {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json', 'Set-Cookie': cookie(url, COOKIE, '', 0) }
  });
}
