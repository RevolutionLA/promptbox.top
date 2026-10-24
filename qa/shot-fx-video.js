// qa/shot-fx-video.js —— 粒子这种"动起来才成立"的东西，截图只能证明它没坏，证明不了它贵不贵。
// 所以录一段：闸门放开 → 点火 → 归位 → 鼠标横扫涡流 → 点名字炸散 → 弹簧回位 → 滚动流。
// 产物：qa/shots/<label>/take.webm，再用 ffmpeg 压成同目录的 take.mp4（H.264，任何播放器都能开）。
// 用法: node shot-fx-video.js [url] [label]
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs'), cp = require('child_process');
const { chromePath } = require('./chromium');
const EXE = chromePath();
const URL_ = process.argv[2] || 'https://promptbox.top/';
const LABEL = process.argv[3] || 'fx-take';
const OUT = path.join(__dirname, 'shots', LABEL);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server', '--force-device-scale-factor=1'] });
  // 录制分辨率刻意只有 768×480（= 视口 1280×800 的 1.6 等比缩小）：`probe-fx-cost.js` 的四格对照证明，
  // 掉帧不是粒子吃的，是 Chromium 屏录制每帧再复制一遍合成面吃的（不带录制时同环境 60.0fps，带录制 32–45fps 且抖动 ±8）。
  // 录制像素越少这笔开销越小 —— 实测 1280×800 那档会把页面自保从 q=2 压到 q=1，
  // 于是我把"降档后的样子"当成"满画质的样子"发给他。视口仍是 1280×800，构图不变，只是视频变小。
  // 尺寸必须与视口同宽高比：之前用 854×480（1.78），Chromium 把 1.6 的画面缩到 768 宽后把余下 86px
  // 留成透明带（解码出来是灰块/黑边），mp4 里就是一条右边框 —— 录像脚本自己的坑，别再踩。
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: 768, height: 480 } } });
  // 整段录像里每 400ms 抄一次粒子层自己的读数：画质档位 q 什么时候掉的、被什么动作掉的。
  // 必须 addInitScript：newPage 之后再 evaluate 会被随后的导航冲掉。
  await ctx.addInitScript(() => { window.__fxlog = [];
    setInterval(() => { const cv = document.getElementById('fx'), f = cv && cv.__fx;
      if (f) window.__fxlog.push([Math.round(performance.now()), f.fps, f.q, f.pn, f.cost]); }, 400); });
  const p = await ctx.newPage();
  await p.goto(URL_, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => !document.documentElement.classList.contains('fonts-holding'), { timeout: 15000 }).catch(() => {});
  const r = await p.locator('#h1').boundingBox();
  await p.waitForTimeout(2600);                                   // 点火 + 归位整段看完
  // 鼠标从名字左侧扫到右侧：拖尾 + 推开 + 涡流
  await p.mouse.move(r.x - 120, r.y + r.height * .7, { steps: 8 });
  await p.mouse.move(r.x + r.width * .55, r.y + r.height * .35, { steps: 34 });
  await p.waitForTimeout(700);
  // 在名字上点两下：炸散 → 弹簧拉回来重新拼好
  await p.mouse.move(r.x + r.width * .30, r.y + r.height * .5, { steps: 12 });
  await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(900);
  await p.mouse.move(r.x + r.width * .62, r.y + r.height * .45, { steps: 10 });
  await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(2200);
  // 滚动流：滚快一点星点该淌、该被拉长，停手就淡掉
  for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, 320); await p.waitForTimeout(30); }
  await p.waitForTimeout(1400);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, -320); await p.waitForTimeout(30); }
  await p.waitForTimeout(1800);
  const stat = await p.evaluate(() => ({ log: window.__fxlog || [],
    now: (() => { const cv = document.getElementById('fx'), f = cv && cv.__fx; return f ? { fps: f.fps, pn: f.pn, q: f.q } : null; })() }));
  await ctx.close();                                               // 关闭才落盘
  await b.close();
  const webm = fs.readdirSync(OUT).filter(f => f.endsWith('.webm')).map(f => path.join(OUT, f))[0];
  console.log('webm:', webm, '· FX 末值:', JSON.stringify(stat.now));
  console.log('档位轨迹 [ms,fps,q,pn]:', JSON.stringify(stat.log));
  if (!webm) return;
  const mp4 = path.join(OUT, 'take.mp4');
  cp.execSync(`ffmpeg -y -hide_banner -loglevel error -i "${webm}" -c:v libx264 -pix_fmt yuv420p -crf 22 -preset veryfast -movflags +faststart "${mp4}"`);
  fs.renameSync(webm, path.join(OUT, 'take.webm'));
  console.log('mp4:', mp4, (fs.statSync(mp4).size / 1024).toFixed(0) + 'KB');
})();
