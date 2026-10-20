# -*- coding: utf-8 -*-
"""核实官方配置工具里的设备表 / CPI 常量 / WE 配置（2026-10-20 复核）。

零第三方依赖：手写 PE 解析 + x86 立即数扫描 + 设备表结构识别。
结论与 src/protocol.ts、src/xm2we.ts 逐项对照。

用法：
    python re/upstream/verify_official_data.py
        # 默认扫本目录 *_tool.exe + _dl8k/*.exe + 本机 XM1 主程序（若存在）
"""
import glob
import os
import re
import struct
import sys

# —— 期望值（与 src/protocol.ts / src/xm2we.ts 同步）——
EXPECT = {
    "XM2w-4k_tool.exe":                    ([0x1968, 0x1967, 0x1970, 0x1969], "4k gen1"),
    "OP1w-4k_tool.exe":                    ([0x1972, 0x1971, 0x1970, 0x1969], "4k gen1"),
    "XM2w-4k-v2_tool.exe":                 ([0x1982, 0x1981, 0x1970, 0x1969], "4k gen2"),
    "OP1w-4k-v2_tool.exe":                 ([0x1984, 0x1983, 0x1970, 0x1969], "4k gen2"),
    "pf_tool.exe":                         ([0x1976], "8k gen1"),
    "OP1-8k-v2_tool.exe":                  ([0x1978], "8k gen2"),
    "Endgame.Gear.XM2.8k.Configuration.Tool.v1.12.exe":   ([0x1966], "8k gen1"),
    "Endgame.Gear.OP1.8k.Configuration.Tool.V1.12.exe":   ([0x1964], "8k gen1"),
    "Endgame.Gear.XM2.8k.v2.Configuration.Tool.v1.01.exe": ([0x1980], "8k gen2"),
    "Endgame.Gear.OP1.8k.v2.Configuration.Tool.v1.00.exe": ([0x1978], "8k gen2"),
}

XM1_PATH = r"E:/IDM/Compressed/XM1 Configuration Software V1.09/XM1 Configuration Software.exe"
XM1_EXPECT = ([0x1803], 0x22D4, "XM1 gen0")

WE_CFG = "we_series_cfg.ini"
WE_EXPECT = {"vid": 0x3367, "pids": [0x1960, 0x1962], "pid2": 0x1961}

MAGIC = {
    0x51EB851F: "÷50",
    0xCCCCCCCD: "÷10",
    0x10624DD3: "÷100",
}


def pe_info(d):
    m = re.search(rb"PE\x00\x00", d[:0x800])
    if not m:
        return None
    pe = m.start()
    return {
        "machine": struct.unpack_from("<H", d, pe + 4)[0],
        "nsec": struct.unpack_from("<H", d, pe + 6)[0],
        "optsz": struct.unpack_from("<H", d, pe + 20)[0],
        "pe": pe,
    }


def sections(d, info):
    so = info["pe"] + 24 + info["optsz"]
    out = []
    for i in range(info["nsec"]):
        name = d[so + i * 40: so + i * 40 + 8].rstrip(b"\x00").decode("latin1")
        vsz = struct.unpack_from("<I", d, so + i * 40 + 8)[0]
        out.append("%s(%d)" % (name, vsz))
    return out


def push_pids(d, lo=0x1900, hi=0x19FF):
    """x86 `push imm32`（68 XX XX XX XX）里的设备匹配常量。"""
    found = {}
    for i in range(len(d) - 5):
        if d[i] == 0x68:
            v = struct.unpack_from("<I", d, i + 1)[0]
            if lo <= v <= hi:
                found.setdefault(v, []).append(i)
    return found


def table_pids(d, stride=10, run=4):
    """4k 工具的启动期设备表：PID 以固定 10 字节步长连续出现（非 push 指令）。
    记录内必须出现 VID 字节 `67 33`（0x3367），否则只是随机巧合。"""
    hits = set()
    for i in range(0, len(d) - stride * run):
        seq = []
        has_vid = False
        for k in range(run):
            rec = d[i + k * stride: i + (k + 1) * stride]
            v = struct.unpack_from("<H", rec, 0)[0]
            if 0x1900 <= v <= 0x19FF:
                seq.append(v)
                if b"\x67\x33" in rec:
                    has_vid = True
            else:
                break
        if len(seq) == run and has_vid:
            hits.update(seq)
    return hits


def vids(d):
    out = {}
    for i in range(len(d) - 5):
        if d[i] == 0x68:
            v = struct.unpack_from("<I", d, i + 1)[0]
            if v in (0x3367, 0x22D4):
                out.setdefault(v, 0)
                out[v] += 1
    return out


def magic_hits(d):
    out = []
    for v, name in MAGIC.items():
        n = d.count(struct.pack("<I", v))
        if n:
            out.append("%s×%d" % (name, n))
    return out


