// qa/audit.js —— 一页品质体检。
// 用法: node audit.js <label> <url> [--mobile] [--reduced-motion]
// 产物: qa/reports/<label>.json  +  qa/shots/<label>/*.png
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const { chromePath } = require('./chromium');
const EXE = chromePath();
const ROOT = path.resolve(__dirname);
const args = process.argv.slice(2);
const LABEL = args[0];
const URL_ = args[1];
const MOBILE = args.includes('--mobile');
const RM = args.includes('--reduced-motion');
if (!LABEL || !URL_) { console.error('need <label> <url>'); process.exit(2); }

const SHOTS = path.join(ROOT, 'shots', LABEL);
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });

const W = MOBILE ? 390 : 1440, H = MOBILE ? 844 : 900;

(async () => {
  // --no-proxy-server：这台机器上 Clash 的 TUN 会给到 Cloudflare 的请求再加 ~1.7s
  // （实测同一页：走系统代理 ttfb=3275 / 直连 ttfb=1521）。不绕开代理，
  // 量到的是我笔记本的网络栈，不是他的站点。
  const browser = await chromium.launch({ executablePath: EXE,
    args: ['--force-device-scale-factor=1', '--no-proxy-server'] });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: MOBILE ? 2 : 1,
    isMobile: MOBILE, hasTouch: MOBILE,
    userAgent: MOBILE ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
                      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    reducedMotion: RM ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();

  // --offline-cdn：模拟中国大陆访问者 —— fonts.googleapis.com / gstatic / cloudflareinsights 连不通
  if (args.includes('--offline-cdn')) {
    await ctx.route(/fonts\.(googleapis|gstatic)\.com|cloudflareinsights\.com/, r => r.abort('timedout'));
  }

  const console_msgs = [], page_errors = [], req_failed = [], responses = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning')
    console_msgs.push({ type: m.type(), text: m.text().slice(0, 300), loc: m.location() }); });
  page.on('pageerror', e => page_errors.push(String(e).slice(0, 300)));
  page.on('requestfailed', r => req_failed.push({ url: r.url().slice(0, 160), err: (r.failure() || {}).errorText }));
  page.on('response', r => responses.push({ url: r.url().slice(0, 160), status: r.status(),
    ct: (r.headers()['content-type'] || '').split(';')[0] }));

  // 在页面脚本之前挂测量钩子
  await page.addInitScript(() => {
    window.__qa = { lcp: null, cls: 0, paint: {}, errs: [] };
    const tryIt = (name, fn) => { try { fn(); } catch (e) { window.__qa.errs.push(name + ': ' + e.message); } };
    tryIt('lcp', () => { const o = new PerformanceObserver(l => { const e = l.getEntries().slice(-1)[0]; if (e) {
      window.__qa.lcp = e.startTime;
      const el = e.element; window.__qa.lcpEl = el ? (el.tagName + '.' + (el.className || '').split(' ')[0] + '·' + (el.textContent || '').trim().slice(0, 18)) : null;
      window.__qa.lcpSize = e.size; } });
      o.observe({ type: 'largest-contentful-paint', buffered: true }); });
    tryIt('cls', () => { const o = new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__qa.cls += e.value; });
      o.observe({ type: 'layout-shift', buffered: true }); });
    tryIt('paint', () => addEventListener('load', () => {
      for (const e of performance.getEntriesByType('paint')) window.__qa.paint[e.name] = e.startTime;
    }));
    tryIt('fonts', () => { if (document.fonts) document.fonts.ready.then(() => { window.__qa.fontsReady = performance.now(); }); });
    // 字体闸门（html.fonts-holding）加了/撤了各在什么时候——事件驱动，不做轮询，免得自己变成噪声源
    window.__qa.hold = [];
    const watchHold = () => {
      if (!document.documentElement) return setTimeout(watchHold, 4);
      const held = () => document.documentElement.classList.contains('fonts-holding');
      // 闸门现在在 <head> 里同步挂，可能比这个观察器还早半拍——先记一次当前状态，
      // 不然日志里只剩一个 "off"，看不出首屏到底有没有被压住过。
      // 线上慢的时候（HTML 2.9s 才到）会看到 "off on off" 三段：第一段是观察器自己抢在 <head> 脚本之前
      // 记的快照（那时类还没挂上），不是"闸门撤了又合上"。本地 HTML 50ms 到货，所以只有 "on off" 两段。
      // 2026-10-05 线上复检时这里被我误判过一次"首屏回闪"，注释留在这里免得下次再追。
      window.__qa.hold.push([Math.round(performance.now()), held() ? 'on' : 'off']);
      new MutationObserver(() => window.__qa.hold.push([Math.round(performance.now()), held() ? 'on' : 'off']))
        .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    };
    watchHold();
  });

  const t0 = Date.now();
  await page.goto(URL_, { waitUntil: 'load', timeout: 60000 });
  const navMs = Date.now() - t0;
  await page.waitForTimeout(MOBILE ? 2500 : 3000);   // 等入场动画走完

  // 首屏有一个"等字体到货再落地"的闸门（html.fonts-holding）。
  // 闸门没撤就取样，量到的是回退体的那一帧——LCP 会假性地很好看。
  // 所以先等它撤掉（最多再等 6s），再落 900ms 让显影走完，然后才取样。
  await page.evaluate(async () => {
    const t0 = performance.now();
    while (document.documentElement.classList.contains('fonts-holding') && performance.now() - t0 < 6000)
      await new Promise(r => setTimeout(r, 120));
  }).catch(() => {});
  await page.waitForTimeout(900);

  // 先取"落地即见"的性能数（在任何滚动之前），滚动后触发的揭示动画不该算进 LCP
  const firstPaint = await page.evaluate(() => ({
    fcp: (performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint') || {}).startTime ?? null,
    lcp: window.__qa.lcp, lcpEl: window.__qa.lcpEl, cls: +window.__qa.cls.toFixed(4),
    // 取样时闸门还压着 = 字体没在保险丝内到货，首屏是一片空的名字，必须当场发现
    holding: document.documentElement.classList.contains('fonts-holding'),
    hold: (window.__qa.hold || []).map(h => h[0] + h[1]).join(' '),
    fontsReady: Math.round(window.__qa.fontsReady || 0) }));

  // 窄屏导航条：被 viewport 切掉一半的链接，读者只会当成页面坏了。
  // 390 是审计自己的视口，抓不到 320/360 上的溢出，所以这里逐个宽度量一遍。
  let navFit = [];
  for (const w of [320, 360, 390]) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 700 });
    await page.waitForTimeout(320);
    navFit.push(await page.evaluate(vw => {
      const s = document.querySelector('.nav-links'); if (!s) return { vw, missing: true };
      const box = s.getBoundingClientRect(), room = s.scrollWidth - s.clientWidth;
      const clipped = [...s.querySelectorAll('a')]
        .filter(a => a.getBoundingClientRect().right > box.right + 1).length;
      const m = document.querySelector('.mark').getBoundingClientRect();
      const linkTap = Math.min(...[...s.querySelectorAll('a')]
        .map(a => Math.min(a.getBoundingClientRect().width, a.getBoundingClientRect().height)));
      return { vw, room: Math.round(room), clipped, fade: s.classList.contains('can-scroll'),
        overflowX: Math.round(document.documentElement.scrollWidth - vw),
        markTap: +Math.min(m.width, m.height).toFixed(0), linkTap: +linkTap.toFixed(0) };
    }, w));
  }
  await page.setViewportSize({ width: W, height: H });
  await page.waitForTimeout(400);

  // ---- 逐屏截图：按顶层 section/header/footer 划分 ----
  const blocks = await page.evaluate(() => {
    const sel = 'body > section, body > header, body > footer, body > div > section, main > section';
    const seen = new Set(); const out = [];
    document.querySelectorAll(sel).forEach(el => {
      if (seen.has(el)) return; seen.add(el);
      const r = el.getBoundingClientRect();
      out.push({ id: el.id || el.className.split(' ')[0], top: r.top + scrollY, h: el.scrollHeight || r.height });
    });
    return out.sort((a, b) => a.top - b.top);
  });
  const docH = await page.evaluate(() => document.documentElement.scrollHeight);
  const shots = [];
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(RM ? 400 : 1600);
  await page.screenshot({ path: path.join(SHOTS, '00-fold.png') }); shots.push('00-fold.png');
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    await page.evaluate(t => scrollTo({ top: Math.max(0, t - 40), behavior: 'instant' }), b.top);
    await page.waitForTimeout(RM ? 400 : 1500);   // 等显影动画走完再截图
    const f = `${String(i + 1).padStart(2, '0')}-${b.id.replace(/[^a-z0-9_-]/gi, '')}.png`;
    await page.screenshot({ path: path.join(SHOTS, f) }); shots.push(f);
  }
  await page.screenshot({ path: path.join(SHOTS, 'zz-full.png'), fullPage: true }); shots.push('zz-full.png');

  // ---- 交互态：悬停第一张作品卡 + 终端输入 help ----
  try {
    const card = await page.$('.work .card');
    if (card) { await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(1200);
      await card.hover(); await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(SHOTS, 'hy-hover-card.png') }); shots.push('hy-hover-card.png'); }
    const inp = await page.$('#tin');
    if (inp) { await inp.scrollIntoViewIfNeeded(); await inp.click(); await inp.fill('help');
      await page.keyboard.press('Enter'); await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SHOTS, 'hz-terminal-help.png') }); shots.push('hz-terminal-help.png'); }
  } catch (e) { console.log('交互态截图跳过:', e.message.slice(0, 80)); }

  // ---- 结构 / 排版 / a11y 体检 ----
  await page.waitForTimeout(900);   // 让环境动效的淡出走完，再判断"静止时是否收起"
  const audit = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const px = v => parseFloat(v) || 0;
    const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0'; };
    // 文字可读性：采样所有可见文本节点的前景色，与最近的实心背景做粗略对比度
    const rgba = c => { const m = (c || '').match(/[\d.]+/g); if (!m) return [0, 0, 0, 1];
      return [+m[0], +m[1], +m[2], m.length > 3 ? +m[3] : 1]; };
    const over = (fg, bg) => { const a = fg[3]; return [fg[0]*a + bg[0]*(1-a), fg[1]*a + bg[1]*(1-a), fg[2]*a + bg[2]*(1-a), 1]; };
    const lum = p => { const [r, g, b] = p.map(v => { v = Math.max(0, Math.min(255, v)) / 255;
      return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
      return .2126 * r + .7152 * g + .0722 * b; };
    const contrast = (a, b) => { const x = lum(a), y = lum(b);
      return +(((Math.max(x, y) + .05) / (Math.min(x, y) + .05))).toFixed(2); };
    // 从元素往上把半透明背景逐层合成，得到真正的落底色
    // 从元素往上收集所有非透明背景，再由远及近逐层合成，得到真正的落底色
    const bgOf = el => { const chain = []; let n = el;
      while (n) { const c = rgba(getComputedStyle(n).backgroundColor); if (c[3] > 0) chain.push(c); n = n.parentElement; }
      let acc = chain.length ? chain[chain.length - 1] : rgba(cs.backgroundColor);
      for (let i = chain.length - 2; i >= 0; i--) acc = over(chain[i], acc);
      return acc; };
    const lowContrast = [];
    // 元素自己或祖先的 opacity 同样会压低对比度，光看 color 会漏。
    // 之前 .rel 用 opacity:.7 把字压到约 3.7:1，脚本却报"通过"——这就是"自检通过但人眼看不清"。
    const alphaOf = el => { let a = 1, n = el;
      while (n) { a *= (parseFloat(getComputedStyle(n).opacity) || 1); n = n.parentElement; }
      return a; };
    // 选择器要覆盖所有可能承载正文的标签——之前漏了 b/em/dd/dt，结果 .ev-out 里 11px 的"积累"逃过检查。
    const textEls = [...document.querySelectorAll('p,h1,h2,h3,h4,h5,h6,a,li,span,div,button,b,em,strong,i,dd,dt,td,th,code,q,cite,label,figcaption,time')].filter(vis);
    const seenTxt = new Set();
    for (const el of textEls) {
      const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!own) continue;
      const t = el.textContent.trim().slice(0, 40);
      if (seenTxt.has(t)) continue; seenTxt.add(t);
      const s = getComputedStyle(el);
      if (px(s.fontSize) < 12) lowContrast.push({ why: 'font<12px', t, size: s.fontSize });
      const bg = bgOf(el);
      const fg = rgba(s.color); fg[3] = Math.min(1, fg[3] * alphaOf(el));
      const c = contrast(fg, bg);
      if (c < 4.5 && px(s.fontSize) < 24) lowContrast.push({ why: 'contrast', t, ratio: c, size: s.fontSize,
        color: s.color, bg: 'rgb(' + bg.slice(0, 3).map(Math.round).join(',') + ')' });
    }
    const families = {};
    document.fonts.forEach(f => { families[f.family] = families[f.family] || new Set(); families[f.family].add(f.status); });
    const fontList = Object.fromEntries(Object.entries(families).map(([k, v]) => [k, [...v]]));
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h => ({ tag: h.tagName, t: h.textContent.trim().slice(0, 50) }));
    const badLinks = [...document.querySelectorAll('a')].filter(a => vis(a) &&
      !(a.textContent.trim() || a.getAttribute('aria-label') || a.querySelector('img[alt]'))).map(a => a.getAttribute('href'));
    const smallTap = [...document.querySelectorAll('a,button,input,[role=button]')]
      .filter(el => vis(el) && (el.getBoundingClientRect().height < 40 || el.getBoundingClientRect().width < 40))
      .map(el => ({ tag: el.tagName, t: el.textContent.trim().slice(0, 24),
        w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) }));
    const imgs = [...document.querySelectorAll('img')].map(i => ({ src: i.currentSrc.slice(-40), alt: i.alt,
      w: i.naturalWidth, lazy: i.loading }));
    // 中文之间不该有空格。源码里段内换行会被 HTML 折成一个真空格（"， 中间"），肉眼容易漏，这里逐块查。
    const cjkSpace = (() => { const C = '\\u3000-\\u303f\\u4e00-\\u9fff\\uff00-\\uffef';
      const R = new RegExp('[' + C + '] +[' + C + ']', 'u');
      const norm = n => { if (n.nodeType === 3) return n.textContent.replace(/\s+/g, ' ');
        if (n.nodeType !== 1 || /^(script|style|svg)$/.test(n.tagName.toLowerCase())) return '';
        let s = ''; for (const k of n.childNodes) s += norm(k); return s; };
      const bad = [];
      document.querySelectorAll('p,h1,h2,h3,h4,h5,li,dd,dt,blockquote,q,cite').forEach(e => {
        if (e.closest('svg')) return;
        const t = norm(e).trim(); const m = t.match(R); if (!m) return;
        const r = e.getBoundingClientRect(); if (!r.width && !r.height) return;
        bad.push(t.slice(Math.max(0, m.index - 10), m.index + 16)); });
      return bad; })();
    return {
      title: document.title,
      lang: document.documentElement.lang,
      fontStatus: document.fonts.status, fontList,
      loadedFamilies: [...new Set([...document.querySelectorAll('body,p,h1,h2,h3,a,li,span,button')]
        .map(e => getComputedStyle(e).fontFamily.split(',')[0].replace(/["']/g, '')))],
      bodyFont: cs.fontFamily, bodySize: cs.fontSize, bg: cs.backgroundColor,
      headings, badLinks, imgs,
      smallTapCount: smallTap.length, smallTapSample: smallTap.slice(0, 12),
      lowContrastCount: lowContrast.length, lowContrast: lowContrast.slice(0, 25),
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      docHeight: document.documentElement.scrollHeight,
      elementCount: document.querySelectorAll('*').length,
      maxDepth: (() => { let d = 0; document.querySelectorAll('*').forEach(e => { let n = e, k = 0;
        while ((n = n.parentElement)) k++; if (k > d) d = k; }); return d; })(),
      hasSkipLink: [...document.querySelectorAll('a[href^="#"]')].some(a => /skip|跳到|跳转/i.test(a.textContent + ' ' + a.className + ' ' + a.id)),
      reducedMotionRule: [...document.styleSheets].some(s => { try {
        return [...s.cssRules].some(r => r.cssText && /prefers-reduced-motion/.test(r.parentRule ? r.parentRule.cssText + r.cssText : r.cssText)); }
        catch (_) { return false; } }),
      metaOG: [...document.querySelectorAll('meta[property^="og:"],meta[name^="twitter:"]')].map(m => (m.getAttribute('property') || m.getAttribute('name'))),
      jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { return JSON.parse(s.textContent)['@type']; } catch (_) { return 'PARSE-ERROR'; } }),
      sections: [...document.querySelectorAll('section,header,footer')].map(s => ({ id: s.id || s.className.split(' ')[0],
        h: Math.round(s.getBoundingClientRect().height) })),
      // 环境动效必须"静止时收起"：滚动线 / 光标环停在画面上，读者只会当成渲染故障
      ambientParked: (() => { const g = id => { const el = document.querySelector(id);
        return el ? +getComputedStyle(el).opacity : null; }; return { scan: g('#scan'), cursor: g('#cursor') }; })(),
      cjkSpace,
      // 中文显示体是"按本页标题用字"裁出来的子集。以后改了标题文案就可能掉字，
      // 掉字是逐字回退到黑体，肉眼在截图里很难发现，所以这里逐字校验。
      displayCoverage: (() => {
        const F = '"Noto Serif SC Display"';
        // 这一条以前逐字调 document.fonts.check() 判缺字——那是假的：Chromium 的 check()
        // 回答"这串文本有没有*任何*字体能排"，裁到只剩 26 个字形的字面对 'A' 'Z' 'Ω' 照样返回 true。
        // 所以它从写下那天起就一直绿，一次也没抓到过缺字。逐字核对已经搬到
        // qa/check-subset-coverage.js（读 woff2 自己的 cmap，配 --probe 能人为弄红，证明有牙）。
        // 这里只保留 check() 真正擅长的一件事：这套字面到底加载了没有。
        const loaded = w => { try { return document.fonts.check(w + ' 32px ' + F, '刘'); } catch (_) { return false; } };
        if (!loaded(700) && !loaded(900)) return { skipped: 'display face 未加载' };
        const els = [...document.querySelectorAll('h1,h2,h3,p,span,blockquote,a,b,dt,dd')].filter(el =>
          getComputedStyle(el).fontFamily.indexOf('Noto Serif SC Display') >= 0);
        const seen = new Set();
        for (const el of els) for (const ch of (el.textContent || '')) if (ch.trim()) seen.add(ch);
        return { checked: seen.size, loadedFaces: [700, 900].filter(loaded), missing: [] };
      })(),
    };
  });

  // 源码级标签配平检查：浏览器会自动补全/纠正未闭合标签，DOM 里看不出来，只能查源文本。
  // 必须用 fetch 拿原始字节——page.content() 是解析后重新序列化的，永远配平，查不出问题。
  let srcLint = {};
  try {
    const raw = await (await fetch(URL_)).text();
    for (const t of ['div', 'section', 'span', 'p', 'a', 'svg', 'dl', 'blockquote', 'main', 'header', 'footer']) {
      const open = (raw.match(new RegExp('<' + t + '(?=[\\s>/])', 'g')) || []).length;
      const close = (raw.match(new RegExp('</' + t + '>', 'g')) || []).length;
      if (open !== close) srcLint[t] = `${open} 开 / ${close} 闭`;
    }
    srcLint.bytes = raw.length;
  } catch (e) { srcLint.error = String(e).slice(0, 80); }

  // 键盘可达性：Tab 走 12 步，看焦点是否可见
  const focusTrail = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    focusTrail.push(await page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return null;
      const s = getComputedStyle(a);
      return { tag: a.tagName, t: (a.textContent || '').trim().slice(0, 20),
        ring: (s.outlineStyle !== 'none' && (parseFloat(s.outlineWidth) || 0) > 0) || s.boxShadow !== 'none',
        inView: (() => { const r = a.getBoundingClientRect(); return r.top >= -2 && r.bottom <= innerHeight + 2; })() }; }));
  }

  // 滚动流畅度：自动滚一遍全页，统计帧间隔
  const scrollFps = await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    const gaps = []; let last = performance.now(); let raf;
    const tick = t => { gaps.push(t - last); last = t; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const t0 = performance.now();
    await new Promise(res => {
      const step = () => {
        const p = (performance.now() - t0) / 2200;
        if (p >= 1) return res();
        scrollTo({ top: h * p, behavior: 'instant' });
        requestAnimationFrame(step);
      }; step();
    });
    cancelAnimationFrame(raf);
    scrollTo({ top: 0, behavior: 'instant' });
    const g = gaps.slice(2).sort((a, b) => a - b);
    return { frames: gaps.length, medianMs: +(g[g.length >> 1] || 0).toFixed(1),
      p95Ms: +(g[Math.floor(g.length * .95)] || 0).toFixed(1),
      droppedPct: +(100 * g.filter(x => x > 20).length / Math.max(1, g.length)).toFixed(1) };
  });
  await page.waitForTimeout(600);

  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const res = performance.getEntriesByType('resource').map(r => ({ url: r.name.slice(0, 120),
      type: r.initiatorType, size: r.transferSize || r.encodedBodySize || 0, dur: Math.round(r.duration) }));
    const doc = performance.getEntriesByType('navigation')[0];
    const lcpList = performance.getEntriesByType('largest-contentful-paint');
    const lcp = window.__qa.lcp ?? (lcpList.length ? lcpList[lcpList.length - 1].startTime : null);
    const fcpE = (performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint') || {}).startTime;
    return {
      ttfb: Math.round(doc ? doc.responseStart : 0), domReady: Math.round(doc ? doc.domContentLoadedEventEnd : 0),
      load: Math.round(nav.loadEventEnd || 0),
      fcp: fcpE ?? window.__qa.paint['first-contentful-paint'] ?? null, lcp, cls: +window.__qa.cls.toFixed(4), qaErrs: window.__qa.errs,
      fontsReady: window.__qa.fontsReady ?? null,
      totalBytes: res.reduce((a, r) => a + r.size, 0) + (doc ? doc.transferSize || doc.encodedBodySize : 0),
      resCount: res.length, slowest: res.sort((a, b) => b.dur - a.dur).slice(0, 6),
    };
  });

  const report = { label: LABEL, url: URL_, mobile: MOBILE, reducedMotion: RM,
    viewport: `${W}x${H}`, navMs, shots, console_msgs, page_errors, req_failed, scrollFps, firstPaint, navFit, srcLint,
    responses: responses.filter(r => r.status >= 400), perf, audit, focusTrail };
  fs.writeFileSync(path.join(ROOT, 'reports', `${LABEL}.json`), JSON.stringify(report, null, 2));

  const bad = [];
  if (page_errors.length) bad.push(`JS 异常 ${page_errors.length}`);
  if (console_msgs.filter(m => m.type === 'error').length) bad.push(`console error`);
  if (req_failed.length) bad.push(`请求失败 ${req_failed.length}`);
  if (audit.overflowX > 1) bad.push(`横向溢出 ${audit.overflowX}px`);
  if (audit.lowContrastCount) bad.push(`低对比/小字 ${audit.lowContrastCount}`);
  if (MOBILE && audit.smallTapCount) bad.push(`点击区过小 ${audit.smallTapCount}`);
  if (!audit.reducedMotionRule) bad.push(`无 reduced-motion 降级`);
  if (audit.ambientParked && audit.ambientParked.scan > 0.05) bad.push(`滚动线静止时未收起 opacity=${audit.ambientParked.scan}`);
  if (audit.displayCoverage && audit.displayCoverage.missing && audit.displayCoverage.missing.length)
    bad.push(`标题子集缺字 ${audit.displayCoverage.missing.length}: ${audit.displayCoverage.missing.slice(0, 10).join(' ')}`);
  if (audit.displayCoverage && audit.displayCoverage.skipped) bad.push(`显示体未加载（${audit.displayCoverage.skipped}）`);
  if (audit.cjkSpace && audit.cjkSpace.length)
    bad.push(`中文之间有空格 ${audit.cjkSpace.length}: ${audit.cjkSpace.slice(0, 3).join(' | ')}`);
  if (audit.jsonld.includes('PARSE-ERROR')) bad.push('JSON-LD 解析失败');
  // 窄屏导航：放得下就不许切；确实放不下，就必须能滑 + 有渐隐提示 + 顶不出横向滚动条
  navFit.forEach(n => {
    if (n.missing) return;
    if (n.overflowX > 1) bad.push(`导航 ${n.vw}px 顶出横向滚动 ${n.overflowX}px`);
    if (n.clipped && !(n.room > 4 && n.fade)) bad.push(`导航 ${n.vw}px 有 ${n.clipped} 个链接被切、又没有可滑的提示`);
    if (n.markTap < 40) bad.push(`导航 ${n.vw}px 猫标点击区 ${n.markTap}px`);
    if (n.linkTap < 40) bad.push(`导航 ${n.vw}px 链接点击区 ${n.linkTap}px`);
  });
  const lcpReal = firstPaint.lcp ?? perf.lcp;
  // 门禁分两条，别混：DESIGN.md 的 1500ms 是**代码侧**红线，只能在本地（字体秒到、源站 1ms）判定；
  // 线上 HTML 没进 Cloudflare 边缘缓存，光隧道来回就 1.5s，任何代码都压不进 1500。
  // 所以这里用 2500：本地轻松通过（真超标就是渲染退化了），线上则把投递成本如实报成一项失败。
  if (lcpReal > 2500) bad.push(`LCP ${Math.round(lcpReal)}ms`);
  // CLS 以 DESIGN.md 的 0.02 为准，并且取"滚动前"和"滚动后"两个采样里的大者：
  // 线上第一次跑就靠这条抓到了 reduced-motion 变体 0.098 的换字回退（本地永远测不出来，
  // 因为本地字体 20ms 就到货了）。门限写在 0.1 只会放过这种真问题。
  const clsWorst = Math.max(firstPaint.cls || 0, perf.cls || 0);
  if (clsWorst > 0.02) bad.push(`CLS ${clsWorst}`);
  if (firstPaint.holding) bad.push('字体闸门没解除（首屏名字一直空着）');
  if (scrollFps.droppedPct > 25) bad.push(`掉帧 ${scrollFps.droppedPct}%`);
  const lintBad = Object.keys(srcLint).filter(k => k !== 'bytes');
  if (lintBad.length) bad.push(`标签不配平: ${lintBad.map(k => k + '=' + srcLint[k]).join(', ')}`);
  console.log(`[${LABEL}] ${W}x${H}  FCP=${Math.round(firstPaint.fcp || perf.fcp || 0)} LCP=${Math.round(lcpReal || 0)}（滚动后 ${Math.round(perf.lcp || 0)}）CLS=${firstPaint.cls} 滚动中位${scrollFps.medianMs}ms/掉帧${scrollFps.droppedPct}% bytes=${(perf.totalBytes / 1024).toFixed(0)}KB 元素=${audit.elementCount} 字体=${audit.fontStatus}${firstPaint.hold ? ' 闸门[' + firstPaint.hold + ']' : ''}${navFit.length ? ' 导航[' + navFit.map(n => n.vw + ':' + (n.missing ? '缺' : n.clipped ? '切' + n.clipped : n.fade ? '可滑' : '全放') + (n.markTap < 40 || n.linkTap < 40 ? '/最小点击 ' + Math.min(n.markTap, n.linkTap) : '')).join(' ') + ']' : ''}`);
  console.log('  问题:', bad.length ? bad.join(' | ') : '无');
  await browser.close();
})().catch(e => { console.error('AUDIT CRASH', e); process.exit(1); });
