/* 會員端 API：註冊、會員資料、購買紀錄 */

import { bearer, verifyIdToken } from './auth.js';
import { decrypt, encrypt, phoneHash } from './pii.js';
import { rateLabel } from './tiers.js';
import { currentTierState } from './tier-state.js';
import { HttpError, json, maskPhone, normalizePhone, nowIso, readJson, twDate, uuid } from './util.js';

async function whoami(env, request, url) {
  return verifyIdToken(env, url, bearer(request));
}

function activeMemberByLine(env, sub) {
  return env.DB.prepare("SELECT * FROM members WHERE line_user_id = ? AND status = 'active'").bind(sub).first();
}

export async function register(env, request, url) {
  const who = await whoami(env, request, url);
  const body = await readJson(request);

  const name = String(body.name || '').trim();
  if (name.length < 1 || name.length > 30) throw new HttpError(400, 'bad_name', '請填寫真實姓名');
  const phone = normalizePhone(body.phone);
  if (!phone) throw new HttpError(400, 'bad_phone', '電話格式不正確，例：0912345678');
  if (body.consent !== true) throw new HttpError(400, 'no_consent', '請勾選同意個資蒐集與會員條款');

  if (await activeMemberByLine(env, who.sub)) throw new HttpError(409, 'already_registered', '此 LINE 帳號已註冊');

  const hash = await phoneHash(env, phone);
  const dup = await env.DB.prepare("SELECT 1 FROM members WHERE phone_hash = ? AND status = 'active' LIMIT 1").bind(hash).first();
  const now = nowIso();

  await env.DB.prepare(`INSERT INTO members
      (id, line_user_id, line_display_name, name_enc, phone_enc, phone_hash, tier_code, status, needs_review, consent_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'general', 'active', ?, ?, ?)`)
    .bind(uuid(), who.sub, who.name, await encrypt(env, name), await encrypt(env, phone), hash, dup ? 1 : 0, now, now)
    .run();

  return json({ ok: true, duplicatePhone: Boolean(dup) }, 201);
}

export async function me(env, request, url) {
  const who = await whoami(env, request, url);
  const m = await activeMemberByLine(env, who.sub);
  if (!m) throw new HttpError(404, 'not_registered', '尚未註冊');

  if (who.name && who.name !== m.line_display_name) {
    await env.DB.prepare('UPDATE members SET line_display_name = ? WHERE id = ?').bind(who.name, m.id).run();
  }

  const { results: tiers } = await env.DB.prepare('SELECT * FROM tiers ORDER BY rank').all();
  const st = await currentTierState(env, m, tiers, twDate(), true);
  const code = st.code;
  const tier = tiers.find((t) => t.code === code);
  const phone = await decrypt(env, m.phone_enc);

  return json({
    displayName: who.name || m.line_display_name,
    picture: who.picture,
    name: await decrypt(env, m.name_enc),
    phoneMasked: maskPhone(phone),
    needsReview: Boolean(m.needs_review),
    tier: {
      code,
      name: tier.name,
      discount: rateLabel(tier.discount_rate),
      expiresAt: code === 'general' ? null : st.member.tier_expires_at,
      // 本期續等進度：{ qty, renewQty, missing, reached, nextTier, nextTierName, nextExpiresAt, periodStart, periodEnd }
      renewal: st.renewal
    },
    memberSince: twDate(m.created_at)
  });
}

export async function orders(env, request, url) {
  const who = await whoami(env, request, url);
  const m = await activeMemberByLine(env, who.sub);
  if (!m) throw new HttpError(404, 'not_registered', '尚未註冊');

  const { results: os } = await env.DB.prepare(
    "SELECT id, order_no, tier_at_order, total_amount, status, shipped_at, created_at FROM orders WHERE member_id = ? AND status != 'voided' ORDER BY created_at DESC LIMIT 100"
  ).bind(m.id).all();
  if (!os.length) return json({ orders: [] });

  const { results: items } = await env.DB.prepare(
    `SELECT order_id, product_name, quantity, unit_price, subtotal FROM order_items
     WHERE order_id IN (${os.map(() => '?').join(',')})`
  ).bind(...os.map((o) => o.id)).all();

  return json({
    orders: os.map((o) => ({
      orderNo: o.order_no,
      date: twDate(o.created_at),
      total: o.total_amount,
      status: o.status,
      shippedAt: o.shipped_at ? twDate(o.shipped_at) : null,
      items: items.filter((i) => i.order_id === o.id).map(({ order_id, ...rest }) => rest)
    }))
  });
}
