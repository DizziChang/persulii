/* /api/* 路由 */

import * as A from './admin.js';
import { adminCallback, adminLogin, adminLogout, requireAdmin } from './auth.js';
import * as M from './member.js';
import { HttpError, devAuthOn, json } from './util.js';

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  try {
    if (!env.DB) throw new HttpError(500, 'no_db', '尚未綁定 D1 資料庫');

    if (path === '/api/config' && method === 'GET') {
      return json({ liffId: env.LIFF_ID || null, dev: devAuthOn(env, url) });
    }

    /* 會員 */
    if (path === '/api/member/register' && method === 'POST') return await M.register(env, request, url);
    if (path === '/api/member/me' && method === 'GET') return await M.me(env, request, url);
    if (path === '/api/member/orders' && method === 'GET') return await M.orders(env, request, url);

    /* 管理員登入流程（自己處理 Access 驗證） */
    if (path === '/api/admin/auth/login' && method === 'GET') return await adminLogin(env, request, url);
    if (path === '/api/admin/auth/callback' && method === 'GET') return await adminCallback(env, request, url);
    if (path === '/api/admin/auth/logout' && method === 'POST') return adminLogout(url);

    if (path.startsWith('/api/admin/')) {
      const admin = await requireAdmin(env, request, url);
      const seg = path.split('/').slice(3); // ['members', ':id', 'merge']

      if (path === '/api/admin/me' && method === 'GET') return await A.me(env, admin);
      if (path === '/api/admin/products' && method === 'GET') return await A.listProducts(env);

      if (seg[0] === 'members') {
        if (seg.length === 1 && method === 'GET') return await A.searchMembers(env, url);
        if (seg.length === 2 && method === 'GET') return await A.memberDetail(env, seg[1]);
        if (seg.length === 2 && method === 'PATCH') return await A.updateMember(env, request, seg[1]);
        if (seg.length === 3 && seg[2] === 'merge' && method === 'POST') return await A.mergeMember(env, request, seg[1]);
        if (seg.length === 3 && seg[2] === 'erase' && method === 'POST') return await A.eraseMember(env, request, seg[1]);
      }

      if (seg[0] === 'orders') {
        if (seg.length === 1 && method === 'GET') return await A.listOrders(env, url);
        if (seg.length === 1 && method === 'POST') return await A.createOrder(env, request, admin);
        if (seg.length === 2 && seg[1] === 'preview' && method === 'POST') return await A.previewOrder(env, request);
        if (seg.length === 2 && method === 'PATCH') return await A.updateOrder(env, request, seg[1]);
      }
    }

    return json({ error: 'not_found', message: '找不到這個 API' }, 404);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
    console.error('API error', path, e);
    return json({ error: 'server_error', message: '系統錯誤，請稍後再試' }, 500);
  }
}
