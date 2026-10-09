# 上游来源摘要（#8 / #10 部分成果）

> 2026-10-08 抓取。完整原始页面在本目录（*.html / *.exe，已 gitignore），
> 本文件是沉淀结论。GitHub API 匿名限流，全部走 HTML/raw 通道抓取。

## 官方 org `EndgameGear` — 实际 9 个仓库（后经 GitHub 搜索补全）

`OP1-8k`、`OP1-8k-Purple-Frost-LE`、`OP1-8k-v2`、`OP1w-4k`、`OP1w-4k-v2`、
`XM2-8k`、`XM2w-4k`、`XM2w-4k-v2`、`achievements`（首次 org 主页抓取漏了 2 个，
以 GitHub 站内搜索为准；"无源码，只发固件/工具二进制"）。

### XM2w-4k 仓库 release 谱系（配置工具版本线）

| tag | 配置工具 | 固件更新器 |
|---|---|---|
| Firmware_1.03 | v1.01 | v1.03 |
| Firmware_1.04 | v1.03 | v1.04 |
| Firmware_1.10 | **v1.04** | v1.10 |

- **v1.04 已下载验证**：1,954,816 B，SHA256
  `6e635fb5dc4060a8e8356811cce55fe8f3e69641dbb0479e80da77bda3a7380c`
  （与生态调研报告的 `6e635fb5…380c` 完全一致 ✓）
- 用户手里的 v1.02（`2e210cda…`，1,967,104 B）**不在官方仓库谱系内**——是其它渠道分发
  的 v2 专用构建（内部 PDB 名 "OP1w 4k Configuration Tool"，同一模板按型号编译）。
- **命令表 v1.02 == v1.04 逐项一致**（0x0D/0x0E/0x0F×2/0x12/0x13/0x14/0x15/0x16/0x70/0x71/0x72/0xB4），
  协议无版本演化。
- **关键差异：目标 PID**。v1.04（XM2w-4k 仓库）针对鼠标 PID `0x1968`（v1）；
  v1.02 针对 `0x1982`（v2）。 dongle 均为 `0x1970`。

## 社区项目代码吸收

### qsxcv/UnofficialEGGWebConfig（8k 系 WebHID，protocol.js 已存档）

- **eggNormalizeFeature 启示**：Chrome 的 `receiveFeatureReport` 跨平台返回不一致——
  带 reportId / 剥 reportId / reportId 置零三种形态；归一化到"byte0=ID, byte1=status"。
  本项目 rawReceive 已加固（零占位丢弃）。
- **严格过滤器可用**：`{vendorId, productId, usagePage: 0xFF01, usage: 0x02}`，
  本项目已改为严格优先 + 宽松回退。
- 8k 系 blob 是**可整体回写**的（op 0x11 STORE / 0x12 LOAD / 0x13 RESET）——与 4k 系
  （只能按块 0x14/0x15/0x16 写）是两代协议，勿混淆。

### Creationsss/egctl（**OP1 8k v2**，Rust，USB HID）★★ 交叉验证了 8k 族

仓库：`github.com/Creationsss/egctl`（AGPL-3.0，**代码未入库**，本文件记录关键事实）。
抓取日期 2026-10-09，压缩包 21.8KB。

**用途：独立验证我们对 8k 族的静态推断。** 结论如下（`src/protocol.rs`）：

| 项 | egctl 的取值 | 我们的对应 | 结果 |
|---|---|---|---|
| VID / PID | `0x3367` / **`0x1978`** | 从官方 OP1 8k v2 工具挖出的 `0x1978` | ✅ **完全一致** |
| 报告 / 命令长度 | 1041 / 64 | 同 | ✅ |
| 读报告 ID | `0xA1` | 同 | ✅ |
| LOAD / STORE / RESET | `0x12a1` / `0x11a0` / `0x13a1` | 4k：读 `0x12`；写 `0x14/0x15/0x16` | ⚠️ **读一致，写不同** |
| LOD 偏移 25 | → blob `0x09` | 我们 LOD `0x09` | ✅ |
| angle 26 / ripple 27 / motionSync 28 | → `0x0A/0x0B/0x0C` | 同 | ✅ |
| CPI levels 30 | → `0x0E` | 同 | ✅ |
| CPIs 51、步长 5 | → `0x23 + 5n` | 同 | ✅ |
| **CPI 记录结构** | `[xy_split:1][X:u16 LE][Y:u16 LE]` | **完全相同** | ✅ **含 XY 独立** |
| glass mode 127 | → `0x6F` | 同 | ✅ |
| 回报率 divider | `1/2/4/8` = 8000/4000/2000/1000 Hz | 我们的 `2/4/8` = 4000/2000/1000 | ✅ 8k 只是多一个 8000 档 |
| slamclick / jitter 位 | `0x01` / `0x10` | 同 | ✅ |
| 按键区 | 7 键，起点 77 → blob **`0x3D`** | 我们 8 键，起点 blob **`0x37`** | ⚠️ **不同** |

