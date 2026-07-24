/* ============================================================
   main.js — 內容載入與互動邏輯
   所有可編輯內容存於 content/*.json（由 Sveltia CMS 管理）
   ============================================================ */

/* ---- JSON 載入器（含快取） ---- */
var __cache = {};
function getJSON(url) {
  if (!__cache[url]) {
    __cache[url] = fetch(url).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  return __cache[url];
}

/* ---- SEO：meta description / canonical / OG / JSON-LD ----
   網域為暫定值，正式網域確認後全站搜尋取代 https://persulii.com 即可 */
var SITE_URL = 'https://persulii.com';
var SITE_NAME = '沛素 per-sulii';
var DEFAULT_OG_IMAGE = SITE_URL + '/images/hbanner-homebeauty.webp';

function setMetaContent(selector, content) {
  var el = document.querySelector(selector);
  if (el && content != null) el.setAttribute('content', content);
}
function setCanonical(path) {
  var el = document.querySelector('link[rel="canonical"]');
  if (el) el.setAttribute('href', SITE_URL + path);
}
/* 產品／文章詳情頁依實際內容覆寫 title/description/canonical/OG（首次渲染時的靜態值僅供無 JS 環境的後備） */
function setPageMeta(opts) {
  if (opts.description) {
    setMetaContent('meta[name="description"]', opts.description);
    setMetaContent('meta[property="og:description"]', opts.description);
    setMetaContent('meta[name="twitter:description"]', opts.description);
  }
  if (opts.title) {
    setMetaContent('meta[property="og:title"]', opts.title);
    setMetaContent('meta[name="twitter:title"]', opts.title);
  }
  if (opts.path) {
    setCanonical(opts.path);
    setMetaContent('meta[property="og:url"]', SITE_URL + opts.path);
  }
  if (opts.image) {
    setMetaContent('meta[property="og:image"]', opts.image);
    setMetaContent('meta[name="twitter:image"]', opts.image);
  }
}
function injectJSONLD(id, data) {
  var existing = document.getElementById(id);
  if (existing) existing.remove();
  var s = document.createElement('script');
  s.type = 'application/ld+json';
  s.id = id;
  s.textContent = JSON.stringify(data);
  document.head.appendChild(s);
}
function injectOrganizationLD(settings) {
  var f = settings.footer || {};
  var c = settings.contact_page || {};
  injectJSONLD('ld-org', {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    legalName: f.company || c.company,
    url: SITE_URL + '/',
    logo: SITE_URL + '/images/per-sulii-logo-grayscale.webp',
    email: f.email,
    telephone: f.phone,
    address: c.address ? { '@type': 'PostalAddress', streetAddress: c.address, addressCountry: 'TW' } : undefined,
    sameAs: [f.social && f.social.line, f.social && f.social.facebook, f.social && f.social.instagram].filter(Boolean)
  });
}

/* ---- 影片分享按鈕：Web Share API，不支援則複製連結 ---- */
var SHARE_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="M8.1 10.7l7.6-4.3M8.1 13.3l7.6 4.3"/></svg>';
function shareButtonHTML(url, title) {
  return '<div class="video-share-wrap">'
    + '<button type="button" class="btn ghost share-btn" data-share-url="' + url + '" data-share-title="' + (title || '') + '">'
    + SHARE_ICON_SVG + '<span class="share-btn-label">分享</span>'
    + '</button></div>';
}
function initShareButtons() {
  document.querySelectorAll('.share-btn').forEach(function (btn) {
    if (btn.dataset.shareBound) return;
    btn.dataset.shareBound = '1';
    btn.addEventListener('click', function () {
      var url = btn.dataset.shareUrl || window.location.href;
      var title = btn.dataset.shareTitle || document.title;
      if (navigator.share) {
        navigator.share({ title: title, url: url }).catch(function () { });
        return;
      }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () {
          var label = btn.querySelector('.share-btn-label');
          var original = label.textContent;
          label.textContent = '已複製連結';
          setTimeout(function () { label.textContent = original; }, 1800);
        }).catch(function () { });
      }
    });
  });
}

