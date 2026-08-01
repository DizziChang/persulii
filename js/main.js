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

/* ---- SEO：JSON-LD ---- */
var SITE_URL = 'https://persulii.com.tw';
var SITE_NAME = '沛素 per-sulii';

/* CMS 存出來的圖片路徑有 "images/x.webp" 也有 "/images/x.webp"，
   在 /products/<slug> 這種子目錄頁面上相對路徑會解析錯，統一補成根絕對路徑 */
function asset(p) {
  if (!p) return p;
  return /^(https?:)?\/\//.test(p) ? p : '/' + String(p).replace(/^\/+/, '');
}

/* 產品詳細頁的網址（實體頁由 scripts/build-pages.mjs 於建置時產生） */
function productPath(p) { return '/products/' + String(p.id).toLowerCase(); }

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

/* ---- 影片分享按鈕：Web Share API，不支援則複製連結（事件委派，涵蓋動態產生的按鈕） ---- */
function shareToggleHTML(url, title) {
  return '<button type="button" class="share-toggle share-btn" aria-label="分享"'
    + ' data-share-url="' + url + '" data-share-title="' + (title || '') + '">'
    + '<img src="/images/icon/social-media-w.webp" alt="">'
    + '</button>';
}
function initShareButtons() {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.share-btn');
    if (!btn) return;
    var url = btn.dataset.shareUrl || window.location.href;
    var title = btn.dataset.shareTitle || document.title;
    /* 影片控制列上的分享鍵：直接開新分頁到 YouTube，讓使用者用 YouTube 自己的分享視窗 */
    if (btn.classList.contains('share-toggle')) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () { });
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        var label = btn.querySelector('.share-btn-label');
        if (!label) return;
        var original = label.textContent;
        label.textContent = '已複製連結';
        setTimeout(function () { label.textContent = original; }, 1800);
      }).catch(function () { });
    }
  });
}

/* 影片靜音/開聲音切換：直接控制 <video> 元素，事件委派以涵蓋動態產生的影片 */
function setVideoMuted(btn, muted) {
  var wrap = btn.closest('.video-frame, .pfeature-video');
  var video = wrap && wrap.querySelector('video');
  if (!video) return;
  video.muted = muted;
  btn.classList.toggle('is-on', !muted);
  btn.setAttribute('aria-pressed', muted ? 'false' : 'true');
  btn.setAttribute('aria-label', muted ? '開啟聲音' : '關閉聲音');
}

/* 同一時間只讓一支影片有聲音，開啟這支之前先關掉其他正在發聲的影片 */
function muteOtherVideos(exceptBtn) {
  document.querySelectorAll('.sound-toggle.is-on').forEach(function (other) {
    if (other !== exceptBtn) setVideoMuted(other, true);
  });
}

function initSoundToggles() {
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.sound-toggle');
    if (!btn) return;
    var isOn = btn.classList.contains('is-on');
    if (!isOn) muteOtherVideos(btn);
    setVideoMuted(btn, isOn);
  });
}

/* 影片播放/暫停切換：直接控制 <video> 元素（影片預設自動播放中）
   .play-hit-area 是蓋在畫面正中央的大範圍點擊區，跟小按鈕共用同一組狀態 */
