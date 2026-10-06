// qa/probe-content.js —— 内容终检，不是性能终检。
// 三件事：① 页脚那句 "N third-party requests" 是真量出来的，得确认它显示的是 0；
// ② 终端彩蛋 `cat 干杯` 要回话，且 help 里不许泄露它；
// ③ 他点名撤掉的机器叙事（host / uptime / mem / 访问数 / NOW 屏）不许以任何形式活着回来；
//    2026-10-05 又加一类——"引擎房的话"：数据现读 / 本站后端 / 不是手写 / 可当场复核。
//    他原话："这个网页仅仅是介绍我，这些话没必要写上去。" 数据可以真，但不许在页面上自证。
const { chromium } = require('playwright-core');
const EXE = 'C:\\Users\\LA-GPT\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe';
const URL_ = process.argv[2] || 'http://127.0.0.1:8099/';

(async () => {
  const b = await chromium.launch({ executablePath: EXE, args: ['--no-proxy-server'] });
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  // 按 origin 比，不按字符串前缀比：写成"只允许本地 8099"时，拿这个脚本跑线上域名，
  // 会把他自己的字体全算成第三方（实测线上报 9 个，页面自己量的仍是 0）。
  const SELF = new URL(URL_).origin;
  const reqs = [];
  p.on('request', r => { try { if (new URL(r.url()).origin !== SELF) reqs.push(r.url()); } catch (_) { reqs.push(r.url()); } });
  await p.goto(URL_, { waitUntil: 'load' });
  await p.waitForTimeout(2500);

  console.log('① 页脚实测计数 :', (await p.locator('#f-3p').textContent() || '（缺席）').trim());
  console.log('   真实第三方请求:', reqs.length, reqs.slice(0, 3));

  // 终端彩蛋
  await p.locator('#console').scrollIntoViewIfNeeded();
  await p.waitForTimeout(700);
  const help = p.locator('#tin');
  await help.click();
  await help.fill('help'); await p.keyboard.press('Enter');
  await p.waitForTimeout(250);
  const helpTxt = await p.locator('.term-out').innerText();
  console.log('② help 泄露彩蛋:', /\bganbei\b|干杯/.test(helpTxt) ? '泄露了 ✗' : '未泄露 ✓');
  await help.fill('cat 干杯'); await p.keyboard.press('Enter');
  await p.waitForTimeout(250);
  const catTxt = await p.locator('.term-out').innerText();
  console.log('   cat 干杯      :', catTxt.split('\n').filter(l => l.includes('小黑猫')).slice(-1)[0] || '无回应 ✗');
  await help.fill('cat ganbei'); await p.keyboard.press('Enter');
  await p.waitForTimeout(250);
  console.log('   cat ganbei    :', (await p.locator('.term-out').innerText()).includes('一回事') ? '有回应 ✓' : '无回应 ✗');

  // 机器叙事残留
  const body = await p.evaluate(() => document.body.innerText);
  const banned = [
    [/\bRaspberry\b|\braspberr/y, '树莓派落款'],
    [/\buptime\b/i, 'uptime'],
    [/\bLOAD\b/, '负载读数'],
    [/\bMEM\b|内存占用/, '内存读数'],
    [/\bHOST\b/, '主机名'],
    [/\bRTT\b/, '网络延迟读数'],
    [/现在此刻|在做什么|在读什么|在等什么/, 'NOW 屏'],
    [/访问过|位访客|visits|今日访问/, '访问计数'],
    [/最近不在家|没回家|回没回/, '猫的编造叙事'],
    [/server time|服务器时间/, '服务器时钟'],
    // 引擎房的话（他 2026-10-05 点名）："复核"只用组合词，别误伤 adversarial-review 的"第三方独立复核"
    [/现读|本站后端/, '"数据现读/本站后端"这类自证话术'],
    [/不是手写|非手写|写死/, '"不是手写/写死"的数据辩护'],
    [/当场复核|可复核/, '"可复核"承诺'],
    [/星数从高到低|按 ★ 排序/, '编排规则说明（他第二句里点名的那半句）'],
  ];
  console.log('③ 机器叙事残留 :');
  let dirty = 0;
  for (const [re, name] of banned) {
    const m = body.match(re);
    if (m) { dirty++; console.log('   ✗ ' + name + ' → …' + body.slice(Math.max(0, m.index - 24), m.index + 28).replace(/\n/g, '⏎') + '…'); }
  }
  if (!dirty) console.log('   全部清零 ✓');

  // 该在的还得在
  const must = [
    [/[0-9]{3,}\s*★|★\s*[0-9]{3,}/, '星数'],
    [/9,?242|下载量/, 'npm 下载量'],
    [/干杯/, '猫（签名或彩蛋）'],
    [/Lucide|lucide|ISC|MIT/, '美术素材署名'],
  ];
  console.log('④ 该在的 :');
  for (const [re, name] of must) console.log('   ' + (re.test(body) ? '✓' : '✗') + ' ' + name);

  console.log('⑤ H1/单一标题 :', await p.locator('h1').count(), '| 总重:',
    Math.round((await p.evaluate(() => performance.getEntriesByType('navigation')[0].transferSize)) / 1024) + 'KB');
  await b.close();
})();
