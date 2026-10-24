// qa/probe-early.js —— 从第一帧起就盯着首屏那几个块：谁在什么时候改了高度、把谁顶上去。
// 用 addInitScript 在页面脚本之前装采样定时器，绕开 goto 之后才能开测的盲区。
const { chromium } = require('playwright-core');
const { chromePath } = require('./chromium');
const EXE = chromePath();
const URL_ = process.argv[2] || 'https://promptbox.top/';
const RM = process.argv[3] === 'rm';
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: RM ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 160)));
  await p.addInitScript(() => {
    window.__e = [];
    const sel = [['tele', '.tele'], ['eye', '.eyebrow'], ['h1', '#h1'], ['latin', '.latin'], ['lede', '.lede'], ['side', '.hero-side']];
    setInterval(() => {
      if (!document.body) return;
      const t = Math.round(performance.now());
      const row = { t: t, cls: document.documentElement.className || '-', b: {} };
      sel.forEach(([k, s]) => {
        const e = document.querySelector(s);
        if (!e) { row.b[k] = 'x'; return; }
        const q = e.getBoundingClientRect();
        const st = getComputedStyle(e);
        row.b[k] = Math.round(q.y) + 'h' + Math.round(q.height) + (st.opacity === '0' ? '*' : '');
      });
      const sig = JSON.stringify(row.b);
      if (!window.__e.length || window.__e[window.__e.length - 1].sig !== sig) window.__e.push({ t: row.t, cls: row.cls, sig: sig });
    }, 60);
  });
  await p.goto(URL_, { waitUntil: 'load' });
  await p.waitForTimeout(6500);
  const rows = await p.evaluate(() => window.__e);
  console.log(URL_ + (RM ? ' [rm]' : '') + '   (*=该块此刻透明)');
  console.log('        tele / eyebrow / h1 / latin / lede / side');
  rows.forEach(r => console.log(String(r.t).padStart(5) + 'ms [' + r.cls + '] ' + r.sig));
  await b.close();
})();
