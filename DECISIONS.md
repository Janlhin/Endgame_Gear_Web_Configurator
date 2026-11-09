# DECISIONS.md — 决策日志（根目录）

> 追加式记录：被采纳的方案、被否决的替代方案、理由。旧方案归档于此，不留在主文档里。
>
> **本文件与 `docs/internal/DECISIONS.md` 的关系（2026-11-07 起）**：
> 根目录这份是**唯一活动台账**，新增条目写这里；`docs/internal/DECISIONS.md`（701 行、
> 2026-10-09 起的 40 余条记录）已**冻结**为历史正文，只读不改。
> 冻结而不迁移的理由：那 701 行是带完整证据链的原始记录，机械搬动只会引入 diff 噪音；
> 活动台账从根目录重新起算，历史按链接回查。
> 是否需要把历史正文整体迁到根目录，登记为 `TASKS.md` 的 T-03，属灰名单操作，待确认。

---

## D-001 · 2026-11-07 门禁升级到规范 v1.20.0：入口迁 pwsh、CI 统一 shell、AGENTS.md 目录化

- **背景**：本仓库的工程基线建立在规范较早版本（AGENTS.md 记为 v1.5.0）上，三处与 v1.20.0 冲突：
  ① `verify` 与 `check:ui` 是 `&&` 长链；② CI 的 `run` 步骤走默认 bash；③ `AGENTS.md` 178 行且含成段抄录。
- **决策**：
  1. `verify` → `pwsh -NoLogo -NoProfile -File ./scripts/verify.ps1`，`verify:ci` → 同一脚本加 `-Ci`；
     `check:ui` → `scripts/check-ui.ps1`。串联逻辑与 UTF-8 环境设置全部移入脚本。
  2. 两套 workflow 全部加 `defaults.run.shell: pwsh`；原先依赖 bash 的三段（grep 查产物、
     grep 查提交信息、mkdir/cp 组发布目录）用 `Select-String` / `New-Item` / `Copy-Item` 等价重写。
  3. `AGENTS.md` 拆分：husky 排障 → `docs/husky-setup.md`，ESLint 预算 → `docs/eslint-budget.md`，
     条款正文改为规范锚点，178 → 140 行以内。
- **理由**：`&&` 的短路与退出码传播依赖 shell 实现，写进 npm scripts 后同一入口在
  PowerShell / cmd / sh 下语义不同；CI 若继续混用 bash 与 pwsh，两者对「命令失败」的判定
  也不同。规范要求的「通过」必须只有一个含义。
- **被否决的替代方案**：
  1. 保留 `&&` 链，登记 `config/script-baseline-exempt.txt` 豁免 —— 豁免只把返工推迟到到期日，
     而迁移成本是一次改写。
  2. 把 `re/check_verify.mjs` 的 REQUIRED 清单降级为「只检查 verify 存在」—— 那正是该脚本
     设计上要堵的自指漏洞，等于关掉「verify 被悄悄削弱」的检测。
  3. 保留 CI 的 bash 步骤，只在 workflow 顶部加注释说明 pwsh 优先 —— 注释不构成门禁。
- **影响面**：`package.json` 三行、新增 `scripts/verify.ps1` / `scripts/check-ui.ps1` /
  `scripts/check-script-baseline.ps1`、`re/check_verify.mjs` 的链条读取逻辑（支持 `&&` 内联与
  `.ps1` 转发两种形态，可回滚）、两套 workflow、`AGENTS.md` 与两个新文档。
- **复审条件**：若某次 CI 在 ubuntu runner 上因 pwsh 版本低于 7.4 失败，需改为
  `actions/setup-powershell` 显式钉版本，并在此登记。

---

## D-002 · 2026-11-07 `re/check_verify.mjs` 改为读 `scripts/verify.ps1`

- **决策**：新增 `readChain(script)`：若 `package.json` 的入口是 `pwsh -File x.ps1` 转发形态，
  则读该 `.ps1` 全文作为链条文本；否则退回读 `package.json` 那一行。
- **理由**：入口迁走之后，自检脚本若仍只读 `package.json`，看到的就是一行 pwsh 命令——
  「少了一段门禁」再也报不出来，自检从结构校验退化为存在性校验。
- **被否决的替代方案**：让 `verify.ps1` 里保留 `npm run xxx &&` 字符串供正则匹配 ——
  为迎合检查器写假字符串，是让门禁与实现互相欺骗。
