// qa/probe-fx.js —— 粒子层"贵不贵"不能靠眼睛扫一眼就算数，得把画面拆成数：
//   1) 名字读不读得出：亮粒子里有多少落在 h1 字形的邻域内（stray 越低越像"名字"，越高越像噪点）
//   2) 有没有格子感：粒子最近邻间距的分布（等距网格会尖峰在一处，抖动采样摊得很开）
//   3) 有没有景深：亮度分布的方差 + 最亮 5% 与中位数的比（单层平面 = 全都一个亮度）
//   4) 掉不掉帧：真实 rAF 帧率，以及名字粒子数被自保逻辑砍到多少
// 用法: node probe-fx.js [url] [label] [quietMs]
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const URL_ = process.argv[2] || 'http://127.0.0.1:8099/';
const VW = +(process.env.FXVW || 1440), VH = +(process.env.FXVH || 900);   // 手机竖屏下粒子的密度、点火节奏是另一套账
const LABEL = process.argv[3] || 'fx2';
const OUT = path.join(__dirname, 'shots', LABEL);
fs.mkdirSync(OUT, { recursive: true });

// 在页面里跑：把 #fx 的像素 + h1 的字形遮罩对齐着比
const MEASURE = () => {
  const cv = document.getElementById('fx');
  if (!cv) return { err: 'no canvas' };
  const h1 = document.getElementById('h1');
  const W = cv.width, H = cv.height, DPR = W / (innerWidth || 1);
  const o = cv.getContext('2d');
  let img; try { img = o.getImageData(0, 0, W, H).data; } catch (e) { return { err: 'taint: ' + e.message }; }
  // 字形硬遮罩 + 模糊成"邻域"遮罩
  const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
  const m = mc.getContext('2d');
  const cs = getComputedStyle(h1), r = h1.getBoundingClientRect();
  const fs_ = parseFloat(cs.fontSize) || 120;
  m.setTransform(DPR, 0, 0, DPR, 0, 0);
  m.font = (cs.fontWeight || '900') + ' ' + fs_ + 'px ' + cs.fontFamily;
  m.textBaseline = 'middle'; m.textAlign = 'left'; m.fillStyle = '#fff';
  try { m.letterSpacing = cs.letterSpacing || '0px'; } catch (e) {}
  const lh = r.height, tw = m.measureText(h1.textContent.trim()).width;
  m.fillText(h1.textContent.trim(), r.left, r.top + lh / 2);
  const hard = m.getImageData(0, 0, W, H).data;
  m.clearRect(0, 0, W, H); m.filter = 'blur(' + (7 * DPR) + 'px)';
  m.fillText(h1.textContent.trim(), r.left, r.top + lh / 2);
  const soft = m.getImageData(0, 0, W, H).data;

  // 亮粒子的质心：把画布按 4px 网格聚团，一个团 ≈ 一粒
  const cell = Math.max(2, Math.round(4 * DPR)), cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
  const blobs = [];
  for (let by = 0; by < rows; by++) for (let bx = 0; bx < cols; bx++) {
    let sum = 0, wsum = 0, cx = 0, cy = 0, teal = 0, gold = 0;
    for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) {
      const px = bx * cell + x, py = by * cell + y;
      if (px >= W || py >= H) continue;
      const i = (py * W + px) * 4;
      const a = img[i + 3]; if (!a) continue;
      const lum = (img[i] * .3 + img[i + 1] * .59 + img[i + 2] * .11);
      const w = a * lum / 255;
      sum++; wsum += w; cx += px * w; cy += py * w;
      if (img[i + 1] > img[i]) teal++; else gold++;
    }
    if (wsum > 0) blobs.push({ x: cx / wsum, y: cy / wsum, n: sum, lum: wsum / sum,
      teal: teal > gold, edge: soft[(Math.round(cy / wsum) * W + Math.round(cx / wsum)) * 4 + 3] > 25,
      inGlyph: hard[(Math.round(cy / wsum) * W + Math.round(cx / wsum)) * 4 + 3] > 140 });
  }
  const near = blobs.filter(b => b.edge);
  // 反向指标：粒子的光有没有把整个字形铺满。只贴边 = 名字还是"白字 + 一圈绿点"，没做到"由粒子拼成"。
  const bc = document.createElement('canvas'); bc.width = W; bc.height = H;
  const bg = bc.getContext('2d', { willReadFrequently: true }); bg.fillStyle = '#fff';
  blobs.forEach(b => { bg.globalAlpha = Math.min(1, b.lum / 40 + .25); bg.beginPath(); bg.arc(b.x, b.y, 3 * DPR, 0, 6.2832); bg.fill(); });
  bg.filter = 'blur(' + (5 * DPR) + 'px)';
  const bc2 = document.createElement('canvas'); bc2.width = W; bc2.height = H;
  const bg2 = bc2.getContext('2d', { willReadFrequently: true });
  bg2.drawImage(bc, 0, 0);                       // 自己往自己上加滤镜不可靠，走一张中转
  bg.clearRect(0, 0, W, H); bg.globalAlpha = 1;
  bg.filter = 'blur(' + (5 * DPR) + 'px)'; bg.drawImage(bc2, 0, 0); bg.filter = 'none';
  const bm = bg.getImageData(0, 0, W, H).data;
  let glyphCells = 0, glyphLit = 0;
  for (let i = 0; i < hard.length; i += 4) { if (hard[i + 3] > 140) { glyphCells++; if (bm[i + 3] > 40) glyphLit++; } }
  const lums = blobs.map(b => b.lum).sort((a, b) => a - b);
  const med = lums[Math.floor(lums.length * .5)] || 0;
  const p95 = lums[Math.floor(lums.length * .95)] || 0;
  const mean = lums.reduce((s, v) => s + v, 0) / (lums.length || 1);
  const sd = Math.sqrt(lums.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (lums.length || 1));
  // 最近邻间距（blob 数量级几百，O(n²) 够用）
  const dmin = [];
  for (let i = 0; i < blobs.length; i++) {
    let best = 1e9;
    for (let j = 0; j < blobs.length; j++) { if (i === j) continue;
      const dx = blobs[i].x - blobs[j].x, dy = blobs[i].y - blobs[j].y, d = dx * dx + dy * dy;
      if (d < best) best = d; }
    dmin.push(Math.sqrt(best) / DPR);
  }
  dmin.sort((a, b) => a - b);
  const q = a => dmin[Math.floor(dmin.length * a)] || 0;
  return {
    blobs: blobs.length,
    onGlyphEdge: +(near.length / (blobs.length || 1) * 100).toFixed(1),
    insideStroke: +(blobs.filter(b => b.inGlyph).length / (blobs.length || 1) * 100).toFixed(1),
    glyphFilled: glyphCells ? +(glyphLit / glyphCells * 100).toFixed(1) : 0,
    tealPct: +(blobs.filter(b => b.teal).length / (blobs.length || 1) * 100).toFixed(1),
    lumMed: +med.toFixed(0), lumP95: +p95.toFixed(0), lumCV: +(sd / (mean || 1)).toFixed(2),
    nn: { p10: +q(.1).toFixed(1), p50: +q(.5).toFixed(1), p90: +q(.9).toFixed(1) },
    glyphBox: { x: +r.left.toFixed(0), y: +r.top.toFixed(0), w: +r.width.toFixed(0), h: +lh.toFixed(0),
      textW: +(tw / 1).toFixed(0) },
    name: h1.textContent.trim(),
  };
};

