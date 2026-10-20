# 非官方功能审计（2026-10-20）

> 目的：按你的要求，把**项目里有、官方工具没有**的功能全部列出来，附代码位置、
> 官方证据与风险，供你逐项决定「保留 / 收紧 / 移除」。
> **本轮只审计，不改任何代码。**
>
> 官方证据来源：`re/upstream/` 下 6 款 4k/PF 工具 + 4 款 8k 工具（2026-10-20 重新
> 下载并校验哈希，见 `VERIFY-2026-10-20.md`）。方法：提取资源段 UTF-16/ASCII
> 字符串（MFC 的对话框标签、按钮文案、RTTI 类名）+ 既有 `docs/field-parity.md`。

## 一、结论先说

1. **官方工具的功能面比项目文档此前记录的大**：除 Basic/Advanced/Power/Button Mapping/Pairing
   五页外，还有 **LED 灯效、左手模式、Surface Calibration、CPI LOOP、多配置档案、固件升级**。
2. 项目里「官方没有」的功能共 **16 项**，但按风险分只有 **4 项需要你定夺**：
   **JSON 导入、XY 独立 CPI、XM1 回写类（回退 + 回声）、WE 写入路径**。
3. 其余 12 项是展示/只读/诊断类，**零协议写入风险**，删掉只会降低可用性，不会提高安全。
4. 另有 8 项是「官方有、项目没有」（不是非官方功能，是未实现），列在第四节，
   避免把「缺功能」误当成「砍功能」。

## 二、官方功能面（带证据）

| 官方页面/功能 | 证据（二进制内字符串 / RTTI） |
|---|---|
| Basic Settings | `Basic Settings`、`CPI 1..4`、`CPI Levels`、`Angle Snapping`、`Disable LED on Lift-Off` |
| Advanced Settings | `Advanced Settings`、`Apply CPI settings`、`CPI LOOP` |
| Power Settings | `Power Settings`、`Enable Deep Sleep`、`1000Hz (Power Saving)`、`2000/4000Hz (no Power Saving)` |
| Button Mapping | `Button Mapping`、`Enter a key:`、`Left/Back/Forward Button Multiclick Filter` |
| Pairing | `Pairing`、`Pair Dongle`、`Pair Default`、`Get pair data`、`CPair` |
| LED 灯效 | `LED effect`、`DPI led`、`COLOR`、`Apply led settings`、`CLedDlg` |
| 多配置档案 | `Add_profile`、`Copy_profile_data`、`Delete_profile`、`Get_number_of_profiles_in_mouse`、`Get_current_profile_id` |
| 左手模式 | `Left-handed Mode` |
| 表面校准 | `Surface Calibration` |
| 恢复出厂 / 单档案重置 | `Factory Reset`、`Reset_factory_default`、`Reset_profile_default` |
| 固件升级 | `Update_firmware`、`Firmware_update_progress`、`UEndgame Gear 4k Dongle Firmware Updater` |
| 状态显示 | `Battery Level:`、`Mouse Firmware Version:`、`Dongle Firmware Version:` |

> 这解释了一个常见误解：「官方只有 28 个设置项」是**旧结论**——那只统计了
> 可调字段，没算页签级功能（档案、灯效、校准、升级）。

## 三、项目有、官方没有（16 项，按风险分级）

### C1 展示 / 只读 / 诊断（零协议风险，共 12 项）

| # | 功能 | 代码位置 | 说明 |
|---|---|---|---|
| 1 | 8 语言界面（简繁/英/德/法/西/日/韩） | `src/i18n.ts` + `src/i18n/*` | 官方只有单语言 Windows 工具 |
| 2 | 深/浅主题切换 | `main.ts` `applyThemeButton()` | 纯 CSS 变量 |
| 3 | 型号布局预览 `#layout=` | `layout.ts:181` | 只改显示，不连设备 |
| 4 | 设备丢失演练 `#simulate=lost` | `main.ts:575` | 只跑复位路径，无 I/O |
| 5 | 每个设置一句话说明 | `render.ts` `renderHelp()` | 官方滑杆无任何说明 |
| 6 | 场景预设（FPS/MOBA/桌面/绘图） | `render.ts` `renderHelp()` | 只填表单，不写设备 |
| 7 | 通讯日志面板（hex 级） | `main.ts` `btnLog` / `util.log` | 只读日志 |
| 8 | 参与测试清单卡片 | `index.template.html:207` | 构建时把 md 渲染进页面 |
| 9 | 致谢与参考卡片 | `index.template.html:216` | 静态内容 |
| 10 | JSON 配置导出（含 hex） | `main.ts` `btnSave` | 只读 blob + 下载 |
| 11 | 原始 1024B blob 导出 `.bin` | `main.ts` `btnBlob` | 只读 |
| 12 | 诊断包 `.json`（型号/固件/集合/blob/日志） | `main.ts` `btnDiag`、`diag.ts` | 只读 |
| 13 | WE EEPROM 导出 txt/json | `xm2we-ui.ts` `btnWeExport/btnWeExportJson` | 该族只读 |
| 14 | 离线 blob 分析器 | `tools/blob-studio.template.html` | 独立页面，不连设备 |
| 15 | 设备信息卡（VID/PID/全部集合） | `render.ts` / 模板 `cardInfo` | 只读 |
| 16 | 写入互斥 + 实验写入确认（`S.writing` / `betaArmed`） | `state.ts` / `connect.ts` | **安全阀**，不是功能 |