/* 換行字串 → 以 <br> 連接（不允許 HTML 注入以外的內容） */
function nl2br(s) { return (s || '').split('\n').join('<br>'); }
/* 雙換行 → 段落 */
function paragraphs(s, firstClass, restClass) {
  return (s || '').split(/\n{2,}/).map(function (p, i) {
    return '<p class="body ' + (i === 0 ? firstClass : restClass) + '">' + nl2br(p) + '</p>';
  }).join('');
}
function setText(id, v) { var el = document.getElementById(id); if (el && v != null) el.textContent = v; }
function setHTML(id, v) { var el = document.getElementById(id); if (el && v != null) el.innerHTML = v; }

/* ============ 產品 ============ */
function productCardHTML(p, mediaH) {
  var h = mediaH ? (' style="height:' + mediaH + '"') : '';
  var alt = p.en + ' ' + p.name;
  return '<a href="product.html?id=' + p.id + '" class="pcard">'
    + '<div class="media product"' + (p.img ? '' : ' data-mono="' + p.code + '"') + h + '>'
    + (p.img ? '<img class="media-img" src="' + p.img + '" alt="' + alt + '" loading="lazy">' : '')
    + (p.hoverImg ? '<div class="media-hover"><img src="' + p.hoverImg + '" alt="' + alt + ' 特寫" loading="lazy"></div>' : '')
    + (p.hoverTitle ? '<div class="media-cap"><span class="media-cap-t">' + p.hoverTitle + '</span><span class="media-cap-d">' + p.hoverDesc + '</span></div>' : '')
    + '</div>'
    + '<h3 class="h3 mt24">' + p.en + ' ' + p.name + '</h3>'
    + '<p class="body mt8">' + p.tagline + '</p>'
    + '<div class="mt16"><span class="tlink">了解更多 →</span></div>'
    + '</a>';
}

/* 首頁圖文並排：V-essence 文左圖右，S-essence 圖左文右 */
function homeProductRowHTML(p, imageFirst) {
  var img = p.homeImg || p.img;
  var media = '<div class="media product">' + (img ? '<img class="media-img" src="' + img + '" alt="' + p.en + ' ' + p.name + '" loading="lazy">' : '') + '</div>';
  var text = '<div class="pfeature-text">'
    + '<div class="eyebrow">' + p.en + '</div>'
    + '<div class="pfeature-head">'
    + '<div class="pfeature-copy"><h3 class="h2 mt12">' + p.name + '</h3>'
    + '<p class="body mt16">' + p.tagline + '</p></div>'
    + '<div class="mt24 pfeature-more"><span class="tlink">了解更多 →</span></div>'
    + '</div>'
    + '</div>';
  return '<a href="product.html?id=' + p.id + '" class="pfeature">'
    + (imageFirst ? media + text : text + media)
    + '</a>';
}

function renderProducts(PRODUCTS) {
  var home = document.getElementById('home-products');
  if (home) {
    var v = PRODUCTS.find(function (p) { return p.id === 'V-essence'; });
    var s = PRODUCTS.find(function (p) { return p.id === 'S-essence'; });
    var rows = [];
    if (v) rows.push(homeProductRowHTML(v, false));
    if (s) rows.push(homeProductRowHTML(s, true));
    home.innerHTML = rows.join('');
  }
  var list = document.getElementById('product-list');
  if (list) list.innerHTML = PRODUCTS.map(function (p) { return productCardHTML(p); }).join('');
  renderProductDetail(PRODUCTS);
}

