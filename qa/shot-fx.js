// qa/shot-fx.js —— 粒子层只能靠"动起来的那一帧"判断好坏，静态整页截图看不出问题。
// 用法: node shot-fx.js [url] [label]
// 出四张：闸门刚放开时的名字聚拢 / 鼠标压在 h1 上的推开 / 点击爆发 / 滚动流
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const { chromePath } = require('./chromium');
const EXE = chromePath();
const URL_ = process.argv[2] || 'http://127.0.0.1:8099/';
const LABEL = process.argv[3] || 'fx';
const OUT = path.join(__dirname, 'shots', LABEL);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server', '--force-device-scale-factor=1'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(120);
  // 闸门刚放开：粒子正往字形上飞，这时候最密
  await p.waitForFunction(() => !document.documentElement.classList.contains('fonts-holding'), { timeout: 8000 }).catch(() => {});
  await p.screenshot({ path: path.join(OUT, 'a-assemble.png') });
  await p.waitForTimeout(1400);
  const r = await p.locator('#h1').boundingBox();
  // 鼠标压在名字中间：推开半径 110px，该看到一块明显的空洞
  await p.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.5, { steps: 24 });
  await p.waitForTimeout(260);
  await p.screenshot({ path: path.join(OUT, 'b-repel.png') });
  // 点击爆发：在空白处点一下，金色/青色粒子炸开
  await p.mouse.move(1050, 620, { steps: 20 });
  await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(120);
  await p.screenshot({ path: path.join(OUT, 'c-burst.png') });
  // 滚动流：快速滚一段，星点该被拉长
  await p.mouse.move(720, 400);
  for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, 260); await p.waitForTimeout(24); }
  await p.screenshot({ path: path.join(OUT, 'd-flow.png') });
  const stat = await p.evaluate(() => {
    const cv = document.getElementById('fx');
    if (!cv) return { fx: 'absent' };
    const s = getComputedStyle(cv);
    return { fx: 'on', opacity: s.opacity, pe: s.pointerEvents, pos: s.position,
      w: cv.width, h: cv.height, cls: cv.className };
  });
  console.log(JSON.stringify(stat));
  await b.close();
})();
