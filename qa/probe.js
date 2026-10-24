const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: require('./chromium').chromePath() });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://127.0.0.1:8099/', { waitUntil: 'load' });
  await p.waitForTimeout(600);
  console.log(JSON.stringify(await p.evaluate(async () => {
    const el = document.querySelector('.lede');
    const probe = () => new Promise(r => {
      const io = new IntersectionObserver(es => { r(es.map(e => +e.intersectionRatio.toFixed(2))); io.disconnect(); }, { threshold: 0 });
      io.observe(el); setTimeout(() => r(['timeout']), 900);
    });
    const out = {};
    out.asIs = await probe();
    el.style.clipPath = 'none'; out.noClip = await probe();
    el.style.clipPath = ''; out.clipBack = await probe();
    el.style.filter = 'none'; out.noFilter = await probe();
    el.style.filter = ''; el.style.opacity = '1'; out.op1 = await probe();
    return out;
  })));
  await b.close();
})();