function renderProductDetail(PRODUCTS) {
  var container = document.getElementById('product-detail');
  if (!container) return;

  var params = new URLSearchParams(window.location.search);
  var id = params.get('id') || PRODUCTS[0].id;
  var idx = PRODUCTS.findIndex(function (p) { return p.id.toLowerCase() === id.toLowerCase(); });
  if (idx < 0) idx = 0;
  var p = PRODUCTS[idx];
  var next = PRODUCTS[(idx + 1) % PRODUCTS.length];

  /* 關鍵成分：多項成分以「甲 + 乙 ⇨ 丙」流程呈現，說明文字取最後一項成分的描述 */
  var ing = (p.ingredients && p.ingredients.length > 1)
    ? (function () {
      var last = p.ingredients[p.ingredients.length - 1];
      var head = p.ingredients.slice(0, -1).map(function (c) { return c.zh; }).join(' <span class="ingredient-flow-plus">+</span> ');
      return '<div class="ingredient-flow mt24">'
        + '<div class="ingredient-flow-terms">' + head + ' <span class="ingredient-flow-arrow">⇨</span> ' + last.zh + '</div>'
        + '<p class="ingredient-flow-caption mt8">' + last.desc + '</p>'
        + '</div>';
    })()
    : p.ingredients.map(function (c, i) {
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

  /* 產品特色：有功效資料時以功效卡呈現（左側預留縮圖），否則沿用單段文字；有影片時功效文字置左、影片置右 */
  var ZH_NUM = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六' };
  var benefitsHTML = (p.benefits && p.benefits.length)
    ? '<h2 class="h3">' + (ZH_NUM[p.benefits.length] || p.benefits.length) + '大保養功效</h2><div class="benefits-row' + (p.benefits.length === 3 ? ' cols-3' : '') + ' mt32">'
    + p.benefits.map(function (b) {
      return '<div class="benefit-item">'
        + '<div class="benefit-thumb"' + (b.img ? ' style="background-image:url(\'' + b.img + '\');background-size:cover;background-position:center"' : '') + '></div>'
        + '<div><h3 class="h3" style="font-size:20px">' + b.title + '</h3>'
        + '<p class="small mt8">' + nl2br(b.body) + '</p></div></div>';
    }).join('') + '</div>'
    : '<h2 class="h3">產品特色</h2><p class="body mt16">' + p.feature + '</p>';

  var featureSection = p.videoId
    ? '<div class="benefits-layout"><div>' + benefitsHTML + '</div>'
    + '<div class="benefit-video"><div class="video-frame"><iframe src="https://www.youtube.com/embed/' + p.videoId + '" title="' + p.en + ' 介紹影片" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div>'
    + shareButtonHTML(SITE_URL + '/product.html?id=' + p.id, p.en + ' ' + p.name) + '</div>'
    + '</div>'
    : benefitsHTML;

  /* 適用族群／使用方式 左右並排 */
  var audienceUsageSection = (p.audience && p.audience.length)
    ? '<section class="sec tight" style="background:var(--bg)"><div class="wrap grid g2">'
    + '<div><h2 class="h3">適用族群</h2>'
    + '<ul class="checklist mt24">' + p.audience.map(function (a) { return '<li>' + a + '</li>'; }).join('') + '</ul>'
    + '</div>'
    + '<div><h2 class="h3">使用方式</h2>'
    + (p.usageTitle ? '<p class="body mt16">' + p.usageTitle + '</p>' : '')
    + use + '</div>'
    + '</div></section>'
    : '<section class="sec tight"><div class="wrap"><h2 class="h3">使用方式</h2>'
    + (p.usageTitle ? '<p class="body mt16">' + p.usageTitle + '</p>' : '')
    + use + '</div></section>';

  var reminderSection = p.reminder
    ? '<section class="sec tight"><div class="wrap"><h2 class="h3">注意事項</h2>'
    + '<ul class="checklist dot mt16">' + p.reminder.split(/\n{2,}/).map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>'
    + '</div></section>'
    : '';

  var certSection = (p.certifications && p.certifications.length)
    ? '<p class="body mt16">品質認證：</p><ul class="checklist mt8">'
    + p.certifications.map(function (c) { return '<li>' + c + '</li>'; }).join('') + '</ul>'
    : '<p class="body mt8">品質認證：' + p.specs.cert + '</p>';

  var inciSection = p.specs.inciList
    ? '<p class="body mt8">成分標示：</p>'
    + '<p class="body mt16" style="font-weight:500">' + p.specs.inciTitle + '</p>'
    + '<p class="small mt8">' + p.specs.inciList + '</p>'
    + (p.specs.inciNote ? '<p class="small mt8">' + p.specs.inciNote + '</p>' : '')
    : '<p class="body mt8">成分標示：' + p.specs.inci + '</p>';

  var bottleSection = p.bottleInfo
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

  /* 規格與認證：已有產品資訊表格時，容量／成分標示改列於該處，這裡只留品質認證 */
  var specsSection = p.bottleInfo
    ? '<section class="sec tight" style="background:var(--bg)"><div class="wrap"><h2 class="h3">規格與認證</h2>'
    + certSection
    + '</div></section>'
    : '<section class="sec tight" style="background:var(--bg)"><div class="wrap"><h2 class="h3">規格與認證</h2>'
    + '<p class="body mt16">容量 / 規格：' + p.specs.size + '</p>'
    + inciSection
    + certSection
    + '</div></section>';

  var pageTitle = p.en + ' ' + p.name + ' — ' + SITE_NAME;
  document.title = pageTitle;

  var ogImage = p.banner ? (SITE_URL + '/' + p.banner) : DEFAULT_OG_IMAGE;
  var taglineText = (p.tagline || '').replace(/<br\s*\/?>/gi, ' ');
  var metaDesc = taglineText + (p.intro ? ' ' + p.intro : '');
  if (metaDesc.length > 120) metaDesc = metaDesc.slice(0, 117) + '...';
  setPageMeta({
    title: pageTitle,
    description: metaDesc,
    path: '/product.html?id=' + p.id,
    image: ogImage
  });
  injectJSONLD('ld-product', {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.en + ' ' + p.name,
    description: metaDesc,
    image: ogImage,
    brand: { '@type': 'Brand', name: 'per-sulii 沛素' },
    url: SITE_URL + '/product.html?id=' + p.id
  });

  container.innerHTML =
    '<div class="wrap"><div class="crumb"><a href="index.html">首頁</a> / <a href="products.html">產品</a> / ' + p.en + ' ' + p.name + '</div></div>'
    + (p.banner ? '<div class="pbanner-wrap"><img class="pbanner" src="' + p.banner + '" alt="' + p.en + ' ' + p.name + '"></div>' : '')
    + '<section class="sec tight"><div class="wrap split" style="align-items:flex-start">'
    + '<div class="media product" id="product-hero-media"' + (p.heroImg ? '' : ' data-mono="' + p.code + '"') + '>'
    + (p.heroImg ? '<img class="media-img" src="' + p.heroImg + '" alt="' + p.en + ' ' + p.name + '">' : '')
    + '</div>'
    + '<div><div class="eyebrow">' + p.en + '</div>'
    + '<h1 class="h2 mt12">' + p.name + '</h1>'
    + '<p class="lead mt16">' + p.tagline + '</p>'
    + '<p class="body">' + p.intro + '</p>'
    + (p.highlights && p.highlights.length ? '<div class="chips mt24">' + p.highlights.map(function (h) { return '<span class="chip">' + h + '</span>'; }).join('') + '</div>' : '')
    + '</div>'
    + '</div></section>'
    + '<section class="sec tight" id="product-feature-sec" style="background:var(--bg)"><div class="wrap">' + featureSection + '</div></section>'
    + '<section class="sec tight"><div class="wrap"><h2 class="h3">關鍵成分</h2>' + ing + '</div></section>'
    + audienceUsageSection
    + reminderSection
    + specsSection
    + bottleSection
    + '<section class="sec tight"><div class="wrap">'
    + '<div class="pn mt56">'
    + '<a href="products.html" class="pn-i"><div class="eyebrow">← 回到產品頁</div></a>'
    + '<a href="product.html?id=' + next.id + '" class="pn-i" style="text-align:right"><div class="eyebrow">下一個商品 →</div><div class="nm">' + next.en + ' ' + next.name + '</div></a>'
    + '</div></div></section>';

  initShareButtons();
}

/* ============ 專欄 ============ */
function journalCardHTML(a) {
  return '<a href="article.html?slug=' + encodeURIComponent(a.slug) + '" class="jcard">'
    + '<div class="media jcard-title"><span class="jcard-cat">' + a.cat + '</span><span>' + a.line1 + '</span><span>' + a.line2 + '</span></div>'
    + '</a>';
}

function renderJournal(ARTICLES, homeCount) {
  var sorted = ARTICLES.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
  var home = document.getElementById('home-journal');
  if (home) {
    var picks = sorted.filter(function (a) { return a.home; });
    if (!picks.length) picks = sorted;
    home.innerHTML = picks.slice(0, homeCount || 3).map(journalCardHTML).join('');
  }
  var list = document.getElementById('journal-list');
  if (list) list.innerHTML = sorted.map(journalCardHTML).join('');
}

function renderArticle(ARTICLES) {
  var el = document.getElementById('article-body');
  if (!el) return;
  var slug = new URLSearchParams(window.location.search).get('slug');
  var a = ARTICLES.find(function (x) { return x.slug === slug; }) || ARTICLES[0];
  var title = a.line1 + a.line2;
  var pageTitle = title + ' — ' + SITE_NAME;
  document.title = pageTitle;
  setText('article-cat', a.cat);
  setHTML('article-title', a.line1 + '<br>' + a.line2);
  setText('article-date', a.date || '');
  el.innerHTML = (window.marked ? marked.parse(a.body || '') : paragraphs(a.body, 'mt16', 'mt16'));

  var plain = (a.body || '').replace(/[#*_`>\[\]()-]/g, '').replace(/\s+/g, ' ').trim();
  var metaDesc = plain ? (plain.length > 120 ? plain.slice(0, 117) + '...' : plain) : (a.cat + '｜' + title);
  var path = '/article.html?slug=' + encodeURIComponent(a.slug);
  setPageMeta({ title: pageTitle, description: metaDesc, path: path, image: DEFAULT_OG_IMAGE });
  injectJSONLD('ld-article', {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: metaDesc,
    datePublished: a.date,
    author: { '@type': 'Organization', name: SITE_NAME },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: SITE_URL + '/images/per-sulii-logo-grayscale.webp' }
    },
    mainEntityOfPage: SITE_URL + path
  });
}

/* ============ 首頁內容 ============ */
function renderHome(data) {
  if (document.body.dataset.page !== 'home') return;
  var s = data.science;
  setText('sci-title', s.title);

  var mb = document.getElementById('sci-more-btn');
  if (mb) {
    if (s.btn_text) mb.textContent = s.btn_text;
    if (s.btn_link) mb.href = s.btn_link;
  }

  var simg = document.getElementById('sci-image');
  if (simg && s.image) {
    simg.src = s.image;
  }

  setText('prods-eyebrow', data.products_section.eyebrow);
  setText('prods-title', data.products_section.title);

  var pt = data.partner;
  setText('partner-eyebrow', pt.eyebrow);
  setText('partner-title', pt.title);
  setHTML('partner-lead', pt.lead);
  var pb = document.getElementById('partner-btn');
  if (pb) { pb.textContent = pt.btn_text; pb.href = pt.btn_link; }
}


/* ---- Hero 輪播 ---- */
function initHeroCarousel(h) {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  var slidesData = (h.images && h.images.length) ? h.images : [];
  if (!slidesData.length) return;
  var fallbackImg = hero.querySelector('.hero-fallback-img');
  if (fallbackImg) fallbackImg.style.display = 'none';
  var slideEls = slidesData.map(function (s, i) {
    var d = document.createElement('div');
    d.className = 'hero-slide' + (i === 0 ? ' active' : '');
    var img = document.createElement('img');
    img.className = 'hero-slide-img';
    img.src = (s.img || s);
    img.alt = s.eyebrow || (s.title ? s.title.replace(/\n/g, ' ') : '') || '沛素 per-sulii';
    img.loading = i === 0 ? 'eager' : 'lazy';
    d.appendChild(img);
    hero.insertBefore(d, hero.firstChild);
    return d;
  });
  var cur = 0;
  setHeroText(slidesData[cur]);
  if (slideEls.length < 2) return;
  hero.classList.add('has-swipe');

  var dotsWrap = document.getElementById('hero-dots');
  var dotEls = [];
  if (dotsWrap) {
    dotsWrap.innerHTML = slidesData.map(function (s, i) {
      return '<button type="button" class="hero-dot' + (i === 0 ? ' active' : '') + '" data-i="' + i + '" aria-label="第 ' + (i + 1) + ' / ' + slidesData.length + ' 張"></button>';
    }).join('');
    dotEls = Array.prototype.slice.call(dotsWrap.querySelectorAll('.hero-dot'));
    dotEls.forEach(function (d) {
      d.addEventListener('click', function () {
        goTo(parseInt(d.dataset.i));
        startAuto();
      });
    });
  }

  function goTo(i) {
    slideEls[cur].classList.remove('active');
    if (dotEls[cur]) dotEls[cur].classList.remove('active');
    cur = (i + slideEls.length) % slideEls.length;
    slideEls[cur].classList.add('active');
    if (dotEls[cur]) dotEls[cur].classList.add('active');
    setHeroText(slidesData[cur]);
  }

  var prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'hero-arrow prev';
  prevBtn.setAttribute('aria-label', '上一張');
  prevBtn.innerHTML = '<img src="images/icon/left-chevron.svg" alt="">';
  prevBtn.addEventListener('click', function () { goTo(cur - 1); startAuto(); });
  hero.appendChild(prevBtn);

  var nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'hero-arrow next';
  nextBtn.setAttribute('aria-label', '下一張');
  nextBtn.innerHTML = '<img src="images/icon/right-arrow.svg" alt="">';
  nextBtn.addEventListener('click', function () { goTo(cur + 1); startAuto(); });
  hero.appendChild(nextBtn);

  var sec = Math.max(2, parseFloat(h.interval) || 5);
  var timer = null;
  function startAuto() {
    clearInterval(timer);
    timer = setInterval(function () { goTo(cur + 1); }, sec * 1000);
  }
  startAuto();

  /* 左右滑動切換（滑鼠拖曳／觸控滑動皆適用） */
  var startX = 0, startY = 0, dragging = false;
  hero.addEventListener('pointerdown', function (e) {
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
  });
  hero.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    if (Math.abs(e.clientX - startX) > Math.abs(e.clientY - startY)) e.preventDefault();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (evt) {
    hero.addEventListener(evt, function (e) {
      if (!dragging) return;
      dragging = false;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        goTo(cur + (dx < 0 ? 1 : -1));
        startAuto();
      }
    });
  });
}

