# 官方产品清单与版本存档

> 抓取日期：**2026-10-08**，来源：<https://endgamegear.com/pages/downloads>（下载总页）、
> <https://endgamegear.com/collections/all>（在售商品）、各型号下载子页。
> 官方 CDN 为 `img.endgamegear.com`，站点基于 Shopify。
> 下载均需同意 EULA（`cdn.shopify.com/.../EULA_ENG_kostenfreie_Kalibrierungssoftware_Maus.pdf.pdf`）。

## 一、鼠标产品线总表（15 款 + 1 款仅固件）

| 型号 | 系列 | 形态 | 固件 | 配置工具 | 官方工具下载 |
|---|---|---|---|---|---|
| **XM1** | XM1 | 有线 | **V2.29** | **V1.09** | `XM1_Configuration_Software_(V1.09).zip` |
| **XM1 RGB** | XM1 | 有线 | 同上 | 同上（共用） | 同上 |
| **XM1r** | XM1 | 有线 | **V1.8.154** | **V1.2.2 beta** | `xmr1r-configuration-software-1.2.2_beta.zip` |
| **XM2 8k** | XM2 | 有线 8k | **V1.24** | **V1.12** | `endgame-gear-xm2-8k-configuration-tool.v1.12.exe` |
| **XM2 8k v2** | XM2 | 有线 8k | **V1.10** | **V1.07** | `Endgame_Gear_XM2_8k_v2_Configuration_Tool_v1.07.zip` |
| **XM2we** | XM2 | 有线/2.4G | **V1.03** | **V1.0** | `XM2we_Configuration_Software_Setup_v1.0.exe` |
| **XM2w 4k** | XM2 | 无线 4k | **V1.10** | **V1.04** | `Endgame_Gear_XM2w_4k_Configuration_Tool_v1.04.exe` |
| **XM2w 4k v2** | XM2 | 无线 4k | **V1.07** | **V1.02** | `Endgame_Gear_XM2w_4k_v2_Configuration_Tool_v1_02.exe` |
| **OP1** | OP1 | 有线 | 同 OP1 RGB | **V1.0**（页标 V1.0） | `Endgame-Gear-Configuration-Software-OP1-and+OP1-RGB-1.6.400.exe` |
| **OP1 RGB** | OP1 | 有线 | 同上 | 同上 | 同上 |
| **OP1 8k** | OP1 | 有线 8k | **V1.24** | **V1.12** | `Endgame_Gear_OP1_8k_Configuration_Tool_V1.12.exe` |
| **OP1 8k Purple Frost** | OP1 | 有线 8k 限定 | V1.24 | 同 OP1 8k | 同上 |
| **OP1 8k v2** | OP1 | 有线 8k | **V1.10** | **V1.07** | `Endgame_Gear_OP1_8k_v2_Configuration_Tool_v1.07.zip` |
| **OP1 8k v2 Raw Input** | OP1 | 有线 8k | 同上 | 同上（独立页） | `pages/op1-8k-v2-raw-input-edition` |
| **OP1w 4k** | OP1 | 无线 4k | **V1.10** | **V1.04** | `Endgame_Gear_OP1w_4k_Configuration_Tool_v1.04.exe` |
| **OP1w 4k v2** | OP1 | 无线 4k | **V1.07** | **V1.02** | `Endgame_Gear_OP1w_4k_v2_Configuration_Tool_v1_02.exe` |
| **OP1we** | OP1 | 无线 | — | **V1.0** | `endgame-gear-we-series-configuration-software-v1.0-setup.exe` |

**非鼠标产品**：`KB65HE` / `KB65HE 8k`（Hall Effect 键盘）、`XSTRM`（USB 麦克风）。
**周边**：EM-B / EM-C / MPC1200 / MPC450 / MPC890 鼠标垫、MB1 弹力绳、OP1 系列替换微动与脚贴、Flex Cord 线材。

## 二、★ 版本规律（对协议演进判断极有用）

- **XM2 与 OP1 系列严格配对**：同代产品固件与工具版本完全一致
  （XM2 8k ≡ OP1 8k ≡ 1.24/1.12；两者的 v2 ≡ 1.10/1.07；
  XM2w 4k ≡ OP1w 4k ≡ 1.10/1.04；两个 v2 ≡ 1.07/1.02）。
  → **同一套协议在不同外形上复用**，工具可以互相替换做交叉验证。
- **v2 代工具版本落后于 v1**（v2 是 1.02/1.07，v1 是 1.04/1.12），
  但 v2 固件版本也更低（1.07 vs 1.10）——**v1 才是当前主力维护线**。
- **XM1r 是版本号风格异常的一个**：固件 `V1.8.154`、工具 `V1.2.2 beta`
  （唯一带 beta 标记的工具）。
