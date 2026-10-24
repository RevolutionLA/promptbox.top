// qa/probe-repeat.js —— 把"首访"和"复访"的 LCP 分开量。
// 归属要量清楚，不能靠推理：同一个上下文里连开两次，
//   第一次 = 冷缓存：HTML 走隧道 + 8 个字体各自一个往返；
//   第二次 = 字体全在磁盘缓存（nginx 给的是 max-age=604800 immutable），闸门只等 HTML 到货。
// 两次的差 = 字体这段路要的钱；第二次的绝对值 = HTML 没进边缘缓存时任何代码都压不下去的底。
const { chromium } = require('playwright-core');
const { chromePath } = require('./chromium');
const EXE = chromePath();
const URL_ = process.argv.find(a => a.startsWith('http')) || 'https://promptbox.top/';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  for (const pass of ['首访（冷缓存）', '复访（字体在磁盘缓存）']) {
    const p = await ctx.newPage();
    await p.addInitScript(() => {
      window.__t = { hold: [] };
      const w = () => { if (!document.documentElement) return setTimeout(w, 2);
        const held = () => document.documentElement.classList.contains('fonts-holding');
        window.__t.hold.push([Math.round(performance.now()), held() ? 'on' : 'off']);
        new MutationObserver(() => window.__t.hold.push(
          [Math.round(performance.now()), held() ? 'on' : 'off']))
          .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); };
      w();
      window.__l = [];
      new PerformanceObserver(l => l.getEntries().forEach(e => window.__l.push(e.startTime)))
        .observe({ type: 'largest-contentful-paint', buffered: true });
    });
    await p.goto(URL_, { waitUntil: 'load' });
    await p.waitForTimeout(4000);
    const r = await p.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const f = performance.getEntriesByType('resource').filter(e => /\.woff2/.test(e.name));
      return { ttfb: Math.round(nav.responseStart), total: Math.round(nav.responseEnd),
        fonts: f.length, fontTail: f.length ? Math.round(Math.max(...f.map(e => e.responseEnd))) : 0,
        gateOff: (window.__t.hold.filter(x => x[1] === 'off').pop() || [0])[0],
        lcp: window.__l.length ? Math.round(window.__l[window.__l.length - 1]) : null };
    });
    console.log(pass.padEnd(22) + 'HTML ttfb ' + String(r.ttfb).padStart(5) + 'ms · 字体 ' + r.fonts +
      ' 个，最晚 ' + String(r.fontTail).padStart(5) + 'ms · 放闸 ' + String(r.gateOff).padStart(5) +
      'ms · LCP ' + String(r.lcp).padStart(5) + 'ms');
    await p.close();
  }
  await b.close();
})();