def version_strings(d):
    txt = d.decode("utf-16-le", "ignore")
    out = []
    for key in ("ProductName", "FileVersion", "CompanyName"):
        m = re.search(key + r"\x00+([^\x00]{1,80})", txt)
        if m:
            out.append("%s=%s" % (key, m.group(1).strip()))
    return out


def ini_kv(path):
    raw = open(path, "rb").read()
    txt = raw.decode("utf-16-le" if raw[:2] == b"\xff\xfe" else "utf-8-sig", "ignore")
    kv = {}
    for line in txt.splitlines():
        line = line.strip()
        if not line or line.startswith(";") or line.startswith("["):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            kv[k.strip()] = v.strip()
    return kv


def hex_list(vs):
    return ", ".join("0x%04X" % v for v in vs)


def main():
    files = sorted(glob.glob("*_tool.exe")) + sorted(glob.glob("_dl8k/*.exe"))
    all_ok = True
    print("=" * 100)
    print("一、官方配置工具（PE / 版本 / 设备表 / CPI 常量）")
    print("=" * 100)
    for path in files:
        name = path.replace("\\", "/").split("/")[-1]
        d = open(path, "rb").read()
        info = pe_info(d)
        secs = " ".join(sections(d, info)) if info else "-"
        exp, label = EXPECT.get(name, (None, "?"))

        p_pids = push_pids(d)
        t_pids = table_pids(d)
        found = set(p_pids) | t_pids
        vid = vids(d)

        missing = [p for p in (exp or []) if p not in found]
        extra = sorted(found - set(exp or []))
        ok = (not missing) if exp else None
        if ok is False:
            all_ok = False

        print("\n[%s]" % name)
        print("  PE: %s  节: %s" % ({0x14C: "x86", 0x8664: "x64"}.get(info["machine"], "?"), secs))
        if version_strings(d):
            print("  版本: " + "; ".join(version_strings(d)))
        print("  push 法 PID : %s" % (hex_list(sorted(p_pids)) or "—"))
        print("  表法 PID    : %s" % (hex_list(sorted(t_pids)) or "—"))
        print("  VID         : %s" % (hex_list(sorted(vid)) or "—"))
        print("  CPI 魔数    : %s" % ("; ".join(magic_hits(d)) or "—"))
        verdict = "OK" if ok else ("缺 " + hex_list(missing) if exp else "跳过")
        if extra:
            verdict += "（额外 %s，多为非 PID 常量）" % hex_list(extra)
        print("  期望(%s): %s → %s" % (label, hex_list(exp or []), verdict))

    print("\n" + "=" * 100)
    print("二、XM1（本机安装包，仓库不留副本）")
    print("=" * 100)
    if os.path.exists(XM1_PATH):
        import hashlib
        d = open(XM1_PATH, "rb").read()
        sha = hashlib.sha256(d).hexdigest()
        pids = push_pids(d, 0x1800, 0x18FF)
        vid = vids(d)
        ok = 0x1803 in pids and 0x22D4 in vid
        all_ok = all_ok and ok
        print("  文件: %s" % XM1_PATH)
        print("  SHA256: %s" % sha)
        print("  push PID: %s   VID: %s" % (hex_list(sorted(pids)), hex_list(sorted(vid))))
        print("  报告/载荷常量: 0x411×%d  0x400×%d" % (d.count(struct.pack("<I", 0x411)), d.count(struct.pack("<I", 0x400))))
        print("  判定: %s（期望 PID 0x1803 + VID 0x22D4）" % ("OK" if ok else "FAIL"))
    else:
        print("  未找到本机安装包，跳过（MANIFEST 第二节记录了它的来源与哈希）")

    print("\n" + "=" * 100)
    print("三、WE 族（Cfg.ini，官方 CDN 提取物）")
    print("=" * 100)
    if os.path.exists(WE_CFG):
        kv = ini_kv(WE_CFG)
        vid = int(kv.get("VID", "0"), 16)
        pids = [int(x, 16) for x in kv.get("PID", "").split(",") if x.strip()]
        pid2 = int(kv.get("PID2", "0"), 16)
        ok = (vid == WE_EXPECT["vid"] and pids == WE_EXPECT["pids"] and pid2 == WE_EXPECT["pid2"])
        all_ok = all_ok and ok
        print("  Title=%s  VID=0x%04X  PID=%s  PID2=0x%04X" % (kv.get("Title"), vid, hex_list(pids), pid2))
        print("  判定: %s（期望 VID 0x3367 / PID 0x1960,0x1962 / PID2 0x1961）" % ("OK" if ok else "FAIL"))
    else:
        print("  未找到 %s" % WE_CFG)

    print("\n" + "=" * 100)
    print("总判定: " + ("全部命中" if all_ok else "存在不一致，见上"))
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
