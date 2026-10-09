# Endgame Gear Web Configurator（Endgame Gear 网页版配置器）

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
| **XM2we / OP1we** | **2020 有线/2.4G** | `0x1961` | `0x1960` / **`0x1962`** | 🧩 代码就绪（离线仿真 29 项通过），**未真机验证**。OP1we 的 PID `0x1962` 取自官方 WE 工具 `Cfg.ini` |
| XM2 8k（`0x1966`）/ XM2 8k v2（`0x1980`） | **8k 有线**（4k 族同构） | — | `0x1966` / `0x1980` | ✅ **读写** —— blob 偏移与 4k 逐字节相同；写走 **`0x11` 整块写**（读-改-写），由官方工具二进制 + `egctl` + `qsxcv` 三来源交叉印证，**未真机验证** |
| OP1 8k / Purple Frost（`0x1964`）/ OP1 8k v2 / Raw Input（`0x1978`） | **8k 有线** | — | `0x1964` / `0x1978` | ✅ **读写** —— 同上 |
| OP1 / OP1 RGB | **第四协议族**（VID `0x3367`） | — | `0x1903` / `0x1905` / `0x1906` / `0x1910` | 🔍 **只识别不通信** —— 接口页 `0xFFA1`，64B 包 + 54 条 `kCom*` 命令 + 32B 口令，协议见 `re/FAMILY4_NOTES.md` |
| XM1 / XM1 RGB | 2020 有线（VID `0x22D4` / PID `0x1803`） | — | — | ✅ **读写可用**（CPI 四档 / LOD / Ripple；写入仅限已实测确认的字段。CPI 为单值 —— 固件只读 X，不支持 XY 独立） |
| XM1r | **第四协议族**（VID `0x3367`） | — | `0x1903` | 🔍 **只识别不通信** —— 与 OP1 同平台（共用 PID `0x1903`） |

> ### ⚠️ XM1 支持说明 —— 读取 + 受限写入（2026-10-09）
>
> **XM1 支持读取，以及一个受限的写入子集**（详见本节末尾「写入已可用」）。
>
> **读取**：只发 64 字节**无负载**请求（`A1 07` + 全零）触发，再用 GetFeature 读回
> 1041 字节（状态字节在 `[1]`，1024B blob 在偏移 16）。已在真机验证，读出的
> CPI / LOD / Ripple 与官方软件显示逐项一致。**报文不含任何配置数据，不会改动鼠标。**
>
> **事故记录（历史，现已修复）**：网页版早期版本错把官方的**写路径**当成读路径，
> 向 XM1 发送了一个 1041 字节的 `0xA0` 大报告，其 1024 字节负载是**全零**，
> 设备把这当成了「写入一份空配置」，导致用户的 **DPI / CPI 被清零**。
> 根因是厂商在内部布局与线上布局之间有一层尚未核实的重排
> （官方函数 `0x40FD60`，298 条搬运）——语义确认前发送任何带负载报文都是赌博。
>
> 代码层的防护（已随写入验证升级为**精确边界**而非全禁）：
> 发送层白名单只放行三类报文 —— ① 无负载读查询 `{0x03, 0x07}`；
> ② 写 blob（除 **23 个已实测确认的偏移**外，其余 1001 字节必须与刚读回的值逐字节相同）；
> ③ 写单字节（值必须等于 `blob[0]`）。任何越界一律拦截并解除武装。
>
> **回报率请注意**：XM1 的回报率是**鼠标底部的 3 档硬件拨动开关**
> （`250Hz` / `500Hz` / `1000Hz`，开关旁有 LED 指示当前档位），
> 由 GPIO 读取，**不写入配置存储** —— 所以实测拨档后 1041B blob **一个字节都不变**，
> 软件也无法设置它。本工具因此**不提供** XM1 回报率控件。
> XM1 不支持 125Hz。（另：固件另有一条单字节命令通道 `cmd 0x03` 读 / `cmd 0x04` 写，
> 语义未确认，目前只读不写。）
>
> **真机型号**：M/N `EGG-XM1-WHT`（XM1 White），固件 2.29。
>
> **要改 XM1 请用官方 `XM1 Configuration Software v1.09`**（固件需为 2.29）。
> 完整字段表与差分证据见 `re/XM1_NOTES.md` 第 6.5–6.14 节。
>
> **写入已可用（2026-10-09 真机验证）**：回声写回往返成功、回读逐字节一致，
> 证明读与写是同一套布局。现在 XM1 可编辑 **CPI 四档（X/Y 独立）/ Lift Cut-Off / Ripple**，
> 但写入被硬限制在 **23 个已实测确认的字节**内 —— 其余 1001 字节必须与读回值逐字节相同，
> 发送层强制校验（回归测试 `re/test_xm1_write.ts` 覆盖）。
> 每次读取/写入前后自动存快照，可一键回退；应用前有差异预览，写入后自动回读校验。
> **回报率仍是底部硬件开关，软件改不了。** 未定位的字段（Angle/Smoothing/灯效/按键表）不可写。

