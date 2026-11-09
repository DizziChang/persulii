/* 會員管理後台共用：導覽列、登入檢查、API 呼叫、格式化 */

const MS = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => 'NT$ ' + Number(n || 0).toLocaleString('en-US');
  const TIER = { general: '銀卡會員', vip: 'VIP', vvip: 'VVIP' };
  const STATUS = { pending: '待出貨', shipped: '已出貨', voided: '已作廢' };
  const tierBadge = (code) => `<span class="badge ${esc(code)}">${esc(TIER[code] || code)}</span>`;
  const statusBadge = (s) => `<span class="badge ${esc(s)}">${esc(STATUS[s] || s)}</span>`;
  const twTime = (iso) => iso ? new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }).replace(/:\d\d$/, '') : '';

  function loginUrl() {
    return '/api/admin/auth/login?next=' + encodeURIComponent(location.pathname + location.search);
  }

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...opts,
      headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && data.error === 'login_required') {
      location.href = loginUrl();
      return new Promise(() => {});
    }
    if (!res.ok) {
      const e = new Error(data.message || '系統錯誤');
      e.code = data.error;
      e.status = res.status;
      throw e;
    }
    return data;
  }

  function shell(active) {
    const links = [
      ['members', '/admin/members/', '會員'],
      ['orders', '/admin/orders/', '訂單'],
      ['new', '/admin/orders/new', '建立訂單']
    ];
    document.body.insertAdjacentHTML('afterbegin', `
      <header class="top"><div class="in">
        <a class="logo" href="/admin/members/">沛素會員後台</a>
        <nav>${links.map(([k, href, t]) => `<a href="${href}" class="${k === active ? 'on' : ''}">${t}</a>`).join('')}</nav>
        <div class="me" id="msMe"></div>
      </div></header>`);
  }

  /** 每頁開頭呼叫：畫導覽列、確認身分。無權限時顯示訊息並回傳 null */
  async function boot(active) {
    shell(active);
    const main = document.querySelector('main');
    const denied = new URLSearchParams(location.search).get('denied');
    if (denied) {
      main.innerHTML = `<div class="card center">
        <h1>無權限</h1>
        <p>這個 LINE 帳號不在管理員白名單。</p>
        <p class="mt">若需要開通，請把下面的 LINE User ID 交給負責人加入白名單：</p>
        <p class="mt"><code>${esc(denied)}</code></p>
        <p class="mt"><a class="btn ghost" href="${loginUrl().replace(/denied%3D[^&]*/, '')}">換一個帳號登入</a></p></div>`;
      return null;
    }
    try {
      const me = await api('/api/admin/me');
      document.getElementById('msMe').innerHTML = `${esc(me.name)}<button id="msLogout">登出</button>`;
      document.getElementById('msLogout').onclick = async () => {
        await fetch('/api/admin/auth/logout', { method: 'POST' });
        location.href = '/admin/members/';
      };
      return me;
    } catch (e) {
      main.innerHTML = `<div class="card center"><h1>${e.code === 'not_admin' ? '無權限' : '無法進入後台'}</h1><p>${esc(e.message)}</p></div>`;
      return null;
    }
  }

  /** 確認對話框；requireText 有值時要輸入該文字才能按確定 */
  function confirmDialog({ title, body, ok = '確定', danger = false, requireText = '' }) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.innerHTML = `<h2>${esc(title)}</h2><p>${body}</p>
        ${requireText ? `<label class="f">請輸入「${esc(requireText)}」以確認</label><input type="text" id="cdText" autocomplete="off">` : ''}
        <div class="row"><button class="btn ghost" value="no">取消</button><button class="btn ${danger ? 'danger' : ''}" value="yes" id="cdOk" ${requireText ? 'disabled' : ''}>${esc(ok)}</button></div>`;
      document.body.appendChild(d);
      if (requireText) d.querySelector('#cdText').oninput = (e) => { d.querySelector('#cdOk').disabled = e.target.value.trim() !== requireText; };
      d.querySelectorAll('button').forEach((b) => (b.onclick = () => d.close(b.value)));
      d.onclose = () => { resolve(d.returnValue === 'yes'); d.remove(); };
      d.showModal();
    });
  }

  return { api, boot, esc, money, tierBadge, statusBadge, twTime, TIER, STATUS, confirmDialog };
})();
