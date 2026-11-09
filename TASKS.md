# TASKS.md — 任务队列与待裁决台账（根目录）

> **本文件与 `docs/internal/TASKS.md` 的关系（2026-11-07 起）**：根目录这份是唯一活动台账；
> `docs/internal/TASKS.md`（359 行，2026-10-09 起）冻结为历史正文，只读不改。
> 冻结理由与迁移选项见 `DECISIONS.md` D-001 与本文 T-03。
>
> 字段（缺一不可）：提出时间 / 问题 / 选项 / 推荐 / 影响面 / 阻塞了哪些任务 /
> 未裁决时的默认行为 / 状态 / 解决方法 / 解决时间。状态：待决 / 已决 / 撤回。
> **已决条目不得删除。**

---

## T-01 门禁入口迁到 Pwsh（已决）

- 提出时间：2026-11-07
- 问题：`verify` / `verify:ci` / `check:ui` 均为 `&&` 链，违反规范 §`pwsh-only` 与 §脚本执行基线。
- 选项：1) 迁到 `scripts/*.ps1`，`package.json` 只转发；2) 登记豁免。
- 推荐：选项 1 —— 一次改写，不留到期返工。
- 影响面：`package.json`、三个新脚本、`re/check_verify.mjs`、两套 workflow。
- 阻塞了哪些任务：T-02。
- 未裁决时的默认行为：按选项 1 执行。
- 状态：**已决**
- 解决方法：见 `DECISIONS.md` D-001 与 D-002。
- 解决时间：2026-11-07

---

## T-02 CI 全部改 `shell: pwsh`（已决）

- 提出时间：2026-11-07
- 问题：`verify.yml` 与 `deploy.yml` 的 `run` 步骤走默认 bash，规范要求 `shell: pwsh`。
- 选项：1) 顶层 `defaults` + 重写三段 bash；2) 只加 `defaults` 不改 bash 语法（会直接跑挂）。
- 推荐：选项 1 —— 选项 2 是「声明合规、实际失败」的假通过。
- 影响面：两套 workflow；`Select-String` 在产物检查里比 `grep -c` 多一层 `Measure-Object`。
- 阻塞了哪些任务：无。
- 未裁决时的默认行为：按选项 1 执行。
- 状态：**已决**
- 解决方法：见 `DECISIONS.md` D-001。
- 解决时间：2026-11-07

---

## T-03 历史台账（1060 行）是否迁到根目录

- 提出时间：2026-11-07
- 问题：`docs/internal/DECISIONS.md`（701 行）与 `docs/internal/TASKS.md`（359 行）是 2026-10-09 起的完整台账。规范 §`layout` 要求五文档在根目录，但机械搬迁会产生一次纯位移的超大 diff，且打断既有交叉引用。
- 选项：
  1. 保持现状：根目录为活动台账，`docs/internal` 冻结为历史正文（当前做法）。
  2. 整体迁到根目录并在历史提交中保留旧路径说明。
  3. 根目录只留索引，正文继续在 `docs/internal`。
- 推荐：选项 1 —— 零风险，且「冻结 + 链接回查」已经消除双真相源。
- 影响面：迁移需同步 `AGENTS.md`、`docs/README.md` 与全部 `docs/internal/...` 交叉引用（约 20 处）。
- 阻塞了哪些任务：无。
- 未裁决时的默认行为：按选项 1，`docs/internal` 只读。
- 状态：**待决**
- 解决方法：—
- 解决时间：—

---

## T-04 本机未执行全量 `npm run verify`

- 提出时间：2026-11-07
- 问题：本轮改动涉及 `package.json` 入口与 `re/check_verify.mjs`，已实跑 `node re/check_verify.mjs`（退出码 0）与 `scripts/check-script-baseline.ps1`（退出码 0），但未跑完整链条（`check:ui` 要起无头 Edge，`build` 要重写 `index.html`）。
- 选项：1) 由首次 push 的 CI 结论判定；2) 本机全跑。
- 推荐：选项 1 —— 已有两条针对性证据，全跑会重写入库产物、产生额外 diff。
- 影响面：`verify.ps1` 的 `check` / `lint` / `test` 段仅做了命令搬运，未逐段实跑。
- 阻塞了哪些任务：无。
- 未裁决时的默认行为：以 CI 为准。
- 状态：**已决**
- 解决方法：2026-11-09 本机实跑全量 `npm run verify`，**退出码 0，11 段全过**
  （check:meta / check / lint / lint:docs / lint:css / test / check:i18n / knip /
  check:ui / build / check:artifact）。`check:ui` 的五个演练均执行：layout 8 类、
  i18n 22 例 + 3 条字体规则、reset 7 例 + 1 例对照、xm1_align 全过。
  期间发现并修复失败路径的诊断丢失（`$PSNativeCommandUseErrorActionPreference`
  与手工 `$LASTEXITCODE` 并用），见 verify.ps1 头部注释与规范 v1.21.0 的补正。
- 解决时间：2026-11-09

---

## T-05 `docs/eslint-budget.md` 与 `docs/husky-setup.md` 的引用回填

- 提出时间：2026-11-07
- 问题：两节的正文从 `AGENTS.md` 迁出后，仓库内其它文档若仍引用「AGENTS.md §8」这类相对位置，指向会失准。本轮已改 `AGENTS.md` 自身，未逐一核对 `docs/internal/` 内的旧引用。
- 选项：1) 下次改动涉及相关章节时顺手修正；2) 本轮全仓检索并修正。
- 推荐：选项 1 —— `docs/internal/` 已冻结，旧引用不影响执行；仓促批量替换反而易引入错误。
- 影响面：仅文档内链。
- 阻塞了哪些任务：无。
- 未裁决时的默认行为：按选项 1。
- 状态：**待决**
- 解决方法：—
- 解决时间：—

