// qa/probe-small.js —— 列出页面上所有字号 < 12.5px 的可见文本元素，用来复核审计脚本的漏网项
const { chromium } = require('playwright-core');
const { chromePath } = require('./chromium');
const EXE = chromePath();
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  // 先把整页滚一遍，让 .rv 揭示动画都点亮，否则未揭示的元素会被 opacity 过滤掉
  await p.evaluate(async () => { const H = document.body.scrollHeight;
    for (let y = 0; y <= H; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); }
    scrollTo(0, 0); });
  await p.waitForTimeout(600);
  const out = await p.evaluate(() => {
    const vis = e => { const r = e.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const s = getComputedStyle(e);
      return s.visibility !== 'hidden' && +s.opacity > .05 && r.bottom > 0; };
    const res = [];
    document.querySelectorAll('*').forEach(e => {
      const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!own || !vis(e)) return;
      const s = getComputedStyle(e); const f = parseFloat(s.fontSize);
      if (f < 12.5) res.push({ t: e.textContent.trim().slice(0, 22), size: s.fontSize,
        tag: e.tagName, cls: String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).slice(0, 26) });
    });
    return res;
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