- **复审条件**：若将来引入第三种入口形态（如 `node scripts/verify.mjs`），`readChain` 需同步扩展。

---

## D-003 · 2026-11-09 ESLint 预算登记为正式豁免（偏离 `--max-warnings=0`）

- **背景**：规范 v1.21.0 的强制基线是 `--max-warnings=0`。本项目实际是 `--max-warnings=81`，
  且同一个数字曾在三处出现并各自漂移：`package.json` 为 81、`docs/eslint-budget.md` 写 88、
  `.husky/pre-commit` 注释写 154。这不是「放宽」，是**三个手抄副本**——规范
  §`single-source-of-truth` 预言的失效方式。
- **决策**：
  1. 数值以 `npx eslint src` 的实测存量为准（2026-11-09：0 error / 81 warning），
     唯一写入点收敛到 `package.json` 的 `lint` 脚本；其余位置只解释、不抄数字。
  2. 该偏离按规范 §豁免流程登记为本条决策：机读标记见 `eslint.config.mjs`
     的 `verify-exempt:` 注释，**到期日 2026-12-31**。
  3. 到期未清零则必须重新提案并说明剩余来源，不得静默续期。
- **理由**：一次性把 81 处 `any` 设为 error 会让 verify 与 CI 永久变红，而「门禁常红」
  等于把门禁关掉——规范同样禁止。预算式门禁保留拦截力（新增即失败），且只降不升。
- **被否决的替代方案**：
  1. 直接设 `error` 并接受 CI 常红 —— 两周内所有人都会习惯红色，等于关掉整条链。
  2. 保持 `--max-warnings 154` / 88 不动 —— 阈值高于存量时门禁形同虚设，
     新增 any 不会失败，与「有门禁」无法区分。
  3. 关闭 `no-explicit-any` 规则 —— 失去可见性，存量再也不会被清理。
- **影响面**：`package.json` 一行、`docs/eslint-budget.md`、`eslint.config.mjs` 注释、
  `scripts/hooks/pre-commit.ps1`（不再重复数字）。
- **复审条件**：2026-12-31 前复审一次；存量降到 0 时立即删除本豁免并改回 `=0`。

---

## D-004 · 2026-11-09 构建指纹改为内容哈希（产物可复现）

- **背景**：`tools/build.mjs` 原先用「commit 短哈希 + UTC 分钟」作指纹。三个后果：
  ① 提交产物会改变 HEAD，产物永远落后一次提交，每次提交后都要补一个
  `chore(build): 重建产物` —— 自指的提交循环，历史里已重复三次；
  ② 时间戳使产物不可复现，`git diff` 无法用来判定「改了文档忘记重建」；
  ③ commit 哈希区分不出「同一提交下本地改过的页面」，而这正是指纹最初要解决的情形（issue #1）。
- **决策**：指纹改为产物内容的 SHA-256 前 8 位，在 bundle / 样式 / 渲染后的清单注入之后计算。
  页面页脚与诊断包 `meta.build` 均显示该哈希。
- **理由**：内容哈希对上述三点同时成立——同样输入必得同样字节（可复现）、
  任何输入改动都会变（可判定）、本地手改也会变（正是志愿者排查缓存问题的需要）。
  构建日期回归 `CHANGELOG.md` 与 release note，产物本身只需要一个稳定身份。
- **被否决的替代方案**：
  1. 保留时间戳，一致性检查时用正则把指纹行抹掉再比对 —— 掩盖症状：产物仍然每次不同，
     且「抹掉哪一行」成为需要维护的第二个清单。
  2. 指纹取「最后一次触碰输入的提交」的日期 —— 需要完整历史；CI 默认浅克隆只拿到 HEAD，
     本地与 CI 会得出不同结果。
  3. 干脆去掉指纹 —— 失去 issue #1 依赖的「测的是哪一版」定位能力。
- **影响面**：`tools/build.mjs`（指纹生成与注入顺序）、`index.html` 页脚、
  诊断包 `meta.build` 的取值形态（`<commit> · <时间>` → 8 位十六进制）。
  `src/version.ts` 的占位符机制不变。
- **复审条件**：若将来需要「构建日期」进入产物（例如发布合规要求），改为由
  `SOURCE_DATE_EPOCH` 注入，而不是回退到 wall clock。

