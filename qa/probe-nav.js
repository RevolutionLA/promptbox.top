// qa/probe-nav.js —— 窄屏导航条：各宽度下能不能放得下六个链接、渐隐有没有正确出现/消失
const { chromium } = require('playwright-core');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const URL_ = process.argv[2] || 'http://127.0.0.1:8099/';
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  for (const w of [320, 360, 390, 414, 430, 480, 620, 768]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
    const p = await ctx.newPage();
    await p.goto(URL_, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    const r = await p.evaluate(() => {
      const s = document.querySelector('.nav-links'), m = document.querySelector('.mark');
      const links = [...s.querySelectorAll('a')].map(a => a.getBoundingClientRect());
      const last = links[links.length - 1];
      return {
        room: Math.round(s.scrollWidth - s.clientWidth),
        fade: s.classList.contains('can-scroll'),
        markW: Math.round(m.getBoundingClientRect().width),
        markH: Math.round(m.getBoundingClientRect().height),
        lastVisible: Math.round(last.right) <= Math.round(s.getBoundingClientRect().right) + 1,
        clipped: links.filter(x => Math.round(x.right) > Math.round(s.getBoundingClientRect().right) + 1).length,
        minTap: Math.min(...links.map(x => Math.round(Math.min(x.width, x.height))), Math.round(Math.min(m.getBoundingClientRect().width, m.getBoundingClientRect().height)))
      };
    });
    console.log(String(w).padStart(4),
      '放不下' + String(r.room).padStart(4) + 'px',
      '渐隐=' + (r.fade ? '有' : '无'),
      '末项完整=' + (r.lastVisible ? '是' : '否'),
      '被切的项=' + r.clipped,
      '猫=' + r.markW + 'x' + r.markH,
      '最小点击区=' + r.minTap + 'px');
    await ctx.close();
  }
  await b.close();
})();
