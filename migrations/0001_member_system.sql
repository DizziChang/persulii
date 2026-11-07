-- ============================================================
-- 沛素會員制 — 初始資料表（Cloudflare D1 / SQLite）
-- 規格：「沛素會員制開發規格」文件
--
-- 套用：
--   本機  npx wrangler d1 migrations apply persulii-members --local
--   正式  npx wrangler d1 migrations apply persulii-members --remote
--
-- 標示 _enc 的欄位由 Worker 以 AES-GCM 加密後才寫入（金鑰在 Cloudflare Secrets）。
-- 所有 *_at 存 UTC ISO 字串；日期判斷（到期、21 天取消期、訂單編號）一律換算台灣時間。
-- tier_expires_at 存台灣日期 YYYY-MM-DD，當天仍有效、隔天起回到一般會員。
-- ============================================================

CREATE TABLE tiers (
  code          TEXT PRIMARY KEY,           -- general / vip / vvip
  name          TEXT NOT NULL,
  rank          INTEGER NOT NULL,           -- 0 / 1 / 2，比較高低用
  min_qty       INTEGER NOT NULL,           -- 單筆門檻組數
  discount_rate REAL NOT NULL,              -- 0.8 / 0.7 / 0.55
  duration_days INTEGER                     -- NULL = 終身；VIP/VVIP 以「加 1 年」計，見 worker/api/tiers.js
);

INSERT INTO tiers (code, name, rank, min_qty, discount_rate, duration_days) VALUES
  ('general', '一般會員', 0, 0,  0.8,  NULL),
  ('vip',     'VIP',      1, 5,  0.7,  365),
  ('vvip',    'VVIP',     2, 20, 0.55, 365);

CREATE TABLE members (
  id                TEXT PRIMARY KEY,
  line_user_id      TEXT UNIQUE,            -- 清除個資後為 NULL
  line_display_name TEXT,
  name_enc          TEXT,
  phone_enc         TEXT,
  phone_hash        TEXT,                   -- HMAC，非唯一：重複電話先註冊再由管理員處理
  address_enc       TEXT,
  email_enc         TEXT,
  tier_code         TEXT NOT NULL DEFAULT 'general' REFERENCES tiers(code),
  tier_expires_at   TEXT,                   -- 台灣日期；一般會員為 NULL
  tier_order_id     TEXT,                   -- 取得目前等級的訂單
  status            TEXT NOT NULL DEFAULT 'active',   -- active / merged / erased
  merged_into_id    TEXT REFERENCES members(id),
  needs_review      INTEGER NOT NULL DEFAULT 0,       -- 1 = 電話重複待處理
  consent_at        TEXT,
  erased_at         TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_members_phone_hash ON members(phone_hash);
CREATE INDEX idx_members_status ON members(status);

CREATE TABLE admins (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  line_user_id TEXT NOT NULL UNIQUE,
  is_active    INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE products (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  list_price      INTEGER NOT NULL,
  member_discount INTEGER NOT NULL DEFAULT 1,  -- 1 適用會員折扣與升級門檻
  is_active       INTEGER NOT NULL DEFAULT 1,
  sort            INTEGER NOT NULL DEFAULT 0
);

INSERT INTO products (id, name, list_price, member_discount, is_active, sort) VALUES
  ('vv', '沛素精華液 VV 組合', 13600, 1, 1, 1),
  ('vs', '沛素精華液 VS 組合', 11600, 1, 1, 2),
  ('ss', '沛素精華液 SS 組合',  9600, 1, 1, 3);

CREATE TABLE orders (
  id                   TEXT PRIMARY KEY,
  order_no             TEXT NOT NULL UNIQUE,   -- PS + 台灣日期 + 3 碼流水號
  member_id            TEXT NOT NULL REFERENCES members(id),
  admin_id             TEXT NOT NULL REFERENCES admins(id),
  tier_at_order        TEXT NOT NULL,
  qualifying_qty       INTEGER NOT NULL,
  total_amount         INTEGER NOT NULL,
  ship_address_enc     TEXT,
  -- 本單若造成升級，記下升級前狀態；21 天內作廢時依此回復
  upgraded             INTEGER NOT NULL DEFAULT 0,
  prev_tier_code       TEXT,
  prev_tier_expires_at TEXT,
  prev_tier_order_id   TEXT,
  status               TEXT NOT NULL DEFAULT 'pending',  -- pending / shipped / voided
  shipped_at           TEXT,
  voided_at            TEXT,
  note                 TEXT,
  created_at           TEXT NOT NULL
);
CREATE INDEX idx_orders_member ON orders(member_id);
CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE order_items (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES orders(id),
  product_id    TEXT NOT NULL REFERENCES products(id),
  product_name  TEXT NOT NULL,              -- 下單當下的品名，品項改名不影響舊單
  quantity      INTEGER NOT NULL,
  list_price    INTEGER NOT NULL,
  discount_rate REAL NOT NULL,
  unit_price    INTEGER NOT NULL,
  subtotal      INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
