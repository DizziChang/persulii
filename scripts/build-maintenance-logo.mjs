#!/usr/bin/env node
/* ============================================================
   build-maintenance-logo.mjs — 產生維護頁用的內嵌 Logo

   把 images/per-sulii-logo-grayscale.webp 轉成 base64，寫成
   worker/logo-data.js 供 worker/index.js 的維護頁使用。

   為什麼要內嵌，而不是在維護頁寫 <img src="/images/...">：
   維護頁只會出現在正式網址上，而正式網址上的 /images/* 正是被維護
   模式擋掉的路徑，外連會讀不到圖（回 503）。轉成 data URI 之後就與
   資產伺服器完全無關，一定顯示得出來。

   換 Logo 時手動執行一次，並把產生的 worker/logo-data.js 一起 commit：
     node scripts/build-maintenance-logo.mjs

   （刻意不放進 Cloudflare 的 Build command——Logo 很少換，
   而且產物進版控才看得出維護頁到底長什麼樣。）
   ============================================================ */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SRC = 'images/per-sulii-logo-grayscale.webp';
const OUT = 'worker/logo-data.js';

/* 原圖尺寸寫死在這裡，會輸出成 <img> 的 width／height 屬性，
   讓瀏覽器在圖載入前就知道比例，不會有版面跳動。換圖要一併更新。 */
const WIDTH = 632;
const HEIGHT = 420;

const b64 = readFileSync(join(ROOT, SRC)).toString('base64');

const out = [
  '/* ============================================================',
  '   worker/logo-data.js — 維護頁用的品牌 Logo（灰階）',
  '',
  '   自動產生，請勿手動編輯。來源：' + SRC,
  '   重新產生：node scripts/build-maintenance-logo.mjs',
  '   ============================================================ */',
  '',
  "export const LOGO_DATA_URI = 'data:image/webp;base64," + b64 + "';",
  'export const LOGO_W = ' + WIDTH + ';',
  'export const LOGO_H = ' + HEIGHT + ';',
  ''
].join('\n');

writeFileSync(join(ROOT, OUT), out);
console.log('  ✓ ' + OUT + '（' + (out.length / 1024).toFixed(1) + ' KB，來源 ' + SRC + '）');
