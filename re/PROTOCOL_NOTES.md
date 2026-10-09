# 官方 v1.02 配置工具逆向笔记

目标：`Endgame_Gear_XM2w_4k_v2_Configuration_Tool_v1_02_original.exe`
SHA256 `2e210cdabe2f3a4d41286aa8cdd7cbfeb06e59d9d8506ebf0d79b4058adca3f5`（1,967,104 B）

分析方法：纯静态（Python 手写 PE 解析 + capstone 线性反汇编 + 交叉引用扫描），
无 Ghidra/IDA，无真机抓包。分析脚本在本目录（`xref_scan.py`、`cmd_scan.py`、`reportid_scan.py`、
`obj_scan2.py`、`dias.py`），中间产物 `o_*.txt`、`strings_*.txt`。

## 二进制概况

- PE32 x86，MFC 静态界面 + **hidapi 静态链接两份**（主程序 + 内嵌固件升级器，
  导出表暴露 `hid_*` 全套）。feature report 收发**不走 hidapi**，直接调
  `HidD_SetFeature` / `HidD_GetFeature`。
- PDB 路径：`G:\project\W26\Config\W25_096_config_V0.91_\Release\Endgame Gear OP1w 4k Configuration Tool.pdb`
  ——同一模板按型号编译（内部名 OP1w 4k，版本资源 XM2w 4k v2）。
- 版本资源标题：`Endgame Gear XM2w 4k v2 Configuration Tool`（v1.02）。

## 设备表（0x17200 处硬编码）

| 类型字节 | VID/PID 对 |
|---|---|
| 0x11（鼠标直连） | (0x3367, 0x1982)、(0x3367, **0x1981**) |
| 0x22（接收器） | (0x3367, 0x1970)、(0x3367, **0x1969**) |

0x1981 / 0x1969 为 vole 未记录的同族变体 PID，网页版已并入型号表。
固件升级器另有 `VID_22D4 PID_1502/1503` 路径匹配（升级模式专用 VID，与配置通道无关）。

## 命令层（全部实锤：report 0xA1，负载始于偏移 16）

| cmd | 目标 | len 字节 | 发送函数 | 官方发后延时 | 备注 |
|---|---|---|---|---|---|
| 0x0F 探测 | 0x01 / 0x0F | 0 | 0x54F9 / 0x5619 | — | 双目标，与网页版一致 |
| 0x0D 接收器固件 | 0x00 | 0 | 0x53C2 | — | |
| 0x0E 鼠标信息 | 0x00 | 0 | 0x5282 | — | |
| 0xB4 电量 | 0x00 | 0 | 0x5144 | — | |
| 0x12 读 blob | 0x00 | 0 | 0x3D74 | 参数化 | 响应 0xA0 (1041B)，status==1 后 1024B 转储到全局 0x5862A8 |
| 0x13 出厂 | 0x00 | 0 | 0x5739 | — | |
| 0x14 传感器 | 0x0F | **0x1C** | 0x4720 | 0x1F4=500ms | 28B 负载 |
| 0x15 性能/电源 | 0x0F | **0x0A** | 0x4B80 | 0x1F4=500ms | **声明 10 实发 11**（p[10]=玻璃模式），与网页版一致 |
| 0x16 按键 | 0x0F | 0x1C | 0x4860 | 块间 100ms | **2 块 × 28B**，块号 1/2 写在报告偏移 6 |
| 0x70 配对 | 0x00 | 0 | 0x3A34 | 0x12C=300ms | Pair Dongle |
| **0x71 默认配对** | 0x00 | 0 | 0x3AD0 | 0x12C=300ms | Pair Default（网页版 v1.2 新增） |
| **0x72 配对数据** | 0x00 | 0 | 0x3BD0 | 0x15E=350ms | Get Pair Data：响应负载 16B（偏移 16..31）拷给调用方 |

