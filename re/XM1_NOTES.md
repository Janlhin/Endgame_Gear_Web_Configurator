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
| `Resources\*.bmp/png` | ~2 MB | 界面位图（9 态按钮图） |
| `Resources\Config.ini` | 67 | 仅 `AutoStartAP` / `DataPath` |

**没有厂商 DLL** —— 与 OP1w（`makalu_67_dll`）、XM2we（`OemDrv.exe`）不同，**XM1 的协议代码就在主程序里**。

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

## 3. 命令表（穷举，仅 3 条）

报告缓冲固定 **64 字节**，每次发送前 `memset(buf, 0, 0x40)`，报告头用 dword 写入：

| dword 常量 | 线上字节（buf[0] 起） | 命令码 | 函数 | 行为 |
|---|---|---|---|---|
| `0x0003A1` | `A1 03 00 00` | **0x03** | 0x40FA40 | 读配置（走 `HidD_GetFeature`） |
| `0x0004A1` | `A1 04 00 …` | **0x04** | 0x40FAE0 | 写 1 字节：`buf[3] = 入参` |
| `0x0007A1` | `A1 07 00 00` | **0x07** | 0x40FC80 | **整块配置写入**，随后 `Sleep(80)` |

读取时单独构造：`memset` → `mov byte [buf], 0xA1` → `HidD_GetFeature` → `cmp eax,1` 判成功。

### 命令 0x04 完整反汇编（0x40FAE0）

```
push 0x40 / xor ebx,ebx / lea eax,[ebp-0x44] / push ebx / push eax / call memset
mov cl, byte [ebp+8]            ; 函数入参 = 唯一参数
lea esi,[ebx+0x40] / lea edi,[ebp-0x44]
mov dword [ebp-0x44], 0x4A1     ; buf[0]=A1  buf[1]=04  buf[2..3]=00
mov byte  [ebp-0x40], bl        ; buf[4] = 0
mov byte  [ebp-0x3f], cl        ; buf[5] = 参数   ← 注意实际偏移
mov word  [ebp-0x3e], bx        ; buf[6..7] = 0
call 0x40F7E0                   ; HidD_SetFeature
```

### 命令 0x07（0x40FC80）— 主写入路径

```
mov dword [ebp-0x44], 0x7A1     ; 报告头
mov dword [ebp-0x40], ebx       ; 参数区清零（ebx=0）
call 0x40F7E0                   ; SetFeature
push 0x50 / call Sleep          ; Sleep(80ms)
cmp esi, ebx / jne              ; 判返回值
```

## 4. 与 4k 族的对照 —— 同源但不同代

| 项 | XM1（2020） | 4k 无线族（2021+） |
|---|---|---|
| 报告大小 | **64 B** | 64 B 命令 / 1041 B 读取 |
| 报告 ID | **`0xA1`** | `0xA1` |
| 命令码位置 | **buf[1]** | buf[1] |
| 读取通道 | **`HidD_GetFeature`（回读 feature）** | 读取走 `0xA0` 大报告 |
| 状态字节 | **无**（`cmp eax,1` 直接判返回码） | `[1]`/`[2]` 状态码 + 重试 |
| 读取报告大小 | 64 B | 1041 B |
| 命令数量 | **3 条** | 13 条 |
| 延时 | `Sleep(50)` 重试 / `Sleep(80)` 写后 | 100–880 ms 按族 |

**结论：XM1 是 4k 协议的"简化前辈"**——同样的 64 字节 / `0xA1` 报告 ID / buf[1] 命令码布局，
但没有状态字节、没有大报告、没有 blob，写入即整块下发。

## 5. VID/PID 不硬编码（重要修正）

最初在二进制里找到 `22D4` / `1803` 两个值，一度以为是硬编码 VID/PID。**错**——
它们位于 `ConfigData` / `DataPath` / `StartAP` 这批 **INI 键名区**（UTF-16），
即配置文件项名，`22D4` 与 `22d4` 大小写各出现一次，说明是**运行时从配置读的键**。

配置路径（UTF-16 字符串区 0x172A00–0x173100 完整键名）：

```
UXM1 Configuration Software | ENDGAME GEAR XM1 GAMING MOUSE CONFIG
C\Resources\Config.ini | Default Profile | \Profiles\pfList.dat
\Endgame Gear\XM1 | AutoStartAP | ConfigData | DataPath | 22D4 | 22d4 | 1803
Config Mouse | Exit Software | \Profiles | .profile | \pfList.dat
```

→ **XM1 的配置落在文件**（`.profile` / `pfList.dat` / `Config.ini`），不是 EEPROM，
与 XM2we 族（EEPROM）又不同。**三族差异**：

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

- **VID/PID 实际值**：`Config.ini` 里的 `22D4`/`1803` 具体对应哪个字段需装后读配置
- **命令 0x04 的 1 字节参数含义**：是"应用/保存"还是"档位切换"待定
- **命令 0x07 的参数区布局**：整块配置在 buf[4..63] 的排布未逐字段确认
- **`GetCPInfo` 导入名**：来自 `HID.DLL` 的转发或延迟导入，可能是安装脚本引擎的残留符号
- **`.profile` / `pfList.dat` 文件格式**：配置文件结构待装后分析

## 8. 分析脚本（可复现）

| 脚本 | 作用 |
|---|---|
| `is_parse.py` | ISSetupStream overlay 定位 + 文件名切分（**仅切边界，解不开压缩**） |
| `is_zlib_scan.py` | 逐流尝试 zlib/deflate/LZMA（留证失败） |
| `xm1_scan.py` | PE 节表 + 完整导入表 + `call [IAT]` 调用点扫描 |
| `xm1_dis.py` | 通用 RVA 反汇编器（capstone x86-32） |
| `xm1_cmdtable.py` | 报告头（首字节 `0xA1`）dword 扫描 → 命令表 |
| `xm1_cmdscan.py` | 报告缓冲区字节写入模式扫描（含 UI 噪声，需人工筛） |

> ⚠️ **x86 调用点扫描必须用 `FF 15 <IAT绝对地址>`**，且 **IAT 地址 = RVA + ImageBase**
> （我两次都栽在这：第一次当 RVA 搜，第二次漏了 ImageBase，全扫出 0 命中）。
