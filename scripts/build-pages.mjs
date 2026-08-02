#!/usr/bin/env node
/* ============================================================
   build-pages.mjs — 產品實體頁與 sitemap 產生器

   讀 content/products.json，每款產品輸出一個實體 HTML：
     content/products.json  →  products/v-essence.html  →  /products/v-essence

   為什麼要在建置時產生，而不是像以前一樣用 product.html?id= 由 JS 渲染：
     1. 每頁有自己的 title / description / canonical / OG，原始 HTML 就帶著，
        不必等 JS 執行。Facebook、LINE 的預覽爬蟲不跑 JS，只看得到原始 HTML。
     2. 兩款產品不再共用同一份 HTML 與同一個 canonical，不會被判定成重複頁。

   內文同樣在這裡預渲染（原本在 js/main.js 的 renderProductDetail），
   所以那個函式已從 main.js 移除，避免同一份版型維護兩套。

   一併重新產生 sitemap.xml，CMS 新增產品後網站地圖會自動跟上。

   Cloudflare Workers Builds 的 Build command（順序不可對調，
   stamp-assets 要能掃到這裡剛產生的 HTML）：
     node scripts/build-pages.mjs && node scripts/stamp-assets.mjs
   ============================================================ */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'products');

const SITE_URL = 'https://persulii.com.tw';
const SITE_NAME = '沛素 per-sulii';
const GA_ID = 'G-LZB61GG4PM';
const DEFAULT_OG_IMAGE = SITE_URL + '/images/hbanner-homebeauty.webp';

/* 網址代稱：/products/v-essence。CMS 的 id 大小寫不拘，一律轉小寫 */
const slugOf = (p) => String(p.id).toLowerCase();
const pathOf = (p) => '/products/' + slugOf(p);

/* CMS 的 media_folder 是 images，存出來的路徑有 "images/x.webp" 也有 "/images/x.webp"，
   在子目錄頁面上相對路徑會解析錯，統一補成根絕對路徑 */
function asset(p) {
  if (!p) return p;
  return /^(https?:)?\/\//.test(p) ? p : '/' + String(p).replace(/^\/+/, '');
}

/* 只用於屬性值（meta content、alt、src…）；內文沿用 CMS 原樣輸出，與改版前一致 */
function attr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function nl2br(s) { return (s || '').split('\n').join('<br>'); }

const SHARE_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="M8.1 10.7l7.6-4.3M8.1 13.3l7.6 4.3"/></svg>';
function shareButtonHTML(url, title) {
  return '<div class="video-share-wrap">'
    + '<button type="button" class="btn ghost share-btn youtube-share-btn" data-share-url="' + attr(url) + '" data-share-title="' + attr(title || '') + '">'
    + SHARE_ICON_SVG + '<span class="share-btn-label">分享</span>'
    + '</button></div>';
}