/* 依當前輪播圖片顯示對應文字，未填寫的欄位則隱藏 */
function setHeroText(s) {
  s = s || {};
  setTextOrHide('hero-eyebrow', s.eyebrow);
  var titleEl = document.getElementById('hero-title');
  if (titleEl) {
    if (s.title) { titleEl.innerHTML = nl2br(s.title); titleEl.style.display = ''; }
    else { titleEl.style.display = 'none'; }
  }
  setTextOrHide('hero-lead', s.lead);
  var b1 = document.getElementById('hero-btn1'), b2 = document.getElementById('hero-btn2');
  if (b1) {
    if (s.btn1_text) { b1.textContent = s.btn1_text; b1.href = s.btn1_link || '#'; b1.style.display = ''; }
    else { b1.style.display = 'none'; }
  }
  if (b2) {
    if (s.btn2_text) { b2.textContent = s.btn2_text; b2.href = s.btn2_link || '#'; b2.style.display = ''; }
    else { b2.style.display = 'none'; }
  }
  var btnWrap = document.getElementById('hero-btns');
  if (btnWrap) btnWrap.style.display = (s.btn1_text || s.btn2_text) ? '' : 'none';
}

function setTextOrHide(id, text) {
  var el = document.getElementById(id);
  if (!el) return;
  if (text) { el.textContent = text; el.style.display = ''; }
  else { el.style.display = 'none'; }
}

