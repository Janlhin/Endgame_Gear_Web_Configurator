#!/usr/bin/env python3
"""B-1b: 走 raw.githubusercontent 绕开 API 限额，直接读 LICENSE 正文判定许可证。"""
import re
import urllib.error
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) egg-web-driver-scan/1.0"}

REPOS = [
    "zexsso/OP1-WebAPP",
    "stuffz/mouse-battery-monitor",
    "swekkiekekkie/op1web",
    "daohhuynh/homebrew-egg-mouse",
    "racclololz/OP1w-4k-v2-Battery-Tray-Icon",
    "Constructor666/endgame-gear-battery-percentage",
    "shohamc1/OP1wBattery",
    "itchyfeetleech/OP1we-Control",
    "lvlanson/Endgame-Gear-XM2-8k-v2-Linux-Configurator",
    "Creationsss/egctl",
    "qaustria/xm2w",
    "Mannomatico/xm2ctl",
    "0e4ef622/op1w4k-bpf",
    "BrettLoewen/Endgame-Gear-Mod",
]

CANDIDATES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "LICENCE"]

PATTERNS = [
    ("AGPL-3.0", r"GNU AFFERO GENERAL PUBLIC LICENSE"),
    ("GPL-3.0", r"GNU GENERAL PUBLIC LICENSE.*Version 3"),
    ("GPL-2.0", r"GNU GENERAL PUBLIC LICENSE.*Version 2"),
    ("MIT", r"Permission is hereby granted, free of charge, to any person obtaining a copy"),
    ("Apache-2.0", r"Apache License"),
    ("BSD-3-Clause", r"Redistribution and use in source and binary forms"),
    ("Unlicense", r"This is free and unencumbered software released into the public domain"),
    ("MPL-2.0", r"Mozilla Public License"),
    ("WTFPL", r"DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE"),
]


def fetch(url):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return None


for repo in REPOS:
    hit = None
    for branch in ("HEAD", "main", "master"):
        for name in CANDIDATES:
            txt = fetch(f"https://raw.githubusercontent.com/{repo}/{branch}/{name}")
            if txt and len(txt) > 30:
                hit = (name, txt)
                break
        if hit:
            break
    if not hit:
        print(f"| {repo} | ⚠ **无任何 LICENSE 文件**（视作 all-rights-reserved，只能参考不得复制） |")
        continue
    name, txt = hit
    head = " ".join(txt[:400].split())
    verdict = "NOASSERTION"
    for spdx, pat in PATTERNS:
        if re.search(pat, txt[:4000], re.I | re.S):
            verdict = spdx
            break
    print(f"| {repo} | {verdict} · `{name}` · {head[:180]} |")
