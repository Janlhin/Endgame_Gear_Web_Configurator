# Endgame Gear Web Configurator（Endgame Gear 网页版驱动）

浏览器直连配置 Endgame Gear 无线游戏鼠标的网页工具，**零驱动、零安装**：打开网页 → 点连接 → 改配置。

基于 Chrome/Edge 的 **WebHID** API，通过 HID 特征报告直接与鼠标/接收器的配置通道通信。协议实现来自社区对官方 Windows 工具的完整逆向（见[致谢](#致谢)），并复刻了官方工具的全部时序怪癖。

> **两套协议族并存**：Endgame Gear 全系并非一套协议。4k 无线族走 `0xFF01` 接口 + `0xA0/0xA1` 报告 + 1024B 配置 blob；2020 年的 XM2we/XM1 有线族走 `0xFF02` 接口 + `0x08/0x09` 报告 + 17 字节校验帧 + EEPROM 配置。本工具两族都支持，连接时按 PID 自动分流。

## 支持的设备

| 型号 | 协议族 | 无线（dongle PID） | 有线（鼠标 PID） | 状态 |
|---|---|---|---|---|
| XM2w 4k | 4k 无线 v1 | `0x1970` | `0x1968` / `0x1969` | ✅ 完整支持 |
| OP1w 4k | 4k 无线 v1 | `0x1970` | `0x1972` | ✅ 完整支持 |
| XM2w 4k v2 | 4k 无线 v2 | `0x1970` | `0x1982` / `0x1981` | ✅ 完整支持 |
| OP1w 4k v2 | 4k 无线 v2 | `0x1984` | `0x1984` | ✅ 完整支持 |
| **XM2we** | **2020 有线/2.4G** | `0x1961` | `0x1960` | ✅ 完整支持（CPI/回报率/去抖/按键/EEPROM 导出） |
| XM2 8k / OP1 8k（含 v2） | 4k 族同构（有线 8k） | — | 待补 PID | 🧡 协议同构已确认，缺 VID/PID |
| OP1 / OP1 RGB | 4k 族同构（有线） | — | 待补 PID | 🧡 同上 |
| XM1 / XM1 RGB | 2020 有线 | — | — | 🧡 协议已逆向，未做界面 |
| XM1r / OP1we | — | — | — | ❌ 单独立线，未支持 |

> **完整产品清单与版本对照**见 **[`docs/official-product-catalog.md`](docs/official-product-catalog.md)**
> （2026-10-08 抓官网下载总页 + 在售商品页整理：16 款鼠标的固件/工具版本、官方 CDN 下载 URL、
> 官方 GitHub 仓库对应关系）。2020 代产品（XM1/XM1r/XM2we/OP1we）**没有官方 GitHub 仓库**。
>
> **8k 有线族已实证属 4k 族同构**：从官网 CDN 下载 XM2 8k 工具 v1.12 静态鉴定——报告 ID 同为
> `0xA1` 位于首字节、同 7 个 `HidD_*` API、PDB 代号 `K26_046_config_v1.12_8k_motion_jjitter`。
> 所以支持它们**无需新协议代码**，只需把 VID/PID 加进 `MOUSE_PIDS` 表。
>
> 四个 4k 无线型号共用 dongle PID `0x1970`，USB 层面无法区分型号；本工具用 cmd `0x0E` 返回的鼠标自身 PID 做判别，v1/v2 两代不兼容的字段编码（LOD、回报率枚举、标志位）已分别处理。变体 PID `0x1969`/`0x1981` 来自官方 v1.02 工具二进制的设备表（见 `re/PROTOCOL_NOTES.md`）。XM2we 族按 PID `0x1960`/`0x1961` 与接口页 `0xFF02` 双重判定。

## 功能

- **传感器**：CPI 四档（XY 独立，10–30000）、档位数、当前档（v2）、LOD（含玻璃面模式编码换算）、角度捕捉、角度调校（v2）、波纹控制、抬离 LED
- **性能**：回报率 4000/2000/1000/125 Hz、Motion Sync、Slamclick 过滤、抖动过滤（v1）、多击过滤/强制最高 FPS（v2）
- **电源**：省电超时、深度休眠（1–120 分钟或关闭）
- **按键**：映射表与点击过滤展示；过滤值可编辑并写入；GX Safe/Speed 模式（左右键）
- **工具**：配置导出/导入（JSON + 原始 1024B blob）、重新配对、恢复默认配对（0x71）、读取配对数据（0x72）、恢复出厂（双重确认）、hex 级通讯日志
- **XM2we 族**：CPI 八槽（槽 1 即时生效）、回报率（125/250/500/1000 Hz one-hot 掩码）、点击去抖、按键矩阵（type 0x01 解码 + 其余原样展示）、EEPROM 导出（.txt / .json）；每次写入均回读校验
- **i18n**：简体中文 / English，右上角切换，偏好存于 localStorage；`I18N` 字典结构见源码，欢迎提交更多语言

## 本地运行 / 部署到 GitHub Pages

源码分两部分，构建脚本把两者打包成单文件写到 `dist/index.html` 和根目录 `index.html`——
两者都是零依赖单文件，**直接双击即可用，无需服务器**。

| 目录 | 内容 |
|---|---|
| `src/` | TypeScript（`main.ts` 入口、`protocol.ts`、`xm2we.ts`、`xm2we-ui.ts`、`i18n.ts`、`util.ts`） |
| `scss/` | **样式唯一来源**（`_tokens.scss` 设计令牌 / `_mixins.scss` 混入 / `main.scss` 组件） |

**本地**：双击打开 `index.html`（`file://` 是安全上下文，WebHID 可用）。若浏览器策略拦截，任意静态服务器也行：

```bash
python -m http.server 8080
# 访问 http://localhost:8080
```

**从源码构建**（改 `src/` 或 `scss/` 后执行；产物会同步根目录 `index.html`）：

```bash
npm install
npm run build     # esbuild 打包 TS + sass 编译 SCSS -> dist/index.html + index.html
npm run build -- --minify   # 压缩版
npm run check     # tsc --noEmit 类型检查
```

### 样式开发约定（强制）

- **样式一律用 SCSS 写在 `scss/` 下**，由 `build.mjs` 调 `sass.compile()` 编译后内联进 HTML。
- `index.template.html` 里只保留占位符 `/*__STYLES__*/`（以及 `/*__BUNDLE__*/` 供 JS），
  **不要在模板里直接写 `<style>`**。
- 改主题色/间距/圆角/字号 → 只改 `_tokens.scss`；组件样式在 `main.scss` 用嵌套 + `@each` 组织。
- 构建时若缺占位符会直接报错（防止模板与构建脱节）。
- 分发产物仍是**单个 HTML 文件**、零运行时依赖，SCSS 只是开发期的源格式。

**GitHub Pages**：

```bash
git init && git add . && git commit -m "feat: Endgame Gear web configurator"
gh repo create egg-web-configurator --public --source=. --push
gh api repos/{owner}/{owner}/pages -X POST -f "source[branch]=main" -f "source[path]=/"   # 或在仓库 Settings → Pages 里选 main /
```

之后访问 `https://<你的用户名>.github.io/egg-web-configurator/`。GitHub Pages 自动是 HTTPS，满足 WebHID 的安全上下文要求。

## 故障排查

| 现象 | 原因与处理 |
|---|---|
| `blob 读取失败` / `0xA0 not ready (status=0x…)` | 大报告时序慢，读到旧缓存。v1.1 起已自动重发 0x12 重试 4 轮；若仍失败，打开通讯日志把 hex 发给开发者 |
| 鼠标休眠后读取失败 | 硬件行为。动一下鼠标，点「重新读取」；软件会自动发 0x0F 探测恢复通道 |
| 有线时接收器固件显示 `—` | 正常，有线连接没有 dongle，cmd 0x0D 返回"不适用"(0x07) |
| v1 当前档位改不动 | v1 硬件忽略软件切换，用鼠标底部 CPI 键 |
| 有线回报率显示 1000 Hz | USB 全速帧限制，硬件上限；写入的存储值不受影响，回到无线自动恢复 |

## 协议速查（详见 vole 仓库 re/PROTOCOL.md 与本项目 re/PROTOCOL_NOTES.md）

- 通道：feature report `0xA1`(64B 命令/响应，负载始于偏移 16)、`0xA0`(1041B，承载 1024B 配置 blob)
- 命令：`0x0F` 探测 · `0x0D/0x0E` 固件信息 · `0xB4` 电量 · `0x12` 读 blob · `0x13` 出厂 · `0x14` 传感器块 · `0x15` 性能块（声明 10 字节实发 11）· `0x16` 按键块×2 · `0x70` 配对 · `0x71` 默认配对 · `0x72` 配对数据
- 写入即持久化；状态码 `0x01` OK / `0x03` busy 重试 / `0x07` 该连接不适用 / `0x08,0x11` 鼠标休眠
- 失败后必须重发 `0x0F` 探测，否则设备"楔死"直到下一条探测成功

## 三族协议对照（Endgame Gear 并非一套协议）

| | **XM1**（2020 有线） | **XM2we**（2020 有线/2.4G） | **4k 族**（4k 无线 + **8k 有线**） |
|---|---|---|---|
| usage page | — | `0xFF02` | `0xFF01` |
| 报告 ID | `0xA1` | `0x08` 出 / `0x09` 入 | `0xA1` 出 / `0xA0` 入 |
| 帧结构 | 64 B 定长 | 17 B + `(0x55−Σ)&0xFF` 校验 | 64 B 命令 / 1041 B 读取 |
| 状态字节 | **无**（看 HidD 返回码） | 无 | `[1]`/`[2]`（v2 有回显变体） |
| 命令数 | **3 条**（`0x03`/`0x04`/`0x07`） | 5 opcode | 13 条 |
| 配置载体 | **文件**（`.profile`/`pfList.dat`） | **EEPROM** `0x00–0xB4` | **1024 B blob** |
| 厂商 DLL | 无（协议在主 exe） | `OemDrv.exe` | `hidapi` 静态链接 |
| 内部代号 | K25A / K25B | — | W25（4k 无线）/ **K26**（8k 有线） |

三者共用同一套 HID 通讯封装：`HidD_SetFeature` 失败时对错误码
`{0x15, 0x17, 0x1D, 0x57, 0x65B}` 按 50 ms 间隔重试 4 次——在官方 4k 工具与 XM1 主程序里
逐字节一致。详见 `re/PROTOCOL_NOTES.md` 与 `re/XM1_NOTES.md`。

## 逆向验证（v1.2 / v1.3）

协议实现已对照官方 `Endgame Gear XM2w 4k v2 Configuration Tool v1.02` 二进制逐字节核验：
命令表/目标/长度、0x16 双块写入、blob 布局（CPI 档 `0x23+5n`、按键 `0x37+7n`、玻璃模式 `0x6F`）、
busy 重试与发送错误码重试策略全部一致。完整证据链（反汇编脚本 + 中间产物）见 `re/`。
LED 页签与 Surface Calibration 在官方 v1.02 中未发现协议实现路径（模板遗留 UI），故未实现。

**XM1**：官方安装包是 InstallShield Basic MSI（5.82 MB `ISSetupStream` 私有压缩 overlay，
zlib/deflate/LZMA/BZ2 全部解不开），用 `pawstas80/Unpacker` 剥出真实文件后完成静态逆向——
命令表 3 条、无状态字节、配置存文件而非 EEPROM。完整证据链见 `re/XM1_NOTES.md`。

## 致谢

- **[johanneszab/vole](https://github.com/johanneszab/vole)** — 完整的 USB 配置协议逆向文档与 Linux 实现（Ghidra + USBPcap + 真机验证），4k 族协议层的唯一依据
- **[okms/xm2we-linux](https://github.com/okms/xm2we-linux)** — XM2we 2020 有线/2.4G 族的完整协议文档（PROTOCOL.md，真机交叉验证）与 Python 实现，XM2we 支持的全部依据
- **[stuffz/mouse-battery-monitor](https://github.com/stuffz/mouse-battery-monitor)** — 电池状态 HID 协议文档
- **[gentoocat/XM2we-Unleashed](https://github.com/gentoocat/XM2we-Unleashed)** — XM2we 直接通信探索（无许可证，仅作情报参考）
- **[qsxcv/UnofficialEGGWebConfig](https://github.com/qsxcv/UnofficialEGGWebConfig)** · **[zexsso/OP1-WebAPP](https://github.com/zexsso/OP1-WebAPP)** — 同类 WebHID 网页配置器（8k 系 / OP1w 4k）；XM2w 4k v1/v2 的网页配置器目前仅此一家（生态全景见 `docs/ecosystem-survey.md`）
- **[daviddwk/xm2we-util](https://github.com/daviddwk/xm2we-util)** — XM2we 协议的第二个独立实现，用于交叉验证常量
- **[Endgame Gear / Pro Gamersware GmbH](https://www.endgamegear.com/)** — 硬件本身，以及未混淆、可分析的官方配置工具

## 免责声明

本项目为独立开源工具，与 Endgame Gear / Pro Gamersware GmbH 无隶属关系。它只读写用户配置，不修改固件、不绕过任何保护机制。使用风险自负；对设备配置的任何更改请自行承担（协议文档已验证写入双向可行，但请理性使用"恢复出厂"以外的底层操作）。

## 许可证

本项目以 **GPL-3.0-or-later** 发布（见 `LICENSE`）。你可以自由使用、修改、再分发，
任何基于本代码的衍生分发同样必须以 GPL-3 开源。

第三方素材：`re/upstream/` 内收录的 `op1web_PROTOCOL.md`（MIT © zexsso）、
`eggweb_protocol.js`（**AGPL-3** © qsxcv）仅作研究存档、不参与构建；
`docs/community-code-scan.md` 是全社区扫描与合规结论。协议事实本身不受版权保护，
但请尊重各上游项目的许可证条款。

## 路线图

中期战役计划（官方仓库摸底 → 有线协议逆向 → 全系网页驱动 → 收尾）见 **[TODO.md](TODO.md)**（#8–#12）。

**已完成的协议族工作**

- [x] 官方仓库摸底（org 实为 9 个仓库，v1.04 工具已验真下载）
- [x] 4k 无线族 v1/v2 全字段（当前网页版主力支持）
- [x] XM2we 2020 有线/2.4G 族（`src/xm2we.ts`，29 项离线仿真通过）
- [x] XM1 2020 有线族静态逆向（`re/XM1_NOTES.md`，命令表 3 条已实锤）
- [x] 样式层迁移 SCSS（`scss/`，强制约定见「本地运行」章节）

**待办**

- [ ] **XM1 界面实现**：协议已知但未做 UI；且 XM1 的 VID/PID 与命令 0x04/0x07 参数布局
      仍需装后读 `Config.ini` 才能定案（配置存 `.profile`/`pfList.dat` 文件而非 EEPROM）
- [ ] 按键重映射 UI（4k 族协议层已实现，缺编辑器）
- [ ] XM2we 真机验证（input report 桥接时序、回报率写入）
- [ ] inputreport 实时休眠/唤醒提示优化
- [ ] 0x14/0x15 写路径真机回环验证（v2 固件 wire 布局，见 `re/PROTOCOL_NOTES.md`）
- [ ] 深色主题（SCSS 已用 `_tokens.scss` 集中令牌，加一组 `[data-theme="dark"]` 覆盖即可，
      组件样式无需改动——这是当初把样式抽成 SCSS 的主要收益）
- [ ] 更多语言（在 `src/i18n.ts` 的 `I18N` 字典加条目即可，欢迎 PR）
- [ ] 向官方申请协议文档（见 `docs/email-to-endgamegear.md`；XRed 事件论据见 `docs/ecosystem-survey.md`）
