"""XM1 主程序扫描：定位 HID 通讯层、VID/PID 加载点、协议命令字。

XM1 Configuration Software.exe (PE32 x86, MFC, 2020-07-03)
PDB: H:\jyjEDiskWork\K25A VS2017\K25AB V0.25 - K25B\Release\XM1 RGB Configuration Software.pdb
"""
import struct, re, sys

EXE = r"xm1_extracted/XM1 Configuration Software/XM1 Configuration Software/program files/Endgame Gear/XM1/XM1 Configuration Software.exe"

def sections(d):
    e = struct.unpack_from("<I", d, 0x3C)[0]
    coff = e + 4
    nsec = struct.unpack_from("<H", d, coff + 2)[0]
    optsz = struct.unpack_from("<H", d, coff + 16)[0]
    opt = coff + 20
    magic = struct.unpack_from("<H", d, opt)[0]
    ddoff = opt + (96 if magic == 0x10B else 112)
    dirs = {}
    names = ["Export","Import","Resource","Exception","Security","Reloc","Debug","Arch","TLS",
             "LoadCfg","BoundImport","IAT","DelayImport","CLR"]
    for i, nm in enumerate(names):
        dirs[nm] = struct.unpack_from("<II", d, ddoff + i * 8)
    secs = []
    secoff = opt + optsz
    for i in range(nsec):
        o = secoff + i * 40
        nmv = d[o:o+8].rstrip(b"\0").decode(errors="replace")
        vsz, va, rsz, ra = struct.unpack_from("<IIII", d, o + 8)
        secs.append((nmv, va, vsz, ra, rsz))
    return secs, dirs, magic

def r2o(secs, rva):
    for nmv, va, vsz, ra, rsz in secs:
        if va <= rva < va + max(vsz, rsz):
            return ra + (rva - va)
    return None

def imports(d, secs):
    """返回 {dll: [(name, iat_rva)]}"""
    imp_rva, _ = struct.unpack_from("<II", d, 0)  # placeholder
    return {}

def load(path=EXE):
    return open(path, "rb").read()

def text_range(secs):
    for nmv, va, vsz, ra, rsz in secs:
        if nmv == ".text":
            return va, ra, rsz
    raise SystemExit("no .text")

if __name__ == "__main__":
    d = load()
    secs, dirs, magic = sections(d)
    print("magic %s" % hex(magic))
    print("sections:")
    for s in secs:
        print("  %-8s va=0x%08X vsz=0x%06X ra=0x%08X rsz=0x%06X" % s)

    # 完整导入表（含 IAT thunk 地址）
    imp_rva, imp_sz = dirs["Import"]
    print("\n=== IMPORTS ===")
    off = r2o(secs, imp_rva)
    imagebase = struct.unpack_from("<I", d, struct.unpack_from("<I", d, 0x3C)[0] + 4 + 20 + 28)[0]
    print("  ImageBase = 0x%08X" % imagebase)
    iat_entries = {}
    while True:
        oft, tds, fwd, nmrva, ftrva = struct.unpack_from("<IIIII", d, off)
        if nmrva == 0:
            break
        dll = d[r2o(secs, nmrva):].split(b"\0")[0].decode()
        thunk = oft if oft else ftrva
        to = r2o(secs, thunk)
        fts = []
        idx = 0
        while True:
            v = struct.unpack_from("<I", d, to + idx * 4)[0]
            if v == 0:
                break
            if v & 0x80000000:
                fts.append(("ord%d" % (v & 0xFFFF), ftrva + imagebase + idx * 4))
            else:
                ho = r2o(secs, v)
                nm = d[ho+2:].split(b"\0")[0].decode(errors="replace")
                fts.append((nm, ftrva + imagebase + idx * 4))
            idx += 1
        iat_entries[dll] = fts
        print("  %s (%d funcs)" % (dll, len(fts)))
        off += 20

    # 导出/延迟导入
    if dirs["DelayImport"][0]:
        print("\n=== DELAY IMPORTS ===")
        drva = dirs["DelayImport"][0]
        o = r2o(secs, drva)
        for _ in range(40):
            attrs, nmrva, modrva, iatrva, int_rva, bound, unload, ts = struct.unpack_from("<IIIIIIII", d, o)
            if nmrva == 0:
                break
            dll = d[r2o(secs, nmrva):].split(b"\0")[0].decode(errors="replace")
            print("  %s" % dll)
            o += 32

    # HID 相关调用点（x86 间接调用 = FF 15 <IAT 绝对地址>）
    tva, tra, trsz = text_range(secs)
    text = d[tra:tra+trsz]
    def calls_to(iat):
        """找出所有 call [iat] / jmp [iat] 的位置"""
        pat = b"\xFF\x15" + struct.pack("<I", iat)
        pat2 = b"\xFF\x25" + struct.pack("<I", iat)
        hits = []
        for p in (pat, pat2):
            s = 0
            while True:
                j = text.find(p, s)
                if j < 0: break
                hits.append(tva + j)
                s = j + 1
        return sorted(hits)

    print("\n=== HID 调用点（call [IAT]，.text 内）===")
    for dll, fns in iat_entries.items():
        if "HID" not in dll.upper():
            continue
        for nm, iat in fns:
            hits = calls_to(iat)
            print("  %-28s IAT=0x%08X  %d 处  %s" % (nm, iat, len(hits), ["0x%X" % h for h in hits[:10]]))

    print("\n=== SETUPAPI 设备枚举调用点 ===")
    for dll, fns in iat_entries.items():
        if "SETUPAPI" not in dll.upper():
            continue
        for nm, iat in fns:
            hits = calls_to(iat)
            print("  %-36s %d 处  %s" % (nm, len(hits), ["0x%X" % h for h in hits[:8]]))

    print("\n=== ADVAPI32 注册表调用点（读设备信息）===")
    for dll, fns in iat_entries.items():
        if "ADVAPI32" not in dll.upper():
            continue
        for nm, iat in fns:
            if not re.match(r"Reg(Open|Query|Enum|Close|Set)", nm):
                continue
            hits = calls_to(iat)
            if hits:
                print("  %-36s %d 处  %s" % (nm, len(hits), ["0x%X" % h for h in hits[:6]]))

    # 常量：可能的命令字/VID 加载
    print("\n=== 立即数候选（.text 内 mov reg, imm）===")
    import collections
    cnt = collections.Counter()
    for i in range(len(text) - 5):
        if text[i] in (0xB8, 0xB9, 0xBA, 0xBB, 0xBC, 0xBD, 0xBE, 0xBF):
            v = struct.unpack_from("<I", text, i+1)[0]
            if 0x20 <= v <= 0xFF:
                cnt[v] += 1
    print("  8-bit 立即数出现最多的值：", [(hex(k), v) for k, v in cnt.most_common(24)])
