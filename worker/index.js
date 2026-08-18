/* ============================================================
   worker/index.js — 維護模式閘門

   正式網址（persulii.com.tw 等綁在這個 Worker 上的自訂網域）一律回
   「網站維護中」頁；測試網址（*.workers.dev）與本機 wrangler dev
   照常瀏覽完整網站，方便繼續修改與驗收。

   ── 怎麼開關 ──────────────────────────────────────────────
   維護結束：把下面的 MAINTENANCE 改成 false，commit 後推上 GitHub，
   Cloudflare Workers Builds 會自動重新部署（約 1～2 分鐘）。
   ─────────────────────────────────────────────────────────

   為什麼要有這支 Worker：這個專案原本只有靜態資源（wrangler.jsonc 的
   assets），靜態資源會直接由 Cloudflare 送出、程式碼沒有介入的機會。
   加上 main + assets.run_worker_first 之後，每個請求都會先進到這裡，
   才輪得到判斷網域要不要擋。
   ============================================================ */

import { LOGO_DATA_URI, LOGO_H, LOGO_W } from './logo-data.js';

/* 維護模式總開關 */
const MAINTENANCE = false;

/* 不受維護模式影響的網域：測試用的 workers.dev 與本機開發。
   採「白名單」而非列出正式網域，因為之後若再綁其他自訂網域
   （www、.com 轉址等），預設就是被擋住的正式網址，不會漏網。 */
function isTestHost(hostname) {
  const h = hostname.toLowerCase();
  return h.endsWith('.workers.dev') || h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

/* 維護期間在正式網址上仍要放行的路徑：
   /admin  — Sveltia CMS 後台，維護期間還是要能改內容 */
const ALLOW_PREFIXES = ['/admin'];

function isAllowedPath(pathname) {
  return ALLOW_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (MAINTENANCE && !isTestHost(url.hostname) && !isAllowedPath(url.pathname)) {
      return maintenanceResponse();
    }

    /* 其餘一律交還給靜態資源伺服器，行為與加這支 Worker 之前完全相同
       （/about → about.html 的副檔名補齊、_headers 的快取規則都照舊） */
    return env.ASSETS.fetch(request);
  }
};

/* 回 503 而不是 200：503 是「暫時無法服務」，Google 看到會知道要晚點再來，
   不會把整站從搜尋結果移除；若回 200 並顯示維護頁，反而可能被當成頁面內容
   已經換成這樣而重新收錄。Retry-After 一併給出建議的重試間隔。
   維護頁本身不快取，維護結束後才不會有人繼續看到舊的維護畫面。 */
function maintenanceResponse() {
  return new Response(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Retry-After': '3600',
      'Cache-Control': 'no-store'
    }
  });
}

/* 直接寫在 Worker 裡而不放成 maintenance.html：
   放成靜態檔的話它自己也會有一個公開網址（/maintenance.html，回 200），
   可能被搜尋引擎收錄；寫在這裡則只會伴隨 503 出現。
   樣式沿用 coming-soon.html，字型走 Google Fonts CDN，載不到時退回系統字型。
   Logo 用灰階版並內嵌成 data URI（見 worker/logo-data.js）。 */
const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>網站維護中 — 沛素 per-sulii</title>
<meta name="description" content="沛素 per-sulii 網站維護中，稍後將恢復服務。">
<link rel="icon" href="data:,">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Funnel+Display:wght@300..800&family=Noto+Sans+TC:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    height: 100%;
    background: #fff;
    color: #1f1f1f;
    font-family: 'Noto Sans TC', sans-serif;
  }
  .wrap {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
  }
  .logo {
    display: block;
    width: 140px;
    max-width: 70vw;   /* 極窄螢幕也不會頂到邊 */
    height: auto;
    margin: 0 auto 40px;
  }
  h1 {
    font-family: 'Funnel Display', sans-serif;
    font-weight: 500;
    font-size: clamp(28px, 5vw, 44px);
    letter-spacing: .08em;
    margin: 0;
  }
</style>
</head>
<body>
<div class="wrap">
  <img class="logo" src="${LOGO_DATA_URI}" width="${LOGO_W}" height="${LOGO_H}" alt="沛素 per-sulii">
  <h1>網站維護中</h1>
</div>
</body>
</html>
`;
