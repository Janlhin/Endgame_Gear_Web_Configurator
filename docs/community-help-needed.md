# 外部求助清单：哪些问题本地解决不了

> 2026-10-09。本文只列**靠本机（XM1 / XM2w 4k / XM2w 4k v2 三只鼠标 + 本机工具链）
> 无法推进**的事项，以及每项「找谁、要什么、什么算验证通过」。
>
> 分三类：
> **A. 必须别人的硬件**（只能网络求助）
> **B. 必须联网查资料/授权**（信息缺口）
> **C. 本地就能做**（列出是为了避免误判为"要求助"）
>
> 相关：`TODO.md`（总清单）、`docs/community-code-scan.md`（社区项目全景）、
> `re/FAMILY4_NOTES.md`（第四族）、`docs/email-to-endgamegear.md`（致官方）。

---

## A. 必须别人的硬件 —— 只能网络求助

### A-1. 8k 有线族「写入路径」真机验证 ★最高优先

| 项 | 内容 |
|---|---|
| 覆盖型号 | XM2 8k `0x1966`、XM2 8k v2 `0x1980`、OP1 8k `0x1964`、OP1 8k Purple Frost `0x1964`、OP1 8k v2 `0x1978`、OP1 8k v2 Raw Input `0x1978` |
| 现状 | **只读**。写入代码已实现（`buildBlob8k()`，RMW + `0x11` 整块写），但 `verified=0`，`render()` 禁按钮 + `guard4k()` 拦截 |
| 为什么本地不行 | 手上没有 8k 有线鼠标 |
| 需要什么 | 一位持 8k 鼠标的人：网页版**读一次 → 只改一个 CPI → 应用 → 回读** |
| 验证通过标准 | ① 页面显示 `✓ … 回读校验通过`；② 手感/CPI 真的变了；③ 导出 blob 差分只有 CPI 记录 4 字节变化 |
| 关键未知点 | 8k 用 `0x11` 整块写、按键区起点 `0x3D`（4k 是 `0x37`）、`gen` 二分模型不适用（LOD 是 1/2mm 却有 glass/maxFPS） |
| 找人渠道 | `Creationsss/egctl` 作者（已实现 OP1 8k v2，最对口）、`qsxcv/UnofficialEGGWebConfig` 作者、r/MouseReview、EGG 官方 Discord |

⚠️ **必须提醒参与者**：先在官方工具里备份配置截图；本项目历史上有过"写坏配置"事故
（见 `TODO.md` 不做项），8k 首次真机写入应在**接受可回退**的前提下进行。

### A-2. XM2we / OP1we 真机验证

| 项 | 内容 |
|---|---|
| 覆盖型号 | XM2we `0x1960`、OP1we `0x1962`（2020 有线/2.4G 平台） |
| 现状 | `src/xm2we.ts` 代码就绪，29 项离线仿真通过，**从未接过真机** |
| 为什么本地不行 | 手上没有 we 系列 |
| 需要什么 | 有 XM2we 或 OP1we 的人接一次，跑连接 → 读 CPI → 改一档 → 回读 |
| 验证通过标准 | 17B `0x08`/`0x09` 报告收发成功；CPI 八槽写入并回读一致；回报率 one-hot 掩码写入生效 |
| 已知待验风险 | input report 桥接时序（社区实现各异） |
| 找人渠道 | `daviddwk/xm2we-util`、`okms/xm2we-linux`、`itchyfeetleech/OP1we-Control` 的作者/issue 区 |

### A-3. 第四协议族（XM1r / OP1 / OP1 RGB）字段布局

| 项 | 内容 |
|---|---|
| 覆盖型号 | XM1r `0x1903`、OP1 / OP1 RGB `0x1903`/`0x1905`/`0x1906`/`0x1910`（`UP:0xFFA1 / U:0x00A5`） |
| 现状 | **只识别不通信**。协议骨架已完整（64B 包 + 54 条 `kCom*` + 32B 口令 `GEGJGYIKDCGBE9DWDKB27EAA7K9Z5J1P`），缺 **profile 结构体字段偏移** |
| 为什么本地不行 | 没有该族任何设备 |
| 需要什么 | 一位持 XM1r 或 OP1 的人：用网页版（需先扩一个只读探针）读 `kComQueryProfileData` → 官方软件改一个值 → 再读 → 差分 |
| ⚠️ 极高风险 | 该族含 `kComFirmwareUpgrade` / `kComWriteFlash` / `kComclearFlash` / `kComExePath*`。**任何探针必须先建发送白名单**，只放行已确认的 profile 读命令，其余一律拦截 |
| 找人渠道 | 官方 CDN 有 XM1r beta 工具（`xmr1r-configuration-software-1.2.2_beta.zip`）的下载页往往对应一个用户群；可先在 EGG Discord 问有没有人愿意配合 |

