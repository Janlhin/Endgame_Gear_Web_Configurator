# TASKS.md — 任务队列

> 依据《用 AI 做项目：持续推进行动方案》v1.0.1 §任务队列 建立。
> 来源：`docs/接手报告-2026-10-09.md` 的差距清单（由接手规范阶段 2 产出）。
> 建立时点：2026-10-09接手基线完成后。
> 字段定义见持续推进方案 §任务队列，七个字段缺一不可；「完成判据」必须可机器判定。

---

## 裁决状态（2026-10-09，四项已裁决）

| 裁决项 | 结论 | 影响任务 |
|---|---|---|
| 是否推送远端 | **暂不推送**，等显式确认 | T-106 保持被阻塞 |
| 补齐哪些工具链 | **四项 lint**（文档 lint / Husky / ESLint / Stylelint），**不引入 Vitest 与 Playwright** | T-101～T-104 转为可执行；T-108 改为只测基线 |
| `any` 收敛范围 | **只收协议边界**（`connect.ts` / `device-8k.ts` / `device-xm1.ts` / `blob.ts`），`diag.ts` 不动 | T-109 解除范围歧义，仍依赖 T-103 |
| 一次性脚本处置 | **逐个评估后归档**，不删除 | S-101 解除阻塞，转为可执行 |

四项结论已记入 `DECISIONS.md`「接手基线」条目，**形成判例，同类事项不再重复询问**。

---

## 排序说明

按持续推进方案 §排序规则：**可执行 > 可逆性 > 依赖数 > 价值**。
当前可执行项共 **11 项**（≥ 3，满足推进方案对队列的要求）；**接手期不存在真阻塞**。

---

## 任务队列

| ID | 目标 | 动作 | 依赖 | 可逆性 | 完成判据 | 状态 |
|---|---|---|---|---|---|---|
| T-101 | 文档层有 lint 通道 | 加`markdownlint-cli2` + `markdown-link-check` 两个 devDep，接入 `verify` 与 CI | 无 | 高 | `npm run verify` 通过；`markdownlint-cli2 "**/*.md"` 零error；CI绿 | 待办 |
| T-102 | 提交前有本地门禁 | 加 Husky + lint-staged + commitlint，接入 `pre-commit` / `commit-msg` | 无 | 高 | 故意写一条不符 Conventional Commits 的提交，`commit-msg` 必须拒绝；`npm run verify` 通过 | 待办 |
| T-103 | `any` 有 lint 拦截 | 加 ESLint flat config + `typescript-eslint`，`@typescript-eslint/no-explicit-any` 设为 `error` | 无 | 高 | `npm run lint` 对当前 82 处 `any` 报错（先配置不修）；`npm run verify` 其余段全绿 | 待办 |
| T-104 | 样式硬编码有拦截 | 加 Stylelint + `stylelint-config-standard-scss`，含 `color-no-hex`（`_tokens.scss` 走 overrides 放行） | 无 | 高 | `npm run stylelint` 通过；故意在业务 SCSS 写一个字面量颜色，该命令必须失败 | 待办 |
| T-105 | esbuild 漏洞有结论 | 单独提交升级 esbuild 0.24.2 → 0.28.x，跑完整 verify 确认产物仍零外部引用 | 无 | 中 | `npm audit` 无moderate；`npm run verify` 全绿；产物外部引用计数仍为 0；`cardChecklist` canary 仍命中 | 待办 |
| T-106 | 首次获得 CI 权威结论 | 推送 84 个提交到 origin，观察首次 CI 运行 | **判例一**（推送即上线，不可逆） | **低** | `verify` 与 `ui` 两个 job 在GitHub Actions 上均为绿；产物 canary 通过 | 被阻塞 |
| T-107 | 文档与代码一致性有自动判据 | 加 `docs:sync` 生成脚本（从 `package.json` / `tsconfig.json` 生成文档中的脚本名与依赖表），接 `git diff --exit-code` | T-101 | 中 | 故意改 `package.json` 里一个脚本名，`npm run verify` 必须失败 | 待办 |
| T-108 | 有覆盖率基线 | 引入覆盖率计量（c8 或 `node --experimental-test-coverage`），**只记录当前基线数字，不设阈值** | 无 | 中 | `npm run verify` 输出覆盖率数值；基线写入 `docs/`。**阈值待有数据后另行提案**（延续既有判例「测试框架暂不迁移到 Vitest」） | 待办 |
| T-109 | 协议边界不再是 `any` | 收敛 `src/connect.ts`、`src/device-8k.ts`、`src/device-xm1.ts`、`src/blob.ts` 中的 `any` 为具体类型或 `unknown` + 收窄。**`src/diag.ts` 及其他不动**（判例三） | T-103 | 中 | 该四文件 `grep -c ': any\|as any'` 计数为 0；`npm run verify` 全绿；**`re/test_write_gates.ts` 仍全绿（写入闸门不得被削弱）** | 待办 |
| T-110 | 死代码有自动检测 | 引入 `knip`，产出首份死代码报告 | 无 | 中 | `npm run knip` 可执行并输出报告；结论写入 `DECISIONS.md` | 待办 |

