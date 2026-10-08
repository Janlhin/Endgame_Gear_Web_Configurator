"""XM1 VID/PID 定位器：从主程序与固件更新工具两条路径找设备标识。

背景：XM1 的 `22D4` / `1803` 出现在 UTF-16 键名区（INI 项名），不是硬编码值。
本脚本用两种可靠方法找真实 VID/PID：

方法 A —— 设备枚举 API 调用点的**参数常量**：
    SetupDiGetClassDevs / SetupDiEnumDeviceInterfaces 附近的 VID/PID 引用。

方法 B —— **注册表读取路径**：工具把 VID/PID 存在注册表，取它的
    RegQueryValueEx 调用点，回溯缓冲区填充与 GUID/句柄来源。

方法 C —— 结构体常量表：GUID/DeviceInterfaceData 附近的 4 字节常量，
    以及 0x2xxx 形式的 PID 候选（XM1 系列 PID 多在 0x18xx–0x19xx）。

固件更新工具是更好的来源：它必须枚举到 bootloader 里的设备才能刷写。
"""
import struct, re, sys, collections


def load(path):
    d = open(path, "rb").read()
    e = struct.unpack_from("<I", d, 0x3C)[0]
    coff = e + 4
    nsec = struct.unpack_from("<H", d, coff + 2)[0]
    optsz = struct.unpack_from("<H", d, coff + 16)[0]
    opt = coff + 20
    magic = struct.unpack_from("<H", d, opt)[0]
    ib = struct.unpack_from("<I", d, opt + 28)[0]
    dd = opt + (96 if magic == 0x10B else 112)
    names = ["Export","Import","Resource","Exception","Security","Reloc","Debug","Arch","TLS",
             "LoadCfg","BoundImport","IAT","DelayImport","CLR"]
    dirs = {n: struct.unpack_from("<II", d, dd + i*8) for i, n in enumerate(names)}
    secs = []
    secoff = opt + optsz
    for i in range(nsec):
        o = secoff + i*40
        nm = d[o:o+8].rstrip(b"\0").decode(errors="replace")
        vsz, va, rsz, ra = struct.unpack_from("<IIII", d, o+8)
        secs.append((nm, va, vsz, ra, rsz))
    return d, ib, secs, dirs


def r2o(secs, rva):
    for nm, va, vsz, ra, rsz in secs:
        if va <= rva < va + max(vsz, rsz):
            return ra + (rva - va)
    return None


def imp_table(d, ib, secs, dirs):
    out = {}
    if not dirs["Import"][0]:
        return out
    off = r2o(secs, dirs["Import"][0])
    while True:
        oft, tds, fwd, nmrva, ftrva = struct.unpack_from("<IIIII", d, off)
        if nmrva == 0:
            break
        dll = d[r2o(secs, nmrva):].split(b"\0")[0].decode(errors="replace")
        to = r2o(secs, oft if oft else ftrva)
        fns = []
        i = 0
        while True:
            v = struct.unpack_from("<I", d, to+i*4)[0]
            if v == 0:
                break
            if not (v & 0x80000000):
                fns.append((d[r2o(secs, v)+2:].split(b"\0")[0].decode(errors="replace"), ftrva + ib + i*4))
            i += 1
        out[dll] = fns
        off += 20
    return out


def text_seg(secs):
    for nm, va, vsz, ra, rsz in secs:
        if nm == ".text":
            return va, ra, rsz
    raise SystemExit("no .text")


def scan(path, label):
    d, ib, secs, dirs = load(path)
    tva, tra, trsz = text_seg(secs)
    text = d[tra:tra+trsz]
    imp = imp_table(d, ib, secs, dirs)

    print("\n" + "=" * 70)
    print("=== %s ===" % label)
    print("  size %d  ImageBase 0x%X" % (len(d), ib))
    if dirs["Debug"][0]:
        o = r2o(secs, dirs["Debug"][0])
        _, _, _, _, typ, csz, _, ptr = struct.unpack_from("<IIHHIIII", d, o)
        if typ == 2:
            print("  PDB:", d[ptr+24:ptr+csz].split(b"\0")[0].decode(errors="replace"))

    # 1) 枚举/注册表 API 调用点
    watch = {}
    for dll, fns in imp.items():
        for nm, iat in fns:
            if re.match(r"(SetupDi(Enum|Get)|HidD_|Reg(Open|Query|Enum))", nm):
                watch[nm] = iat
    calls = {}
    for nm, iat in watch.items():
        pat = b"\xFF\x15" + struct.pack("<I", iat)
        hits = []
        s = 0
        while True:
            j = text.find(pat, s)
            if j < 0:
                break
            hits.append(ib + tva + j)
            s = j + 1
        calls[nm] = hits
    print("\n--- 关键 API 调用点 ---")
    for nm in sorted(calls):
        if calls[nm]:
            print("  %-36s %d 处 %s" % (nm, len(calls[nm]), ["0x%X" % h for h in calls[nm][:6]]))

    # 2) 找设备标识：SetupDi 调用点附近 ±160 字节内的 4 字节立即数
    print("\n--- 枚举调用点附近的 32 位常量（VID/PID 候选）---")
    seen = set()
    for nm in ("SetupDiGetClassDevsW", "SetupDiEnumDeviceInterfaces", "SetupDiGetClassDevsA"):
        for va in calls.get(nm, []):
            rva = va - ib
            off = r2o(secs, rva)
            lo = max(0, off - 200)
            hi = min(len(text), off + 200)
            for i in range(lo, hi - 4):
                v = struct.unpack_from("<I", d, i)[0]
                if 0x0100 <= v <= 0xFFFF and v not in (0x0100,):
                    # 只收尾 4 位像 PID 的（0x18xx/0x19xx/0x15xx/0x22xx/0x33xx）
                    if (v >> 8) in (0x18, 0x19, 0x15, 0x22, 0x33, 0x16):
                        key = (nm, v)
                        if key in seen:
                            continue
                        seen.add(key)
                        print("  %-30s @0x%08X  → 0x%04X" % (nm, va, v))

    # 3) 注册表值名（UTF-16）与路径
    print("\n--- 注册表/INI 相关字符串 ---")
    u16 = [(m.start(), m.group().decode("utf-16le")) for m in re.finditer(rb"(?:[\x20-\x7e]\x00){4,}", d)]
    for off_, s in u16:
        if re.search(r"SOFTWARE|HKEY|\\\\Endgame|\\\\XM1|Vendor|VID_|PID_|Product|Profiles|AppData", s, re.I):
            print("  @0x%06X %s" % (off_, s[:90]))
    asc = [(m.start(), m.group().decode()) for m in re.finditer(rb"[\x20-\x7e]{5,}", d)]
    for off_, s in asc:
        if re.search(r"VID_|PID_|VID=|PID=|\\\\XM1|\\\\Endgame|AppData|Profiles|firmware.*\d\.\d", s):
            print("  [asc] @0x%06X %s" % (off_, s[:90]))

    return d, ib, secs, calls


if __name__ == "__main__":
    targets = [
        (r"E:/IDM/Compressed/XM1 Configuration Software V1.09/XM1 Configuration Software.exe", "主程序 XM1 Configuration Software.exe"),
        (r"E:/IDM/Compressed/XM1 Configuration Software V1.09/XM1 Firmware Update Tool/XM1 Firmware Update Tool.exe", "固件更新工具"),
    ]
    for p, label in targets:
        try:
            scan(p, label)
        except SystemExit as e:
            print("skip:", e)
        except Exception as e:
            print("error on %s: %s" % (label, e))
