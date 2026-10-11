# Endgame Gear 网页配置器（Web Configurator）

[English](README.md) | **简体中文**

一个在浏览器里直接配置 Endgame Gear 无线游戏鼠标的工具 —— **无需驱动、无需安装**：打开页面 → 点连接 → 改设置。

基于 Chrome/Edge 的 **WebHID** API，通过 HID feature report 与鼠标或接收器的配置通道通信。协议实现来自对官方 Windows 工具的完整社区逆向（见[致谢](#致谢)），并复刻了官方工具的全部时序怪癖。

> **两套协议家族并存**：Endgame Gear 并非单一协议的产品线。4k 无线家族使用 interface `0xFF01` + `0xA0`/`0xA1` 报文 + 1024B 配置 blob；2020 年代的 XM2we/XM1 有线家族使用 interface `0xFF02` + `0x08`/`0x09` 报文 + 17 字节带校验和的帧 + EEPROM 配置。本工具两者都支持，连接时按 PID 自动路由。

## 支持的设备

| 型号 | 协议家族 | 无线（接收器 PID） | 有线（鼠标 PID） | 状态 |
|---|---|---|---|---|
| XM2w 4k | 4k wireless v1 | `0x1970` | `0x1968` / `0x1969` | ✅ 完整支持 |
| OP1w 4k | 4k wireless v1 | `0x1970` | `0x1972` | ✅ 完整支持 |
| XM2w 4k v2 | 4k wireless v2 | `0x1970` | `0x1982` / `0x1981` | ✅ 完整支持 |
| OP1w 4k v2 | 4k wireless v2 | `0x1984` | `0x1984` | ✅ 完整支持 |
| **XM2we / OP1we** | **2020 有线/2.4G** | `0x1961` | `0x1960` / **`0x1962`** | 🧩 代码就绪（29 项离线模拟断言通过），**未真机验证**。OP1we 的 PID `0x1962` 来自官方 WE 工具的 `Cfg.ini` |
| XM2 8k (`0x1966`) / XM2 8k v2 (`0x1980`) | **8k 有线**（与 4k 家族同构） | — | `0x1966` / `0x1980` | ✅ **可读可写** —— blob 偏移与 4k 家族逐字节一致；写入使用 **`0x11` 整块写**（读-改-写），三个来源交叉印证（官方工具二进制 + `egctl` + `qsxcv`），**未真机验证** |
| OP1 8k / Purple Frost (`0x1964`) / OP1 8k v2 / Raw Input (`0x1978`) | **8k 有线** | — | `0x1964` / `0x1978` | ✅ **可读可写** —— 同上 |
| OP1 / OP1 RGB | **第四协议家族**（VID `0x3367`） | — | `0x1903` / `0x1905` / `0x1906` / `0x1910` | 🔍 **仅识别，不通信** —— interface page `0xFFA1`，64B 包 + 54 条 `kCom*` 命令 + 32B 口令；见 `re/FAMILY4_NOTES.md` |
| XM1 / XM1 RGB | 2020 有线（VID `0x22D4` / PID `0x1803`） | — | — | ✅ **可读可写**（CPI 4 槽 / LOD / Ripple；写入仅限实测确认的字段。CPI 为单值 —— 固件只读 X，不支持独立 XY） |
| XM1r | **第四协议家族**（VID `0x3367`） | — | `0x1903` | 🔍 **仅识别，不通信** —— 与 OP1 同平台（共用 PID `0x1903`） |

> ### ⚠️ XM1 支持 —— 可读 + 受限写入（2026-10-09）
>
> **XM1 支持读取，外加一个受限的写入子集**（见本节末尾"写入现已可用"）。
>
> **读取**：只发送一个 64 字节**无载荷**请求（`A1 07` + 全零）触发，然后经 GetFeature 读回 1041 字节（状态字节在 `[1]`，1024B blob 在偏移 16）。已真机验证；读出的 CPI / LOD / Ripple 与官方软件逐项一致。**该消息不携带任何配置数据，不会改动鼠标。**
>
> **事故记录（历史，已修复）**：本工具早期版本把官方**写入路径**误当读取路径，给 XM1 发了一个 1041 字节、1024 字节载荷**全零**的 `0xA0` 大报文。设备将其理解为"写入空配置"，导致**用户的 DPI / CPI 被清零**。根因是厂商内部布局到线上布局之间存在一层未经验证的重排（官方函数 `0x40FD60`，298 次搬移操作）—— 在语义确认前发送任何带载荷的消息都是赌博。
>
> 代码层防护（随着写入验证推进，已从一刀切禁令升级为**精确边界**）：发送层白名单只放行三类消息 —— ① 无载荷读取查询 `{0x03, 0x07}`；② blob 写入（在**实测确认的 23 个偏移**之外，其余 1001 字节必须与刚读回的内容逐字节一致）；③ 单字节写入（值必须等于 `blob[0]`）。越界一律拦截并解除武装。
>
> **回报率注意**：XM1 的回报率是**鼠标底面的 3 档硬件拨动开关**（`250Hz` / `500Hz` / `1000Hz`，旁边有 LED 指示当前档位），经 GPIO 读取，**不写入配置存储** —— 所以实际拨动它，1041B blob **完全不变**，软件无法设置。因此本工具**不提供** XM1 的回报率控制。XM1 不支持 125Hz。（另外固件有一条单字节命令通道 `cmd 0x03` 读 / `cmd 0x04` 写；语义未确认，目前只读。）
>
> **真机样本**：M/N `EGG-XM1-WHT`（XM1 白色），固件 2.29。
>
> **修改 XM1 请使用官方 `XM1 Configuration Software v1.09`**（固件须为 2.29）。完整字段表与差分证据在 `re/XM1_NOTES.md` 第 6.5–6.14 节。
>
> **写入现已可用（2026-10-09 真机验证）**：echo 回写往返成功且读回逐字节一致，证明读与写共用一套布局。XM1 现允许编辑 **CPI 4 槽（独立 X/Y）/ 抬离截断 / Ripple**，但写入被硬性限制在**实测确认的 23 个字节** —— 其余 1001 字节必须与读回值完全一致，由发送层强制执行（回归测试 `re/test_xm1_write.ts` 覆盖）。每次读/写前自动拍照存档，支持一键回滚；写入前有 diff 预览，写入后有读回校验。**回报率仍是底部硬件开关，软件无法更改。**未定位的字段（Angle/Smoothing/灯光/按键映射）不可写。

## 界面随连接的型号自适应（只显示该型号的设置）

**不做"全部显示、剩下的禁用"** —— 禁用的项既是噪音，也是在掩盖"这个型号根本没这功能"这一事实。UI 只由一处决定，即 `src/layout.ts`，设备识别成功后自动重排：

| 连接的设备 | 显示的卡片 | 卡片内隐藏的项 |
|---|---|---|
| **XM1** | 设备信息 · 传感器/CPI · 备份工具 | Glass 模式、角度吸附、抬离 LED、角度微调（**偏移未定位**）；整个"性能/电源"卡片（回报率是**底部硬件开关**）；"按键映射"卡片（按键表未验证）；接收器固件与电池行。CPI 标题为**单值**（固件只读 X） |
| **4k wireless v1**（XM2w 4k / OP1w 4k） | 全部五张卡片 | Glass 模式、角度微调、强制最高 FPS、多击过滤（均为 v2 新增） |
| **4k wireless v2**（XM2w 4k v2 / OP1w 4k v2） | 全部五张卡片 | 抖动过滤（仅 v1 有） |
| **8k 有线家族** | 设备信息 · 传感器/CPI · 性能/电源 · 备份工具 | LOD（家族专属列表，编码未验证）、glass 模式 / 抬离 LED / 角度微调 / 最高 FPS（8k 上能力位或偏移不同）、省电与深度睡眠、按键卡片 |
| **第四家族**（XM1r / OP1 / OP1 RGB） | 仅设备信息 | 其余全部（协议未实现，仅识别型号） |
| **XM2we / OP1we** | 四张专属卡片（信息 / CPI 与回报率 / 键位矩阵 / EEPROM 备份） | 全部 4k 家族卡片 |
| **未连接** | 仅致谢与说明 | 全部设备卡片 |

**设计原则**：**只显示实测确认的字段**。偏移未定位的字段不出现，而不是上线一个改了"什么也不发生"的控件 —— XM1 的独立 XY 正是这样出错的（控件先做出来，真机测试才发现固件只读 X）。

**预览任意型号的 UI**（无需拥有设备）：在 URL 加 hash，例如 `index.html#layout=xm1`、`#layout=v1`、`#layout=v2`、`#layout=8k`、`#layout=ro`、`#layout=we`、`#layout=unsupported`。预览**只改变显示内容，不授予任何读写能力** —— 写入门只关心是否真的连着设备。

加 `&simulate=lost` 可演练**"设备丢失 → 回到初始屏"**路径，例如 `index.html#layout=v2&simulate=lost`（同样不碰设备；供无硬件时的预览与回归测试）。

> **完整产品目录与版本交叉对照**在 **[`docs/official-product-catalog.md`](docs/official-product-catalog.md)**（2026-10-08 编译自官方下载索引与产品页：16 款鼠标的固件/工具版本、官方 CDN 下载地址，以及到官方 GitHub 仓库的映射）。2020 代产品（XM1/XM1r/XM2we/OP1we）**没有官方 GitHub 仓库**。
>
> **8k 有线家族已被证明与 4k 家族同构**：对从官方 CDN 下载的 XM2 8k 工具 v1.12 的静态分析显示，首字节同为报文 ID `0xA1`、同样的 7 个 `HidD_*` API、PDB 记号 `K26_046_config_v1.12_8k_motion_jjitter`。因此支持它们**不需要任何新协议代码** —— 只需把 VID/PID 加进 `MOUSE_PIDS` 表。
>
> 四款 4k 无线型号共用接收器 PID `0x1970`，USB 层无法区分；本工具用 cmd `0x0E` 返回的鼠标自身 PID 判别，并分别处理 v1/v2 不兼容的字段编码（LOD、回报率枚举、标志位）。变体 PID `0x1969`/`0x1981` 来自官方 v1.02 工具二进制里的设备表（见 `re/PROTOCOL_NOTES.md`）。XM2we 家族由 PID `0x1960`/`0x1961` 与 interface page `0xFF02` 双重判据识别。

## 功能

- **传感器**：CPI 4 槽（**独立 XY —— 已真机验证**，10–30000）、槽数、当前槽（v2）、LOD（含 glass 模式编码换算）、角度吸附、角度微调（v2）、ripple 控制、抬离 LED
- **性能**：回报率 4000/2000/1000/125 Hz、Motion Sync、Slamclick 过滤、抖动过滤（v1）、多击过滤 / 强制最高 FPS（v2）
- **电源**：省电超时、深度睡眠（1–120 分钟或关闭）
- **按键**：映射表与点击过滤显示；过滤值可编辑可写入；GX Safe/Speed 模式（左/右键）
- **工具**：配置导出/导入（JSON + 原始 1024B blob）、重新配对、恢复默认配对（0x71）、读取配对数据（0x72）、恢复出厂（双重确认）、hex 级通信日志
- **连接健壮性 —— 设备一消失，界面自行回到初始屏**：两个独立信号 —— ① 浏览器对设备的 `disconnect` 事件（拔出/断电，立即）；② 经 `navigator.hid.getDevices()` 周期枚举（连续两次未命中才宣告消失，容忍权限抖动；若接口已被浏览器关闭，一次未命中即足够）。命中后清除全部残留状态，UI 重置为未连接状态，避免"界面显示已连接但写入注定失败"的错觉。
  **刻意不用"发探测命令"来判存在**：`0x0F` 是无线唤醒命令，定时发送会让鼠标永远无法深度睡眠（白耗电）；而 `0x0E`/`0x07` 在鼠标睡眠时返回不可达，会把"在睡觉"误判成"被拔了"。"无线链路断开"（`inputreport 0xB1`）意味着接收器还在、鼠标只是在睡觉，**不会**触发重置
- **XM2we 家族**：CPI 8 槽（槽 1 立即生效）、回报率（125/250/500/1000 Hz one-hot 掩码）、点击消抖、键位矩阵（0x01 类型解码 + 其余原样展示）、EEPROM 导出（.txt / .json）；每次写入都经读回校验
- **i18n**：8 种语言 —— 简体中文 / 繁體中文 / English / Deutsch / Français / Español / 日本語 / 한국어。**首次打开自动检测浏览器语言**（按顺序匹配 `navigator.languages`；繁体先经 `zh-TW`/`zh-HK`/`zh-Hant` 检出以免被并入简体；兜底为简体中文），之后右上角手动选择优先并存储到 localStorage；日/韩/繁自动切换 CJK 字体栈（`html:lang()`），避免汉字取到简体字形。词条按语言放在 `src/i18n/` 下，键名一致性由 `npm run check:i18n` 校验

## 本地运行 / 部署到 GitHub Pages

源码分两部分；构建脚本把两者打包进单个文件，写到 `dist/index.html` 和仓库根目录的 `index.html` —— 两者都是零依赖单文件，**双击即用，无需服务器**。

| 目录 | 内容 |
|---|---|
| `src/` | TypeScript。严格分层（自底向上）：`state` / `transport` / `protocol` → `blob` / `verify` → `device-4k` / `device-8k` / `device-xm1` → `render` / `presence` → `session` → `connect` → `main`（入口只做组装与事件绑定）；`xm2we.ts` + `xm2we-ui.ts` 是完全独立的第二协议家族；`i18n.ts` + `i18n/*.ts` 存放 8 种语言的词条 |
| `scss/` | **样式的唯一来源**（`_tokens.scss` 设计令牌 / `_mixins.scss` 混入 / `main.scss` 组件） |

**整仓库逐文件地图**（每个文件的作用）在 **[`docs/repo-map.md`](docs/repo-map.md)**。

技术栈：**TypeScript 7**（Go 原生编译器，`tsc --noEmit` 做类型检查）+ **esbuild** 打包 + **sass** 编译 SCSS。类型检查与打包分离 —— `tsc` 只查类型；产物由 esbuild 生成。

**本地**：双击打开 `index.html`（`file://` 属安全上下文，WebHID 可用）。若浏览器策略拦截，任意静态服务器皆可：

```bash
python -m http.server 8080
# 然后访问 http://localhost:8080
```

**从源码构建**（改动 `src/` 或 `scss/` 后运行；产物同步到根目录 `index.html`）：

```bash
npm install
npm run build     # esbuild 打包 TS + sass 编译 SCSS -> dist/index.html + index.html
npm run build -- --minify   # 压缩版
npm run check     # tsc --noEmit 类型检查
```

### 样式开发约定（强制）

- **所有样式写在 `scss/` 下的 SCSS 中**，由 `build.mjs` 经 `sass.compile()` 编译并内联进 HTML。
- `index.template.html` 只保留占位符 `/*__STYLES__*/`（JS 为 `/*__BUNDLE__*/`）。**不要在模板里直接写 `<style>`。**
- 改主题色 / 间距 / 圆角 / 字号 → 只改 `_tokens.scss`；组件样式在 `main.scss` 用嵌套 + `@each` 组织。
- 构建时缺占位符会报错（防止模板与构建漂移）。
- 分发产物仍是**单个 HTML 文件**，零运行时依赖；SCSS 只是开发期的源格式。

**GitHub Pages**：

```bash
git init && git add . && git commit -m "feat: Endgame Gear web configurator"
gh repo create Endgame_Gear_Web_Configurator --public --source=. --push
gh api repos/{owner}/{owner}/pages -X POST -f "source[branch]=main" -f "source[path]=/"   # 或在 Settings → Pages 里选 main
```

然后访问 `https://<你的用户名>.github.io/Endgame_Gear_Web_Configurator/`。GitHub Pages 默认 HTTPS，满足 WebHID 的安全上下文要求。

> **部署要点**（每一项都针对本项目验证过；最初的可行性分析在 git 历史里 —— `docs/ui-port-feasibility.md`，2026-10-11 移除）：
>
> - 产物**不含绝对路径**（也没有 `<base>`），放在项目页子路径 `…/Endgame_Gear_Web_Configurator/` 下不会坏。对比：同类站点 `op1w.vercel.app` 用了 `/assets/…` 绝对路径，同样的构建搬到项目页子路径就会 404。
> - 仓库根目录已有 **`.nojekyll`**：分支发布默认跑 Jekyll，而 Jekyll 排除下划线开头的文件（如 `scss/_tokens.scss`）—— 更糟的是 **Jekyll 构建失败会让整站 404**。本项目只需要托管两个构建好的 HTML 文件。
> - Pages 以 `Cache-Control: max-age=600` 提供静态资源 —— 推送后旧版本可能滞留 10 分钟；验证时请强制刷新。
> - 从仓库根目录发布等于**把整个仓库公开**。已确认没有厂商二进制被提交（`.gitignore` 覆盖 `*.exe` 与真机 blob）；若只想公开产物，可另建一个 `gh-pages` 分支只放 `index.html` 和 `tools/blob-studio.html`。

## 故障排查

| 症状 | 原因与处理 |
|---|---|
| `blob read failed` / `0xA0 not ready (status=0x…)` | 大报文较慢，读到的是过期缓存。v1.1 起 0x12 读取会自动重发重试 4 次；仍失败请打开通信日志，把 hex 发给开发者 |
| 鼠标睡眠后读取失败 | 硬件行为。动一下鼠标再点"重新读取"；软件会自动发 0x0F 探测恢复通道 |
| 有线时接收器固件显示 `—` | 正常；有线连接没有接收器，cmd 0x0D 返回"不适用"（0x07） |
| v1 当前槽无法切换 | v1 硬件不理会软件切换；用鼠标底面的 CPI 按键 |
| 有线回报率显示 1000 Hz | USB 全速帧率上限，硬件天花板；写入的存储值不受影响，回到无线后自动恢复 |
| 自行回到初始屏并提示"设备已断开" | 设备不在（拔出 / 断电 / 接收器被拔）。重置是**刻意的**：断开后残留的过期数据会让写入看起来成功。重新点"连接设备"即可；判据是 `disconnect` 事件加设备枚举，不依赖任何写入 |
| 切到别的标签页再回来显示已断开 | 切到后台会按安全策略**释放 WebHID 接口**（避免长期独占接口）；接口既然被释放，UI 同步重置而不是留着不可用的过期数据。重连即可（每次页面只释放一次） |

## 协议速查（另见 vole 仓库的 re/PROTOCOL.md 与本项目的 re/PROTOCOL_NOTES.md）

- 通道：feature report `0xA1`（64B 命令/响应，载荷从偏移 16 开始）、`0xA0`（1041B，携带 1024B 配置 blob）
- 命令：`0x0F` 探测 · `0x0D`/`0x0E` 固件信息 · `0xB4` 电量 · `0x12` 读 blob · `0x13` 出厂默认 · `0x14` 传感器块 · `0x15` 性能块（声明 10 字节，实发 11）· `0x16` 按键块 ×2 · `0x70` 配对 · `0x71` 默认配对 · `0x72` 配对数据
- 写入即持久化；状态码 `0x01` 成功 / `0x03` 忙（重试）/ `0x07` 该连接不适用 / `0x08`,`0x11` 鼠标睡眠中
- 失败后必须重发 `0x0F` 探测，否则设备保持"卡死"直到下一次探测成功

## 协议家族对比（Endgame Gear 不止一套协议）

| | **XM1**（2020 有线，VID `0x22D4`） | **XM2we**（2020 有线/2.4G） | **4k 家族**（4k 无线 + 8k 有线） |
|---|---|---|---|
| usage page | 待确认 | `0xFF02` | `0xFF01` |
| 报文 ID | `0xA1` 出 / `0xA0` 入 | `0x08` 出 / `0x09` 入 | `0xA1` 出 / `0xA0` 入 |
| 帧结构 | 64 B 命令 / **1041 B 大报文** | 17 B + `(0x55−Σ)&0xFF` 校验和 | 64 B 命令 / 1041 B 读取 |
| 配置 blob | **1024 B @ 报文偏移 16** | 无（走 EEPROM） | 1024 B @ 16 |
| 状态字节 | **无**（见 HidD 返回码） | 无 | `[1]`/`[2]`（v2 有回显变体） |
| 命令数 | **4**（`0x03`/`0x04`/`0x07`/`0x08`） | 5 个 opcode | 13 |
| CPI 槽数 | **3** | 8 槽 | 4 |
| PC 端槽位备份 | `.profile` / `pfList.dat`（最多 5 槽） | — | JSON / 原始 blob |
| 厂商 DLL | 无（协议在主程序里） | `OemDrv.exe` | `hidapi` 静态链接 |
| 内部代号 | K25A / K25B | — | W25（4k 无线）/ **K26**（8k 有线） |

**XM1 与 4k 家族共用同一套协议框架** —— `0xA0` 1041B 大报文、1024B blob @16、下述重试逻辑逐字节一致。差异只在 VID、命令集规模、有无状态字节、CPI 槽数。
**所以支持 XM1 与 8k 有线家族几乎不需要新的协议代码。**

共享的 HID 通信封装：`HidD_SetFeature` 失败时对错误码 `{0x15, 0x17, 0x1D, 0x57, 0x65B}` 以 50 ms 间隔重试 4 次 —— 官方 4k 工具与 XM1 主程序逐字节一致。见 `re/PROTOCOL_NOTES.md` 与 `re/XM1_NOTES.md`。

## 逆向验证

协议实现已与官方 `Endgame Gear XM2w 4k v2 Configuration Tool v1.02` 二进制逐字节核对：命令表 / 目标 / 长度、0x16 双块写、blob 布局（CPI 槽 `0x23+5n`、按键 `0x37+7n`、glass 模式 `0x6F`）、忙重试与发送错误重试策略全部吻合。完整证据链（反汇编脚本 + 中间产物）在 `re/` 下。官方 v1.02 中 LED 标签页与表面校准没有协议实现路径（模板残留 UI），故不实现。

**XM1**：官方安装包是 InstallShield Basic MSI（5.82 MB 的 `ISSetupStream` 专有压缩覆盖层；zlib/deflate/LZMA/BZ2 都打不开），先用 `pawstas80/Unpacker` 抽出真实文件再做静态分析 —— 3 条命令、无状态字节、配置存文件而非 EEPROM。完整证据链在 `re/XM1_NOTES.md`。

## 致谢

- **[johanneszab/vole](https://github.com/johanneszab/vole)** —— 完整的 USB 配置协议逆向文档与 Linux 实现（Ghidra + USBPcap + 真机验证）；4k 家族协议层的唯一依据
- **[okms/xm2we-linux](https://github.com/okms/xm2we-linux)** —— XM2we 2020 有线/2.4G 家族的完整协议文档（PROTOCOL.md，经真机交叉验证）与 Python 实现；XM2we 支持的全部依据
- **[stuffz/mouse-battery-monitor](https://github.com/stuffz/mouse-battery-monitor)** —— 电量状态的 HID 协议文档
- **[gentoocat/XM2we-Unleashed](https://github.com/gentoocat/XM2we-Unleashed)** —— XM2we 直连通信探索（无许可证，仅作情报参考）
- **[qsxcv/UnofficialEGGWebConfig](https://github.com/qsxcv/UnofficialEGGWebConfig)** · **[zexsso/OP1-WebAPP](https://github.com/zexsso/OP1-WebAPP)** —— 可比的 WebHID 网页配置器（8k 系列 / OP1w 4k）；对 XM2w 4k v1/v2 而言它们是目前仅有的（生态概览见 `docs/ecosystem-survey.md`）
- **[daviddwk/xm2we-util](https://github.com/daviddwk/xm2we-util)** —— XM2we 协议的第二个独立实现，用于交叉核对常量
- **[Endgame Gear / Pro Gamersware GmbH](https://www.endgamegear.com/)** —— 硬件本身，以及未混淆、可分析的官方配置工具

## 免责声明

这是一个独立的开源工具，与 Endgame Gear / Pro Gamersware GmbH 无任何隶属关系。它只读写你自己的配置；不改固件、不绕过任何保护机制。使用风险自担；你所做任何配置改动的后果由你自己承担（协议文档已验证写入双向可靠，但请对"恢复出厂"以外的底层操作保持审慎）。

**未真机验证的型号（整个 8k 有线家族、XM2we / OP1we 及若干变体 PID）默认只读**：点击写入会弹出确认对话框，确认后仅**对本次连接**放行，并先自动导出备份。逐型号的理由与残余风险：**[docs/release-safety-audit.md](docs/release-safety-audit.md)**。

## 参与测试

有我们没有的鼠标吗（整个 8k 有线家族、XM2we / OP1we）？你的真机测试是验证这些型号的唯一路径。请先读这两份文档：

- **[docs/remote-beta-guide.md](docs/remote-beta-guide.md)** —— 参与前必读（备份、风险、如何恢复）
- **[docs/test-checklist.md](docs/test-checklist.md)** —— 测哪些项、每项怎么填

在工具里点"导出测试数据包 (.json)"即可一次拿全：型号 / VID / PID / 接口集 / 固件 / 完整 blob（WE 家族为 EEPROM 转储）/ 通信日志，外加报告模板。

## 许可证

本项目以 **GPL-3.0-or-later** 发布（见 `LICENSE`）。你可以自由使用、修改和再分发，任何基于本代码的衍生分发也必须以 GPL-3 开源。

第三方素材：`re/upstream/` 下收录的 `op1web_PROTOCOL.md`（MIT © zexsso）与 `eggweb_protocol.js`（**AGPL-3** © qsxcv）仅作研究存档保留，不参与构建；合规结论见 `MANIFEST.md`，完整的社区扫描在 git 历史里（`docs/community-code-scan.md`，2026-10-11 移除）。协议事实本身不受版权保护，但请尊重各上游项目的许可条款。

## 更新日志

见 **[CHANGELOG.md](CHANGELOG.md)**（自 v1.3 起）。

## 路线图

带依赖与完成状态的任务队列在 **[TASKS.md](TASKS.md)**。

### 支持状态

| 设备 | 状态 |
|---|---|
| **XM2w 4k / 4k v2，OP1w 4k / 4k v2** | ✅ 完整读写（协议与官方 v1.02 工具逐字节核对） |
| **XM1 / XM1 RGB** | ✅ 可读可写（写入硬性限制在实测确认的 23 字节内） |
| **XM2we / OP1we** | 🧩 代码就绪（`src/xm2we.ts`，29 项离线模拟断言通过），**从未连过真机** |
| **XM2 8k / OP1 8k（含 v2）** | 🔍 PID 从官方工具二进制恢复，**只读** —— gen 编码经真机确认后写入才会开放 |

### 已完成

- [x] 官方仓库与产品线侦察（9 个仓库，16 款鼠标全表 → `docs/official-product-catalog.md`）
- [x] 4k 无线家族 v1 / v2 的全部字段（当前主要支持目标）
- [x] XM2we 2020 有线/2.4G 家族（29 项离线模拟断言通过）
- [x] XM1 2020 有线家族：**可读 + 受限写入**（`re/XM1_NOTES.md` 第 6 章）
- [x] 样式层迁移到 SCSS（`scss/`；强制约定见"本地运行"一节）
- [x] 深色主题（`[data-theme]` + CSS 自定义属性，零组件样式改动）
- [x] 离线 blob 分析工具（`tools/blob-studio.html`，含解析与双快照 diff）

### 待办（按优先级）

1. **8k 有线家族真机验证** —— PID 已填入（`0x1966`/`0x1964`/`0x1980`/`0x1978`）；需确认 gen 编码与字段语义后开放写入
2. **XM2we 真机验证** —— input report 桥接时序、回报率写入
3. **按键重映射 UI** —— 4k 家族协议层已实现，缺编辑器
4. **XM1 灯光 / 按键映射 / Angle Snap / Smoothing** —— 差分分析定位后即可做
5. **更多语言** —— 在 `src/i18n/` 下加一个词条文件（仿照 `de.ts` 的 189 个键），导入 `src/i18n.ts` 的 `I18N`，在 `normalizeLang()` 加语言标签映射，再在 `index.template.html` 的语言下拉与 `main.ts` 的 `STAGE_COLORS`/`BTN_NAMES` 各加一条。`npm run check:i18n` 逐站点校验 —— 欢迎 PR
6. **部署到 GitHub Pages + 向厂商索取协议文档**（邮件草稿在 git 历史里 —— `docs/email-to-endgamegear.md`，2026-10-11 移除）

> ✅ 已完成（2026-10-09）：4k 家族写入后读回校验；**独立 XY CPI 经真机确认**

详细任务、依赖与完成状态：**[TASKS.md](TASKS.md)**。
