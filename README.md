# Endgame Gear Web Configurator（Endgame Gear 网页版驱动）

浏览器直连配置 Endgame Gear 无线游戏鼠标的网页工具，**零驱动、零安装**：打开网页 → 点连接 → 改配置。

基于 Chrome/Edge 的 **WebHID** API，通过 HID 特征报告直接与鼠标/接收器的配置通道（usage `0xFF01/0x0002`）通信。协议实现来自社区对官方 Windows 工具的完整逆向（见[致谢](#致谢)），并复刻了官方工具的全部时序怪癖。

## 支持的设备

| 型号 | 协议代数 | 无线（dongle PID） | 有线（鼠标 PID） | 状态 |
|---|---|---|---|---|
| XM2w 4k | v1 | `0x1970` | `0x1968` / `0x1969` | ✅ 完整支持 |
| OP1w 4k | v1 | `0x1970` | `0x1972` | ✅ 完整支持 |
| XM2w 4k v2 | v2 | `0x1970` | `0x1982` / `0x1981` | ✅ 完整支持 |
| OP1w 4k v2 | v2 | `0x1984` | `0x1984` | ✅ 完整支持 |
| XM2we / XM1 等有线专用型号 | — | — | — | ⏳ 另一套未公开协议，暂不支持 |

> 四个无线型号共用 dongle PID `0x1970`，USB 层面无法区分型号；本工具用 cmd `0x0E` 返回的鼠标自身 PID 做判别，v1/v2 两代不兼容的字段编码（LOD、回报率枚举、标志位）已分别处理。变体 PID `0x1969`/`0x1981` 来自官方 v1.02 工具二进制的设备表（见 `re/PROTOCOL_NOTES.md`）。

## 功能

- **传感器**：CPI 四档（XY 独立，10–30000）、档位数、当前档（v2）、LOD（含玻璃面模式编码换算）、角度捕捉、角度调校（v2）、波纹控制、抬离 LED
- **性能**：回报率 4000/2000/1000/125 Hz、Motion Sync、Slamclick 过滤、抖动过滤（v1）、多击过滤/强制最高 FPS（v2）
- **电源**：省电超时、深度休眠（1–120 分钟或关闭）
- **按键**：映射表与点击过滤展示；过滤值可编辑并写入；GX Safe/Speed 模式（左右键）
- **工具**：配置导出/导入（JSON + 原始 1024B blob）、重新配对、恢复默认配对（0x71）、读取配对数据（0x72）、恢复出厂（双重确认）、hex 级通讯日志
- **i18n**：简体中文 / English，右上角切换，偏好存于 localStorage；`I18N` 字典结构见源码，欢迎提交更多语言

## 本地运行 / 部署到 GitHub Pages

源码在 `src/`（TypeScript），构建脚本把打包结果同时写到 `dist/index.html` 和根目录 `index.html`——两者都是零依赖单文件，**直接双击即可用，无需服务器**。

**本地**：双击打开 `index.html`（`file://` 是安全上下文，WebHID 可用）。若浏览器策略拦截，任意静态服务器也行：

```bash
python -m http.server 8080
# 访问 http://localhost:8080
```

**从源码构建**（改 `src/` 后执行；产物会同步根目录 `index.html`）：

```bash
npm install
npm run build     # esbuild 打包 -> dist/index.html + index.html
npm run check     # tsc --noEmit 类型检查
```

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

## 逆向验证（v1.2）

协议实现已对照官方 `Endgame Gear XM2w 4k v2 Configuration Tool v1.02` 二进制逐字节核验：
命令表/目标/长度、0x16 双块写入、blob 布局（CPI 档 `0x23+5n`、按键 `0x37+7n`、玻璃模式 `0x6F`）、
busy 重试与发送错误码重试策略全部一致。完整证据链（反汇编脚本 + 中间产物）见 `re/`。
LED 页签与 Surface Calibration 在官方 v1.02 中未发现协议实现路径（模板遗留 UI），故未实现。

## 致谢

- **[johanneszab/vole](https://github.com/johanneszab/vole)** — 完整的 USB 配置协议逆向文档与 Linux 实现（Ghidra + USBPcap + 真机验证），本项目协议层的唯一依据
- **[stuffz/mouse-battery-monitor](https://github.com/stuffz/mouse-battery-monitor)** — 电池状态 HID 协议文档
- **[gentoocat/XM2we-Unleashed](https://github.com/gentoocat/XM2we-Unleashed)** — XM2we 直接通信探索
- **[qsxcv/UnofficialEGGWebConfig](https://github.com/qsxcv/UnofficialEGGWebConfig)** · **[zexsso/OP1-WebAPP](https://github.com/zexsso/OP1-WebAPP)** — 同类 WebHID 网页配置器（8k 系 / OP1w 4k）；XM2w 4k v1/v2 的网页配置器目前仅此一家（生态全景见 `docs/ecosystem-survey.md`）
- **[jzab.de](https://www.jzab.de/content/linux-configuration-tool-for-endgame-gear-wireless-mice)** — Linux 配置工具的先行实践
- **[Endgame Gear / Pro Gamersware GmbH](https://www.endgamegear.com/)** — 硬件本身，以及未混淆、可分析的官方配置工具

## 免责声明

本项目为独立开源工具，与 Endgame Gear / Pro Gamersware GmbH 无隶属关系。它只读写用户配置，不修改固件、不绕过任何保护机制。使用风险自负；对设备配置的任何更改请自行承担（协议文档已验证写入双向可行，但请理性使用"恢复出厂"以外的底层操作）。

## 路线图

中期战役计划（官方仓库摸底 → 有线协议逆向 → 全系网页驱动 → 收尾）见 **[TODO.md](TODO.md)**（#8–#12）。

- [ ] 按键重映射 UI（协议层已实现，缺编辑器）
- [ ] inputreport 实时休眠/唤醒提示优化
- [ ] 0x14/0x15 写路径真机回环验证（v2 固件 wire 布局，见 `re/PROTOCOL_NOTES.md`）
- [ ] 更多语言（在 `src/i18n.ts` 的 `I18N` 字典加条目即可，欢迎 PR）
- [ ] 向官方申请协议文档（见 `docs/email-to-endgamegear.md`；XRed 事件论据见 `docs/ecosystem-survey.md`）
