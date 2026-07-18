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
  var style = (p.img ? 'background-image:url(\'' + p.img + '\');background-size:cover;background-position:center;' : '')
    + (mediaH ? 'height:' + mediaH : '');
  var h = style ? (' style="' + style + '"') : '';
  return '<a href="product.html?id=' + p.id + '" class="pcard">'
    + '<div class="media product"' + (p.img ? '' : ' data-mono="' + p.code + '"') + h + '>'
    + (p.hoverImg ? '<div class="media-hover" style="background-image:url(\'' + p.hoverImg + '\')"></div>' : '')
    + (p.hoverTitle ? '<div class="media-cap"><span class="media-cap-t">' + p.hoverTitle + '</span><span class="media-cap-d">' + p.hoverDesc + '</span></div>' : '')
    + '</div>'
    + '<h3 class="h3 mt24">' + p.en + ' ' + p.name + '</h3>'
    + '<p class="body mt8">' + p.tagline + '</p>'
    + '<div class="mt16"><span class="tlink">了解更多 →</span></div>'
    + '</a>';
}

/* 首頁圖文並排：V-essence 文左圖右，S-essence 圖左文右 */
function homeProductRowHTML(p, imageFirst) {
  var media = '<div class="media product" style="background-image:url(\'' + p.img + '\');background-size:cover;background-position:center"></div>';
  var text = '<div>'
    + '<div class="eyebrow">' + p.en + '</div>'
    + '<h3 class="h3 mt12">' + p.name + '</h3>'
    + '<p class="body mt16">' + p.tagline + '</p>'
    + '<div class="mt24"><span class="tlink">了解更多 →</span></div>'
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
    + '<div class="media product" id="product-hero-media" data-mono="' + p.code + '"></div>'
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
  document.title = a.line1 + a.line2 + ' — 沛素 per-sulii';
  setText('article-cat', a.cat);
  setHTML('article-title', a.line1 + '<br>' + a.line2);
  setText('article-date', a.date || '');
  el.innerHTML = (window.marked ? marked.parse(a.body || '') : paragraphs(a.body, 'mt16', 'mt16'));
}

/* ============ 首頁內容 ============ */
function renderHome(data) {
  if (document.body.dataset.page !== 'home') return;
  var h = data.hero;
  initHeroCarousel(h);

  var s = data.science;
  setText('sci-eyebrow', s.eyebrow);
  setText('sci-title', s.title);
  setHTML('sci-lead', nl2br(s.lead));
  
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
  setText('partner-lead', pt.lead);
  var pb = document.getElementById('partner-btn');
  if (pb) { pb.textContent = pt.btn_text; pb.href = pt.btn_link; }
}


