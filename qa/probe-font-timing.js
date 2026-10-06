// qa/probe-font-timing.js —— 首屏那几个元素各自用哪个字面、字体请求各自什么时候到货（线上慢源站才看得出问题）
const { chromium } = require('playwright-core');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const URL_ = process.argv[2] || 'https://promptbox.top/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const reqs = [];
  p.on('response', r => {
    const u = r.url();
    if (u.indexOf('/fonts/') >= 0 || u.indexOf('/api/') >= 0) {
      const t = r.request().timing();
      reqs.push([Math.round(t.responseStart > 0 ? t.responseStart : -1), u.split('/').pop().slice(0, 44), r.status()]);
    }
  });
  await p.goto(URL_, { waitUntil: 'load' });
  await p.waitForTimeout(3500);
  const fams = await p.evaluate(() => {
    return ['.eyebrow', '#h1', '.lede', '.lede strong', '.latin .serif', '.latin .role', '.tele dt', '.tele dd'].map(s => {
      const e = document.querySelector(s); if (!e) return s + ' MISSING';
      const c = getComputedStyle(e);
      return s + ': ' + c.fontFamily.split(',')[0] + ' w' + c.fontWeight + ' ' + Math.round(parseFloat(c.fontSize)) + 'px';
    });
  });
  console.log(fams.join('\n'));
  console.log('--- 到货时间 ---');
  reqs.sort((a, c) => a[0] - c[0]).forEach(r => console.log(String(r[0]).padStart(6) + 'ms  ' + r[1] + '  ' + r[2]));
  await b.close();
})();