---

## D-005 · 2026-11-09 `pre-commit` 改为纯转发薄壳

- **背景**：`.husky/pre-commit` 原是 `#!/bin/sh` 且内含五条 npm 命令（两次 tsc、两次 eslint、
  一次 markdownlint --fix）。规范 v1.21.0 §脚本执行基线要求钩子只能是「shebang pwsh」
  或「唯一动作是 exec pwsh 的薄壳」，业务逻辑必须留在 `.ps1` 里。
- **决策**：钩子改为一行 `exec pwsh -NoLogo -NoProfile -File .../pre-commit.ps1`；
  原五条命令原样迁入 `scripts/hooks/pre-commit.ps1`，行为不变（顺序、复查两次、
  `--fix` 后复验都保留），并补了 `-SkipFmt` 开关供不含 Markdown 的提交使用。
- **理由**：sh 里的 `npm run x || exit 1` 与 `.ps1` 里的 `Assert-Step` 是两套失败判定；
  同一份改动可能在钩子说通过、CI 说失败。薄壳化后二者共用一种语义。
  同时消除 `--max-warnings 154` 这个漂移副本（见 D-003）。
- **被否决的替代方案**：
  1. 保留 sh 逻辑、只在注释里声明「已按规范对齐」—— 注释不构成门禁。
  2. 钩子直接 `#!/usr/bin/env pwsh` —— 在 Git for Windows 下可行，但跨平台 clone
     仍需 sh 入口；本仓库面向 GitHub Pages 的协作者，薄壳兼容性更好。
  3. 把完整 verify 放进钩子 —— 十几秒的等待会把人推向 `--no-verify`，反而削弱门禁。
- **影响面**：`.husky/pre-commit`、新增 `scripts/hooks/pre-commit.ps1`。
- **复审条件**：若 husky 升级后不再从仓库根执行钩子，需复核 `$(dirname "$0")` 的相对路径假设。

---

## D-006 · 2026-11-09 运行时基线统一到 Node 26（关闭 T-06）

- **背景**：`.nvmrc` 原本钉 `22`，`verify.yml` 的 ubuntu / windows 两个 job 各自硬编码
  `node-version: "22"`，而本机实际是 `v26.13.0`。规范 §工具与运行时版本策略要求版本文件
  保证「CI 与本地一致」，当时只保证了 CI 侧。更根本的问题是 `22` 被手抄了两遍——
  与 D-003 里三份 `--max-warnings` 属于同一种失效方式，改版本时必然再次漂移。
- **决策**：
  1. `.nvmrc` 改为 `26`；两个 CI job 由 `node-version: "22"` 改为
     `node-version-file: .nvmrc`。运行时版本此后只有一个写入点。
  2. `package.json` 增 `engines.node: ">=26 <27"`；`@types/node` 由 `^22.20.5`
     升到 `^26.6.6` 并同步 `package-lock.json`；`re/_domstub.ts` 里
     「Node 22 自带 navigator」的注释改为「Node 22 起（基线 26）」。
  3. 两份 README 的「从源码构建」写明 Node 26 基线；`TASKS.md` T-06 关闭。
- **理由**：用户 2026-11-09 指令「更新NODE26」。T-06 提出时的推荐是「本机切回 22」，
  但那需要额外安装并长期维护一个旧运行时，让权威判定通道跟着旧环境走；
  本机已有 26，把 CI 升上来是成本更低且不留偏离的一侧。
- **被否决的替代方案**：
  1. 本机切到 22（原推荐项）—— 多一套待维护的运行时，且本机 26 仍会用于其它项目，
     偏离只是从 CI 侧挪到本地侧，没有消失。
  2. 维持现状并登记例外 —— 版本文件形同虚设；`npm ci` 的引擎行为、
     esbuild / sass 的产物字节在本地与 CI 是否一致无法排除。
  3. CI 直接写 `node-version: "26"` —— 当下能对齐，但仍是两个手抄副本，
     下次升 27 会重演 T-06。
- **影响面**：`.nvmrc`、`.github/workflows/verify.yml`（两处）、`package.json`、
  `package-lock.json`、`re/_domstub.ts`、两份 README、`AGENTS.md` 头部、`TASKS.md`。
