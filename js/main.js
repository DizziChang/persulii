/* ============================================================
   main.js — 共用資料與互動邏輯
   ============================================================ */

/* ---- 產品資料 ---- */
var PRODUCTS = [
  {
    id: 's-essence', code: 'S', en: 'S-essence', name: '外泌體多胜肽修護精華',
    tagline: '每日簡單保養，維持肌膚穩定狀態。',
    intro: '以小分子多胜肽搭配外泌體技術，溫和支持肌膚日常修護，幫助維持穩定、水嫩的健康狀態。',
    feature: '專為亞洲肌膚設計的修護配方，溫和不刺激，適合每日使用。以科研精神精密萃取，兼顧穩定性與吸收效率。',
    ingredients: [
      { en: 'Exosome',         zh: '外泌體',   desc: '支持肌膚的修護訊號，幫助維持穩定狀態。' },
      { en: 'Peptides',        zh: '多胜肽',   desc: '小分子設計，溫和滲透，支持肌膚日常保養。' },
      { en: 'Micro Extraction',zh: '小分子萃取',desc: '精密萃取技術，兼顧穩定性與吸收效率。' }
    ],
    usage: ['潔顏後取適量於掌心', '均勻塗抹全臉', '輕拍至吸收', '接續後續保養'],
    specs: { size: '——', inci: '依國際 INCI 命名系統', cert: 'TFDA PIF ｜ INCI ｜ GMP' }
  },
  {
    id: 'v-essence', code: 'V', en: 'V-essence', name: '精萃蜂胜肽 PLUS 精華',
    tagline: '淡化紋路，緊緻肌膚，鎖住青春肌密。',
    intro: '以蜂胜肽搭配多重胜肽複方，集中支持肌膚緊緻與彈性，幫助淡化細紋、維持青春光澤。',
    feature: '針對熟齡與彈性流失設計的精華配方，質地清爽好吸收，溫和不刺激，適合每日早晚使用。',
    ingredients: [
      { en: 'Bee Peptide',     zh: '蜂胜肽',   desc: '支持肌膚緊緻與彈性，幫助維持飽滿狀態。' },
      { en: 'Multi-Peptides',  zh: '多重胜肽', desc: '複方協同，集中支持紋路與輪廓的日常保養。' },
      { en: 'Micro Extraction',zh: '小分子萃取',desc: '精密萃取技術，兼顧穩定性與吸收效率。' }
    ],
    usage: ['潔顏後取適量於掌心', '由內而外均勻按摩全臉', '加強塗抹於紋路處', '輕拍至吸收後接續保養'],
    specs: { size: '——', inci: '依國際 INCI 命名系統', cert: 'TFDA PIF ｜ INCI ｜ GMP' }
  }
];

/* ---- 取得產品 ---- */
function productById(id) {
  for (var i = 0; i < PRODUCTS.length; i++) {
    if (PRODUCTS[i].id === id) return PRODUCTS[i];
  }
  return PRODUCTS[0];
}

/* ---- 產品卡片 HTML ---- */
function productCardHTML(p, mediaH) {
  var h = mediaH ? (' style="height:' + mediaH + '"') : '';
  return '<a href="product.html?id=' + p.id + '" class="pcard">'
    + '<div class="media product" data-mono="' + p.code + '"' + h + '></div>'
    + '<h3 class="h3 mt24">' + p.en + ' ' + p.name + '</h3>'
    + '<p class="body mt8">' + p.tagline + '</p>'
    + '<div class="mt16"><span class="tlink">了解更多 →</span></div>'
    + '</a>';
}

/* ---- 渲染首頁產品列表 ---- */
function renderHomeProducts() {
  var el = document.getElementById('home-products');
  if (!el) return;
  el.innerHTML = PRODUCTS.map(function (p) { return productCardHTML(p); }).join('');
}