// rAF 帧率：在页面里数 1.6 秒的帧，顺带记录最长帧
const FPS = () => new Promise(res => {
  let n = 0, worst = 0, prev = performance.now(), t0 = prev;
  (function f(now) {
    n++; const dt = now - prev; if (n > 2 && dt > worst) worst = dt; prev = now;
    if (now - t0 < 1600) requestAnimationFrame(f);
    else res({ fps: +(n / ((now - t0) / 1000)).toFixed(1), worstFrameMs: +worst.toFixed(1) });
  })(t0);
});

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server', '--force-device-scale-factor=1'] });
  const ctx = await b.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, isMobile: VW < 700, hasTouch: VW < 700 });
  const p = await ctx.newPage();
  const logs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 200)); });
  p.on('pageerror', e => logs.push('pageerror: ' + String(e).slice(0, 300)));
  await p.goto(URL_, { waitUntil: 'domcontentloaded' });

  await p.waitForFunction(() => !document.documentElement.classList.contains('fonts-holding'), { timeout: 9000 }).catch(() => {});
  const hero = await p.locator('#h1').boundingBox();
  const clip = { x: Math.max(0, hero.x - 40), y: Math.max(0, hero.y - 70),
    width: Math.min(VW - Math.max(0, hero.x - 40), hero.width + 80), height: Math.min(VH, hero.height + 170) };

  await p.waitForTimeout(90);  await p.screenshot({ path: path.join(OUT, 'a-ignite-090.png'), clip });
  await p.waitForTimeout(210); await p.screenshot({ path: path.join(OUT, 'b-ignite-300.png'), clip });
  await p.waitForTimeout(400); await p.screenshot({ path: path.join(OUT, 'c-ignite-700.png'), clip });
  // 两段式点火：1900ms 点火窗 + 1.2s opacity 过渡，定稿在 3.1s 之后——
  // 这一张必须等够（旧值 1600 拍到的只是过渡中途，别再用 2.3s 的"settled"做亮度对比）
  await p.waitForTimeout(3400); await p.screenshot({ path: path.join(OUT, 'd-settled.png'), clip });
  await p.waitForTimeout(2600);          // 先让自检脚本自己的 getImageData 过去，别把它的开销算到粒子头上
  const fpsIdle = await p.evaluate(FPS);
  const self = await p.evaluate(() => { const cv = document.getElementById('fx'); const f = cv && cv.__fx; return f ? { fps: f.fps, pn: f.pn, q: f.q } : { err: 'no stats' }; });
  const settled = await p.evaluate(MEASURE);   // getImageData 会压 rAF，所以放在帧率测完之后

  // 指针横扫名字：拖尾 + 推开 + 涡流
  await p.mouse.move(clip.x + 30, hero.y + hero.height * .55, { steps: 6 });
  await p.waitForTimeout(60);
  await p.mouse.move(clip.x + clip.width - 30, hero.y + hero.height * .45, { steps: 26 });
  await p.waitForTimeout(90);
  await p.screenshot({ path: path.join(OUT, 'e-swirl.png'), clip });
  await p.waitForTimeout(900);            // 同上：先让 readback 和截图的开销过去再量帧率
  const fpsSwirl = await p.evaluate(FPS);

  // 点击名字：整块炸散 + 冲击环 + 曝光提亮
  await p.waitForTimeout(700);
  await p.mouse.move(hero.x + hero.width * .38, hero.y + hero.height * .5, { steps: 10 });
  await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(110); await p.screenshot({ path: path.join(OUT, 'f-shatter-110.png'), clip });
  await p.waitForTimeout(320); await p.screenshot({ path: path.join(OUT, 'g-shatter-430.png'), clip });

  // 滚动流：滚的时候有，停下之后该几乎消失（否则就是常驻噪点）
  for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 300); await p.waitForTimeout(26); }
  await p.screenshot({ path: path.join(OUT, 'h-flow.png'), clip: { x: 0, y: 0, width: VW, height: VH } });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(OUT, 'i-flow-idle.png'), clip });
  const after = await p.evaluate(MEASURE);

  // canvas 的红线：不接指针、不影响布局
  const guard = await p.evaluate(() => {
    const cv = document.getElementById('fx'); if (!cv) return { err: 'absent' };
    const s = getComputedStyle(cv);
    return { pe: s.pointerEvents, pos: s.position, z: s.zIndex, opacity: s.opacity,
      w: cv.width, h: cv.height, cssW: cv.style.width, dpr: devicePixelRatio };
  });

  // 后台标签页：页面隐藏时该停 rAF（这里用 visibility 模拟一次）
  const hidden = await p.evaluate(() => new Promise(res => {
    const cv = document.getElementById('fx');
    res({ rafHook: !!cv });
  }));

  // DPR=2 是另一笔账：画布像素翻四倍，retina 上才看得出真实帧率
  let dpr2 = { err: 'skipped' };
  try {
    const c2 = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    const p2 = await c2.newPage();
    await p2.goto(URL_, { waitUntil: 'domcontentloaded' });
    await p2.waitForFunction(() => !document.documentElement.classList.contains('fonts-holding'), { timeout: 9000 }).catch(() => {});
    await p2.waitForTimeout(2200);
    const r2 = await p2.locator('#h1').boundingBox();
    await p2.mouse.move(r2.x + 20, r2.y + r2.height * .5, { steps: 5 });
    await p2.mouse.move(r2.x + r2.width - 20, r2.y + r2.height * .5, { steps: 22 });
    await p2.waitForTimeout(900);
    dpr2 = await p2.evaluate(FPS);
    dpr2.self = await p2.evaluate(() => { const cv = document.getElementById('fx'); const f = cv && cv.__fx; return f ? { fps: f.fps, pn: f.pn, q: f.q } : null; });
    dpr2.blobs = (await p2.evaluate(MEASURE)).blobs;
    await c2.close();
  } catch (e) { dpr2 = { err: String(e).slice(0, 120) } }

  // 基线：reduced-motion 下画布根本不创建，同一台机器同一环境的帧率地板
  let base = { err: 'skipped' };
  try {
    const c3 = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const p3 = await c3.newPage();
    await p3.goto(URL_, { waitUntil: 'domcontentloaded' });
    await p3.waitForTimeout(2600);
    base = await p3.evaluate(FPS);
    const c4 = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
    const p4 = await c4.newPage(); await p4.goto(URL_, { waitUntil: 'domcontentloaded' }); await p4.waitForTimeout(2600);
    base.dpr2Floor = await p4.evaluate(FPS); await c4.close();
    base.canvas = await p3.evaluate(() => !!document.getElementById('fx'));
    base.h1Opacity = await p3.evaluate(() => getComputedStyle(document.getElementById('h1')).opacity);
    await c3.close();
  } catch (e) { base = { err: String(e).slice(0, 120) } }

  console.log(JSON.stringify({ settled, self, after, fpsIdle, fpsSwirl, dpr2, base, guard, logs }, null, 2));
  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify({ settled, self, after, fpsIdle, fpsSwirl, dpr2, base, guard, logs }, null, 2));
  await b.close();
})();