/* ---- Hero 輪播 ---- */
function initHeroCarousel(h) {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  var slidesData = (h.images && h.images.length) ? h.images : [];
  if (!slidesData.length) return;
  hero.style.backgroundImage = 'none';
  var slideEls = slidesData.map(function (s, i) {
    var d = document.createElement('div');
    d.className = 'hero-slide' + (i === 0 ? ' active' : '');
    d.style.backgroundImage = "url('" + (s.img || s) + "')";
    hero.insertBefore(d, hero.firstChild);
    return d;
  });
  var cur = 0;
  setHeroText(slidesData[cur]);
  if (slideEls.length < 2) return;
  hero.classList.add('has-swipe');

  function goTo(i) {
    slideEls[cur].classList.remove('active');
    cur = (i + slideEls.length) % slideEls.length;
    slideEls[cur].classList.add('active');
    setHeroText(slidesData[cur]);
  }

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

/* ---- 品牌故事 Tabs ---- */
function initStoryTabs(story) {
  var contentEl = document.getElementById('btabs-content');
  var imgEl = document.getElementById('btabs-img');
  var navEl = document.getElementById('btabs-nav');
  if (!contentEl || !imgEl || !navEl) return;
  var TABS = story.tabs;
  var current = 0;
  if (story.image) imgEl.style.backgroundImage = "url('" + story.image + "')";

  contentEl.className = 'btabs-panels';
  contentEl.innerHTML = TABS.map(function (t, i) {
    return '<div class="btabs-panel' + (i === 0 ? ' active' : '') + '">'
      + '<div class="eyebrow">' + t.en + '</div>'
      + '<h2 class="h2 mt16">' + t.title + '</h2>'
      + paragraphs(t.body, 'mt24', 'mt16')
      + '</div>';
  }).join('');

  var panels = contentEl.querySelectorAll('.btabs-panel');
  imgEl.setAttribute('data-mono', '01');

  navEl.innerHTML = TABS.map(function (t, i) {
    var n = ('0' + (i + 1)).slice(-2);
    return '<button type="button" class="btabs-item' + (i === 0 ? ' active' : '') + '" data-i="' + i + '">'
      + '<span class="bi-num">' + n + '</span>'
      + '<span class="bi-title">' + (t.label || '') + '</span>'
      + '</button>';
  }).join('');

  navEl.querySelectorAll('.btabs-item').forEach(function (btn) {
    function activate() {
      var i = parseInt(btn.dataset.i);
      if (i === current) return;
      current = i;
      panels.forEach(function (p, idx) { p.classList.toggle('active', idx === i); });
      navEl.querySelectorAll('.btabs-item').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      imgEl.setAttribute('data-mono', ('0' + (i + 1)).slice(-2));
    }
    btn.addEventListener('mouseenter', activate);
    btn.addEventListener('click', activate);
  });
}

/* ============ 關於頁 ============ */
function renderAbout(data) {
  if (document.body.dataset.page !== 'about') return;
  data.sections.forEach(function (s, i) {
    var n = i + 1;
    setText('about-eyebrow-' + n, s.eyebrow);
    setHTML('about-title-' + n, nl2br(s.title));
    setHTML('about-body-' + n, paragraphs(s.body, 'mt32', 'mt16').replace(/class="body /g, 'class="body '));
    if (s.image) {
      var img = document.getElementById('about-img-' + n);
      if (img) img.style.backgroundImage = "url('" + s.image + "')";
    }
  });
  setText('team-eyebrow', data.team.eyebrow);
  setText('team-title', data.team.title);
  setText('team-lead', data.team.lead);
  var ti = document.getElementById('team-img');
  if (ti) { ti.src = data.team.image; ti.alt = data.team.image_alt; }

  var faq = document.getElementById('faq-list');
  if (faq) {
    faq.innerHTML = data.faq.map(function (f) {
      return '<div class="faq-item">'
        + '<button type="button" class="faq-q" aria-expanded="false">'
        + '<span>' + f.q + '</span><span class="ic" aria-hidden="true">+</span></button>'
        + '<div class="faq-a"><div class="inner">' + f.a + '</div></div>'
        + '</div>';
    }).join('');
    initFAQ();
  }
}

/* ============ 聯絡頁 ============ */
function renderContact(settings) {
  if (document.body.dataset.page !== 'contact') return;
  var c = settings.contact_page;
  setText('contact-company', c.company);
  setText('contact-phone', c.phone);
  setText('contact-address', c.address);
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

/* ---- 初始化 ---- */
document.addEventListener('DOMContentLoaded', function () {
  initHeroScroll();

  var page = document.body.dataset.page;

  getJSON('content/products.json').then(function (d) { renderProducts(d.items); }).catch(console.error);
  getJSON('content/journal.json').then(function (d) {
    renderJournal(d.items, 3);
    renderArticle(d.items);
  }).catch(console.error);

  if (page === 'home') getJSON('content/home.json').then(renderHome).catch(console.error);
  if (page === 'about') getJSON('content/about.json').then(renderAbout).catch(console.error);
  if (page === 'contact') getJSON('content/settings.json').then(renderContact).catch(console.error);
});
