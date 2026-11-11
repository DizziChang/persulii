/* 讀取會員「目前」的等級狀態（會碰資料庫的部分；規則本身在 tiers.js）

   每次要用到等級之前先呼叫 currentTierState：
   1. 已到期的效期依累積組數推進（續等／降級／回銀卡），有變動就寫回 members
   2. 需要時一併算出本期累積組數與續等進度 */

import { periodStartOf, renewalStatus, resolveTier } from './tiers.js';

/** 回傳 (start, end) => 該會員在台灣日期 start～end（含）之間、未作廢訂單的門檻組數合計 */
export function periodQtyFor(env, memberId) {
  return async (start, end) => {
    const row = await env.DB.prepare(
      `SELECT COALESCE(SUM(qualifying_qty), 0) AS q FROM orders
       WHERE member_id = ? AND status != 'voided' AND date(created_at, '+8 hours') BETWEEN ? AND ?`
    ).bind(memberId, start, end).first();
    return Number(row?.q || 0);
  };
}

/**
 * @param m            members 列
 * @param tiers        tiers 全表（陣列）
 * @param today        台灣日期
 * @param withProgress true 時一併計算本期累積組數與續等進度（列表頁可省略以減少查詢）
 * @returns { member, code, periodQty, renewal }
 */
export async function currentTierState(env, m, tiers, today, withProgress = true) {
  const qtyOf = periodQtyFor(env, m.id);
  const { state, changed } = await resolveTier({
    tier_code: m.tier_code || 'general',
    tier_expires_at: m.tier_expires_at,
    tier_period_start: m.tier_period_start,
    tier_order_id: m.tier_order_id
  }, tiers, today, qtyOf);

  if (changed && m.status === 'active') {
    await env.DB.prepare(
      'UPDATE members SET tier_code = ?, tier_expires_at = ?, tier_period_start = ?, tier_order_id = ? WHERE id = ?'
    ).bind(state.tier_code, state.tier_expires_at, state.tier_period_start, state.tier_order_id, m.id).run();
  }

  const member = { ...m, ...state };
  let periodQty = 0;
  let renewal = null;
  if (withProgress && state.tier_code !== 'general') {
    periodQty = await qtyOf(state.tier_period_start || periodStartOf(state.tier_expires_at), state.tier_expires_at);
    renewal = renewalStatus(state, tiers, periodQty);
  }
  return { member, code: state.tier_code, periodQty, renewal };
}