传输层怪癖（0x3740 发送 / 0x3810 接收包装）：
- 发送失败按 Win32 错误码重试，最多 4 次、间隔 50ms：`0x15(ERROR_NOT_READY)`、
  `0x17(ERROR_CRC)`、`0x1D(ERROR_WRITE_FAULT)`、`0x57(ERROR_INVALID_PARAMETER)`、`0x65B`。
- 接收到 `buf[1]==0x03`（busy）时重试最多 3 次，延时按 `size + 200·n` 递增
  （64B 报告 ≈264/328/392ms；1041B 大报告自动拉长）——网页版用固定 200·(n+1)，等效。

## blob（1024B）布局 —— **与 vole/v1 完全一致**（重点结论）

解析函数 0x41E0（blob 全局 0x5862A8 → 对象 0x5866B0）逐字段核对：

| blob 偏移 | 语义 | 网页版 | 一致性 |
|---|---|---|---|
| 0x01 | 角度调校（有符号） | ✅ | 一致 |
| 0x03 / 0x04 | 深度休眠 / 省电超时 | ✅ | 一致 |
| 0x05 / 0x06 | 回报率 / 标志位 | ✅ | 一致 |
| 0x08..0x0E | LED 抬离 / LOD / 角度捕捉 / 波纹 / Motion Sync / 当前档 / 档位数 | ✅ | 一致 |
| 0x23+5n | CPI 档 n：[XY 标志, Xlo, Xhi, Ylo, Yhi] | ✅ | 一致（对象内 6B 记录 = X word + Y word + 下一档标志，佐证同布局） |
| 0x37+7n | 按键 n：[类型, 码, 键, ?, ?, ?, 过滤] | ✅ | 一致（0x15 的 5 个点击过滤 = blob 0x3D/0x44/0x4B/0x52/0x59 = 按键记录 +6，互为印证） |
| 0x6F | 玻璃模式 | ✅ | 一致 |
| 0x0F..0x22 | 20B 未名块（疑配对/LED 相关，解析进对象 0x6E..0x81） | 忽略 | 网页版无需处理 |

## 0x14 负载构成（对象→wire，builder 0x4CE0 全量提取）

```
p[0..27] = obj[02,0A,0B,03,04,07,01,00, 0C,0E,0F,10,11,12, 14,15,16,17, 18,1A,1B,1C,1D, 1E,20,21,22,23]
```

对象字段来源：obj[0x0A]=blob[0x0D]（当前档，0 基；UI 0x10F6B 处按 0..3 四路分派选中滑条组）、
obj[0x0B]=blob[0x0E]（档位数 1..4，驱动 CB_SETCURSEL）、obj[0x0F]=Motion Sync（0x13146 复选框填充实锤）、
obj[0x10]=玻璃模式（0x13190 实锤）、obj[0x11]=角度调校（滑条 TBM_GETPOS 写入）、
obj[0x18+6n]/obj[0x1A+6n]=档 n X/Y（word，滑条直写）、obj[0x1C+6n]=下一档 XY 标志。

⚠️ 遗留疑点：按此映射 wire p[18..27] 的每档 5 字节为 [Xlo, Ylo, Yhi, 标志, 0]，
Xhi（obj[0x19+6n]）未出现在任何发送位置，且 p[0]/p[3]/p[6]/p[13]/p[17]/p[22]/p[27]
对应 obj 槽位在全镜像无写入点（恒 0）。与 vole 的 v1 wire 布局在 p[8..17] 段冲突。
鉴于网页版按 vole wire 在真机（XM2w 4k v2）上读写已被用户实测可用，
**网页版 v1.2 维持 vole wire 不变**，此疑点留待 USBPcap 抓包对照官方工具收发解决。

## UI 选项值（官方滑条编码）

- CPI 滑条：位置 ≤1000 → CPI = 位置×10；>1000 → CPI = (位置−800)×50（0x0D740 处双分支实锤）。
  即官方档位 100..10000 步进 10，10050..30000 步进 50。网页版自由输入 10..30000，超集兼容。
- 回报率枚举、省电/深度休眠 1–120 分钟、多击过滤 0–15：与网页版一致（UI 字符串区证据）。

