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
  <https://www.w3.org/TR/webhid/> ，不是自创；代价是引入了 `@types/w3c-web-hid` 之后可以删掉本文件。
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

## 2026-10-09 · 仓库名改为 `Endgame_Gear_Web_Configurator`（发布前最后一步）

- **决策**：仓库、npm 包名、产物里的 `app` 标识统一改为 `Endgame_Gear_Web_Configurator`。
- **理由**：账号内已有四个仓库（`OpenSave` / `OpenRA_simplified_chinese` /
  `MPV_Config_Builder` / `DXVK_Manager`）**全部是 PascalCase + 下划线分段**。
  GitHub 生态通行的是 kebab-case，但**同一账号内的一致性权重更高**——GitHub 首页是给人看的，
  五个仓库并排时风格统一比单个名字符合外部惯例更显眼。
- **被否决的替代方案**：
  - 保持 `endgame-gear-web-configurator`（kebab-case）—— 单看更"规范"，但成为账号里唯一的例外；
  - `egg-web-configurator`（缩写短名）—— 搜索与自解释性都变差。
- **代价（已知并接受）**：URL 变成 `/Endgame_Gear_Web_Configurator/`，
  带下划线与大小写，不如全小写干净。但 GitHub 会 301 重定向，且本工具的分享途径
  以"直接下载单文件"为主，URL 只是一条备用路径。
- **改名时机**：仓库已建但**尚未推送**，此刻改名零成本——没有断链，没有历史污染。
  推上去之后 GitHub 把 `_` 与 `-` 视为不同字符，改名即断链。
- **同步范围**：`package.json` / `package-lock.json` / README 的 `gh repo create` 命令与
  Pages 路径 / `docs/push-to-github.md` / 三个源码里的 `app:` 字段 /
  构建产物。`CHANGELOG.md` 与本文件里**保留改名前的原文**——那是历史记录，不是当前配置。

## 2026-10-09 · 接手基线：四项待裁决项的裁决结论（判例）

> 来源：`docs/接手报告-2026-10-09.md`（依《用AI做项目-接手未完成项目规范》执行）。
> 阶段 0–2 全程只读，零业务提交。以下四项**形成判例，同类事项不再重复询问**。

### 判例一：推送远端需显式确认（该确认已于 2026-10-09 给出）

- **裁决**：推送远端**必须**先有人显式确认，不得自动执行。
- **理由**：`deploy.yml` 对 `push: main` 自动触发 Pages 发布——推送即上线，属不可逆操作。
  且 CI 的两个 job 从未在真实 runner 上跑过，本地全绿不等于 CI 绿。已核实两处未验证差异：
  ① `check:ui` 本地跑Python 3.13.14，CI 声明 3.12；
  ② 无头Edge 在 runner 自动更新后的行为与本地是否一致，无法本地验证。
- **解除记录（2026-10-09）**：人已显式确认推送。但推送**被 GitHub 拒绝**——
  OAuth App 令牌缺 `workflow` scope，而 `verify.yml` 与 `deploy.yml` 均需该权限。
  完整报错与处置见 `TASKS.md`「T-106 推送受阻记录」。
- **新增同类判例**：含 `.github/workflows/` 的仓库，**推送前必须确认令牌有
  `workflow` scope**。否则必然被拒，且拒绝发生在上传完成前——
  不会污染远端，但会让人误以为「网络问题」而反复重试。
  排查手法：`git push` 的 `remote rejected` 报错里会直接写明缺哪个 scope。
- **已知无问题项**（已实测排除，不作为推迟理由）：Edge 确实预装于 `windows-latest`，
  路径与 `re/layout_check.py:7` 硬编码一致；`re/*.py` 仅用标准库，CI 缺 pip 步骤不构成缺陷。