**三条修正**（原先的"8k 只差 PID"过于乐观）：
1. **写入命令不同** —— 8k 是 `0x11` 整块写出，4k 是 `0x14/0x15/0x16` 分块写。
   读取可复用（都用 `0x12` + `0xA1`），**写入必须另行实现**。
2. **按键区布局不同** —— 8k 是 7 个按键记录、起点比 4k 晚 6 字节。
3. **`gen`（v1/v2）二分模型不适用于 8k** —— 它的 LOD 是 `1/2 mm`（同 gen1），
   却同时有 `glass mode` 与 `force max FPS`（gen2 特征）：混合体，需要单独建模。

### zexsso/OP1-WebAPP（OP1w 4k WebHID，PROTOCOL.md 已存档）★最有价值

`op1web_PROTOCOL.md`（20KB）对 3367:1970 协议的记载与本项目逆向**全面互证**：

- **响应格式**：WebHID 拿到的 0xA0 帧 = `[0xA1 回显][status][…][payload@16]`（WebHID 无
  reportId 字节）；装回 reportId 后即本项目的 blob@17 ✓（真机 dump 独立验证）。
- **单响应缓冲**："Reading 0xA0 right after a command that produced an 0xA1 answer hands
  back that stale answer" —— 每次读取必须重发请求 ✓（本项目 readBlob 每轮重发 0x12）。
- **命令表一致**：0x0D/0x0E(14B info)、0x0F 01/0F 唤醒、0x12、0x13、0x14 0F 1C、0x15 0F 0A、
  0x16 0F 1C（buf[6]=块号）、0x70/0x71 配对（需按住 LMB+RMB+MMB 3 秒！）、0x72（4 dwords）、0xB4。
- **0x14 wire 布局互证**：`wire = blob[7,8,9,10,11,—,14,13, 35..54]` —— 与本项目按
  "builder 基址 = obj+0xA" 修正后的静态推导完全一致；CPI 四档连续占 wire[8..27]=blob[35..54]
  （=vole 布局，官方工具真机验证 "CPI 1600/1600/800/800/1600/3200 逐字节吻合"）。
  0x15 advanced = blob[12,5,6,4, 61,68,75,82,89, 3] —— 与本项目 buildPowerPayload 完全一致
  （本项目多发的第 11 字节 = 玻璃模式，官方 XM2w v1.02 静态确认存在，OP1w 文档未记载）。
- **settle 时间**：写命令有线 500ms / 无线 880ms；恢复出厂 800/1080ms；无线写前需唤醒。
  本项目已采用（原 200ms 偏短）。
- **状态字节**：1 ok / 3 busy / **8 cached** / 0x11 wireless；建议校验 payload 而非强求 1。
- **blob 布局互证**：deepSleep@3、powerSaving@4、polling@5(8/4/2=1000/2000/4000Hz)、
  flags@6(bit0 slamclick, bit4 jitter)、LED抬离@8(反逻辑)、LOD@9、angleSnap@10、ripple@11、
  motionSync@12、active@13、levels@14、CPI 四档@35/40/45/50（[flag][X u16][Y u16]）、
  按键 8×7B@55..104、多击过滤=记录第 7 字节（0xF0 GX Safe/0xF1 GX Speed/否则毫秒，默认 8，上限 25）、
  **blob[15..34] = 4 档 LED 颜色 [R][G][B][enabled][id]**（本项目 NOTES 里的"20B 未名块"谜底！）、
  玻璃模式@111=0x6F、角度调校@112=0x70、maxFps@113=0x71、mcMaster@114=0x72（OP1w 记载，
  XM2w v1.02 的角度调校在 blob[0x01]——**型号间布局差异**，两说并存待 XM2w 真机验证）。
  有效区仅 blob[0..110]，其余恒零。
- **修正本项目一处误判**：VID `0x22D4` = 初代 OP1w 4k（makalu_67_dll 时代，PID 1502/1503），
  非"固件升级器专用"；现役硬件才是 3367。
- 按键类编码补全：class 0x18 = 0x96 浏览器 / 0x94 资源管理器（本项目 describeMap 已加）。

## 遗留

- TODO #8 的"下载全部 release 驱动包"未做（体积大、与协议无关），仅抓了 XM2w-4k 谱系；
  其余仓库的 expanded_assets 页面已存档（rel_*.html）可随时补齐。
