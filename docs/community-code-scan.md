# 全开源社区代码扫描报告（TODO #10 扩展）

> 2026-10-08 深夜。目标：找出一切可用于本项目的代码/知识，并完成 GPL-3 发布前的
> 第三方许可证合规。GitHub 之外的社区逐一扫过，方法与原始抓取物在 re/upstream/。

## 一、扫描方法与覆盖面

| 平台 | 方法 | 结果 |
|---|---|---|
| GitHub（网页搜索，多关键词） | XM2w / OP1w / endgame gear / OP1 8k | **主战场，25+ 项目**（见下） |
| Codeberg | Gitea API（被反爬墙拦截，HTTP 403） | 无法验证；先前会话报告为 0，暂采信 |
| GitLab.com | API v4 search | 0 命中 |
| Gitee | API v5 search | 0 命中 |
| grep.app（GitHub 代码级搜索） | 429 限流 | 未能完成；协议常量级搜索留待 TODO #9 抓包后补 |
| 官方 org `EndgameGear` | 主页 + 逐仓库 releases | **实际 9 仓库**（此前漏数） |

## 二、官方 org 完整清单（9 个）

`OP1-8k`、`OP1-8k-Purple-Frost-LE`、`OP1-8k-v2`、`OP1w-4k`、`OP1w-4k-v2`、
`XM2-8k`、`XM2w-4k`、`XM2w-4k-v2`、`achievements`（无源码，只发固件/工具二进制）。

**v2 工具谱系补全**：`XM2w-4k-v2` 仓库只有 `Firmware_1.03` 一个 release，内含 v2 配置工具
**v1.01**（用户手里的 v1.02 仍不在 GitHub，应来自官网支持页渠道）。
v1 线（XM2w-4k 仓库）：v1.01 → v1.03 → v1.04。

## 三、社区项目全景（≈25 个，标 ★ = 对本项目直接有用）

| 项目 | 语言 | 许可证 | 价值 |
|---|---|---|---|
| ★ johanneszab/vole | C | MIT | 4k 无线协议文档来源 |
| ★ zexsso/OP1-WebAPP | TS | MIT | **同族真机实测协议文档**（已互证，见 PROTOCOL_NOTES） |
| ★ qsxcv/UnofficialEGGWebConfig | JS | **AGPL-3** | WebHID 归一化经验；8k 系 blob 可整体回写 |
| ★ niansa/UnofficialEGGMouseConfig | ? | 待查 | 同类新发现 |
| ★ swekkiekekkie/op1web | ? | 待查 | 第三个 OP1w 网页项目 |
| daohhuynh/egg-mouse + homebrew | Python | Apache-2.0 | macOS 配置 + 固件刷写参考 |
| daohhuynh/homebrew-egg-mouse | Ruby | 待查 | macOS 分发方式 |
| FrancescoCiannavei/GO-BatteryAPI-EndGameGear-XM2W-v2 | Go | 待查 | **v2 专用**电池 API（0xB4 交叉验证源） |
| racclololz/OP1w-4k-v2-Battery-Tray-Icon | ? | 待查 | OP1w v2 电池托盘 |
| Constructor666/endgame-gear-battery-percentage | ? | 待查 | 电池百分比 |
| shohamc1/OP1wBattery | ? | 待查 | OP1w 电池 |
| itchyfeetleech/OP1we-Control | ? | 待查 | **OP1we（有线）**——补有线协议线索 |
| daviddwk/xm2we-util | C | 待查 | XM2we 有线（**无 LICENSE 的 XM2we-Unleashed 之外的最佳参考**） |
| okms/xm2we-linux | Python | 待查 | XM2we 有线 |
| lvlanson/Endgame-Gear-XM2-8k-v2-Linux-Configurator | ? | 待查 | XM2 8k v2 |
| Creationsss/egctl | Rust | 待查 | OP1 8k v2 |
| qaustria/xm2w | Rust | 待查 | XM2w |
| Mannomatico/xm2ctl | ? | 待查 | XM2w |
| 0e4ef622/op1w4k-bpf | C | 待查 | eBPF 修键位（硬核思路参考） |
| BrettLoewen/Endgame-Gear-Mod | ? | 待查 | 硬件改装方向 |
| stuffz/mouse-battery-monitor | C++ | MIT | 电池协议 |
| Slowanexcite85/mcd2-overlay、prestanawa/05d_op1w、dexrepo/…、fixerpimp-gamer/…、Flamigod5/… | — | — | 搜索噪声，无关 |

