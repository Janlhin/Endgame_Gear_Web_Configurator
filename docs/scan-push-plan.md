# 扫描继续突进方案（2026-10-09）

> 对照基准：`TODO.md`（总清单）、`docs/community-code-scan.md`（上一轮社区扫描）、  
> `docs/community-help-needed.md`（外援清单）、`re/upstream/SOURCES.md`（协议证据链）。
>
> **一句话结论**：上一轮卡住的"搜不到"（grep.app 429 / Codeberg 403 / GitHub 代码搜索需登录）  
> 本轮已用三条替代通道绕开，代价是把"找新项目"升级为"直接取源码"。结果是拿到了  
> **4 个独立实现的协议常量**，并**实锤修正了一个型号 PID 错误**；  
> 8k 族从"缺真机验证"推进到"偏移表四源一致、只差一次真机写入"，  
> WE 族则从"连不上不知道为什么"推进到"找到了具体的连接层原因（双通道绑定）"。

---

## 一、渠道结论：哪条路走死了，哪条路开出来了

| 渠道                                                                           | 本轮实测                                                                   | 结论                               |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| grep.app（`api/search`）                                                       | **HTTP 429**（带浏览器 UA 仍 429，返回的是错误页不是 JSON）                             | 放弃，不要重试                          |
| searchcode.com API                                                           | **HTTP 404**（端点已失效）                                                    | 放弃                               |
| Codeberg Gitea API                                                           | **HTTP 403** `Access denied, old Chrome version`（Anubis 反爬，需 JS 工作量证明） | 低价值，暂搁；Codeberg 上 EGG 相关项目先验概率极低 |
| Sourcegraph 公共实例（`/.api/search/stream`）                                      | **可用（200）**，但索引里查不到本项目的小众仓库（`0x3367 XM2w` → 0 命中）                      | 只适合大词发现，不适合协议常量检索                |
| GitHub `api.github.com`                                                      | 可用，但 **60 次/小时** 会被打满（本轮 21 个仓库后归零）                                    | 只用于拿元数据                          |
| **codeload 直取源码** `codeload.github.com/{repo}/zip/refs/heads/{main\|master}` | **全通，无鉴权、无限流**                                                         | ★ 替代 grep.app 的主通道               |
| **raw.githubusercontent.com**                                                | **全通**，可绕开 API 限额读 LICENSE / Cargo.toml                                | ★ 许可证与元信息通道                      |
| **官方 release 二进制** + `re/upstream/tool8k_pids.py`                            | 全通                                                                     | ★ 型号 PID 的一手证据通道                 |
| 包注册表（crates.io / PyPI / npm / AUR）                                           | 通用词全是噪声；**但 npm 命中了 `@openmouse/protocol`**                            | ★ 唯一有产出的一条，见 F1                  |

**方法论升级**：从"用搜索引擎搜关键词"改为"**枚举已知项目 → 直取源码 → 本地 grep 常量**"。  
前者受限于索引与限流，后者不受限且能拿到逐字节的结构定义。社区源码可按需重新 clone（清单见 `re/upstream/MANIFEST.md`）。

---

## 二、本轮新事实（F1–F12）

每条标注来源与置信度：**A** = 官方二进制实证 / **B** = 两个以上独立社区实现一致 / **C** = 单一来源（只记录，不作为写入依据）。

### F1 ★★★ `@openmouse/protocol`（npm，AGPL-3.0-or-later，v0.9.0）—— 上一轮完全漏掉的实现

- 仓库 `OpenMouse-Project/mouse-protocol`，"Gaming mouse protocol codecs and WebHID drivers"，  
  **浏览器 WebHID 实现**，与本工具同一赛道。含 `dist/endgame-gear/{op1,wireless}.js`  
  与 `dist/drivers/endgame/{egg-op1-hid,egg-we-hid,egg-we-control}.js`。
