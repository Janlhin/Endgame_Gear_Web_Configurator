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