function initPlayToggles() {
  document.addEventListener('click', function (e) {
    var target = e.target.closest('.play-toggle, .play-hit-area');
    if (!target) return;
    var wrap = target.closest('.video-frame, .pfeature-video');
    var btn = wrap && wrap.querySelector('.play-toggle');
    var video = wrap && wrap.querySelector('video');
    if (!btn || !video) return;
    var isPaused = btn.classList.toggle('is-paused');
    if (isPaused) video.pause(); else video.play();
    btn.setAttribute('aria-pressed', isPaused ? 'true' : 'false');
    btn.setAttribute('aria-label', isPaused ? '播放' : '暫停');
    wrap.classList.toggle('is-playing', !isPaused);

    /* 按下播放時，自動開啟這支影片的聲音（並靜音其他影片） */
    if (!isPaused) {
      var soundBtn = wrap.querySelector('.sound-toggle');
      if (soundBtn) {
        muteOtherVideos(soundBtn);
        setVideoMuted(soundBtn, false);
      }
    }
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
function productCardHTML(p, mediaH, imgOverride, ctaText) {
  var h = mediaH ? (' style="height:' + mediaH + '"') : '';
  var img = imgOverride || p.img;
  var alt = p.en + ' ' + p.name;
  var cta = ctaText
    ? '<span class="btn ghost">' + ctaText + '</span>'
    : '<span class="tlink">了解更多 →</span>';
  return '<a href="' + productPath(p) + '" class="pcard">'
    + '<div class="media product"' + (img ? '' : ' data-mono="' + p.code + '"') + h + '>'
    + (img ? '<img class="media-img" src="' + asset(img) + '" alt="' + alt + '" loading="lazy">' : '')
    + (p.hoverImg ? '<div class="media-hover"><img src="' + asset(p.hoverImg) + '" alt="' + alt + ' 特寫" loading="lazy"></div>' : '')
    + (p.hoverTitle ? '<div class="media-cap"><span class="media-cap-t">' + p.hoverTitle + '</span><span class="media-cap-d">' + p.hoverDesc + '</span></div>' : '')
    + '</div>'
    + '<h3 class="h3 mt24">' + p.en + ' ' + p.name + '</h3>'
    + '<p class="body mt8">' + p.tagline + '</p>'
    + '<div class="mt16">' + cta + '</div>'
    + '</a>';
}

/* 影片靜音/開聲音切換按鈕 */
var SOUND_TOGGLE_HTML = '<button type="button" class="sound-toggle" aria-label="開啟聲音" aria-pressed="false">'
  + '<svg class="icon-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M16.5 8.5l5 7M21.5 8.5l-5 7"/></svg>'
  + '<svg class="icon-unmuted" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 5V4L8 9H4z"/><path d="M16 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>'
  + '</button>';

/* 自訂播放/暫停按鈕（取代被 controls=0 關掉的原生控制列） */
var PLAY_TOGGLE_HTML = '<button type="button" class="play-toggle" aria-label="暫停" aria-pressed="false">'
  + '<svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'
  + '<svg class="icon-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
  + '</button>';

/* 播放/暫停的大範圍點擊區，涵蓋畫面正中央 70% */
var PLAY_HIT_AREA_HTML = '<div class="play-hit-area" aria-hidden="true"></div>';

/* 首頁產品短影片：本機影片檔，自動播放、靜音、循環；分享鍵整合在影片控制列裡，連到 YouTube */
function productVideoHTML(p) {
  if (!p.videoId) return '';
  var src = '/video/persulii-' + String(p.code).toLowerCase() + '-intro.mp4';
  return '<div class="media pfeature-video is-playing">'
    + '<video class="video-el" src="' + src + '" autoplay muted loop playsinline preload="auto"></video>'
    + PLAY_HIT_AREA_HTML
    + PLAY_TOGGLE_HTML
    + SOUND_TOGGLE_HTML
    + shareToggleHTML('https://youtu.be/' + p.videoId, p.en + ' ' + p.name + ' 短影片')
    + '</div>';
}

/* 首頁產品卡按鈕文案（取代通用的「了解更多」） */
var HOME_PRODUCT_CTA = {
  'V-essence': '我要淡化細紋 →',
  'S-essence': '我要細緻肌膚 →'
};

/* 首頁圖文並排：短影片一律在左、產品卡在右 */
var HOME_PRODUCT_ROW_CLASS = {
  'V-essence': 'pfeature-row-v',
  'S-essence': 'pfeature-row-s'
};

function homeProductRowHTML(p, videoFirst) {
  var card = productCardHTML(p, null, p.homeImg || p.img, HOME_PRODUCT_CTA[p.id]);
  var video = productVideoHTML(p);
  var rowClass = 'pfeature-row' + (HOME_PRODUCT_ROW_CLASS[p.id] ? ' ' + HOME_PRODUCT_ROW_CLASS[p.id] : '');
  return '<div class="' + rowClass + '">'
    + (videoFirst ? video + card : card + video)
    + '</div>';
}

function renderProducts(PRODUCTS) {
  var home = document.getElementById('home-products');
  if (home) {
    var v = PRODUCTS.find(function (p) { return p.id === 'V-essence'; });
    var s = PRODUCTS.find(function (p) { return p.id === 'S-essence'; });
    var rows = [];
    if (v) rows.push(homeProductRowHTML(v, true));
    if (s) rows.push(homeProductRowHTML(s, true));
    home.innerHTML = rows.join('');
  }
  var list = document.getElementById('product-list');
  if (list) list.innerHTML = PRODUCTS.map(function (p) { return productCardHTML(p, null, null, HOME_PRODUCT_CTA[p.id]); }).join('');
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
    simg.src = asset(s.image);
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
    img.src = asset(s.img || s);
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
  prevBtn.innerHTML = '<img src="/images/icon/left-chevron.svg" alt="">';
  prevBtn.addEventListener('click', function () { goTo(cur - 1); startAuto(); });
  hero.appendChild(prevBtn);

  var nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'hero-arrow next';
  nextBtn.setAttribute('aria-label', '下一張');
  nextBtn.innerHTML = '<img src="/images/icon/right-arrow.svg" alt="">';
  nextBtn.addEventListener('click', function () { goTo(cur + 1); startAuto(); });
  hero.appendChild(nextBtn);

  var sec = Math.max(2, parseFloat(h.interval) || 2.5);
  var timer = null;
  function startAuto() {
    clearInterval(timer);
    timer = setInterval(function () { goTo(cur + 1); }, sec * 1000);
  }
  startAuto();

  /* 左右滑動切換（滑鼠拖曳／觸控滑動皆適用）
     圖片會跟著手指移動，拖曳超過門檻才換下一張，否則彈回原位 
     
     要調手感的話，在 main.js:429 附近：
    DRAG_RATIO = 0.22 — 調大變得更難換頁，調小更靈敏
    DRAG_MIN = 60 — 最少拖曳距離（小螢幕才會生效）
    SETTLE_MS = 450 — 放開後的動畫時間，要跟 main.css 的 .hero.settling .hero-slide 一起改
  */
  var DRAG_RATIO = 0.25;   // 需拖曳超過輪播寬度的比例
  var DRAG_MIN = 80;       // 最少要拖曳的距離（px）
  var SETTLE_MS = 600;     // 放開後回位／換頁的動畫時間，需與 CSS 一致

  var startX = 0, startY = 0, width = 1;
  var dragging = false, settling = false, axis = null;
  var offset = 0, peekIdx = -1;

  function wrapIdx(i) { return (i + slideEls.length) % slideEls.length; }

  function setPeek(i) {
    if (i === peekIdx) return;
    if (peekIdx > -1) slideEls[peekIdx].classList.remove('peek');
    peekIdx = i;
    slideEls[peekIdx].classList.add('peek');
  }

  function clearPeek() {
    if (peekIdx > -1) slideEls[peekIdx].classList.remove('peek');
    peekIdx = -1;
  }

  function moveTo(el, x) { el.style.transform = 'translateX(' + x + 'px)'; }

  function render(dx) {
    var dir = dx < 0 ? 1 : -1;                 // 往左拖＝下一張
    setPeek(wrapIdx(cur + dir));
    moveTo(slideEls[cur], dx);
    moveTo(slideEls[peekIdx], dx + dir * width);
  }

  function reset() {
    slideEls.forEach(function (el) { el.style.transform = ''; });
    clearPeek();
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    hero.classList.remove('dragging');

    if (!offset || peekIdx < 0) { reset(); startAuto(); return; }

    var dir = offset < 0 ? 1 : -1;
    var commit = Math.abs(offset) >= Math.max(DRAG_MIN, width * DRAG_RATIO);
    var target = peekIdx;

    settling = true;
    hero.classList.add('settling');
    moveTo(slideEls[cur], commit ? -dir * width : 0);
    moveTo(slideEls[target], commit ? 0 : dir * width);

    setTimeout(function () {
      // 拖曳換頁是「滑動」而非淡入淡出，先關掉轉場再交還給 goTo
      hero.classList.add('no-anim');
      if (commit) goTo(target);
      reset();
      hero.offsetHeight;                        // 強制 reflow，避免殘留動畫
      hero.classList.remove('no-anim', 'settling');
      settling = false;
      startAuto();
    }, SETTLE_MS);
  }

  hero.addEventListener('dragstart', function (e) { e.preventDefault(); });

  hero.addEventListener('pointerdown', function (e) {
    if (settling || e.button > 0) return;
    if (e.target.closest && e.target.closest('a, button')) return;   // 不干擾按鈕與連結
    dragging = true;
    axis = null;
    offset = 0;
    width = hero.getBoundingClientRect().width || 1;
    startX = e.clientX;
    startY = e.clientY;
    clearInterval(timer);                       // 拖曳期間暫停自動輪播
    hero.classList.add('dragging');
    if (hero.setPointerCapture) hero.setPointerCapture(e.pointerId);
  });

  hero.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - startX, dy = e.clientY - startY;
    if (axis === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (axis === 'y') { endDrag(); return; }  // 直向捲動交還給頁面
    }
    e.preventDefault();
    offset = dx;
    render(dx);
  });

  ['pointerup', 'pointercancel'].forEach(function (evt) {
    hero.addEventListener(evt, endDrag);
  });
}

/* 依當前輪播圖片顯示對應文字，未填寫的欄位則隱藏 */
function setHeroText(s) {
  s = s || {};
  setTextOrHide('hero-eyebrow', s.eyebrow);
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
      if (img) img.style.backgroundImage = "url('" + asset(s.image) + "')";
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

/* ---- 首頁「關於我們」圖片：圖片進入畫面 ENTER_PX 後開始，
   用滑鼠滾輪捲動這段期間刻意調慢速度（其他捲動方式如觸控／鍵盤不受影響，
   照實際捲動距離同步視覺），背景／前景兩層一開始是錯開的，
   隨捲動逐漸「歸位」到完全對齊；捲完 SLOW_PX 這段等效距離後恢復正常速度，
   兩層剛好完全對齊、不再變化（LAYER_SCALE=1，終點對齊時零裁切） ---- */
function initAboutImgPin() {
  var wrap = document.getElementById('sci-image-wrap');
  var bg = document.getElementById('sci-image-bg');
  var top = document.getElementById('sci-image-top');
  if (!wrap || !bg || !top) return;

  var ENTER_PX = 300;      // 圖片進入畫面多少 px 後開始觸發
  var SLOW_PX = 300;       // 觸發後，正常等效捲動這麼多 px 才算走完效果
  var SLOW_FACTOR = 0.35;  // 效果進行中，滑鼠滾輪的實際捲動速度縮小到這個比例
  var LAYER_SCALE = 1;     // 不放大，兩層在終點（完全對齊）時零裁切
  var BG_START = -10;      // 背景層一開始的位移（px），隨捲動歸位到 0
  var TOP_START = 30;      // 前景層一開始的位移（px），隨捲動歸位到 0

  var progressPx = 0;      // 0..SLOW_PX，效果已經「消耗」掉多少捲動量
  var lastScrollY = window.scrollY;

  function isEntered() {
    return wrap.getBoundingClientRect().top <= window.innerHeight - ENTER_PX;
  }

  function applyVisual() {
    var p = Math.min(Math.max(progressPx / SLOW_PX, 0), 1);
    bg.style.transform = 'scale(' + LAYER_SCALE + ') translateY(' + (BG_START * (1 - p)) + 'px)';
    top.style.transform = 'scale(' + LAYER_SCALE + ') translateY(' + (TOP_START * (1 - p)) + 'px)';
  }

  function onScroll() {
    var entered = isEntered();
    var dy = window.scrollY - lastScrollY;
    lastScrollY = window.scrollY;
    /* 用實際捲動距離推進效果，滑鼠滾輪被下面的 wheel 監聽器調慢後，
       這裡量到的距離自然也跟著變小，兩邊天生同步，不用另外對帳 */
    progressPx = entered ? Math.min(Math.max(progressPx + dy, 0), SLOW_PX) : 0;
    applyVisual();
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(function () { onScroll(); ticking = false; }); }
  }, { passive: true });

  /* 只攔截滑鼠滾輪：進場後、效果還沒走完前，把每次滾動量縮小成 SLOW_FACTOR，
     製造「變慢」的手感；效果走完（或還沒進場）就不攔截，滾輪恢復正常速度 */
  window.addEventListener('wheel', function (e) {
    if (isEntered() && progressPx < SLOW_PX) {
      e.preventDefault();
      /* 明確指定 instant：全站 scroll-behavior:smooth 若套用在這裡，
         連續滾輪事件會疊加多個平滑捲動動畫，手感會卡頓、不跟手 */
      window.scrollBy({ top: e.deltaY * SLOW_FACTOR, left: 0, behavior: 'instant' });
    }
  }, { passive: false });

  applyVisual();
}

