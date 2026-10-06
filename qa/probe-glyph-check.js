// qa/probe-glyph-check.js —— 换子集之前先确认"缺字能不能被查出来"。
// 如果 document.fonts.check 对子集里没有的字符仍返回 true，那审计里的覆盖面检查就是假绿灯，
// 裁字面这件事就没有回归网 —— 所以先量工具，再动字体。
const { chromium } = require('playwright-core');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const URL_ = process.argv[2] || 'http://127.0.0.1:8099/';
const FAM = process.argv[3] || 'Instrument Serif';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(URL_, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const t = await p.evaluate(async (fam) => {
    await document.fonts.ready;
    const F = '"' + fam + '"';
    const ctx = document.createElement('canvas').getContext('2d');
    const w = (f, ch) => { ctx.font = '32px ' + f; return +ctx.measureText(ch).width.toFixed(1); };
    const chars = ['A', 'g', '0', 'Z', 'q', 'Ω', '，', '€', 'ﬁ'];
    return chars.map(ch => ({
      ch, check: (() => { try { return document.fonts.check('400 32px ' + F, ch); } catch (e) { return 'ERR'; } })(),
      wf: w(F, ch), fb: w('NoSuchFamilyXYZ', ch),
    }));
  }, FAM);
  console.log('字符  check   该字面宽度  回退栈宽度   判定');
  t.forEach(r => {
    const same = r.wf === r.fb;
    console.log('  ' + r.ch + '   ' + String(r.check).padEnd(6) + String(r.wf).padStart(8) +
      String(r.fb).padStart(12) + '   ' + (same ? '宽度与回退相同（不可用作判据）' : '由该字面绘制'));
  });
  console.log('\n结论：check() 对子集外字符是否返回 false ——',
    t.filter(r => r.check === false).map(r => r.ch).join(' ') || '（一个都没有：check 不可信）');
  await b.close();
})();
