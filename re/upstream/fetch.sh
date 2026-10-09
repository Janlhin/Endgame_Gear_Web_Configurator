#!/usr/bin/env bash
# 按 MANIFEST.md 重新抓取上游二进制，并校验 SHA256。
#
# 为什么要这个脚本：官方工具不入库（体积 + 版权），但"重新推导一遍"的凭据必须留着。
# 结论已经写进 re/upstream/SOURCES.md；哪天要复核 PID、或者要适配新固件，
# 跑这个脚本把原物取回来即可，不必重新翻 GitHub release 页。
#
# 用法：bash re/upstream/fetch.sh          # 只补缺失的文件
#       bash re/upstream/fetch.sh --force  # 全量重下（校验哈希）
#
# 不含 xm1_main.exe —— 它来自用户本机的 XM1 Configuration Software V1.09 安装包，
# 仓库不留副本（见 MANIFEST.md 第二节）。
set -u
cd "$(dirname "$0")"

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

# 仓库|tag|远端文件名|本地文件名|SHA256
LIST='
EndgameGear/XM2w-4k|Firmware_1.10|Endgame.Gear.XM2w.4k.Configuration.Tool.v1.04.exe|XM2w-4k_tool.exe|6e635fb5dc4060a8e8356811cce55fe8f3e69641dbb0479e80da77bda3a7380c
EndgameGear/OP1w-4k|Firmware_1.10|Endgame.Gear.OP1w.4k.Configuration.Tool.v1.04.exe|OP1w-4k_tool.exe|5d8695b4cf14bd42683f4fb413ef344de06cd5ad716cd5aaf39c8ee00c34c2d1
EndgameGear/XM2w-4k-v2|Firmware_1.03|Endgame.Gear.XM2w.4k.v2.Configuration.Tool.v1.01.exe|XM2w-4k-v2_tool.exe|8d8d6d3d73b45c0aabae27394b4d22a98c51d39fbcaaa292ccda6bfbffc4f038
EndgameGear/OP1w-4k-v2|Firmware_1.03|Endgame.Gear.OP1w.4k.v2.Configuration.Tool.v1.00.exe|OP1w-4k-v2_tool.exe|d5e5e314beecb61afc1726579b7e86d625cf409c41f4e9dd9719f3d1f6889538
EndgameGear/OP1-8k-v2|Firmware_1.04|Endgame.Gear.OP1.8k.v2.Configuration.Tool.v1.00.exe|OP1-8k-v2_tool.exe|00ee4b2067b004e5bf94d240dd8ec13b461fdd2213f17e2f3278ab92355be9fc
EndgameGear/OP1-8k-Purple-Frost-LE|Firmware_1.25|Endgame.Gear.OP1.8k.Purple.Frost.Limited.Edition.Configuration.Tool.v1.11.exe|pf_tool.exe|b387001b6fb5e6655a7a4cf36c157e7028b222a9b03677848179c7fef7bcd1ed
'

sha() { sha256sum "$1" 2>/dev/null | cut -d" " -f1; }

echo "$LIST" | while IFS='|' read -r repo tag remote local want; do
  [ -z "${repo:-}" ] && continue
  if [ "$FORCE" -eq 0 ] && [ -f "$local" ] && [ "$(sha "$local")" = "$want" ]; then
    echo "  ok    $local"; continue
  fi
  url="https://github.com/$repo/releases/download/$tag/$remote"
  printf '  fetch %s ... ' "$local"
  curl -sSL -o "$local" "$url" || { echo "FAIL"; rm -f "$local"; continue; }
  got="$(sha "$local")"
  if [ "$got" = "$want" ]; then echo "ok"; else echo "HASH MISMATCH"; echo "    期望 $want"; echo "    实际 $got"; fi
done

echo
echo "8k v1.12 与 v2 v1.07 的工具包请按 MANIFEST.md 表格里的仓库/文件名从 release 页取："
echo "  EndgameGear/XM2-8k · EndgameGear/OP1-8k · EndgameGear/XM2-8k-v2 · EndgameGear/OP1-8k-v2"
