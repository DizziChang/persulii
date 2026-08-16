const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = 8420;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain'
};

/* 站內連結一律用無 .html 的網址（如 /about、/en/about），正式環境由 Cloudflare
   Workers Assets 自動對應到 about.html／自動對應資料夾底下的 index.html。
   這裡讀檔前先補上 .html 或 index.html，讓本機測試的行為跟正式環境一致。 */
function resolveFile(urlPath) {
  if (urlPath === '/') return path.join(root, 'index.html');
  const direct = path.join(root, urlPath);
  if (fs.existsSync(direct) && fs.statSync(direct).isFile()) return direct;
  if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
    const indexFile = path.join(direct, 'index.html');
    if (fs.existsSync(indexFile)) return indexFile;
  }
  const withHtml = direct + '.html';
  if (fs.existsSync(withHtml)) return withHtml;
  return direct;
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = resolveFile(urlPath);
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end(); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log('Static server on http://localhost:' + port));
