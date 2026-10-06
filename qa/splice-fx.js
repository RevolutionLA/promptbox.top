// qa/splice-fx.js —— 把 qa/fx-source.js（§4 粒子层的可编辑源）换进 v3/index.html，锚点替换、可反复跑。
// 为什么单独留源文件：这一层要在浏览器外面反复调，直接在 34k 字符的巨型内联脚本里改不现实；
// 跑完 index.html 才是唯一交付物（fx-source.js 不上线）。
const fs = require('fs'), path = require('path');
const P = path.resolve(__dirname, '..', 'v3', 'index.html');
const NEW = fs.readFileSync(path.resolve(__dirname, 'fx-source.js'), 'utf8');
const s = fs.readFileSync(P, 'utf8');
const A = s.indexOf('/* ── 4. 粒子层'), B = s.indexOf('/* 启动时机：字体闸门放开那一刻');
if (A < 0 || B < 0 || B <= A) { console.error('锚点没找到', A, B); process.exit(1); }
let out = s.slice(0, A) + NEW.replace(/\s*$/, '\n') + s.slice(B);
// 新块自带那条"启动时机"注释，把原文里重复的那条去掉
while ((out.match(/启动时机：字体闸门放开/g) || []).length > 1) {
  const i1 = out.indexOf('/* 启动时机：字体闸门放开那一刻');
  const i2 = out.indexOf('*/', i1) + 2;
  const i3 = out.indexOf('/* 启动时机：字体闸门放开那一刻', i2);
  const i4 = out.indexOf('*/', i3) + 2;
  out = out.slice(0, i2) + '\n' + out.slice(i4);
}
fs.writeFileSync(P, out);
console.log('§4 ' + (B - A) + 'B → ' + NEW.length + 'B；文件 ' + s.length + ' → ' + out.length);
