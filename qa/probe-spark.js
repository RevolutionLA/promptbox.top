// 临时探针：看波形线在 Visits 格子里到底排在哪儿
const { chromium } = require('playwright-core');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto('http://127.0.0.1:8099/', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const out = await p.evaluate(() => {
    const s = document.querySelector('.spark');
    const dd = s.closest('dd');
    const i = document.querySelector('#t-visits');
    const r = e => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const cs = getComputedStyle(dd);
    return { dd: r(dd), svg: r(s), num: r(i), whiteSpace: cs.whiteSpace, display: cs.display, ddWidth: Math.round(dd.getBoundingClientRect().width) };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
