-- ============================================================
-- 會員續等制度（2026-11）
--
-- VIP  效期一年內累積購買滿 8 組  → 到期後自動延續 VIP 一年
-- VVIP 效期一年內累積購買滿 35 組 → 到期後自動延續 VVIP 一年；
--      未滿 35 但滿 8 組 → 降為 VIP 一年；不滿 8 組 → 回銀卡會員
-- 規則實作見 worker/api/tiers.js。
--
-- 套用（要在部署新程式「之前」執行；只新增欄位，舊程式照常運作）：
--   正式  npx wrangler d1 migrations apply persulii-members --remote
--   本機  npx wrangler d1 migrations apply persulii-members --local
-- ============================================================

-- 續等門檻：該等級在一個效期內累積達這個組數，到期後可維持該等級；NULL = 無續等（一般會員）
ALTER TABLE tiers ADD COLUMN renew_qty INTEGER;
UPDATE tiers SET renew_qty = 8  WHERE code = 'vip';
UPDATE tiers SET renew_qty = 35 WHERE code = 'vvip';

-- 對外名稱統一為「銀卡會員」（代碼仍是 general）
UPDATE tiers SET name = '銀卡會員' WHERE code = 'general';

-- 目前效期的起始日（台灣日期）。累積組數只算 tier_period_start ～ tier_expires_at 之間的訂單。
ALTER TABLE members ADD COLUMN tier_period_start TEXT;

-- 既有的 VIP／VVIP：起始日 = 取得等級那筆訂單的台灣日期；找不到訂單就用到期日往前一年
UPDATE members
SET tier_period_start = COALESCE(
  (SELECT date(o.created_at, '+8 hours') FROM orders o WHERE o.id = members.tier_order_id),
  date(tier_expires_at, '-1 year')
)
WHERE tier_code != 'general' AND tier_expires_at IS NOT NULL;

-- 升級訂單作廢時要一併回復升級前的效期起始日
ALTER TABLE orders ADD COLUMN prev_tier_period_start TEXT;

-- 計算某會員某期間累積組數用
CREATE INDEX IF NOT EXISTS idx_orders_member_created ON orders(member_id, created_at);
