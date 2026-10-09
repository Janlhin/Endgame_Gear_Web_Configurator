# TASKS.md — 任务队列

> 依据《用 AI 做项目：持续推进行动方案》v1.0.1 §任务队列 建立。
> 来源：`docs/接手报告-2026-10-09.md` 的差距清单（由接手规范阶段 2 产出）。
> 建立时点：2026-10-09接手基线完成后。
> 字段定义见持续推进方案 §任务队列，七个字段缺一不可；「完成判据」必须可机器判定。

---

## 裁决状态（2026-10-09，四项已裁决）

| 裁决项 | 结论 | 影响任务 |
|---|---|---|
| 是否推送远端 | **已搁置**（2026-10-09 用户决定「不弄 GitHub 了，弄项目先」） | T-106 转为搁置，不再占用队列首位 |
| 补齐哪些工具链 | **四项 lint**（文档 lint / Husky / ESLint / Stylelint），**不引入 Vitest 与 Playwright** | T-101✅ T-102✅ T-103✅ T-104 待办；T-108 只测基线 |
| `any` 收敛范围 | **只收协议边界**（`connect.ts` / `device-8k.ts` / `device-xm1.ts` / `blob.ts`），`diag.ts` 不动 | T-109 解除范围歧义 |
| 一次性脚本处置 | **逐个评估后归档**，不删除 | S-101 解除阻塞 |

四项结论已记入 `DECISIONS.md`「接手基线」条目，**形成判例，同类事项不再重复询问**。

### 新增决策（2026-10-09，T-103 过程中）

| 决策 | 结论 | 依据 |
|---|---|---|
| TypeScript 7 与 ESLint 如何共存 | **官方双编译器方案**：`typescript` → `@typescript/typescript6@6.0.2`（供工具读 API），`@typescript/native` → `typescript@7.0.2`（供 tsc 命令） | typescript-eslint 8 的 peer 上限 `<6.1.0`，与 TS7 无交集；上游 issue #12518 已关闭为 "not planned"，修复在 TS 7.1 侧。**不能用 `--force` 绕过**——那只是让 npm 跳过检查，缺失的 API 依然缺失 |
| `no-explicit-any` 的级别 | **warn + `--max-warnings 154` 阈值**，非 error | 直接设 error 会让 verify 与 CI 立刻永久红，而「让门禁常红」等于把门禁关掉，主规范同样禁止。阈值机制已实证能拦住新增 |

---

## 搁置与阻塞

| 任务 | 状态 | 说明 |
|---|---|---|
| T-106 | ⏸ **进行中**（2026-10-09 晚） | 用户指令「推」= 判例一要求的显式确认，已收到。推送已尝试两次，均被 GitHub 以 `without workflow scope` 拒绝（错误逐字相同，排除偶发）。令牌 scope 实测为 `gist, read:org, repo`，**确实缺 `workflow`**。`gh auth refresh -s workflow` 已启动（设备码 `53E8-E16A`），**待用户在浏览器完成授权**——此步须人操作，我无法代劳。远端零对象、未污染，可放心重试。详见 `docs/推送前需授权.md` 路线 A。**推成功即上线**（`deploy.yml` 对 `push: main` 自动触发 Pages），用户已知悉 |

### T-106 推送受阻记录（2026-10-09，已尝试两次）

**已解除的阻塞**：判例一要求推送前需显式确认——已确认（用户直接给出推送命令）。

**遇到的阻塞**：`git push -u origin main` 被 GitHub 拒绝：

```text
! [remote rejected] main -> main (refusing to allow an OAuth App to create
  or update workflow `.github/workflows/deploy.yml` without `workflow` scope)
```

**性质**：凭据授权限制，**不是代码或配置问题**。当前令牌缺 `workflow` scope，
而 `.github/workflows/` 下的 `verify.yml` 与 `deploy.yml` 均需该权限。

**推送前已完成的检查**（全部通过）：

- 远端可达（HTTP 200），确认仓库存在但为空，从未推送过
- 工作树干净
- 无大文件（>1MB）被追踪
- 无 `*.exe` / `*.bin` / `*.zip` 等第三方二进制泄露（`re/upstream/*.exe` 已被 .gitignore 正确排除）
- 无凭据文件（唯一命中的 `scss/_tokens.scss` 是样式变量，非敏感）