- **同类事项**：任何「推送 / 发布 / 上线」类请求，默认不自动执行，须显式确认。
- **第二次解除记录（2026-10-09 晚）**：用户指令「推」—— 属显式确认，已执行推送。
  报错**逐字相同**，故补充三条实测事实：
  ① 排除偶发解释（令牌已改/ 网络抖动），两次拒绝原因一致，属稳定的凭据限制；
  ② **「本机未安装 `gh` CLI」这一记载不成立**——`gh` 已安装（v2.102.0，winget，
     `C:\Program Files\GitHub CLI\gh.exe`），只是**不在 Git Bash 的 PATH 里**，
     而检测在 bash 中做。**在 bash 里问「装没装」会得到假阴性**——
     须换 PowerShell 或直接查固定路径复核（判例七的延伸：不凭单一渠道下结论）。
  ③ `git ls-remote origin` 复核远端为**零对象**——拒绝发生在传输完成前，
     **不会留下半推送状态**，重试是安全的。
  ④ 令牌 scope 实测为 `gist, read:org, repo`（`gh api -X GET user -i` 读
     `X-OAuth-Scopes`）——**确实缺 `workflow`**，这是被拒的直接原因，属数据侧证据。
  修正一处过时记载：判例一原文写「85 个提交」，实测已累积至 119 个。

**影响范围**：T-106（推送）。该确认仅对本次推送有效；
若将来重启推送，需重新确认——**判例不跨场景继承**。

### 判例二：补齐四项 lint 工具，不引入 Vitest 与 Playwright

- **裁决**：补 `markdownlint-cli2` + `markdown-link-check`（T-101）、Husky + lint-staged +
  commitlint（T-102）、ESLint flat config + `typescript-eslint`（T-103）、Stylelint（T-104）。
  **不**引入 Vitest、Playwright、覆盖率阈值。
- **与既有判例的关系**：本裁决**确认并延续**上文「测试框架暂不迁移到 Vitest」——
  现有自研断言体系（9 个测试文件，实测 30 通过 / 0 失败）已覆盖写入闸门、协议几何、
  CPI 规则、数据包完整性，迁移不产生新的拦截能力。故覆盖率阈值（T-108）改为
  「先测基线数字，不设阈值」，阈值待有数据后再定。
- **理由**：四项 lint 均为**纯新增通道**，不触碰业务逻辑，零回归风险；
  而 lint 补齐后，82 处 `any` 与文档断链才会变成机器可见，而非依赖人工审查。
- **同类事项**：新增依赖前先问「能否用现成工具」，不自研 lint 规则。

**影响范围**：T-101（文档 lint）、T-102（Husky）、T-103（ESLint）、
T-104（Stylelint）—— 四项已全部完成；T-108（覆盖率）
沿用本判例「不引入 Vitest」的前提，故未使用覆盖率框架。

### 判例三：`any` 收敛只做协议边界，不做全量

- **裁决**：只收敛 `src/connect.ts`、`src/device-8k.ts`、`src/device-xm1.ts`、`src/blob.ts`
  这四处 HID 数据入口（T-109）。`src/diag.ts`（约 40 处）与其他**暂不动**。
- **理由**：协议边界正是历史上 **XM1 配置被清零事故**发生的层——早期版本误把官方写路径
  当读路径，向设备发了 1024 字节全零负载，用户 DPI/CPI 被清零（`README.md` 有完整事故记录）。
  风险最集中处先收敛。`diag.ts` 是诊断序列化，与写入路径无关，属低风险区。
- **硬约束**：收敛过程中 `re/test_write_gates.ts` 必须保持全绿。**写入闸门不得被削弱**——
  若类型收敛导致写入校验逻辑变形，回滚该部分而非调整断言。
- **前置**：需先完成 T-103（ESLint），否则无自动判据证明 `any` 真的清零。
- **同类事项**：任何触及 `sendFeatureReport` 的改动，按安全关键路径处理，需真机回归。

**影响范围**：T-103（ESLint 配置时的分级）、T-109（协议边界收敛）。
T-109 已完成：协议边界四文件的 any 归零并升为 error；
**T-112 是本判例的例外**——用户 2026-10-09 指示「除推送外全部做完」，
把范围扩到了 `$()` 与 `S`（原判例未涵盖），已单独记录其结论。

### 判例四：一次性逆向脚本逐个评估后归档，不直接删

