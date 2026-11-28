#!/usr/bin/env node
/* ============================================================
   build-pages.mjs — 產品實體頁與 sitemap 產生器

   讀 content/products.json，所有產品合併輸出成一個實體 HTML（2026-11-28 起）：
     content/products.json  →  products/vs-essences.html  →  /products/vs-essences
   每款產品是頁內一段，錨點為產品代稱：/products/vs-essences#v-essence。
   舊網址 /products/v-essence、/products/s-essence 由 worker/index.js 與 _redirects 301 轉到對應錨點。

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
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'products');

const SITE_URL = 'https://persulii.com.tw';
const SITE_NAME = 'per-sulii 沛素';
const GA_ID = 'G-LZB61GG4PM';
const DEFAULT_OG_IMAGE = SITE_URL + '/images/hbanner-homebeauty.webp';

/* 合併後的產品介紹頁 */
const PAGE_SLUG = 'vs-essences';
const PAGE_PATH = '/products/' + PAGE_SLUG;
const PAGE_URL = SITE_URL + PAGE_PATH;
const PAGE_NAME = '沛素胜肽精華液';
/* 產品在頁內的錨點：#v-essence。CMS 的 id 大小寫不拘，一律轉小寫 */
const slugOf = (p) => String(p.id).toLowerCase();
const pathOf = (p) => PAGE_PATH + '#' + slugOf(p);
/* 頁內排列：V 在前、S 在後（與「V+S」的說法一致），CMS 新增的其他產品接在後面 */
const ORDER = ['V-essence', 'S-essence'];
const ordered = (list) => list.slice().sort((a, b) => {
  const ia = ORDER.indexOf(a.en), ib = ORDER.indexOf(b.en);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
});

/* CMS 的 media_folder 是 images，存出來的路徑有 "images/x.webp" 也有 "/images/x.webp"，
   在子目錄頁面上相對路徑會解析錯，統一補成根絕對路徑 */
function asset(p) {
  if (!p) return p;
  return /^(https?:)?\/\//.test(p) ? p : '/' + String(p).replace(/^\/+/, '');
}

/* ---- LINE 購買 CTA ----
   用 LINE 的 oaMessage 連結開啟官方帳號並預填訊息；訊息開頭帶辨識碼（S02、V01…），
   客服一看就知道客人從哪顆按鈕來：02 = 準備購買（優先回覆）、01 = 還在了解。
   同一份定義也寫在 js/main.js（首頁、FAQ 用），改文案或帳號時兩邊一起改。 */
const LINE_OA_ID = '@592ziwjw';
const LINE_ICON_SVG = '<svg class="line-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5C6.2 2.5 1.5 6.3 1.5 11c0 4.2 3.7 7.7 8.7 8.4.34.07.8.22.92.51.1.27.07.68.03.95l-.15.9c-.04.27-.21 1.05.92.57 1.13-.47 6.07-3.57 8.28-6.12 1.53-1.66 2.3-3.36 2.3-5.21 0-4.7-4.7-8.5-10.5-8.5zM7.3 13.6H5.2a.55.55 0 0 1-.55-.55V8.9a.55.55 0 0 1 1.1 0v3.6h1.55a.55.55 0 0 1 0 1.1zm1.9-.55a.55.55 0 0 1-1.1 0V8.9a.55.55 0 0 1 1.1 0v4.15zm5.1 0a.55.55 0 0 1-.99.33l-2.06-2.8v2.47a.55.55 0 0 1-1.1 0V8.9a.55.55 0 0 1 .99-.33l2.06 2.8V8.9a.55.55 0 0 1 1.1 0v4.15zm3.5-2.63a.55.55 0 0 1 0 1.1h-1.55v.98h1.55a.55.55 0 0 1 0 1.1h-2.1a.55.55 0 0 1-.55-.55V8.9c0-.3.25-.55.55-.55h2.1a.55.55 0 0 1 0 1.1h-1.55v.97h1.55z"/></svg>';
function lineCtaURL(code, msg) {
  return 'https://line.me/R/oaMessage/' + LINE_OA_ID + '/?' + encodeURIComponent(code + '｜' + msg);
}
/* variant：'solid'（綠底，準備購買）或 'ghost'（綠框，詢問）；loc 送進 GA4 line_click 的 link_location */
function lineCtaHTML(code, label, msg, variant, loc) {
  return '<a class="btn line-cta ' + variant + '" href="' + attr(lineCtaURL(code, msg)) + '" target="_blank" rel="noopener"'
    + ' data-cta="' + code + '" data-cta-loc="' + loc + '">' + LINE_ICON_SVG + '<span>' + label + '</span></a>';
}