**失败的替代方案及原因**：曾考虑「排除 workflow 文件先推代码」——
被否决，因为那会让 CI 与 Pages 部署**完全失效**，且本地工作树需临时缺失
workflow 文件，属于用更大的问题换小问题。

**解除方式**（若将来重启）：给令牌加 `workflow` scope（重新授权 OAuth App，
或改用 Personal Access Token），之后重试推送。**此项必须由人操作。**
步骤见 `docs/推送前需授权.md`。

**2026-10-09 第二次尝试（同日，用户指令「推」）**：错误**逐字相同**，实测结论更新——

- 排除偶发解释（令牌已改 / 网络抖动）：两次拒绝原因完全一致。
- **⚠️ 更正本轮早先的误判**：先前记「本机未安装 `gh` CLI」**不成立**——
  `gh` **已安装**（v2.102.0，winget，`C:\Program Files\GitHub CLI\gh.exe`），
  只是**不在 Git Bash 的 PATH 里**，而检测在 bash 中做。PowerShell 可正常调用。
- **令牌 scope 实测**（`gh api -X GET user -i` 读 `X-OAuth-Scopes`）：
  `gist, read:org, repo` —— **确实缺 `workflow`**，这是被拒的直接原因，
  属数据侧证据，非推测。
- 远端经 `git ls-remote origin` 复核为**零对象**，两次拒绝均发生在传输完成前，
  **未污染远端**——可放心重试，不会留下半推送状态。
- 待推送提交数 119；工作树干净；体检全过（大文件 / 第三方二进制 / 凭据 三项均为空）。
- 阻塞性质不变：**凭据授权，非代码或配置问题**，须人经浏览器完成。
  `gh auth refresh -s workflow` 已启动设备码流程，**待用户在浏览器授权**。

**推成功后的连带效应**：`deploy.yml` 对 `push: main` 自动触发 Pages，**推送即上线**。

**可执行项统计**：T-104、T-105、T-107～T-111、S-101～S-103 共 **12 项可执行**
（T-101/102/103 已完成，T-106 已搁置），满足持续推进方案「队列中始终 ≥ 3 项可执行」的要求。**无真阻塞。**

---

## 已完成任务的实测结论（供后续任务参考）

### T-101 markdownlint 接入的三条工具行为（踩过的坑）

1. **`ignores` 不可用于排除**——它与默认 glob 求交集，写成排除式会把匹配文件全部过滤掉
   （`"ignores": ["node_modules/**"]` → `Linting: 0 files`）。改用 `globs` 正向列举。
2. **`overrides` 对 globs 匹配到的文件不生效**（0.23.3 实测）——改用目录级
   `.markdownlint.jsonc`。**注意它是替换而非合并**，全局豁免项须在两处各声明一遍。
3. **`markdown-link-check` 在本机网络下不可用作门禁**——对 MANIFEST.md 报5 条死链，
   但 `git ls-remote` 复核确认四个仓库全部真实存在（返回 504/403/0）。
   接入会造成持续假失败，且会诱导人删掉真实存在的来源登记。

这三条对后续接入 ESLint / Stylelint 有直接参考价值：**先小步验证工具行为，再接进门禁**。

---

## 排序说明

按持续推进方案 §排序规则：**可执行 > 可逆性 > 依赖数 > 价值**。
当前可执行项共 **10 项**（≥ 3，满足推进方案对队列的要求）；**接手期不存在真阻塞**。

---

## 任务队列