- **裁决**：`re/` 下约 10 个一次性探查脚本（`dias.py`、`obj_scan.py`、`obj_scan2.py`、
  `cmd_scan.py`、`imm_scan.py`、`xref_scan.py`、`reportid_scan.py`、`const_scan.py` 等）
  **逐个评估后移入归档**，不删除（S-101）。
- **理由**：协议结论已沉淀进 `re/PROTOCOL_NOTES.md` 与 `re/XM1_NOTES.md`，脚本本身无复现价值；
  但**保留可追溯性**——逆向取证的原始过程是证据链的一部分，与 `MANIFEST.md`
  「只留可复现凭据」的口径一致。归档而非删除，让 `re/` 根目录只留有复用价值的脚本。
- **授权边界**：属 `AGENTS.md` §7 灰名单，**已获裁决授权**，但仍须逐个评估——
  能证明结论已沉淀的才归档，产出一致的保留并标注。**禁止先删后报。**
- **同类事项**：逆向脚本与产物，按「结论入文档、过程留归档」处理，不留在工作目录根部。

**影响范围**：S-101（归档执行）。已完成：11 个逆向探查脚本移入
`re/archive/`，5 处文档路径引用同步修正。
另：T-110（knip）的 `ignore` 也依赖本判例的分类口径
（re/ 下脚本不参与死代码判定）。

### 判例五：TypeScript 7 与 ESLint 共存——官方双编译器（2026-10-09）

- **决策**：`package.json` 用npm 别名做双安装。
  `"typescript": "npm:@typescript/typescript6@6.0.2"`（API 消费者读这个）+
  `"@typescript/native": "npm:typescript@7.0.2"`（`tsc` 命令解析到这个）。
- **问题**：`typescript-eslint` 8 的 peer 上限是 `typescript >=4.8.4 <6.1.0`，
  而本项目用 TypeScript 7.0.2 —— 无交集，`npm install` 直接报 ERESOLVE。
- **根因**：TS 7 是 Go 原生编译器，**不提供编程 API**，而 typescript-eslint
  的类型感知规则必须读编译器的 AST 与类型信息。上游 issue #12518 已被关闭为
  "not planned"——修复在 TS 7.1 侧（稳定 API 至少还要数月）。
- **被否决的替代方案**：
  ① `--force` / `--legacy-peer-deps` —— **只是让 npm 跳过检查，缺失的 API 依然缺失**，
  后续会在运行时崩（社区已复现 ESLint 读`Cjs` 属性时崩）；
  ② 把 TypeScript 降到 6.x —— 能用，但放弃 TS7 的编译速度；
  ③ 放弃 ESLint —— 97 处 any 持续无拦截。
- **实测**：`npx tsc --version` = 7.0.2（原生），`npx tsc6 --version` = 6.0.3（API 侧）。
  两个版本号**刻意不同**。注意 `@typescript/typescript6` 声明 6.0.2，
  但它依赖 `@typescript/old@^6` 实际解析到 6.0.3——记录以命令输出为准。
- **退出条件**：typescript-eslint 的 peer 上限覆盖 TS7 后，删掉别名，
  恢复 `"typescript": "^7.0.2"` 单条依赖，删除 tsc6 相关脚本。
  核对命令：`node -e "console.log(require('typescript-eslint/package.json').peerDependencies.typescript)"`
- **同类事项**：遇到「工具的 peer 上限低于项目主版本」时，先查该工具的 issue
  与官方迁移指南，多数有别名方案；**不要用 `--force` 当最终解**。

**影响范围**：T-103（ESLint 接入时的阻塞点）。**退出条件**写在
eslint.config.mjs 顶部与 MANIFEST.md 的「双编译器说明」里：
typescript-eslint 的 peer 上限覆盖 TS7 后，删掉两个别名、恢复
`"typescript": "^7.0.2"` 单条依赖、删除 tsc6 相关脚本。
核对命令见该注释。**任何将来升级 TypeScript 的人都会撞上这一条。**

### 判例六：存量 lint 问题用 warn + 阈值，不设error（2026-10-09）