---

## 结构性工作（队列空时执行，不依赖任何裁决）

| ID | 目标 | 动作 | 依赖 | 可逆性 | 完成判据 | 状态 |
|---|---|---|---|---|---|---|
| S-101 | 一次性脚本归置| 逐个评估 `re/` 下约 10 个一次性探查脚本（`dias.py`、`obj_scan.py`、`obj_scan2.py`、`cmd_scan.py`、`imm_scan.py`、`xref_scan.py`、`reportid_scan.py`、`const_scan.py` 等）。**能证明结论已沉淀进 `re/PROTOCOL_NOTES.md` / `re/XM1_NOTES.md` 的移入归档目录，产出一致的保留并标注**（判例四，已获授权，不删除） | 无（已裁决） | 中 | 每个脚本有明确归档结论；`re/` 根目录只留有复用价值的脚本；结论写入 `DECISIONS.md` | 待办 |
| S-102 | 决策日志归整 | 把 `DECISIONS.md` 中散落的假设归档为判例，标注哪些已形成「同类事项不得重复询问」的判例 | 无 | 高 | 每条判例标注影响的后续任务范围 | 待办 |
| S-103 | 包体积基线 | 记录当前产物体积（285.3 KB：js 250.9 / css 6.7）作为基线，纳入 `verify` 的体积回归检查 | 无 | 高 | `verify` 输出体积并在超阈值时失败；基线数字写入文档 | 待办 |

---

## 被裁决项阻塞的任务一览

| 任务 | 阻塞于 | 阻塞性质 |
|---|---|---|
| T-106 | 判例一：推送需显式确认 | **不可逆操作**（推送即上线） |

**可执行项统计**：T-101～T-105、T-107～T-110、S-101～S-103 共 **11 项可执行**，
满足持续推进方案「队列中始终 ≥ 3 个可执行项」的要求。**接手期不存在真阻塞。**

---

## 历史性差距（记录并约束后续，不回溯修复）

| 项 | 依据 | 处置 |
|---|---|---|
| 6 项 TS 严格开关未开（`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`verbatimModuleSyntax`、`isolatedModules`、`noUnusedLocals`、`noUnusedParameters`） | `tsconfig.json` 内联注释已量化代价（55 + 50 个错误）并记入 `DECISIONS.md` | 属**已决策的渐进策略**，非遗留。开启时须独立提交，不与业务改动混批 |
| 协议笔记体量大（`XM1_NOTES.md` 46 KB、`PROTOCOL_NOTES.md` 24 KB、`SOURCES.md` 14 KB） | 逆向取证的证据链要求 | **必要冗余**，不清理 |
| 首commit `005bffd`（TS 全量转换） | 84 次提交中粒度最大的一次 | **历史性差距，不回溯修复**。约束后续提交保持原子化 |
| Playwright 缺失 | 依赖真机，无自动化通道 | **不可能修复**，不列入队列 |
| 运行期 schema（Zod）缺失 | `connect.ts` 等协议边界共 82 处 `any` | T-109 部分覆盖；完整 schema 化属P2，成本高，暂不排入 |
