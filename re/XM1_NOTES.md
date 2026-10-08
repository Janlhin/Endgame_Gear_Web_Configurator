# XM1 协议逆向笔记（TODO #9 · 2020 有线代）

> XM1 = `XM1 Configuration Software` v1.09（2020-07-03），Pro Gamersware GmbH。
> 本文结论**全部来自静态分析真实 app 文件**（非安装器壳），证据可复现。

## 0. 怎么拿到的文件（安装包拆解全过程）

安装包 `XM1 Configuration Software V1.09.exe`（7,478,295 B，SHA256 `82da585d0039c939…`）
是 **InstallShield Basic MSI** 封装，PE 之后有 5.82 MB 的 `ISSetupStream` 私有 overlay。

**逐 zlib/deflate/LZMA/BZ2 流扫描全部失败**（脚本留证 `is_zlib_scan.py`）——InstallShield 用自有压缩。

### 最终解法：`pawstas80/Unpacker` v1.1.1（Apache-2.0）

GitHub 上明确支持 `ISSetupStream` 的开源工具。**不需要安装、不需要运行安装器**：

```
Unpacker.exe --list  "…\XM1 Configuration Software V1.09.exe"
  → Detected: ISSetupStream / Overlay start: 0x0014EA00 / Files: 5
    Setup.exe · ISSetup.dll · 0x0409.ini · XM1 Configuration Software.msi · Setup.ini

Unpacker.exe --recursive --max-depth 3 "…\XM1 Configuration Software V1.09.exe" <out>
  → MSI 再用管理提取展开，得到 39 个真实文件
```

自行实现的 `is_parse.py` 能定位到 overlay 与文件名（`XM1 Configuration Software.msi`，3,754,940 B），
但**压缩段解不开**——自研到此为止，切换到现成工具是对的。

### 真实文件清单（安装后目录 `Endgame Gear\XM1\`）

| 文件 | 大小 | 说明 |
|---|---|---|
| `XM1 Configuration Software.exe` | 1,988,608 | **主程序**，MFC/PE32 x86，2020-07-03 |
| `XM1 Firmware Update Tool\XM1 Firmware Update Tool.exe` | 2,004,480 | 固件刷写（2019-08-18） |
| `XM1 Firmware Update Tool\xm1_fw_v2.29.fub` | 22,568 | 固件 v2.29 |
| `Resources\*.bmp/png` | ~2 MB | 界面位图（9 态按钮图，9 个按钮 × 3-5 态 + 主界面 5 态） |
| `Resources\Config.ini` | 67 | 仅 `AutoStartAP` / `DataPath` |
| `Resources\MSensor_Normal.png` | 39,365 | 传感器示意图 |
| `XM1 Firmware Update Tool\Config.ini` | 44 | `[XM1] Version=2.29 / Name=xm1_fw_v2.29.fub` |
| `README.txt` | 1,582 | 见下 |

**没有厂商 DLL** —— 与 OP1w（`makalu_67_dll`）、XM2we（`OemDrv.exe`）不同，**XM1 的协议代码就在主程序里**。

### ★ 你给的目录本身就是解包好的（第一轮绕了远路）