| ID | 目标 | 动作 | 依赖 | 可逆性 | 完成判据 | 状态 |
|---|---|---|---|---|---|---|
| T-101 | 文档层有 lint 通道 | 加`markdownlint-cli2` + `markdown-link-check` 两个 devDep，接入 `verify` 与 CI | 无 | 高 | `npm run verify` 通过；`markdownlint-cli2 "**/*.md"` 零error；CI绿 | ✅ **完成 2026-10-09**（`0bbb2b2` + `c18d42e`）。实测拦下 2 处真实文档缺陷：TODO.md 表格被换行截断、web-driver-extra-features 表格缺状态列。`markdown-link-check` 经复核**不接入**（网络假阳性，证据见 MANIFEST.md），降级为可选工具 |
| T-102 | 提交前有本地门禁 | 加 Husky + lint-staged + commitlint，接入 `pre-commit` / `commit-msg` | 无 | 高 | 故意写一条不符 Conventional Commits 的提交，`commit-msg` 必须拒绝；`npm run verify` 通过 | ✅ **完成**（`81b4a26`）。**lint-staged 未装**——本项目无格式化工具（Prettier 不在裁决范围内），无可暂存处理；`pre-commit` 直接跑 `tsc` + `markdownlint --fix`。已实测：违规提交被拒（exit 1，HEAD 未变）、类型错误被 pre-commit 拦住（TS2322） |
| T-103 | `any` 有 lint 拦截 | 加 ESLint flat config + `typescript-eslint`，`@typescript-eslint/no-explicit-any` 设为 `error` | 无 | 高 | `npm run lint` 对当前 82 处 `any` 报错（先配置不修）；`npm run verify` 其余段全绿 | ✅ **完成**（`3cef833`）。**解决了 TS7 冲突**：typescript-eslint 8 peer 上限 <6.1.0，本项目用 TS 7.0.2（Go 原生编译器，无编程 API）→ 采用官方双编译器方案（`typescript` → `@typescript/typescript6@6.0.2` 供工具读 API，`@typescript/native` → `typescript@7.0.2` 供 tsc）。实测 tsc=7.0.2 / tsc6=6.0.3。**实测 97 处 any**（比 grep 的 84 处更全，能识别 `<any>`/`any[]`）。规则分级：any 与 unused-vars 设 warn（直接设 error 会让 CI 永久红＝把门禁关掉），阈值 `--max-warnings 154` 拦截新增——**已实证注入新 any 后 lint 立即 exit 1** |
| T-104 | 样式硬编码有拦截 | 加 Stylelint + `stylelint-config-standard-scss`，含 `color-no-hex`（`_tokens.scss` 走 overrides 放行） | 无 | 高 | `npm run stylelint` 通过；故意在业务 SCSS 写一个字面量颜色，该命令必须失败 |  ✅ **完成**（`80b92de`）。Stylelint 17 + stylelint-scss + postcss-scss。verify 7→8 段。核心规则 `declaration-property-value-disallowed-list` 锁死业务样式硬编码（令牌表豁免）。**判据双向实测**：业务 SCSS 写 `#f00`/`rgba()` 被拦（exit 2），令牌表豁免生效。三处踩坑已记入 stylelint.config.cjs 顶部（配置必须 .cjs、需 customSyntax、17 移除了 15 个 stylistic 规则） |
| T-105 | esbuild 漏洞有结论 | 单独提交升级 esbuild 0.24.2 → 0.28.x，跑完整 verify 确认产物仍零外部引用 | 无 | 中 | `npm audit` 无moderate；`npm run verify` 全绿；产物外部引用计数仍为 0；`cardChecklist` canary 仍命中 |  ✅ **完成**（`5855c2d`）。esbuild 0.24→0.28.2（先读 CHANGELOG 确认破坏性变更不涉及）。安装遇 `spawnSync EBUSY`（本机沙箱环境问题），用 `--ignore-scripts` 绕过且二进制仍到位。产物 +9 字节已逐词确认语义等价。**moderate 归零**：`smol-toml` 靠 `overrides` 升到 1.9.0（上游 markdownlint-cli2 锁死 1.8.0）+ 实测 markdownlint 仍正常。剩余 13 个 high 已查证全在 devDependencies、产物命中 0 |
| T-106 | 首次获得 CI 权威结论 | 推送 119 个提交到 origin，观察首次 CI 运行 | **凭据授权**：OAuth App 令牌缺 `workflow` scope（2026-10-09 两次推送均被拒，见下方记录） | **低** | `verify` 与 `ui` 两个 job 在GitHub Actions 上均为绿；产物 canary 通过 | ⏸ **进行中**（2026-10-09 用户指令「推」，已确认推送；**阻塞于凭据授权——须人操作**，见 `docs/推送前需授权.md`） |
| T-107 | 文档与代码一致性有自动判据 | 加 `docs:sync` 生成脚本（从 `package.json` / `tsconfig.json` 生成文档中的脚本名与依赖表），接 `git diff --exit-code` | T-101 | 中 | 故意改 `package.json` 里一个脚本名，`npm run verify` 必须失败 |  ✅ **完成**（`9f5e82a`）。新增 `re/check_verify.mjs` + `check:meta`，作为 verify 第一段。verify 9 段。**含自指检查**（否则删掉 check:meta 本身无人察觉）。判据实测：删一段 → exit 1；删 check:meta 自己 → 同样报错。副产品：发现 verify:ci 少一段是**有意设计**（CI 有独立 UI job 且多跑 reset_check.py） |
| T-108 | 有覆盖率基线 | 引入覆盖率计量（c8 或 `node --experimental-test-coverage`），**只记录当前基线数字，不设阈值** | 无 | 中 | `npm run verify` 输出覆盖率数值；基线写入 `docs/`。**阈值待有数据后另行提案**（延续既有判例「测试框架暂不迁移到 Vitest」） |  🚫 **不可修复**（2026-10-09）。**实测证明拿不到有意义数字**：① NODE_V8_COVERAGE 记录的 URL 全是打包后的 `re/.test_*.mjs`，TS 源路径已丢失；② 加 sourcemap 后 `c8 --include="src/**"` 得 All files **0%**（c8 默认不做 source-map remapping）；③ 不带 include 能出数字但统计的是打包产物且**包含测试代码自身**。可行路径均代价过高（迁 Vitest 违反判例二 / 改 9 个测试加载方式 / main.ts 依赖 DOM 无法在 Node 跑）。详见 DECISIONS.md 判例十 |
| T-109 | 协议边界不再是 `any` | 收敛 `src/connect.ts`（6）、`src/device-8k.ts`（3）、`src/device-xm1.ts`（1）、`src/blob.ts`（1）。**`src/diag.ts` 及其他不动**（判例三） | T-103 ✅ | 中 | 该四文件 ESLint `no-explicit-any` 计数为 0；`--max-warnings` 下调对应数值；`npm run verify` 全绿；**`re/test_write_gates.ts` 仍全绿（写入闸门不得被削弱）** | ✅ **完成**（`50b5c3d`）。**any 97 → 85**，四文件归零且 `no-explicit-any` 在这四处升级为 **error**。做法：state.ts 新增 `Stage` / `Xm1Edit` / `Xm1Stage` / `StageButton` / `MinutesOrOff` 五个接口，取代散落的 any；`raw`/`unknown`/`unk7` 作为**安全机制载体**显式声明（删掉等于拆掉安全网）。类型通道当场抓出 3 个真实问题（详见下） |
| T-111 | 死代码清理（ESLint 新发现） | 逐个处理 53 项 `no-unused-vars` | 无 | 中 | 每个符号都有明确处置；`npm run verify` 全绿 |  ✅ **完成**（`07c1b40`）。49 处清除，`no-unused-vars` 升为 error。核实结论：每个符号在其他文件都有真实调用，故属拆分 main.ts 时的导入残留，只删导入名不动实现。**产物零变化**是死代码判定的决定性证据。另有 5 个符号由 T-110 的 knip 发现，已并入本任务待处置 |
| T-112 | `$()` 与 `S` 的类型收敛 | 收敛 `util.ts` 的 `$` 与 state.ts 的 `S` | T-109 ✅ | 高 | 两个入口均收敛为类型；tsc 零错误；any 计数与阈值同步下调；`npm run verify` 全绿 | ✅ **完成**（`d6decd7` + `1c5f73d`）。`$` 改为泛型 + 新增 `$el` 供静态元素；全局状态改为 `GlobalState` 接口，另加 `dev()` 与 `blob()` 两个契约访问器。**tsc 从 191 错 → 67 → 0**，any 97 → 81。类型通道抓出三处真实缺陷：**renderXm1 在失败路径会白屏**、四个开关字段类型声明错了（number→boolean）、webhid.d.ts 签名太窄 |
| T-110 | 死代码有自动检测 | 引入 `knip`，产出首份死代码报告 | 无 | 中 | `npm run knip` 可执行并输出报告；结论写入 `DECISIONS.md` |  ✅ **完成**（`82f35c4`）。knip 6.41 + knip.config.js。**裸跑结果几乎全是误报**（14 个「未使用文件」里 11 个是测试、4 个是 SCSS），配置声明入口后误报归零。两条环境坑：不认 .mjs 配置（被完全忽略）、rules 值不是描述字符串。**报告不作门禁**（exports 设 warn）——误报率高会诱导人忽略整个报告。已确认无人调用并记入 T-111：`confirmBeta`/`armBeta`/`pollAck8k`/`fillSelect`/`fwStr` |
| T-113 | 根级文档转英 | README.md / AGENTS.md / CHANGELOG.md 等 6 个根级文件的中文转英（D-1 全量转英第 1 批） | 无 | 高 | `npm run verify` 全绿；6 文件中文占比归零（取证链原文豁免） | ⬜ 待办 |
| T-114 | docs/ 转英 | docs/ 下 17 个文件的中文转英（保留 field-parity 等证据强度表述） | T-113 | 高 | `npm run verify` 全绿；docs/ 中文占比归零 | ⬜ 待办 |
| T-115 | re/ 结论文档转英 | PROTOCOL_NOTES.md / XM1_NOTES.md 等 6 个结论文档转英（保留「实测 3mm=0x0B」类证据强度） | T-113 | 高 | `npm run verify` 全绿；6 文件中文占比归零（证据原文豁免） | ⬜ 待办 |
| T-116 | src/ 源码注释转英 | src/ 下 26 个文件的注释转英（保留证据强度表述） | T-113 | 高 | `npm run verify` 全绿；src/ 注释中文占比归零 | ⬜ 待办 |
| T-117 | re/ 脚本注释转英 | re/ 下 27 个脚本的注释转英 | T-113 | 高 | `npm run verify` 全绿；re/ 脚本注释中文占比归零 | ⬜ 待办 |
| T-118 | 灯效 6 项补齐 | LED 开关 / 灯效模式 / 滚轮灯 / Logo 灯 / DPI 灯 / 自定义颜色的偏移取证 + 实现（D-2） | **真机差分**（外部依赖） | 中 | 偏移定位（差分产出）+ 代码实现 + 离线仿真通过；真机验证待定 | ⬜ 待办 |
| T-119 | 左手模式 + 按键重映射 | 左手模式 + 按键重映射 UI 的偏移取证 + 实现（涉 0x16 双块写，风险最高） | **真机差分**（外部依赖） | 中 | 偏移定位 + 实现 + 离线仿真通过；真机验证待定 | ⬜ 待办 |

