// qa/probe-copy.js —— 验证微信那一行的复制反馈真的会动（含剪贴板内容）
const { chromium } = require('playwright-core');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:8099' });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load' });
  const btn = await p.$('.conn .cpy');
  await btn.scrollIntoViewIfNeeded(); await p.waitForTimeout(1200);
  const before = await p.evaluate(() => document.querySelector('.conn .cpy .h').textContent.trim());
  await btn.click(); await p.waitForTimeout(400);
  const after = await p.evaluate(() => document.querySelector('.conn .cpy .h').textContent.trim());
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => 'DENIED'));
  await p.waitForTimeout(2600);
  const restored = await p.evaluate(() => document.querySelector('.conn .cpy .h').textContent.trim());
  await p.screenshot({ path: 'shots/probe-copy.png' });
  console.log(JSON.stringify({ before, after, clip, restored }, null, 1));
  await b.close();
})();
