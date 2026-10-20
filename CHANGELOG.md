# 变更记录

本项目从 v1.3 起记录变更。更早的版本看 git 历史（`git log --oneline`）。

## Unreleased

### 2026-10-20 — 设备仪表盘（连接后首屏重构）

- 设备信息卡改为 hero：左侧设备主视觉、中间型号与固件芯片、右侧电量环
  （`pathLength=100` 归一化，电量由 `render.ts` 直接写偏移量），下方三格指标
  （CPI / 回报率 / 档位）。只读展示，不影响任何写入闸门。
- XM1 与 XM2we 复用同一套 hero；XM1 隐藏电量环与接收器芯片（原有 layout 规则不变），
  XM2we 用链路/电量芯片。
- 新增 `render.ts` 的 `paintBattery()` / `metric` 写入点；未连接、只读、第四族一律显示 `—`，
  不伪造 0%。
- 体积预算 320 → 325 KB（增量 1.7 KB，纯自有 HTML/SCSS/TS）。

### 2026-10-20 — 有线 4k 鼠标误路由到 XM2we 族（`Failed to write the feature report.`）

- **判族修复**：`isXm2weFamily` 改为三层判据 —— PID 表优先（`0x1960`/`0x1961`/`0x1962`）；
  已知 4k/8k PID 与 XM1 VID 一票否决；未知 PID 仅当 FF02 集合声明 report `0x08`
  （Chrome 155+ 的 `featureReports`/`outputReports`）才认。根因：4k 鼠标 `0x1982`
  的厂商接口同样带 FF02 集合，旧判据把它送进 WE 协议，`sendFeatureReport(0x08)`
  找不到承载句柄，Chromium 抛 `NotAllowedError`。
- **键盘闸门改策**：指针集合仍无条件拒绝；键盘集合仅在与已知厂商配置集合
  （FF01:02 / FF02 / FFA1:00A5）共存时放行并给出警告。Chrome 155 起同一 USB 接口的
  顶层集合合并成一个 HIDDevice，有线 4k 鼠标必然带键盘集合，旧的一刀切等于禁掉
  全部有线配置。新增 `bKeyboardMerged` 八语言词条。
- **审计修复**：`DeviceFilter.usagePage` 是精确匹配，原回退列表 `{usagePage: 0xFF00}`
  恒为空 → 改为厂商区间 FF00–FFFF 逐页展开；OP1we 有线（`0x1962`）不再被标成 2.4G；
  `rawReceive` 尊重 `DataView.byteOffset/byteLength`；新增写入互斥 `S.writing`，
  导入失败回滚 `S.blob`。
- **文档**：README 两版、发布安全审计、FAMILY4 备注同步；新增
  `docs/audit-2026-10-20.md`（代码/架构审计报告）；DECISIONS 判例二十三。

### 2026-10-11 — 仓库整洁化（接手审查整改）

- **删除 11 个一次性过程文档**：docs/ 下 9 个（推送前需授权 / 接手报告 /
  push-to-github / scan-push-plan / publish-inventory / community-code-scan /
  community-help-needed / email-to-endgamegear / ui-port-feasibility）+
  re/ 下 2 个探查产物（usb_enum.txt / webhid-probe.html）。任务均已终局，
  git 历史可找回（DECISIONS.md 判例二十一）。
- **TODO.md 并入 TASKS.md**，消除双队列；活待办转为 T-121~T-125，
  覆盖率总览与「明确不做」硬边界随迁（DECISIONS.md 判例二十二）。
- 引用同步：README / MANIFEST / re/upstream/MANIFEST / TASKS 中指向已删
  文件的活引用改为指向 git 历史；T-106 状态更新为「CI 全绿」；T-113d 作废。

## v1.3.0 — 2026-10-09

发布前的安全审计 + 项目改名。这一版不含固件升级，也不绕过任何保护机制。

### 修正（有证据的）

- **OP1 8k Purple Frost 的 PID 是 `0x1976`，不是 `0x1964`**。官方 LE 专属配置工具
  v1.11 的二进制里只有一对 VID/PID 立即数（`push 0x1976` + `push 0x3367`），
  niansa/UnofficialEGGMouseConfig 与 @openmouse/protocol 两个独立实现也记 `0x1976`。
  旧结论"限定版与普通版共用工具所以同 PID"是推测，已推翻。
