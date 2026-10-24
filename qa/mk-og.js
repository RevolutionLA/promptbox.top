// qa/mk-og.js —— 把 qa/ogcard.html 渲成 1200×630 的 v3/og.png（社交分享卡片）
// 用法: node qa/mk-og.js
const { chromium } = require('playwright-core');
const path = require('path');

const { chromePath } = require('./chromium');
const EXE = chromePath();
const SRC = 'file:///' + path.join(__dirname, 'ogcard.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, '..', 'v3', 'og.png');

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await p.goto(SRC, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log('og.png →', OUT);
  await b.close();
})();
