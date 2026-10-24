// qa/probe-q.js —— 一句话的问题：把光晕/残影/火星关掉，到底换回来多少帧率？
// 做法：同一台环境、同一段鼠标横扫，只差 `?fxlock=` 一个参数，q=2 / q=1 / q=0 各跑一遍。
// 只有 q=0 明显更快时，"降级"这动作才有意义；如果三档帧率一样，那降级就是在拿画质白送礼。
// 用法: node qa/probe-q.js [url]
const { chromium } = require('playwright-core');
const { chromePath } = require('./chromium');
const EXE = chromePath();
const BASE = process.argv[2] || 'http://127.0.0.1:8099/';

async function cell(browser, lock) {
  const url = BASE + (BASE.includes('?') ? '&' : '?') + 'fxlock=' + lock;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !document.documentElement.classList.contains('fonts-holding'), { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(3800);
  const r = await p.locator('#h1').boundingBox();
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    const k = ((Date.now() - t0) / 240 | 0) % 6;
    await p.mouse.move(r.x + 60 + k * 100, r.y + r.height * (.35 + .12 * (k % 3)), { steps: 8 });
    const f = await p.evaluate(() => { const cv = document.getElementById('fx'); return cv && cv.__fx ? { fps: cv.__fx.fps, q: cv.__fx.q, cost: cv.__fx.cost } : null; });
    if (f) samples.push(f);
  }
  const med = k => { const a = samples.map(s => s[k]).filter(v => v > 0).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : null; };
  await ctx.close();
  return { lock, fps: med('fps'), cost: med('cost'), q: med('q') };
}

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server', '--force-device-scale-factor=1'] });
  for (const lock of [2, 1, 0]) {
    const r = await cell(b, lock);
    console.log(`q=${r.lock}  帧率中位 ${String(r.fps).padStart(5)}  本层 cost 中位 ${String(r.cost).padStart(5)}ms`);
  }
  await b.close();
})();