/* 只用於屬性值（meta content、alt、src…）；內文沿用 CMS 原樣輸出，與改版前一致 */
function attr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 保養功效說明：\n 拆成多個 span 而非直接 <br>，手機版靠 CSS 把 span 疊成一行一個，
   桌面版維持 inline 原樣接在一起——同一份文字兩種斷行需求（見 main.css .benefit-line） */
function benefitBodyHTML(s) {
  return (s || '').split('\n').map((line) => '<span class="benefit-line">' + line + '</span>').join('');
}

/* 摘要取自賣點＋簡介，過長則截斷，維持在搜尋結果不被切掉的長度 */
function descOf(p) {
  const d = (p.tagline || '').replace(/<br\s*\/?>/gi, ' ') + (p.intro ? ' ' + p.intro : '');
  return d.length > 120 ? d.slice(0, 117) + '...' : d;
}

/* ---- 單一產品段落（合併頁裡的一段；不含首圖 banner） ---- */
function productSectionHTML(p) {
  /* 關鍵成分：多項成分以「甲 + 乙 ⇨ 丙」流程呈現 */
  const ing = (p.ingredients && p.ingredients.length > 1)
    ? (() => {
      const last = p.ingredients[p.ingredients.length - 1];
      const head = p.ingredients.slice(0, -1).map((c) => c.zh).join(' <span class="ingredient-flow-plus">+</span> ');
      return '<div class="ingredient-flow mt16">'
        + '<div class="ingredient-flow-terms">' + head + ' <span class="ingredient-flow-arrow">⇨</span> ' + last.zh + '</div>'
        + '</div>';
    })()
    : (p.ingredients || []).map((c, i) => (i > 0 ? '<hr class="divider mt24">' : '')
      + '<div class="mt24"><div class="eyebrow">' + c.en + '</div>'
      + '<h3 class="h3 mt8" style="font-size:20px">' + c.zh + '</h3></div>').join('');

  /* 產品特色：有功效資料時以功效卡呈現（左側預留縮圖），否則沿用單段文字 */
  const ZH_NUM = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
  const benefitsHTML = (p.benefits && p.benefits.length)
    ? '<h2 class="h3">' + (ZH_NUM[p.benefits.length] || p.benefits.length) + '大保養功效</h2><div class="benefits-row' + (p.benefits.length === 3 ? ' cols-3' : '') + ' mt32">'
    + p.benefits.map((b) => '<div class="benefit-item">'
      + '<div class="benefit-thumb"' + (b.img ? ' style="background-image:url(\'' + asset(b.img) + '\');background-size:cover;background-position:center"' : '') + '></div>'
      + '<div><h3 class="h3" style="font-size: clamp(18px, 2.5vw, 20px);">' + b.title + '</h3>'
      + '<p class="small mt8">' + benefitBodyHTML(b.body) + '</p></div></div>').join('') + '</div>'
    : '<h2 class="h3">產品特色</h2><p class="body mt16">' + p.feature + '</p>';

  const reminderSection = p.reminder
    ? '<section class="sec tight"><div class="wrap"><h2 class="h3">注意事項</h2>'
    + '<ul class="checklist dot mt16">' + p.reminder.split(/\n{2,}/).map((r) => '<li>' + r + '</li>').join('') + '</ul>'
    + '</div></section>'
    : '';

  /* 產品簡介右欄：名稱、賣點、簡介、標籤，接著關鍵成分與適用族群（2026-11-28 從獨立區塊移進來） */
  const audienceHTML = (p.audience && p.audience.length)
    ? '<h3 class="h3 vs-sub mt32">適用族群</h3>'
    + '<ul class="checklist mt16">' + p.audience.map((a) => '<li>' + a + '</li>').join('') + '</ul>'
    : '';

  const alt = attr(p.en + ' ' + p.name);
  return '<article class="vs-product" id="' + attr(slugOf(p)) + '">'
    + '<section class="sec tight"><div class="wrap split vs-hero" style="align-items:flex-start">'
    + '<div class="media product product-hero-media"' + (p.heroImg ? '' : ' data-mono="' + attr(p.code) + '"') + '>'
    + (p.heroImg ? '<img class="media-img" src="' + asset(p.heroImg) + '" alt="' + alt + '">' : '')
    + '</div>'
    + '<div>'
    + '<div class="eyebrow vs-label">沛素 ' + p.en + '</div>'
    + '<h2 class="h2 mt12">' + p.name + '</h2>'
    + '<p class="lead mt16">' + p.tagline + '</p>'
    + '<p class="body">' + p.intro + '</p>'
    + (p.notes && p.notes.length ? '<ul class="vs-notes mt16">' + p.notes.map((n) => '<li>' + n + '</li>').join('') + '</ul>' : '')
    + (p.ingredients && p.ingredients.length ? '<h3 class="h3 vs-sub mt32">關鍵成分</h3>' + ing : '')
    + audienceHTML
    + '</div>'
    + '</div></section>'
    + '<section class="sec tight product-feature-sec" style="background:var(--bg)"><div class="wrap">' + benefitsHTML + '</div></section>'
    /* S01／V01：看完簡介與功效、還在猶豫的人 */
    + '<section class="sec tight line-cta-band"><div class="wrap center">'
    + '<p class="body">每個人的膚況不同，不確定適不適合，直接問我們最快。</p>'
    + '<div class="mt24">' + lineCtaHTML(p.code + '01', '不確定適不適合？LINE 問我們', '我想了解 ' + p.en, 'ghost', 'product_mid') + '</div>'
    + '</div></section>'
    + reminderSection
    + '</article>';
}