## 官方 UI 有而网页版没有的功能排查

- **LED 页签**（Scroll/Logo/DPI led + RGB + effect）：字符串在资源段，但全镜像无对应
  命令发送路径（无 0xA0 回写、无 output report、0xA1 命令表已穷举）——判定为模板遗留 UI
  或依赖未知通道，网页版暂不支持。
- **Surface Calibration**：同上，未发现协议路径。
- **左手模式 / 键盘映射对话框（SHIFT/CTRL）**：仅 UI，写 0x16 按键块（网页版协议层已支持，
  编辑器仍是路线图项）。
- **信号强度 / SPDT**：展示字段，来自 0x0E/状态解析，无独立命令。

## 结论

网页版 v1.1 的协议实现经官方 v1.02 二进制逐项对照**全部成立**；本次同步新增
0x71/0x72 两条命令与 0x1981/0x1969 两个 PID。剩余风险仅 0x14 wire p[8..17] 段的
v1/v2 布局之争（见"遗留疑点"），可通过抓包一锤定音。

## 真机证据（用户 XM2w 4k v2，2026-10-08 晚）★重要

用户真机抓到 0xA0 大报告前 32 字节：
```
a0 a1 01 00×17 03 01 04 61 00 01 0a 00 00 01 00 01 …
```
解码结论：**v2 固件的 0xA0 响应在 [1] 回显请求报告 ID 0xA1**（相当于把完整 0xA1 格式
响应内嵌进 0xA0 报告），状态字节在 [2]，blob 从偏移 **17** 开始（17+1024=1041 恰好吻合）。
按 v1 blob 布局解偏移 17 起：深度休眠 3 分 / 省电 1 分 / 2000 Hz / flags 0x61
（slamclick+多击+最高FPS）/ 抬离 LED 亮 / LOD 1.7 mm / Motion Sync 开 / 当前档 1 / 共 1 档
——**全部字段合法 → v2 的 blob 内容布局与 v1 相同，只是 0xA0 外壳多一个回显字节**。

连带修正两个历史误诊：
1. 前会话 "blob 读取失败 0xa1 = 时序未备好" 是错的——那是 v2 回显格式，重试永远无效；
2. v1.1 起网页版在 v2 真机上**从未成功读过配置**（parseBlob 没跑过），此前"vole 布局真机已验证"仅对 v1 成立。

修复：readBlob 双格式兼容（[1]=0x01→v1 blob@16；[1]=0xA1&&[2]=0x01→v2 blob@17），
并加 blob 头部校验（levels 1..4 且 polling ∈ {02,04,08,40,80}）防陈旧缓存误判。
0xA1 命令响应（0x0D/0x0E/0xB4 等）仍为 status@1（真机上型号/固件/电量读取正常）——不对称。

**后续验证**：读取修好后，做一次真机写读回环（改值 → 应用 → 重新读取看是否一致），
即可判定 0x14/0x15 写路径的 vole 格式是否需要按官方 wire 映射调整。

## 上游互证（2026-10-08 深夜，详见 re/upstream/SOURCES.md）

- **官方 v1.04 工具已下载验真**（SHA256 `6e635fb5…380c` 与生态调研一致）；命令表与 v1.02
  逐项一致，唯一差异是目标 PID：v1.04→`0x1968`（XM2w 4k **v1**），v1.02→`0x1982`（v2）。
  证实"同一模板按型号编译"；v2 专用工具不在公开仓库。
- **zexsso/OP1-WebAPP 的 PROTOCOL.md（Part II，真机实测）与本项目全面互证**：
  0xA0 回显格式、单响应缓冲、命令表、0x14 wire=`blob[7,8,9,10,11,—,14,13,35..54]`、
  0x15 advanced=`blob[12,5,6,4,61,68,75,82,89,3]`、CPI@35..54、按键@55..110、settle
  有线 500ms/无线 880ms（出厂 800/1080，无线写前唤醒）——全部与本项目实现吻合或已采纳。
