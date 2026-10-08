"""XM1 协议命令码扫描：找出所有构造 feature report 缓冲区的立即数写入。

模式（x86）：
  C6 45 xx nn      mov byte ptr [ebp+disp8], imm8     ← 报告缓冲区（局部变量）
  C6 85 xxxx nn    mov byte ptr [ebp+disp32], imm8
  C6 44 24 xx nn   mov byte ptr [esp+disp8], imm8
  C6 84 24 ... nn  mov byte ptr [esp+disp32], imm8
另有 mov dword 形式 C7 45 xx nn nn nn nn。
"""
import struct, collections
from xm1_dis import load, r2o, EXE

d, imagebase, secs = load(EXE)
TEXT = None
for nm, va, vsz, ra, rsz in secs:
    if nm == ".text":
        TEXT = (va, ra, rsz)
        break
tva, tra, trsz = TEXT
text = d[tra:tra+trsz]

# 收集 (rva, offset_in_buf, value) —— 只看 ebp/esp 相对寻址的字节写入
writes = collections.defaultdict(list)

def add(rva_i, disp, val):
    writes[(disp, val)].append(tva + rva_i)

i = 0
while i < len(text) - 3:
    op = text[i]
    if op == 0xC6:
        modrm = text[i+1]
        mod = (modrm >> 6) & 3
        reg = (modrm >> 3) & 7
        rm = modrm & 7
        if reg == 0:  # mov byte ptr [rm], imm8
            if mod == 1 and rm == 5:      # [ebp+disp8]
                add(i, struct.unpack_from("b", text, i+2)[0], text[i+3]); i += 4; continue
            if mod == 2 and rm == 5:      # [ebp+disp32]
                add(i, struct.unpack_from("<i", text, i+2)[0], text[i+6]); i += 7; continue
            if mod == 1 and rm == 4:      # [esp+disp8]
                add(i, 0x1000 + struct.unpack_from("b", text, i+2)[0], text[i+3]); i += 4; continue
            if mod == 2 and rm == 4:      # [esp+disp32]
                add(i, 0x1000 + struct.unpack_from("<i", text, i+2)[0], text[i+6]); i += 7; continue
    elif op == 0xC7:
        modrm = text[i+1]
        mod = (modrm >> 6) & 3
        reg = (modrm >> 3) & 7
        rm = modrm & 7
        if reg == 0 and mod == 1 and rm == 5:   # mov dword [ebp+disp8], imm32
            val = struct.unpack_from("<I", text, i+3)[0]
            if val <= 0xFF: add(i, struct.unpack_from("b", text, i+2)[0], val)
            i += 7; continue
        if reg == 0 and mod == 2 and rm == 5:   # mov dword [ebp+disp32], imm32
            val = struct.unpack_from("<I", text, i+6)[0]
            if val <= 0xFF: add(i, struct.unpack_from("<i", text, i+2)[0], val)
            i += 10; continue
    i += 1

print("=== 报告缓冲区偏移 → 写入值（出现 >=2 次，排除栈噪声）===")
cands = []
for (disp, val), locs in writes.items():
    if len(locs) >= 2 and 0 <= val <= 0xFF:
        cands.append((disp, val, locs))
cands.sort(key=lambda x: x[0])
for disp, val, locs in cands[:70]:
    print("  buf[0x%03X] = 0x%02X   (%d 处: %s)" % (disp if disp < 0x1000 else disp-0x1000, val, len(locs), ", ".join("0x%X" % l for l in locs[:6])))

# 找同一函数内连续多个偏移被写 —— 那就是报告结构
print("\n=== 候选报告结构：同一函数内被写 >=4 个不同偏移 ===")
funcs = collections.defaultdict(set)
for (disp, val), locs in writes.items():
    for l in locs:
        # 粗略归属：以 0x100 为窗口
        funcs[l >> 8].add(disp)
best = sorted(funcs.items(), key=lambda kv: -len(kv[1]))[:12]
for win, s in best:
    if len(s) >= 4:
        offs = sorted(x if x < 0x1000 else x-0x1000 for x in s)
        print("  函数窗口 0x%X: %d 个偏移 %s" % (win << 8, len(s), [hex(o) for o in offs[:24]]))
