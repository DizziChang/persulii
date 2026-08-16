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

   雙語：同樣的流程再跑一次 content/products.en.json，輸出到 en/products/，
   網址變成 /en/products/<slug>。products.en.json 是手動維護的翻譯版本，
   不進 admin/config.yml，CMS 後台看不到、也不會被改動（跟 content/*.en.json
   其他檔案一樣的模式，見 js/main.js 的 contentUrl()）。

   一併重新產生 sitemap.xml，CMS 新增產品後網站地圖會自動跟上。

   Cloudflare Workers Builds 的 Build command（順序不可對調，
   stamp-assets 要能掃到這裡剛產生的 HTML）：
     node scripts/build-pages.mjs && node scripts/stamp-assets.mjs
   ============================================================ */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SITE_URL = 'https://persulii.com.tw';
const GA_ID = 'G-LZB61GG4PM';
const DEFAULT_OG_IMAGE = SITE_URL + '/images/hbanner-homebeauty.webp';

/* ---- 雙語文案：頁面版型裡固定的中文字都在這裡，翻譯版一併維護 ---- */
const STR = {
  zh: {
    siteName: '沛素 per-sulii', htmlLang: 'zh-Hant', ogLocale: 'zh_TW',
    home: '首頁', products: '產品', intro: '介紹影片',
    keyIngredients: '關鍵成分', audience: '適用族群', usage: '使用方式',
    reminder: '注意事項', ingredientLabel: '成分標示', productInfo: '產品資訊',
    brand: '品牌', name: '品名', enName: '英文名稱', volume: '容量',
    backToProducts: '← 回到產品頁', nextProduct: '下一個商品 →',
    share: '分享', feature: '產品特色',
    benefitCount: { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' },
    benefitSuffix: '大保養功效'
  },
  en: {
    siteName: 'per-sulii', htmlLang: 'en', ogLocale: 'en_US',
    home: 'Home', products: 'Products', intro: 'Introduction Video',
    keyIngredients: 'Key Ingredients', audience: 'Ideal For', usage: 'How to Use',
    reminder: 'Precautions', ingredientLabel: 'Ingredients:', productInfo: 'Product Info',
    brand: 'Brand', name: 'Product Name', enName: 'English Name', volume: 'Volume',
    backToProducts: '← Back to Products', nextProduct: 'Next Product →',
    share: 'Share', feature: 'Product Features',
    benefitCount: {},
    benefitSuffix: 'Key Benefits'
  }
};

/* 網址代稱：/products/v-essence 或 /en/products/v-essence。CMS 的 id 大小寫不拘，一律轉小寫 */
const slugOf = (p) => String(p.id).toLowerCase();
const langPrefix = (lang) => (lang === 'en' ? '/en' : '');
const pathOf = (p, lang) => langPrefix(lang) + '/products/' + slugOf(p);

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

/* ---- 影片 ----
   Google 要收錄影片需要兩件事：頁面上的 VideoObject 結構化資料，
   以及 sitemap 的 video 擴充。兩者的內容必須一致，所以共用下面這份定義。

   一支影片只掛一個頁面。首頁那三支（含 js/main.js 依 videoId 注入的 V／S
   短影片）與這裡宣告的是同一份內容，Google 一支影片只會挑一個網址收錄，
   兩邊都宣告等於自己跟自己搶，因此首頁刻意不宣告。中英文版共用同一支
   YouTube 影片（沒有另外配英文影片），只有周邊文字語言不同。 */

/* 影片沒有進 CMS，發佈時間統一用影片首次進版控的日期。
   換上新影片時要一併更新，否則 Google 拿到的是過期的發佈時間。 */
const VIDEO_PUBLISHED = '2026-08-01T00:00:00+08:00';

/* 縮圖是 VideoObject 的必填欄位，沒有就不會被收錄。用站內自製的 poster 圖，
   也就是影片本身的第一影格（同一張圖同時餵給 <video poster>）。

   不用 YouTube 的 maxresdefault：V／S 是直式 1080x1920，YouTube 一律輸出
   16:9，直式影片會被塞進信箱框，兩側補放大模糊的填充，真正的畫面只剩中間
   一條，當搜尋結果縮圖很吃虧。

   換影片時要重新抽圖（本機有 ffmpeg 的話）：
     ffmpeg -i video/persulii-vs-intro.mp4 -vframes 1 -q:v 2 images/video-vs-poster.jpg */
const poster = (code) => SITE_URL + '/images/video-' + code + '-poster.jpg';

/* /products 那支綜合介紹影片：檔案自架、沒有對應的 CMS 欄位，只能寫死。
   products.html／en/products.html 的 VideoObject 是手寫的，改這裡要記得同步過去。 */
const PRODUCTS_PAGE_VIDEO = {
  zh: {
    title: '沛素 per-sulii 產品介紹影片',
    description: '沛素 per-sulii 產品系列介紹：V-essence 精萃蜂胜肽 PLUS 精華與 S-essence 外泌體多胜肽養護精華，每天30秒在家養出好肌膚。',
    thumbnail: poster('vs'),
    contentUrl: SITE_URL + '/video/persulii-vs-intro.mp4'
  },
  en: {
    title: 'per-sulii Product Introduction Video',
    description: 'per-sulii product line introduction: V-essence Bee Peptide PLUS Serum and S-essence Exosome Multi-Peptide Serum — nurture great skin at home in 30 seconds a day.',
    thumbnail: poster('vs'),
    contentUrl: SITE_URL + '/video/persulii-vs-intro.mp4'
  }
};

/* 產品頁嵌的是 YouTube，所以給 player_loc／embedUrl 而非 content_loc；
   指向站內沒有的檔案會讓 Google 抓不到而整筆略過。 */
function productVideo(p, lang) {
  if (!p.videoId) return null;
  const s = STR[lang];
  return {
    title: p.en + ' ' + p.name + ' ' + s.intro,
    description: p.en + ' ' + p.name + (lang === 'en' ? ' — ' : '介紹影片。') + descOf(p),
    thumbnail: poster(String(p.code).toLowerCase()),
    playerUrl: 'https://www.youtube.com/embed/' + p.videoId
  };
}

/* 摘要取自賣點＋簡介，過長則截斷，維持在搜尋結果不被切掉的長度 */
function descOf(p) {
  const d = (p.tagline || '').replace(/<br\s*\/?>/gi, ' ') + (p.intro ? ' ' + p.intro : '');
  return d.length > 120 ? d.slice(0, 117) + '...' : d;
}

const SHARE_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="M8.1 10.7l7.6-4.3M8.1 13.3l7.6 4.3"/></svg>';
function shareButtonHTML(url, title, lang) {
  return '<div class="video-share-wrap">'
    + '<button type="button" class="btn ghost share-btn" data-share-url="' + attr(url) + '" data-share-title="' + attr(title || '') + '">'
    + SHARE_ICON_SVG + '<span class="share-btn-label">' + STR[lang].share + '</span>'
    + '</button></div>';
}

/* ---- 產品內文（自 js/main.js 的 renderProductDetail 移植，版型未變） ---- */
function detailHTML(p, next, lang) {
  const s = STR[lang];

  /* 關鍵成分：多項成分以「甲 + 乙 ⇨ 丙」流程呈現 */
  const ing = (p.ingredients && p.ingredients.length > 1)
    ? (() => {
      const last = p.ingredients[p.ingredients.length - 1];
      const head = p.ingredients.slice(0, -1).map((c) => c.zh).join(' <span class="ingredient-flow-plus">+</span> ');
      return '<div class="ingredient-flow mt24">'
        + '<div class="ingredient-flow-terms">' + head + ' <span class="ingredient-flow-arrow">⇨</span> ' + last.zh + '</div>'
        + '</div>';
    })()
    : (p.ingredients || []).map((c, i) => (i > 0 ? '<hr class="divider mt24">' : '')
      + '<div class="mt24"><div class="eyebrow">' + c.en + '</div>'
      + '<h3 class="h3 mt8" style="font-size:20px">' + c.zh + '</h3></div>').join('');

  const use = (p.usage || []).map((step, i) => {
    const n = ('0' + (i + 1)).slice(-2);
    return '<p class="body ' + (i === 0 ? 'mt16' : 'mt8') + '">'
      + '<span class="num">' + n + '</span>　' + step + '</p>';
  }).join('');

  /* 產品特色：有功效資料時以功效卡呈現（左側預留縮圖），否則沿用單段文字；有影片時功效文字置左、影片置右 */
  const benefitsHTML = (p.benefits && p.benefits.length)
    ? '<h2 class="h3">' + (s.benefitCount[p.benefits.length] || p.benefits.length) + s.benefitSuffix + '</h2><div class="benefits-row' + (p.benefits.length === 3 ? ' cols-3' : '') + ' mt32">'
    + p.benefits.map((b) => '<div class="benefit-item">'
      + '<div class="benefit-thumb"' + (b.img ? ' style="background-image:url(\'' + asset(b.img) + '\');background-size:cover;background-position:center"' : '') + '></div>'
      + '<div><h3 class="h3" style="font-size: clamp(18px, 2.5vw, 20px);">' + b.title + '</h3>'
      + '<p class="small mt8">' + nl2br(b.body) + '</p></div></div>').join('') + '</div>'
    : '<h2 class="h3">' + s.feature + '</h2><p class="body mt16">' + p.feature + '</p>';

  const featureSection = p.videoId
    ? '<div class="benefits-layout"><div>' + benefitsHTML + '</div>'
    + '<div class="benefit-video"><div class="video-frame"><iframe src="https://www.youtube.com/embed/' + attr(p.videoId) + '" title="' + attr(p.en) + ' ' + s.intro + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>'
    + shareButtonHTML(SITE_URL + pathOf(p, lang), p.en + ' ' + p.name, lang) + '</div>'
    + '</div>'
    : benefitsHTML;

  /* 適用族群／使用方式 左右並排 */
  const audienceUsageSection = (p.audience && p.audience.length)
    ? '<section class="sec tight" style="background:var(--bg)"><div class="wrap grid g2">'
    + '<div><h2 class="h3">' + s.audience + '</h2>'
    + '<ul class="checklist mt24">' + p.audience.map((a) => '<li>' + a + '</li>').join('') + '</ul>'
    + '</div>'
    + '<div><h2 class="h3">' + s.usage + '</h2>'
    + (p.usageTitle ? '<p class="body mt16">' + p.usageTitle + '</p>' : '')
    + use + '</div>'
    + '</div></section>'
    : '<section class="sec tight"><div class="wrap"><h2 class="h3">' + s.usage + '</h2>'
    + (p.usageTitle ? '<p class="body mt16">' + p.usageTitle + '</p>' : '')
    + use + '</div></section>';

  const reminderSection = p.reminder
    ? '<section class="sec tight"><div class="wrap"><h2 class="h3">' + s.reminder + '</h2>'
    + '<ul class="checklist dot mt16">' + p.reminder.split(/\n{2,}/).map((r) => '<li>' + r + '</li>').join('') + '</ul>'
    + '</div></section>'
    : '';

  const inciSection = p.specs.inciList
    ? '<p class="body mt8">' + s.ingredientLabel + '</p>'
    + '<p class="body mt16" style="font-weight:500">' + p.specs.inciTitle + '</p>'
    + '<p class="small mt8 inci-text">' + p.specs.inciList + '</p>'
    + (p.specs.inciNote ? '<p class="small mt8">' + p.specs.inciNote + '</p>' : '')
    : '<p class="body mt8">' + s.ingredientLabel + ' ' + p.specs.inci + '</p>';

  const bottleSection = p.bottleInfo
    ? '<section class="sec tight" style="background:var(--bg)"><div class="wrap">'
    + '<h2 class="h3">' + s.productInfo + '</h2><table class="pspecs mt24">'
    + '<tr><th>' + s.brand + '</th><td>' + p.bottleInfo.brand + '</td></tr>'
    + '<tr><th>' + s.name + '</th><td>' + p.bottleInfo.name + '</td></tr>'
    + '<tr><th>' + s.enName + '</th><td>' + p.bottleInfo.enName + '</td></tr>'
    + '<tr><th>' + s.volume + '</th><td>' + p.bottleInfo.volume + '</td></tr>'
    + '</table>'
    + '<div class="mt24">' + inciSection + '</div>'
    + '</div></section>'
    : '';

  const alt = attr(p.en + ' ' + p.name);
  const homeHref = lang === 'en' ? '/en/' : '/';
  return '<div class="wrap"><div class="crumb"><a href="' + homeHref + '">' + s.home + '</a> / <a href="' + langPrefix(lang) + '/products">' + s.products + '</a> / ' + p.en + ' ' + p.name + '</div></div>'
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
    + '<section class="sec tight"><div class="wrap"><h2 class="h3">' + s.keyIngredients + '</h2>' + ing + '</div></section>'
    + audienceUsageSection
    + reminderSection
    + '' /* TODO: 暫時隱藏「規格與認證」區塊 */
    + bottleSection
    + '<section class="sec tight"><div class="wrap">'
    + '<div class="pn mt56">'
    + '<a href="' + langPrefix(lang) + '/products" class="pn-i"><div class="eyebrow">' + s.backToProducts + '</div></a>'
    + '<a href="' + pathOf(next, lang) + '" class="pn-i" style="text-align:right"><div class="eyebrow">' + s.nextProduct + '</div><div class="nm">' + next.en + ' ' + next.name + '</div></a>'
    + '</div></div></section>';
}

/* ---- 整頁 ---- */
function pageHTML(p, next, lang) {
  const s = STR[lang];
  const title = p.en + ' ' + p.name + ' — ' + s.siteName;
  const url = SITE_URL + pathOf(p, lang);
  const altUrl = SITE_URL + pathOf(p, lang === 'en' ? 'zh' : 'en');
  const ogImage = p.banner ? (SITE_URL + asset(p.banner)) : DEFAULT_OG_IMAGE;

  const desc = descOf(p);

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.en + ' ' + p.name,
    description: desc,
    image: ogImage,
    brand: { '@type': 'Brand', name: 'per-sulii 沛素' },
    url: url
  };

  const video = productVideo(p, lang);
  const videoLd = video && {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.title,
    description: video.description,
    thumbnailUrl: video.thumbnail,
    uploadDate: VIDEO_PUBLISHED,
    embedUrl: video.playerUrl
  };
  const videoLdTag = videoLd
    ? '\n  <script type="application/ld+json">' + JSON.stringify(videoLd) + '</script>'
    : '';

  return `<!DOCTYPE html>
<html lang="${s.htmlLang}">

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
  <link rel="alternate" hreflang="${lang === 'en' ? 'zh-Hant' : 'en'}" href="${attr(altUrl)}">
  <link rel="alternate" hreflang="${s.htmlLang}" href="${attr(url)}">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="${attr(s.siteName)}">
  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(desc)}">
  <meta property="og:url" content="${attr(url)}">
  <meta property="og:image" content="${attr(ogImage)}">
  <meta property="og:locale" content="${s.ogLocale}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${attr(title)}">
  <meta name="twitter:description" content="${attr(desc)}">
  <meta name="twitter:image" content="${attr(ogImage)}">
  <script type="application/ld+json">${JSON.stringify(ld)}</script>${videoLdTag}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link
    href="https://fonts.googleapis.com/css2?family=Funnel+Display:wght@300..800&family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@400;500;600;700&display=swap"
    rel="stylesheet">
  <link rel="stylesheet" href="/css/main.css">
</head>

<body data-page="products">

  <div id="site-header"></div>

  <!-- 本頁由 scripts/build-pages.mjs 依 content/products${lang === 'en' ? '.en' : ''}.json 產生，請勿直接編輯 -->
  <main id="product-detail">${detailHTML(p, next, lang)}</main>

  <div id="site-footer"></div>

  <script src="/js/components.js"></script>
  <script src="/js/main.js"></script>
</body>

</html>
`;
}