## 界面按型号裁剪（连上什么设备，就只显示什么设置）

**不做「全部铺开 + 逐项禁用」** —— 禁用项既是噪声，也掩盖了「这个型号本来就没有这项功能」。
界面由 `src/layout.ts` 单点决定，连上设备识别型号后自动重排：

| 连接到的设备 | 显示的卡片 | 卡片内隐藏的项 |
|---|---|---|
| **XM1** | 设备信息 · 传感器/CPI · 备份工具 | 玻璃面模式、角度捕捉、抬离时 LED、角度调校（**偏移未定位**）；整个「性能/电源」卡片（回报率是**底部硬件开关**）；「按键映射」卡片（按键表未验证）；接收器固件与电量两行。CPI 表头为**单值**（固件只读 X） |
| **4k 无线 v1**（XM2w 4k / OP1w 4k） | 全部五张 | 玻璃面模式、角度调校、强制最高 FPS、多击确认过滤（均 v2 新增） |
| **4k 无线 v2**（XM2w 4k v2 / OP1w 4k v2） | 全部五张 | 抖动过滤（v1 专属） |
| **8k 有线族** | 设备信息 · 传感器/CPI · 性能/电源 · 备份工具 | LOD（family-specific 列表，编码未验证）、玻璃面/抬离 LED/角度调校/最大 FPS（8k 上是能力位或偏移不同）、省电与深度休眠、按键卡片 |
| **第四族**（XM1r / OP1 / OP1 RGB） | 仅设备信息 | 其余全部（协议未实现，只识别型号） |
| **XM2we / OP1we** | 专属四张（信息 / CPI 与回报率 / 按键矩阵 / EEPROM 备份） | 4k 族的全部卡片 |
| **未连接** | 仅致谢与说明 | 全部设备卡片 |

**设计原则**：**只显示已实测确认的字段**。偏移未定位的字段不出现，而不是给一个「改了没反应」的控件
—— XM1 的 XY 独立就是这么翻车的（先做了控件，后来实测发现固件只读 X）。

**预览任意型号的界面**（不需要拥有该设备）：给 URL 加 hash 即可，例如
`index.html#layout=xm1`、`#layout=v1`、`#layout=v2`、`#layout=8k`、`#layout=ro`、`#layout=we`、`#layout=unsupported`。
预览**只改变界面显示，不授予任何读写能力** —— 写入闸门只看是否真的连接了设备。

再加上 `&simulate=lost` 可以演练**「设备丢失 → 复位到初始界面」**这条路径，例如
`index.html#layout=v2&simulate=lost`（同样不碰任何设备，供无实机时预览与回归验证）。

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

- **传感器**：CPI 四档（**XY 独立 —— 已真机验证**，10–30000）、档位数、当前档（v2）、LOD（含玻璃面模式编码换算）、角度捕捉、角度调校（v2）、波纹控制、抬离 LED
- **性能**：回报率 4000/2000/1000/125 Hz、Motion Sync、Slamclick 过滤、抖动过滤（v1）、多击过滤/强制最高 FPS（v2）
- **电源**：省电超时、深度休眠（1–120 分钟或关闭）
- **按键**：映射表与点击过滤展示；过滤值可编辑并写入；GX Safe/Speed 模式（左右键）
- **工具**：配置导出/导入（JSON + 原始 1024B blob）、重新配对、恢复默认配对（0x71）、读取配对数据（0x72）、恢复出厂（双重确认）、hex 级通讯日志
- **连接健壮性 —— 设备不在了就自动回到初始界面**：两条独立信号 —— ① 浏览器在设备上的 `disconnect` 事件（拔线/断电，立即）；② 定时清点 `navigator.hid.getDevices()`（连续两次落空才判定，容忍权限抖动；接口已被浏览器关闭则一次即判定）。命中后清空全部残留状态并把界面复位到未连接态，避免"界面显示已连接、写入却必然失败"的假象。
  **刻意不用「发探测命令」判断在位**：`0x0F` 是无线唤醒命令，定时发会让鼠标永不深睡（费电）；而 `0x0E`/`0x07` 在鼠标休眠时回 unreachable，会把「睡着了」误判成「拔线了」。「无线链路断开」（`inputreport 0xB1`）= 接收器还在、鼠标只是睡了，**不**触发复位