> D-4（CPI 回归真机验证）已裁决「现在验证」，但需用户真机操作，不进任务队列。
> 步骤见 `docs/cpi-step-check.md`。

---

## 结构性工作（队列空时执行，不依赖任何裁决）

| ID | 目标 | 动作 | 依赖 | 可逆性 | 完成判据 | 状态 |
|---|---|---|---|---|---|---|
| S-101 | 一次性脚本归置| 逐个评估 `re/` 下约 10 个一次性探查脚本（`dias.py`、`obj_scan.py`、`obj_scan2.py`、`cmd_scan.py`、`imm_scan.py`、`xref_scan.py`、`reportid_scan.py`、`const_scan.py` 等）。**能证明结论已沉淀进 `re/PROTOCOL_NOTES.md` / `re/XM1_NOTES.md` 的移入归档目录，产出一致的保留并标注**（判例四，已获授权，不删除） | 无（已裁决） | 中 | 每个脚本有明确归档结论；`re/` 根目录只留有复用价值的脚本；结论写入 `DECISIONS.md` |  ✅ **完成**（`8c93e55`）。按「是否被门禁调用」把 18 个脚本分两类，11 个纯探查脚本移入 `re/archive/`（判例四授权归档不删除）。新增 `re/archive/README.md` 逐个记录用途与产出沉淀位置。**归档的真实成本**：5 处文档路径引用失效已同步修正并核对归零 |
| S-102 | 决策日志归整 | 把 `DECISIONS.md` 中散落的假设归档为判例，标注哪些已形成「同类事项不得重复询问」的判例 | 无 | 高 | 每条判例标注影响的后续任务范围 |  ✅ **完成**。9 条判例**全部标注影响范围**（脚本核验通过）。新增判例七~十：配置工具优先于凭记忆（4 次凭记忆写配置全部出错）、门禁「合法」≠「生效」判据必须实测注入、knip 报告不作门禁直到误报清零、覆盖率在本架构下不可得 |
| S-103 | 包体积基线 | 记录当前产物体积（285.3 KB：js 250.9 / css 6.7）作为基线，纳入 `verify` 的体积回归检查 | 无 | 高 | `verify` 输出体积并在超阈值时失败；基线数字写入文档 |  ✅ **完成**（`9f5e82a`）。build.mjs 加 `SIZE_BUDGET_KB = 300`（基线 285.8 KB，留 5% 余量）。超阈值打印差额与建议并 exit 1。判据实测：临时调到 100 → exit 1；恢复后 exit 0 |
| S-104 | 测试代码纳入类型检查 | 执行判例十二待办：tsconfig `include` 扩到 `re/`，加 `types:["node"]`，引入 `@types/node@22`，修复暴露的 10 处类型错误 | 无 | 高 | `npm run check`（tsc）覆盖 re/ 且零错误；`npm run verify` 全绿 | ✅ **完成**（2026-10-09）。9 个测试文件从此受 tsc 类型检查。产物零变化证明纯类型改动。三个新发现记入 DECISIONS.md 判例十三：TS7 不自动含 @types、TS2367 是 CFA 固有局限、@types/node 需显式声明 |