> 这 12 项里没有任何一项会多发一条报文。删它们等于砍掉「跨平台、可自查、
> 可备份」这三个官方本就没有的价值。

### C2 写操作，官方无对应（4 项，需你定夺）

| # | 功能 | 代码位置 | 写什么 | 官方行为 | 风险 |
|---|---|---|---|---|---|
| 17 | **JSON 配置导入并写入** | `main.ts` `btnLoad`（`fileLoad`） | `0x14` + `0x15` + `0x16`×2，一次四条 | 官方**没有**导入功能 | **中**：只校验 gen，不校验型号；同代跨型号可互导 |
| 18 | **XY 独立 CPI** | `blob.ts` `p[o]=xyOn`；`i18n.ts` `xyHint` | `0x14` 每档的 XY 使能位 | 官方每档只有一个输入框（X=Y） | **低-中**：2026-10-09 真机验证过手感生效，但该位官方从不置 1 |
| 19 | **XM1 快照时间线 + 一键回退** | `main.ts` `btnXm1Undo`、`device-xm1.ts` `xm1Snapshot` | 最多 20 份 blob，写回走 23 字节白名单 | 官方无快照/回退 | **中**：每次回退都是一次真实 EEPROM 写 |
| 20 | **XM1 原样写回测试** | `main.ts` `btnXm1Echo`、`writeBlobXm1` | 原样写回刚读到的 blob | 官方无此测试入口 | **中**：有白名单兜底，但面向普通用户暴露了测试入口 |
| 21 | **WE 族写入路径（默认关闭）** | `xm2we.ts` `writeRecord`；`WE_WRITES_ENABLED=false` | EEPROM 记录写 + 回读 | 官方 WE 工具有写 | **高（若启用）**：从未真机验证；当前是死代码 |
| 22 | **未验证型号实验写入开关** | `connect.ts` `armBeta()` | 仅授予「本次连接可写」 | 官方无此概念 | 低：这是保护机制，建议保留 |

> 补充：#21 严格说不算「官方没有」（官方 WE 工具会写），但**本项目的实现**未经验证，
> 且默认关闭。要么保留为「将来启用」，要么删掉降低风险面。

### 不属于「非官方功能」但容易混淆的一项

- **8k 整块写（`0x11`）**：官方工具同样这么写，所以不是「非官方功能」；
  但本项目的实现没有真机验证，因此默认只读 + 点确认才放行。**这是闸门，不是多余功能。**

## 四、官方有、项目没有（8 项，供对照，不建议现在补）

| 官方功能 | 项目现状 | 补齐的代价/风险 |
|---|---|---|
| LED 灯效 / DPI 灯 / RGB 颜色 / 亮度 | 只显示部分，不可编辑 | 偏移未取证，需差分；4 类控件 |
| 左手模式 | 偏移已知（blob `0x37`），UI 未开放 | 低风险，但需真机确认 |
| 按键重映射编辑器 | 协议层 `0x16` 已实现，UI 只读 | 中高：双块写 + 键码表 |
| 多配置档案（Add/Copy/Delete） | 无 | 高：档案结构与切换命令未解 |
| CPI LOOP | 无 | 中：循环切换语义未验证 |
| Surface Calibration | 无（笔记确认未找到协议路径） | 高：未知 |
| 固件升级 | 明确不做（.fub 加密，刷坏风险） | 极高，且项目红线已排除 |
| 单档案重置（Reset_profile_default） | 无（只有整机恢复出厂 `0x13`） | 中：命令未定位 |

## 五、决策表（请逐项标记）

| # | 功能 | 我的建议 | 可选动作 |
|---|---|---|---|
| 17 | JSON 导入 | **收紧**：加型号/PID 校验 + 二次确认 + 写前自动备份 | ☐ 保留原样 ☐ 收紧 ☐ 移除 |
| 18 | XY 独立 CPI | **保留**，UI 标注「非官方（已真机验证）」 | ☐ 保留 ☐ 标注 ☐ 移除 |
| 19 | XM1 回退 | **保留**（事故恢复手段），默认折叠 | ☐ 保留 ☐ 折叠 ☐ 移除 |
| 20 | XM1 回声测试 | **收紧**：改成「高级/诊断」入口，加显式警告 | ☐ 保留 ☐ 降级入口 ☐ 移除 |
| 21 | WE 写入代码 | **保持关闭**（现状），或删除降低风险面 | ☐ 保留关闭 ☐ 删除 ☐ 启用（不建议） |
| 1–16 | 展示/只读/诊断 12 项 | **全部保留** | ☐ 保留 ☐ 个别移除（请注明） |

## 六、复现证据

```bash
cd re/upstream
bash fetch.sh
python - <<'PY'
import re
d=open("XM2w-4k-v2_tool.exe","rb").read()
t=d.decode("utf-16-le","ignore")
for kw in ("LED effect","Left-handed","Add_profile","Surface Calibration","CPI LOOP","Factory Reset"):
    print(kw, kw in t)
PY
```

> 字符串提取可能混入 MFC 内部符号；上表只采信「完整 UI 文案」形态的命中
> （如 `LED effect`、`Left-handed Mode`），不采信 `CMFC*` 之类的类名。
