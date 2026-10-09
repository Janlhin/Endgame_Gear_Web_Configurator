# 生态调研：官方组织与社区实现

GitHub 上有个**官方组织 EndgameGear**，还挂着固件仓库——这很重要，先摸清它，再扫其他平台：
查完了，GitHub + Codeberg / GitLab / Gitee 全扫了一遍。结果如下：

## GitHub：约 20 个相关项目，分两类

### ① 官方组织 `EndgameGear`（约 8 个仓库）——只有固件，没有源码

`XM2w-4k`、`XM2w-4k-v2`、`OP1w-4k`、`OP1w-4k-v2`、`OP1-8k`、`OP1-8k-v2`、`XM2-8k`、`OP1-8k-Purple-Frost-LE`。内容全是**固件 release + 官方工具 exe（带 SHA256）**，不放源码。

顺带一个对你有用的发现：**你手搓的那个 XM2w 工具的官方出处就在这里**——`EndgameGear/XM2w-4k` 的 release 页挂着 `Endgame.Gear.XM2w.4k.Configuration.Tool.v1.04.exe`，SHA256 `6e635fb5...380c`。想验你那份 original 是不是纯净原版，对一下这个哈希就行。

### ② 社区项目（约 17 个，全部是逆向/第三方工具）

| 项目 | 语言 | 干什么 |
|---|---|---|
| **johanneszab/vole** | C | Linux 配置工具（我们协议文档的来源，含 GUI/CLI/**固件刷写器**） |
| qsxcv/UnofficialEGGWebConfig | JS | **8k 系 WebHID 网页配置器**（和你的网页版同类） |
| zexsso/OP1-WebAPP | TS | **OP1w 4k WebHID 网页配置器**（又一个同类！） |
| daohhuynh/egg-mouse | Python | macOS 配置工具 + 固件刷写 |
| Creationsss/egctl | Rust | OP1 8k v2 配置 |
| qaustria/xm2w、Mannomatico/xm2ctl、lvlanson/XM2-8k-v2… | Rust/Python | XM2w/XM2 8k 各自的配置器 |
| stuffz/mouse-battery-monitor、shohamc1/OP1wBattery 等 5 个 | C++/C#/Python | 电池托盘/百分比工具 |
| daviddwk/xm2we-util、okms/xm2we-linux | C/Python | **有线 XM2we** 的工具（对我们补上有线支持有参考价值） |
| 0e4ef622/op1w4k-bpf | C | 内核态 eBPF 修键位（硬核） |

两个 WebHID 同类项目（`UnofficialEGGWebConfig`、`OP1-WebAPP`）值得加进我们页面的致谢区，也可以参考它们的连接参数。

## 其他平台：基本为零

- **Codeberg**：`endgame gear`、`XM2w` 均搜到 **0 个**
- **Gitee**：**0 个**
- **GitLab**：全站搜索需登录，网页搜索未发现任何相关公开项目

## 一个必须知道的前科

搜的过程中翻出官方黑历史：**2025 年 6-7 月，Endgame Gear 官网分发的 OP1w 4k v2 配置工具被植入 XRed 远控木马**（XRed 会通过 SMTP 外传数据、注册表 Run 键持久化），挂了两周才撤下，官方处理态度还被 Reddit 用户批评。这反而佐证了社区逆向工具的价值——也是给官方写邮件时很好的论据（“开源、可审计的第三方工具能降低这类风险”）。

结论：Endgame Gear 相关开源生态全部集中在 GitHub，官方只发固件二进制，协议逆向和工具全靠社区——你要做的网页版在这个生态里是稀缺品（现有两个 WebHID 项目只覆盖 8k 和 OP1w，**XM2w 4k v1/v2 的网页配置器目前只有你这一个**）。
