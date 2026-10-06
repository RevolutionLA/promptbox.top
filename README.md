# promptbox.top

刘昂的个人主页 —— 一个单文件页面，零第三方请求，自己会量自己。

Live: <https://promptbox.top> · 一个 HTML 装下全部 CSS / JS / 内联 SVG，后端只有 200 行 Node。

> A single-file personal homepage: no third-party requests, self-hosted font subsets, and a QA harness that measures itself against a fixed quality bar.

## 目录

| 路径 | 是什么 |
|---|---|
| `v3/index.html` | 线上站点本体（部署的就是这一个文件） |
| `v3/counter.js` | 后端：`/api/repos` 每 6 小时向 GitHub / npm 现读一次并缓存，浏览器侧因此零第三方请求 |
| `v3/fonts/` | 自托管的字体子集（由 `qa/mk-*.js` 从 OFL 源字体生成） |
| `qa/fx-source.js` | 名字粒子层的源码。**改粒子改这个文件**，再用 `qa/splice-fx.js` 拼回 `v3/index.html`（两段锚点之间） |
| `qa/` | 自检脚本，见下 |
| `DESIGN.md` | 设计说明与红线（为什么这么做、哪些坑踩过） |
| `qa/BASELINE.md` | 评分卡：五个维度的达标线 |

## 跑起来

```bash
npm i                                   # 只有 playwright-core
node qa/serve.js v3 8099                # 本地起站（顺带代理 /api，与线上同形）
open http://127.0.0.1:8099/
```

后端要单独跑时：`node v3/counter.js`（默认 3001，`PB_DATA` 可指定数据目录）。

## 自检（这个仓库真正的部分）

```bash
# 五变体品质审计：桌面 / 手机 / 减动效 / 断 CDN（模拟中国大陆）/ 冷字体
node qa/audit.js r-d    http://127.0.0.1:8099/
node qa/audit.js r-m    http://127.0.0.1:8099/ --mobile
node qa/audit.js r-rm   http://127.0.0.1:8099/ --reduced-motion
node qa/audit.js r-cdn  http://127.0.0.1:8099/ --offline-cdn
node qa/serve.js v3 8094 --slow-fonts 1800 &      # 冷字体那一档要单独的慢字体服务
node qa/audit.js r-cold http://127.0.0.1:8094/

node qa/check-console.js          http://127.0.0.1:8099/   # 两档视口，0 报错才算过
node qa/probe-content.js          http://127.0.0.1:8099/   # 内容终检：第三方计数、残留叙事、该在的东西
node qa/check-subset-coverage.js  http://127.0.0.1:8099/   # 逐字核对：页面上每个字形都在子集里
node qa/probe-name-lum.js         http://127.0.0.1:8099/   # 名字落定后的真实亮度
node qa/probe-fx.js               http://127.0.0.1:8099/   # 粒子层读数
```

达标线：五变体零问题项 + `qa/BASELINE.md` 五个维度全部 ≥ 9.0。

脚本里的 Chromium 路径是顶部的 `EXE` 常量，换成你自己 `~/.cache/ms-playwright` 下的即可。
量线上时务必带 `--no-proxy-server`（脚本已内置）：走系统代理量到的是笔记本的网络栈，不是这个站。

## 红线（摘要，全文见 `DESIGN.md`）

- **零第三方请求**：字体自托管 + `preload` + `font-display: swap`；源站 `no-transform` 挡住 CDN 注入。页脚那句 "0 third-party requests" 是真量出来的，不是写死的。
- **首屏在字体到货前不落地**：`html.fonts-holding` 闸门，只等首屏那几套字面；藏的范围是整屏，放闸前空转两帧。CLS 必须为 0。
- **粒子层不许拖帧**：内置 FPS 自保，掉档后 20s 冷却再升；`prefers-reduced-motion` 下整层不启动，名字保持全不透明。
- **不编造关于他生活的事实**，页面上每个数字都能在别处当场查到。

## 素材与许可

| 素材 | 来源 | 许可 |
|---|---|---|
| Space Grotesk / Noto Serif SC / Instrument Serif | Google Fonts，子集自托管 | SIL Open Font License 1.1 |
| 猫头轮廓 | [Lucide](https://lucide.dev) `cat`，逐字取轮廓、只加瞳孔 | ISC |

字体源文件（67M 可变字体）不入库，需要重新切子集时按 `qa/mk-*.js` 里的说明从上游取。