/* ============ 關於頁 ============ */
function renderAbout(data) {
  if (document.body.dataset.page !== 'about') return;
  data.sections.forEach(function (s, i) {
    var n = i + 1;
    setText('about-eyebrow-' + n, s.eyebrow);
    setHTML('about-title-' + n, nl2br(s.title));
    setHTML('about-body-' + n, paragraphs(s.body, 'mt16', 'mt16').replace(/class="body /g, 'class="body '));
    if (s.image) {
      var img = document.getElementById('about-img-' + n);
      if (img) img.style.backgroundImage = "url('" + s.image + "')";
    }
  });
}

/* ============ 聯絡頁 ============ */
function renderContact(settings) {
  if (document.body.dataset.page !== 'contact') return;
  var c = settings.contact_page;
  setText('contact-company', c.company);
  setText('contact-phone', c.phone);
  setText('contact-address', c.address);
}

/* 經銷洽詢表單：送出至 Web3Forms，轉寄到信箱 */
function initContactForm() {
  var form = document.getElementById('contact-form');
  if (!form) return;
  var btn = document.getElementById('contact-submit-btn');
  var status = document.getElementById('contact-form-status');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    btn.disabled = true;
    btn.textContent = '送出中...';
    status.style.display = 'none';

    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.success) {
          form.reset();
          status.textContent = '已送出，我們會盡快與您聯繫。';
        } else {
          status.textContent = '送出失敗，請稍後再試一次。';
        }
        status.style.display = '';
      })
      .catch(function () {
        status.textContent = '送出失敗，請稍後再試一次。';
        status.style.display = '';
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = '送出洽詢';
      });
  });
}

