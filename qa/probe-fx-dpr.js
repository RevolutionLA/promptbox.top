// qa/probe-fx-dpr.js —— 只回答一个问题：把 deviceScaleFactor 提到 2 / 3（他的 X1 Yoga 就是高 DPI屏），
// 满画质粒子在"鼠标一边动一边量"的真实帧率是多少，自保降级最后停在哪一档。
// 用法: node qa/probe-fx-dpr.js [url] [1,2,3]
const { chromium } = require('playwright-core');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const URL_ = process.argv[2] || 'http://127.0.0.1:8099/';
const DS = (process.argv[3] || '2').split(',').map(Number).filter(Boolean);

const FPS = (ms) => new Promise(res => {
  let n = 0, t0 = performance.now();
  (function f(now) { n++; if (now - t0 < ms) requestAnimationFrame(f); else res(+(n / ((now - t0) / 1000)).toFixed(1)); })(t0);
});

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });
  for (const dpr of DS) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
    const p = await ctx.newPage();
    await p.goto(URL_, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !document.documentElement.classList.contains('fonts-holding'), { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(3500);
    const r = await p.locator('#h1').boundingBox();
    const done = p.evaluate(FPS, 3000);
    for (let k = 0; k < 8; k++) await p.mouse.move(r.x + 30 + k * 70, r.y + r.height * (.35 + .2 * (k % 3)), { steps: 14 });
    const fps = await done;
    const fx = await p.evaluate(() => { const cv = document.getElementById('fx'); return cv && cv.__fx ? { fps: cv.__fx.fps, q: cv.__fx.q, pn: cv.__fx.pn, cost: cv.__fx.cost } : null; });
    console.log(`DPR${dpr}  交互段实测 ${fps}fps  ${JSON.stringify(fx)}`);
    await ctx.close();
  }
  await b.close();
})();
