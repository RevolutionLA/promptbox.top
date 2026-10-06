// qa/probe-name-lum.js —— 名字"真·落定帧"亮度的固定口径。
// 为什么专设：两段式点火 = 1900ms 点火窗 + 1.2s opacity 过渡，定稿要到 3.1s 之后。
// probe-fx.js 的 d-settled 拍在 ~2.3s，那是过渡中途（ease 前段走得快，拍到的约是 .5），
// 拿它做 .62/.78 的对比会被"过渡快照"污染，数字和画面都不作数。名字亮度的对外说法一律用这个口径。
// 一次拍三张，同一裁剪（x=150,y=260,360x180，与定稿帧头版一致）过 ffmpeg signalstats：
//   A 当前构建（?fxlock=2 钉满画质）  B 同帧注入 .62 覆盖做真对比  C reduced-motion 纯白字参照
// 用法: node qa/probe-name-lum.js [url] [label]
const { chromium } = require('playwright-core');
const cp = require('child_process');
const path = require('path'), fs = require('fs');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const URL_ = process.argv[2] || 'http://127.0.0.1:8099/';
const LABEL = process.argv[3] || 'lum';
const OUT = path.join(__dirname, 'shots', LABEL);
fs.mkdirSync(OUT, { recursive: true });

const SETTLE = 4200;                       // 3.1s 走完过渡，再留 1.1s 余量
const CROP = 'crop=360:180:150:260';

function yavg(png) {
  // metadata=mode=print:file=- 打到 stdout；ffmpeg 自己的日志走 stderr，不混进来
  const out = cp.execSync('ffmpeg -hide_banner -loglevel error -i "' + png + '" -vf "' +
    CROP + ',signalstats,metadata=mode=print:file=-" -an -f null -', { encoding: 'utf8' });
  const m = out.match(/YAVG=([\d.]+)/);
  return m ? +(+m[1]).toFixed(1) : null;
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE,
    args: ['--force-device-scale-factor=1', '--no-proxy-server'] });

  const c1 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p1 = await c1.newPage();
  await p1.goto(URL_ + (URL_.includes('?') ? '&' : '?') + 'fxlock=2', { waitUntil: 'domcontentloaded' });
  await p1.waitForFunction(() => document.documentElement.classList.contains('fx-live'), { timeout: 9000 }).catch(() => {});
  await p1.waitForTimeout(SETTLE);
  const aPath = path.join(OUT, 'a-settled-current.png');
  await p1.screenshot({ path: aPath });
  // B：同一帧、同一粒子场上把落定档改成 .62（后注入的同优先级规则生效），等过渡走完
  await p1.addStyleTag({ content: 'html.fx-live h1{opacity:.62}' });
  await p1.waitForTimeout(1600);
  const bPath = path.join(OUT, 'b-settled-62.png');
  await p1.screenshot({ path: bPath });
  await c1.close();

  const c2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const p2 = await c2.newPage();
  await p2.goto(URL_, { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(2500);
  const cPath = path.join(OUT, 'c-white-rm.png');
  await p2.screenshot({ path: cPath });
  await c2.close();
  await browser.close();

  const m = { build: 'A=当前(.78, fxlock=2) B=注入.62 C=reduced-motion白字', crop: CROP,
    yavgA: yavg(aPath), yavgB: yavg(bPath), yavgC: yavg(cPath) };
  console.log(JSON.stringify(m));
  fs.writeFileSync(path.join(OUT, 'lum.json'), JSON.stringify(m, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