/* ---- 產品內文（自 js/main.js 的 renderProductDetail 移植，版型未變） ---- */
function detailHTML(p, next) {
  /* 關鍵成分：多項成分以「甲 + 乙 ⇨ 丙」流程呈現，說明文字取最後一項成分的描述 */
  const ing = (p.ingredients && p.ingredients.length > 1)
    ? (() => {
      const last = p.ingredients[p.ingredients.length - 1];
      const head = p.ingredients.slice(0, -1).map((c) => c.zh).join(' <span class="ingredient-flow-plus">+</span> ');
      return '<div class="ingredient-flow mt24">'
        + '<div class="ingredient-flow-terms">' + head + ' <span class="ingredient-flow-arrow">⇨</span> ' + last.zh + '</div>'
        + '<p class="ingredient-flow-caption mt8">' + last.desc + '</p>'
        + '</div>';
    })()
    : (p.ingredients || []).map((c, i) => (i > 0 ? '<hr class="divider mt24">' : '')
      + '<div class="mt24"><div class="eyebrow">' + c.en + '</div>'
      + '<h3 class="h3 mt8" style="font-size:20px">' + c.zh + '</h3>'
      + '<p class="body mt8">' + c.desc + '</p></div>').join('');

  const use = (p.usage || []).map((s, i) => {
    const n = ('0' + (i + 1)).slice(-2);
    return '<p class="body ' + (i === 0 ? 'mt16' : 'mt8') + '">'
      + '<span class="num">' + n + '</span>　' + s + '</p>';
  }).join('');

  /* 產品特色：有功效資料時以功效卡呈現（左側預留縮圖），否則沿用單段文字；有影片時功效文字置左、影片置右 */
  const ZH_NUM = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
  const benefitsHTML = (p.benefits && p.benefits.length)
    ? '<h2 class="h3">' + (ZH_NUM[p.benefits.length] || p.benefits.length) + '大保養功效</h2><div class="benefits-row' + (p.benefits.length === 3 ? ' cols-3' : '') + ' mt32">'
    + p.benefits.map((b) => '<div class="benefit-item">'
      + '<div class="benefit-thumb"' + (b.img ? ' style="background-image:url(\'' + asset(b.img) + '\');background-size:cover;background-position:center"' : '') + '></div>'
      + '<div><h3 class="h3" style="font-size: clamp(18px, 2.5vw, 20px);">' + b.title + '</h3>'
      + '<p class="small mt8">' + nl2br(b.body) + '</p></div></div>').join('') + '</div>'
    : '<h2 class="h3">產品特色</h2><p class="body mt16">' + p.feature + '</p>';

  const featureSection = p.videoId
    ? '<div class="benefits-layout"><div>' + benefitsHTML + '</div>'
    + '<div class="benefit-video"><div class="video-frame"><iframe src="https://www.youtube.com/embed/' + attr(p.videoId) + '" title="' + attr(p.en) + ' 介紹影片" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>'
    + shareButtonHTML(SITE_URL + pathOf(p), p.en + ' ' + p.name) + '</div>'
    + '</div>'
    : benefitsHTML;

  /* 適用族群／使用方式 左右並排 */
  const audienceUsageSection = (p.audience && p.audience.length)
    ? '<section class="sec tight" style="background:var(--bg)"><div class="wrap grid g2">'
    + '<div><h2 class="h3">適用族群</h2>'
    + '<ul class="checklist mt24">' + p.audience.map((a) => '<li>' + a + '</li>').join('') + '</ul>'
    + '</div>'
    + '<div><h2 class="h3">使用方式</h2>'
    + (p.usageTitle ? '<p class="body mt16">' + p.usageTitle + '</p>' : '')
    + use + '</div>'
    + '</div></section>'
    : '<section class="sec tight"><div class="wrap"><h2 class="h3">使用方式</h2>'
    + (p.usageTitle ? '<p class="body mt16">' + p.usageTitle + '</p>' : '')
    + use + '</div></section>';

  const reminderSection = p.reminder
    ? '<section class="sec tight"><div class="wrap"><h2 class="h3">注意事項</h2>'
    + '<ul class="checklist dot mt16">' + p.reminder.split(/\n{2,}/).map((r) => '<li>' + r + '</li>').join('') + '</ul>'
    + '</div></section>'
    : '';

  const inciSection = p.specs.inciList
    ? '<p class="body mt8">成分標示：</p>'
    + '<p class="body mt16" style="font-weight:500">' + p.specs.inciTitle + '</p>'
    + '<p class="small mt8 inci-text">' + p.specs.inciList + '</p>'
    + (p.specs.inciNote ? '<p class="small mt8">' + p.specs.inciNote + '</p>' : '')
    : '<p class="body mt8">成分標示：' + p.specs.inci + '</p>';

  const bottleSection = p.bottleInfo
    ? '<section class="sec tight" style="background:var(--bg)"><div class="wrap">'
    + '<h2 class="h3">產品資訊</h2><table class="pspecs mt24">'
    + '<tr><th>品牌</th><td>' + p.bottleInfo.brand + '</td></tr>'
    + '<tr><th>品名</th><td>' + p.bottleInfo.name + '</td></tr>'
    + '<tr><th>英文名稱</th><td>' + p.bottleInfo.enName + '</td></tr>'
    + '<tr><th>容量</th><td>' + p.bottleInfo.volume + '</td></tr>'
    + '</table>'
    + '<div class="mt24">' + inciSection + '</div>'
    + '</div></section>'
    : '';

  const alt = attr(p.en + ' ' + p.name);
  return '<div class="wrap"><div class="crumb"><a href="/">首頁</a> / <a href="/products">產品</a> / ' + p.en + ' ' + p.name + '</div></div>'
    + (p.banner ? '<div class="pbanner-wrap"><img class="pbanner" src="' + asset(p.banner) + '" alt="' + alt + '"></div>' : '')
    + '<section class="sec tight"><div class="wrap split" style="align-items:flex-start">'
    + '<div class="media product" id="product-hero-media"' + (p.heroImg ? '' : ' data-mono="' + attr(p.code) + '"') + '>'
    + (p.heroImg ? '<img class="media-img" src="' + asset(p.heroImg) + '" alt="' + alt + '">' : '')
    + '</div>'
    + '<div><div class="eyebrow">' + p.en + '</div>'
    + '<h1 class="h2 mt12">' + p.name + '</h1>'
    + '<p class="lead mt16">' + p.tagline + '</p>'
    + '<p class="body">' + p.intro + '</p>'
    + (p.highlights && p.highlights.length ? '<div class="chips mt24">' + p.highlights.map((h) => '<span class="chip">' + h + '</span>').join('') + '</div>' : '')
    + '</div>'
    + '</div></section>'
    + '<section class="sec tight" id="product-feature-sec" style="background:var(--bg)"><div class="wrap">' + featureSection + '</div></section>'
    + '<section class="sec tight"><div class="wrap"><h2 class="h3">關鍵成分</h2>' + ing + '</div></section>'
    + audienceUsageSection
    + reminderSection
    + '' /* TODO: 暫時隱藏「規格與認證」區塊 */
    + bottleSection
    + '<section class="sec tight"><div class="wrap">'
    + '<div class="pn mt56">'
    + '<a href="/products" class="pn-i"><div class="eyebrow">← 回到產品頁</div></a>'
    + '<a href="' + pathOf(next) + '" class="pn-i" style="text-align:right"><div class="eyebrow">下一個商品 →</div><div class="nm">' + next.en + ' ' + next.name + '</div></a>'
    + '</div></div></section>';
}