---

## B. 必须联网查资料 / 授权 —— 信息缺口

### B-1. 社区项目许可证未查清（吸收代码前的合规前置）

`docs/community-code-scan.md` 里十几个项目许可证仍是「待查」。**引用协议事实无碍，
复制代码前必须逐个查 LICENSE**。与"补有线/8k 实现"直接相关的优先：

| 优先 | 项目 | 想吸收什么 |
|---|---|---|
| ★★★ | `Creationsss/egctl` | 8k 写入时序、按键区布局（**A-1 的对口参考**） |
| ★★★ | `daviddwk/xm2we-util`、`okms/xm2we-linux`、`itchyfeetleech/OP1we-Control` | **有线 we 协议**（A-2 的最快路径：先读常量表再抓包） |
| ★★ | `lvlanson/Endgame-Gear-XM2-8k-v2-Linux-Configurator` | 8k v2 布局字段名 |
| ★★ | `FrancescoCiannavei/GO-BatteryAPI-EndGameGear-XM2W-v2` | v2 电池 `0xB4` 解析细节（充电状态位？） |
| ★ | `niansa/UnofficialEGGMouseConfig`、`swekkiekekkie/op1web`、`qaustria/xm2w`、`Mannomatico/xm2ctl` | 是否有我们没覆盖的字段 |

### B-2. 被限流没做完的代码级搜索

| 平台 | 状态 | 为什么值得补 |
|---|---|---|
| grep.app | **HTTP 429 限流**，未完成 | 唯一能做**协议常量级**全局代码搜索的渠道。搜 `0x1903` / `0xFFA1` / `kComSetPasswd` / `GEGJGYIKDCGBE9DWDKB27EAA7K9Z5J1P` 可能直接找到**第四族现成实现** |
| Codeberg | **HTTP 403 被反爬拦截** | 未验证是否真为 0 结果 |
| GitHub 代码搜索 | 需登录 | 与 grep.app 互补；登录后可直接搜常量 |

> **这是投入产出比最高的一项**：如果第四族或 8k 已有别人写好的实现，A-1 / A-3 的工作量会直接少掉一半。

### B-3. 向官方求助

| 渠道 | 用途 | 状态 |
|---|---|---|
| 邮件 `<support@endgamegear.com>` | 申请协议文档 / 请求"容忍或认可的声明" | 草稿已成 `docs/email-to-endgamegear.md`，含 XRed 木马事件 + 可审计工具论据 |
| help.endgamegear.com 工单 | 备选渠道 | 未提交 |
| 官方 Discord | 官网页脚有入口，社区团队常驻，**响应通常快于邮件** | 未使用；也是找 A-1/A-2/A-3 志愿者的地方 |

---

## C. 本地就能做（不需要外援，但需要「设计实验 + 测试」）

列出来是为了避免误判 —— 这些**只缺一次差分实验**，手上三只鼠标足够：

| # | 事项 | 需要做的动作 | 产出 |
|---|---|---|---|
| 1 | XM1 灯效偏移 | 官方 Lights 页逐个改动（Mode / Speed / Strength / 三组 LED / LED ON）后各读一次 | 定位偏移，可读可写 |
| 2 | XM1 按键映射 | 官方改一个按键映射 → 读回差分（候选 `0x0C7 + 5n`，7 项） | 7 键映射表 |
| 3 | XM1 Angle Snap / Angle Tune / Smoothing | 官方 Advanced 页逐个改 → 差分 | 偏移确定 |
| 4 | XM1 单字节通道语义 | 拨底部硬件开关 / 按底部按键，前后各读一次 `cmd 0x03` | 定性解释该字节（已知 = `blob[0]`，意义待定） |
| 5 | 4k 族回报率写入 | 在 XM2w 4k v2 上按枚举写入并回读校验 | 解锁该控件（目前标"未验证不放出"） |
| 6 | 4k 族 `gen` 字段编码复核 | 对已真机验证的型号补测其余未验证编码 | 收紧写白名单 |

---

## 一句话优先级

1. **B-2（grep.app 常量搜索）** —— 成本最低，可能直接砍掉 A-1 / A-3 一半工作量
2. **B-1（许可证）** —— 吸收任何社区代码的前置条件
3. **A-1 / A-2（8k 与 we 真机）** —— 只差一次设备接入，找对口作者最快
4. **C 全部** —— 自己半天到一天可完成，不依赖任何人
