#!/usr/bin/env python3
"""B-1: 批量补齐社区项目的许可证 / 活跃度。

只用匿名 GitHub API（core 限额 60/h），只读。
输出 markdown 表格，供 docs/community-code-scan.md 更新。
"""
import json
import sys
import time
import urllib.error
import urllib.request

UA = {"User-Agent": "egg-web-driver-scan/1.0", "Accept": "application/vnd.github+json"}

REPOS = [
    ("johanneszab/vole", "known MIT"),
    ("zexsso/OP1-WebAPP", "known MIT"),
    ("qsxcv/UnofficialEGGWebConfig", "known AGPL-3"),
    ("daohhuynh/egg-mouse", "known Apache-2.0"),
    ("stuffz/mouse-battery-monitor", "known MIT"),
    ("niansa/UnofficialEGGMouseConfig", "pending"),
    ("swekkiekekkie/op1web", "pending"),
    ("daohhuynh/homebrew-egg-mouse", "pending"),
    ("FrancescoCiannavei/GO-BatteryAPI-EndGameGear-XM2W-v2", "pending"),
    ("racclololz/OP1w-4k-v2-Battery-Tray-Icon", "pending"),
    ("Constructor666/endgame-gear-battery-percentage", "pending"),
    ("shohamc1/OP1wBattery", "pending"),
    ("itchyfeetleech/OP1we-Control", "pending"),
    ("daviddwk/xm2we-util", "pending"),
    ("okms/xm2we-linux", "pending"),
    ("lvlanson/Endgame-Gear-XM2-8k-v2-Linux-Configurator", "pending"),
    ("Creationsss/egctl", "pending"),
    ("qaustria/xm2w", "pending"),
    ("Mannomatico/xm2ctl", "pending"),
    ("0e4ef622/op1w4k-bpf", "pending"),
    ("BrettLoewen/Endgame-Gear-Mod", "pending"),
]


def get(url):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        return e.code, {"message": (e.read()[:200].decode("utf-8", "replace") if e.fp else "")}
    except Exception as e:  # noqa: BLE001
        return -1, {"message": str(e)}


rows = []
for full, tag in REPOS:
    code, data = get(f"https://api.github.com/repos/{full}")
    if code != 200:
        rows.append((full, tag, f"HTTP {code}", "-", "-", "-", data.get("message", "")[:40]))
        time.sleep(1.0)
        continue
    lic = (data.get("license") or {}).get("spdx_id") or "NOASSERTION"
    rows.append((
        full, tag,
        f"**{lic}**" if lic != "NOASSERTION" else "⚠ 未识别",
        data.get("language") or "-",
        data.get("stargazers_count", 0),
        (data.get("pushed_at") or "-")[:10],
        (data.get("description") or "")[:60],
    ))
    time.sleep(0.8)

print("| 项目 | 原判 | SPDX | 语言 | ★ | 最后推送 | 说明 |")
print("|---|---|---|---|---|---|---|")
for r in rows:
    print("| {} | {} | {} | {} | {} | {} | {} |".format(*r))
print("\n剩余 core 限额检查:", file=sys.stderr)
c, d = get("https://api.github.com/rate_limit")
if c == 200:
    print("core 剩余:", d["resources"]["core"]["remaining"], "/", d["resources"]["core"]["limit"], file=sys.stderr)
