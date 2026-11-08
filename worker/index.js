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

import { handleApi } from './api/index.js';
import { verifyAccessJwt } from './api/auth.js';
import { ipAllowed, parseAllowList } from './ip-allow.js';
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
   /admin  — Sveltia CMS 後台與會員管理後台，維護期間還是要能改內容、建單
   /member — LINE 會員中心（只從 LINE 進入）
   /api    — 會員系統 API */
const ALLOW_PREFIXES = ['/admin', '/member', '/api'];

/* 會員中心與會員管理後台不給搜尋引擎收錄 */
const NOINDEX_PREFIXES = ['/member', '/admin'];

/* 測試中、只開放白名單的頁面。符合任一條件即可檢視，否則回 404：
     1. IP 白名單：訪客 IP（CF-Connecting-IP）在 Secret「MEMBERSHIP_ALLOWED_IPS」名單內，
        不需要登入，打開網址就能看
     2. Cloudflare Access（選用）：MEMBERSHIP_ACCESS_AUD 有設定、且帶著該 Access 應用程式的有效 JWT
   兩者都沒設定時一律拒絕，不會不小心公開。
   正式公開時：把該頁從這裡移除（若有建 Access 應用程式也一併刪除）。 */
const PREVIEW_PAGES = ['/membership', '/membership/', '/membership.html'];

function isAllowedPath(pathname) {
  return ALLOW_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (MAINTENANCE && !isTestHost(url.hostname) && !isAllowedPath(url.pathname)) {
      return maintenanceResponse();
    }

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleApi(request, env);
    }

    if (PREVIEW_PAGES.includes(url.pathname)) {
      if (!(await previewAllowed(env, request, url))) return previewDeniedResponse();
      const res = await env.ASSETS.fetch(request);
      const out = new Response(res.body, res);
      out.headers.set('X-Robots-Tag', 'noindex, nofollow');
      out.headers.set('Cache-Control', 'private, no-store');
      return out;
    }

    /* /admin/members/<id> 是會員詳情，實際檔案只有一份 detail.html，由前端讀網址上的 id */
    let assetReq = request;
    const detail = url.pathname.match(/^\/admin\/members\/([0-9a-f-]{36})\/?$/i);
    if (detail) assetReq = new Request(new URL('/admin/members/detail', url), request);

    /* 其餘一律交還給靜態資源伺服器，行為與加這支 Worker 之前完全相同
       （/about → about.html 的副檔名補齊、_headers 的快取規則都照舊） */
    const res = await env.ASSETS.fetch(assetReq);
    if (NOINDEX_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'))) {
      const out = new Response(res.body, res);
      out.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return out;
    }
    return res;
  }
};

async function previewAllowed(env, request, url) {
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip && ipAllowed(ip, parseAllowList(env.MEMBERSHIP_ALLOWED_IPS))) return true;
  try {
    return await verifyAccessJwt(env, request, url, env.MEMBERSHIP_ACCESS_AUD);
  } catch {
    return false;
  }
}

/* 白名單頁面驗證不過時的回應。404 而不是 403：不透露這個網址存在。 */
function previewDeniedResponse() {
  return new Response('Not Found', {
    status: 404,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store'
    }
  });
}

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
<title>網站維護中 — per-sulii 沛素</title>
<meta name="description" content="per-sulii 沛素 網站維護中，稍後將恢復服務。">
<link rel="icon" href="data:,">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,100..900;1,100..900&family=Noto+Sans+TC:wght@300;400;500;700&display=swap" rel="stylesheet">
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
    font-family: 'Montserrat', sans-serif;
    font-weight: 500;
    font-size: clamp(28px, 5vw, 44px);
    letter-spacing: .08em;
    margin: 0;
  }
</style>
</head>
<body>
<div class="wrap">
  <img class="logo" src="${LOGO_DATA_URI}" width="${LOGO_W}" height="${LOGO_H}" alt="per-sulii 沛素">
  <h1>網站維護中</h1>
</div>
</body>
</html>
`;