- **决策**：ESLint 的 `no-explicit-any` 与 `no-unused-vars` 设为 **warn**，
  用 `--max-warnings 154` 卡住增量；纯卫生规则（eqeqeq / no-var /
  prefer-const）保持 **error**。
- **理由**：ESLint 首次运行暴露 183 项（97 any + 53 unused + 其他）。
  若把any 设成 error，`verify` 与 CI 立刻永久红——而「让门禁常红」等于把门禁
  关掉，主规范同样禁止这种做法。既不能抬高标准来通过，也不能让门禁失效，
  因此分两步：存量可见可统计但不阻断，新增立即阻断。
- **实测有效**：注入一处新 `any` 后 lint 立即 exit 1：
  `✖ 155 problems (0 errors, 155 warnings)` + `too many warnings (maximum: 154)`。
- **配套事实**：`--max-warnings` **只管 warnings 不管 errors**——实测 155 个 error 时，
  `--max-warnings 155` 与 `154` 都仍 exit 1。所以存量降级必须靠规则设为 warn，
  阈值参数替代不了。
- **阈值数值的意义**：154 = 当前存量，**不是随手填的**。改动前先跑
  `npx eslint src`看真实计数。每清理一批就要同步下调——这让「清理进度」
  变成机器可判定的，而不是靠记性。

**影响范围**：T-103（存量分级）、T-111（死代码清理后升为 error）。
当前实测状态：`no-unused-vars` 已升 error（存量清零），
协议边界四文件的 `no-explicit-any` 已升 error，
其余文件的 any 仍是 warn + 阈值 81。
**阈值机制仍在生效**——新增一处 any 会让 verify 立刻失败。

### 判例七：配置工具优先于凭记忆，先查 schema 与实测（2026-10-09）

- **决策**：引入任何配置型工具前，先读它的 schema / 官方文档 / 源码，并用最小
  复现验证配置格式，**不凭记忆写配置**。
- **由来**：本轮接入四工具时，四次都因凭记忆写配置而出错——
  ① Stylelint 写 `number-leading-zero` / `string-quotes` 等 5 个规则，
     但 Stylelint 17 已移除它们（搬到 `@stylistic/stylelint-plugin`）；
  ② Stylelint 的 `declaration-property-value-disallowed-list` 把正则写在
     **键**上（`{"/^#/": [...]}`）——配置合法、不报错、**一条也拦不住**；
  ③ knip 的 `rules` 值写成 `"unused files"`，schema 直接拒绝；
  ④ knip 配置写成 `knip.config.mjs`，被**完全忽略**（不认 .mjs）。
- **代价**：④ 那种「配置被忽略」最危险——命令能跑、有输出、看起来一切正常，
  实际跑的是无配置模式。**判据必须是实测注入，不是看退出码。**
- **影响范围**：T-103（ESLint 规则分级查了 peer 上限）、
  T-104（Stylelint）、T-105（esbuild 查了 CHANGELOG）、
  T-110（knip）。同类事项适用。

### 判例八：门禁配置「合法」不等于「生效」，判据必须实测注入（2026-10-09）

- **决策**：任何新增的门禁规则，完成判据里必须包含**注入一个应被拦截的反例**
  并确认它真的失败。只看「命令退出码 0 / 配置能加载」不算验证。
- **两个实证**：
  ① Stylelint 的颜色禁用规则配错键与值的位置后，配置合法、运行无报错、
     但**拦截数为 0**（注入 `#f00` 仍 exit 0）；
  ② `verify` 结构自检若不写自指检查，`check:meta` 这一段可以被删掉而无人察觉
     ——「专门削弱它的动作本身没人拦」。
- **为什么这条要单列**：上述两种状态都无法通过任何常规检查发现
  （tsc 通过、lint 通过、命令成功）。**它们是「看起来一切正常」的失效**，
  而失效的门禁比没有门禁更危险——它让人以为有保护。
- **影响范围**：T-103、T-104、T-107（已按此判据实测注入验证），
  后续任何新增门禁同样适用。

### 判例九：knip 报告不作门禁，直到误报清零（2026-10-09）

