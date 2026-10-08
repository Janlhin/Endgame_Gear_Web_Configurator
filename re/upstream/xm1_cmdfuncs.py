"""XM1 命令表重新提取（修正上一轮方法的缺陷）。

上一轮只扫 `mov dword [ebp+d], imm32` 且首字节恰为 0xA1 的模式，得到"仅 3 条命令"——
这个结论不可靠：命令码可能通过寄存器传入，或分多次 `mov byte` 构造。

本脚本的可靠做法：
  1. 找到所有 HidD_SetFeature / HidD_GetFeature 调用点（FF 15 IAT）
  2. 对每个调用点，**回溯其所在函数**（向上找函数序言 push ebp; mov ebp,esp）
  3. 打印该函数完整反汇编，人工判读命令码与缓冲区布局
  4. 额外扫描 `mov byte [ebp+d], imm8` 与 `mov [ecx+eax], ...` 等寄存器间接构造

输出：每个 HID 调用点所在函数的边界与完整反汇编，落到 o_*.txt 供人工核对。
"""
import struct, re, sys, os
from xm1_dis import load, r2o, disasm

TARGET = "xm1_main.exe"

def main():
    d, ib, secs = load(TARGET)
    tva, tra, trsz = [s for s in secs if s[0] == ".text"][0][1:4]
    tva, tra, trsz = [s for s in secs if s[0] == ".text"][0][1], [s for s in secs if s[0]==".text"][0][3], [s for s in secs if s[0]==".text"][0][4]
    text = d[tra:tra+trsz]

    # IAT: 复现 xm1_scan.py 的算法
    e = struct.unpack_from("<I", d, 0x3C)[0]
    coff = e + 4
    opt = coff + 20
    dd = opt + 96
    imp_rva = struct.unpack_from("<I", d, dd + 8)[0]
    def r2o(rva):
        for nm, va, vsz, ra, rsz in secs:
            if va <= rva < va + max(vsz, rsz):
                return ra + (rva - va)
    iat = {}
    off = r2o(imp_rva)
    while True:
        oft, tds, fwd, nmrva, ftrva = struct.unpack_from("<IIIII", d, off)
        if nmrva == 0:
            break
        dll = d[r2o(nmrva):].split(b"\0")[0].decode()
        to = r2o(oft if oft else ftrva)
        i = 0
        while True:
            v = struct.unpack_from("<I", d, to+i*4)[0]
            if v == 0:
                break
            if not (v & 0x80000000):
                nm = d[r2o(v)+2:].split(b"\0")[0].decode(errors="replace")
                if dll.upper() == "HID.DLL":
                    iat[nm] = ftrva + ib + i*4
            i += 1
        off += 20

    # 所有 HID 调用点
    sites = []
    for nm, addr in sorted(iat.items()):
        pat = b"\xFF\x15" + struct.pack("<I", addr)
        s = 0
        while True:
            j = text.find(pat, s)
            if j < 0:
                break
            sites.append((ib + tva + j, nm))
            s = j + 1
    sites.sort()
    print("HID 调用点共 %d 个：" % len(sites))
    for va, nm in sites:
        print("  0x%08X  %s" % (va, nm))

    # 对每个调用点找函数起点（向上搜 push ebp / mov ebp,esp 且 int3 边界）
    def func_start(va):
        rva = va - ib
        off = r2o(rva)
        start = off
        for back in range(off, max(0, off - 3000), -1):
            # int3/cc padding 之后的第一条指令，或标准序言
            if d[back] == 0x55 and d[back+1] == 0x8B and d[back+2] == 0xEC:
                cand = back
                # 确认前面是 padding
                if all(b in (0xCC, 0xC3, 0x90, 0x00) for b in d[max(0,cand-4):cand]):
                    return ib + tva + (cand - tra)
        return None

    os.makedirs("xm1_funcs", exist_ok=True)
    index = []
    for va, nm in sites:
        fs = func_start(va)
        if not fs:
            index.append((va, nm, None, None))
            continue
        length = 0x400
        lines = disasm(TARGET, fs - ib, length)
        # 截到下一个 int3 密集区
        cut = len(lines)
        for idx, ln in enumerate(lines):
            m = re.search(r"\sint3\s*$", ln)
            if m and idx > 3:
                cut = idx
                break
        name = "xm1_funcs/f_%08X_%s.txt" % (fs, nm.replace("HidD_", ""))
        with open(name, "w", encoding="utf-8") as f:
            f.write("函数 0x%08X  (%s @ 0x%08X)\n" % (fs, nm, va))
            f.write("=" * 60 + "\n")
            f.write("\n".join(lines[:cut]))
        index.append((va, nm, fs, name))

    print("\n=== 函数文件 ===")
    for va, nm, fs, name in index:
        if name:
            print("  call@0x%08X %-22s → func 0x%08X  %s" % (va, nm, fs, os.path.basename(name)))
        else:
            print("  call@0x%08X %-22s → 未定位到函数起点" % (va, nm))

if __name__ == "__main__":
    main()
