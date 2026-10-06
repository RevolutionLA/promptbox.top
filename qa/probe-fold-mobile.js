// qa/probe-fold-mobile.js —— 390×844 上，首屏到底装到了哪：证明块、正文、按钮各自的上下沿。
// 折线以下的 CTA 等于没有 CTA，所以这几个数得能量出来，不能靠肉眼猜。
const { chromium } = require('playwright-core');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const URL_ = process.argv[2] || 'http://127.0.0.1:8099/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  await p.goto(URL_, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const o = {};
    ['.eyebrow', '#h1', '.cat-spot', '.proof', '.lede', '.hero-cta'].forEach(s => {
      const e = document.querySelector(s);
      if (e) { const bb = e.getBoundingClientRect(); o[s] = [Math.round(bb.top), Math.round(bb.bottom)]; }
    });
    o.fold = innerHeight; return o;
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