/* ---- 使用方式：兩款共用一段（2026-11-28 合併；CMS 各產品的 usage 欄位目前不再使用） ---- */
const SHARED_USAGE_TITLE = '每天30秒 早晚淨臉後護理';
const SHARED_USAGE = ['臉部清潔完畢', '先取適量 V-essence 輕抹全臉，細紋處可加強', '待約20秒吸收後，再取適量 S-essence 輕抹全臉', '早晚都能使用'];
function usageHTML() {
  return '<section class="sec tight" style="background:var(--bg)"><div class="wrap">'
    + '<h2 class="h3">使用方式</h2>'
    + '<p class="body mt16">' + SHARED_USAGE_TITLE + '</p>'
    + SHARED_USAGE.map((t, i) => '<p class="body ' + (i === 0 ? 'mt16' : 'mt8') + '"><span class="num">' + ('0' + (i + 1)).slice(-2) + '</span>　' + t + '</p>').join('')
    + '</div></section>';
}

/* ---- 產品資訊：各產品並排（手機上下排），認證只寫一次 ---- */
function productInfoHTML(products) {
  const col = (p) => {
    const b = p.bottleInfo || {};
    const rows = [
      ['品名', b.name], ['容量', b.volume], ['定價', b.price], ['保存方法', b.storage], ['有效期限', b.shelfLife],
      ['保存期限與批號', b.batchExpiry], ['製造業者', b.manufacturer], ['客服專線', b.phone], ['地址', b.address]
    ].filter((r) => r[1]).map((r) => '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td></tr>').join('');
    const sp = p.specs || {};
    const inci = sp.inciList
      ? '<p class="body mt16" style="font-weight:500">' + sp.inciTitle + '</p>'
      + '<p class="small mt8 inci-text">' + sp.inciList + '</p>'
      + (sp.inciNote ? '<p class="small mt8">' + sp.inciNote + '</p>' : '')
      : (sp.inci ? '<p class="body mt16">成分標示：' + sp.inci + '</p>' : '');
    return '<div class="vs-info-col">'
      + '<h3 class="h3 vs-sub">' + p.en + ' ' + p.name + '</h3>'
      + (rows ? '<table class="pspecs mt16">' + rows + '</table>' : '')
      + inci
      + '</div>';
  };
  const certs = [...new Set(products.flatMap((p) => p.certifications || []))];
  return '<section class="sec tight"><div class="wrap">'
    + '<h2 class="h3">產品資訊</h2>'
    + '<div class="grid g2 vs-info mt24">' + products.map(col).join('') + '</div>'
    + (certs.length ? '<p class="small mt32">' + certs.join(' ｜ ') + '</p>' : '')
    + '</div></section>';
}

