// qa/serve.js —— 本地起一个和树莓派 nginx 行为一致的小站：
// 静态文件 + /api/* 转发到 counter.js(127.0.0.1:3001)。
// 用法: node serve.js <站点目录> [端口=8099] [--slow-fonts 1800]
//   --slow-fonts 把字体响应推迟若干毫秒，用来在本地复现"线上首访"：字体比首屏晚到，
//   换字回退（CLS）才测得出来。线上源站慢的时候就是这种时序，本地默认时序是看不到的。
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.argv[2] || '.');
const PORT = +(process.argv[3] || 8099);
const sfI = process.argv.indexOf('--slow-fonts');
const SLOW_FONTS = sfI > 0 ? (+process.argv[sfI + 1] || 1800) : 0;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.ico': 'image/x-icon' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {                       // 反代到计数器
    const p = req.url;
    // Windows 上开 TUN 的代理会偶发劫持 loopback，导致 ~1s 卡顿或 ECONNREFUSED。
    // 生产是 nginx，不存在这问题；这里重试一次，免得把环境噪声当成站点缺陷。
    const attempt = n => {
      const proxy = http.request({ host: '127.0.0.1', port: 3001, path: p, method: req.method,
        agent: new http.Agent({ keepAlive: false }) },
        pr => { let b = ''; pr.on('data', c => b += c); pr.on('end', () => {
          res.writeHead(pr.statusCode, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
          res.end(b); }); });
      proxy.on('error', () => {
        if (n > 0) return setTimeout(() => attempt(n - 1), 120);
        res.writeHead(502); res.end('{"error":"counter down"}');
      });
      proxy.setTimeout(4000, () => { proxy.destroy(); if (n > 0) attempt(n - 1);
        else if (!res.headersSent) { res.writeHead(504); res.end('{"error":"timeout"}'); } });
      proxy.end();
    };
    attempt(2);
    return;
  }
  let f = path.join(ROOT, decodeURIComponent(u.pathname));
  if (u.pathname === '/' || !path.extname(u.pathname)) f = path.join(ROOT, 'index.html');
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('404'); }
    const send = () => {
      res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store' });
      res.end(buf);
    };
    if (SLOW_FONTS && u.pathname.indexOf('/fonts/') === 0) return setTimeout(send, SLOW_FONTS);
    send();
  });
}).listen(PORT, '127.0.0.1', () => console.log(`serve ${ROOT} → http://127.0.0.1:${PORT}` + (SLOW_FONTS ? ` (fonts +${SLOW_FONTS}ms)` : '')));
