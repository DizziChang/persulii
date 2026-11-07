/* 管理員 API：會員查詢／補填、建單（含升級判斷）、出貨、作廢、帳號轉移、清除個資
   金額一律從 products、tiers 帶入計算，不接受前端傳來的價格或折扣。 */

import { decrypt, encrypt, phoneHash } from './pii.js';
import { effectiveTierCode, planOrder, shouldRevertOnVoid } from './tiers.js';
import { HttpError, json, normalizePhone, nowIso, readJson, twDate, uuid } from './util.js';

/* ── 共用 ─────────────────────────────────────────────── */

async function loadTiers(env) {
  return (await env.DB.prepare('SELECT * FROM tiers ORDER BY rank').all()).results;
}

async function loadProducts(env) {
  const { results } = await env.DB.prepare('SELECT * FROM products ORDER BY sort').all();
  return new Map(results.map((p) => [p.id, p]));
}

async function getMember(env, id) {
  const m = await env.DB.prepare('SELECT * FROM members WHERE id = ?').bind(id).first();
  if (!m) throw new HttpError(404, 'member_not_found', '找不到會員');
  return m;
}

async function memberView(env, m, tiersByCode, today, full = false) {
  const code = effectiveTierCode(m, today);
  const v = {
    id: m.id,
    status: m.status,
    name: await decrypt(env, m.name_enc),
    phone: await decrypt(env, m.phone_enc),
    lineDisplayName: m.line_display_name,
    tierCode: code,
    tierName: tiersByCode[code].name,
    tierExpiresAt: code === 'general' ? null : m.tier_expires_at,
    needsReview: Boolean(m.needs_review),
    createdAt: m.created_at
  };
  if (full) {
    v.address = await decrypt(env, m.address_enc);
    v.email = await decrypt(env, m.email_enc);
    v.mergedIntoId = m.merged_into_id;
    v.erasedAt = m.erased_at;
    v.tierOrderId = m.tier_order_id;
  }
  return v;
}

const byCode = (tiers) => Object.fromEntries(tiers.map((t) => [t.code, t]));

/* ── 會員 ─────────────────────────────────────────────── */

export async function me(env, admin) {
  return json({ id: admin.id, name: admin.name });
}

export async function searchMembers(env, url) {
  const q = (url.searchParams.get('q') || '').trim();
  const reviewOnly = url.searchParams.get('review') === '1';
  const tiers = byCode(await loadTiers(env));
  const today = twDate();

  let rows;
  const phone = normalizePhone(q);
  if (phone) {
    // 完整電話：用雜湊直接比對，不必解密整張表
    rows = (await env.DB.prepare("SELECT * FROM members WHERE phone_hash = ? AND status = 'active'").bind(await phoneHash(env, phone)).all()).results;
  } else {
    rows = (await env.DB.prepare(
      `SELECT * FROM members WHERE status = 'active' ${reviewOnly ? 'AND needs_review = 1' : ''}
       ORDER BY needs_review DESC, created_at DESC LIMIT 2000`
    ).all()).results;
  }

  const out = [];
  for (const m of rows) {
    const v = await memberView(env, m, tiers, today);
    if (!phone && q) {
      // 姓名、LINE 暱稱或部分電話（姓名已加密，只能解密後比對；會員量小時沒問題）
      const hay = [v.name, v.lineDisplayName, v.phone].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q.toLowerCase())) continue;
    }
    out.push(v);
    if (out.length >= 100) break;
  }
  return json({ members: out });
}

export async function memberDetail(env, id) {
  const tiers = byCode(await loadTiers(env));
  const m = await getMember(env, id);
  const member = await memberView(env, m, tiers, twDate(), true);

  const { results: os } = await env.DB.prepare('SELECT * FROM orders WHERE member_id = ? ORDER BY created_at DESC').bind(id).all();
  const orders = await ordersWithItems(env, os);

  // 同電話的其他帳號（轉移時用）
  let samePhone = [];
  if (m.phone_hash) {
    const { results } = await env.DB.prepare("SELECT * FROM members WHERE phone_hash = ? AND id != ? AND status = 'active'").bind(m.phone_hash, id).all();
    samePhone = await Promise.all(results.map((r) => memberView(env, r, tiers, twDate())));
  }
  return json({ member, orders, samePhone });
}

