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
  var IMG_LOGO_GREY = 'images/per-sulii-logo-grayscale.png';
  var IMG_LOGO_WHITE = 'images/per-sulii Logo-logo-whitepng.png';

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
      </div>
      <div>
        <h4>產品</h4>
        <a href="product.html?id=v-essence">沛素-V 精萃蜂胜肽 PLUS</a>
        <a href="product.html?id=s-essence">沛素-S 外泌體多胜肽</a>
      </div>
      <div>
        <h4>關於</h4>
        <a href="about.html">品牌理念</a>
        <a href="about.html#faq">常見問答</a>
        <a href="contact.html#team">成為合作夥伴</a>
      </div>
      <div>
        <h4>聯絡</h4>
        <ul>
          <li>service@persulii.com</li>
          <li>0912-125-856</li>
          <li>Line ｜ Facebook ｜ Instagram</li>
        </ul>
      </div>
    </div>
    <div class="ftr-cert">
      <span class="ftr-cert-chip">符合 TFDA PIF · 國際 INCI 認證</span>
      <p class="ftr-cert-sub">台灣科研美學・專為肌膚自然修護</p>
    </div>
    <div class="ftr-bottom">
      <span>© per-sulii 2026 ｜ 媛和媄生醫美容有限公司　統編 00000000</span>
      <span class="lang">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
          style="vertical-align:-2px;margin-right:7px">
          <circle cx="12" cy="12" r="9"/>
          <path d="M3 12h18"/>
          <path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>
        </svg>
        <span class="on">繁中</span> ／ <span>English</span>
      </span>
    </div>
  </div>
</footer>`;

  /* ---- 注入 ---- */
  function inject() {
    var hp = document.getElementById('site-header');
    var fp = document.getElementById('site-footer');
    if (hp) hp.innerHTML = HEADER;
    if (fp) fp.innerHTML = FOOTER;

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

})();
