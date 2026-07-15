/* ============================================================
   components.js — header & footer 元件
   在每頁 <body> 結尾載入此檔即可自動注入 header 與 footer。

   使用方式：
     <body data-page="home">
       <div id="site-header"></div>
       <!-- 頁面內容 -->
       <div id="site-footer"></div>
       <script src="js/components.js"></script>
     </body>

   data-page 值：home | about | products | journal | contact
   ============================================================ */

(function () {

  /* ---- 圖片路徑（相對於各 html 頁） ---- */
  var IMG_LOGO_GREY = 'images/per-sulii-logo-grayscale.webp';
  var IMG_LOGO_WHITE = 'images/per-sulii Logo-logo-whitepng.webp';

  /* ---- Header HTML ---- */
  var HEADER = `
<header class="hdr">
  <div class="hdr-in" style="position:relative">
    <a href="index.html">
      <img class="logo" src="${IMG_LOGO_GREY}" alt="沛素 per-sulii">
    </a>
    <nav class="nav desk" aria-label="主要導覽">
      <a href="index.html"    data-page="home">首頁</a>
      <a href="about.html"    data-page="about">關於</a>
      <a href="products.html" data-page="products">產品</a>
      <a href="journal.html"  data-page="journal">專欄</a>
      <a href="contact.html"  data-page="contact">聯絡</a>
    </nav>
    <button class="burger mob" id="burger" type="button"
      aria-label="開啟選單" aria-expanded="false" aria-controls="mmenu">≡</button>
  </div>
  <nav class="mmenu" id="mmenu" aria-label="行動版導覽">
    <a href="index.html">首頁</a>
    <a href="about.html">關於</a>
    <a href="products.html">產品</a>
    <a href="journal.html">專欄</a>
    <a href="contact.html">聯絡</a>
  </nav>
</header>`;

  /* ---- Footer HTML ---- */
  var FOOTER = `
<footer class="ftr">
  <div class="wrap">
    <div class="ftr-grid">
      <div style="text-align:center">
        <img class="logo" src="${IMG_LOGO_GREY}" alt="沛素 per-sulii" style="margin:0 auto">
         
      <p class="ftr-cert-sub">台灣科研美學・專為肌膚自然修護</p>
      </div>
     
      <div>
        <a href="products.html">產品研發</a>
        <a href="about.html">品牌理念</a>
        <a href="about.html#faq">常見問答</a>
        <a href="contact.html#team">成為合作夥伴</a>
      </div>
      <div>
        <h4>聯絡</h4>
        <ul>
          <li>諾田康美有限公司</li>
          <li>service@persulii.com</li>
          <li>0912-125-856</li>
        </ul>
      </div>
       <div>
       <ul>
           <li>
           <span>© per-sulii 2026</span>
          </li>
         
          <li class="ftr-social">
            <a href="https://lin.ee/ZiwmByI" target="_blank" rel="noopener" aria-label="Line" title="Line">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5C6.2 2.5 1.5 6.3 1.5 11c0 4.2 3.7 7.7 8.7 8.4.34.07.8.22.92.51.1.27.07.68.03.95l-.15.9c-.04.27-.21 1.05.92.57 1.13-.47 6.07-3.57 8.28-6.12 1.53-1.66 2.3-3.36 2.3-5.21 0-4.7-4.7-8.5-10.5-8.5zM7.3 13.6H5.2a.55.55 0 0 1-.55-.55V8.9a.55.55 0 0 1 1.1 0v3.6h1.55a.55.55 0 0 1 0 1.1zm1.9-.55a.55.55 0 0 1-1.1 0V8.9a.55.55 0 0 1 1.1 0v4.15zm5.1 0a.55.55 0 0 1-.99.33l-2.06-2.8v2.47a.55.55 0 0 1-1.1 0V8.9a.55.55 0 0 1 .99-.33l2.06 2.8V8.9a.55.55 0 0 1 1.1 0v4.15zm3.5-2.63a.55.55 0 0 1 0 1.1h-1.55v.98h1.55a.55.55 0 0 1 0 1.1h-2.1a.55.55 0 0 1-.55-.55V8.9c0-.3.25-.55.55-.55h2.1a.55.55 0 0 1 0 1.1h-1.55v.97h1.55z"/></svg>
            </a>
            <a href="https://www.facebook.com/persulii" target="_blank" rel="noopener" aria-label="Facebook" title="Facebook">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.07C24 5.44 18.63.07 12 .07S0 5.44 0 12.07c0 5.99 4.39 10.95 10.13 11.85v-8.38H7.08v-3.47h3.05V9.43c0-3.01 1.79-4.67 4.53-4.67 1.31 0 2.69.23 2.69.23v2.96H15.83c-1.49 0-1.96.92-1.96 1.87v2.25h3.33l-.53 3.47h-2.8v8.38C19.61 23.02 24 18.06 24 12.07z"/></svg>
            </a>
            <a href="https://www.instagram.com/persulii/" target="_blank" rel="noopener" aria-label="Instagram" title="Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="2.5" width="19" height="19" rx="5.2"/><circle cx="12" cy="12" r="4.4"/><circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" stroke="none"/></svg>
            </a>
          </li>
        </ul>
       </div>
    </div>
    <div class="ftr-bottom">
      <span class="ftr-cert-chip">符合 TFDA PIF · 國際 INCI 認證</span>
      
    </div>
  </div>
</footer>`;

  /* ---- 注入 ---- */
  function inject() {
    var hp = document.getElementById('site-header');
    var fp = document.getElementById('site-footer');
    if (hp) hp.innerHTML = HEADER;
    if (fp) fp.innerHTML = FOOTER;
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
    var mmenu = document.getElementById('mmenu');
    if (burger && mmenu) {
      burger.addEventListener('click', function () {
        var open = mmenu.classList.toggle('open');
        burger.textContent = open ? '✕' : '≡';
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        burger.setAttribute('aria-label', open ? '關閉選單' : '開啟選單');
      });
      /* 點選行動選單連結後收起 */
      mmenu.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          mmenu.classList.remove('open');
          burger.textContent = '≡';
          burger.setAttribute('aria-expanded', 'false');
          burger.setAttribute('aria-label', '開啟選單');
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