export async function updateMember(env, request, id) {
  const body = await readJson(request);
  const m = await getMember(env, id);
  if (m.status !== 'active') throw new HttpError(409, 'not_active', '此帳號已轉移或清除，無法修改');

  const sets = [];
  const vals = [];
  if ('address' in body) {
    const a = String(body.address || '').trim();
    if (a.length > 200) throw new HttpError(400, 'bad_address', '地址過長');
    sets.push('address_enc = ?'); vals.push(await encrypt(env, a));
  }
  if ('email' in body) {
    const e = String(body.email || '').trim();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'bad_email', 'email 格式不正確');
    sets.push('email_enc = ?'); vals.push(await encrypt(env, e));
  }
  if ('needsReview' in body) {
    sets.push('needs_review = ?'); vals.push(body.needsReview ? 1 : 0);
  }
  if (!sets.length) throw new HttpError(400, 'nothing_to_update', '沒有要更新的欄位');
  await env.DB.prepare(`UPDATE members SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, id).run();
  return json({ ok: true });
}

const ERASE_FIELDS = `name_enc = NULL, phone_enc = NULL, phone_hash = NULL, address_enc = NULL, email_enc = NULL,
  line_display_name = NULL, line_user_id = NULL, needs_review = 0`;

/** 舊帳號（:id）的訂單、等級、到期日搬到新帳號（target_id），舊帳號改 merged 並清除個資 */
export async function mergeMember(env, request, id) {
  const { target_id } = await readJson(request);
  if (!target_id || target_id === id) throw new HttpError(400, 'bad_target', '請選擇要轉移到的新帳號');
  const from = await getMember(env, id);
  const to = await getMember(env, target_id);
  if (from.status !== 'active' || to.status !== 'active') throw new HttpError(409, 'not_active', '兩個帳號都必須是正常狀態');

  const tiers = byCode(await loadTiers(env));
  const today = twDate();
  const fromCode = effectiveTierCode(from, today);
  const toCode = effectiveTierCode(to, today);

  const stmts = [env.DB.prepare('UPDATE orders SET member_id = ? WHERE member_id = ?').bind(to.id, from.id)];

  const toSets = ['needs_review = 0'];
  const toVals = [];
  if (tiers[fromCode].rank > tiers[toCode].rank) {
    // 等級與到期日維持舊帳號原本的日期
    toSets.push('tier_code = ?', 'tier_expires_at = ?', 'tier_order_id = ?');
    toVals.push(from.tier_code, from.tier_expires_at, from.tier_order_id);
  }
  if (!to.address_enc && from.address_enc) { toSets.push('address_enc = ?'); toVals.push(from.address_enc); }
  if (!to.email_enc && from.email_enc) { toSets.push('email_enc = ?'); toVals.push(from.email_enc); }
  stmts.push(env.DB.prepare(`UPDATE members SET ${toSets.join(', ')} WHERE id = ?`).bind(...toVals, to.id));

  stmts.push(env.DB.prepare(`UPDATE members SET status = 'merged', merged_into_id = ?, erased_at = ?, ${ERASE_FIELDS} WHERE id = ?`)
    .bind(to.id, nowIso(), from.id));

  await env.DB.batch(stmts);
  return json({ ok: true, movedTier: tiers[fromCode].rank > tiers[toCode].rank });
}

/** 停用並清除個資；訂單保留編號、日期、品項、組數、金額，收件地址一併清除 */
export async function eraseMember(env, request, id) {
  const { confirm } = await readJson(request);
  if (confirm !== true) throw new HttpError(400, 'confirm_required', '需要二次確認');
  const m = await getMember(env, id);
  if (m.status === 'erased') throw new HttpError(409, 'already_erased', '已清除');

  await env.DB.batch([
    env.DB.prepare(`UPDATE members SET status = 'erased', erased_at = ?, ${ERASE_FIELDS} WHERE id = ?`).bind(nowIso(), id),
    env.DB.prepare('UPDATE orders SET ship_address_enc = NULL WHERE member_id = ?').bind(id)
  ]);
  return json({ ok: true });
}

/* ── 品項與訂單 ───────────────────────────────────────── */

export async function listProducts(env) {
  const [products, tiers] = await Promise.all([loadProducts(env), loadTiers(env)]);
  return json({ products: [...products.values()].filter((p) => p.is_active), tiers });
}

async function plan(env, body) {
  const member = await getMember(env, body.member_id);
  if (member.status !== 'active') throw new HttpError(409, 'not_active', '此帳號已轉移或清除，無法建單');
  const [tiers, products] = await Promise.all([loadTiers(env), loadProducts(env)]);
  try {
    return { member, tiers, result: planOrder({ member, tiers, products, items: body.items, today: twDate() }) };
  } catch (e) {
    throw new HttpError(400, 'bad_items', e.message);
  }
}

export async function previewOrder(env, request) {
  const { result } = await plan(env, await readJson(request));
  return json(result);
}

async function nextOrderNo(env, today) {
  const prefix = 'PS' + today.replace(/-/g, '');
  const row = await env.DB.prepare('SELECT order_no FROM orders WHERE order_no LIKE ? ORDER BY order_no DESC LIMIT 1').bind(prefix + '%').first();
  const seq = row ? Number(row.order_no.slice(prefix.length)) + 1 : 1;
  return prefix + String(seq).padStart(3, '0');
}

export async function createOrder(env, request, admin) {
  const body = await readJson(request);
  const { member, result } = await plan(env, body);
  const note = String(body.note || '').trim().slice(0, 500) || null;
  const shipAddress = String(body.ship_address || '').trim().slice(0, 200);
  if (!shipAddress) throw new HttpError(400, 'no_address', '請填寫收件地址');

  const now = nowIso();
  const today = twDate(now);
  const orderId = uuid();
  const shipEnc = await encrypt(env, shipAddress);

  for (let attempt = 0; attempt < 3; attempt++) {
    const orderNo = await nextOrderNo(env, today);
    const stmts = [
      env.DB.prepare(`INSERT INTO orders
          (id, order_no, member_id, admin_id, tier_at_order, qualifying_qty, total_amount, ship_address_enc,
           upgraded, prev_tier_code, prev_tier_expires_at, prev_tier_order_id, status, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`)
        .bind(orderId, orderNo, member.id, admin.id, result.appliedTier, result.qualifyingQty, result.total, shipEnc,
          result.upgrade ? 1 : 0,
          result.upgrade ? member.tier_code : null,
          result.upgrade ? member.tier_expires_at : null,
          result.upgrade ? member.tier_order_id : null,
          note, now),
      ...result.lines.map((l) => env.DB.prepare(`INSERT INTO order_items
          (id, order_id, product_id, product_name, quantity, list_price, discount_rate, unit_price, subtotal)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(uuid(), orderId, l.product_id, l.product_name, l.quantity, l.list_price, l.discount_rate, l.unit_price, l.subtotal))
    ];
    if (result.upgrade) {
      stmts.push(env.DB.prepare('UPDATE members SET tier_code = ?, tier_expires_at = ?, tier_order_id = ? WHERE id = ?')
        .bind(result.appliedTier, result.newExpiresAt, orderId, member.id));
    }
    // 會員若還沒有地址，順手存成預設地址
    if (!member.address_enc) {
      stmts.push(env.DB.prepare('UPDATE members SET address_enc = ? WHERE id = ?').bind(shipEnc, member.id));
    }
    try {
      await env.DB.batch(stmts);
      return json({ ok: true, id: orderId, orderNo, ...result }, 201);
    } catch (e) {
      // 同一秒兩位管理員建單撞號：重取流水號再試
      if (!/UNIQUE/i.test(String(e.message)) || attempt === 2) throw e;
    }
  }
}