### 死代码判定的三种手段（本次实践得出，按可信度排序）

1. **产物diff —— 最强证据。** `git diff index.html` 为空 ⇒ 删掉的是死代码，
   esbuild 的 tree-shaking 本来就没把它们打进产物。若产物有任何变化，
   说明删错了东西。**先做这一步，最省事也最可靠。**
2. **跨文件引用检查 —— 判断「残留」还是「漏接线」。** 对每个符号查
   `grep -l "\b符号\b" src/*.ts | grep -v 本文件`。若其他文件有真实调用
   ⇒ 是导入残留，删导入即可；若无任何调用 ⇒ 才可能是未使用的实现，
   需进一步查它的功能是否已由别处替代。
3. **ESLint 报告本身 —— 只能作为线索。** 它知道「本文件未使用」，
   不知道「别处是否用」——**直接照它删就是禁止先删后报**。

本次 49 处全部属于第 2 类（导入残留），无一处需要删除实现本体。

### 判据：何时可以放心删导入

- 该符号在其他文件有**真实调用**（不是只在 import 行、不是只在注释里），
- 且本文件的导入确实无调用，
- 且删除后 `tsc --noEmit` 零错误（证明没有隐式依赖），
- 且 `git diff index.html` 为空（证明运行时行为不变）。

