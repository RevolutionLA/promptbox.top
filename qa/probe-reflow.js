// qa/probe-reflow.js —— 线上（慢源站）到底是谁在 ~2.8s 时把整屏往上顶：
// 每 200ms 记一次首屏关键块的盒子 + 遥测读数 + 字体加载状态，只在签名变化时打印。
const { chromium } = require('playwright-core');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const URL_ = process.argv[2] || 'https://promptbox.top/';
const RM = process.argv[3] === 'rm';
const SEL = ['.tele', '#h1', '.lede', '.latin'];
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: RM ? 'reduce' : 'no-preference' });
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: 'domcontentloaded' });
  const rows = [];
  for (let i = 0; i < 30; i++) {
    const r = await p.evaluate((sels) => {
      const t = Math.round(performance.now());
      const boxes = {};
      sels.forEach((s, i) => {
        const e = document.querySelector(s);
        if (e) { const q = e.getBoundingClientRect(); boxes['k' + i + s] = Math.round(q.y) + 'h' + Math.round(q.height); }
      });
      document.querySelectorAll('.tele dd').forEach((d, i) => { boxes['dd' + i] = String(d.textContent).trim().slice(0, 22); });
      return { t: t, boxes: boxes, fonts: document.fonts.status };
    }, SEL);
    rows.push(r);
    await p.waitForTimeout(200);
  }
  let last = '';
  rows.forEach(r => {
    const sig = JSON.stringify(r.boxes) + r.fonts;
    if (sig !== last) { console.log(String(r.t).padStart(5) + 'ms  fonts=' + r.fonts + '  ' + JSON.stringify(r.boxes)); last = sig; }
  });
  await b.close();
})();