- **XM2we 族**：CPI 八槽（槽 1 即时生效）、回报率（125/250/500/1000 Hz one-hot 掩码）、点击去抖、按键矩阵（type 0x01 解码 + 其余原样展示）、EEPROM 导出（.txt / .json）；每次写入均回读校验
- **i18n**：简体中文 / 繁體中文 / English / Deutsch / Français / Español / 日本語 / 한국어 共 8 种。**首次打开按浏览器语言自动选择**（`navigator.languages` 依次匹配，繁体按 `zh-TW/zh-HK/zh-Hant` 优先判定以免被吞成简体，认不出则用简体中文），之后右上角手动切换的选择存于 localStorage 并优先；日/韩/繁体自动切换 CJK 字体栈（`html:lang()`）避免汉字套用简体字形。词条按语言分文件放 `src/i18n/`，键名一致性由 `npm run check:i18n` 校验

## 本地运行 / 部署到 GitHub Pages

源码分两部分，构建脚本把两者打包成单文件写到 `dist/index.html` 和根目录 `index.html`——
两者都是零依赖单文件，**直接双击即可用，无需服务器**。

| 目录 | 内容 |
|---|---|
| `src/` | TypeScript。依赖单向分层（下→上）：`state` / `transport` / `protocol` → `blob` / `verify` → `device-4k` / `device-8k` / `device-xm1` → `render` / `presence` → `session` → `connect` → `main`（入口只做装配与事件绑定）；`xm2we.ts` + `xm2we-ui.ts` 是完全独立的第二个协议族；`i18n.ts` + `i18n/*.ts` 是 8 语言词条 |
| `scss/` | **样式唯一来源**（`_tokens.scss` 设计令牌 / `_mixins.scss` 混入 / `main.scss` 组件） |

技术栈：**TypeScript 7**（Go 原生编译器，`tsc --noEmit` 类型检查）+ **esbuild** 打包 +
**sass** 编译 SCSS。类型检查与打包分离——`tsc` 只负责查类型，产物由 esbuild 生成。

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
gh repo create endgame-gear-web-configurator --public --source=. --push
gh api repos/{owner}/{owner}/pages -X POST -f "source[branch]=main" -f "source[path]=/"   # 或在仓库 Settings → Pages 里选 main /
```

之后访问 `https://<你的用户名>.github.io/endgame-gear-web-configurator/`。GitHub Pages 自动是 HTTPS，满足 WebHID 的安全上下文要求。

> **部署要点**（本项目已逐项核对过，详见 [`docs/ui-port-feasibility.md`](docs/ui-port-feasibility.md)）：
> - 产物**没有任何绝对路径**（也没有 `<base>`），所以放在项目页子路径 `…/endgame-gear-web-configurator/` 下不会破。
>   对照：同类站点 `op1w.vercel.app` 用的是 `/assets/…` 绝对路径，同一份构建搬到项目页子路径会 404。
> - 仓库根已有 **`.nojekyll`**：分支发布默认会跑 Jekyll，而它会排除 `_` 开头的文件（如 `scss/_tokens.scss`），
>   更糟的是**一旦 Jekyll 构建失败，整站 404**。本项目只需要托管两个构建好的 HTML。
> - Pages 给静态资源 `Cache-Control: max-age=600` —— 推送后旧版本可能还挂着 10 分钟，验证时用硬刷新。
> - 从仓库根发布会把**整个仓库**公开托管。已确认没有厂商二进制入库（`.gitignore` 覆盖 `*.exe` 与真机 blob）；
>   若只想公开产物，可另建一个 `gh-pages` 分支只放 `index.html` 与 `tools/blob-studio.html`。

## 故障排查

