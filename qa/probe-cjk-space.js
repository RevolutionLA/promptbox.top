// qa/probe-cjk-space.js —— 找出"中文之间夹了一个空格"的地方。
// 这类空格几乎都来自 HTML 源码里的换行：中文不需要词间空格，渲染出来就是"， 中间"这种破口。
// 只扫真正的文本块（p/h2/blockquote…），并按渲染规则归一化：
//   文本节点内部的空白折叠成一个空格、跨标签拼接时不额外加分隔符。
//   这样 grid/flex 里上下两行的元素不会被误判成"中间有空格"。
const { chromium } = require('playwright-core');
const { chromePath } = require('./chromium');
const EXE = chromePath();
const CJK = '\\u3000-\\u303f\\u4e00-\\u9fff\\uff00-\\uffef';
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(1000);
  await p.evaluate(async () => { const H = document.body.scrollHeight;
    for (let y = 0; y <= H; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 50)); } scrollTo(0, 0); });
  await p.waitForTimeout(500);
  const out = await p.evaluate((c) => {
    const R = new RegExp('[' + c + '] +[' + c + ']', 'u');
    const norm = n => { if (n.nodeType === 3) return n.textContent.replace(/\s+/g, ' ');
      if (n.nodeType !== 1 || /^(script|style|svg)$/.test(n.tagName.toLowerCase())) return '';
      let s = ''; for (const k of n.childNodes) s += norm(k); return s; };
    const bad = [];
    document.querySelectorAll('p,h1,h2,h3,h4,h5,li,dd,dt,blockquote,q,cite').forEach(e => {
      if (e.closest('svg')) return;
      const t = norm(e).trim();
      const m = t.match(R);
      if (!m) return;
      const r = e.getBoundingClientRect();
      if (!r.width && !r.height) return;
      bad.push({ tag: e.tagName, cls: String(e.className).slice(0, 22),
        around: t.slice(Math.max(0, m.index - 10), m.index + 16) });
    });
    return bad;
  }, CJK);
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
