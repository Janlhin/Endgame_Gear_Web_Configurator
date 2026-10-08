"""XM1 主程序反汇编器（按 RVA + 节表映射，支持任意目标 exe）。"""
import struct, sys
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r"xm1_extracted/XM1 Configuration Software/XM1 Configuration Software/program files/Endgame Gear/XM1/XM1 Configuration Software.exe"


def load(path):
    d = open(path, "rb").read()
    e = struct.unpack_from("<I", d, 0x3C)[0]
    coff = e + 4
    nsec = struct.unpack_from("<H", d, coff + 2)[0]
    optsz = struct.unpack_from("<H", d, coff + 16)[0]
    opt = coff + 20
    magic = struct.unpack_from("<H", d, opt)[0]
    imagebase = struct.unpack_from("<I", d, opt + 28)[0]
    secs = []
    secoff = opt + optsz
    for i in range(nsec):
        o = secoff + i * 40
        nm = d[o:o+8].rstrip(b"\0").decode(errors="replace")
        vsz, va, rsz, ra = struct.unpack_from("<IIII", d, o + 8)
        secs.append((nm, va, vsz, ra, rsz))
    return d, imagebase, secs


def r2o(secs, rva):
    for nm, va, vsz, ra, rsz in secs:
        if va <= rva < va + max(vsz, rsz):
            return ra + (rva - va)
    return None


def disasm(path, rva, length, base=None):
    d, imagebase, secs = load(path)
    off = r2o(secs, rva)
    if off is None:
        raise SystemExit("RVA 0x%X 不在任何节内" % rva)
    code = d[off:off + length]
    md = Cs(CS_ARCH_X86, CS_MODE_32)
    md.detail = False
    out = []
    for ins in md.disasm(code, base if base else imagebase + rva):
        raw = ins.bytes.hex(" ")
        out.append("%08X  %-24s %s %s" % (ins.address, raw, ins.mnemonic, ins.op_str))
    return out


if __name__ == "__main__":
    path = EXE
    args = sys.argv[1:]
    if args and args[0].endswith(".exe"):
        path = args.pop(0)
    rva = int(args[0], 16)
    ln = int(args[1], 16) if len(args) > 1 else 0x200
    base = int(args[2], 16) if len(args) > 2 else None
    for line in disasm(path, rva, ln, base):
        print(line)
