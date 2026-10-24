#!/bin/bash
# 用法: shot.sh <输出名> <宽> <高> <URL> [--delay 毫秒]
# 用本地 headless Chrome 截图，不动用户正在使用的浏览器。
#
# 浏览器与目录全部靠解析，不写死任何一台机器的路径：
#   CHROME_PATH  显式指定（CI 或非标准安装位置用这个）
#   否则按常见安装位置探测，最后交给 PATH 里的 chrome/chromium
# 输出落在脚本同级的 shots/ 下，临时 profile 用 mktemp 建、退出时删。
set -u

NAME="$1"; W="$2"; H="$3"; URL="$4"; WAIT="${5:-0}"

find_chrome() {
  if [ -n "${CHROME_PATH:-}" ]; then printf '%s' "$CHROME_PATH"; return 0; fi
  local c
  for c in \
    "/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/usr/bin/google-chrome" "/usr/bin/chromium" "/usr/bin/chromium-browser"; do
    [ -x "$c" ] && { printf '%s' "$c"; return 0; }
  done
  command -v google-chrome || command -v chromium || command -v chrome
}

CH="$(find_chrome)" || {
  echo "FAIL no Chrome/Chromium found - set CHROME_PATH to the executable" >&2
  exit 3
}

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$HERE/shots"
mkdir -p "$OUT_DIR"

UD="$(mktemp -d 2>/dev/null || mktemp -d -t qa-chrome)"
trap 'rm -rf "$UD"' EXIT

"$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --user-data-dir="$UD" --window-size="$W,$H" \
  --virtual-time-budget=$((6000 + WAIT)) \
  --screenshot="$OUT_DIR/$NAME.png" "$URL" 2>/dev/null
rc=$?
if [ $rc -eq 0 ]; then echo "OK $NAME.png ${W}x${H}"; else echo "FAIL $NAME rc=$rc"; fi
exit $rc
