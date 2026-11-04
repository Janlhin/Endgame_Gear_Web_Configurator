# 生态调研：官方组织与社区实现

> **2026-11-04 重写。** 原版写于 2026-10-11，结论「XM2w 4k v1/v2 的网页配置器只有你这一个」
> 已被现实推翻：当时漏掉了两个项目，其中一个是 2,800 star 的通用鼠标配置器。
> 本文按 2026-11-04 用 GitHub API 实测的结果重写，检索方法见 §4。

## 1. 官方组织 `EndgameGear` —— 11 个仓库，零源码

XM2w 4k / XM2w 4k v2 / OP1w 4k / OP1w 4k v2 / XM2 8k / XM2 8k v2 / OP1 8k / OP1 8k v2 /
OP1 8k Purple Frost LE / KB65HE / KB65HE 8k。

内容一律是**固件 release + 官方配置工具 exe（附 SHA256）**，不放源码。
**全部仓库自 2025-08 起停止更新。**

对项目有用的用途：核对官方工具是否为纯净原版。例：
`EndgameGear/XM2w-4k` 的 release 挂着 `Endgame.Gear.XM2w.4k.Configuration.Tool.v1.04.exe`，
SHA256 `6e635fb5...380c`。

## 2. 社区项目 —— 27 个（含本项目），分五类

### ★ 覆盖面最大的一家：`OpenMouse-Project/openmouse`（约 2,800 star）

浏览器端 WebHID 配置器（openmouse.app），**多品牌平台**，EGG 驱动放在
`mouse-protocol` 包里，分三条：

| 驱动 | 覆盖 |
|---|---|
| `endgame-gear/op1.ts` | 4k 无线全系 + 8k 有线全系 |
| `endgame-gear/wireless.ts` | WE 族（XM2we / OP1we） |
| `endgame-gear/ot.ts` | 第四族（XM1r / OP1 / OP1 RGB），**未真机验证** |

它的存在改变了本项目的定位判断（见 §3）。**许可证 AGPL-3.0，与本项目 GPL-3.0 不兼容：
只能交换事实，不能交换代码。**

### 其余社区项目

| 项目 | 语言 | 干什么 |
|---|---|---|
| **niansa/UnofficialEGGMouseConfig** | C++ | **生态内 star 最高（30）**，8k 系参考实现，用 `static_assert(offsetof(...))` 锁死偏移；Unlicense |
| johanneszab/vole | C | Linux 配置工具（本项目 4k 协议的主要来源之一，含 GUI/CLI/固件刷写） |
| qsxcv/UnofficialEGGWebConfig | JS | 8k 系 WebHID 配置器；作者已创办鼠标品牌 XBAB Tech，其商业配置器同样是 WebHID |
| zexsso/OP1-WebAPP | TS | OP1w 4k WebHID 配置器 |
| Creationsss/egctl | Rust | OP1 8k v2 配置（AGPL） |
| Mannomatico/xm2ctl、imqastr/xm2w、lvlanson/XM2-8k-v2 | Rust/Py | 各自型号的配置器 |
| daviddwk/xm2we-util、okms/xm2we-linux | C/Py | 有线 XM2we 工具 |
| djshiye/wheelguard | Python | XM2w 4k v2 的**滚轮回弹过滤** + 参数设置（GNOME），含独立反汇编得到的协议文档 |
| stuffz/mouse-battery-monitor、zmudzin/egg-mouse-battery-indicator 等 5 个 | C++/C#/Py | 电量托盘 |
| 0e4ef622/op1w4k-bpf | C | 内核态 eBPF 改键 |
| JulianFriedle/kb65he-linux | — | 同品牌键盘 |

> ⚠️ 检索陷阱：`OP-1` 会撞 Teenage Engineering 合成器；`endgame gear` 会撞 Minecraft 模组与
> OSRS 装备追踪器。两者已在统计中剔除。

## 3. 生态判断（修订版）

**广度上本项目不占优。** OpenMouse 覆盖的品牌与型号远多于本项目与任何单品牌工具，
且有贡献流程、托管站点与文档。追覆盖面不是可行策略。

**独占项只剩一个，但它是硬的：XM1 / XM1 RGB（VID `0x22D4`）。**

- OpenMouse 文档原文：`XM1 / XM1 RGB: InstallShield-locked installers; PIDs unknown.`
  即**它拿不到 PID**，因此不会支持 —— 除非有人把 PID 与协议送过去。
- 本项目有 `0x1803`、真机验证过的读写、以及「写入仅限实测确认的 23 字节」这条边界。

**验证深度是本项目的另一项资产。** OpenMouse 的 OT 驱动自标
*"recognition-grade, not hardware-verified"*；4k 与 WE 两族的实测数据、XM2we 的逐字节
差分（issue #1）都不在它那里。

## 4. 检索方法（可复现）

用 GitHub REST API 而非网页搜索：

```text
/orgs/EndgameGear/repos          # 官方仓库全量
/users/<login>/repos             # niansa 等个人账号
/search/repositories?q=<kw>      # 逐关键词：endgamegear、"endgame gear"、XM2w、OP1w、
                                 #   endgame mouse hid、openmouse、topic:endgame-gear …
```

匿名限额 60 次/小时，`/users/{login}` 一次一调用，抓多人时要节制。

## 5. 一个必须知道的前科

2025 年 6–7 月，官方分发的 **OP1w 4k v2 配置工具被植入 XRed 远控木马**
（经 USB 蠕虫传播、注册表 Run 键持久化、SMTP 外传），在官网挂了两周。
官方在 Discord 只回了「文件已重新上传」，公开声明晚了约一周；其安全公告页现已搜不到。

这条对项目有两重意义：一是「开源可审计」的论证依据；二是提醒——**第三方工具同样要能被审计**，
这也是本项目坚持零依赖单文件 + GPL-3.0 的原因之一。