- TODO #9（USBPcap 真机抓包）仍需用户配合。
- angleTune 的 blob 位置（0x01 vs 0x70）按型号分叉，待 XM2w v2 真机改值回读定论。

## UI 参考（op1w.vercel.app，2026-10-08 抓取）

用户意向：采用 zexsso/OP1-WebAPP 的 UI 设计。存档：vercel_index.html（SPA 壳）、
vercel_style.css（完整设计令牌）、op1web_theme.ts（主题管理器，自称 no-framework-deps）、
op1web_DeviceView.vue（bento 网格主视图）。

**设计令牌**（深色）：bg #0a0b0e / surface #14161b / surface-2 #1b1e25 / surface-3 #242832 /
text #f2f4f8·#aeb4c0·#727885 / accent 紫 #8b7cff（accent-2 #b6a4ff）/ ok #4ade80 /
warn #fbbf24 / err #f87171（各带 -bg/-border 透明变体）/ 圆角 8·11·16·full /
缓动 cubic-bezier(.22,1,.36,1) / 字体 Inter Variable（回退系统栈）。浅色主题在 [data-theme] 块。

**组件系统**：18 个 Vue 组件（Card/Field/Slider/Switch/SegmentedControl/Badge/Chip/Modal/
ProgressRing/PageHeader/ThemeToggle/EmptyState…）。布局 = page > header(brand+actions) > section > cell。

**移植策略（待确认）**：方案 A = 零依赖架构不变，把设计令牌+组件样式重写为原生 CSS
（MIT 允许直接借鉴实现）；方案 B = 迁移到 Vue3+Tailwind（工具链变重，放弃单文件零依赖卖点）。

## XM1 配置软件 v1.09（2020）分析 —— TODO #9 有线协议

**文件**：`E:/IDM/Compressed/XM1 Configuration Software V1.09\`（exe 7,478,295 B，
SHA256 `82da585d0039c939…`，同内容 ZIP `ca99bad2…`）。

**结论（静态）**：
- InstallShield **Basic MSI** 封装：PE 节表到 0x14EA00，其后 6.1MB overlay 为
  **ISSetupStream** 私有容器（"ISSetupStream" 头 + UTF-16 文件名 + 4 字节哈希 +
  整体私有压缩流）。逐 zlib 流扫描无果（`is_zlib_scan.py` 留证），无明文 CAB/MSI。
  → 要拿真实 app 文件需**实际安装**（README：需管理员、带固件刷写 UPDATE 页）。
- 载荷字符串含 `ISSetup.dll` 与导出名 **`GetCPInfo`** —— 协议大概率在厂商 DLL 内
  （与 OP1w 的 makalu_67_dll 同一套路）。
- README：软件 1.09 需固件 2.29；新增 MMB/侧键映射、CPI 档开关；带固件刷写与
  Recovery Tool 说明。
- GitHub 无 XM1 专用逆向项目。

**同代有线协议已有社区实现（★重大进展，材料齐备）**：
`okms/xm2we-linux`（MIT，单文件 Python，304 行）+ `daviddwk/xm2we-util`（GPL-3，C）双源交叉验证：

| 项 | 值 |
|---|---|
| VID / PID | **0x3367** / **0x1960(有线 XM2we) · 0x1961(接收器)** ← 新 PID |
| 接口 | **usage page 0xFF02 / usage 0x02**（不是 4k 系的 FF01） |
| 报告 | **0x08**(出,17B) / **0x09**(入,17B)（不是 4k 系的 A0/A1） |
| 帧格式 | [0]=report id, [1]=opcode, [2..15]=payload, [16]=校验 = (0x55 − Σbytes[0..15]) & 0xFF |
| opcode | 0x03 链路状态 · 0x04 查询 · **0x07 写 EEPROM / 0x08 读 EEPROM** · 0x0F · 0x01 读型号 |
| ⚠️ 笔误修正 | 本表原写「0x08 写」，**写反了**：`0x07` 才是写、`0x08` 是读。`src/xm2we.ts` 代码一直是对的
（`OP_EE_WRITE = 0x07`），2026-10-09 经 OpenMouse `endgame-gear/wireless.js` 与
itchyfeetleech/OP1we-Control 双向确认后更正文档。 |
| 配置存储 | EEPROM（0x00–0xBF, 0x100–0x17F），值后跟 0x55 补码配对 + CRC 记录 |
| CPI | 8×[x,y,mul,crc] @0x0C–0x2B；CPI = (x+1)×(50 或 100) |
| 按键 | 16×[type,code,param,crc] @0x60–0x9F；左/右/中/后/前 = bit0–4 |
| 回报率 | 0x00 头部 one-hot 掩码：0x08=125 / 0x04=250 / 0x02=500 / 0x01=1000 Hz（=1000//mask） |
| 去抖 | 0xA9 配对值 |

→ **三族协议并存**：①2020 有线/2.4G 代（XM1/XM2we，报告 0x08/0x09 + 0x55 校验 + EEPROM）、
②OP1w 初代（22D4:1503，makalu_67_dll，OP1-WebAPP Part I 已文档化）、③2021+ 4k 无线代
（3367:1970，报告 A0/A1 + 状态字节 + 1024B blob，本项目实现）。做全系支持（TODO #11）
需按族分模块，XM2we 族材料已齐（可先做），XM1 待安装后逆向。


---

## 官方 Electron 工具（2026-10-09，第四协议族 + WE 系的来源）★新

**关键方法**：这些安装包是 **Inno Setup**（7-Zip 打不开，需 `innoextract`）；
但 Inno 支持静默指定目录安装，装到临时目录即可拿到**未打包的应用**：

```powershell
Start-Process -FilePath <tool>.exe -Wait -PassThru -ArgumentList `
  "/VERYSILENT","/SUPPRESSMSGBOXES","/NORESTART","/NOICONS","/DIR=<tmp>"
```