/* ---- sitemap ---- */
const STATIC_PAGES = {
  zh: [
    { path: '/', changefreq: 'weekly', priority: '1.0' },
    { path: '/about', changefreq: 'monthly', priority: '0.8' },
    { path: '/products', changefreq: 'weekly', priority: '0.9' },
    { path: '/faq', changefreq: 'monthly', priority: '0.6' },
    { path: '/contact', changefreq: 'yearly', priority: '0.5' }
  ],
  en: [
    { path: '/en/', changefreq: 'weekly', priority: '1.0' },
    { path: '/en/about', changefreq: 'monthly', priority: '0.8' },
    { path: '/en/products', changefreq: 'weekly', priority: '0.9' },
    { path: '/en/faq', changefreq: 'monthly', priority: '0.6' },
    { path: '/en/contact', changefreq: 'yearly', priority: '0.5' }
  ]
};

/* video 擴充的子標籤有固定順序，對調會驗證失敗。attr() 逸出的字元
   （& < > "）對 XML 文字節點也夠用，不另外寫一份逸出函式。 */
function videoXML(v) {
  if (!v) return '';
  return '    <video:video>\n'
    + '      <video:thumbnail_loc>' + attr(v.thumbnail) + '</video:thumbnail_loc>\n'
    + '      <video:title>' + attr(v.title) + '</video:title>\n'
    + '      <video:description>' + attr(v.description) + '</video:description>\n'
    + (v.contentUrl ? '      <video:content_loc>' + attr(v.contentUrl) + '</video:content_loc>\n' : '')
    + (v.playerUrl ? '      <video:player_loc>' + attr(v.playerUrl) + '</video:player_loc>\n' : '')
    + '      <video:publication_date>' + VIDEO_PUBLISHED + '</video:publication_date>\n'
    + '    </video:video>\n';
}

