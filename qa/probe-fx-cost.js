// qa/probe-fx-cost.js —— 掉帧到底是谁的钱：粒子层，还是"录像 + 鼠标事件 + 全站 hover/显影"这套外壳？
// 为什么单独做：录像那几次 take 里，静止段 58fps、鼠标横扫段 28–34fps。如果这 25fps 不全是粒子吃掉的，
// 那自保降级就在冤枉惩罚画质——它会把光晕、残影、火星关掉，而真正的开销来源根本没动。
// 四组同一环境对照，只差一个变量：
//   A 有画布 + 有鼠标   B 有画布 + 无鼠标   C 无画布 + 有鼠标   D 无画布 + 无鼠标
const { chromium } = require('playwright-core');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const URL_ = process.argv.find(a => a.startsWith('http')) || 'https://promptbox.top/';
const REC = process.argv.includes('--record');

const FPS = (ms) => new Promise(res => {
  let n = 0, t0 = performance.now(), prev = t0, worst = 0;
  (function f(now) {
    n++; const dt = now - prev; prev = now; if (n > 2 && dt > worst) worst = dt;
    if (now - t0 < ms) requestAnimationFrame(f);
    else res({ fps: +(n / ((now - t0) / 1000)).toFixed(1), worst: +worst.toFixed(1) });
  })(t0);
});

async function run(browser, { fx, move }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
    reducedMotion: fx ? 'no-preference' : 'reduce',
    recordVideo: REC ? { dir: require('os').tmpdir(), size: { width: 1280, height: 800 } } : undefined });
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !document.documentElement.classList.contains('fonts-holding'), { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(3000);
  const r = await p.locator('#h1').boundingBox();
  let out;
  if (move) {
    // 鼠标一边扫一边量帧率：这才是"他手放在页面上玩"的那个场景
    const done = p.evaluate(FPS, 3000);
    for (let k = 0; k < 6; k++) {
      await p.mouse.move(r.x + 40 + k * 60, r.y + r.height * (.4 + .1 * (k % 3)), { steps: 18 });
    }
    out = await done;
  } else {
    out = await p.evaluate(FPS, 3000);
  }
  out.canvas = await p.evaluate(() => !!document.getElementById('fx'));
  if (out.canvas) { const f = (await p.evaluate(() => { const cv = document.getElementById('fx'); return cv && cv.__fx ? { fps: cv.__fx.fps, q: cv.__fx.q, pn: cv.__fx.pn, cost: cv.__fx.cost } : null; })); Object.assign(out, f || {}); }
  await ctx.close();
  return out;
}

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server', '--force-device-scale-factor=1'] });
  const res = {};
  res['A 有画布+鼠标'] = await run(b, { fx: true, move: true });
  res['C 无画布+鼠标'] = await run(b, { fx: false, move: true });
  res['B 有画布+静止'] = await run(b, { fx: true, move: false });
  res['D 无画布+静止'] = await run(b, { fx: false, move: false });
  console.log(REC ? '（带录像开销）' : '（不带录像）');
  for (const k of Object.keys(res)) console.log(' ', k.padEnd(14), JSON.stringify(res[k]));
  await b.close();
})();