/* ---- 合併頁內文：頁首（麵包屑、H1、跳到各產品）＋各產品段落＋共用使用方式＋產品資訊＋回產品頁 ---- */
function detailHTML(products) {
  return '<section class="sec tight vs-intro"><div class="wrap">'
    + '<div class="crumb"><a href="/">首頁</a> / <a href="/products">產品</a> / ' + PAGE_NAME + '</div>'
    + '<div class="center mt32">'
    + '<div class="eyebrow">Products</div>'
    + '<h1 class="h2 mt16">' + PAGE_NAME + '</h1>'
    + '<p class="body mt16">每天30秒，在家悄悄變美。兩款精華可單獨使用，也可以早晚搭配。</p>'
    + '<nav class="vs-jump mt32" aria-label="產品">'
    + products.map((p) => '<a href="#' + attr(slugOf(p)) + '" class="btn ghost">' + (p.hoverTitle && p.hoverDesc ? p.hoverTitle + '｜' + p.hoverDesc : p.en) + '</a>').join('')
    + '</nav>'
    + '</div></div></section>'
    + products.map(productSectionHTML).join('')
    + usageHTML()
    + productInfoHTML(products)
    + '<section class="sec tight"><div class="wrap">'
    + '<div class="pn mt56">'
    + '<a href="/products" class="pn-i"><div class="eyebrow">← 回到產品頁</div></a>'
    + '</div></div></section>';
}

/* ---- 整頁 ---- */
function pageHTML(products) {
  const title = '胜肽精華液 V-essence・S-essence｜淡化細紋・細緻毛孔｜沛素 per-sulii';
  const url = PAGE_URL;
  const ogImage = DEFAULT_OG_IMAGE;
  const desc = '沛素 V-essence 精萃蜂胜肽PLUS精華淡化細紋、緊緻彈潤；S-essence 外泌體多胜肽養護精華細緻毛孔、穩定膚況。完成 TFDA 化粧品產品登錄，GMP 品質製程。';

  /* 每款產品一筆 Product。Google 的 Product 複合式結果必須有 offers／review／aggregateRating 其一，
     這裡用 CMS 的定價（例如 "NT$ 3,800"）產生 offers；沒填定價就不輸出 */
  const ld = products.map((p) => {
    const item = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.en + ' ' + p.name,
      description: descOf(p),
      image: SITE_URL + asset(p.heroImg || p.img),
      brand: { '@type': 'Brand', name: 'per-sulii 沛素' },
      url: SITE_URL + pathOf(p)
    };
    const price = String((p.bottleInfo && p.bottleInfo.price) || '').replace(/[^\d.]/g, '');
    if (price) {
      item.offers = {
        '@type': 'Offer',
        price: price,
        priceCurrency: 'TWD',
        availability: 'https://schema.org/InStock',
        url: SITE_URL + pathOf(p)
      };
    }
    return item;
  });

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首頁', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: '產品', item: SITE_URL + '/products' },
      { '@type': 'ListItem', position: 3, name: PAGE_NAME, item: url }
    ]
  };
  const breadcrumbLdTag = '\n  <script type="application/ld+json">' + JSON.stringify(breadcrumbLd) + '</script>';

  return `<!DOCTYPE html>
<html lang="zh-Hant-TW">

<head>
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    /* 內部人員裝置：開過一次 /?internal=1 的瀏覽器會帶 traffic_type=internal，
       被 GA4「Internal Traffic」資料篩選器排除；/?internal=0 取消。
       參數讀完立刻從網址列移除，複製網址分享出去也不會帶到。 */
    var psInternal = false;
    try {
      var psQ = new URLSearchParams(location.search).get('internal');
      if (psQ === '1') localStorage.setItem('ps_internal', '1');
      if (psQ === '0') localStorage.removeItem('ps_internal');
      if (psQ !== null) {
        var psU = new URL(location.href);
        psU.searchParams.delete('internal');
        history.replaceState(history.state, '', psU.pathname + psU.search + psU.hash);
      }
      psInternal = localStorage.getItem('ps_internal') === '1';
    } catch (e) {}
    gtag('config', '${GA_ID}', psInternal ? { traffic_type: 'internal' } : {});
  </script>
  <!-- Microsoft Clarity：熱圖與工作階段錄影。只裝在公開頁面，會員中心與後台不裝 -->
  <script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "zbbts8blws");
    /* 開過 /?internal=1 的裝置（psInternal 由上方 GA 區塊判斷）在 Clarity 標成 internal=1，
       看熱圖／錄影時用「自訂標記 internal」篩掉 */
    if (window.psInternal) clarity('set', 'internal', '1');
  </script>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${attr(title)}</title>
  <link rel="icon" type="image/png" href="/images/favicon/favicon-96x96.png" sizes="96x96">
  <link rel="icon" type="image/svg+xml" href="/images/favicon/favicon.svg">
  <link rel="shortcut icon" href="/images/favicon/favicon.ico">
  <link rel="apple-touch-icon" sizes="180x180" href="/images/favicon/apple-touch-icon.png">
  <meta name="apple-mobile-web-app-title" content="${attr(SITE_NAME)}">
  <link rel="manifest" href="/images/favicon/site.webmanifest">
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
  <script type="application/ld+json">${JSON.stringify(ld)}</script>${breadcrumbLdTag}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link
    href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100..900;1,100..900&family=Noto+Sans+TC:wght@300;400;500;700&family=Noto+Serif+TC:wght@400;500;600;700&display=swap"
    rel="stylesheet">
  <link rel="stylesheet" href="/css/main.css">
  <!-- Meta Pixel Code -->
  <script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '1249860667334241');
  fbq('track', 'PageView');
  </script>
  <noscript><img height="1" width="1" style="display:none"
  src="https://www.facebook.com/tr?id=1249860667334241&ev=PageView&noscript=1"
  /></noscript>
  <!-- End Meta Pixel Code -->
</head>

<body data-page="products">

  <div id="site-header"></div>

  <!-- 本頁由 scripts/build-pages.mjs 依 content/products.json 產生，請勿直接編輯 -->
  <main id="product-detail">${detailHTML(products)}</main>

  <div id="site-footer"></div>

  <script src="/js/components.js"></script>
  <script src="/js/main.js"></script>
</body>

</html>
`;
}

