// qa/mk-latin-subset.js —— 拉丁字体按"谁的字"裁，不按"今天屏幕上有什么"裁。
//  dry-run:  node mk-latin-subset.js
//  落地:     node mk-latin-subset.js --apply
//
// 判据不是尺寸，是这段文字的**归属**：
//   · Instrument Serif 只排我自己的固定文案（名字、编号）→ 可以裁到实际用到的那几个字，
//     一个 21.6KB、一个 20.5KB，裁完各 1.5KB。首屏最晚到货的就是它。
//   · Space Grotesk 是界面正文，还要排后端现读的 GitHub 仓库描述——那些字符不归我定。
//     实测按 unicode-range 裁只能扔掉 230 个字形里的 7 个（希腊/西里尔），省 0.2KB，
//     为此把正文体换成子集是拿"明天描述里一个é"换今天的 200 字节，不划算 → mode 'keep'。
// 旧文件一律进 qa/old/latin-subset-<date>/，不删。
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');

const { chromePath } = require('./chromium');
const EXE = chromePath();
const SITE = path.resolve(__dirname, '..', 'v3');
const OUT = path.resolve(__dirname, 'tmp-subset');
const APPLY = process.argv.includes('--apply');
// URL 取第一个不带 -- 的参数：写成 node mk-latin-subset.js --apply 时，
// 直接读 argv[2] 会把 "--apply" 当成网址，浏览器去导航一个叫 --apply 的域名。
const URL_ = process.argv.slice(2).find(a => !a.startsWith('--')) || 'http://127.0.0.1:8099/';
fs.mkdirSync(OUT, { recursive: true });

// 每个家族的"信任边界"：strict = 只排我自己的固定文案；range = 按 unicode-range 保留全拉丁
const PLAN = {
  'instrument-serif-latin-400-normal.woff2': 'strict',
  'instrument-serif-latin-400-italic.woff2': 'strict',
  'space-grotesk-latin-300-normal.woff2': 'keep',
  'space-grotesk-latin-400-normal.woff2': 'keep',
  'space-grotesk-latin-500-normal.woff2': 'keep',
  'space-grotesk-latin-700-normal.woff2': 'keep',
};
// 试过也量过 "按 CSS 承诺的 unicode-range 裁" 这一档（0000-00FF / 2000-206F / 零散符号）：
// 对 Space Grotesk 四个面各只扔掉 7 个字形，合计省 0.2KB，于是这条路留在这里当注释，
// 别下次又当新想法做一遍。真正值钱的是归属判断，不是裁字节。

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(URL_, { waitUntil: 'load' });
  // 全页滚一遍把懒揭示的内容都请出来，再统计——只量首屏会漏掉 .rk-no
  await p.evaluate(async () => { const H = document.body.scrollHeight; for (let y = 0; y < H; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 45)); } scrollTo(0, 0); });
  await p.waitForTimeout(2200);

  const usage = await p.evaluate(() => {
    const LATIN = /[\x20-\x7E]/; const CJK = /[\u3000-\u9fff\uff00-\uffef]/;
    const acc = { 'Space Grotesk': {}, 'Instrument Serif': {} };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const el = n.parentElement; if (!el) continue;
      const s = getComputedStyle(el);
      const stack = s.fontFamily.split(',').map(x => x.replace(/["'\s]/g, '')).filter(Boolean);
      const fam = stack[0] === 'SpaceGrotesk' ? 'Space Grotesk'
                : stack[0] === 'InstrumentSerif' ? 'Instrument Serif' : null;
      if (!fam) continue;
      for (const ch of n.textContent) {
        if (ch === ' ' || /\s/.test(ch)) continue;
        if (!LATIN.test(ch) && !(fam === 'Instrument Serif')) { if (!CJK.test(ch)) { } }
        if (!LATIN.test(ch)) continue;                 // 中文由系统栈/显示体承担，拉丁子集不负责
        (acc[fam][ch] = acc[fam][ch] || { n: 0, live: false });
        acc[fam][ch].n++;
        // "活文本"= 内容由后端现读决定的那几块：GitHub 仓库描述、终端回显、当场量的第三方数。
        // 注意 .rk 整块不算活：名次编号是我自己排的固定数字，只有 .rk-desc 才是 GitHub 写的话。
        if (el.closest('.rk-desc,.term-out,#f-3p,dd,.rk-foot')) acc[fam][ch].live = true;
      }
    }
    const out = {};
    for (const f in acc) {
      out[f] = { all: Object.keys(acc[f]).sort().join(''),
                 staticOnly: Object.keys(acc[f]).filter(c => !acc[f][c].live).sort().join(''),
                 liveChars: Object.keys(acc[f]).filter(c => acc[f][c].live).sort().join('') };
    }
    return out;
  });
  await b.close();

  console.log('家族                全页字符数  其中出现在"活文本"容器里的');
  for (const f in usage) console.log('  ' + f.padEnd(18) + String(usage[f].all.length).padStart(4) + '          ' +
    (usage[f].liveChars.length ? usage[f].liveChars.length + ' 个: ' + usage[f].liveChars.slice(0, 40) : '0'));

  let totalBefore = 0, totalAfter = 0;
  for (const file in PLAN) {
    const f = path.join(SITE, 'fonts', file);
    if (!fs.existsSync(f)) { console.log('跳过（不存在）:', file); continue; }
    const before = fs.statSync(f).size;
    const mode = PLAN[file];
    if (mode === 'keep') { totalBefore += before; totalAfter += before; continue; }   // 正文体：不裁，理由见文件头
    totalBefore += before;
    const chars = usage['Instrument Serif'].staticOnly;
    const txt = path.join(OUT, file.replace(/\.woff2$/, '') + '.txt');
    // 编号 01–07 是这套字面唯一的数字用途，名次以后涨到两位数也不该缺字，所以十个数字恒留。
    const keep = (chars + '0123456789').split('').filter((c, i, a) => a.indexOf(c) === i).sort().join('');
    if (!keep.length) { console.log('! ' + file + ' 静态文案里一个字符都不用，可以整个不再下载'); continue; }
    fs.writeFileSync(txt, keep, 'utf8');
    const tmp = path.join(OUT, file);
    const a = [f, '--text-file=' + txt, '--flavor=woff2', '--desubroutinize', '--no-hinting',
               '--drop-tables+=DSIG', '--output-file=' + tmp];
    execFileSync('pyftsubset', a, { stdio: 'pipe' });
    const after = fs.statSync(tmp).size; totalAfter += after;
    console.log(('  ' + file).padEnd(48) + (before / 1024).toFixed(1) + 'KB → ' +
      (after / 1024).toFixed(1) + 'KB   留: 「' + keep + '」');
    if (APPLY) {
      const bak = path.join(__dirname, 'old', 'latin-subset-' + new Date().toISOString().slice(0, 10).replace(/-/g, ''));
      fs.mkdirSync(bak, { recursive: true });
      fs.copyFileSync(f, path.join(bak, file));
      fs.copyFileSync(tmp, f);
    }
  }
  console.log('\n合计: ' + (totalBefore / 1024).toFixed(1) + 'KB → ' + (totalAfter / 1024).toFixed(1) + 'KB' +
    (APPLY ? '  （已落地，旧件在 qa/old/）' : '  （dry-run，加 --apply 才动文件）'));
})();
