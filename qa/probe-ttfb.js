// qa/probe-ttfb.js —— 线上首字节到底多少：分别用系统代理和 --no-proxy-server 各跑一次，
// 判断审计里那 2.7s 的 FCP 是站点慢，还是我这台机器的代理在加时。
const { chromium } = require('playwright-core');
const { chromePath } = require('./chromium');
const EXE = chromePath();
const URL_ = process.argv[2] || 'https://promptbox.top/';
async function run(label, args) {
  const b = await chromium.launch({ executablePath: EXE, args });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: 'load' });
  const t = await p.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const f = performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint');
    return { ttfb: Math.round(n.responseStart), domLoad: Math.round(n.domContentLoadedEventEnd),
      load: Math.round(n.loadEventEnd), fcp: f ? Math.round(f.startTime) : null,
      encoded: n.encodedBodySize, sock: n.responseEnd - n.responseStart };
  });
  console.log(label.padEnd(12), 'ttfb=' + t.ttfb, 'fcp=' + t.fcp, 'DOMContentLoaded=' + t.domLoad,
    'load=' + t.load, 'body=' + t.encoded + 'B', '下载=' + Math.round(t.sock) + 'ms');
  await b.close();
}
(async () => {
  await run('系统代理', []);
  await run('直连', ['--no-proxy-server']);
  await run('直连2', ['--no-proxy-server']);
})().catch(e => { console.error(e); process.exit(1); });