async function ordersWithItems(env, os) {
  if (!os.length) return [];
  const { results: items } = await env.DB.prepare(
    `SELECT * FROM order_items WHERE order_id IN (${os.map(() => '?').join(',')})`
  ).bind(...os.map((o) => o.id)).all();
  return Promise.all(os.map(async (o) => ({
    id: o.id,
    orderNo: o.order_no,
    memberId: o.member_id,
    tierAtOrder: o.tier_at_order,
    qualifyingQty: o.qualifying_qty,
    total: o.total_amount,
    shipAddress: await decrypt(env, o.ship_address_enc),
    upgraded: Boolean(o.upgraded),
    status: o.status,
    shippedAt: o.shipped_at,
    voidedAt: o.voided_at,
    note: o.note,
    createdAt: o.created_at,
    date: twDate(o.created_at),
    items: items.filter((i) => i.order_id === o.id)
  })));
}

export async function listOrders(env, url) {
  const status = url.searchParams.get('status');
  const where = ['pending', 'shipped', 'voided'].includes(status) ? 'WHERE o.status = ?' : '';
  const stmt = env.DB.prepare(
    `SELECT o.*, m.name_enc AS member_name_enc, m.status AS member_status FROM orders o
     JOIN members m ON m.id = o.member_id ${where} ORDER BY o.created_at DESC LIMIT 300`
  );
  const { results } = await (where ? stmt.bind(status) : stmt).all();
  const orders = await ordersWithItems(env, results);
  for (let i = 0; i < orders.length; i++) {
    orders[i].memberName = (await decrypt(env, results[i].member_name_enc)) || '（已清除）';
  }
  return json({ orders });
}

export async function updateOrder(env, request, id) {
  const { action } = await readJson(request);
  const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
  if (!o) throw new HttpError(404, 'order_not_found', '找不到訂單');
  if (o.status === 'voided') throw new HttpError(409, 'voided', '已作廢的訂單不能再修改');
  const now = nowIso();

  if (action === 'ship') {
    if (o.status === 'shipped') throw new HttpError(409, 'already_shipped', '已出貨');
    await env.DB.prepare("UPDATE orders SET status = 'shipped', shipped_at = ? WHERE id = ?").bind(now, id).run();
    return json({ ok: true });
  }

  if (action === 'unship') {
    await env.DB.prepare("UPDATE orders SET status = 'pending', shipped_at = NULL WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  if (action === 'void') {
    const m = await getMember(env, o.member_id);
    const revert = shouldRevertOnVoid(o, m, twDate(now));
    const stmts = [env.DB.prepare("UPDATE orders SET status = 'voided', voided_at = ? WHERE id = ?").bind(now, id)];
    if (revert) {
      stmts.push(env.DB.prepare('UPDATE members SET tier_code = ?, tier_expires_at = ?, tier_order_id = ? WHERE id = ?')
        .bind(o.prev_tier_code || 'general', o.prev_tier_expires_at, o.prev_tier_order_id, m.id));
    }
    await env.DB.batch(stmts);
    return json({ ok: true, tierReverted: revert });
  }

  throw new HttpError(400, 'bad_action', '不支援的操作');
}
