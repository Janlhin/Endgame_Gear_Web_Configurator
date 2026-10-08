# -*- coding: utf-8 -*-
"""通用 VID/PID 猎取：不依赖某一种指令形态，按字节模式全量扫。
① VID/PID 以小端 u16/u32 出现在任何位置
② UTF-16 / ASCII 形式的 "VID_3367" "PID_1960" 等字符串（常见于 INF 表、设备描述符）
③ PE 头/节信息（判断是否加壳、什么框架）
"""
import sys, re, struct, collections

paths = sys.argv[1:]
VIDS = {0x3367: "EGG 新代", 0x22D4: "EGG 2020 代(XM1)"}

for path in paths:
    d = open(path, "rb").read()
    print("=" * 78)
    print("文件: %s   %d 字节 (%.2f MB)" % (path.split("/")[-1], len(d), len(d) / 1048576))
    # PE 信息
    m = re.search(rb"PE\x00\x00", d[:0x400])
    if m:
        pe = m.start()
        mach = struct.unpack_from("<H", d, pe + 4)[0]
        nsec = struct.unpack_from("<H", d, pe + 6)[0]
        print("  PE: machine=0x%04X (%s) 节数=%d  PE 偏移=0x%X" %
              (mach, {0x14c: "x86", 0x8664: "x64"}.get(mach, "?"), nsec, pe))
        # 节名
        optsz = struct.unpack_from("<H", d, pe + 20)[0]
        so = pe + 24 + optsz
        secs = []
        for i in range(nsec):
            n = d[so + i * 40: so + i * 40 + 8].rstrip(b"\x00").decode("latin1")
            vsz = struct.unpack_from("<I", d, so + i * 40 + 8)[0]
            secs.append("%s(%d)" % (n, vsz))
        print("  节: " + " ".join(secs))
    # 框架线索
    hints = []
    for pat, name in [(rb"python3\d\.dll", "Python"),
                      (rb"_MEIPASS", "PyInstaller"),
                      (rb"Electron", "Electron"),
                      (rb"Qt5Core|Qt6Core", "Qt"),
                      (rb"mscoree|\.NET", ".NET"),
                      (rb"Nullsoft|NSIS", "NSIS"),
                      (rb"wxWidgets|wxbase", "wxWidgets"),
                      (rb"MFCDLL|mfc\d+u?\.dll", "MFC"),
                      (rb"libusb|hidapi", "libusb/hidapi")]:
        if re.search(pat, d, re.I):
            hints.append(name)
    print("  线索: " + (", ".join(hints) or "无"))

    # ① VID/PID 字节模式
    for vid, vname in VIDS.items():
        pat16 = struct.pack("<H", vid)
        pat32 = struct.pack("<I", vid)
        n16 = len(re.findall(re.escape(pat16), d))
        n32 = len(re.findall(re.escape(pat32), d))
        print("  VID 0x%04X (%s): u16 出现 %d 次, u32 出现 %d 次" % (vid, vname, n16, n32))

    # ② 所有 0x18xx/0x19xx 的 u16（候选 PID）出现频次
    c = collections.Counter()
    for i in range(0, len(d) - 2):
        v = struct.unpack_from("<H", d, i)[0]
        if 0x1800 <= v <= 0x19FF:
            c[v] += 1
    print("  候选 PID（0x18xx/0x19xx，出现 >=3 次）:")
    for v, n in sorted(c.items(), key=lambda kv: -kv[1])[:14]:
        if n >= 3:
            offs = [m.start() for m in re.finditer(re.escape(struct.pack("<H", v)), d)][:6]
            print("     0x%04X x%-3d  %s" % (v, n, [hex(o) for o in offs]))

    # ③ UTF-16 / ASCII 的 VID_/PID_ 字符串
    for enc, label in [("utf-16le", "UTF-16"), ("latin1", "ASCII")]:
        try:
            txt = d.decode(enc, "ignore")
        except Exception:
            continue
        found = set(re.findall(r"(VID_[0-9A-Fa-f]{4}|PID_[0-9A-Fa-f]{4})", txt))
        if found:
            print("  %s 里的 VID_/PID_ 字符串: %s" % (label, sorted(found)[:12]))
    print()
