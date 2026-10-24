// qa/chromium.js —— 统一解析 Chromium 可执行文件，让 QA 武器库能在别人的机器上跑。
//
// 解析顺序：
//   1. 环境变量 CHROME_PATH（显式指定最优先）；
//   2. 历史默认路径（仅当文件真实存在，兼容本机旧环境）；
//   3. 返回 undefined —— 交给 playwright-core 自己按平台查找（`npx playwright install chromium`）。
//
// 用法：const { chromePath } = require('./chromium');
//       chromium.launch({ executablePath: chromePath() })
const fs = require('fs');

const LEGACY = 'C:\Users\LA-GPT\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe';

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (fs.existsSync(LEGACY)) return LEGACY;
  return undefined;
}

module.exports = { chromePath };
