/* 會員等級與訂單金額的規則（純函式，不碰資料庫，方便單獨測試）

   規格重點：
   - 升級看「單筆訂單」適用門檻商品的組數合計（V+S／V+V／S+S 混買合併計算）：
     單筆滿 5 組升 VIP、滿 20 組升 VVIP。本單達標 → 立即升級，本單就用新折扣。
   - 每個 VIP／VVIP 等級有一段「效期」（期間），從 tier_period_start 到 tier_expires_at（台灣日期，含當天）。
     升級時期間 = 建單日 ～ 建單日 + 1 年。
   - 續等：期間內「累積」購買組數（含升級那一筆，作廢的不算）
       VIP  滿 renew_qty（8 組）  → 到期後自動延續 VIP 一年
       VVIP 滿 renew_qty（35 組） → 到期後自動延續 VVIP 一年；
            沒滿 35 但滿 8 組 → 到期後降為 VIP 一年；不滿 8 組 → 回銀卡會員（general）
     延續的新期間接在原到期日後面：原到期日隔天 ～ 原到期日 + 1 年。
     每個期間各自計算組數，不跨期累積。
   - 到期時的續等／降級在讀取時判斷（resolveTier），不需排程；判斷時才去算該期間的組數，
     所以期間內作廢的訂單一律不計入，不必另外回溯。
   - VIP 效期內單筆達 20 組 → 升 VVIP，期間從該筆建單日重新起算。
   - 效期內單筆再達同等級門檻、或高等級買到低門檻 → 不升級，組數計入本期累積。
   - 升級訂單在建單日起 21 天內作廢 → 回復升級前狀態；超過只作廢訂單。
     （網頁上的會員辦法寫 14 天，業主決定程式維持 21 天，對客人較寬鬆。） */

import { addDays, addOneYear, daysBetween, twDate } from './util.js';

export const CANCEL_REVERT_DAYS = 21;

/** 依到期日判斷目前實際有效的等級代碼（不含續等判斷；完整判斷請用 resolveTier） */
export function effectiveTierCode(member, today) {
  if (member.tier_code !== 'general' && member.tier_expires_at && member.tier_expires_at < today) {
    return 'general';
  }
  return member.tier_code || 'general';
}

/** 這個組數可達到的最高等級 */
export function tierForQty(tiers, qty) {
  return [...tiers].sort((a, b) => b.rank - a.rank).find((t) => qty >= t.min_qty) || tiers.find((t) => t.code === 'general');
}

/** 一個期間累積 qty 組，到期後該是哪個等級：
    不高於目前等級、且 qty 達到該等級 renew_qty 的最高等級；都沒有則回 general */
export function tierAfterPeriod(tiers, code, qty) {
  const byCode = Object.fromEntries(tiers.map((t) => [t.code, t]));
  const cur = byCode[code];
  const keep = [...tiers]
    .filter((t) => t.rank <= cur.rank && t.renew_qty != null && qty >= t.renew_qty)
    .sort((a, b) => b.rank - a.rank)[0];
  return keep ? keep.code : 'general';
}

/**
 * 把會員的等級狀態推進到 today：已到期的期間依累積組數決定續等、降級或回 general，
 * 可能連續跨過好幾個期間（例如很久沒來）。
 * @param state      { tier_code, tier_expires_at, tier_period_start, tier_order_id }
 * @param periodQty  async (start, end) => 該期間（含首尾）未作廢訂單的門檻組數合計
 * @returns { state, changed }
 */
export async function resolveTier(state, tiers, today, periodQty) {
  let s = { ...state };
  let changed = false;
  for (let guard = 0; guard < 100; guard++) {
    if (s.tier_code === 'general' || !s.tier_expires_at || s.tier_expires_at >= today) break;
    const start = s.tier_period_start || periodStartOf(s.tier_expires_at);
    const qty = await periodQty(start, s.tier_expires_at);
    const next = tierAfterPeriod(tiers, s.tier_code, qty);
    changed = true;
    if (next === 'general') {
      s = { tier_code: 'general', tier_expires_at: null, tier_period_start: null, tier_order_id: null };
    } else {
      s = {
        tier_code: next,
        tier_period_start: addDays(s.tier_expires_at, 1),
        tier_expires_at: addOneYear(s.tier_expires_at),
        tier_order_id: null
      };
    }
  }
  if (s.tier_code === 'general' && (s.tier_expires_at || s.tier_period_start)) {
    s = { ...s, tier_expires_at: null, tier_period_start: null };
    changed = true;
  }
  return { state: s, changed };
}

