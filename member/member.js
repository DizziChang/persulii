/* 會員中心共用：LIFF 登入、呼叫 API
   本機測試（wrangler dev + DEV_AUTH=1）時不載 LIFF，改用 dev: 假 token；
   網址加 ?dev_user=U123 可切換不同測試會員。 */

const PS = (() => {
  let token = null;
  let profile = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('無法載入 LINE 元件'));
      document.head.appendChild(s);
    });
  }

  async function init() {
    const cfg = await fetch('/api/config').then((r) => r.json());

    if (cfg.dev) {
      const q = new URLSearchParams(location.search).get('dev_user');
      if (q) sessionStorage.setItem('ps_dev_user', q);
      const uid = sessionStorage.getItem('ps_dev_user') || 'U_dev_member';
      // header 只能放 ASCII，暱稱用英文
      token = `dev:${uid}:Tester-${uid.slice(-4)}`;
      profile = { displayName: `測試 ${uid.slice(-4)}`, pictureUrl: null };
      return;
    }

    if (!cfg.liffId) throw new Error('會員中心尚未開通');
    await loadScript('https://static.line-scdn.net/liff/edge/2/sdk.js');
    await liff.init({ liffId: cfg.liffId });
    // 電腦版或一般瀏覽器開啟時走 LINE Login 備援
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: location.href });
      return new Promise(() => {}); // 等待跳轉
    }
    token = liff.getIDToken();
    try { profile = await liff.getProfile(); } catch { profile = null; }
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      ...opts,
      headers: {
        Authorization: 'Bearer ' + token,
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && window.liff && liff.isLoggedIn && liff.isLoggedIn()) {
      // ID Token 過期：重新登入一次
      liff.logout();
      liff.login({ redirectUri: location.href });
      return new Promise(() => {});
    }
    if (!res.ok) {
      const e = new Error(data.message || '系統忙碌中，請稍後再試');
      e.code = data.error;
      e.status = res.status;
      throw e;
    }
    return data;
  }

  const money = (n) => 'NT$ ' + Number(n).toLocaleString('en-US');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function fail(el, err) {
    el.innerHTML = `<div class="loading">${esc(err.message || err)}</div>`;
  }

  return { init, api, money, esc, fail, get profile() { return profile; } };
})();
