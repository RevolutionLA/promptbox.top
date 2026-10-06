// qa/probe-hold.js —— 线上首屏到底几点落地：字体闸门什么时候加上/撤掉、
// 每套字面几点到货、撤闸之后还有没有位移。本地测不出这套时序，只能打线上。
const { chromium } = require('playwright-core');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const URL_ = process.argv[2] || 'https://promptbox.top/';
const RM = process.argv[3] === 'rm';
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: RM ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 160)));
  await p.addInitScript(() => {
    window.__h = { hold: [], fonts: [], shifts: [] };
    const t = () => Math.round(performance.now());
    // 注意：addInitScript 跑得太早，documentElement 可能还是 null，
    // 直接 observe 会抛异常并把整段 init 脚本打死（前面就栽在这儿，测出来一片空白）。
    const watchClass = () => {
      if (!document.documentElement) return setTimeout(watchClass, 4);
      new MutationObserver(() => window.__h.hold.push(t() + ' ' + document.documentElement.className))
        .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    };
    watchClass();
    new PerformanceObserver(l => l.getEntries().forEach(e => {
      if (/\.woff2?(\?|$)/.test(e.name) || e.initiatorType === 'css') window.__h.fonts.push(Math.round(e.responseEnd) + 'ms ' + e.name.split('/').pop().slice(0, 40));
    })).observe({ type: 'resource', buffered: true });
    new PerformanceObserver(l => l.getEntries().forEach(e => {
      if (e.value < 0.002) return;
      window.__h.shifts.push(t() + 'ms shift ' + e.value.toFixed(4) + ' :: ' + (e.sources || []).slice(0, 2).map(s =>
        (s.node.nodeType === 3 ? (s.node.parentElement ? s.node.parentElement.tagName.toLowerCase() + '.' + String(s.node.parentElement.className).slice(0, 12) : 'text') : s.node.nodeName) +
        ' «' + String(s.node.textContent || '').trim().slice(0, 18) + '» y' + Math.round(s.previousRect.top) + '→' + Math.round(s.currentRect.top) +
        ' w' + Math.round(s.previousRect.width) + '→' + Math.round(s.currentRect.width)).join(' | '));
    })).observe({ type: 'layout-shift', buffered: true });
  });
  await p.goto(URL_, { waitUntil: 'load' });
  await p.waitForTimeout(7000);
  const out = await p.evaluate(() => window.__h);
  console.log(URL_ + (RM ? ' [reduced-motion]' : ''));
  console.log('— 闸门 class 变化 —'); out.hold.forEach(x => console.log('  ' + x));
  console.log('— 字体到货 —'); out.fonts.forEach(x => console.log('  ' + x));
  console.log('— 位移 —'); out.shifts.forEach(x => console.log('  ' + x));
  await b.close();
})();