/** 舊資料沒有 tier_period_start 時，由到期日回推期間起點（到期日往前一年） */
export function periodStartOf(expiresAt) {
  const [y, m, d] = expiresAt.split('-').map(Number);
  const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/**
 * 本期續等進度（給會員中心、後台顯示）
 * @param state  已 resolveTier 過的狀態
 * @param qty    本期累積組數
 */
export function renewalStatus(state, tiers, qty) {
  if (!state || state.tier_code === 'general') return null;
  const byCode = Object.fromEntries(tiers.map((t) => [t.code, t]));
  const t = byCode[state.tier_code];
  if (t.renew_qty == null) return null;
  const next = tierAfterPeriod(tiers, state.tier_code, qty);
  return {
    tier: t.code,
    periodStart: state.tier_period_start || periodStartOf(state.tier_expires_at),
    periodEnd: state.tier_expires_at,
    qty,
    renewQty: t.renew_qty,
    missing: Math.max(0, t.renew_qty - qty),
    reached: qty >= t.renew_qty,
    /** 依目前組數，到期後會是哪個等級、效期到哪天 */
    nextTier: next,
    nextTierName: next === 'general' ? byCode.general.name : byCode[next].name,
    nextExpiresAt: next === 'general' ? null : addOneYear(state.tier_expires_at)
  };
}

/** 折扣率轉成整數百分比再算，避免 13600 × 0.7 = 9519.999… 這類浮點誤差 */
export function discountedPrice(listPrice, rate) {
  return Math.round((listPrice * Math.round(rate * 100)) / 100);
}

export function rateLabel(rate) {
  const pct = Math.round(rate * 100);
  if (pct >= 100) return '原價';
  return (pct % 10 === 0 ? pct / 10 : pct) + ' 折';
}

/**
 * 試算一筆訂單。
 * @param member    members 列（須先 resolveTier 推進到 today）
 * @param tiers     tiers 全表
 * @param products  Map<id, product>
 * @param items     [{product_id, quantity}]
 * @param today     台灣日期 YYYY-MM-DD
 * @param periodQty 本單之前，會員目前期間已累積的門檻組數（一般會員傳 0）
 */
export function planOrder({ member, tiers, products, items, today, periodQty = 0 }) {
  const byCode = Object.fromEntries(tiers.map((t) => [t.code, t]));
  const merged = new Map();
  for (const it of items || []) {
    const qty = Number(it.quantity);
    if (!Number.isInteger(qty) || qty < 0 || qty > 999) throw new Error('組數必須是 0–999 的整數');
    if (qty === 0) continue;
    const p = products.get(it.product_id);
    if (!p || !p.is_active) throw new Error('品項不存在或已下架');
    merged.set(p.id, (merged.get(p.id) || 0) + qty);
  }
  if (merged.size === 0) throw new Error('請至少選一個品項');

  let qualifyingQty = 0;
  for (const [id, qty] of merged) if (products.get(id).member_discount) qualifyingQty += qty;

  const currentCode = effectiveTierCode(member, today);
  const current = byCode[currentCode];
  const reached = tierForQty(tiers, qualifyingQty);
  const upgrade = reached.rank > current.rank;
  const applied = upgrade ? reached : current;

  const lines = [];
  let total = 0;
  for (const [id, quantity] of merged) {
    const p = products.get(id);
    const rate = p.member_discount ? applied.discount_rate : 1;
    const unit = discountedPrice(p.list_price, rate);
    lines.push({
      product_id: id, product_name: p.name, quantity,
      list_price: p.list_price, discount_rate: rate, unit_price: unit, subtotal: unit * quantity
    });
    total += unit * quantity;
  }

  // 距離下一級還差幾組（給建單畫面提示用）
  const next = [...tiers].sort((a, b) => a.rank - b.rank).find((t) => t.rank > applied.rank);

  // 建單後的期間狀態與續等進度：升級則開新期間（本單組數算進新期間），否則累加到目前期間
  const newExpiresAt = upgrade ? addOneYear(today) : null;
  const after = upgrade
    ? { tier_code: applied.code, tier_period_start: today, tier_expires_at: newExpiresAt }
    : (currentCode === 'general' ? null : {
        tier_code: currentCode,
        tier_period_start: member.tier_period_start || periodStartOf(member.tier_expires_at),
        tier_expires_at: member.tier_expires_at
      });
  const before = upgrade ? 0 : periodQty;
  const renewal = after ? renewalStatus(after, tiers, before + qualifyingQty) : null;
  if (renewal) {
    renewal.before = before;
    renewal.newlyReached = before < renewal.renewQty && renewal.reached;
  }

  return {
    lines,
    total,
    qualifyingQty,
    currentTier: currentCode,
    appliedTier: applied.code,
    upgrade,
    newExpiresAt,
    newPeriodStart: upgrade ? today : null,
    renewal,
    nextTier: next ? { code: next.code, name: next.name, missing: Math.max(0, next.min_qty - qualifyingQty) } : null
  };
}

/** 作廢這筆訂單時，是否要把會員等級回復到升級前 */
export function shouldRevertOnVoid(order, member, today) {
  return Boolean(order.upgraded)
    && member.tier_order_id === order.id
    && daysBetween(twDate(order.created_at), today) <= CANCEL_REVERT_DAYS;
}
