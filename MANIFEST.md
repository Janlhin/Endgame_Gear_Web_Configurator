# MANIFEST.md — 第三方来源登记簿

> 本文件是**总登记**：登记仓库引入的每一个第三方依赖、二进制与源码，
> 以及**它证明了什么 / 用来做什么**。逆向取证的详细凭据（SHA256、URL、代码偏移）见
> [`re/upstream/MANIFEST.md`](re/upstream/MANIFEST.md)。
>
> 规则：**第三方二进制与厂商源码不入库**（体积 + 版权），只保留可复现的凭据与一键复现脚本。

## 一、构建期依赖（npm，`devDependencies`）

| 包 | 版本 | 许可证 | 用途 | 为何选它 |
|---|---|---|---|---|
| `esbuild` | 0.24.2 | MIT | TS → JS 打包 | 唯一必需：要把 `src/*.ts` 打成单文件 IIFE。MIT、无原生编译、秒级 |
| `sass` | 1.105.1 | MIT | SCSS 编译 | 样式层用 SCSS 维护（项目强制约定），需要编译器 |
| `typescript` | 7.0.2 | Apache-2.0 | 类型检查（`tsc --noEmit`） | 唯一的静态类型通道 |
| `markdownlint-cli2` | 0.23.3 | MIT | Markdown 结构校验（`npm run lint:docs`） | 主规范指定的文档 lint 通道，MIT、无原生编译。实测拦下 2 处真实文档缺陷（表格列数缺失、表格被换行截断） |
| `markdown-link-check` | 3.15.0 | MIT | 断链检查（**暂未接入**，见下方说明） | 主规范指定的断链通道。在本机网络下会把真实存在的链接判为死链，故只列为可选工具 |
| `husky` | 9.1.7 | MIT | Git 钩子管理（`pre-commit` / `commit-msg`） | 提交门禁的落地方式。用现成工具而非手写 `.git/hooks`——手写的钩子不会被版本管理跟踪，换机器就失效 |
| `@commitlint/cli` | 21.2.3 | MIT | 提交信息校验（Conventional Commits） | 主规范强制「Conventional Commits + commitlint」。MIT、无原生编译 |
| `@commitlint/config-conventional` | 21.2.3 | MIT | commitlint 的 Conventional Commits 规则集 | 与 cli 配套；类型枚举在 `commitlint.config.cjs` 里按本项目需要扩展 |

> **`markdown-link-check` 未接入 `verify` 的原因**（2026-10-09 实测）：
> 对 `MANIFEST.md` 跑出5 条"死链"，但用 `git ls-remote`逐个复核后，
> `Creationsss/egctl`、`johanneszab/vole`、`okms/xm2we-linux`、`zexsso/OP1-WebAPP`
> **四个仓库全部真实存在**；返回的是 504（超时）、403（npm 反爬）与 0（连接失败），
> 属网络与匿名访问限制，不是断链。
> 在此环境把它接入门禁会造成持续假失败，且会诱导人去删真实存在的来源登记——
> 因此**降级为可选工具**，只保留依赖。断链防护改由下面这条更可靠的通道承担。

**当前断链防护**：`npm run lint:docs` 的 markdownlint 校验内部锚点与
`link-fragments`（MD051，文件内锚点是否存在）。跨文件的相对路径引用
（`docs/xxx.md`、`re/xxx.md`）由同一条命令校验——路径写错会立即报错。
外部 URL 的可达性改为**人工核对**，理由见上。

**运行时依赖：0 个。** 交付的 `index.html` 不加载任何外部字体、脚本、图片或 CDN 资源 ——
这一点由 `build.mjs` 的产物断言与 `docs/` 中的说明共同守护。

## 二、逆向取证用的第三方源码（**不入库**，按需 clone）

