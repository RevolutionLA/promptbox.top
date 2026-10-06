// promptbox.top 后端 —— 单文件、零依赖。
// GET /api/repos     服务端代理的真实记录：按星数降序的仓库榜 + npm 下载量，6 小时缓存。
//                    浏览器因此零第三方请求，中国大陆访客也够得着，页面上每个数字都当场可核。
// 遥测端点（host / mem / uptime / 服务器时间）已经删掉：
// 这个站是给人看的，没人关心它跑在什么机器上，而这些读数本身就是一个对外暴露的面。
// /api/visit（访问计数）也删了：页面上没有任何地方用它，而"每一次请求都往磁盘写一行"
// 正与页脚那句 no tracking 相冲突。留着一个没人看的计数器，是给自己埋必须维护的东西。
// 数据落在 ~/.promptbox/（可用 PB_DATA 覆盖）。监听 127.0.0.1:3001，由 nginx 反代 /api/。
// 注意：服务器上历史累计的 ~/.promptbox/counter.json 不删、不动，只是不再读写。
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

// GitHub 快照落在数据目录，别躺在 web 根目录里被人直接 curl 走。
const DATA = process.env.PB_DATA || path.join(os.homedir(), '.promptbox');
try { fs.mkdirSync(DATA, { recursive: true }); } catch (_) {}
const CACHE = path.join(DATA, 'repos-cache.json');
const TTL = 6 * 3600 * 1000;                 // 6 小时刷一次，访客永远打的是本地缓存
const USER = 'RevolutionLA';
const PKG = 'dsh-dream-skin';                // 唯一发到 npm 的那个插件，下载量走官方 registry
const PORT = +(process.env.PB_PORT || 3001); // 生产固定 3001；本地并行测试时才覆盖

function readCache() { try { return JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (_) { return { at: 0, repos: [] }; } }
function writeCache(c) { try { fs.writeFileSync(CACHE, JSON.stringify(c)); } catch (_) {} }

// 一次 HTTPS GET，JSON 解析。失败一律 resolve(null) —— 拿不到真数就不显示，绝不兜一个假数上去。
function getJSON(opts) {
  return new Promise(resolve => {
    const req = https.get(Object.assign({ timeout: 12000 }, opts), res => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => { try { resolve(JSON.parse(b)); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

const GH = p => ({ host: 'api.github.com', path: p,
  headers: { 'user-agent': 'promptbox.top', accept: 'application/vnd.github+json' } });

// GitHub 的真实仓库记录：星数、主语言、最近一次推送、描述、是否 fork。
// 描述直接取仓库自己的 description —— 关于一个项目说什么，由他写的那句话说了算，不由我编。
async function fetchRepos() {
  const list = await getJSON(GH(`/users/${USER}/repos?per_page=100&sort=updated`));
  if (!Array.isArray(list)) return null;
  return list.map(r => ({
    name: r.name, stars: r.stargazers_count || 0, forks: r.forks_count || 0,
    lang: r.language, pushed: r.pushed_at, fork: !!r.fork,
    desc: (r.description || '').trim(), url: r.html_url,
  })).sort((a, b) => b.stars - a.stars || new Date(b.pushed) - new Date(a.pushed));
}

// npm 下载量：周 / 月两个口径 + 当前版本。三个请求任一失败只让对应字段缺席，不影响其余。
async function fetchNpm() {
  const [wk, mo, pkg] = await Promise.all([
    getJSON({ host: 'api.npmjs.org', path: `/downloads/point/last-week/${PKG}` }),
    getJSON({ host: 'api.npmjs.org', path: `/downloads/point/last-month/${PKG}` }),
    getJSON({ host: 'registry.npmjs.org', path: `/${PKG}` }),
  ]);
  const out = {};
  if (wk && typeof wk.downloads === 'number') out.weekly = wk.downloads;
  if (mo && typeof mo.downloads === 'number') out.monthly = mo.downloads;
  if (pkg && pkg['dist-tags']) {
    out.version = pkg['dist-tags'].latest;
    out.versions = Object.keys(pkg.versions || {}).length;
  }
  if (pkg && pkg.time && pkg.time.created) out.published = String(pkg.time.created).slice(0, 10);
  return Object.keys(out).length ? out : null;
}

// 刷新：仓库榜必成才算成功；npm 失败就沿用上一次的值（宁可旧，不可假）。
async function refresh(prev) {
  const [repos, npm] = await Promise.all([fetchRepos(), fetchNpm()]);
  if (!repos) return null;
  const c = { at: Date.now(), repos, npm: npm || (prev && prev.npm) || null };
  writeCache(c);
  return c;
}

function shape(c) {
  const own = (c.repos || []).filter(r => !r.fork);
  return {
    updated: Math.round(c.at / 1000),
    age_sec: Math.round((Date.now() - c.at) / 1000),
    package: PKG,
    npm: c.npm || null,                                  // null = 从来没取到过，前端就不画这个数
    counts: { repos: own.length, all: (c.repos || []).length },
    repos: own,                                          // 已按星数降序
  };
}

function serveRepos(res) {
  const c = readCache();
  const done = c && Array.isArray(c.repos) && c.repos.length;
  const fresh = done && Date.now() - c.at < TTL;
  const send = obj => { res.statusCode = 200; res.end(JSON.stringify(obj)); };
  if (fresh) return send(shape(c));
  refresh(c).then(n => send(shape(n || (done ? c : { at: Date.now(), repos: [], npm: null }))));
}

http.createServer((req, res) => {
  const u = (req.url || '').split('?')[0];
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  if (u === '/api/repos') return serveRepos(res);
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
}).listen(PORT, '127.0.0.1', () => console.log('counter on 127.0.0.1:' + PORT));
