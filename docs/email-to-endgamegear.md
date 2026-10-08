# 致 Endgame Gear 官方的联系邮件

- **收件**：customerservice@endgamegear.com（Pro Gamersware GmbH 客服）
- **目的**：介绍本项目，请求官方的协议文档支持/认可
- **说明**：正文为英文（官方为德国公司，客服语言英文/德文），附中文对照供你审阅

---

**Subject:** Open-source web configurator for Endgame Gear wireless mice — request for protocol documentation / cooperation

Dear Endgame Gear team,

I am writing to you as the maintainer of an independent, open-source **web-based configuration tool** for your wireless gaming mice (XM2w 4k, XM2w 4k v2, OP1w 4k, OP1w 4k v2). The tool runs entirely in the browser using the WebHID API — no drivers, no installation — and lets users adjust CPI stages, lift-off distance, polling rate, power settings, and click filters on any OS where Chrome or Edge runs, including Linux and macOS where no official client exists today.

The USB/HID configuration protocol was reverse-engineered by the community (github.com/johanneszab/vole, `re/PROTOCOL.md` — based on static analysis of your unobfuscated Windows client plus USB captures and hardware validation). Our implementation follows it faithfully, including the vendor quirks (the under-declared payload length of cmd 0x15, the probe-before-retry recovery via cmd 0x0F, etc.). Importantly, the tool:

- **only reads and writes user configuration** — it never touches firmware, the bootloader, or pairing security;
- performs a true read-modify-write against the device's own config blob, so it can round-trip cleanly with your official Windows tool;
- is free, source-available, and clearly attributed as unaffiliated with Endgame Gear.

**What we are asking for:**

1. **Official protocol documentation** — even an internal/annotated version shared under a friendly understanding would let us replace reverse-engineered guesses (glass-mode LOD encoding, the undocumented 0xA0 report layout details, the notification channel) with verified facts, making the tool safer for your customers.
2. **A statement of tolerance or endorsement** — a short note that community tools like this are acceptable to use, or even a link from your Downloads/Community page for Linux/macOS users.
3. **A contact for technical questions** — ideally an engineer familiar with the mouse firmware, for edge cases (e.g., cmd `0x12` response timing on the 0xA0 bulk report).

We believe a browser-based configurator complements your Windows client: it covers Linux/macOS/ChromeOS, needs zero installation, and costs you nothing to maintain. We would gladly credit Endgame Gear prominently, follow any branding guidelines you may have, and coordinate releases with your firmware updates.

Thank you for your time, and for making excellent hardware.

Best regards,
<你的名字>
<项目 GitHub 链接>

---

## 中文对照（供你审阅，不必发送）

主题：Endgame Gear 无线鼠标的开源网页配置工具——请求协议文档/合作

尊敬的 Endgame Gear 团队：

我是 XM2w 4k / XM2w 4k v2 / OP1w 4k / OP1w 4k v2 无线游戏鼠标的独立开源网页配置工具维护者。该工具基于 WebHID API 完全在浏览器中运行——无需驱动、无需安装——让官方客户端尚未覆盖的 Linux 和 macOS 用户也能调整 CPI、抬离距离、回报率、电源与点击过滤设置。

USB/HID 配置协议由社区逆向完成（johanneszab/vole 仓库，基于贵司未混淆的 Windows 客户端静态分析 + USB 抓包 + 真机验证）。我们的实现忠实遵循该协议，包括官方工具的时序怪癖。需要强调：本工具只读写用户配置，不触碰固件、引导程序或配对安全机制；采用对设备配置 blob 的真实读-改-写，可与官方 Windows 工具双向兼容。

我们的请求：

1. **官方协议文档**——即使是非公开/注释版，也能让我们用已验证的事实替换逆向猜测，让工具对您的用户更安全；
2. **容忍或认可的声明**——在下载页/社区页给 Linux/macOS 用户一个链接即可；
3. **技术问题联系人**——熟悉鼠标固件的工程师，处理边缘情况（如 0xA0 大报告的响应时序）。

我们相信网页版配置器是 Windows 客户端的良好补充：覆盖 Linux/macOS/ChromeOS、零安装、维护成本为零。我们乐意醒目署名 Endgame Gear，遵守品牌规范，并与固件更新协调发布。

感谢您的时间，也感谢你们做出的优秀硬件。

## 发送前检查清单

- [ ] 把 `<你的名字>` 和 `<项目 GitHub 链接>` 替换为真实信息（所以最好先把仓库和 GitHub Pages 搭好，邮件里有链接更有说服力）
- [ ] 若已有真机验证截图/日志，可附上 1–2 张
- [ ] 备选渠道：help.endgamegear.com 提交工单 + 官方 Discord（官网页脚有入口，社区团队常驻，响应通常快于邮件）



我愿意把把代码全权交给官方维护 并期待能有官方制作的网页版本
我只是个很喜欢egg的中国粉丝 对Johnny R创造出的XM系列表示崇高的敬意 我的一生所爱
并期待你们的回信
附上购买记录截图 三只鼠标同框图