- **验证证据**：`npm install` 退出码 0（锁文件 root 的 `engines` 与
  `@types/node` 均已同步）；`npm run check`（tsc，`@types/node@26.6.6`）退出码 0；
  全量 `npm run verify` 退出码 0、12 段全过（含 `check:layout` 与 `check:artifact`）。
  CI 在 Node 26 上的首次判定以远端流水线为准，本机不代替它。
- **复审条件**：升级 Node 27 时须同时改 `.nvmrc` 与 `engines`，并实跑
  `npm ci` + `npm run verify`；若 `@types/node` 主版本落后于运行时，视为未对齐。

---

## D-007 · 2026-11-09 根目录白名单例外登记并接入机器校验（关闭 T-07）

- **背景**：规范 v1.21.0 §`layout` 第 560 行只允许六类条目，第 593 行禁止根目录散文
  文件，第 595 行要求白名单外新增须先询问获批、并补 `README.md` 目录结构字段与本日志
  理由，第 597 行要求「取根目录一级条目与白名单比对，差集非空即失败」。
  本仓库有 28 个一级条目，其中五项在白名单外：`index.html`（Pages 根发布入口）、
  `README.en.md`、`.nojekyll`、`knip.config.js`、`.markdownlint-cli2.jsonc`。
  原 T-07 记的是四项且含已被远端删除的 `README.zh-CN.md`；`index.html` 此前漏记，
  本条一并更正。
- **决策**：用户 2026-11-09 指令「T07更新」批准按 T-07 选项 2 保留五项，落实四件事：
  1. 本条记录理由、被否决方案与复审条件；
  2. `README.md` / `README.en.md` 补「仓库根目录」字段，逐项列明；
  3. 新增 `.github/root-allowlist.txt`：规范六类 17 项 + 项目登记的一级目录 6 个 +
     获批例外 5 项；例外行带 `verify-exempt:`、理由、`ref:D-007` 与到期日 2027-06-30；
  4. 新增 `scripts/check-root-layout.ps1`，以 `npm run check:layout` 接入 `verify`
     链并同步 `re/check_verify.mjs` 的 REQUIRED（链条 11 → 12 段）。用
     `git ls-files --cached --others --exclude-standard` 把「尚未 `git add` 的新文件」
     也纳入比对，堵住「先放后报」。
- **理由**：五项都是平台/工具只认根目录位置，迁移要付出违反默认约定的代价，换来的
  只是形式合规；`index.html` 更是 Pages 根发布的唯一入口，物理上无法迁。清单放
  `.github/`（六类中的「协作与平台配置」）而非新建 `config/`，是为了不制造第六个
  白名单外条目。
- **关于 §豁免流程第 1 项的裁量**：该条要求「在代码中显式标注
  `// verify-exempt: <理由> ref:<issue>`」。本类豁免的对象是目录布局，其中
  `.nojekyll` 是空文件、`index.html` 是生成物——往生成物里写注释会破坏 D-004 的
  产物可复现性。因此由清单行承担逐项标注：每行带 `verify-exempt:`、理由、
  `ref:D-007` 与到期日，且脚本强制校验缺一不可。「可穷举、可 diff 审查」由清单
  承担，「到期自动失效」由脚本在过期时把该行移出允许集实现。
- **被否决的替代方案**：
  1. 全部合规化 —— GitHub 首页语言切换与 Pages 入口会失效；`index.html` 无法迁；
     `docs/.markdownlint.jsonc` 的就近覆盖关系也要重写。
  2. 只写台账、不做机器校验 —— 第 597 行仍是一句空话，下次新增 `NOTES.md` 无人拦，
     与 D-001 里「注释不构成门禁」是同一个错误。
  3. 把清单放根目录 `config/` —— 又多一个白名单外一级目录，自相矛盾。
- **影响面**：新增 2 个文件、改 2 份 README、`package.json` / `scripts/verify.ps1` /
  `re/check_verify.mjs` 各一处、本日志与 `TASKS.md`。
- **验证证据**：`check-root-layout.ps1` 单跑退出码 0（28 个一级条目 / 5 项例外）；
  故意在根目录放入白名单外的 `NOTES.md` 后退出码 1 并列出该项（P1 式真实拦截，
  测试文件随即删除）；全量 `npm run verify` 退出码 0、12 段全过。
