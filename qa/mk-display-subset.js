// qa/mk-display-subset.js —— 重算"显示体到底用到了哪些字"，再据此裁子集。
// 为什么要有这个脚本：子集是按上一版文案（含已删掉的干杯那一屏）裁的，108 个字 × 3 个字重 ≈ 59KB，
// 其中大部分字这一版根本不渲染。裁到真正用到的字，首屏字体重量直接砍掉一大截。
// 用法: node mk-display-subset.js [--apply]
//   不带 --apply 只打印将要裁的字和预计影响；带 --apply 才写文件（旧文件先挪进带日期的隔离目录，不删）。
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const ROOT = path.resolve(__dirname);
const SITE = path.join(ROOT, '..', 'v3');
const APPLY = process.argv.includes('--apply');
// 兜底字符：数字和常见中文标点。它们现在没出现在标题里，但榜单一重排、文案一改就会用到，
// 而每个只多约 100 字节 —— 比"上线后标题缺字"便宜得多。
const SAFE = '0123456789，。、·—…「」『』（）：；';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://127.0.0.1:8099/', { waitUntil: 'load' });
  await p.waitForTimeout(2600);
  const used = await p.evaluate(() => {
    const out = {};
    document.querySelectorAll('h1,h2,h3,h4,.sec-head h2').forEach(el => {
      const fam = getComputedStyle(el).fontFamily;
      // computed style 会带引号：'"Noto Serif SC Display", Songti SC, …' —— 不去引号就永远判成"没用到"
      if (fam.split(',')[0].replace(/["'\s]/g, '') !== 'NotoSerifSCDisplay') return;
      const w = getComputedStyle(el).fontWeight;
      (out[w] = out[w] || new Set());
      for (const ch of el.textContent) if (ch.trim()) out[w].add(ch);
    });
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].join('')]));
  });
  await b.close();
  const weights = Object.keys(used).sort();
  console.log('渲染时真正用到显示体的字重：', weights.join(' / ') || '（无）');
  for (const w of weights) console.log(`  ${w}: ${new Set((used[w] + SAFE).split('')).size} 字  ${used[w]}`);
  if (!APPLY) { console.log('（预演，未写文件；加 --apply 才裁）'); return; }
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const quarantine = path.join(ROOT, 'old', `display-subset-${stamp}`);
  fs.mkdirSync(quarantine, { recursive: true });
  for (const w of weights) {
    const chars = [...new Set((used[w] + SAFE).split(''))].join('');
    const txt = path.join(ROOT, `tmp-subset-${w}.txt`);
    fs.writeFileSync(txt, chars);
    const src = path.join(ROOT, 'fonts-src', `notoserifsc-${w}.ttf`);
    const out = path.join(SITE, 'fonts', `display-notoserifsc-${w}.woff2`);
    if (fs.existsSync(out)) fs.copyFileSync(out, path.join(quarantine, path.basename(out)));
    const args = [src, `--text-file=${txt}`, '--flavor=woff2',
      `--output-file=${out}`, '--layout-features=kern,liga,locl,ccmp', '--no-hinting',
      '--desubroutinize', '--drop-tables+=GSUB,DROP_KP', '--name-IDs=', '--notdef-outline'];
    const r = cp.spawnSync('pyftsubset', args, { shell: true, encoding: 'utf8' });
    if (r.status !== 0) { console.error('pyftsubset 失败:', (r.stderr || '').slice(-400)); process.exit(1); }
    console.log(`  裁好 ${path.basename(out)} → ${fs.statSync(out).size} B（旧版已挪到 ${quarantine}）`);
  }
  // 没被任何元素用到的字重，@font-face 也得一起撤掉，否则浏览器仍会去下载它
  console.log('仍在 v3/fonts 里的显示体文件：',
    fs.readdirSync(path.join(SITE, 'fonts')).filter(f => f.indexOf('display-') === 0).join(' '));
})();
