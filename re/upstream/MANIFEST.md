# 上游抓取物清单（MANIFEST）

> **这里只列"能重新拿到的东西"** —— 二进制与第三方源码不进仓库（版权 + 体积），
> 但必须留下**可复现的凭据**：下载地址、SHA256、以及"当初用它得出了什么结论"。
> 结论已沉淀进 `SOURCES.md`（`docs/community-code-scan.md` 已于 2026-10-11 删除，见 git 历史），本文件负责**复现路径**。
>
> 2026-10-09 清理：这些文件累计约 32 MB，全部从仓库与工作目录删除（可再生）。
> 需要重跑分析时执行 `bash re/upstream/fetch.sh`，再核对 SHA256。
>
> **2026-10-20 复核**：11 个官方工具/软件已重新下载并逐项对照（设备表 / CPI 常量 /
> 版本资源 / WE Cfg.ini / XM1 主程序），结论见 `VERIFY-2026-10-20.md`，
> 复现脚本 `verify_official_data.py`（零依赖，不一致时返回非零）。
> 复核发现：4k 工具的设备表是**10 字节步长的数据记录**而非 `push` 立即数，
> 只扫指令（`tool8k_pids.py`）会漏掉变体 PID；8k v2 的官方资产已由 zip 改为 exe。

## 一、官方配置工具（VID/PID 设备表的来源）

| 本地文件名 | 来源 | SHA256 | 用来得出 |
|---|---|---|---|
| `XM2w-4k_tool.exe` | `EndgameGear/XM2w-4k` @ `Firmware_1.10` → `Endgame.Gear.XM2w.4k.Configuration.Tool.v1.04.exe` | `6e635fb5…380c` | XM2w 4k 设备表：`0x1968` / **`0x1967`** / `0x1970` / `0x1969` |
| `OP1w-4k_tool.exe` | `EndgameGear/OP1w-4k` @ `Firmware_1.10` → `Endgame.Gear.OP1w.4k.Configuration.Tool.v1.04.exe` | `5d8695b4…34c2d1` | OP1w 4k 设备表：`0x1972` / **`0x1971`** / `0x1970` / `0x1969` |
| `XM2w-4k-v2_tool.exe` | `EndgameGear/XM2w-4k-v2` @ `Firmware_1.03` → `Endgame.Gear.XM2w.4k.v2.Configuration.Tool.v1.01.exe` | `8d8d6d3d…c4f038` | v2 设备表：`0x1982` / `0x1981` |
| `OP1w-4k-v2_tool.exe` | `EndgameGear/OP1w-4k-v2` @ `Firmware_1.03` → `Endgame.Gear.OP1w.4k.v2.Configuration.Tool.v1.00.exe` | `d5e5e314…89538` | v2 设备表：`0x1984` / **`0x1983`** |
| `pf_tool.exe` | `EndgameGear/OP1-8k-Purple-Frost-LE` @ `Firmware_1.25` → `Endgame.Gear.OP1.8k.Purple.Frost.Limited.Edition.Configuration.Tool.v1.11.exe` | `b387001b…bcd1ed` | **Purple Frost = `0x1976`**（推翻旧结论） |
| `OP1-8k-v2_tool.exe` | `EndgameGear/OP1-8k-v2` @ `Firmware_1.04` → `Endgame.Gear.OP1.8k.v2.Configuration.Tool.v1.00.exe` | `00ee4b20…5be9fc` | OP1 8k v2 = `0x1978` |
| `endgame-gear-xm2-8k-configuration-tool.v1.12.exe` | `EndgameGear/XM2-8k` release（v1.12 配置工具） | `580a47db…b3c7dfe` | XM2 8k = `0x1966` |
| `Endgame_Gear_OP1_8k_Configuration_Tool_V1.12.exe` | `EndgameGear/OP1-8k` release（v1.12 配置工具） | `128478d3…127069` | OP1 8k = `0x1964` |
| `Endgame.Gear.XM2.8k.v2.Configuration.Tool.v1.01.exe` | `EndgameGear/XM2-8k-v2` @ `Firmware_1.04`（2026-10-20 复查：官方资产已由 v1.07 zip 改为 v1.01 exe） | `29a5cb3a…cffe0fcbe0` | XM2 8k v2 = `0x1980` |
| `Endgame.Gear.OP1.8k.v2.Configuration.Tool.v1.00.exe` | `EndgameGear/OP1-8k-v2` @ `Firmware_1.04`（同上，zip → exe） | `00ee4b20…92355be9fc` | 交叉验证 `0x1980` / `0x1978` |

> 前四个设备的表是"每款工具都列 4 个 PID"（鼠标 / 鼠标变体 / 接收器 / 接收器变体），
> 这条规律本身就是"变体不能用同 PID 猜"的依据。

## 二、厂商软件（不可从 GitHub 再下）

| 本地文件名 | 来源 | SHA256 | 说明 |
|---|---|---|---|
| `xm1_main.exe` | **用户本机** `E:\IDM\Compressed\XM1 Configuration Software V1.09\` 内的主程序（InstallShield 解包所得） | `941c7c3b…a6941605f` | XM1 协议的唯一一手来源。用户原始安装包仍在自己的 E 盘，**仓库不保留副本**；需要重做 XM1 分析时从那份安装包解包即可 |

> 官方 WE 系列配置工具与 Electron 工具（XM1r / OP1 / OP1 RGB）体积 400 MB+，
> 2026-10-09 已清理；只保留了从中提取的 `we_series_cfg.ini` 与 `family4_comtype.txt`
> （体积 KB 级，无法再生 —— 官方 CDN 安装包若下架就没了）。

## 三、第三方社区源码（`_src/`，已删）

| 仓库 | 许可证 | 用来得出 |
|---|---|---|
| `niansa/UnofficialEGGMouseConfig` | **Unlicense**（公有领域） | 8k 1041B 结构体定义、按键 7×7B、`custom_flags@126` |
| `Creationsss/egctl` | AGPL-3.0（**只取事实，不抄代码**） | 8k 偏移与命令、独立验证 `0x1978` |
| `lvlanson/Endgame-Gear-XM2-8k-v2-Linux-Configurator` | 无 LICENSE（只读参考） | XM2 8k v2 = `0x1980`（第三源） |
| `itchyfeetleech/OP1we-Control` | MIT | WE 族帧格式、opcode 白名单、`0x0E` 风险 |
| `qaustria/xm2w` · `Mannomatico/xm2ctl` · `FrancescoCiannavei/GO-BatteryAPI…` | MIT | WE 族常量交叉验证 |

复现：`git clone --depth 1 <repo>` 即可（URL 即上表所列仓库地址）。
本轮的 npm 侧发现（`@openmouse/protocol`，AGPL-3）同理：
`npm pack @openmouse/protocol` → `dist/endgame-gear/op1.js`、`dist/drivers/endgame/egg-we-hid.js`。

## 四、本仓库的抓取脚本

- `re/upstream/license_scan.py` / `license_raw.py` —— 许可证（走 API + raw 双通道）
- `re/upstream/sg_search.py` —— Sourcegraph 匿名代码检索（grep.app 429 的替代）
- `re/upstream/tool8k_pids.py` / `vidpid_hunt.py` —— 官方 exe 的 VID/PID 常量提取
- `re/upstream/fetch.sh` —— 按本清单重新下载并校验 SHA256