function sitemapXML(productsByLang) {
  const entries = [];
  for (const lang of ['zh', 'en']) {
    const products = productsByLang[lang];
    STATIC_PAGES[lang].forEach((e) => {
      entries.push(e.path === STATIC_PAGES[lang][2].path ? { ...e, video: PRODUCTS_PAGE_VIDEO[lang] } : e);
    });
    products.forEach((p) => {
      entries.push({ path: pathOf(p, lang), changefreq: 'monthly', priority: '0.8', video: productVideo(p, lang) });
    });
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
    + '        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n'
    + entries.map((e) => '  <url>\n'
      + '    <loc>' + SITE_URL + e.path + '</loc>\n'
      + '    <changefreq>' + e.changefreq + '</changefreq>\n'
      + '    <priority>' + e.priority + '</priority>\n'
      + videoXML(e.video)
      + '  </url>\n').join('')
    + '</urlset>\n';
}

/* ---- 執行：中文（content/products.json）與英文（content/products.en.json）各跑一輪 ---- */
function buildLang(lang, jsonFile) {
  const filePath = join(ROOT, jsonFile);
  if (!existsSync(filePath)) {
    console.error(jsonFile + ' 不存在，跳過 ' + lang + ' 版建置。');
    return [];
  }
  const products = JSON.parse(readFileSync(filePath, 'utf8')).items || [];
  if (!products.length) {
    console.error(jsonFile + ' 沒有任何產品，中止建置。');
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

  const outDir = lang === 'en' ? join(ROOT, 'en/products') : join(ROOT, 'products');
  mkdirSync(outDir, { recursive: true });

  products.forEach((p, i) => {
    const next = products[(i + 1) % products.length];
    writeFileSync(join(outDir, slugOf(p) + '.html'), pageHTML(p, next, lang));
    console.log('  ✓ ' + (lang === 'en' ? 'en/products/' : 'products/') + slugOf(p) + '.html  →  ' + pathOf(p, lang));
  });

  /* CMS 刪掉產品後，殘留的舊頁面會繼續被 Google 收錄，一併清掉 */
  if (existsSync(outDir)) {
    for (const name of readdirSync(outDir)) {
      if (!name.endsWith('.html')) continue;
      if (seen.has(name.slice(0, -5))) continue;
      rmSync(join(outDir, name));
      console.log('  ✗ 移除已不存在的產品頁 ' + (lang === 'en' ? 'en/products/' : 'products/') + name);
    }
  }

  return products;
}

const productsZh = buildLang('zh', 'content/products.json');
const productsEn = buildLang('en', 'content/products.en.json');

writeFileSync(join(ROOT, 'sitemap.xml'), sitemapXML({ zh: productsZh, en: productsEn }));
console.log('  ✓ sitemap.xml（' + (STATIC_PAGES.zh.length + productsZh.length + STATIC_PAGES.en.length + productsEn.length) + ' 筆）');