/* ---- sitemap ---- */
const STATIC_PAGES = [
  { path: '/', files: ['index.html', 'content/home.json', 'content/home-hero.json', 'content/products.json'] },
  { path: '/about', files: ['about.html', 'content/about-sections.json'] },
  { path: '/products', files: ['products.html', 'content/products.json'] },
  { path: '/faq', files: ['faq.html', 'content/faq.json'] },
  { path: '/contact', files: ['contact.html', 'content/contact-channels.json', 'content/settings-contact.json'] }
];

/* lastmod 取相關檔案最後一次 commit 的日期（Google 只在日期可信時才採用，
   changefreq／priority 已不被採用所以不輸出）。取不到（淺層 clone、非 git 環境）就省略。 */
function lastmodOf(files) {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cs', '--', ...files], { cwd: ROOT, encoding: 'utf8' }).trim();
    return out || null;
  } catch { return null; }
}

function sitemapXML(products) {
  /* /products 原本掛一支綜合介紹影片，2026-11-28 從頁面拿掉，sitemap 也不再宣告 */
  const entries = STATIC_PAGES.concat(
    [{ path: PAGE_PATH, files: ['products/' + PAGE_SLUG + '.html', 'content/products.json'] }]
  );
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + entries.map((e) => '  <url>\n'
      + '    <loc>' + SITE_URL + e.path + '</loc>\n'
      + (lastmodOf(e.files) ? '    <lastmod>' + lastmodOf(e.files) + '</lastmod>\n' : '')
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

const pageProducts = ordered(products);
writeFileSync(join(OUT_DIR, PAGE_SLUG + '.html'), pageHTML(pageProducts));
console.log('  ✓ products/' + PAGE_SLUG + '.html  →  ' + PAGE_PATH + '（' + pageProducts.map((p) => '#' + slugOf(p)).join('、') + '）');

/* 拆頁時代的 v-essence.html／s-essence.html 與 CMS 刪掉的產品頁，殘留會繼續被 Google 收錄，一併清掉
   （舊網址的 301 轉址在 worker/index.js 與 _redirects） */
for (const name of readdirSync(OUT_DIR)) {
  if (!name.endsWith('.html') || name === PAGE_SLUG + '.html') continue;
  rmSync(join(OUT_DIR, name));
  console.log('  ✗ 移除舊產品頁 products/' + name);
}

writeFileSync(join(ROOT, 'sitemap.xml'), sitemapXML(products));
console.log('  ✓ sitemap.xml（' + (STATIC_PAGES.length + 1) + ' 筆）');

/* 預渲染首頁／產品總覽／關於／FAQ 的內文（見 prerender-pages.mjs） */
await import('./prerender-pages.mjs');