> 以上"待查"许可证项：引用其**思想/协议事实**无碍（事实不受版权保护），
> 复制**代码**前必须逐个补查许可证。gen-1（22D4:1503）老设备协议由
> OP1-WebAPP 的 Part I 覆盖（makalu_67_dll 逆向）。

## 四、对我们项目真正可用的代码/知识（按优先级）

1. **零拷贝已采纳**：WebHID 响应归一化、settle 时序、严格过滤器、按键类 0x18 ——
   均已化为原创实现进入 src/（上游仅作事实来源）。
2. **可考虑吸收**（先查许可证）：
   - FrancescoCiannavei/GO-BatteryAPI…（v2 电池 0xB4 解析细节，含充电状态位？）
   - itchyfeetleech/OP1we-Control / daviddwk/xm2we-util / okms/xm2we-linux（TODO #9 有线协议的最快路径——先读它们的常量表再抓包）
   - lvlanson/XM2-8k-v2-Linux-Configurator / egctl（8k 系布局：HANDED@55、BUTTONS@61、
     MAX_FPS/MC_MASTER 等，与 4k 系 diff 出"全家族协议"抽象，为 TODO #11 铺路）
3. **不适用**：eBPF 键位修正（内核态，与 WebHID 路线正交）；OpenRGB/CKB 类（RGB 键盘生态）。

## 五、GPL-3 发布前的合规动作（本次已做）

1. `LICENSE` = GPL-3.0 官方全文（SPDX 来源）。
2. 第三方文件清点：`re/upstream/` 内 op1web_PROTOCOL.md（MIT © zexsso ✓ 保留+标注）、
   eggweb_protocol.js（**AGPL-3** © qsxcv —— GPL-3 仓库可容纳，但该文件保持 AGPL 并注明；
   不进构建产物）、无许可证项目（XM2we-Unleashed）零复制 ✓。
3. 结论：**当前仓库可干净地以 GPL-3.0-or-later 发布**，无污染。

## 六之补 · 2026-10-09 第二轮补扫（许可证清零 + 新发现）

> 方法与完整结论见 **`docs/scan-push-plan.md`**。此处只记三件对本文有修订效力的事。

1. **"待查"许可证全部落地**（脚本 `re/upstream/license_scan.py` + `license_raw.py`）：
   `niansa/UnofficialEGGMouseConfig` = **Unlicense**（公有领域，8k 族最可放心借鉴的实现）；
   `Creationsss/egctl` = Cargo.toml 声明 **AGPL-3.0-or-later**（与本项目 GPL-3 不兼容，只取事实）；
   `0e4ef622/op1w4k-bpf` = GPL-2.0；`daviddwk/xm2we-util` = GPL-3.0；
   `okms/xm2we-linux` / `itchyfeetleech/OP1we-Control` / `qaustria/xm2w` /
   `Mannomatico/xm2ctl` / `FrancescoCiannavei/GO-BatteryAPI…` / `BrettLoewen/Endgame-Gear-Mod` = MIT；
   **lvlanson/XM2-8k-v2-Linux-Configurator、swekkiekekkie/op1web、daohhuynh/homebrew-egg-mouse、
   racclololz/…、Constructor666/…、shohamc1/OP1wBattery 六家无 LICENSE 文件** → 只读参考，一行不抄。
2. **新发现一个上一轮完全漏掉的实现**：`@openmouse/protocol`（npm，
   `OpenMouse-Project/mouse-protocol`，**AGPL-3.0-or-later**）—— 浏览器 WebHID 协议库，
   含 `endgame-gear/{op1,wireless}` 与 `drivers/endgame/{egg-op1-hid,egg-we-hid}`。
   **上一轮只搜 GitHub 关键词所以没捞到；本轮靠 npm 注册表命中。** 只取事实，不取代码。
3. **剔除一处误报**：`swekkiekekkie/op1web` 实为 WebMIDI 生成式工具，与本主题无关。

> 另：本文第三节里 "OP1 8k Purple Frost 与 OP1 8k 同 PID 0x1964" 是**错的**，
> 正确值 **0x1976**（官方 LE 专属工具二进制 + niansa + OpenMouse 三源一致），代码已修。

- USB 协议/命令码/blob 布局是**事实**，不受版权保护，官方可自由实现——GPL 挡不住"重新实现"。
- GPL 保护的是**我们的代码**：官方若分发含我们代码的产品，必须按 GPL-3 开源其衍生部分。
- 我们此前发布的每个版本一经 GPL-3 授权即**永久不可撤回**——任何人可从任意历史版本 fork。
