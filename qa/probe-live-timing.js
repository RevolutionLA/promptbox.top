// qa/probe-live-timing.js —— 把线上 LCP 拆成可归因的几段。
// 为什么需要：本地永远量不到"投递底价"。这条把 HTML TTFB、每个字体的起止、闸门放闸时刻
// 全列出来，才能判断超时到底是谁的钱：是我的代码，还是隧道 + 边缘没缓存。
const { chromium } = require('playwright-core');
const { chromePath } = require('./chromium');
const EXE = chromePath();
const URL_ = process.argv[2] || 'https://promptbox.top/';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--force-device-scale-factor=1', '--no-proxy-server'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  // 在文档开始前就装好观察器，否则闸门那一刻已经过去了
  await p.addInitScript(() => {
    window.__t = { hold: [], start: performance.now() };
    const w = () => {
      if (!document.documentElement) return setTimeout(w, 2);
      const held = () => document.documentElement.classList.contains('fonts-holding');
      window.__t.hold.push([Math.round(performance.now()), held() ? 'on' : 'off']);
      new MutationObserver(() => window.__t.hold.push(
        [Math.round(performance.now()), held() ? 'on' : 'off']))
        .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    };
    w();
  });
  await p.goto(URL_, { waitUntil: 'load' });
  await p.waitForTimeout(3500);

  const r = await p.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const res = performance.getEntriesByType('resource')
      .filter(e => /\.woff2/.test(e.name) || /api\//.test(e.name))
      .map(e => ({ n: e.name.replace(/^https?:\/\//, '').slice(0, 52),
                   start: Math.round(e.startTime), end: Math.round(e.responseEnd),
                   size: e.transferSize, proto: e.nextHopProtocol }))
      .sort((a, b) => a.start - b.start);
    const paint = {};
    performance.getEntriesByType('paint').forEach(e => paint[e.name] = Math.round(e.startTime));
    const lcp = performance.getEntriesByType('largest-contentful-paint').slice(-1)[0];
    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      loadEnd: Math.round(nav.loadEventEnd),
      ttfb: Math.round(nav.responseStart),
      proto: nav.nextHopProtocol,
      paint, lcpEl: lcp && (lcp.element ? lcp.element.tagName + '.' + (lcp.element.className || '').split(' ')[0] : lcp && lcp.url),
      lcpAt: lcp && Math.round(lcp.startTime),
      hold: window.__t.hold, res,
    };
  });

  console.log('协议:', r.proto, '| HTML TTFB:', r.ttfb + 'ms', '| DCL:', r.domContentLoaded, '| load:', r.loadEnd);
  console.log('闸门事件:', r.hold.map(h => h[0] + h[1]).join(' → '));
  console.log('paint:', JSON.stringify(r.paint), '| LCP 元素:', r.lcpEl, '@', r.lcpAt + 'ms');
  console.log('资源（按发起时刻）:');
  r.res.forEach(e => console.log(`  ${String(e.start).padStart(5)} → ${String(e.end).padStart(5)}  ${String(Math.round(e.size / 1024)).padStart(3)}KB  ${e.proto}  ${e.n}`));
  await b.close();
})();
