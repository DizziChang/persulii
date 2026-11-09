/* 共用小工具：JSON 回應、錯誤、台灣時間 */

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers
    }
  });
}

/* 會改資料的請求一律要求 JSON body：跨站表單送不出 application/json，
   等於多一層 CSRF 防護（後台 cookie 另有 SameSite=Lax）。 */
export async function readJson(request) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'json_required', '請以 JSON 送出');
  }
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'bad_json', '資料格式錯誤');
  }
}

export const uuid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

/* ── 台灣時間（UTC+8，無日光節約）──────────────────────────── */
const TW_OFFSET_MS = 8 * 3600 * 1000;

/** 某個時間點在台灣的日期 YYYY-MM-DD */
export function twDate(at = new Date()) {
  const t = typeof at === 'string' ? Date.parse(at) : at.getTime();
  return new Date(t + TW_OFFSET_MS).toISOString().slice(0, 10);
}

/** 日期加 n 年（可為負）；2/29 落到非閏年時取 2/28 */
export function addYears(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const ny = y + n;
  const last = new Date(Date.UTC(ny, m, 0)).getUTCDate();
  return `${ny}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** 日期加 1 年；2/29 落到非閏年時取 2/28 */
export function addOneYear(dateStr) {
  return addYears(dateStr, 1);
}

/** 日期加 n 天（可為負） */
export function addDays(dateStr, n) {
  return new Date(Date.parse(dateStr + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}

/** b 比 a 晚幾天（兩者皆 YYYY-MM-DD） */
export function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/** 台灣手機／市話正規化成純數字；+886 開頭轉回 0 */
export function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s\-()（）]/g, '');
  if (p.startsWith('+886')) p = '0' + p.slice(4);
  else if (p.startsWith('886') && p.length >= 11) p = '0' + p.slice(3);
  return /^0\d{8,9}$/.test(p) ? p : null;
}

export function maskPhone(p) {
  if (!p) return '';
  return '*'.repeat(Math.max(0, p.length - 3)) + p.slice(-3);
}

export function isLocalHost(url) {
  const h = url.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
}

/** 本機測試模式：.dev.vars 設 DEV_AUTH=1，且只在 localhost 生效 */
export function devAuthOn(env, url) {
  return env.DEV_AUTH === '1' && isLocalHost(url);
}