- **悬案告破**：①本项目 NOTES 的"20B 未名块"blob[0x0F..0x22] = 4 档 LED 颜色
  4×[R,G,B,enabled,id]；②"X 高字节缺失"系静态分析漏看 0x14 builder 的 `this=obj+0xA`
  基址，修正后与 vole/OP1-WebAPP 完全一致（CPI 连续 blob[35..54] → wire[8..27]）。
- **修正误判**：VID `0x22D4` = 初代 OP1w 4k（makalu_67_dll，PID 1502/1503），非升级器专用。
- **已采纳的代码修正**：rawReceive 零占位加固；0x14 p[0] 透传 blob[7]；settle 时间
  按有线/无线取 500/880ms；连接过滤器严格优先（FF01:02）；describeMap 补 class 0x18。
- **新型号分叉待验证**：角度调校 blob 位置——XM2w v1.02 = blob[0x01]（解析+滑条双证），
  OP1w 文档 = blob[0x70]；按型号分叉可能，待 XM2w 真机回读定论。maxFps@0x71、
  mcMaster@0x72（OP1w 记载）同理。

## 有线唤醒陷阱（真机回归 + OP1-WebAPP device.ts 互证，2026-10-08 深夜）

**用户真机**：XM2w 4k v2 插线直连 → 网页版报 "N/A on this connection"（状态 7）。
根因：probe() 无条件先发 0x0F 唤醒，而 **0x0F 是无线专属**——zexsso device.ts 真机结论：

> 有线直连时 0x0F 两个变体一律回状态 7；"There is nothing to wake over a cable, and
> sending it anyway is actively harmful"——更糟的是**唤醒后的写入会被 ACK 但静默丢弃**
> （鼠标保持旧设置）。官方固件也只在 0x22（无线）路径唤醒（对应本仓库逆向看到的
> apply-all 双路径：无线分支 0x5480/0x55A0 探测后才应用，有线分支直接写）。

**修复**：probe() 按 `wired`（PID≠0x1970）分流——无线才发 0x0F/0x01→0x0F/0x0F，有线直接 0x0E。
另：dongle+线缆同时连接时，经 dongle 打开的话所有命令会回状态 8（stale），候选日志已加
dongle/鼠标类型标注与提示。0x72 的 16 字节按 OP1-WebAPP 记载为 4 dwords 设备信息（pair data）。

## 版本比对基准（生态调研，docs/ecosystem-survey.md）

- 官方 GitHub org `EndgameGear` 挂 8 个固件仓库（XM2w-4k / XM2w-4k-v2 / OP1w-4k / OP1w-4k-v2 /
  OP1-8k / OP1-8k-v2 / XM2-8k / OP1-8k-Purple-Frost-LE），只发固件 release + 工具 exe，无源码。
  ⚠️ **实为 9 个**（站内搜索补回 org 主页漏抓的 `OP1w-4k` 与 `XM2w-4k-v2`），另有非产品仓库
  `achievements`。**2020 代（XM1/XM1r/XM2we/OP1we）没有官方仓库**。
- 本项目所逆向的 v1.02 original exe 的官方出处即该 org 的 release 通道；`EndgameGear/XM2w-4k`
  已挂 **v1.04** 工具（SHA256 前缀 `6e635fb5`），做哈希比对可验真伪，也可下载 v1.04 复核
  新版是否引入协议变化。
- 2025-06/07 官网分发的 OP1w 4k v2 工具曾被植入 XRed 木马——给官方写信与"第三方可审计工具"
  价值的直接论据。

## 协议族总数修正：三类而非四类（2026-10-08 实证）

完整产品清单见 `docs/official-product-catalog.md`。原先"8k 有线族可能是第四族"的猜测
**已被证伪**——从官网 CDN 下载 `endgame-gear-xm2-8k-configuration-tool.v1.12.exe`
（2,146,304 B，SHA256 `580a47db784a535dc72d051c7f4c2cb8c9907898fd08061d3c0ce54e2b3c7dfe`）
静态鉴定后确认：

