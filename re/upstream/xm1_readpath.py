"""XM1 读取路径分析：找出官方工具读取配置的真实入口。

事故背景：此前把"读取"实现成「发送 1041B 全零 blob」，设备当成写入空配置，
把用户鼠标的 DPI/CPI 清零。根因是没找到真正的读路径就发报文。

本脚本只做静态分析，不发送任何报文。目标：
  1. 找出所有涉及 1041（0x411）字节报告的代码位置
  2. 找出 0x40FB90（疑似"保存/写入"）的全部调用者
  3. 找出 0x40FA30（cmd 0x03）等协议函数的调用者
  4. 检查是否存在「先 GetFeature 读回，再修改，再 SetFeature 写回」的完整回路
  5. 找出 GetFeature 封装函数的全部调用点及其长度参数
"""
import struct, re, os, collections
from xm1_dis import load, r2o, disasm

TARGET = "xm1_main.exe"
d, ib, secs = load(TARGET)
tseg = [s for s in secs if s[0] == ".text"][0]
tva, tra, trsz = tseg[1], tseg[3], tseg[4]
text = d[tra:tra+trsz]


def callers(target):
    out = []
    for i in range(len(text) - 5):
        if text[i] == 0xE8:
            rel = struct.unpack_from("<i", text, i + 1)[0]
            if ib + tva + i + 5 + rel == target:
                out.append(ib + tva + i)
    return out


def func_start(va, span=4000):
    off = r2o(secs, va - ib)
    for back in range(off, max(0, off - span), -1):
        if d[back] == 0x55 and d[back+1] == 0x8B and d[back+2] == 0xEC:
            if all(b in (0xCC, 0xC3, 0x90, 0x00, 0x8B) for b in d[max(0, back-6):back]):
                return ib + tva + (back - tra)
    return None


PROTO = {
    "cmd03_readbyte": 0x40FA30,
    "cmd04_write1":    0x40FAE0,
    "cmd08_writeblob": 0x40FB90,
    "cmd07_writeblk":  0x40FC80,
    "getfeature_wrap": 0x40F8A0,
    "setfeature_wrap": 0x40F7E0,
}

os.makedirs("xm1_read", exist_ok=True)

print("=" * 72)
print("1) 涉及 1041 / 0x411 字节的代码位置")
print("=" * 72)
hits = []
for i in range(len(text) - 5):
    # push 0x411  /  mov reg, 0x411
    if text[i] == 0x68 and struct.unpack_from("<I", text, i+1)[0] == 0x411:
        hits.append((ib + tva + i, "push 0x411"))
    elif text[i] in (0xB8, 0xB9, 0xBA, 0xBB, 0xBE, 0xBF):
        if struct.unpack_from("<I", text, i+1)[0] == 0x411:
            hits.append((ib + tva + i, "mov reg, 0x411"))
for va, kind in hits:
    fs = func_start(va)
    print("  0x%08X  %-16s  所属函数: %s" % (va, kind, ("0x%08X" % fs) if fs else "?"))

print()
print("=" * 72)
print("2) 各协议函数的调用者")
print("=" * 72)
for name, va in PROTO.items():
    cs = callers(va)
    print("\n%s (0x%08X) 被调用 %d 处" % (name, va, len(cs)))
    for c in cs:
        fs = func_start(c)
        tag = "  ← 同文件其他协议函数内部" if fs and fs in PROTO.values() else ""
        print("   0x%08X → func %s%s" % (c, ("0x%08X" % fs) if fs else "?", tag))

print()
print("=" * 72)
print("3) 检查「读回 → 改 → 写回」回路：GetFeature 封装的调用上下文")
print("=" * 72)
for c in callers(PROTO["getfeature_wrap"]):
    fs = func_start(c)
    if not fs:
        continue
    lines = disasm(TARGET, fs - ib, 0x300)
    cut = len(lines)
    for idx, ln in enumerate(lines):
        if re.search(r"\sint3\s*$", ln) and idx > 5:
            cut = idx
            break
    body = "\n".join(lines[:cut])
    # 只看关键指令
    key = [l for l in lines[:cut]
           if re.search(r"push 0x|mov esi, 0x|mov .*0x40[01]|call 0x40f|rep movsd", l)]
    print("\n--- GetFeature 调用点 0x%08X，函数 0x%08X ---" % (c, fs))
    for l in key[:22]:
        print("   " + l.strip())

print()
print("=" * 72)
print("4) 是否有「SetFeature 后紧跟 GetFeature 再比对」的保存流程")
print("=" * 72)
for c in callers(PROTO["cmd08_writeblob"]):
    fs = func_start(c)
    if not fs:
        continue
    lines = disasm(TARGET, fs - ib, 0x500)
    cut = len(lines)
    for idx, ln in enumerate(lines):
        if re.search(r"\sint3\s*$", ln) and idx > 5:
            cut = idx
            break
    body = "\n".join(lines[:cut])
    has_get = "call 0x40f8a0" in body
    has_set = "call 0x40f7e0" in body
    print("  调用点 0x%08X (func 0x%08X): SetFeature=%s GetFeature=%s"
          % (c, fs, has_set, has_get))
    with open("xm1_read/caller_of_%08X.txt" % c, "w", encoding="utf-8") as f:
        f.write("调用点 0x%08X 所属函数 0x%08X\n" % (c, fs) + "=" * 60 + "\n")
        f.write("\n".join(lines[:cut]))
    print("     → 已导出 xm1_read/caller_of_%08X.txt" % c)