- **决策**：`npm run knip` 可执行、可出报告，但**不接入 verify**，
  且 `rules.exports` 设为 `warn`。
- **理由**：首份报告的 51 个「未使用导出」里，大部分是误报——
  knip 只看 TS import 关系，看不到 index.html 里通过事件绑定/字符串调用的那些。
  已抽样核实：`transact` 在 device-4k.ts 与 xm2we.ts 有真实调用，
  `isSafeToOpen` / `openGuarded` 在 xm2we-ui.ts 有调用。
  **一个高误报率的门禁会诱导人忽略整个报告**，比不做更糟。
- **确认无人调用、已记入 T-111 待处置的**：
  `confirmBeta` / `armBeta` / `pollAck8k` / `fillSelect` / `fwStr`。
- **升为门禁的条件**：误报逐项核实完、且能配置得只剩真问题。
- **影响范围**：T-110（已完成接入）、T-111（处置上述符号），
  以及将来任何「引入静态分析工具」的决策。

### 判例十：覆盖率在本项目当前测试架构下不可得（2026-10-09）

- **结论**：T-108（覆盖率基线）**标记为不可修复，不列入队列**——
  理由不是「没时间」，而是**实测证明拿不到有意义的数字**。
- **实测过程**（三步）：
  1. `NODE_V8_COVERAGE` 能生成数据，但记录到的 URL 全是 `re/.test_*.mjs`
     —— esbuild 把测试与被测源码打包在一起，**TS 源路径已丢失**；
  2. 给 run_test.mjs 加 `sourcemap: true` 后，`c8 --include="src/**"`
     得到 **All files 0%** —— c8 默认不做 source-map remapping，
     找不到 `src/` 下的任何文件；
  3. 不带 `--include` 时 c8 能出数字（All files 91.96%），
     但那统计的是 **打包产物**，且**包含测试代码自身**——
     拿「测试文件跑到了多少」当「源码被覆盖多少」是错的。
- **可行路径及其代价**（都不划算）：
  - 迁移到 Vitest：违反判例二「不引入 Vitest」；
  - 改用 tsx/直接跑 TS：要改 9 个测试的加载方式，
    且 `test_presence.ts` 末尾有 `process.exit(0)`（判例三为它专门调整过
    run_test.mjs 里的顺序）；
  - c8 开 `--all`：仍只覆盖被 import 的文件，而
    `main.ts` 依赖 DOM，无法在 Node 里跑。
- **影响范围**：T-108 关闭。若将来判例二被推翻（允许引入 Vitest），
  本条同时失效，可重新评估。
- **顺带的真实收获**：本次实验发现 `.gitignore` 漏了
  `re/.test_*.mjs.map` 与 `coverage/`，已补——
  否则一旦有人试覆盖率就会误提交几十个生成文件。

### 判例十一：安全闸门的「拦截」必须是不发送，抛异常不算（2026-10-09）

- **决策**：任何「拦截 / 拒绝 / 阻断」的实现，**拦截分支必须 `return`**，
  不允许靠抛异常来「顺便阻止」后续动作。
- **由来**：代码审计发现 `connect.ts` 的 XM1 发送闸门（`sendFeatureReport`
  的 monkey patch）在拦截分支里log + 解 armed + `xm1WriteDisabled()`（抛异常）
  之后，**继续 fall-through 到 `return realSend(...)`**——
  那条非常规报文**已经发给设备了**。
- **为什么它能长期存活**：
  ① 闸门上方的注释写着「一律拦截」，**代码与自己的注释矛盾**；
  ② 抛异常确实「看起来拦住了」（调用方拿到异常、流程中断）；
  ③ `throw` 只能阻止**后续动作**，阻止不了**已发生的发送**——
     这是安全闸门特有的失效模式。
  该闸门的存在意义就是防2026-10-09 那次事故（发0xA0 全零 blob 导致
  DPI/CPI 清零），**它防的正是自己**。
