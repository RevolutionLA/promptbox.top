// qa/check-subset-coverage.js —— 子集缺字的真回归网。
//
// 为什么重来一遍：audit.js 里的 displayCoverage 用 document.fonts.check() 判断缺字，
// 而 Chromium 的 check() 回答的是"这串文本能不能被*某个*字体排出来"，不是"这个字面里有没有这个字形"。
// 实测：裁到只剩 26 个字形的 900 字面，对 'A' 'Z' 'Ω' 全部返回 true。
// 也就是说那条检查从写下那天起就是常绿的假绿灯——它一次也没抓到过缺字。
// 唯一的判据是字面文件自己的 cmap，那就直接读它。
//
// 用法: node check-subset-coverage.js [url]
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');

const { chromePath } = require('./chromium');
const EXE = chromePath();
const SITE = path.resolve(__dirname, '..', 'v3');
const URL_ = process.argv.slice(2).find(a => !a.startsWith('--')) || 'http://127.0.0.1:8099/';

// 家族 → 该由哪个文件负责。CJK 走显示体，拉丁走 Instrument Serif；
// Space Grotesk 故意不在表里：它是正文体，还要排后端现读的 GitHub 描述，没裁过，不该被这条检查管。
const FILES = {
  'Noto Serif SC Display': { '700': 'display-notoserifsc-700.woff2', '900': 'display-notoserifsc-900.woff2' },
  'Instrument Serif': { '400': 'instrument-serif-latin-400-normal.woff2', 'italic': 'instrument-serif-latin-400-italic.woff2' },
};
const CJK = /[\u3000-\u9fff\uff01-\uffef\u2018-\u201f\u2026\u00b7\u300c\u300d\u300e\u300f]/;

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(URL_, { waitUntil: 'load' });
  await p.evaluate(async () => { const H = document.body.scrollHeight;
    for (let y = 0; y < H; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 45)); } scrollTo(0, 0); });
  await p.waitForTimeout(2000);

  const used = await p.evaluate(() => {
    const SUB = ['Noto Serif SC Display', 'Instrument Serif'];
    const out = {};                       // "family|weight|italic?" -> { chars: {ch: 出现处}, }
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const txt = (n.textContent || '').trim(); if (!txt) continue;
      const el = n.parentElement; if (!el) continue;
      const s = getComputedStyle(el);
      const stack = s.fontFamily.split(',').map(x => x.replace(/["'\s]/g, '')).filter(Boolean);
      const norm = stack[0] === 'NotoSerifSCDisplay' ? 'Noto Serif SC Display'
                 : stack[0] === 'InstrumentSerif' ? 'Instrument Serif' : null;
      if (!norm) continue;
      const it = s.fontStyle === 'italic';
      const key = norm + '|' + s.fontWeight + '|' + (it ? 'italic' : 'normal');
      out[key] = out[key] || {};
      for (const ch of txt) {
        if (/\s/.test(ch)) continue;
        (out[key][ch] = out[key][ch] || []).push((el.className || el.tagName).slice(0, 18));
      }
    }
    return out;
  });
  await b.close();

  // 每个 woff2 的 cmap 一次性问完 python
  const py = `
import json,sys
from fontTools.ttLib import TTFont
out={}
for f in sys.argv[1:]:
    try: out[f.split('\\\\')[-1]] = sorted(set(TTFont(f).getBestCmap().keys()))
    except Exception as e: out[f.split('\\\\')[-1]] = 'ERR:'+str(e)
print(json.dumps(out))`;
  const allFiles = Object.values(FILES).flatMap(m => Object.values(m).map(f => path.join(SITE, 'fonts', f)));
  const dump = JSON.parse(execFileSync('python', ['-c', py, ...allFiles], { encoding: 'utf8', maxBuffer: 1 << 26 }));

  let bad = 0, checked = 0;
  // --probe=家族:字  —— 往检查里塞一个"如果文案改成这个字会不会被抓到"的字符。
  // 一条全绿的检查如果没法被人为弄红，它就还是常绿的假绿灯；这个开关就是它的自检。
  const probe = (process.argv.find(a => a.startsWith('--probe=')) || '').slice(8);
  if (probe) { const i = probe.indexOf(':'); const pf = probe.slice(0, i), pc = probe.slice(i + 1);
    const k = Object.keys(used).find(x => x.startsWith(pf + '|')) || pf + '|900|normal';
    used[k] = used[k] || {}; used[k][pc] = ['--probe--'];
    console.log('（塞入探针: ' + k + ' ← ' + pc + '）'); }
  for (const key in used) {
    const [fam, weight, style] = key.split('|');
    const file = FILES[fam][style === 'italic' ? 'italic' : weight] || FILES[fam][weight];
    if (!file) { console.log('? ' + key + ' 没有对应的子集文件映射，加进 FILES'); bad++; continue; }
    const cps = dump[file];
    if (!Array.isArray(cps)) { console.log('✗ 读不到 cmap:', file, cps); bad++; continue; }
    const have = new Set(cps);
    const miss = [];
    for (const ch in used[key]) {
      const cp = ch.codePointAt(0);
      // 拉丁字母交给 Instrument Serif，中文交给显示体；两边各管各的，跨界本来就允许
      if (fam === 'Noto Serif SC Display' && !CJK.test(ch) && /[A-Za-z0-9]/.test(ch)) continue;
      if (fam === 'Instrument Serif' && CJK.test(ch)) continue;
      checked++;
      if (!have.has(cp)) miss.push(ch + '(' + used[key][ch][0] + '×' + used[key][ch].length + ')');
    }
    const label = (fam + ' ' + weight + (style === 'italic' ? ' italic' : '')).padEnd(30);
    if (miss.length) { bad++; console.log('✗ ' + label + file.padEnd(40) + '缺 ' + miss.length + ': ' + miss.slice(0, 12).join(' ')); }
    else console.log('✓ ' + label + file.padEnd(40) + Object.keys(used[key]).length + ' 字全覆盖');
  }
  console.log('\n逐字核对了 ' + checked + ' 个字形归属，缺字 ' + bad + ' 项' +
    (bad ? ' —— 改了文案就得重裁：node qa/mk-latin-subset.js --apply / node qa/mk-display-subset.js --apply' : ''));
  process.exit(bad ? 1 : 0);
})();