- 报告 ID **同样是 `0xA1` 位于首字节**（`mov dword [buf], 0x02A1 / 0x12A1 / 0x13A1`）
- **同样 7 个 `HidD_*` API** + `GetCPInfo`
- PDB：`H:\Project\K26\Config\K26_046_config_v1.12_8k_motion_jjitter\Release\Endgame Gear OP1 8k Configuration Tool.pdb`
  → 内部代号 **K26**（4k 无线工具是 W25/XM1 是 K25），**`8k_motion_jjitter` 说明 jitter
  是继承自 4k 族的功能**，8k 有线属 4k 族延伸

**所以 Endgame Gear 实际只有三类协议**（2026-10-08 修订，见下）：

| 族 | 型号 | 报告 | 状态字节 | 配置载体 | 命令数 |
|---|---|---|---|---|---|
| ①2020 有线/2.4G | XM2we / OP1we | 17B `0x08`+`0x09` + `0x55` 校验 | 无 | EEPROM `0x00–0xB4` | 5 |
| ②4k 族（无线） | XM2w 4k / OP1w 4k 及 v2 | 64B `0xA1` + `0xA0` 大报告 | **有** | 1024B blob | 13 |
| ③4k 族（8k 有线） | XM2 8k / OP1 8k 及 v2 | 同上 | 同上 | 同上 | 待穷举 |
| ②的 2020 变体 | **XM1 / XM1 RGB**（VID `0x22D4`） | 同上（**实测 `0xA0` 1041B + blob@16**） | **无** | 同上（+ PC 侧 `.profile` 档位备份） | **4** |

**★ 2026-10-08 第二次修订（XM1 实测）**：第一轮我判定"XM1 是无大报告、无 blob 的独立族"——
**这是错的**。`re/XM1_NOTES.md` 第 3 节的完整反汇编证明 XM1 走的是
**`0xA0` 1041B 大报告 + 1024B blob @ 偏移 16**，与 4k 族**逐字节同构**，
连 `HidD_SetFeature` 的错误码重试集合都一致。真正的差异只有三处：
命令集小（4 条 vs 13）、无状态字节、CPI 只有 3 档。

**实践意义**：
- 支持 8k 有线族（XM2 8k / OP1 8k / OP1 8k v2 / XM2 8k v2）**不需要写新协议代码**，
  只需补上它们的 VID/PID 进 `MOUSE_PIDS` 表。
- **支持 XM1 也几乎不需要新协议代码**：现有 4k 路径改 VID/PID + 命令码取 4 条 +
  去掉状态字节判定 + CPI 档数改 3 + 加 blob↔内部布局重排层即可。


## ★★ 8k 有线族的写入路径（2026-10-09 补完）

**结论：读与 4k 相同，写完全不同 —— 8k 是 0x11 整块写。**

| | 4k 无线族 | 8k 有线族 |
|---|---|---|
| 读配置 | `0x12` + 1024B blob（报告 0xA0/0xA1） | **完全相同** |
| **写配置** | `0x14` / `0x15` / `0x16` **分块写** | **`0x11` 整块写** |
| 写报文 | 28B 负载 + (cmd, target, len) | `[0xA0][0x11][报告 2..15 原样][偏移 16 起 1024B][尾字节]` |
| blob 偏移 | polling `0x05` / flags `0x06` / LOD `0x09` / angleSnap `0x0A` / ripple `0x0B` / motionSync `0x0C` / active `0x0D` / levels `0x0E` / CPI `0x23+5n` / glass `0x6F` | **与 4k 逐字节相同** |
| 按键区 | `0x37` 起 8×7B | **`0x3D` 起 7×7B**（另有 `HANDED` 6B @`0x37`） |
| V2 专属字段位置 | angleTune `0x01`、maxFps = flags bit6 | **angleTune `0x70`、maxFps `0x71`**（偏移不同！） |

**三个独立来源互相印证**（这是本项目里交叉验证最充分的一处）：