- **复审条件**：2027-06-30 前逐项复审；若 Pages 改走独立 `gh-pages` 分支发布，
  `index.html` 与 `.nojekyll` 应移出根目录并删除对应例外。到期未复审则清单行
  自动失效、门禁转红；新增根目录条目仍须先询问获批。

---

## D-008 · 2026-11-09 点击过滤上限由 15 更正为 25（采信官方工具互证结论）

- **背景**：用户指出「官方驱动能支持到 25，网页版只到 15」。核查得到的四点是本条决策的依据：
  1. `src/render.ts` 自初版起就只有 `off + 1..15`；2026-10-20 的 `26c7d6c` 只是把
     硬编码字符串表改成运行时生成，**没有改范围**。不是本轮规范整改误删，也不存在
     「曾经有 25 后来被删」的历史（`git log -S` 全分支无命中）。
  2. 15 的依据是 `re/PROTOCOL_NOTES.md` 早期「从 UI 字符串区读出 0–15」。
  3. 2026-11-04 的 `re/upstream/SOURCES.md` 与官方配置工具互证后给出
     「多击过滤……默认 8，**上限 25**」，时间更晚、证据更直接。
  4. `render.ts` 原有的兜底注释自己写着「官方上限是 25 而我们只列到 15」——设备读回
     25 时会自动补一个 option，所以**能显示**；但 16–25 不在下拉里，**选不了**。
     官方能设的值在网页版变成只读，这是真实的功能缺口，不是显示瑕疵。
- **决策**：以 `FILTER_MAX_MS = 25` 为单一来源生成下拉（0 = 关 + 1..25），保留表外值
  兜底；`re/PROTOCOL_NOTES.md` 的旧结论就地标注作废并指向新证据，不静默删改；
  `re/tests/test_btns.ts` 新增 [3c-0] 把上限钉死，原 [3c] 兜底用例的样本由 25
  改为真正超表的 26（否则上限改回来测试仍会说「超出选项表」，形同虚设）。
- **理由**：取值范围属于协议事实，只能有一个写入点；靠兜底补 option 是「容错」而非
  「支持」，把容错当支持正是这次漏掉 16–25 的原因。旧笔记保留但标注作废，是为了让
  「为什么曾经是 15」可追溯——悄悄改数字会让下一次审查重新踩同一个坑。写入链路
  （`buildPowerPayload` 的 `p[4..8]`、`verifyButtons`）比对的是字节真值、不做范围
  假设，因此无需改动，也不存在「放宽上限会绕过写入校验」的风险。
- **被否决的替代方案**：
  1. 维持 15、只靠兜底显示 —— 用户看得见 25 却选不了 16–25，缺口未修。
  2. 直接把 `i <= 15` 改成 `i <= 25` 并把旧笔记悄悄改成 0–25 —— 数字散落两处，
     且抹掉旧结论的来由，违反 01 §88 单一真相源与判例里「注释不构成证据」的教训。
  3. 上限放到字节全域（0–255）—— 超出官方已验证范围，等于把未验证值开放写入，
     对一只无线鼠标的配置帧是没必要的安全面扩大。
- **影响面**：`src/render.ts`、`re/tests/test_btns.ts`、`re/PROTOCOL_NOTES.md`、
  `README.md` / `README.en.md` 的功能列表、重建产物 `index.html`；本日志与
  `TASKS.md`（新增 T-08）。不触碰 `src/blob.ts` / `src/session.ts` / `src/verify.ts`。
- **验证证据**：`npm test` 退出码 0（新增 [3c-0] 六条断言全过）；`npm run check`
  退出码 0；故意把常量临时回退到 15 后 `npm test` 退出码 1 且四条断言精确点名
  （常量值 / 项数 / 16·20·25 / UI 下拉），还原后文件哈希一致。
- **复审条件**：真机验证 16–25 ms 写入后读回一致且实际生效（见 T-08）；若官方新固件
  调整上限、或发现 0xF0/0xF1 之外还有特例编码，须同步常量、测试、两份 README 与
  `SOURCES.md` 的引用，并在此追加一行。在 T-08 关闭前，16–25 属**已实现但未真机验证**。

---

## 决策日志格式

新增条目按 D-00N 递增，字段固定为：背景 / 决策 / 理由 / 被否决的替代方案 / 影响面 / 复审条件。
「更新措辞」不构成一条决策。
