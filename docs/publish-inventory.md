# 发布清点：哪些可以公开，哪些不可以

> 2026-10-09 · 推送前的最后一次审计。判据不是"我觉得"，是逐条实测。

## 一、结论

**可以公开**：源码、构建脚本、8 语言界面、协议结论、校验脚本、生成的 `index.html`。
合计约 140 个文件 / 2 MB，无凭据、无个人数据、无厂商二进制。

**曾被误放入、已清出**（7 个文件，见第三节）：第三方源码 7 处。

## 二、可以公开的部分（逐项依据）

| 内容 | 判据 |
|---|---|
| `src/`（27 个 .ts） | 自写。协议实现只用公开的 HID 规范与社区交叉验证的字节偏移 |
| `index.template.html` / `scss/` / `build.mjs` | 自写，零运行时依赖 |
| `index.html`（285 KB 单文件） | 构建产物。**外部 `<script src>`/`<link href>` 引用数 = 0**，离线双击可用 |
| `docs/`（18 个 .md） | 自写文档。含参与测试流程与志愿者清单 |
| `re/*.py`（44 个分析脚本） | 自写。用于反汇编取证，可复现 |
| `re/test_*.ts`（8 个测试） | 自写。217 项断言，无需硬件即可验证 |
| `README` / `CHANGELOG` / `DECISIONS` / `AGENTS` / `MANIFEST`（根 + re/upstream） | 自写文档 |
| `.github/workflows/`（2 个） | 自写 CI 配置 |

**许可证**：GPL-3.0（`LICENSE`）。这是本项目唯一的对外许可声明，已在库。

**无凭据、无个人数据**：实测无 `.env` / 凭据文件 / 真机序列号；文档里出现的
`customerservice@endgamegear.com` 与 `support@endgamegear.com` 是厂商公开客服地址。

## 三、曾被误放入、已清出的（审计发现）

项目铁律写着「官方 exe / 第三方源码不入库」，但**这条规则没被执行**，因此已破：

| 文件 | 来源 | 体积 |
|---|---|---|
| `op1web_DeviceView.vue` | zexsso/OP1-WebAPP | 5 KB |
| `vercel_style.css` | zexsso/OP1-WebAPP | 28 KB |
| `op1web_device.ts` | zexsso/OP1-WebAPP | — |
| `op1web_theme.ts` | zexsso/OP1-WebAPP | — |
| `op1web_PROTOCOL.md` | zexsso/OP1-WebAPP | — |
| `eggweb_protocol.js` | daviddwk/xm2we-util | — |
| `xm2we_util_main.c` | xm2we / johanneszab | — |

**根因**：`.gitignore` 只覆盖了 `_src/`、`*.exe`、`*.zip`，**`.vue` / `.css` / `.ts` 三类
完全没有规则** —— 按扩展名清理时漏掉的。已补规则，并加 `re/test_repo_hygiene.ts`（14 项
断言）把这条铁律变成可执行检查。

**结论没有丢失**：从这些源码得出的结论（设计令牌、协议布局）早已写进
`re/upstream/SOURCES.md`，删的是源码，留的是事实。

## 四、留在本地、不进仓库的部分

这些**在磁盘上但被 `.gitignore` 拦住**，是有意的：

| 内容 | 为什么留 |
|---|---|
| 6 个官方工具 `.exe` | 反汇编取证要反复用；`fetch.sh` + `MANIFEST.md`（含 SHA256）可随时重下 |
| 3 个 XM1 真机配置快照 `.bin` | 差分实验的基线；**含用户设备数据**，绝不能进仓库 |
| `re/upstream/_src/`（已删） | 社区源码，`git clone --depth 1` 即可 |

判据是"有没有 ignore 规则盖住"，而不是"当前有没有被跟踪" —— 前者防未来，后者只防现在。

## 五、仍然存在、且**不可能**由清点解决的风险

| 风险 | 说明 |
|---|---|
| **逆向的合法性边界** | 本项目是**第三方实现**，不是官方工具。GPL-3.0 保护的是我们的代码，不授权逆向行为本身。使用者需自行判断所在司法辖区的合法性。 |
| **厂商商标** | 名称仅用于**说明兼容目标**，README 已声明与 Endgame Gear / Pro Gamersware GmbH 无隶属关系。 |
| **协议事实的证据等级** | 部分字段来自社区交叉验证（B 级）而非真机（A 级）。已在 `AGENTS.md` 固化分级制度，`docs/field-parity.md` 逐项标注。 |
| **写入可能损坏设备配置** | 无法由静态审计消除。缓解手段是闸门 + 确认框 + 备份 + 回读校验。 |
| **文档承诺与实现的差距** | 只能靠校验流水线发现，已配 CI（`verify.yml` 两个 job 互不豁免）。 |

**这份清单的作用是划清边界：能说的是"我们发布了什么、依据是什么"，
不能说的是"这样做不会有任何问题"。**
