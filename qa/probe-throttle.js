// qa/probe-throttle.js —— 自保规则本身的自检：该收时才收，不该收时不收，收下去要能到底。
//   ① 正常机器（不录制）        → 帧率低不是我这层的账时不许降；真要降，也得降在"辉光/残影/火星"这一刀上
//   ② 录像机（录制中）          → cost 会被录制抬高，允许降一档，但帧率必须回到 55+
//   ③ 慢 CPU（CDP 6× 节流）     → cost 爆表：必须一路降到底（q=0 → 抽粒子 → 撤 fx-live）
//   ④ ?fxlock=2 钉住            → 任何环境都必须保持 2（录像取证用）
//   ⑤ ?fxlock=2 + 慢 CPU        → 同上，钉死优先于自保
// 轨迹打印成 "3s:q2/60fps/cost4" 这样的串，一眼能看出有没有 2↔1 来回抖。
// 用法: node qa/probe-throttle.js [url]
const { chromium } = require('playwright-core');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:8099/';

async function cell(browser, { name, url, throttle, record, sweepMs = 9000 }) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    recordVideo: record ? { dir: require('os').tmpdir(), size: { width: 854, height: 480 } } : undefined });
  const p = await ctx.newPage();
  if (throttle) { const c = await ctx.newCDPSession(p); await c.send('Emulation.setCPUThrottlingRate', { rate: throttle }); }
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !document.documentElement.classList.contains('fonts-holding'), { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(3800);                       // 让自保跨过 3 秒宽限期
  const r = await p.locator('#h1').boundingBox();
  const t0 = Date.now();
  const trail = [];
  let last = 0;
  while (Date.now() - t0 < sweepMs) {
    const k = ((Date.now() - t0) / 240 | 0) % 6;
    await p.mouse.move(r.x + 60 + k * 100, r.y + r.height * (.35 + .12 * (k % 3)), { steps: 8 });
    const el = Date.now() - t0;
    if (el - last > 1400) { last = el;
      const f = await p.evaluate(() => { const cv = document.getElementById('fx');
        return cv && cv.__fx ? { fps: cv.__fx.fps, q: cv.__fx.q, pn: cv.__fx.pn, cost: cv.__fx.cost } : { gone: true }; });
      trail.push(`${(el / 1000).toFixed(0)}s:${f.gone ? 'gone' : 'q' + f.q + '/' + f.fps + 'fps/' + f.cost}ms`); }
  }
  const fin = await p.evaluate(() => { const cv = document.getElementById('fx'), f = cv && cv.__fx;
    return { live: document.documentElement.classList.contains('fx-live'), pn: f && f.pn, q: f && f.q }; });
  await ctx.close();
  console.log(name.padEnd(24), trail.join(' '), '| fx-live=' + fin.live, 'pn=' + fin.pn);
}

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server', '--force-device-scale-factor=1'] });
  console.log('URL', BASE);
  await cell(b, { name: '① 正常机器', url: BASE, sweepMs: 16000 });
  await cell(b, { name: '② 录像机', url: BASE, record: true, sweepMs: 12000 });
  await cell(b, { name: '③ 慢 CPU(6×)', url: BASE, throttle: 6, sweepMs: 26000 });
  await cell(b, { name: '④ ?fxlock=2', url: BASE + (BASE.includes('?') ? '&' : '?') + 'fxlock=2', sweepMs: 10000 });
  await cell(b, { name: '⑤ ?fxlock=2 + 6×', url: BASE + (BASE.includes('?') ? '&' : '?') + 'fxlock=2', throttle: 6, sweepMs: 10000 });
  await b.close();
})();