- **上一轮只搜 GitHub 关键词，漏掉了它**；本轮靠 npm 注册表捞到（B-2 的"包注册表"轴首次产出）。
- ⚠️ 许可证 **AGPL-3.0-or-later**：本工具是 GPL-3，**不得复制其代码**；  
  以下全部只取"协议事实"（不受版权保护），实现方式一律自行编写。

### F2 ★★★ 型号 PID 错误修正：**OP1 8k Purple Frost = `0x1976`，不是 `0x1964`**

| 来源                                                                               | 值                                                                    |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 官方 LE 专属工具 `…OP1.8k.Purple.Frost.LE.Configuration.Tool.v1.11.exe`（Firmware_1.25） | 全文只有一对立即数：`push 0x1976` @0x10916 + `push 0x3367` @0x1091B —— **A 级** |
| niansa/UnofficialEGGMouseConfig `config.cpp`                                     | `0x1976 OP1 8k Purple Frost` —— **B 级**                              |
| OpenMouse `endgame-gear/op1.js` 设备表                                              | `0x1976 …OP1 8K Purple Frost`（configFamily v1 / paw3950）—— **B 级**   |

> 旧结论"限定版与普通版共用工具 → 同 PID 0x1964"是**推测**，三源一致推翻。  
> **已改代码**（见第三节）。

### F3 ★★ 8k 族偏移表：四源完全一致（niansa / egctl / lvlanson / OpenMouse）

绝对偏移（1041B 报告内；**减 16 = 本项目 blob 偏移**）：

| 字段                                        | 绝对       | blob             | 本项目现值                             | 一致性             |
| ----------------------------------------- | -------- | ---------------- | --------------------------------- | --------------- |
| pollingDivider                            | 21       | `0x05`           | 0x05                              | ✅               |
| filterFlags（slamclick 0x01 / jitter 0x10） | 22       | `0x06`           | 0x06                              | ✅               |
| ledLiftOff                                | 24       | `0x08`           | 0x08                              | ✅               |
| LOD                                       | 25       | `0x09`           | 0x09                              | ✅               |
| angleSnapping / ripple / motionSync       | 26/27/28 | `0x0A/0x0B/0x0C` | 同                                 | ✅               |
| cpiLevels                                 | 30       | `0x0E`           | 0x0E                              | ✅               |
| CPI 首档（5B/档，4 档）                          | 51       | `0x23`           | 0x23+5n                           | ✅               |
| **handedButton**                          | **71**   | **`0x37`**       | 本项目把 `0x37` 当"8k 的 HANDED"        | ✅ 名称对上了         |
| **firstButton（7 键 × 7B，止于 126）**          | **77**   | **`0x3D`**       | 8k 按键起点 0x3D                      | ✅               |
| glassMode                                 | 127      | `0x6F`           | 0x6F                              | ✅               |
| **angleTuning**                           | **128**  | **`0x70`**       | 悬而未决（旧说 XM2w v1.02 在 blob `0x01`） | ⚠️ 倾向 0x70，见 F4 |
| forceMaxFps                               | 129      | `0x71`           | 0x71                              | ✅               |

按键结构 **7 字节/条**（`[spdt/multiclick][type][参数 5B]`），7 条止于 126 —— 与 4k 的 `8×7B`  
**记录长度相同、条数与起点不同**（4k 起点 blob `0x37`、8 条）。

### F4 ⚠️ 两处真实冲突（**写入前必须真机定论，不得猜**）

1. **`custom_flags` @126（niansa，uint16） 与 `glassMode` @127（egctl / OpenMouse） 相邻且重叠。**  
   niansa 开启 experimental（自定义回报率分频）时会写 126–127 两个字节，  
   若 127 真是 glassMode，等于顺手改了玻璃模式。→ **本项目不要实现 custom polling divider**。
2. **angleTuning 位置分叉**：OpenMouse 记 128（blob `0x70`），旧笔记里 XM2w v1.02 静态推导在 blob `0x01`。  
   → 保持"不写"，等 XM2w v2 真机改值回读定论。