四条同时成立才算干净。**本次 49 处全部满足。**

### T-103 ESLint 接入的四条工具行为（接 Stylelint 时直接参考）

1. **`typescript-eslint` 与 TypeScript 7 无交集**——peer 上限 `<6.1.0`，而TS 7.0.2 是
   Go 原生编译器、不提供编程 API。上游 issue #12518 已关闭为 "not planned"。
   **不要用 `--force` / `--legacy-peer-deps`**：那只是让 npm 跳过检查，
   缺失的 API 依然缺失，后续会在运行时崩。官方解法是双安装（见下）。
2. **双编译器实测行为**：`npx tsc --version` = 7.0.2（原生），
   `npx tsc6 --version` = 6.0.3（API 侧）。两个版本号**刻意不同**，
   不是配置错乱。另外 `@typescript/typescript6` 声明 6.0.2，但它依赖
   `@typescript/old@^6` 实际解析到 6.0.3——声明版本与实际解析版本不同，
   记录时以 `npx tsc6 --version` 为准。
3. **`--max-warnings` 只管 warnings，不管 errors**——实测 155 个 error 时，
   `--max-warnings 155` 与 `154` 都仍然 exit 1。所以「存量降级」必须靠
   把规则设为 warn，阈值参数无法替代。
4. **ESLint 10 移除了内置 formatter**——`--format compact` 会报
   "no longer part of core ESLint"，用默认输出即可。
   另：flat config 的规则选项名写错会被**直接拒绝配置**并报
   `should NOT have additional properties`（如 `min-description` 实为
   `minimumDescriptionLength`），不是静默忽略。

### 存量处置的口径（与主规范清理原则对齐）

ESLint 首次运行暴露 183 项。处置原则：

- `no-explicit-any` 97 处 → **warn + 阈值**，终态改error（T-109）
- `no-unused-vars` 53 处 → **warn**，需逐个确认意图后清理（T-111）。
  **关键判断：多数不是垃圾，而是「导入但未接线」的半成品**——
  `main.ts` 有 40+ 项（`xm1GuardWrite`、`readBlob8k`、`xm1Apply`、`xm1Snaps`、
  `buildXm1BlobReport`…），这些正对应未完成的功能，删除前必须逐个确认。
  属主规范分级授权的灰名单，**禁止先删后报**。
