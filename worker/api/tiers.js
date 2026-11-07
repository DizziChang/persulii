/* 會員等級與訂單金額的規則（純函式，不碰資料庫，方便單獨測試）

   規格重點：
   - 等級看「單筆訂單」適用門檻商品的組數合計（VV/VS/SS 混買合併計算），不是累積消費。
   - 本單達標 → 立即升級，本單就用新折扣；VIP/VVIP 到期日 = 建單日（台灣）+ 1 年。
   - 效期內再達同等級門檻、或高等級買到低門檻 → 等級與到期日都不變。
   - VIP 效期內單筆達 20 組 → 升 VVIP，到期日從該筆建單日重新起算。
   - 到期後自動回一般會員（讀取時判斷，不需排程）。
   - 升級訂單在建單日起 21 天內作廢 → 回復升級前狀態；超過只作廢訂單。 */

import { addOneYear, daysBetween, twDate } from './util.js';

export const CANCEL_REVERT_DAYS = 21;

/** 依到期日判斷目前實際有效的等級代碼 */
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
 * @param member   members 列（含 tier_code / tier_expires_at）
 * @param tiers    tiers 全表
 * @param products Map<id, product>
 * @param items    [{product_id, quantity}]
 * @param today    台灣日期 YYYY-MM-DD
 */
export function planOrder({ member, tiers, products, items, today }) {
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

  return {
    lines,
    total,
    qualifyingQty,
    currentTier: currentCode,
    appliedTier: applied.code,
    upgrade,
    newExpiresAt: upgrade ? addOneYear(today) : null,
    nextTier: next ? { code: next.code, name: next.name, missing: Math.max(0, next.min_qty - qualifyingQty) } : null
  };
}

/** 作廢這筆訂單時，是否要把會員等級回復到升級前 */
export function shouldRevertOnVoid(order, member, today) {
  return Boolean(order.upgraded)
    && member.tier_order_id === order.id
    && daysBetween(twDate(order.created_at), today) <= CANCEL_REVERT_DAYS;
}