/* ---- Hero 捲動漸變 ---- */
function initHeroScroll() {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  var ticking = false;
  function update() {
    var p = Math.min(Math.max(window.scrollY / 300, 0), 1);
    hero.style.setProperty('--hero-p', p);
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
}

/* ---- 標題捲動載入動畫（含日後動態插入的標題） ---- */
function initScrollReveal() {
  var SELECTOR = 'h1, h2, h3';

  function reveal(el) { el.classList.add('in-view'); }

  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll(SELECTOR).forEach(reveal);
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        reveal(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });

  function observe(el) {
    if (el.dataset.revealBound) return;
    el.dataset.revealBound = '1';
    io.observe(el);
  }

  document.querySelectorAll(SELECTOR).forEach(observe);

  var mo = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches(SELECTOR)) observe(node);
        if (node.querySelectorAll) node.querySelectorAll(SELECTOR).forEach(observe);
      });
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

/* ---- 初始化 ---- */
document.addEventListener('DOMContentLoaded', function () {
  initScrollReveal();
  initHeroScroll();
  initShareButtons();
  initContactForm();

  var page = document.body.dataset.page;

  Promise.all([getJSON('content/settings-footer.json'), getJSON('content/settings-contact.json')])
    .then(function (r) { injectOrganizationLD(Object.assign({}, r[0], r[1])); })
    .catch(console.error);
  getJSON('content/products.json').then(function (d) { renderProducts(d.items); }).catch(console.error);
  getJSON('content/journal.json').then(function (d) {
    renderJournal(d.items, 3);
    renderArticle(d.items);
  }).catch(console.error);

  if (page === 'home') {
    getJSON('content/home.json').then(renderHome).catch(console.error);
    getJSON('content/home-hero.json').then(initHeroCarousel).catch(console.error);
  }
  if (page === 'about') getJSON('content/about-sections.json').then(renderAbout).catch(console.error);
  if (page === 'contact') getJSON('content/settings-contact.json').then(renderContact).catch(console.error);
});