| 现象 | 原因与处理 |
|---|---|
| `blob 读取失败` / `0xA0 not ready (status=0x…)` | 大报告时序慢，读到旧缓存。v1.1 起已自动重发 0x12 重试 4 轮；若仍失败，打开通讯日志把 hex 发给开发者 |
| 鼠标休眠后读取失败 | 硬件行为。动一下鼠标，点「重新读取」；软件会自动发 0x0F 探测恢复通道 |
| 有线时接收器固件显示 `—` | 正常，有线连接没有 dongle，cmd 0x0D 返回"不适用"(0x07) |
| v1 当前档位改不动 | v1 硬件忽略软件切换，用鼠标底部 CPI 键 |
| 有线回报率显示 1000 Hz | USB 全速帧限制，硬件上限；写入的存储值不受影响，回到无线自动恢复 |
| 用着好好的自己回到初始界面，提示「设备已断开」 | 设备不在位（拔线 / 断电 / 接收器被移除）。复位是**刻意**的：断线后残留的旧数据会让写入看起来成功。重新点「连接设备」即可；判断依据是 `disconnect` 事件与设备清点，不依赖任何写入 |
| 切到别的标签页再回来变成未连接 | 切到后台时会按安全策略**释放 WebHID 接口**（避免接口被长期独占），既然接口已释放，界面就同步复位而不是留一份用不了的旧数据。重新连接即可（同一页面只释放一次） |

## 协议速查（详见 vole 仓库 re/PROTOCOL.md 与本项目 re/PROTOCOL_NOTES.md）

- 通道：feature report `0xA1`(64B 命令/响应，负载始于偏移 16)、`0xA0`(1041B，承载 1024B 配置 blob)
- 命令：`0x0F` 探测 · `0x0D/0x0E` 固件信息 · `0xB4` 电量 · `0x12` 读 blob · `0x13` 出厂 · `0x14` 传感器块 · `0x15` 性能块（声明 10 字节实发 11）· `0x16` 按键块×2 · `0x70` 配对 · `0x71` 默认配对 · `0x72` 配对数据
- 写入即持久化；状态码 `0x01` OK / `0x03` busy 重试 / `0x07` 该连接不适用 / `0x08,0x11` 鼠标休眠
- 失败后必须重发 `0x0F` 探测，否则设备"楔死"直到下一条探测成功

## 协议族对照（Endgame Gear 并非一套协议）

| | **XM1**（2020 有线，VID `0x22D4`） | **XM2we**（2020 有线/2.4G） | **4k 族**（4k 无线 + 8k 有线） |
|---|---|---|---|
| usage page | 待确认 | `0xFF02` | `0xFF01` |
| 报告 ID | `0xA1` 出 / `0xA0` 入 | `0x08` 出 / `0x09` 入 | `0xA1` 出 / `0xA0` 入 |
| 帧结构 | 64 B 命令 / **1041 B 大报告** | 17 B + `(0x55−Σ)&0xFF` 校验 | 64 B 命令 / 1041 B 读取 |
| 配置 blob | **1024 B @ 报告偏移 16** | 无（走 EEPROM） | 1024 B @ 16 |
| 状态字节 | **无**（看 HidD 返回码） | 无 | `[1]`/`[2]`（v2 有回显变体） |
| 命令数 | **4 条**（`0x03`/`0x04`/`0x07`/`0x08`） | 5 opcode | 13 条 |
| CPI 档 | **3 档** | 8 槽 | 4 档 |
| PC 侧档位备份 | `.profile` / `pfList.dat`（最多 5 档） | — | JSON / 原始 blob |
| 厂商 DLL | 无（协议在主 exe） | `OemDrv.exe` | `hidapi` 静态链接 |
| 内部代号 | K25A / K25B | — | W25（4k 无线）/ **K26**（8k 有线） |

**XM1 与 4k 族是同一套协议框架**——`0xA0` 1041B 大报告、1024B blob @16、
以及下面这套重试逻辑逐字节一致。差异只在 VID、命令集大小、有无状态字节、CPI 档数。
**所以支持 XM1 与 8k 有线族都几乎不需要写新协议代码。**

共用 HID 通讯封装：`HidD_SetFeature` 失败时对错误码
`{0x15, 0x17, 0x1D, 0x57, 0x65B}` 按 50 ms 间隔重试 4 次——在官方 4k 工具与 XM1 主程序里
逐字节一致。详见 `re/PROTOCOL_NOTES.md` 与 `re/XM1_NOTES.md`。

## 逆向验证

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

