// qa/probe-hero-faces.js —— 首屏到底用到哪几套字面。
// 闸门等一份、页面用另一份，是两种各自都活得过去的 bug：等多了首屏白等（线上实测多等 2.9s），
// 等少了字体到货时重排记进 CLS。所以这张清单必须是量出来的，不是从 CSS 里读出来的。
// 判定按"这个字面覆盖不包括这段字符"来分：纯中文落在系统黑体上，不该把 Space Grotesk 拖进关键路径。
const { chromium } = require('playwright-core');
const { chromePath } = require('./chromium');
const EXE = chromePath();
const URL_ = process.argv[2] || 'http://127.0.0.1:8099/';
const V = (process.argv[3] || '1440x900').split('x').map(Number);

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });
  const p = await (await b.newContext({ viewport: { width: V[0], height: V[1] } })).newPage();
  await p.goto(URL_, { waitUntil: 'load' });
  await p.waitForTimeout(2500);

  const out = await p.evaluate((vh) => {
    const LATIN = /[\x20-\x7E]/;                       // woff2 拉丁子集覆盖的范围
    const CJK = /[\u3000-\u9fff\uff00-\uffef]/;
    const faces = new Map();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const txt = n.textContent.trim(); if (!txt) continue;
      const el = n.parentElement; if (!el) continue;
      if (!el.closest('#top') && !el.closest('header') && !el.closest('nav')) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh) continue;      // 折叠线以下不算首屏
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue;
      const stack = s.fontFamily.split(',').map(x => x.replace(/["'\s]/g, '')).filter(Boolean);
      // 逐字符归给字面栈里第一个"声称覆盖它"的族——这就是浏览器实际会用的那一套
      for (const ch of txt) {
        if (/\s/.test(ch)) continue;
        let fam = null;
        for (const f of stack) {
          const web = /Noto Serif SC Display|Space Grotesk|Instrument Serif/.test(f);
          if (web && !LATIN.test(ch)) continue;         // 拉丁子集不覆盖中文
          if (f === 'Noto Serif SC Display' && !CJK.test(ch)) continue;
          fam = f; break;
        }
        if (!fam) fam = '(系统栈)';
        const style = (s.fontStyle === 'italic' ? 'italic ' : '') + s.fontWeight;
        const id = `${style} ${fam}`;
        if (!faces.has(id)) faces.set(id, { n: 0, where: new Set(), sample: '' });
        const f = faces.get(id);
        f.n++; if (f.where.size < 4) f.where.add((el.className || el.tagName).slice(0, 20));
        if (!f.sample) f.sample = txt.slice(0, 20);
      }
    }
    return [...faces.entries()]
      .map(([k, v]) => ({ face: k, chars: v.n, where: [...v.where].join(' '), sample: v.sample }))
      .sort((a, b) => b.chars - a.chars);
  }, V[1]);

  console.log(`视口 ${V[0]}x${V[1]} · 首屏实际用到的字面（按字符数）：`);
  out.forEach(o => console.log(`  ${o.face.padEnd(34)} ${String(o.chars).padStart(4)} 字  ${o.where.padEnd(26)}「${o.sample}」`));
  const web = out.filter(o => /Noto Serif SC Display|Space Grotesk|Instrument Serif/.test(o.face));
  console.log('\n闸门应当等的（webfont，首屏真出现）：');
  web.forEach(o => console.log('  ' + o.face));
  const gate = ['900 Noto Serif SC Display', '400 Space Grotesk', '500 Space Grotesk', '700 Space Grotesk',
                'italic 400 Instrument Serif'];
  const have = web.map(o => o.face);
  const over = gate.filter(g => !have.includes(g));
  const missed = have.filter(h => !gate.includes(h));
  console.log('\n闸门多等的（白等 = 线上首屏延迟）:', over.join(' ｜ ') || '（无）');
  console.log('闸门漏等的（漏 = 换字时记 CLS）:', missed.join(' ｜ ') || '（无）');
  await b.close();
})();