| 项目 | 许可证 | 可用性 | 用来得出 |
|---|---|---|---|
| [niansa/UnofficialEGGMouseConfig](https://github.com/niansa/UnofficialEGGMouseConfig) | **Unlicense**（公有领域） | ✅ 可自由借鉴 | 8k 1041B 配置结构体定义、按键 7×7B 记录、`custom_flags@126` |
| [Creationsss/egctl](https://github.com/Creationsss/egctl) | AGPL-3.0-or-later | ⚠️ **只取事实，不抄代码** | 8k 偏移与命令表、独立验证 `0x1978` |
| [lvlanson/Endgame-Gear-XM2-8k-v2-Linux-Configurator](https://github.com/lvlanson/Endgame-Gear-XM2-8k-v2-Linux-Configurator) | 无 LICENSE | ⚠️ 只读参考 | XM2 8k v2 = `0x1980`（第三源交叉验证） |
| [itchyfeetleech/OP1we-Control](https://github.com/itchyfeetleech/OP1we-Control) | MIT | ✅ | WE 族 17B 帧格式、opcode 白名单、`0x0E` 风险提示 |
| [@openmouse/protocol](https://www.npmjs.com/package/@openmouse/protocol)（npm） | AGPL-3.0-or-later | ⚠️ **只取事实** | 浏览器 WebHID 协议实现（**发现途径本身即"包注册表是主渠道之一"的例证**） |
| [johanneszab/vole](https://github.com/johanneszab/vole) | MIT | ✅ | 4k 族协议层的唯一依据（Ghidra + USBPcap + 真机验证） |
| [okms/xm2we-linux](https://github.com/okms/xm2we-linux) · [daviddwk/xm2we-util](https://github.com/daviddwk/xm2we-util) | MIT | ✅ | XM2we 2020 有线/2.4G 族的完整协议文档与两个独立实现 |
| [zexsso/OP1-WebAPP](https://github.com/zexsso/OP1-WebAPP) | MIT | ✅（部分文件已归档在 `re/upstream/`） | 2020 有线族协议整理 |

> **合规口径**：AGPL 源码与本项目（GPL-3）不兼容，一律**只取协议事实**
> （命令码、偏移、枚举值——不受版权保护），实现方式全部自写。
> 完整清单与许可证判定见 `docs/community-code-scan.md`。

## 三、厂商二进制（**不入库**）

| 类别 | 内容 | 凭据与复现 |
|---|---|---|
| 官方配置工具（6 款） | XM2w-4k / OP1w-4k / XM2w-4k-v2 / OP1w-4k-v2 / OP1-8k-v2 / OP1-8k-Purple-Frost-LE | `re/upstream/MANIFEST.md` 第一节（URL + SHA256）+ `bash re/upstream/fetch.sh` |
| 官方 8k 工具包（v1.12 / v1.07） | XM2-8k、OP1-8k、XM2-8k-v2、OP1-8k-v2 的 release | 同上（体积大，按需单取） |
| 厂商 WE 系列配置工具 | `Cfg.ini`（设备表 + DPIRANGE） | 结论已抄进 `re/upstream/SOURCES.md`；安装包体积大不入库 |
| 厂商 Electron 工具（XM1r / OP1 / OP1 RGB） | 第四协议族命令表 | 提取物 `re/upstream/family4_comtype.txt`（KB 级，无法再生） |
| XM1 Configuration Software v1.09 | XM1 协议的唯一一手来源 | **用户本机** `E:\IDM\Compressed\`，仓库不留副本；重跑分析需从该安装包解包 |

## 四、抓取与扫描脚本（本仓库自有，不入库任何第三方内容）

| 脚本 | 职责 |
|---|---|
| `re/upstream/fetch.sh` | 按 MANIFEST 重新下载二进制并校验 SHA256 |
| `re/upstream/disasm.py` | capstone 封装：找立即数带上下文、字符串 xref、列构建路径 |
| `re/upstream/tool8k_pids.py` / `vidpid_hunt.py` | 官方 exe 的 VID/PID 提取 |
| `re/upstream/license_scan.py` / `license_raw.py` | 许可证判定（API + raw 双通道） |
| `re/upstream/sg_search.py` | Sourcegraph 匿名代码检索（grep.app 429 的替代） |

## 五、字体与图标

无外部字体/图标依赖。界面使用系统字体栈（`scss/_tokens.scss` 的 `$font-stack`），
日文/韩体/繁体中文分别用 `:lang()` 指定字体栈，避免汉字套用简体字形。
图标为纯 CSS 形状与内联字符，未引入图标字体包。