### F5 ★★ 8k 命令表补全：`0x02` = 读固件版本，`0x11/0x12/0x13` = 存/读/恢复出厂

- niansa 与 egctl 独立给出同一组：`OP_GET_FW_VERSION = 0x02a1`、`STORE 0x11a0`、`LOAD 0x12a1`、`RESET 0x13a1`  
  （uint16 LE → byte0 是报告 ID：`0xA1` 命令 / `0xA0` 配置）。
- 固件版本字节 = **payload[1]/[2]（绝对 17/18）**，两家都这么取；本项目 `fwStr()` 输出如 `1.37`，  
  与 OpenMouse 的 BCD 读法（"V1.37"）**一致，无需改**。
- 恢复出厂后等待：niansa 150 ms；本项目 4k 用 800/1080 ms，8k 侧沿用即可。

### F6 ★★ 状态字节不止 `0x01/0x03`：`0x07` rejected、`0x08` 无线休眠

OpenMouse 在真机（OP1w 4K v2）上观察到四种状态：`0x01` OK、`0x03` busy、  
**`0x07` 被拒、`0x08` 鼠标不可达（RF 休眠）**；并明确说"只把 0x01/0x03 当帧头会导致  
后两种落到字节移位分支，把载荷长度算错"。  
→ 本项目 `src/transport.ts` 目前只认 0x01/0x03，其余抛 `device error 0x07`。  
**改进**：补两条人类可读文案（0x07 = 型号不支持该命令；0x08 = 鼠标在休眠，动一下再试）。

### F7 ★★ WE 族（XM2we / OP1we）连不上的**具体原因找到了：双通道 + PID 撞车**

- **双通道**：OpenMouse 的 `EggWeHidClient` 用**两个** HID 通道 —— 命令通道  
  `usagePage 0xFF02 / feature report 0x08`，通知通道 **`usagePage 0xFF01 / input report 0x09`**；  
  并显式 `bindPeers()`："cable primary → cable peers；receiver primary → receiver peers"。  
  → 本项目 `src/xm2we.ts` 只在**同一个** device 上挂 `inputreport` 监听；  
  若回复走的是另一个 interface 的 input report，就会一直"超时无响应"。**这是 A-2 的头号嫌疑**。
- **PID 撞车**：`0x1970` 既是 OP1we 老接收器，又是 4k v2 的接收器；OpenMouse 明确靠  
  **描述符**（是否存在 report `0x08` 且载荷 ≥15）区分，而不是靠 PID。  
  → 本项目按 PID 分流（`is8k` / `isFamily4` / WE）在某几个 PID 上会**认错族**。
- 第三个实现（itchyfeetleech/OP1we-Control，MIT）只认接收器 `0x1961`，并注明  
  "有线 PID 0x1960/0x1962（来自 Cfg.ini）**未见真机**"。  
  → **0x1960/0x1962 目前没有任何真机实现背书**。

### F8 ★ WE 族 EEPROM 新字段（OpenMouse `endgame-gear/wireless.js`，与本项目已实现的对照）

| 地址         | 含义                                        | 本项目  |
| ---------- | ----------------------------------------- | ---- |
| `0x00`     | 回报率 one-hot（0x08/125 … 0x01/1000 Hz）      | ✅ 已有 |
| **`0x02`** | CPI 档位数（DM）                               | ❌ 缺  |
| **`0x04`** | **当前 CPI 档（DEFLEVEL）** —— 明确注明"**不是回报率**" | ❌ 缺  |
| **`0x0A`** | LOD（1=Medium / 2=High）                    | ❌ 缺  |
| `0x0C`     | 8 × 4B CPI 档                              | ✅ 已有 |
| `0xA9`     | 去抖 ms                                     | ✅ 已有 |
| **`0xAD`** | 休眠（原始值 ×10 = 秒）                           | ❌ 缺  |

