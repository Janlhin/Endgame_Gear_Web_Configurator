# DECISIONS.md — 决策日志

> 追加式记录：被采纳的方案、被否决的替代方案、理由。
> **旧方案归档于此，不留在主文档里。**（通用规范 `<<docs-first>>` 的要求）
> 格式：决策 / 被否决的替代方案 / 理由 / 日期。

---

## 2026-10-09 · 未验证型号的写入策略：默认只读 + 点击确认解锁

- **决策**：所有未在真机验证的型号（8k 有线全族、XM2we/OP1we、第四族、未知 PID）
  默认只读；用户点写入时弹**原生 `confirm()`** 说明风险，确认后**自动导出备份**，
  并仅在**当次连接**内放行（`S.betaArmed` / `WE_WRITES_ENABLED`，断开即收回，不写本地存储）。
  8k 的导入与配对无论如何都禁用。
- **被否决的替代方案**：
  - 「永久只读，等有真机再说」—— 唯一持有这些设备的人（远程志愿者）无法参与验证，
    协议会永远停在"未验证"；
  - 「默认开放写入」—— 等于把未验证路径交给任何插上设备的人；
  - 「用 localStorage 记住许可」—— 许可过期后仍生效，风险不可控。
- **理由**：默认值必须安全，但**不能安全到让项目无法前进**。四件套
  （默认关 / 显式确认 / 强制备份 / 只管本次连接）在两个方向上都不放弃。
- **落地**：`src/connect.ts` 的 `guard4k()`、`src/xm2we.ts` 的 `writeRecord()`、
  回归由 `re/test_write_gates.ts`（19 项）钉住。

## 2026-10-09 · 项目改名 `endgame-gear-web-configurator`

- **决策**：仓库、目录、页面标题统一为 `endgame-gear-web-configurator`，
  中文名从「网页版驱动」改为「网页版配置器」。
- **被否决的替代方案**：
  - 保留 `xm2w-web` —— 工具早已覆盖 XM1 / XM2w / OP1w / XM2we / OP1we / 8k 全系，前缀已失真；
  - 用 `egg-web-configurator`（`package.json` 当时的值）—— 比全称短，但导出的
    `app: "endgame-gear-web-configurator"` 字段与全称不一致，易出现两套名字。
- **理由**：名字要与覆盖范围一致；短名留给 GitHub 仓库、页面用完整名会造成二次分裂。
- **落地**：改名当天暴露出四个回归脚本硬编码了绝对路径，已一并修掉（见下条）。

## 2026-10-09 · 回归脚本不再硬编码绝对路径

- **决策**：`re/{layout,i18n,render,reset}_check.py` 一律用
  `os.path.join(os.path.dirname(__file__), "..", "index.html")` 推导仓库根。
- **被否决的替代方案**：改完后一次性把路径更新为新目录 —— 下次改名会再次失效。
- **理由**：`build.mjs` 早就断言产物里没有绝对路径，但脚本层一直是漏的；改名把它翻了出来。
  同一类错误必须有第二条独立拦截路径。

## 2026-10-09 · CPI 规则以官方工具二进制为准

- **决策**：CPI 的分档规则**从官方配置工具的 x86 代码还原**：
  gen1 = `clamp[50, 26000]` + 对齐 50；gen2 = `clamp[10, 30000]` + 对齐 10（全程）。
  同时把 `0x1976` Purple Frost 的代际从 2 改回 **1**。
- **被否决的替代方案**：继续采用 `@openmouse/protocol` 设备表的说法
  （gen2 ≤10000 用 10、>10000 用 50）—— 那是 C 级证据，且针对 `0x1984`，
  本项目用户机型是 `0x1982`，当时属于外推。
- **理由**：用户直接质疑"官方有这些吗"，并要求"按官方设置来"。反汇编证明：
  gen1 与 gen2 是**同一处代码、同一偏移**，只有常量与除法魔数不同；
  官方代码里**根本不存在**「>10000 用 50」的分支；gen1 上限是 26000 而非 30000。
- **落地**：`src/blob.ts` 的 `cpiClamp(v, gen)` + `cpiInputBounds(gen)`；
  证据写在 `re/PROTOCOL_NOTES.md`「官方 CPI 规则」；`re/test_cpi_step.ts`（20 项）钉住。

## 2026-10-09 · 上游抓取物不入库，改用 MANIFEST + 复现脚本

- **决策**：官方工具二进制与第三方社区源码**不进仓库**（合计约 32 MB），
  改为 `re/upstream/MANIFEST.md`（URL + SHA256 + 它证明了什么）+ `fetch.sh`（一键重下并校验哈希）。
- **被否决的替代方案**：
  - 把二进制提交进仓库 —— 体积、版权、审计成本都不可接受；
  - 只在文档里记 URL 不做校验 —— 无法证明"重新拿到的还是同一个东西"。
- **理由**：可复现性与仓库体积是两件事；哈希让"重新推导"可被验证，而不是靠信任。
- **落地**：已实测 `fetch.sh` 六个文件全部 `ok`（哈希一致）。

