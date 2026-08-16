/* ============================================================
   components.js — header & footer 元件
   在每頁 <body> 結尾載入此檔即可自動注入 header 與 footer。

   使用方式：
     <body data-page="home">
       <div id="site-header"></div>
       <!-- 頁面內容 -->
       <div id="site-footer"></div>
       <script src="/js/components.js"></script>
     </body>

   data-page 值：home | about | products | faq | contact

   雙語：網址開頭是 /en 就視為英文頁（見 window.PERSULII_LANG，
   main.js 也讀這個值來決定要抓哪份 content JSON）。
   ============================================================ */

(function () {

  /* ---- 語言判斷：/en 或 /en/... 視為英文頁 ---- */
  var LANG = /^\/en(\/|$)/.test(window.location.pathname) ? 'en' : 'zh';
  window.PERSULII_LANG = LANG;

  /* 目前網址對應的另一個語言版本網址（給語言切換鈕用） */
  function otherLangUrl() {
    var path = window.location.pathname;
    if (LANG === 'en') {
      return path.replace(/^\/en/, '') || '/';
    }
    return '/en' + path;
  }

  var NAV_LABELS = {
    zh: { home: '首頁', about: '關於', products: '產品', faq: '問答', contact: '經銷' },
    en: { home: 'Home', about: 'About', products: 'Products', faq: 'FAQ', contact: 'Contact' }
  };
  var UI = {
    zh: { menuOpen: '開啟選單', menuClose: '關閉選單', langSwitch: 'EN', langLabel: '切換為英文', mainNav: '主要導覽', mobileNav: '行動版導覽' },
    en: { menuOpen: 'Open menu', menuClose: 'Close menu', langSwitch: '中文', langLabel: 'Switch to Chinese', mainNav: 'Main navigation', mobileNav: 'Mobile navigation' }
  }[LANG];
  var L = NAV_LABELS[LANG];

  /* ---- 圖片路徑（根絕對路徑，子目錄頁面如 /products/<slug> 才不會解析錯） ---- */
  var IMG_LOGO_GREY = '/images/per-sulii-logo-grayscale.webp';
  var IMG_LOGO_WHITE = '/images/per-sulii Logo-logo-whitepng.webp';
  var IMG_ICON_HAMBURGER = '/images/icon/hamburger.webp';
  var IMG_ICON_CLOSE = '/images/icon/close.webp';

  var HOME_HREF = LANG === 'en' ? '/en/' : '/';
  var PAGE_HREF = LANG === 'en' ? '/en/' : '/';

  /* ---- Header HTML ---- */
  var HEADER = `
<header class="hdr">
  <div class="hdr-in" style="position:relative">
    <a href="${HOME_HREF}">
      <img class="logo" src="${IMG_LOGO_GREY}" alt="沛素 per-sulii">
    </a>
    <nav class="nav desk" aria-label="${UI.mainNav}">
      <a href="${HOME_HREF}" data-page="home">${L.home}</a>
      <a href="${PAGE_HREF}about" data-page="about">${L.about}</a>
      <a href="${PAGE_HREF}products" data-page="products">${L.products}</a>
      <a href="${PAGE_HREF}faq" data-page="faq">${L.faq}</a>
      <a href="${PAGE_HREF}contact" data-page="contact">${L.contact}</a>
      <a href="${otherLangUrl()}" class="lang-switch" aria-label="${UI.langLabel}">${UI.langSwitch}</a>
    </nav>
    <button class="burger mob" id="burger" type="button"
      aria-label="${UI.menuOpen}" aria-expanded="false" aria-controls="mmenu">
      <img id="burger-icon" src="${IMG_ICON_HAMBURGER}" alt="">
    </button>
  </div>
  <nav class="mmenu" id="mmenu" aria-label="${UI.mobileNav}">
    <a href="${HOME_HREF}">${L.home}</a>
    <a href="${PAGE_HREF}about">${L.about}</a>
    <a href="${PAGE_HREF}products">${L.products}</a>
    <a href="${PAGE_HREF}faq">${L.faq}</a>
    <a href="${PAGE_HREF}contact">${L.contact}</a>
    <a href="${otherLangUrl()}" class="lang-switch">${UI.langSwitch}</a>
  </nav>
</header>`;

  /* ---- Footer HTML（內容來自 content/settings-footer(.en).json） ---- */
  function footerHTML(s) {
    var f = s.footer;
    var infoLabels = LANG === 'en'
      ? { email: 'Email', phone: 'Phone' }
      : { email: '聯絡信箱', phone: '聯絡電話' };
    return `
<footer class="ftr">
  <div class=" wrap">
   <div class="ftr-flex-item">
      <a href="${HOME_HREF}">${L.home}</a>
      <a href="${PAGE_HREF}about">${L.about}</a>
      <a href="${PAGE_HREF}products">${L.products}</a>
      <a href="${PAGE_HREF}faq">${L.faq}</a>
      <a href="${PAGE_HREF}contact">${L.contact}</a>
    </div>
    <div class="ftr-grid">
      <div class="ftr-logo">
        <img class="logo" src="${IMG_LOGO_GREY}" alt="沛素 per-sulii" style="margin:0 auto">
      </div>
      <div class="ftr-flex-cert">
        <p class="ftr-cert-sub">${f.tagline}</p>
        <span class="ftr-cert-chip">${f.cert_chip}</span>
      </div>
      <div class="ftr-grid-item">
          <ul class="info">
            <li>${f.company}</li>
            <li>${infoLabels.email} ｜ ${f.email}</li>
            <li>${infoLabels.phone} ｜ ${f.phone}</li>
            <li class="ftr-social">
              <a href="${f.social.line}" target="_blank" rel="noopener" aria-label="Line" title="Line">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5C6.2 2.5 1.5 6.3 1.5 11c0 4.2 3.7 7.7 8.7 8.4.34.07.8.22.92.51.1.27.07.68.03.95l-.15.9c-.04.27-.21 1.05.92.57 1.13-.47 6.07-3.57 8.28-6.12 1.53-1.66 2.3-3.36 2.3-5.21 0-4.7-4.7-8.5-10.5-8.5zM7.3 13.6H5.2a.55.55 0 0 1-.55-.55V8.9a.55.55 0 0 1 1.1 0v3.6h1.55a.55.55 0 0 1 0 1.1zm1.9-.55a.55.55 0 0 1-1.1 0V8.9a.55.55 0 0 1 1.1 0v4.15zm5.1 0a.55.55 0 0 1-.99.33l-2.06-2.8v2.47a.55.55 0 0 1-1.1 0V8.9a.55.55 0 0 1 .99-.33l2.06 2.8V8.9a.55.55 0 0 1 1.1 0v4.15zm3.5-2.63a.55.55 0 0 1 0 1.1h-1.55v.98h1.55a.55.55 0 0 1 0 1.1h-2.1a.55.55 0 0 1-.55-.55V8.9c0-.3.25-.55.55-.55h2.1a.55.55 0 0 1 0 1.1h-1.55v.97h1.55z"/></svg>
              </a>
              <a href="${f.social.facebook}" target="_blank" rel="noopener" aria-label="Facebook" title="Facebook">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.07C24 5.44 18.63.07 12 .07S0 5.44 0 12.07c0 5.99 4.39 10.95 10.13 11.85v-8.38H7.08v-3.47h3.05V9.43c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.69.23 2.69.23v2.96H15.83c-1.49 0-1.96.92-1.96 1.87v2.25h3.33l-.53 3.47h-2.8v8.38C19.61 23.02 24 18.06 24 12.07z"/></svg>
              </a>
              <a href="${f.social.instagram}" target="_blank" rel="noopener" aria-label="Instagram" title="Instagram">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="2.5" width="19" height="19" rx="5.2"/><circle cx="12" cy="12" r="4.4"/><circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" stroke="none"/></svg>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>
    <div class="ftr-bottom wrap">
    <span>${f.copyright}</span>
    </div>
  </div>
</footer>`;
  }

  /* ---- 注入 ---- */
  function inject() {
    var hp = document.getElementById('site-header');
    var fp = document.getElementById('site-footer');
    if (hp) hp.innerHTML = HEADER;
    if (fp) {
      var footerUrl = LANG === 'en' ? '/content/settings-footer.en.json' : '/content/settings-footer.json';
      fetch(footerUrl).then(function (r) { return r.json(); }).then(function (s) {
        fp.innerHTML = footerHTML(s);
      }).catch(console.error);
    }
    initHeaderScroll();

    /* active nav */
    var currentPage = document.body.dataset.page;
    document.querySelectorAll('.nav a[data-page]').forEach(function (a) {
      if (a.dataset.page === currentPage) {
        a.classList.add('on');
        a.setAttribute('aria-current', 'page');
      }
    });

    /* mobile menu */
    var burger = document.getElementById('burger');
    var burgerIcon = document.getElementById('burger-icon');
    var mmenu = document.getElementById('mmenu');
    if (burger && mmenu) {
      burger.addEventListener('click', function () {
        var open = mmenu.classList.toggle('open');
        burgerIcon.src = open ? IMG_ICON_CLOSE : IMG_ICON_HAMBURGER;
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        burger.setAttribute('aria-label', open ? UI.menuClose : UI.menuOpen);
      });
      /* 點選行動選單連結後收起 */
      mmenu.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          mmenu.classList.remove('open');
          burgerIcon.src = IMG_ICON_HAMBURGER;
          burger.setAttribute('aria-expanded', 'false');
          burger.setAttribute('aria-label', UI.menuOpen);
        });
      });
    }
  }

  /* ---- 捲動方向控制 header logo 顯示 ---- */
  function initHeaderScroll() {
    var hdr = document.querySelector('.hdr');
    var holder = document.getElementById('site-header');
    if (!hdr || !holder) return;

    /* 固定佔位高度：logo 收合時文件高度不變，杜絕捲動抖動 */
    function lockHeight() {
      var wasHidden = hdr.classList.contains('logo-hidden');
      hdr.classList.add('no-anim');
      hdr.classList.remove('logo-hidden');
      holder.style.height = hdr.offsetHeight + 'px';
      if (wasHidden) hdr.classList.add('logo-hidden');
      void hdr.offsetHeight; /* 強制 reflow 後再恢復動畫 */
      hdr.classList.remove('no-anim');
    }
    lockHeight();
    window.addEventListener('resize', lockHeight);
    var lastY = window.scrollY;
    var ticking = false;
    var DELTA = 12; /* 捲動超過此距離才切換，避免高度變化造成的抖動 */
    function update() {
      var y = window.scrollY;
      var diff = y - lastY;
      if (Math.abs(diff) > DELTA) {
        if (diff > 0 && y > 120) {
          hdr.classList.add('logo-hidden');   /* 往下捲：隱藏 */
        } else if (diff < 0) {
          hdr.classList.remove('logo-hidden'); /* 往上捲：顯示 */
        }
        lastY = y;
      }
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

})();