`E:\IDM\Compressed\XM1 Configuration Software V1.09\` 里**已经躺着一份完整的免安装版**
（`XM1 Configuration Software.exe` + `Resources\` + `XM1 Firmware Update Tool\`），
和 ZIP 里的安装器是同一套内容。第一轮我从安装器二次解包得到完全相同的文件——
**如果下次目标是"拿到程序文件"，先看目标目录里有没有现成的，别急着拆包。**

### `README.txt` 的硬约束（官方明说，逆向时必须遵守）

- 软件 **1.09 只配固件 2.29**，且**只能**与该固件一起用
- 旧固件（如 2.00）只能跑基本功能，可能出问题（不建议用）
- 旧软件（如 1.08）配固件 2.29 也只能跑基本功能
- 1.09 新增功能：**MMB 与侧键映射**、**CPI profiles 开关键**
- 刷固件失败会进 bootloader（两个 LED 同时红闪），需用 Recovery Tool 救砖
- 程序常驻托盘，右键 → "Exit Software" 才能退出（会影响替换文件）

**固件 `xm1_fw_v2.29.fub` 无法静态分析**：16 字节头后全是加密/压缩载荷
（头 4 字节 `28 00 00 58` 像 ARM 向量表基址），扫出 90 条 ASCII 全是噪声，
无任何 VID/PID/协议明文。要挖只能靠动态调试或解密。

## 1. 二进制基本信息

- PE32 x86，ImageBase `0x00400000`，无 CLR 目录（非 .NET）
- 导入：`HID.DLL`（7 个 `HidD_*`）、`SETUPAPI.dll`（4 个设备枚举）、`ADVAPI32`（注册表）、MFC
- **PDB 路径泄露工程名**：
  `H:\jyjEDiskWork\K25A VS2017\K25AB V0.25 - K25B\Release\XM1 RGB Configuration Software.pdb`
  → 内部代号 **K25A / K25B**，与 4k 工具（`OP1w 4k Configuration Tool`）同一套 MFC 模板
- 类名：`UXM1 Configuration Software`（主窗体）、`CCPILedSetDlg`（CPI LED 设置）
- 窗口标题：`ENDGAME GEAR XM1 GAMING MOUSE CONFIG`

## 2. 通讯层（0x40F4A0–0x40F9C4，单一紧凑区）

| RVA | 作用 |
|---|---|
| 0x40F4A4 / 0x40F553 | `HidD_GetHidGuid` |
| 0x40F562 | `SetupDiGetClassDevsW`（`DIGCF_PRESENT=2`，interface=0） |
| 0x40F61A | `HidD_GetAttributes` |
| 0x40F63D / 0x40F64C / 0x40F656 | `HidD_GetPreparsedData` / `HidP_GetCaps` / `HidD_FreePreparsedData` |
| 0x40F7E0 / 0x40F86A | **`HidD_SetFeature`（发送）** |
| 0x40F8D5 / 0x40F91A / 0x40F9C4 | **`HidD_GetFeature`（读取）** |

### ★ 重试逻辑与 4k 工具逐字节一致（强证据：同源代码）

`0x40F7E0` 发送函数的错误处理：

```
HidD_SetFeature 失败 → GetLastError()
  ∈ { 0x15, 0x17, 0x1D, 0x57, 0x65B }  → Sleep(50) 重试
  最多 4 次（cmp eax,4 ; jl 循环）