| 来源 | 关键常量 |
|---|---|
| 官方 OP1 8k v2 工具 | `push 0x3367` + `push 0x1978`（PID 立即数） |
| `Creationsss/egctl`（Rust，AGPL） | `OP_STORE_CONFIG = 0x11a0` · `OP_LOAD_CONFIG = 0x12a1` · `CONFIG_SIZE = 1041` · 同一套 OFF_* 偏移 |
| `qsxcv/UnofficialEGGWebConfig`（JS） | `STORE=0x11 / LOAD=0x12`，`CFG=0xA0 / CMD=0xA1`，`writeRaw` 把整块 blob 的 [1] 改成 0x11 后发出 |

**本项目的实现（`protocol.ts` / `main.ts`）**：

- `readBlob8k()`：发 `A1 12`（LOAD，无负载）→ 轮询 `0xA1`/`0xA0` 取 1024B 帧。
  **不要求 64B 状态 ACK**（4k 那套 status 语义在 8k 上不成立，社区实现同样不轮询）。
  保留完整 1041B 帧到 `lastFrame`，写回时透传报告 2..15 与尾字节。
- `buildBlob8k(base, stage)`：**在读回的 1024B 之上打补丁**（RMW），
  未涉及的字节一律保持设备原值 —— 这是 XM1 事故的核心教训。
- `store8k()`：`sendFeatureReport(0xA0, build8kStoreData(lastFrame, newBlob))` → Sleep(300)
  → 轮询 8 次 ACK（`0xA1` 报告 status==1）。
- 只放出**两个来源都确认过编码**的字段：CPI 四档（含 XY 独立）、档位数、当前档、
  角度捕捉、波纹控制、回报率（divider 1/2/4/8 = 8000/4000/2000/1000 Hz）、Motion Sync、
  Slamclick、抖动过滤。
  **不放出**：LOD（family-specific 列表，编码未验证）、玻璃面 / 抬离 LED / 角度调校 /
  最大 FPS（在 8k 上是能力位或偏移与 4k 不同）、省电 / 深度休眠、按键区。
- 回归测试 `re/test_8k_write.ts`（31 项）盯住**核心性质**：
  `buildBlob8k` 的输出与输入的差异必须全部落在声明范围内（越界即失败）。

⚠️ **仍未真机验证**（手上没有 8k 设备）。因此 8k 的界面会显示提示横幅，
写明「交叉印证但未在本机验证」。

## ★ WE 系列：OP1we 的 PID 是 0x1962（2026-10-09）

官方 **WE 系列配置工具 v1.0**（`endgame-gear-we-series-configuration-software-v1.0-setup.exe`）
是 Inno Setup 包，静默装到临时目录后其 `Cfg.ini` 直接给出设备表：

```ini
VID=0x3367
PID=0x1960,0x1962     ; 两个鼠标
PID2=0x1961           ; 接收器
```

→ **`0x1960` = XM2we、`0x1962` = OP1we**（工具内含两套皮肤 `skins/3501`、`skins/3502`），
两者共用同一协议与同一份工具。本项目原先只认 `0x1960`/`0x1961`，
**已补上 `0x1962`** → OP1we 支持到位（`src/xm2we.ts` 的 `isXm2weFamily`）。

## ★ 第四协议族（XM1r / OP1 / OP1 RGB）

VID `0x3367` + **usagePage `0xFFA1` / usage `0x00A5`**，协议与三族都不同。
完整提取见 **[`re/FAMILY4_NOTES.md`](FAMILY4_NOTES.md)**
（包格式、54 条 COMTYPE 命令、32 字节口令 `GEGJGYIKDCGBE9DWDKB27EAA7K9Z5J1P`）。
本工具只识别、不通信。

---

## ★★ 8k 族偏移表（2026-10-09 冻结：四源交叉印证）

**四源**：`niansa/UnofficialEGGMouseConfig`（C++，Unlicense，真机维护）、
`Creationsss/egctl`（Rust，AGPL-3，OP1 8k v2）、
`lvlanson/Endgame-Gear-XM2-8k-v2-Linux-Configurator`（Rust）、
`@openmouse/protocol` v0.9.0（TS/WebHID，AGPL-3，真机）。
**只取协议事实**（命令码/偏移/枚举不受版权保护），实现方式全部自写。