- **配套：测试的观测点必须绕开异常。**
  修复后写的回归测试**第一版在缺陷版上也是全绿**——
  因为 `xm1WriteDisabled()` 抛的异常被测试自己的 `try/catch` 吃掉，
  「抛异常了」这条断言成立，而计数用的是被异常中断的路径。
  改法：加一个不受异常影响的底层计数 `wireSends`
  （真正「上 wire」的次数，任何分支都自增），
  并让被测逻辑可切换为「旧缺陷行为」做**反向自证**。
  最终断言含：★ 反向自证：旧行为下同样报文确实上 wire。
- **影响范围**：所有写入/发送/删除类闸门（transport.guarded、
  device-xm1.xm1Guard*、guard4k）。新增闸门时，测试必须包含
  「应被拦截的输入**没有产生副作用**」这条断言，而不只是「抛了异常」。
- **推广**：断言「被拒绝」时，光断言异常/返回码不够——
  **必须同时断言「副作用没有发生」**。

### 判例十二：tsc 不覆盖 re/ —— 测试代码没有类型检查（2026-10-09）

- **事实**：`tsconfig.json` 只含 `src/`，`npm run check`（tsc --noEmit）
  **对 `re/` 下的 9 个测试文件完全不生效**。
- **表现**：本次写回归测试时把 import 路径写错（`xm1Guard*`在
  `src/protocol.ts`，我写成了 `src/device-xm1.ts`），
  **tsc 报 0 错**，只有 `npm test` 里的 esbuild 构建才失败。
- **含义**：测试代码处于类型检查之外—— 它们验证的正是最关键的安全逻辑，
  却最容易出现拼写类错误。
- **待办**：给 tsconfig 增加 `re/`（需先确认 `_domstub.ts` 等
  测试专用的宽松类型能否通过），或单独一个 tsconfig.eslint.json 覆盖。
- **影响范围**：T-108（覆盖率）关闭的原因之一也与本条相关——
  测试体系与 tsc 是两套割裂的通道。

### 判例十三：tsc 覆盖 re/ 落地——三个新发现（2026-10-09）

- **结论**：判例十二的待办已完成。`tsconfig.json` 的 `include` 扩到
  `["src/**/*.ts", "re/**/*.ts"]` 并加 `"types": ["node"]`，
  re/ 下 9 个测试文件从此受 `npm run check` 类型检查，`verify` 全绿。
- **落地暴露的 10 处真实类型问题**（探测时 tsconfig 只扩 include、不加 types）：
  ① 13 处 `process`/`node:fs`/`node:path`/`node:url` 找不到（见发现一）；
  ② 5 处 TS2367（见发现二）；③ 1 处 TS2345——`PID_FAMILY4` 是
  `Record<number, string>`，测试用 truthy 判断得了 `string | boolean`，改为
  `!== undefined`；④ 2 处 TS7006——回调参数 `(v)` 补 `: number`；
  ⑤ 2 处 TS2740/TS2739——`S.dev` 桩补 `as HIDDevice`、`S.xm1Edit` 桩补全字段。
- **发现一：TS 7（Go 原生编译器）不自动包含 `node_modules/@types`**。
  不写 `types` 字段时，即便 `@types/node` 已物理存在，tsc 仍报 13 处
  `Cannot find name 'process'`。必须显式 `"types": ["node"]`。
  这与 TS 6「默认自动包含 @types」的行为不同（实测：两编译器在显式 types 后
  结果一致，但 TS7 的默认是收紧的）。凡 TS7 项目接 Node 类型，都需显式声明。
- **发现二：TS2367 是 tsc 控制流分析的固有局限，不是测试 bug**。
  `const S` 的属性在 `S.flag = true` 后被窄化为字面量 `true`，而跨函数 /
  跨异步的全局状态变更（如 `resetToInitial()` 内部改 `S.frameAligned`）
  tsc 追踪不到，于是后面的 `S.flag === false` 被误判为「恒假」。
  最小复现证明 tsc 6 与 tsc 7 都报。**断言语义是对的**（运行时确实复位），
  修复是解窄化：boolean 字段断言改用 `!S.flag`（等价且不触发 TS2367）。
  判定「是否真 bug」的方法：确认被调函数体内确实改了该字段。
