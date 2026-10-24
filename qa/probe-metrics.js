// qa/probe-metrics.js —— 换字为什么会改行宽：子集里到底有没有拉丁字形？
const { chromium } = require('playwright-core');
const { chromePath } = require('./chromium');
const EXE = chromePath();
(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await p.goto(process.argv[2] || 'https://promptbox.top/', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const out = await p.evaluate(() => {
    var w = function (txt, ff) {
      var s = document.createElement('span');
      s.style.cssText = 'position:absolute;left:-9999px;white-space:pre;font-size:100px;font-family:' + ff;
      s.textContent = txt; document.body.appendChild(s);
      var r = s.getBoundingClientRect().width; s.remove(); return Math.round(r);
    };
    var lede = document.querySelector('.lede');
    return {
      hasLatin: document.fonts.check('500 100px "Noto Serif SC Display"', 'Raspberry'),
      hasHan: document.fonts.check('500 100px "Noto Serif SC Display"', '我'),
      latinW: {
        subset: w('Raspberry Pi 4', '"Noto Serif SC Display"'),
        simsun: w('Raspberry Pi 4', 'SimSun'),
        serif: w('Raspberry Pi 4', 'serif'),
        grot: w('Raspberry Pi 4', '"Space Grotesk"')
      },
      hanW: {
        subset: w('我家书桌下的一台', '"Noto Serif SC Display"'),
        simsun: w('我家书桌下的一台', 'SimSun'),
        serif: w('我家书桌下的一台', 'serif')
      },
      ledeFont: getComputedStyle(lede).fontFamily,
      faces: [].map.call(document.fonts, function (f) { return f.family + ' ' + f.weight + ' ' + f.status; })
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