### 报文与命令

| 项 | 值 |
|---|---|
| 配置报告 | `0xA0`，**1041 B**（byte0=ID，byte1=opcode） |
| 命令报告 | `0xA1`，64 B |
| 事件报告 | `0x03`（设备主动上报） |
| OP | `0x02` 读固件 · `0x11` STORE 整块写 · `0x12` LOAD 读 · `0x13` 恢复出厂 |
| 固件版本 | payload[1]/[2] = 绝对 17/18；BCD 读法 `V{major}.{patch}`（如 37 01 → V1.37） |
| 写后等待 | 恢复出厂 150 ms（niansa）；本项目沿用 4k 的 800/1080 ms |

### 偏移（绝对 → 减 16 即本项目 blob 偏移）

| 字段 | 绝对 | blob | 本项目现值 |
|---|---|---|---|
| pollingDivider | 21 | `0x05` | ✅ 一致 |
| filterFlags（slamclick `0x01` / jitter `0x10`） | 22 | `0x06` | ✅ |
| ledLiftOff | 24 | `0x08` | ✅ |
| LOD | 25 | `0x09` | ✅ |
| angleSnapping / rippleControl / motionSync | 26 / 27 / 28 | `0x0A` / `0x0B` / `0x0C` | ✅ |
| reserved | 29 | `0x0D` | 本项目作 active |
| cpiLevels | 30 | `0x0E` | ✅ |
| CPI 首档（4 档 × 5B：`[xySplit][X:u16][Y:u16]`） | 51 | `0x23` | ✅ |
| handedButton | 71 | `0x37` | ✅（本项目标为 HANDED） |
| firstButton（**7 条 × 7 B**，止于 126） | 77 | `0x3D` | ✅ |
| glassMode | 127 | `0x6F` | ✅ |
| angleTuning | 128 | `0x70` | ⚠️ 见冲突 2 |
| forceMaxFps | 129 | `0x71` | ✅ |

### ⚠️ 两处冲突（真机定论前不写这两个字段）

1. **`custom_flags` @126（niansa，uint16）与 `glassMode` @127（egctl / OpenMouse）相邻重叠。**
   niansa 开启 experimental（自定义回报率分频）时会写 126–127 两字节，若 127 真是玻璃模式
   就是顺手改了它。→ **本项目不实现 custom polling divider**。
2. **angleTuning 位置分叉**：OpenMouse 记 128（blob `0x70`）；旧笔记里 XM2w v1.02 静态推导
   在 blob `0x01`。→ 保持不写，等 XM2w 4k v2 真机改值回读定论。

### 状态字节（OpenMouse 真机观察）

`0x01` OK · `0x03` busy · **`0x07` 命令被拒（该型号不支持）** · **`0x08` 鼠标不可达（RF 休眠）**。
四者都是合法帧头；本项目 `src/transport.ts` 已映射这四个值。

### CPI 步进按配置族

| 族 | 范围 | 步进 | 传感器 |
|---|---|---|---|
| v1（0x1964 / 0x1966 / 0x1976） | 50–26000 | 50 | paw3395（PF 为 paw3950） |
| v2（0x1978 / 0x1980 / 0x1984 / 0x1970） | 10–30000 | ≤10000 用 10，>10000 用 50 | paw3950 |

LOD：v1 = `0.7 / 1 / 2 mm`；v2 = `0.7 → 1.7 mm` 共 11 档（本项目 gen2 编码
`round(mm×10) − 7` 与之吻合）；玻璃模式 = `1.0 / 2.0 mm` 两档。

---

## ★★ 官方 CPI 规则（2026-10-09 直接从官方工具二进制还原）