帧格式与本项目**逐字节一致**：report `0x08`、16B 载荷、全帧和 = `0x55`、  
`READ_EEPROM 0x08` / `WRITE_EEPROM 0x07` / `GET_POWER 0x04` / `GET_CONNECT 0x03`。

### F9 ⚠️ 命令 `0x0E` 有安全争议，本项目不要碰

- OpenMouse 定义为 `GET_CUR_PROFILE = 0x0E`；
- itchyfeetleech/OP1we-Control 的发送白名单注释则写 **"0x0E is implicated in a receiver bootloader reset"**（会把接收器打进 bootloader）。
- 本项目 `src/xm2we.ts` 现有 `OP_PROFILE = 0x0F`。→ **保持 0x0F，不引入 0x0E**，直到有实证。

### F10 ★ CPI 步进按"配置族"分档（不是按 PID 猜）

| 族                                                      | 范围           | 步进                          | 传感器                   |
| ------------------------------------------------------ | ------------ | --------------------------- | --------------------- |
| configFamily **v1**（0x1964 / 0x1966 / 0x1976）          | 50–26000     | 50                          | paw3395（PF 为 paw3950） |
| configFamily **v2**（0x1978 / 0x1980 / 0x1984 / 0x1970） | **10**–30000 | **≤10000 用 10，>10000 用 50** | paw3950               |

⚠️ **0x1984 / 0x1970（4k v2）在 OpenMouse 里也归 v2 族** —— 意味着本项目 4k v2 的  
CPI 输入若只按 50 步进归一化，会拒绝合法值（如 10 的倍数但非 50 的倍数）。**需复核**。

### F11 ★ LOD 档位表（含玻璃模式）

- v1：`["0.7","1","2"] mm`；v2：`0.7 → 1.7 mm` 共 **11 档**（步长 0.1）。
- 玻璃模式：`["1.0","2.0"] mm` 两档（v1 里只有 PF 有）。
- 与本项目 gen2 编码 `round(mm×10) − 7` **完全吻合**（0.7→0，1.7→10）。
- ⚠️ v1 的 `"0.7 mm"` 是第三档起点，与 vole 记的"整毫米 1/2"不同 —— **v1 侧 LOD 仍以真机为准，不改**。

### F12 · 上一轮扫描的两处误报 / 过时结论

1. `swekkiekekkie/op1web` 实为 **WebMIDI 生成式工具**，与 EGG 无关 —— 上一轮列表里的噪声，**剔除**。
2. `re/upstream/SOURCES.md` 里"WE 族 opcode 0x08 = 写"**写反了**：`0x07` 写 / `0x08` 读。  
   `src/xm2we.ts` 代码本身是对的（`OP_EE_WRITE = 0x07`），只有文档错 —— **待修**。

### 附：B-1 许可证全部落地（"待查"清零）

| 项目                                                                                                                                             | SPDX                                              | 备注                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------ |
| niansa/UnofficialEGGMouseConfig                                                                                                                | **Unlicense**（公有领域）                               | 28★、8k 族、**可自由借鉴**                   |
| Creationsss/egctl                                                                                                                              | Cargo.toml 声明 **AGPL-3.0-or-later**（无 LICENSE 文件） | 与本项目 GPL-3 **不兼容**，只取事实              |
| daviddwk/xm2we-util                                                                                                                            | GPL-3.0                                           | 兼容                                   |
| okms/xm2we-linux、itchyfeetleech/OP1we-Control、qaustria/xm2w、Mannomatico/xm2ctl、FrancescoCiannavei/GO-BatteryAPI…、BrettLoewen/Endgame-Gear-Mod  | MIT                                               | 兼容                                   |
| 0e4ef622/op1w4k-bpf                                                                                                                            | GPL-2.0                                           | 内核态，用不上                              |
| zexsso/OP1-WebAPP、stuffz/mouse-battery-monitor                                                                                                 | MIT（API 未识别，读 LICENSE 正文确认）                       | 已存档                                  |
| **lvlanson/XM2-8k-v2-Linux-Configurator、swekkiekekkie/op1web、daohhuynh/homebrew-egg-mouse、racclololz/…、Constructor666/…、shohamc1/OP1wBattery** | **无 LICENSE 文件**                                  | 视作 all-rights-reserved，**只读参考，一行不抄** |