## 2026-10-09 · 测试清单以 Markdown 为唯一真相源，构建时渲染进页面

- **决策**：`docs/test-checklist.md` 是唯一真相源，`tools/md2html.mjs` 在构建时
  把它渲染进 `index.html` 的折叠卡（`#cardChecklist`）。
- **被否决的替代方案**：
  - 另做一个 `docs/checklist.html` —— 两份内容必然漂移；
  - 只留 Markdown 不进页面 —— 志愿者拿到的是单文件工具，仓库对他们不可见。
- **理由**：通用规范「生成优于校验」：能由源生成的就不要事后检测不一致。

## 2026-10-09 · 测试框架暂不迁移到 Vitest

- **决策**：保留自研 `re/run_test.mjs` + 6 个测试文件（190 项断言），本轮**不**迁移 Vitest。
- **被否决的替代方案**：立刻迁移到 Vitest + 覆盖率阈值 —— 通用规范要求，
  但需重写约 820 行测试并重新确定阈值，属独立工作项。
- **理由**：迁移本身不产生新的拦截能力（现有断言已覆盖写入闸门、协议几何、CPI 规则、
  数据包完整性）；在没有覆盖率数据前定阈值只会拍脑袋。
- **状态**：**待决** —— 迁移与阈值需在下一轮单独提案，届时先跑一次覆盖率基线。

## 2026-10-09 · TypeScript 从 strict:false 改为 strict:true（类型通道此前基本是关着的）

- **决策**：`tsconfig.json` 开启 `strict`（含 `noImplicitOverride`、`noFallthroughCasesInSwitch`、
  `forceConsistentCasingInFileNames`）。开启时的 86 个错误全部修掉，**没有用 `any` 掩盖**。
- **被否决的替代方案**：
  - 保持 `strict: false` —— 原文件里连 `noImplicitAny` 都是 false，等于"引入了 TypeScript 但没开类型检查"；
  - 开启后用 `as any` 批量压掉 —— 那是把刚打开的通道又关掉，自欺欺人。
- **理由**：方案把「类型与实现不一致」列为 AI 高发的第一类缺陷，而这条通道此前是关的。
  代价只有 86 个错误、集中在两类：`catch` 变量的可空性（33 处）与隐式 any 参数（79 处）。
- **落地**：新增 `src/err.ts` 的 `errMsg()/errCode()` 做**收窄**（不是 any）；
  事件参数统一标注 `(e: Event)` 并对 `target` 收窄；多语言表声明为 `Record<string, string[]>`。
- **渐进策略**：`noUncheckedIndexedAccess`（当前 77 个错误）与
  `exactOptionalPropertyTypes` 等选项**暂不开启**。原因是 blob 解析里有大量 `b[14]` 形态的索引访问，
  一次改 100+ 处会让提交失去可审查性（方案要求单提交 ≤400 行且只服务一个意图）。
  代价已量化并写在 `tsconfig.json` 的注释里，之后逐项单独提案。

## 2026-10-09 · WebHID 类型声明：手写最小 `.d.ts` 而不装 `@types/w3c-web-hid`

- **决策**：新增 `src/types/webhid.d.ts`，按 W3C 规范 IDL 手写 `HIDDevice` / `HIDCollection` /
  `HIDReport` / `HIDInputReportEvent` / `HID` / `Navigator.hid` 六个最小声明。
- **被否决的替代方案**：装 devDependency `@types/w3c-web-hid`。
- **理由**：本轮明确承诺"不引入新依赖"。这六个接口就是规范子集、形状取自
  https://www.w3.org/TR/webhid/ ，不是自创；代价是引入了 `@types/w3c-web-hid` 之后可以删掉本文件。
  另外发现 TypeScript 的 `lib.dom.d.ts` **不含** WebHID —— 这也是 `strict` 下所有
  接 HIDDevice 的参数退化成隐式 any 的根因。
- **顺带移除的绕过**：`src/main.ts` 里的 `(navigator as any).hid` 现在可以写成 `navigator.hid`。

## 2026-10-09 · 校验入口分层：本地 `verify` 与 CI 的 `verify:ci`

- **决策**：`verify` = check + test + check:i18n + **check:ui** + build（本地唯一验收入口）；
  另加 `verify:ci` = 前四项去掉 Windows-only 的 `check:ui` + build（跨平台子集）。
- **被否决的替代方案**：让 CI 在 ubuntu 上跑完整 `verify` —— `check:ui` 依赖 Windows 预装的
  `msedge.exe` 与 python（`re/*.py` 是无头浏览器演练），在 ubuntu 上必然失败；
  也不接受"CI 里跳过 check:ui"。
- **理由**：方案要求「不同时间点执行、不相互豁免」。因此 CI 拆成两个 job：
  `verify`（ubuntu，跑 `verify:ci` + 产物断言 + commit message 校验）与
  `ui`（windows-latest，跑四个无头浏览器检查）。**两条通道都跑，谁都不跳过谁。**
