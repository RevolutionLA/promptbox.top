// 查：某个元素最终用的是哪张字体（CDP CSS.getPlatformFontsForNode）
const { chromium } = require('playwright-core');
const URL_ = process.argv[2] || 'http://127.0.0.1:8099/';
const SELS = (process.argv[3] || 'h1,.lede,.lede strong,.eyebrow,.tag,.sec-head h2,.card p,.conn .v,.f-in,.spec-row span').split(',');
(async () => {
  const b = await chromium.launch({ executablePath: require('./chromium').chromePath() });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(URL_, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  for (const sel of SELS) {
    try {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
      if (!nodeId) { console.log(sel.padEnd(18), 'NOT FOUND'); continue; }
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      console.log(sel.padEnd(18), fonts.map(f => `${f.familyName}(${f.glyphCount})`).join(' + ') || 'none');
    } catch (e) { console.log(sel.padEnd(18), 'ERR', e.message); }
  }
  await b.close();
})();