| 工具 | 官方 CDN 路径 | 装出来是什么 |
|---|---|---|
| **XM1r 配置软件 V1.2.2 beta** | `img.endgamegear.com/products/xm1r/downloads/xmr1r-configuration-software-1.2.2_beta.zip` | Electron：`resources/app/main-es2015.js`（**含 source map**） |
| **OP1 / OP1 RGB 配置软件 1.6.400** | `img.endgamegear.com/downloads/Endgame-Gear-Configuration-Software-OP1-and+OP1-RGB-1.6.400.exe` | 同上 |
| **WE 系列配置软件 v1.0** | `img.endgamegear.com/downloads/endgame-gear-we-series-configuration-software-v1.0-setup.exe` | Delphi 程序 + **`Cfg.ini`（设备表）** |

抓到的硬事实（详见 `re/FAMILY4_NOTES.md` 与 `re/PROTOCOL_NOTES.md`）：

- **XM1r / OP1 / OP1 RGB 是独立第四协议族**：VID `0x3367` + usagePage `0xFFA1` / usage `0x00A5`，
  64B 包（`byte1=命令, byte2=包ID, byte3..=载荷`）、54 条 `kCom*` 命令、**32B 口令握手**。
  PID：XM1r `0x1903`；OP1/OP1 RGB `0x1903 / 0x1905 / 0x1906 / 0x1910`。
- **OP1we 的 PID = `0x1962`**（来自 WE 工具 `Cfg.ini`）→ 已加入本项目的 WE 族判定。
- 该族含 `kComFirmwareUpgrade` / `kComWriteFlash` 等**改固件**命令 —— 未完全理解前一律不发。

体积处理：400MB+ 的 Electron 应用目录与安装包**已清理**（按上表 URL 可重新下载），
只保留 `we_series_cfg.ini`、`family4_comtype.txt` 与 `vidpid_hunt.py`（通用 VID/PID 猎取脚本）。


## 官方 CPI 规则（2026-10-09 反汇编实证）

CPI 的分档规则此前依据第三方设备表，2026-10-09 改为**直接还原官方工具的 x86 代码**：
六款工具（MFC，有 `CFixedCPI` / `GetCPInfo` / `Set_dpi_settings` 符号）中，
gen1 与 gen2 的 CPI 处理是**同一处代码、同一偏移**，只有常量与除法魔数不同：

| 工具 | 型号 | 下限 | 上限 | 魔数（÷N） | 对齐 |
|---|---|---|---|---|---|
| XM2w-4k v1.04 / OP1w-4k v1.04 | 0x1968 / 0x1972 | 0x32 | **0x6590** | 0x51EB851F（÷50） | 余数 ≥ 0x19 进位 |
| XM2w-4k-v2 v1.01 / OP1w-4k-v2 v1.00 | 0x1982 / 0x1984 | **0x0A** | **0x7530** | 0xCCCCCCCD（÷10） | 余数 ≥ 5 进位 |
| OP1-8k-v2 v1.00 | 0x1978 | 0x0A | 0x7530 | 同 ÷10 | 同上 |
| OP1-8k PF v1.11 | 0x1976 | 0x32 | — | 同 ÷50 | 同 gen1 |

工具：（capstone）；二进制按  + `fetch.sh` 取回。
完整代码片段与结论见 `re/PROTOCOL_NOTES.md`「官方 CPI 规则」。

**推翻了此前两条第三方说法**：① v2 不存在「>10000 用 50」的分段；
② `0x1976` Purple Frost 的 CPI 属 **gen1** 规则（曾被填成 gen2）。