```

这与我逆向官方 4k 工具（v1.02）时看到的**完全相同**——**厂商在所有型号上复用同一 HID 通讯封装**。

## 3. 命令表（**本节已按第二轮实测重写，第一版结论有错**）

> ⚠️ **自我更正**：我第一轮只扫 `mov dword [buf], imm32` 且首字节恰为 `0xA1` 的模式，
> 得出"仅 3 条命令、无 0xA0 大报告、无 1024B blob"的结论——**那是错的**。
> 漏掉的原因：命令码不一定写在 64 字节小报告的 buf[0]，还可以走 **1041 字节大报告**路径，
> 而大报告头 `0x8A0` 的首字节是 `0xA0` 而非 `0xA1`，被我的过滤条件直接排除。
>
> 第二轮改用可靠方法：**先定位全部 `HidD_*` 调用点 → 回溯所在函数 → 读完整反汇编**，
> 找到 4 个成对的高层协议函数，命令表与 blob 机制才完整浮现。

### 传输层（4 个小函数，0x40F4A0–0x40F980 区）

| RVA | 作用 |
|---|---|
| `0x40F730` | 开设备（`CreateFile` + `HIDD_ATTRIBUTES`） |
| `0x40F7E0` | **发送** `HidD_SetFeature`，含错误码重试 |
| `0x40F8A0` | **读取** `HidD_GetFeature` |
| `0x40F96A` | 查询（未被调用） |

### 高层协议函数（4 个，每个都成对 Send+Recv）

| 函数 RVA | 报告头 dword | 线上字节（buf[0] 起） | 长度 | 作用 |
|---|---|---|---|---|
| `0x40FA30` | `0x3A1` | **`A1 03 00 00`** | 64 B | 读 1 字节（回复取 buf[16]） |
| `0x40FAE0` | `0x4A1` | **`A1 04 00 00`** | 64 B | 写：`buf[4]=0, buf[5]=入参` |
| `0x40FC80` | `0x7A1` | **`A1 07 00 00`** | 64 B | 写整块配置，随后 `Sleep(80)` |
| **`0x40FB90`** | **`0x8A0`** | **`A0 08 00 00`** | **1041 B** | **★ 1024B 配置 blob 读写** |

### ★ `0x40FB90` —— 1024B blob 大报告（关键发现）

```
push 0x400                        ; blob = 1024 字节
lea eax, [ebp-0x858] / push 0 / push eax
call memset                       ; 清零 blob
lea eax, [ebp-0x858] / mov ecx, esi
call 0x40FD60                     ; ← 字段重排函数，见下
push 0x411                        ; 1041 = 16 头部 + 1024 blob + report id
lea ecx, [ebp-0x458] / push 0 / push ecx
call memset                       ; 清零大报告
mov dl, byte ptr [ebp+8]          ; 入参（子命令）
mov dword [ebp-0x458], 0x8A0     ; ★ 报告头 → A0 08 00 00
mov byte  [ebp-0x454], bl        ; buf[4] = 0
mov byte  [ebp-0x453], dl        ; buf[5] = 子命令
mov word  [ebp-0x452], bx        ; buf[6..7] = 0
mov ecx, 0x100                    ; ★ 256 dword
lea esi, [ebp-0x858]             ;   源 = blob
lea edi, [ebp-0x448]             ;   目的 = 报告基址 +16  ★
rep movsd                         ; 拷贝 1024 B
mov esi, 0x411 / mov edi, [ebp-0x458]
call 0x40F7E0                     ; HidD_SetFeature(len=1041)
push 0x50 / call Sleep           ; Sleep(80ms)
cmp esi, ebx / jne → 成功分支
--- 成功后再读一次 64B 状态 ---
push 0x40 / memset / mov byte [buf], 0xA1 / call 0x40F8A0
cmp eax, ebx / sete al / inc al  ; 返回 1(成功) / 2(失败)
```

### `0x40FD60` —— blob 内部字段重排

298 条 `movzx reg, [ecx+N] / mov [eax+M], reg` 逐字段搬运，说明**官方内部 blob 布局
与线上布局不一致**，发送前要重排。已提取 268 组映射（留证 `re/upstream/o_fd60.txt`），
但目标偏移有重复（`mov reg, reg` 等形式未被正则完整捕获），
**完整映射表尚未逐字节核实，暂不作为结论使用**。

## 4. 与 4k 族的对照 —— ★ 实测后结论改写

### 配置通道：逐字节同构

| 项 | XM1（2020）实测 | 4k 无线族 |
|---|---|---|
| 大报告 | **`0xA0`，1041 B** | `0xA0`，1041 B |
| blob 长度 | **1024 B** | 1024 B |
| blob 位置 | 报告**偏移 16** | 偏移 16 |
| 小报告 | `0xA1`，64 B | `0xA1`，64 B |
| 命令码位置 | `buf[1]` | `buf[1]` |
| 写后延时 | `Sleep(80)` | 官方 4k 工具 100–880ms |
| `HidD_SetFeature` 重试 | `{0x15,0x17,0x1D,0x57,0x65B}` ×4 / 50ms | **完全相同** |

**XM1 与 4k 无线族是同一套协议框架**，差异只在：

| 项 | XM1 | 4k 无线族 |
|---|---|---|
| VID | `0x22D4`（2020） | `0x3367` |
| 命令条数 | **4 条**（0x03/0x04/0x07/0x08） | 13 条 |
| 状态字节 | **无**（看 `HidD` 返回码） | `[1]`/`[2]`，有 busy 重试 |
| CPI 档数 | **3 档**（工具 UI 原文） | 4 档 |
| 探测/唤醒 | 无独立唤醒命令 | `0x0F`（无线专属） |
| 配置持久化 | 另有 `.profile` / `pfList.dat` **文件** | blob 直接即配置 |

**实践意义**：现有网页版代码（`src/main.ts` 的 4k 路径）**几乎可以原样支持 XM1**，
需要改的只有：① VID/PID 与型号表 ② 命令码只取 4 条 ③ 去掉状态字节判定
④ CPI 档数改 3 ⑤ 加 blob↔内部布局的重排层。

## 5. VID/PID —— ★ 已从真机确认（2026-10-08）

用户在 Windows 上插入 XM1 后枚举得到，静态逆向拿不到的那块拼图补上了：

| 项 | 实测值 |
|---|---|
| **VID : PID** | **`0x22D4` : `0x1803`** |
| **REV（固件）** | **`0x0229`** = 固件 **2.29** ✓（README 要求软件 1.09 只配 2.29） |
| 设备类 | Composite Device，`usbccgp` / `HidUsb` |
| 复合结构 | MI_00 = 鼠标指针（`mouhid`，SubClass 01 Prot 02）；MI_01 = 厂商配置集合 |

**有趣的巧合**：第一轮我在 UTF-16 键名区找到的 `22D4` / `1803`（当时判定为 INI 键名、
"不是硬编码 VID/PID"）——**正是真实的 VID/PID**。厂商把同一组数字同时当作配置键名使用。

### 接口集合全图（MI_01 下 5 个集合）

| 集合 | Usage Page / Usage | 说明 |
|---|---|---|
| MI_00 Col00 | `0001/0002` | 标准鼠标指针 |
| **MI_01 Col01** | **`FF01/0002`** | **★ 配置通道（与 4k 无线族同接口页）** |
| MI_01 Col02 | `FF01/…` | 厂商定义（`HID_DEVICE_UP:FF01_U:0002` 记在 Col02） |
| MI_01 Col03 | `000C/0001` | 消费者控制（`hidserv.inf`） |
| MI_01 Col04 | `FF02/0001` | 厂商定义 |
| MI_01 Col05 | `FF02/0002` | 厂商定义 ← **与 XM2we 同接口页** |

**关键结论**：XM1 的配置接口是 **`0xFF01` / `0x0002`**，与 4k 族完全相同——
所以网页版的过滤器链只需再加一条 `{vendorId: 0x22D4, usagePage: 0xFF01, usage: 0x02}`。

⚠️ XM1 同时暴露了 `FF02:0001` 与 `FF02:0002` 两个集合（后者与 XM2we 的接口页相同），
**别误选**——从官方 v1.09 的枚举方式（纯 GUID 匹配，不筛 usage page）看，
工具是打开后按 report 描述符/长度区分的。网页版用 `FF01:02` 精确匹配即可避开歧义。

### `22D4` 世代的归属（修正旧结论）

第一轮我写"XM1 的 VID/PID 不硬编码，只能靠真机"，并推测 `22D4` 只是键名——**推测对了一半**：
枚举确实不筛 PID（实测调用点附近无任何 PID 常量），但 `22D4`/`1803` 就是真实的 VID/PID。
`0x22D4` 也是初代 OP1w 4k 的 VID，所以 XM1 属 **22D4 世代**。

## 5b. 三族协议对照（第二轮实测后更新）

| | XM1（2020 有线） | XM2we（2020 有线/2.4G） | 4k 族（4k 无线 + 8k 有线） |
|---|---|---|---|
| VID | `0x22D4`（推测，待真机确认） | `0x3367` | `0x3367` |
| 大报告 | **`0xA0` 1041B**（实测） | 无 | `0xA0` 1041B |
| 配置 blob | **1024 B @ 报告偏移 16**（实测） | 无 | 1024B @16 |
| 小报告 | `0xA1` 64B（实测） | `0x08`/`0x09` 17B | `0xA1` 64B |
| 命令数 | **4 条**（0x03/0x04/0x07/0x08） | 5 opcode | 13 条 |
| 状态字节 | **无** | 无 | **有** |
| CPI 档 | **3 档** | 8 槽 | 4 档 |
| 接口页 | 待确认 | `0xFF02` | `0xFF01` |

**XM1 ↔ 4k 族是同一套协议框架**（大报告 + blob + 偏移 16 + 重试逻辑完全一致），
差异集中在 VID、命令集大小、状态字节有无。

1. XM1（2020）：64B 报告 / 0xA1 / 无状态字节 / 配置存**文件**
2. XM2we（2020）：17B 报告 / 0x08+0x09 / 0x55 校验 / 配置存 **EEPROM**
3. 4k 无线（2021+）：64B+1041B 报告 / 0xA1+0xA0 / 状态字节 / 1024B **blob**

## 6. UI 字符串里的协议线索

| 字符串 | 意义 |
|---|---|
| `Select number of CPI steps, range from 1 to 3` | **XM1 只有 3 个 CPI 档**（4k 是 4 档） |
| `This value determins how often the mouse reports the data over USB.` | 回报率说明 |
| `A7` / `@N`（UTF-16，键名区附近） | 疑似命令字/状态常量 |
| `RegisterDeviceNotification Failed!` | 用 WM_DEVICECHANGE 监听插拔 |
| `Endgame Gear XM1 Gaming Mouse Config` | 窗口标题 |

## 7. 未解项（需真机或动态调试）

- **VID/PID 实际值** —— 静态已确认枚举不筛 PID（第 5 节），**只能从真机设备管理器取**
- **`0x40FD60` blob 重排的完整映射** —— 已提 268 组，但目标偏移有重复（正则漏了
  `mov reg, reg` 等形式）。需改用完整的数据流分析（逐条跟踪 eax/ecx 的定义点）
- **blob 内部字段语义** —— 与 4k 族一样，字段含义需对照 UI 控件与 blob 偏移
- **命令 0x08 的子命令**（`buf[5]` 入参）—— `0x40FB90` 的调用方传的常量待查
- **命令 0x04 / 0x07 的参数语义** —— 是"应用/保存"还是"切档"待定
- **`.profile` / `pfList.dat` 文件格式** —— 最多 5 档，结构待装后分析
- **固件 `xm1_fw_v2.29.fub`** —— 载荷加密，静态无解

## 8. 分析脚本（可复现）

| 脚本 | 作用 |
|---|---|
| `is_parse.py` | ISSetupStream overlay 定位 + 文件名切分（**仅切边界，解不开压缩**） |
| `is_zlib_scan.py` | 逐流尝试 zlib/deflate/LZMA（留证失败） |
| `xm1_scan.py` | PE 节表 + 完整导入表 + `call [IAT]` 调用点扫描 |
| `xm1_dis.py` | 通用 RVA 反汇编器（capstone x86-32） |
| ~~`xm1_cmdtable.py`~~ | 报告头 dword 扫描 → **方法有缺陷，只认首字节 0xA1，漏了 0xA0 大报告** |
| `xm1_cmdscan.py` | 报告缓冲区字节写入扫描（含 UI 噪声，需人工筛） |
| **`xm1_cmdfuncs.py`** | 定位全部 `HidD_*` 调用点并回溯所在函数（第一轮的关键补充） |
| **`xm1_proto.py`** | 反查传输层 4 个函数的全部调用者，导出协议函数反汇编（★ 找到 blob 路径） |
| **`xm1_vidpid.py`** | VID/PID 三路定位（枚举 API 参数、注册表路径、字符串）；结论：**不硬编码** |

### ⚠️ 方法论教训（这轮最重要的一条）

第一轮"命令表仅 3 条"的错误根源：**过滤条件只认首字节 `0xA1`**，
而 XM1 的大报告头是 `0x8A0`（首字节 `0xA0`）——于是整条 blob 路径被静默排除。

**正确做法**（第二轮才用上）：
1. 先用 `FF 15 <IAT>` 找出**所有** `HidD_*` 调用点
2. 对每个调用点**回溯到函数起点**，导出完整反汇编
3. 用传输层函数（`SetFeature`/`GetFeature` 封装）作为锚点，**反查它们的调用者**
4. 人工判读命令码与缓冲区布局

**不要用"立即数取值范围"当过滤器**——它会把非常规路径（不同报告 ID、不同长度）
悄悄滤掉，而且**不报错**。

### ⚠️ x86 调用点扫描的两个坑

- 间接调用是 `FF 15 <IAT 绝对地址>`（x86 无 `call reg` 相对形式）
- **IAT 地址 = RVA + ImageBase**。我两次都栽在这：第一次当 RVA 搜、
  第二次漏了 ImageBase，两次都扫出 **0 命中却不报错**，差点得出"没导入"的错误结论。