起因：此前 CPI 的分档规则来自第三方实现（@openmouse/protocol 的设备表），
其中两条与**官方工具自己的代码**不符。本节以反汇编为准。
方法：`re/upstream/disasm.py`（capstone）扫 `.text` 找立即数并还原上下文；
六款工具由 `re/upstream/fetch.sh` 按 MANIFEST 的 URL 取回并校验 SHA256。

| 官方工具 | tag / 版本 | 目标型号 | CPI 下限 | CPI 上限 | 对齐算法 |
|---|---|---|---|---|---|
| XM2w-4k | Firmware_1.10 / v1.04 | `0x1968` | `0x32` = 50 | **`0x6590` = 26000** | ÷50 → 余数 ≥ `0x19`(25) 进位 → ×50 |
| OP1w-4k | Firmware_1.10 / v1.04 | `0x1972` | 50 | 26000 | 同上 |
| XM2w-4k-v2 | Firmware_1.03 / v1.01 | `0x1982` | **`0x0A` = 10** | **`0x7530` = 30000** | ÷10 → 余数 ≥ 5 进位 → ×10 |
| OP1w-4k-v2 | Firmware_1.03 / v1.00 | `0x1984` | 10 | 30000 | 同上 |
| OP1-8k-v2 | Firmware_1.04 / v1.00 | `0x1978` | 10 | 30000 | 同上 |
| OP1-8k Purple Frost LE | Firmware_1.25 / v1.11 | `0x1976` | 50 | — | ÷50 → ×50（**gen1 规则**） |

### 关键代码（两代唯一差别就是常量与魔数）

gen1（XM2w-4k，`0x4013DA`）：
```
mov  ecx, [esi+0x300]      ; v
cmp  ecx, 0x32              ; < 50 ?
jae  +
mov  eax, 0x32              ; → 50
jmp  end
cmp  ecx, 0x6590            ; > 26000 ?
jbe  +
mov  eax, 0x6590            ; → 26000
jmp  end
mov  eax, 0x51eb851f        ; 魔数 ≈ 2^37/50
mul  ecx                    ; edx:eax = M·v
shr  edx, 4                 ; q = v/50
imul edx, edx, 0x32         ; 50q
sub  ecx, edx              ; r = v % 50
cmp  ecx, 0x19              ; r ≥ 25 ?
jb   +
inc  eax                    ; q++
imul eax, eax, 0x32         ; 50·round(v/50)
end:
```

gen2（XM2w-4k-v2，**同一处代码、同一偏移**，常量与魔数全换）：
```
cmp  ecx, 0x0A   /  mov eax, 0x0A       ; 下限 10
cmp  ecx, 0x7530 /  mov eax, 0x7530     ; 上限 30000
mov  eax, 0xcccccccd                     ; 魔数 ≈ 2^35/10
mul  ecx / shr edx, 3                    ; q = v/10
lea  edx,[edx+edx*4] / add edx,edx       ; 10q
sub  ecx, edx                            ; r = v % 10
cmp  ecx, 5 / jb + / inc eax             ; r ≥ 5 进位
lea  eax,[eax+eax*4] / add eax,eax       ; 10·round(v/10)
```

### 三条结论（已落进 `src/blob.ts` 的 `cpiClamp`）

1. **gen=2 全程对齐 10，不存在「>10000 改用 50」的分段。**
   此前按第三方设备表实现过分段，官方代码里没有任何对应分支。
2. **gen=1 的上限是 26000，不是 30000。** 物理上也对得上（PAW33xx 传感器上限）。
3. **`0x1976` Purple Frost 属 gen1 规则。** 此前按第三方设备表填成 gen2，
   官方 PF 工具的 CPI 代码是 ÷50 那一套。注意它是**混合体**：CPI 走 gen1，
   但第三方设备表称它另有玻璃模式（LOD 两档）—— 本项目按 v1 处理，未验证；
   因其写入被闸门禁用，这个不确定只影响只读界面上的显示项。

XM1（2020 代）官方工具是 InstallShield 包，需解包才能取到真程序（未做）；
它的 50 步进是 2026-10-08 **真机实测**确认的（官方软件拒绝 1234、接受 1150）。
