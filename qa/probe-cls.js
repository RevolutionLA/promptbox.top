// qa/probe-cls.js —— 找出线上 CLS 的位移源：PerformanceObserver 的 layout-shift 条目带 sources（元素 + 位移前后盒子）
const { chromium } = require('playwright-core');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const URL_ = process.argv[2] || 'https://promptbox.top/';
// 第三个参数传 rm：线上 reduced-motion 变体的 CLS 明显比正常模式大，得看见是谁在动
const RM = process.argv[3] === 'rm';
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: RM ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    window.__shifts = [];
    new PerformanceObserver(l => l.getEntries().forEach(e => {
      if (e.value < 0.001) return;
      window.__shifts.push({ value: +e.value.toFixed(4), time: Math.round(e.startTime),
        src: (e.sources || []).slice(0, 3).map(s => ({
          node: (s.node.nodeName || '') + '.' + ((s.node.className && String(s.node.className).slice(0, 24)) || s.node.id || ''),
          // #text 节点光看名字没法定位，得知道它挂在哪个元素里、写的是什么
          where: s.node.nodeType === 3
            ? (s.node.parentElement ? (s.node.parentElement.tagName.toLowerCase() +
                (s.node.parentElement.id ? '#' + s.node.parentElement.id : '') +
                (s.node.parentElement.className && String(s.node.parentElement.className).indexOf('rv') >= 0 ? '.rv' : '')) : '?') +
              ' «' + String(s.node.textContent).trim().slice(0, 28) + '»'
            : (s.node.textContent || '').trim().slice(0, 28),
          from: s.previousRect && [Math.round(s.previousRect.x), Math.round(s.previousRect.y), Math.round(s.previousRect.width), Math.round(s.previousRect.height)],
          to: s.currentRect && [Math.round(s.currentRect.x), Math.round(s.currentRect.y), Math.round(s.currentRect.width), Math.round(s.currentRect.height)] })) });
    })).observe({ type: 'layout-shift', buffered: true });
  });
  await p.goto(URL_, { waitUntil: 'load' });
  await p.waitForTimeout(6000);
  const out = await p.evaluate(() => ({ total: +window.__shifts.reduce((a, s) => a + s.value, 0).toFixed(4), shifts: window.__shifts }));
  console.log(URL_ + (RM ? ' [reduced-motion]' : ''));
  console.log('total CLS =', out.total);
  out.shifts.forEach(s => {
    console.log(`  ${s.time}ms  ${s.value}`);
    s.src.forEach(x => console.log(`      ${x.node}  ${x.where || ''}  ${JSON.stringify(x.from)} → ${JSON.stringify(x.to)}`));
  });
  console.log('fonts:', await p.evaluate(() => document.fonts.status));
  await b.close();
})();
