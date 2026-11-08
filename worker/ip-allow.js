/* ============================================================
   ip-allow.js — IP 白名單比對（IPv4、IPv6，支援 CIDR 網段）

   名單格式：以逗號、空白或換行分隔，例如
     203.0.113.5, 198.51.100.0/24, 2001:db8:1234:5678::/64

   家用 IPv6 位址的後半段常會自動輪換，建議填整個 /64 網段
   （位址前四組 + ::/64），而不是單一 IPv6 位址。
   ============================================================ */

function parseV4(s) {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  let n = 0n;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = (n << 8n) | BigInt(Number(p));
  }
  return n;
}

function parseV6(s) {
  if (!/^[0-9a-f:.]+$/i.test(s)) return null;
  // 結尾內嵌 IPv4（例如 ::ffff:1.2.3.4）先轉成兩組十六進位
  const v4 = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = parseV4(v4[2]);
    if (n === null) return null;
    s = v4[1] + ((n >> 16n) & 0xffffn).toString(16) + ':' + (n & 0xffffn).toString(16);
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

/** 回傳 { v: 4|6, n: BigInt } 或 null */
function parseIp(s) {
  s = String(s || '').trim();
  if (s.includes(':')) {
    const n = parseV6(s);
    if (n === null) return null;
    // IPv4-mapped IPv6（::ffff:a.b.c.d）視同 IPv4
    if (n >> 32n === 0xffffn) return { v: 4, n: n & 0xffffffffn };
    return { v: 6, n };
  }
  const n = parseV4(s);
  return n === null ? null : { v: 4, n };
}

/** 把名單字串解析成網段陣列；格式錯誤的項目略過 */
export function parseAllowList(text) {
  return String(text || '')
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((entry) => {
      const [addr, bitsStr] = entry.split('/');
      const ip = parseIp(addr);
      if (!ip) return null;
      const max = ip.v === 4 ? 32 : 128;
      const bits = bitsStr === undefined ? max : Number(bitsStr);
      if (!Number.isInteger(bits) || bits < 0 || bits > max) return null;
      const mask = bits === 0 ? 0n : ((1n << BigInt(bits)) - 1n) << BigInt(max - bits);
      return { v: ip.v, net: ip.n & mask, mask };
    })
    .filter(Boolean);
}

/** ip 是否落在名單任一網段內 */
export function ipAllowed(ip, list) {
  const p = parseIp(ip);
  if (!p) return false;
  return list.some((r) => r.v === p.v && (p.n & r.mask) === r.net);
}
