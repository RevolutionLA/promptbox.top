#!/bin/bash
# 用法: shot.sh <输出名> <宽> <高> <URL> [--delay 毫秒]
# 用本地 headless Chrome 截图，不动用户正在使用的浏览器。
set -u
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
OUT_DIR="C:\\Users\\LA-GPT\\Desktop\\Space\\promptbox-site\\qa\\shots"
NAME="$1"; W="$2"; H="$3"; URL="$4"; WAIT="${5:-0}"
UD="C:\\Users\\LA-GPT\\AppData\\Local\\Temp\\qa-chrome-$W$H-$$"
"$CH" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --user-data-dir="$UD" --window-size="$W,$H" \
  --virtual-time-budget=$((6000 + WAIT)) \
  --screenshot="$OUT_DIR\\$NAME.png" "$URL" 2>/dev/null
rc=$?
rm -rf "/c/Users/LA-GPT/AppData/Local/Temp/qa-chrome-$W$H-$$" 2>/dev/null
if [ $rc -eq 0 ]; then echo "OK $NAME.png ${W}x${H}"; else echo "FAIL $NAME rc=$rc"; fi