**未在真机上验证过的型号（8k 有线全系、XM2we / OP1we、以及若干变体 PID）默认只读**：
点写入会弹确认框，确认后**仅当次连接**放行，并自动先导出一份备份。
逐型号依据与残留风险见 **[docs/release-safety-audit.md](docs/release-safety-audit.md)**。

## 参与测试

手里有我们没有的鼠标（8k 有线全系、XM2we / OP1we）？你的实测是这些型号唯一的验证途径。
请先看这两份：

- **[docs/remote-beta-guide.md](docs/remote-beta-guide.md)** —— 参与前必读（备份、风险、怎么恢复）
- **[docs/test-checklist.md](docs/test-checklist.md)** —— 具体要测哪些项、每一项怎么填

工具里点「导出测试数据包 (.json)」可一次得到：型号 / VID / PID / 接口集合 / 固件 /
完整 blob（WE 族为 EEPROM 转储）/ 通讯日志，外加一份回报模板。

## 许可证

本项目以 **GPL-3.0-or-later** 发布（见 `LICENSE`）。你可以自由使用、修改、再分发，
任何基于本代码的衍生分发同样必须以 GPL-3 开源。

第三方素材：`re/upstream/` 内收录的 `op1web_PROTOCOL.md`（MIT © zexsso）、
`eggweb_protocol.js`（**AGPL-3** © qsxcv）仅作研究存档、不参与构建；
`docs/community-code-scan.md` 是全社区扫描与合规结论。协议事实本身不受版权保护，
但请尊重各上游项目的许可证条款。

## 变更记录

见 **[CHANGELOG.md](CHANGELOG.md)**（v1.3 起）。

## 路线图

中期战役计划（官方仓库摸底 → 有线协议逆向 → 全系网页驱动 → 收尾）见 **[TODO.md](TODO.md)**（#8–#12）。

### 支持状态

| 设备 | 状态 |
|---|---|
| **XM2w 4k / 4k v2、OP1w 4k / 4k v2** | ✅ 完整读写（协议逐字节对照官方 v1.02 工具核验） |
| **XM1 / XM1 RGB** | ✅ 读写可用（写入硬限制在 23 个实测确认的字节内） |
| **XM2we / OP1we** | 🧩 代码就绪（`src/xm2we.ts`，离线仿真 29 项通过），**从未接真机** |
| **XM2 8k / OP1 8k（含 v2）** | 🔍 PID 已从官方工具二进制挖出，**只读** —— 待真机确认 gen 编码后才开写入 |

### 已完成

- [x] 官方仓库与产品线摸底（9 个仓库、16 款鼠标全表 → `docs/official-product-catalog.md`）
- [x] 4k 无线族 v1 / v2 全字段（当前主力支持）
- [x] XM2we 2020 有线/2.4G 族（离线仿真 29 项通过）
- [x] XM1 2020 有线族：**读取 + 受限写入**（`re/XM1_NOTES.md` 第 6 章）
- [x] 样式层迁移 SCSS（`scss/`，强制约定见「本地运行」章节）
- [x] 深色主题（`[data-theme]` + CSS 自定义属性，组件样式零改动）
- [x] 离线 blob 分析工具（`tools/blob-studio.html`，可解析 + 双快照差分）

### 待办（按优先级）

1. **8k 有线族真机验证** —— PID 已补（`0x1966`/`0x1964`/`0x1980`/`0x1978`），需确认 gen 编码与字段语义后开放写入
2. **XM2we 真机验证** —— input report 桥接时序、回报率写入
3. **按键重映射 UI** —— 4k 族协议层已实现，缺编辑器
4. **XM1 灯效 / 按键映射 / Angle Snap / Smoothing** —— 差分定位后即可做
5. **更多语言** —— 在 `src/i18n/` 下加一个词条文件（照 `de.ts` 的 189 个键），到 `src/i18n.ts` 导入并入 `I18N`，在 `normalizeLang()` 补语言标签映射，再往 `index.template.html` 的语言下拉和 `main.ts` 的 `STAGE_COLORS`/`BTN_NAMES` 各加一项。跑 `npm run check:i18n` 会逐个校验是否漏了哪处，欢迎 PR
6. **部署 GitHub Pages + 向官方申请协议文档** —— 见 `docs/email-to-endgamegear.md`

> ✅ 已完成（2026-10-09）：4k 族写入后回读校验；**XY 独立 CPI 真机验证通过**

详细任务、依赖关系与完成度见 **[TODO.md](TODO.md)**。
