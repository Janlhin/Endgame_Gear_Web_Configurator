#!/usr/bin/env python3
"""B-2: 用 Sourcegraph 公共实例做匿名代码级搜索（grep.app 429 的替代渠道）。

用法: python re/upstream/sg_search.py "查询串" ["查询串2" ...]
输出: 每个查询的命中仓库/文件/片段前 200 字符。
"""
import json
import re
import sys
import urllib.parse
import urllib.request

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"}


def search(q, display=10):
    url = ("https://sourcegraph.com/.api/search/stream?q=" + urllib.parse.quote(q) +
           f"&v=V3&t=literal&display={display}")
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read().decode("utf-8", "replace")
    matches, total = [], 0
    for line in body.splitlines():
        if not line.startswith("data: "):
            continue
        payload = line[6:].strip()
        if payload in ("[]", ""):
            continue
        try:
            obj = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            if "matchCount" in obj:
                total = max(total, obj.get("matchCount", 0))
            continue
        if isinstance(obj, list):
            for m in obj:
                if m.get("type") == "content":
                    repo = m.get("repository") or ""
                    path = m.get("path") or ""
                    chunks = m.get("chunkMatches") or []
                    snippet = re.sub(r"\s+", " ", " ".join(
                        (c.get("content") or "") for c in chunks[:3]))[:200]
                    if not snippet:
                        snippet = (m.get("chunkMatches") or [{}])[0].get("content", "")[:200]
                    matches.append((repo, path, snippet))
    return total, matches


for q in sys.argv[1:]:
    try:
        total, matches = search(q)
    except Exception as e:  # noqa: BLE001
        print(f"\n### `{q}`\n查询失败: {e}")
        continue
    print(f"\n### `{q}`  —— 命中 {total}")
    seen = set()
    for repo, path, snip in matches:
        key = (repo, path)
        if key in seen:
            continue
        seen.add(key)
        print(f"- `{repo}` `{path}`\n  > {snip}")