- 逐款扫描官方工具的设备表，补齐三个原先没有的变体 PID：`0x1967` / `0x1971` / `0x1983`
  （每款 4k 工具都列 4 个：鼠标 / 鼠标变体 / 接收器 / 接收器变体）。
- `0x1969` 与 `0x1970` 同属接收器族，此前被当成有线鼠标，会跳过唤醒探测 —— 已修正。
- CPI 归一化改为**直接照官方配置工具二进制**定规则（六款工具反汇编还原，
  见 `re/PROTOCOL_NOTES.md`）：gen=2 全程对齐 10、下限 10、上限 30000；
  gen=1 与 XM1 对齐 50、下限 50、**上限 26000**。此前按第三方设备表做的
  「>10000 改用 50」分段在官方代码里并不存在，已删除。
- Purple Frost（`0x1976`）的代际从 2 改回 **1** —— 官方 PF 工具的 CPI 代码是 ÷50 那一套。
- WE 族文档笔误：opcode `0x07` 写 / `0x08` 读（代码一直是对的）。
- 四个 UI 回归脚本不再硬编码 `index.html` 的绝对路径，改为按脚本位置推导。

### 安全

发布前逐条走写入路径，查出三个"看着安全、实际敞开"的地方，已全部修复并由
`re/test_write_gates.ts`（19 项断言，不接硬件即可验证）钉住：

- **WE 族（XM2we / OP1we）的写入原本是开着的**，且界面无任何提示 —— 该族从未接过真机。
  它确实有记录级回读校验，但那只证明"设备按我们发的字节存了"，证明不了编码语义正确。
- **8k 有线族的只读只做在界面上**：`guard4k()` 对 8k 放行，`apply8k()` 会真的发
  `0x11` 整块写。
- **导入配置只校验长度**，不校验代际 —— v2 的配置会被按 v1 的编码写进去。

未验证型号现在统一为：**默认只读 → 点写入弹确认（说明风险）→ 确认后自动导出备份 →
仅当次连接放行**（断开/刷新即收回，不写进本地存储）。8k 的导入与配对无论如何都禁用。

### 新增

- **一键「导出测试数据包」**：型号 / VID·PID / 接口集合 / 固件 / 完整 blob
  （WE 族为 EEPROM 转储）/ 通讯日志 + 一份回报模板，供远程志愿者一次性发回。
- **测试清单内嵌进 `index.html`**（`tools/md2html.mjs` 在构建时渲染
  `docs/test-checklist.md`，Markdown 仍是唯一真相源）。
- 8k 族偏移表冻结进 `re/PROTOCOL_NOTES.md`：13 个偏移、四源交叉印证、两处已知冲突。

### 变更

- 项目改名 **`endgame-gear-web-configurator`**（原目录 `xm2w-web`）——
  工具早已覆盖 XM1 / XM2w / OP1w / XM2we / OP1we / 8k 全系，旧前缀不再准确。
- 清理 32 MB 可再生的抓取物（官方工具二进制、第三方社区源码），
  改由 `re/upstream/MANIFEST.md`（URL + SHA256 + 它证明了什么）与 `fetch.sh` 维持可复现性。

### 仍未解决

- **需要我们手上没有的硬件**：8k 全族写入验证、XM2we/OP1we 真机、第四族字段布局。
- **两处冲突按设计保持未定论**：角度调校在 blob `0x01` 还是 `0x70`；
  `custom_flags@126` 与 `glassMode@127` 位置重叠。
- XM1 的灯效 / 按键映射 / Angle 仍待差分实验定位（实验包见 `docs/xm1-diff-kit.md`）。

---

## 未发布 · 发布前修正

- 仓库 / npm 包名 / 产物内的应用标识改为 **`Endgame_Gear_Web_Configurator`**，
  与账号内其余四个仓库的命名风格一致（PascalCase + 下划线）。详见 DECISIONS.md 同日条目。
