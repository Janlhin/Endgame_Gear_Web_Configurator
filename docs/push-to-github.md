# 推到 GitHub 的收尾步骤（只差一步，需要你本人操作）

仓库**已创建**（公开、空）：https://github.com/Janlhin/Endgame_Gear_Web_Configurator

推送被 GitHub 拒绝，原因只有一个：

```
refusing to allow an OAuth App to create or update workflow
`.github/workflows/deploy.yml` without `workflow` scope
```

本机 `gh` 的 token 现有 scope 是 `gist, read:org, repo`，**缺 `workflow`**。
补这个 scope 只能由你本人操作（浏览器授权，我无法代做）。

## 一、补权限（一次性）

在终端里运行：

```bash
gh auth refresh -h github.com -s workflow
```

它会打印一个一次性验证码并打开浏览器 → 粘贴验证码 → 确认授权。
完成后 `gh auth status | grep -i scope` 应看到 `'workflow'` 出现在列表里。

## 二、推送

```bash
cd C:/Users/Janlhin/WorkBuddy/2026-10-08-19-20-54/Endgame_Gear_Web_Configurator
git push -u origin main
git push origin v1.2 v1.3
```

## 三、开 Pages（一次性，网页点两下）

仓库 Settings → Pages → Build and deployment → Source 选 **GitHub Actions**。

推送后 `deploy.yml` 会自动跑（push 到 `main` 触发），产出：
`https://janlhin.github.io/Endgame_Gear_Web_Configurator/`

若没自动触发：Actions 标签页 → `deploy pages` → Run workflow。

## 四、确认 CI 生效

`verify.yml` 有两个 job：`verify`（ubuntu）与 `ui`（windows-latest）。
第一次推送后应看到两条独立结论，**互不豁免**。

## 备选：不想给 `workflow` 权限

把两个 workflow 文件从提交里移出、推到仓库后在网页上手动添加，
或先只推 `index.html` 与源码（去掉 `.github/`），CI 与 Pages 之后单独处理：

```bash
# 临时方案：本地移走 workflow 再推，之后再补
mv .github/workflows /tmp/wf-backup && git add -A && git commit -m "temporarily move workflows" && git push -u origin main
```

不推荐——会让首次推送的历史里出现"先删后加"的噪音。

## 顺带说明

- 分支已从 `master` 改名为 `main`（GitHub 默认名，`deploy.yml` 的触发条件也是 `main`）。
- 部署只上传 `index.html`，**不在 CI 里重新构建**——访客下载到的就是本地
  `npm run verify` 验过的那个文件，逐字节相同。
- 部署前有两条断言：外部 `<script src>` / `<link href>` 引用数为 0（保证线上与离线双击一致）、
  清单卡必须真的渲染进产物（`md2html` 静默失效的 canary）。
- 待推送内容：79 个提交、2.1 MB、146 个文件，**不含任何 exe / zip / 真机快照 / 第三方源码**
  （`.gitignore` 已逐条守住，`re/upstream/MANIFEST.md` + `fetch.sh` 保证可复现）。