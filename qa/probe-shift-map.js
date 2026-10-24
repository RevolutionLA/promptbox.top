// qa/probe-shift-map.js —— 把"哪一块在动"和"什么时候动"对齐：
// 每 50ms 记一次首屏各块的 y/h，同时收 layout-shift，打印位移前后 300ms 内的布局快照。
const { chromium } = require('playwright-core');
const { chromePath } = require('./chromium');
const EXE = chromePath();
const URL_ = process.argv[2] || 'https://promptbox.top/';
const RM = process.argv[3] === 'rm';
const MOBILE = process.argv.indexOf('mobile') > 0;
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });
  const ctx = await b.newContext({ viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 }, reducedMotion: RM ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 160)));
  await p.addInitScript(() => {
    window.__s = { snaps: [], shifts: [] };
    const sel = [['tele', '.tele'], ['eye', '.eyebrow'], ['h1', '#h1'], ['latin', '.latin'], ['lede', '.lede'], ['side', '.hero-side'], ['hero', '.hero'],
      ['now', '#now'], ['work', '#work'], ['log', '#log'], ['craft', '#craft'], ['ganbei', '#ganbei'], ['connect', '#connect'], ['stage', '.stage']];
    setInterval(() => {
      if (!document.body) return;
      const row = { t: Math.round(performance.now()), cls: document.documentElement.className || '-', b: {} };
      sel.forEach(([k, s]) => {
        const e = document.querySelector(s);
        if (!e) { row.b[k] = 'x'; return; }
        const q = e.getBoundingClientRect();
        // 有效透明度：父级为 0 时子级也算看不见，这里手写一次向上追溯
        let op = 1, n = e;
        while (n && n !== document.body) { const o = +getComputedStyle(n).opacity; if (o < op) op = o; n = n.parentElement; }
        row.b[k] = Math.round(q.y) + 'h' + Math.round(q.height) + (op < 0.05 ? '*' : '');
      });
      window.__s.snaps.push(row);
    }, 50);
    new PerformanceObserver(l => l.getEntries().forEach(e => {
      if (e.value < 0.001) return;
      window.__s.shifts.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4),
        who: (e.sources || []).slice(0, 3).map(s => (s.node.nodeType === 3 ? (s.node.parentElement || {}).tagName : s.node.nodeName) +
          ' y' + Math.round(s.previousRect.top) + '→' + Math.round(s.currentRect.top) + ' h' + Math.round(s.previousRect.height) + '→' + Math.round(s.currentRect.height)).join(' | ') });
    })).observe({ type: 'layout-shift', buffered: true });
  });
  await p.goto(URL_, { waitUntil: 'load' });
  await p.waitForTimeout(6500);
  const d = await p.evaluate(() => ({ s: window.__s,
    f: performance.getEntriesByType('resource').filter(e => /\.woff2?$/.test(e.name))
      .map(e => Math.round(e.responseEnd) + 'ms ' + e.name.split('/').pop().slice(0, 38)).sort() }));
  console.log(d.f.join('\n'));
  d.shifts = d.s.shifts;
  console.log(URL_ + (RM ? ' [rm]' : '') + (MOBILE ? ' [390x844]' : '') + '   (*=含父级在内此刻不可见)');
  d.shifts.forEach(sh => {
    console.log('\n>>> ' + sh.t + 'ms  CLS +' + sh.v + '  ' + sh.who);
    d.s.snaps.filter(s => s.t >= sh.t - 260 && s.t <= sh.t + 160).forEach(s => console.log('    ' + String(s.t).padStart(5) + ' [' + s.cls + '] ' + JSON.stringify(s.b)));
  });
  if (!d.shifts.length) console.log('无位移');
  console.log('\n闸门: ' + d.s.snaps.filter((s, i, a) => i === 0 || a[i - 1].cls !== s.cls).map(s => s.t + '=' + (s.cls || '-')).join('  '));
  await b.close();
})();
