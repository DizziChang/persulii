#!/usr/bin/env node
/* ============================================================
   stamp-assets.mjs — 快取破壞（cache busting）

   把 CSS／JS 的內容雜湊寫進 HTML 引用的 ?v= 參數，例如：
     <link rel="stylesheet" href="css/main.css">
     → <link rel="stylesheet" href="css/main.css?v=3f8a1c9d20">

   檔案一改，雜湊就變、網址就變，瀏覽器必定重新下載；沒改則沿用快取。
   搭配 _headers 裡 /css/* 與 /js/* 的 immutable 長快取使用。

   在 Cloudflare Workers Builds 的 Build command 執行，且要排在
   build-pages.mjs 之後，才掃得到那裡剛產生的產品頁：
     node scripts/build-pages.mjs && node scripts/stamp-assets.mjs

   可重複執行（既有的 ?v= 會被覆寫），本機跑或建置時跑都安全。
   找不到對應檔案時會以非零狀態結束，讓建置失敗而不是部署出壞掉的引用。
   ============================================================ */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* admin 由 Sveltia CMS 自行載入外部資源，images／content 沒有 HTML，一併略過 */
const SKIP_DIRS = new Set(['node_modules', 'admin', 'images', 'content', 'scripts']);

/* 只比對本站的 css/js（外部 CDN 連結不動），第 3 組吃掉既有的 query 讓腳本可重跑。
   路徑一律是根絕對的 /css /js（products/<slug>.html 在子目錄，相對路徑會解析錯），
   ./ 與無前綴的舊寫法一併容忍。 */
const ASSET_REF = /((?:href|src)=")((?:\.?\/)?(?:css|js)\/[^"?]+\.(?:css|js))(\?[^"]*)?(")/g;

const hashes = new Map();
function hashOf(ref) {
  if (!hashes.has(ref)) {
    const abs = join(ROOT, ref);
    hashes.set(ref, existsSync(abs)
      ? createHash('sha256').update(readFileSync(abs)).digest('hex').slice(0, 10)
      : null);
  }
  return hashes.get(ref);
}

function findHTML(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) findHTML(abs, out);
    else if (name.endsWith('.html')) out.push(abs);
  }
  return out;
}

const missing = [];
let stamped = 0;
let rewritten = 0;

for (const file of findHTML(ROOT)) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(ASSET_REF, (whole, pre, ref, _query, post) => {
    const clean = ref.replace(/^\.?\//, '');
    const hash = hashOf(clean);
    if (!hash) {
      missing.push(relative(ROOT, file) + ' → ' + ref);
      return whole;
    }
    stamped++;
    return pre + ref + '?v=' + hash + post;
  });
  if (out !== src) {
    writeFileSync(file, out);
    rewritten++;
    console.log('  ✓ ' + relative(ROOT, file));
  }
}

for (const [ref, hash] of hashes) {
  if (hash) console.log('  ' + ref + '  →  ?v=' + hash);
}
console.log('已標記 ' + stamped + ' 處引用，改寫 ' + rewritten + ' 個 HTML 檔。');

if (missing.length) {
  console.error('\n找不到下列引用的檔案，快取破壞未完成：');
  missing.forEach((m) => console.error('  ✗ ' + m));
  process.exit(1);
}