/* ---- 標題捲動載入動畫（含日後動態插入的標題） ---- */
function initScrollReveal() {
  var SELECTOR = 'h1, h2, h3, .pfeature-row, .pcard';

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
  initAboutImgPin();
  initShareButtons();
  initContactForm();
  initSoundToggles();
  initPlayToggles();

  var page = document.body.dataset.page;

  Promise.all([getJSON('/content/settings-footer.json'), getJSON('/content/settings-contact.json')])
    .then(function (r) { injectOrganizationLD(Object.assign({}, r[0], r[1])); })
    .catch(console.error);
  /* 產品詳細頁的內容已在建置時寫進 HTML，不需要再抓 products.json；
     只有首頁與產品列表頁要動態產生卡片 */
  if (document.getElementById('home-products') || document.getElementById('product-list')) {
    getJSON('/content/products.json').then(function (d) { renderProducts(d.items); }).catch(console.error);
  }

  if (page === 'home') {
    getJSON('/content/home.json').then(renderHome).catch(console.error);
    getJSON('/content/home-hero.json').then(initHeroCarousel).catch(console.error);
  }
  if (page === 'about') getJSON('/content/about-sections.json').then(renderAbout).catch(console.error);
  if (page === 'contact') getJSON('/content/settings-contact.json').then(renderContact).catch(console.error);
});