/* ---- 渲染產品列表頁 ---- */
function renderProductList() {
  var el = document.getElementById('product-list');
  if (!el) return;
  el.innerHTML = PRODUCTS.map(function (p) {
    return productCardHTML(p, 'clamp(360px,40vw,480px)');
  }).join('');
}

/* ---- 渲染產品詳細頁 ---- */
function renderProductDetail() {
  var container = document.getElementById('product-detail');
  if (!container) return;

  var params = new URLSearchParams(window.location.search);
  var id = params.get('id') || PRODUCTS[0].id;
  var idx = PRODUCTS.findIndex(function (p) { return p.id === id; });
  if (idx < 0) idx = 0;
  var p    = PRODUCTS[idx];
  var prev = PRODUCTS[(idx - 1 + PRODUCTS.length) % PRODUCTS.length];
  var next = PRODUCTS[(idx + 1) % PRODUCTS.length];

  var ing = p.ingredients.map(function (c, i) {
    return (i > 0 ? '<hr class="divider mt24">' : '')
      + '<div class="mt24"><div class="eyebrow">' + c.en + '</div>'
      + '<h3 class="h3 mt8" style="font-size:20px">' + c.zh + '</h3>'
      + '<p class="body mt8">' + c.desc + '</p></div>';
  }).join('');

  var use = p.usage.map(function (s, i) {
    var n = ('0' + (i + 1)).slice(-2);
    return '<p class="body ' + (i === 0 ? 'mt16' : 'mt8') + '">'
      + '<span class="num">' + n + '</span>　' + s + '</p>';
  }).join('');

  document.title = p.en + ' ' + p.name + ' — 沛素 per-sulii';

  container.innerHTML =
    '<div class="wrap"><div class="crumb"><a href="index.html">首頁</a> / <a href="products.html">產品</a> / ' + p.en + ' ' + p.name + '</div></div>'
    + '<section class="sec tight"><div class="wrap split" style="align-items:flex-start">'
    + '<div class="media product" id="product-hero-media" data-mono="' + p.code + '" style="height:clamp(360px,46vw,540px)"></div>'
    + '<div><div class="eyebrow">' + p.en + '</div>'
    + '<h1 class="h2 mt12">' + p.name + '</h1>'
    + '<p class="lead mt16">' + p.tagline + '</p>'
    + '<p class="body mt16">' + p.intro + '</p></div>'
    + '</div></section>'
    + '<section class="sec tight" style="background:var(--bg)"><div class="wrap maxw">'
    + '<h2 class="h3">產品特色</h2><p class="body mt16">' + p.feature + '</p></div></section>'
    + '<section class="sec tight"><div class="wrap maxw"><h2 class="h3">關鍵成分</h2>' + ing + '</div></section>'
    + '<section class="sec tight" style="background:var(--bg)"><div class="wrap maxw"><h2 class="h3">使用方式</h2>' + use + '</div></section>'
    + '<section class="sec tight"><div class="wrap maxw"><h2 class="h3">規格與認證</h2>'
    + '<p class="body mt16">容量 / 規格：' + p.specs.size + '</p>'
    + '<p class="body mt8">成分標示：' + p.specs.inci + '</p>'
    + '<p class="body mt8">品質認證：' + p.specs.cert + '</p>'
    + '<div class="pn mt56">'
    + '<a href="product.html?id=' + prev.id + '" class="pn-i"><div class="eyebrow">← 上一個商品</div><div class="nm">' + prev.en + ' ' + prev.name + '</div></a>'
    + '<a href="product.html?id=' + next.id + '" class="pn-i" style="text-align:right"><div class="eyebrow">下一個商品 →</div><div class="nm">' + next.en + ' ' + next.name + '</div></a>'
    + '</div></div></section>';
}

/* ---- FAQ accordion ---- */
function initFAQ() {
  document.querySelectorAll('.faq-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var open = this.parentElement.classList.toggle('open');
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
}

/* ---- 初始化 ---- */
document.addEventListener('DOMContentLoaded', function () {
  renderHomeProducts();
  renderProductList();
  renderProductDetail();
  initFAQ();
});