- 纯卫生规则（eqeqeq / no-var / prefer-const 等）→ 保持 **error**。
  唯一的 prefer-const 错误是 `main.ts:183` 的死变量 `xm1Edit`，
  已豁免并注明归入 T-111。

### T-109 收敛时类型通道抓出的三个真实问题（下次收 any 时直接复用）

1. **`glass` 的类型错配（原先被 `S: any` 掩盖）**
   `Stage.glass` 是 blob 里的占位字节 0/1，而 `lodByteToMm` / `mmToLodByte`
   的形参声明是 `boolean`。运行时靠 truthy 判断恰好正确，类型上却不匹配。
   **修法是显式 `=== 1`，不是把形参改成 number** —— 后者会让类型通道
   替调用方蒙混过关，等于把刚打开的通道又关掉。
   为什么原先没被发现：两处调用都走 `S.stage.glass`，而 `S: any`。

2. **`slamclick` / `jitter` / `maxFps` / `multiclick` 是运行时动态加的字段**
   `newStage()` 的初始值里没有它们；`render.ts` 与 `buildBlob8k` 才根据
   `S.stage.flags` 的位派生（`!!(flags & 0x01)` 等）。
   写接口时必须按「实际读取端」枚举字段，不能只看构造函数的初始值——
   **否则 tsc 会报「属性不存在」，容易误判成「代码坏了」**。
   已补进 `Stage` 并注明：`jitter` 仅 v1、`maxFps`/`multiclick` 仅 v2。

3. **`raw` / `unknown` / `unk7` 是安全机制的载体，不是遗留代码**
   它们让 XM1 在字段语义未核实时切只读视图，也让写入路径不敢碰未核实偏移。
   定接口时把它们显式声明并写明用途——**否则会顺手当垃圾清掉，等于拆掉安全网**。

### 收敛 any 的正确顺序（本次实践得出）

1. 先给**数据形状**定义接口（state.ts），而不是在调用处强转；
2. 再给**函数参数**标类型（`verifySensor8k(w: Stage)`）；
3. 最后给**返回值**标类型（`xm1Parse(b): Xm1Edit`）——
   这一步让 `S.xm1Edit = xm1Parse(...)` 有了类型保障；
4. 每步都跑 `tsc --noEmit`，它会指出下一处该标什么。

顺序反了（比如先改调用处）会得到大量 `as` 断言，把类型通道变成装饰。

### ⚠️ 一次自伤事故的记录（2026-10-09，务必读完）

**发生了什么**：用 Python 脚本按段落替换 TASKS.md 的「T-111 已完成的核实」小节时，
`end` 定位用的是「下一个标题」作为终止条件，但那个标题在文件里出现了**两次**
（内容段与「已完成任务的实测结论」段各一）。脚本因此把两者之间的
**T-110、S-101、S-102、S-103、T-112 五项任务整段切掉了**，
并且直到 T-112 执行时我才发现——**队列少了一半，我毫无察觉地继续推进**。

**怎么发现的**：写T-112 的状态时 `grep "^| T-112"` 返回空，才回头查队列全貌。

**为什么没被拦住**：

- markdownlint 只查**格式**，不查**内容完整性** —— 少 5 行表格它照样「0 问题」。
- 没有在每次改文档后核对任务总数。

**怎么修的**：`git show 07c1b40:TASKS.md` 导出备份，按精确行区间取回那 5 项，
再插回 T-111 之后。

**两条规矩（此后必守）**：

1. **改长文档的某个段落前，先确认「下一个标题」在全文件里唯一。**
   用 `grep -n` 数一遍出现次数；≥2 次就不能用它当终止条件，改用行号或
   「下一个与当前同级的标题」。
2. **改任务队列后必须核对任务总数**：
   `grep -cE "^\| (T|S)-[0-9]+" TASKS.md`，与改动前对比。
   数量减少就是事故，立刻从 git 恢复。

**顺带的发现**：这次的产物 `index.html` 一并被提交了（它本身没问题），
但**两个临时文件**（`.id_tags.tmp` / `.static_ids.tmp`）也曾进入工作树——
已清理，且 `.gitignore` 未改动（它们本来就不该被 add，已确认未入库）。