---

## 三、本轮已落地改动

| 文件                                             | 改动                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/protocol.ts`                              | `MOUSE_PIDS` / `PID_8K` 新增 `0x1976 → OP1 8k Purple Frost`（gen 2），`0x1964` 更名为 `OP1 8k`；注释补上官方 LE 工具的偏移级证据 |
| `re/upstream/license_scan.py`、`license_raw.py` | 新增：批量许可证扫描（API + raw 双通道，后者绕限额）                                                                           |
| `re/upstream/sg_search.py`                     | 新增：Sourcegraph 匿名代码检索（grep.app 的替代品，已验证可通）                                                                |
| `re/upstream/_src/`                            | 7 个社区实现的源码落盘 —— **2026-10-09 已删**（32 MB，可再生），清单与复现方式见 `re/upstream/MANIFEST.md`          |
| `re/upstream/pf_tool.exe`                      | 新增：官方 Purple Frost LE 配置工具（F2 的一手证据，gitignore）                                                            |

校验：`tsc --noEmit` 零错误 · `npm test` 30/30 通过 · `npm run build` 产出 254.5 KB 单文件。

---

## 四、突进方案（按性价比排序）

> 排序原则：**先做"零真机依赖 + 能减少未来真机实验次数"的事**，  
> 真机实验（A 类）永远是稀缺资源，能靠静态证据砍掉的未知量先砍掉。

### P0 · 零设备依赖，本轮就能收尾（合计约半天）

| #       | 事项                            | 做法                                                                                                                   | 验收                                    | 风险             |
| ------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------- |
| **0.1** | 状态字节 `0x07 / 0x08`            | `src/transport.ts` 的 `map` 补两条文案；`0x08` 归为可重试（提示动一下鼠标）                                                               | 真机断连/休眠时日志说人话，不再是 `device error 0x08` | 无（纯文案）         |
| **0.2** | 4k v2 的 CPI 步进复核              | 按 F10：v2 族 10–30000、≤10000 步进 10                                                                                     | 输入 1010 不再被归一化成 1000                  | 若真机不支持会被回读校验捕获 |
| **0.3** | 修 `SOURCES.md` 的 0x07/0x08 笔误 | 文档                                                                                                                   | 文档与 `xm2we.ts` 一致                     | 无              |
| **0.4** | 冻结 8k 偏移表                     | 把 F3 表写进 `re/PROTOCOL_NOTES.md`，标注四源出处与 F4 的两处冲突                                                                     | 8k 真机实验前，实验清单从"猜偏移"变成"验偏移"            | 无              |
| **0.5** | 补扫其余官方工具 PID                  | 对 `OP1-8k / XM2-8k / XM2-8k-v2 / OP1-8k-v2 / XM2w-4k / OP1w-4k(-v2)` 逐个跑 `tool8k_pids.py`，顺带确认"Raw Input 变体"到底哪个 PID | 17 款型号的 PID 全部有一手证据                   | 无（只读下载）        |

### P1 · WE 族连接层改造（**本轮最大的技术增量**，约 1 天，仍需真机验收）

| #       | 事项                | 做法                                                                                                                          | 验收                                        |
| ------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **1.1** | **双通道绑定**         | 连接后枚举 `device.collections`，按 F7 绑定命令通道（FF02 / feature 0x08）与通知通道（FF01 / input 0x09）；两个通道都挂监听                                | 有 XM2we/OP1we 的人接一次能看到 17B 帧往返（不再"超时无响应"） |
| **1.2** | **描述符优先于 PID 判族** | 判族条件改为：存在 feature report `0xA1`（4k/8k）→ 8k/4k 族；存在 feature `0x08` 且载荷 ≥15（FF02）→ WE 族；usagePage `0xFFA1` → 第四族。PID 只用于显示型号名 | `0x1970` 不再被误判族                           |
| **1.3** | 补 WE 只读字段         | 读 `0x02`（档位数）、`0x04`（当前档）、`0x0A`（LOD）、`0xAD`（休眠 ×10 s），只显示不写                                                                | 页面信息卡不再缺项                                 |
| **1.4** | 型号识别              | 引入 `OP_MODEL = 0x01`（14B 查询，返回 CID/MID；OP1we = `0x35,0x02`）—— 只读、零风险                                                        | 能区分 XM2we / OP1we，不再依赖未验证的 PID 映射         |

⚠️ 红线不变：**0x0E 不引入**；EEPROM 写仍只在回读校验通过后才算成功。

### P2 · 8k 写入路径（代码已存在，**只等一次真机**）

- 现状：`buildBlob8k()` + `store8k()`（RMW + `0x11` 整块写）已在 `src/device-8k.ts`，  
  三个独立实现交叉印证其格式正确，但 `verified=0`，UI 禁写。
- **只差一次实验**：接一只 8k 有线鼠标 → 读 → 只改一个 CPI → 应用 → 回读。
- 找人顺序（对口程度递减）：`niansa`（8k 全系、Unlicense、真机在维护）→  
  `Creationsss/egctl` 作者（OP1 8k v2）→ `qsxcv/UnofficialEGGWebConfig` 作者 → r/MouseReview / EGG Discord。


- 求助信里必须写明：① 先在官方工具里截图备份；② 本项目有过"写坏配置"的历史教训；③ 首次实验只改一个 CPI。

### P3 · 本地差分实验（`docs/community-help-needed.md` 的 C 组，半天到一天）

XM1 灯效 / 按键映射 / Angle / 单字节通道四项，手上三只够用，只缺"设计实验 + 跑一遍"。  
**建议排在本轮 P0 之后**——因为 P1.2 的描述符判族若先落地，XM1 的连接路径会更稳。

### P4 · 收尾（部署与外联）

GitHub Pages 部署（产物已是单文件，`.nojekyll` 已备）→ 官方邮件/工单/Discord 三渠道发出  
（草稿见 `docs/email-to-endgamegear.md`）。**建议等 P1 落地后再发**，因为 WE 族支持是正文里  
最有说服力的一条论据。

---

## 五、仍然只能靠外援的部分（不要假装能做）

| 项              | 为什么                                            | 备注                      |
| -------------- | ---------------------------------------------- | ----------------------- |
| 8k 写入真机验证（A-1） | 手上没有 8k 有线鼠标                                   | P2                      |
| WE 真机（A-2）     | 手上没有 XM2we/OP1we；且 0x1960/0x1962 **无任何真机实现背书** | P1 只能把"连不上"的原因修掉，不能代替验收 |
| 第四族字段布局（A-3）   | 没有该族任何设备；且含刷固件类命令                              | 探针必须先建发送白名单             |

## 六、合规边界（本轮新增两个 AGPL 源，需记住）

- **AGPL-3.0**：`@openmouse/protocol`（F1）、`Creationsss/egctl`。本工具是 GPL-3，  
  复制其代码会使整个衍生作品落入 AGPL。**本轮所有引用均限于"协议事实"（命令码、偏移、枚举值），  
  实现方式一律自写**，与上一轮处理 `qsxcv/UnofficialEGGWebConfig`（同为 AGPL）的口径一致。
- **无 LICENSE 的 6 个项目**：只能读，不能抄。
- **Unlicense（niansa）**：公有领域，是唯一可放心借鉴实现的 8k 参考。