/* ---- 整頁 ---- */
function pageHTML(p, next) {
  const title = p.en + ' ' + p.name + ' — ' + SITE_NAME;
  const url = SITE_URL + pathOf(p);
  const ogImage = p.banner ? (SITE_URL + asset(p.banner)) : DEFAULT_OG_IMAGE;

  /* 摘要取自賣點＋簡介，過長則截斷，維持在搜尋結果不被切掉的長度 */
  let desc = (p.tagline || '').replace(/<br\s*\/?>/gi, ' ') + (p.intro ? ' ' + p.intro : '');
  if (desc.length > 120) desc = desc.slice(0, 117) + '...';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.en + ' ' + p.name,
    description: desc,
    image: ogImage,
    brand: { '@type': 'Brand', name: 'per-sulii 沛素' },
    url: url
  };

  return `<!DOCTYPE html>
<html lang="zh-Hant">

<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA_ID}');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${attr(title)}</title>
  <meta name="description" content="${attr(desc)}">
  <link rel="canonical" href="${attr(url)}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="${attr(SITE_NAME)}">
  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(desc)}">
  <meta property="og:url" content="${attr(url)}">
  <meta property="og:image" content="${attr(ogImage)}">
  <meta property="og:locale" content="zh_TW">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${attr(title)}">
  <meta name="twitter:description" content="${attr(desc)}">
  <meta name="twitter:image" content="${attr(ogImage)}">
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link
    href="https://fonts.googleapis.com/css2?family=Funnel+Display:wght@300..800&family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@400;500;600;700&display=swap"
    rel="stylesheet">
  <link rel="stylesheet" href="/css/main.css">
</head>

<body data-page="products">

  <div id="site-header"></div>

  <!-- 本頁由 scripts/build-pages.mjs 依 content/products.json 產生，請勿直接編輯 -->
  <main id="product-detail">${detailHTML(p, next)}</main>

  <div id="site-footer"></div>

  <script src="/js/components.js"></script>
  <script src="/js/main.js"></script>
</body>

</html>
`;
}

/* ---- sitemap ---- */
const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/about', changefreq: 'monthly', priority: '0.8' },
  { path: '/products', changefreq: 'weekly', priority: '0.9' },
  { path: '/contact', changefreq: 'yearly', priority: '0.5' }
];

function sitemapXML(products) {
  const entries = STATIC_PAGES.concat(
    products.map((p) => ({ path: pathOf(p), changefreq: 'monthly', priority: '0.8' }))
  );
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + entries.map((e) => '  <url>\n'
      + '    <loc>' + SITE_URL + e.path + '</loc>\n'
      + '    <changefreq>' + e.changefreq + '</changefreq>\n'
      + '    <priority>' + e.priority + '</priority>\n'
      + '  </url>\n').join('')
    + '</urlset>\n';
}

/* ---- 執行 ---- */
const products = JSON.parse(readFileSync(join(ROOT, 'content/products.json'), 'utf8')).items || [];
if (!products.length) {
  console.error('content/products.json 沒有任何產品，中止建置。');
  process.exit(1);
}

const seen = new Set();
for (const p of products) {
  const slug = slugOf(p);
  if (seen.has(slug)) {
    console.error('產品代稱重複：' + p.id + '（網址會互相覆蓋，請在 CMS 改掉其中一個）');
    process.exit(1);
  }
  seen.add(slug);
}

mkdirSync(OUT_DIR, { recursive: true });

products.forEach((p, i) => {
  const next = products[(i + 1) % products.length];
  writeFileSync(join(OUT_DIR, slugOf(p) + '.html'), pageHTML(p, next));
  console.log('  ✓ products/' + slugOf(p) + '.html  →  ' + pathOf(p));
});

/* CMS 刪掉產品後，殘留的舊頁面會繼續被 Google 收錄，一併清掉 */
if (existsSync(OUT_DIR)) {
  for (const name of readdirSync(OUT_DIR)) {
    if (!name.endsWith('.html')) continue;
    if (seen.has(name.slice(0, -5))) continue;
    rmSync(join(OUT_DIR, name));
    console.log('  ✗ 移除已不存在的產品頁 products/' + name);
  }
}

writeFileSync(join(ROOT, 'sitemap.xml'), sitemapXML(products));
console.log('  ✓ sitemap.xml（' + (STATIC_PAGES.length + products.length) + ' 筆）');