- **发现三：`@types/node` 此前只是 commitlint 的传递依赖，不显式声明会静默失效**。
  已提升为显式 devDependency `@types/node@^22`（匹配本机 Node 22）。
  传递依赖可被上游移除或改版本，而 `types:["node"]` 一旦声明就依赖它存在。
- **影响范围**：re/ 下 9 个测试文件从此受类型检查；将来改测试时的拼写类错误
  （判例十二记录的那次 import 路径写错）会在 `npm run check` 阶段就被拦住。

### 判例十四：三项待决项的裁决（D-1 / D-2 / D-4，2026-10-09）

- **D-1 文档语言 → 全量转英**（用户选 C，风险最高）。范围覆盖全部文件
  （README/根级文档、docs/、re/ 结论文档、src/ 源码注释、re/ 脚本注释）。
  ⚠️ 执行边界：TODO.md 记录的隐患三「取证链被切断」——`re/upstream/SOURCES.md`
  的中文原文（官方工具原始字符串）是「从哪个二进制、哪个字符串得出」的追溯依据。
  执行时**保留取证链原文、翻译其余**（取证链是不可逆证据，先留证再动手）。
- **D-2 功能补齐 → 全补到官方对齐**（用户选 C）。7 项：LED 开关 / 灯效模式 /
  滚轮灯亮度 / Logo 灯亮度 / DPI 灯亮度 / 自定义颜色 / 左手模式（+按键重映射 UI）。
  ⚠️ 每项先做偏移取证（差分实验，依赖真机），按键重映射涉 0x16 双块写，
  风险等级高于现有任何一项。补齐是「放开」，不是「收紧」。
- **D-4 回归验证 → 现在验证**（用户选 A）。用户真机复核 CPI 归一化改动，
  步骤见 `docs/cpi-step-check.md`。属需用户操作的外部依赖，不进入自动推进路径。
- **影响范围**：D-1 → 新增翻译任务；D-2 → 新增 7 项设置的取证+实现任务；
  D-4 → 待用户真机执行。D-3 维持搁置（见判例一/TASKS.md）。

### 判例十五：工具「未安装」的判定必须跨渠道复核（2026-10-09）

- **由来**：为解推送阻塞，我在 bash 里检测 `gh` 命令，得出「本机未安装 `gh` CLI」，
  并据此把这个结论写进了 `docs/推送前需授权.md`、TASKS.md 与判例一，
  还把「新建 PAT」上升为推荐路线、给`gh auth refresh` 判了死刑。
  **随后用户在自己的终端里直接跑起了 `gh auth refresh`—— 结论直接被推翻。**
- **真实原因**：`gh` 装在 `C:\Program Files\GitHub CLI\gh.exe`（v2.102.0，winget），
  **不在 Git Bash 的 PATH 里**。在 bash 里问「装没装」，得到的是**假阴性**。
- **修法**：改用 PowerShell `Get-Command gh`、查固定路径、以及 winget list 三条渠道，
  确认已安装。随后 `gh api -X GET user -i` 读 `X-OAuth-Scopes`，
  直接拿到 scope 为 `gist, read:org, repo`——**缺 `workflow` 成为数据侧证据**，
  而非推测。
- **为什么值得单列**：这不是「小失误」，而是**一个错误结论被写进了三份文档、
  并据此否决了正确路线**。若用户没纠正，项目会多走一段弯路（新建一个不必要的 PAT）。
  与判例七同源但更进一步：判例七说「不凭记忆写配置」，本条说
  **「不凭单一渠道下结论」——工具报「不存在」时，先确认是「真没有」还是「没找对地方」**。
- **判定口诀**：**一个渠道报告「不存在」时，至少换一条独立渠道复核。**
  尤其当结论会**否决一条已知可行路线**时，更必须复核。
- **影响范围**：任何依赖「某工具是否可用」的判断。本项目已有同类经验——
  判例三里 `re/` 下脚本因路径写错而被判「未接线」，靠跨文件引用检查才分清
  「残留」与「漏接线」。