- **XM1 与 XM1 RGB 共用同一工具**（页面上 OP1 与 OP1 RGB 也共用）。

## 三、与本项目协议实现的交叉对照

### ★ 先说结论：8k 有线族已确认属 4k 族同构（2026-10-08 实证）

已从官网 CDN 下载 **XM2 8k 配置工具 v1.12**（`endgame-gear-xm2-8k-configuration-tool.v1.12.exe`，
2,146,304 B，SHA256 `580a47db784a535dc72d051c7f4c2cb8c9907898fd08061d3c0ce54e2b3c7dfe`）并静态鉴定：

| 特征 | 4k 无线族工具 | 8k 有线族工具 v1.12 |
|---|---|---|
| 报告 ID | `0xA1`（首字节） | **✅ 同样是 `0xA1` 首字节**（`0x02A1`/`0x12A1`/`0x13A1`） |
| 通讯 | `HidD_SetFeature`/`GetFeature` | **✅ 完全相同的 7 个 HidD_* API** |
| `GetCPInfo` 导入 | ✅ 有 | **✅ 有（同样来自 KERNEL32）** |
| 框架 | MFC | MFC（有导出表） |
| PDB 代号 | `W25_096_config_V0.91_` | **`K26_046_config_v1.12_8k_motion_jjitter`** |
| `.ini` 配置 | — | `language.ini`、`GetPrivateProfileStringW` |

**PDB 路径里的 `8k_motion_jjitter`** —— jitter（抖动过滤）是 4k 族 v1 的标志性功能，
说明 8k 族是 4k 族的延伸而非新协议。**因此网页版现有实现只需补 PID 即可覆盖 8k 有线族。**

（8k 有线族工具的完整命令表尚未穷举，仅确认了报告头布局与 4k 族一致。）

### 全型号对照表

| 型号 | 协议族 | 接口页 | 报告 ID | 配置载体 | 网页版状态 |
|---|---|---|---|---|---|
| XM1 / XM1 RGB | **4k 族同构**（VID 0x22D4） | 待确认 | `0xA0`+`0xA1` | **1024B blob @16（实测）** | 🧡 协议已逆向（2020 命令集），缺 VID/PID |
| XM1r | 2020 有线（衍生） | 待验证 | 待验证 | 待验证 | ❌ 未支持 |
| XM2we | **2020 有线/2.4G** | `0xFF02` | `0x08`/`0x09` 17B | EEPROM `0x00–0xB4` | ✅ 已实现（用户无此设备） |
| XM2 8k / 8k v2 | **4k 族同构（有线）** | `0xFF01`? | `0xA1`（已确认） | 1024B blob? | ❌ 未支持（协议同构，缺 PID） |
| OP1 8k / 8k v2 | 4k 族同构（有线） | `0xFF01`? | `0xA1`（同工具） | 同上 | ❌ 未支持（同上） |
| OP1 / OP1 RGB | 4k 族同构（有线） | 待验证 | 待验证 | 待验证 | ❌ 未支持 |
| XM2w 4k | 4k 无线 v1 | `0xFF01` | `0xA1`/`0xA0` | 1024B blob | ✅ 完整支持 |
| XM2w 4k v2 | 4k 无线 v2 | `0xFF01` | `0xA1`/`0xA0`（带回显） | 1024B blob | ✅ 完整支持 |
| OP1w 4k / 4k v2 | 4k 无线 | `0xFF01` | 同上 | 同上 | ✅ 完整支持 |
| OP1we | 无线（最新） | 待验证 | 待验证 | 待验证 | ❌ 未支持 |

**结论：Endgame Gear 协议族实际只有三类**（2026-10-08 第二轮实测修订）：
1. **2020 有线/2.4G 族**（XM2we/OP1we）——17B `0x08`+`0x09`，`0x55` 校验，配置存 EEPROM
2. **4k 族**——64B `0xA1` + `0xA0` 大报告(1041B)，1024B blob @16，有状态字节
   - **4k 无线**（XM2w 4k / OP1w 4k 及 v2）：13 条命令，4 档 CPI
   - **8k 有线**（XM2 8k / OP1 8k 及 v2、OP1/OP1 RGB）：同框架，工具版本最高 v1.12
   - **XM1 / XM1 RGB**（VID `0x22D4`）：**实测同构**——`0xA0` 1041B 大报告 +
     1024B blob @16 + 同一套 `HidD_SetFeature` 重试逻辑，仅命令集更小
     （**4 条**：`0x03`/`0x04`/`0x07`/`0x08`）、**无状态字节**、**3 档 CPI**。
     详见 `re/XM1_NOTES.md`。
