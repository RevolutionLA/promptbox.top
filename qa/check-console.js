// qa/check-console.js —— 页面自己的控制台，不带任何测量钩子。
// 为什么要单独一个脚本：audit.js 的注入脚本（PerformanceObserver / getEntriesByType）也会往控制台里
// 丢东西，报告里那条 "Deprecated API for given entry type." 的 location.url 是空串 ⇒ 匿名脚本 ⇒ 是我的钩子，
// 不是页面。这个脚本把钩子全部拿掉，只留下"一个真实访客会做的事"，让结论无可推诿：
// 干净就是干净，脏就是页面脏。
// 用法: node qa/check-console.js [url]
const { chromium } = require('playwright-core');
const { chromePath } = require('./chromium');
const EXE = chromePath();
const URL_ = process.argv[2] || 'http://127.0.0.1:8099/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });
  const out = [];
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844, mobile: true }]) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: !!vp.mobile, hasTouch: !!vp.mobile,
      reducedMotion: 'no-preference' });
    const p = await ctx.newPage();
    const msgs = [], errs = [];
    p.on('console', m => { if (m.type() === 'warning' || m.type() === 'error')
      msgs.push(m.type() + ' "' + m.text().slice(0, 60) + '" url=' + JSON.stringify(m.location().url)); });
    p.on('pageerror', e => errs.push(String(e && e.message || e).slice(0, 120)));
    await p.goto(URL_, { waitUntil: 'load' });
    await p.waitForFunction(() => !document.documentElement.classList.contains('fonts-holding'), { timeout: 15000 }).catch(() => {});
    const r = await p.locator('#h1').boundingBox();
    for (let k = 0; k < 5; k++) await p.mouse.move(r.x + 40 + k * 90, r.y + r.height / 2, { steps: 10 });
    await p.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    const n = await p.evaluate(() => Math.ceil(document.body.scrollHeight / innerHeight));
    for (let i = 1; i <= n; i++) { await p.evaluate(i => window.scrollTo({ top: i * innerHeight, behavior: 'smooth' }), i); await p.waitForTimeout(700); }
    await p.evaluate(() => window.scrollTo({ top: 0 }));
    await p.waitForTimeout(800);
    out.push({ vp: vp.width + (vp.mobile ? ' touch' : ' desk'), errs, msgs: [...new Set(msgs)] });
    await ctx.close();
  }
  for (const o of out) console.log(o.vp.padEnd(11), 'page_errors', o.errs.length, o.errs.slice(0, 2),
    '| warning/error', o.msgs.length, o.msgs.slice(0, 4));
  await b.close();
})();
