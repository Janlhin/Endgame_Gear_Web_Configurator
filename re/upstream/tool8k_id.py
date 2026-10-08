"""8k 有线族工具（XM2 8k / OP1 8k 配置工具 v1.12）协议族鉴定。

目的：判定它属于 Endgame Gear 四代协议族中的哪一族，以及是否沿用
4k 无线族的 0xA1 命令报告 + 0xA0 大 blob 结构。

用法：python tool8k_id.py <exe路径>
"""
import struct, re, sys

def sections(d):
    e = struct.unpack_from("<I", d, 0x3C)[0]
    coff = e + 4
    nsec = struct.unpack_from("<H", d, coff + 2)[0]
    optsz = struct.unpack_from("<H", d, coff + 16)[0]
    opt = coff + 20
    magic = struct.unpack_from("<H", d, opt)[0]
    ib = struct.unpack_from("<I", d, opt + 28)[0]
    ddoff = opt + (96 if magic == 0x10B else 112)
    names = ["Export","Import","Resource","Exception","Security","Reloc","Debug","Arch","TLS",
             "LoadCfg","BoundImport","IAT","DelayImport","CLR"]
    dirs = {n: struct.unpack_from("<II", d, ddoff + i*8) for i, n in enumerate(names)}
    secs = []
    secoff = opt + optsz
    for i in range(nsec):
        o = secoff + i*40
        nm = d[o:o+8].rstrip(b"\0").decode(errors="replace")
        vsz, va, rsz, ra = struct.unpack_from("<IIII", d, o+8)
        secs.append((nm, va, vsz, ra, rsz))
    return ib, magic, secs, dirs

def r2o(secs, rva):
    for nm, va, vsz, ra, rsz in secs:
        if va <= rva < va + max(vsz, rsz):
            return ra + (rva - va)
    return None

def text_of(secs):
    for nm, va, vsz, ra, rsz in secs:
        if nm == ".text":
            return va, ra, rsz
    raise SystemExit("no .text")

def imports(d, ib, secs, dirs):
    out = {}
    if not dirs["Import"][0]:
        return out
    off = r2o(secs, dirs["Import"][0])
    while True:
        oft, tds, fwd, nmrva, ftrva = struct.unpack_from("<IIIII", d, off)
        if nmrva == 0:
            break
        dll = d[r2o(secs, nmrva):].split(b"\0")[0].decode(errors="replace")
        thunk = oft if oft else ftrva
        to = r2o(secs, thunk)
        fns = []
        i = 0
        while True:
            v = struct.unpack_from("<I", d, to+i*4)[0]
            if v == 0:
                break
            if not (v & 0x80000000):
                nm = d[r2o(secs, v)+2:].split(b"\0")[0].decode(errors="replace")
                fns.append((nm, ftrva + ib + i*4))
            i += 1
        out[dll] = fns
        off += 20
    return out

def main(path):
    d = open(path, "rb").read()
    ib, magic, secs, dirs = sections(d)
    print("=== %s ===" % path.split("\\")[-1].split("/")[-1])
    print("size %d  PE32 %s  ImageBase 0x%X  sections %d" % (len(d), magic == 0x10B, ib, len(secs)))
    print("CLR dir: 0x%X (%s)" % (dirs["CLR"][0], "*** .NET ***" if dirs["CLR"][0] else "原生"))
    for nm, va, vsz, ra, rsz in secs:
        print("  %-8s va=0x%08X rsz=0x%06X" % (nm, va, rsz))

    # PDB
    if dirs["Debug"][0]:
        o = r2o(secs, dirs["Debug"][0])
        ch, tds, mjv, mnv, typ, csz, addr, ptr = struct.unpack_from("<IIHHIIII", d, o)
        if typ == 2:
            cv = d[ptr:ptr+csz]
            pdb = cv[24:].split(b"\0")[0]
            print("PDB:", pdb.decode(errors="replace"))

    imp = imports(d, ib, secs, dirs)
    print("\n关键导入：")
    for dll, fns in imp.items():
        key = [n for n, _ in fns if re.match(r"Hid(D|P)_|SetupDi|GetCPInfo|WriteEEPROM|ReadEEPROM", n)]
        if key:
            print("  %-14s %s" % (dll, ", ".join(key)))

    # 导出（厂商把协议做成 DLL 导出时会看到）
    if dirs["Export"][0]:
        print("\n有导出表（协议可能在 DLL 里）")

    # 报告头扫描：首字节 0xA1 的 dword/word 立即数
    tva, tra, trsz = text_of(secs)
    text = d[tra:tra+trsz]
    import collections
    hits = collections.defaultdict(list)
    i = 0
    while i < len(text) - 6:
        if text[i] == 0xC7:
            modrm = text[i+1]; mod = (modrm>>6)&3; reg = (modrm>>3)&7; rm = modrm&7
            if reg == 0 and rm == 5 and mod in (1,2):
                dl = 1 if mod == 1 else 4
                v = struct.unpack_from("<I", text, i+2+dl)[0]
                if (v & 0xFF) == 0xA1:
                    hits[v].append(ib+tva+i)
                i += 2+dl+4; continue
        i += 1
    print("\n=== 报告头（首字节 0xA1）dword 立即数 ===")
    if not hits:
        print("  无 —— 说明不是 4k 族的 0xA1+buf[1] 命令布局")
    for v in sorted(hits):
        b = [(v >> (8*k)) & 0xFF for k in range(max(1, v.bit_length()//8))]
        print("  0x%06X → %s   (%d 处: %s)" % (v, " ".join("%02X" % x for x in reversed(b)),
                                              len(hits[v]), ", ".join("0x%X" % x for x in hits[v][:6])))

    # 字符串线索
    asc = set(m.group().decode() for m in re.finditer(rb"[\x20-\x7e]{6,}", d))
    u16 = set(m.group().decode("utf-16le") for m in re.finditer(rb"(?:[\x20-\x7e]\x00){5,}", d))
    allstr = asc | u16
    print("\n=== 协议线索字符串 ===")
    for pat in ["22D4","3367","0xA1","A1","EEPROM","EEPROM","Cfg.ini",".ini","profile","Profile",
                "hidapi","HIDAPI","Endgame","XM2","OP1","8k","CPI","polling","Report ID","ReportId"]:
        f = [s[:80] for s in allstr if pat in s]
        if f and pat not in ("A1",):
            print("  %-10s %d 条  例: %s" % (pat, len(f), f[0][:70]))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "Tool8k_v1.12.exe")