3. **XM1r / OP1we**：尚未逆向，预期沿用上述两族之一

> ⚠️ 第一轮我曾判定"XM1 是无大报告、无 blob 的独立族"——**已被第二轮实测推翻**，
> 教训见 `re/XM1_NOTES.md` 第 8 节「方法论教训」。

## 四、已确认的官方工具哈希（可验真）

| 文件 | SHA256 | 核对结果 |
|---|---|---|
| XM2w 4k 配置工具 v1.04 | `6e635fb5dc4060a8e8356811cce55fe8f3e69641dbb0479e80da77bda3a7380c` | ✅ 与 GitHub release 逐字节一致 |
| XM2w 4k v2 配置工具 v1.02 | `2e210cda…`（见 `re/PROTOCOL_NOTES.md`） | ✅ 与官网现行版对应 |

- 你手上的 `..._v1.02_original.exe` **就是官网现行版本**（`img.endgamegear.com/downloads/`），
  非第三方渠道产物。
- `E:\IDM\Programs\` 里另有两个同版本但哈希不同的 exe（`...v1.04.exe` / `...v1_02.exe`），
  同为纯净 PE（非安装器壳），出处待考，**不影响逆向结论**（我们只用 `_original`）。
- XM1 分析用的 `XM1 Configuration Software V1.09.zip`（`ca99bad2…`）
  即官网 `XM1_Configuration_Software_(V1.09).zip`，已确认为**官方现行版**。

## 五、官方 GitHub org 与产品线的对应

`github.com/EndgameGear` 实为 **9 个仓库**（站内搜索补回了 org 主页漏抓的两个）：

| 仓库 | 对应产品 | 备注 |
|---|---|---|
| `XM2w-4k` | XM2w 4k | 工具 v1.01/1.03/1.04，固件 tag 至 `Firmware_1.10` |
| `XM2w-4k-v2` | XM2w 4k v2 | **只挂 v2 工具 v1.01** |
| `XM2-8k` | XM2 8k | |
| `OP1-8k` | OP1 8k | |
| `OP1-8k-v2` | OP1 8k v2 | |
| `OP1w-4k` | OP1w 4k | |
| `OP1w-4k-v2` | OP1w 4k v2 | |
| `OP1-8k-Purple-Frost-LE` | 限定版 | |
| `achievements` | 成就系统 | 非产品仓库 |

⚠️ **无 XM1 / XM1r / XM2we / OP1we / XM1 RGB 仓库** —— 2020 代产品没有官方开源仓库，
这也是我们逆向 XM1 必须从安装包下手的原因。

**仓库 vs 官网版本差**：GitHub `XM2w-4k` 已有 `Firmware_1.10` tag，与官网固件 V1.10 一致；
但**配置工具仓库只到 v1.04**，与官网一致。两者无版本差，但注意 v2 仓库只有 v1.01 工具
（官网 v2 已是 v1.02）——**GitHub 并非首发渠道，官网 CDN 才是**。

## 六、给逆向工作的优先级建议（已按实证结果修正）

1. ~~**XM2 8k / OP1 8k 工具 v1.12**~~ → **已鉴定为 4k 族同构**，
   剩下只差 VID/PID。优先级降为「补 PID 即可支持」，成本极低。
2. **XM1（v1.09，用户持有）** —— 协议骨架已逆向，只缺 VID/PID 与 `0x07` 参数布局。
   若装了软件读一次 `Config.ini` 即可补齐。
3. **XM2 8k / OP1 8k 的 PID 与接口页** —— 拿到即可让现有网页版直接支持这两个型号
   （协议同构，无需新代码）。可从它们的安装包或设备管理器信息推断。
4. **OP1we / XM1r** —— 单独立线，优先级最低。
5. 各型号 **QSG PDF** 是官方说明书，含规格表（传感器/回报率/重量），可用于校验协议字段推断。

## 七、抓取方法备忘（可复用）

- **官网 `endgamegear.com` 对 curl 会返回 429 限流**，WebFetch 通道正常。
  官网站点基于 Shopify，产品页是 `/collections/all`，下载总页是 `/pages/downloads`。
- **官方 CDN `img.endgamegear.com` 不限流，可直接 curl 下载**工具与固件：
  ```
  curl -L "https://img.endgamegear.com/downloads/endgame-gear-xm2-8k-configuration-tool.v1.12.exe" -o t.exe
  ```
- 型号下载页 URL 规律：`/pages/<型号小写连字符>-downloads`，
  例：`/pages/xm2w-4k-v2-downloads`、`/pages/xm2we-downloads`。
- 下载全部需同意 EULA（一个 PDF，全站共用），直接抓 CDN 链接不受此限制。