---

## T-06 运行时版本：本机 Node 26 与 CI 的 Node 22 不一致（已决）

- 提出时间：2026-11-09
- 问题：新增 `.nvmrc` 钉 `22`（与 `verify.yml` 的 `node-version: "22"` 同源），但本机实际为
  `v26.13.0`。规范 §工具与运行时版本策略要求版本文件保证「CI 与本地环境一致」，
  当前只保证了 CI 侧；`npm i` 生成的锁文件与引擎行为在两侧可能不同。
  另有一层当时未写进本条的问题：`22` 被手抄了两遍，与 D-003 的三份
  `--max-warnings` 同属单一真相源失效。
- 选项：
  1. 把 CI 升到 26，并在本机用 22 复跑一次 `npm run verify` 作对照。
  2. 本机切到 22（nvm/fnm），与 CI 对齐，26 暂不使用。
  3. 维持现状并登记为例外。
- 推荐（提出时）：选项 2 —— CI 是权威判定通道，本地向它对齐成本最低；本项目是纯构建产物，
  升 Node 的收益（新语法）几乎没有，而 `esbuild` / `sass` / `tsc` 在两侧行为差异的风险是实在的。
- 影响面：本机开发环境；若走选项 1，需重验 esbuild 与 sass 的产物字节是否变化。
- 阻塞了哪些任务：无。
- 未裁决时的默认行为：维持 `.nvmrc=22`，本机在 26 上运行——**已知偏离，不静默**。
- 状态：**已决**
- 解决方法：2026-11-09 由用户指令「更新NODE26」采纳**选项 1 的修正版**（与当时推荐相反，
  以用户裁决为准，见 `DECISIONS.md` D-006）：
  ① `.nvmrc` 改 `26`；`verify.yml` 两个 job 由硬编码 `node-version: "22"` 改为
  `node-version-file: .nvmrc`，消除第二个手抄副本，本机与 CI 从此同源；
  ② `package.json` 增 `engines.node: ">=26 <27"`，`@types/node` 由 `^22.20.5`
  升到 `^26.6.6` 并同步 `package-lock.json`；`re/_domstub.ts` 的
  「Node 22 自带 navigator」注释改为「Node 22 起（基线 26）」；
  ③ 两份 README 写明 Node 26 基线。
  原选项 1 附带的「在本机用 22 复跑作对照」已失去前提（两侧同为 26），
  改由 CI 首跑判定；本机 `npm install`、`npm run check` 退出码均为 0，
  全量 `npm run verify` 见 D-006 的验证证据。
- 解决时间：2026-11-09

---

## T-07 根目录非白名单文件：五项获批例外（已决）

- 提出时间：2026-11-09
- 问题：规范 §`layout` 的根目录白名单为六类，本仓库有 28 个一级条目，其中五项不在其中：
  `index.html`、`README.en.md`、`.nojekyll`、`knip.config.js`、
  `.markdownlint-cli2.jsonc`。第 593 行还明令「根目录不存放任何散文类文件」。
  **两处现状更正**：远端 2026-11-09 已删 `README.zh-CN.md`、新增 `README.en.md`
  （原记录过时）；审计另发现 `index.html`（Pages 根发布入口）此前漏记，故是五项而非四项。
  五项都是平台/工具强制位置，详见 `DECISIONS.md` D-007。
- 选项：
  1. 全部合规化：散文文件迁入 `docs/`，两个工具配置加 `--config` 指向 `config/`。
  2. 全部登记豁免：在 `DECISIONS.md` 记录理由，不动文件。
  3. 混合：散文文件迁移或登记；工具配置移到 `config/` 并在 npm 脚本里显式传路径。
- 推荐：选项 2 —— 五项都是「工具/平台只认这个位置」，迁移换来的是违反工具默认约定，
  拿真实可维护性换形式合规；`index.html` 更是 Pages 根发布的唯一入口，物理上无法迁。
- 影响面：公开仓库的根目录面貌；若迁 `README.en.md`，会改变 GitHub 首页语言切换行为。
- 阻塞了哪些任务：无。
- 未裁决时的默认行为：不动文件，待登记豁免。
- 状态：**已决**
- 解决方法：2026-11-09 由用户指令「T07更新」按选项 2 批准保留。落实四件事：
  ① `DECISIONS.md` D-007 写明五项理由、被否决方案与复审条件；
  ② `README.md` / `README.en.md` 补「仓库根目录」字段，逐项列明；
  ③ 新增 `.github/root-allowlist.txt`：规范六类 17 项 + 项目一级目录 6 个 +
  获批例外 5 项，例外行带 `verify-exempt:`、`ref:D-007` 与到期日 2027-06-30；
  ④ 新增 `scripts/check-root-layout.ps1`，以 `npm run check:layout` 接入
  `verify` 链（并同步 `re/check_verify.mjs` 的 REQUIRED，链条 11 → 12 段），
  落实规范第 597 行「差集非空即失败」。清单放 `.github/` 而非新建
  `config/`，是为不制造第六个白名单外条目；`--others` 参数把尚未
  `git add` 的新文件也纳入比对，堵住「先放后报」。
- 解决时间：2026-11-09

---

## 当前未决议题

T-03（历史台账是否迁移）、T-05（迁移段落的旧引用回填）。
