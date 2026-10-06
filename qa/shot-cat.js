// 一次性视觉对比：把两个候选猫图标按站内实际用到的尺寸渲成 PNG，
// 判"丑不丑"必须看渲染结果，不能看 SVG 源码。用法：node shot-cat.js
const { chromium } = require('playwright-core');
const EXEC = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
(async () => {
  const b = await chromium.launch({ executablePath: EXEC, args: ['--no-proxy-server', '--force-device-scale-factor=2'] });
  const p = await b.newPage({ viewport: { width: 1120, height: 640 } });
  await p.goto('file:///C:/Users/LA-GPT/Desktop/Space/promptbox-site/qa/cat-compare.html', { waitUntil: 'load' });
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'C:\\Users\\LA-GPT\\Desktop\\Space\\promptbox-site\\qa\\cat-compare.png' });
  await b.close();
  console.log('shot ok');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
