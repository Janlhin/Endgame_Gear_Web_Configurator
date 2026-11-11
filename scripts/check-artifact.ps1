#requires -Version 7.4
<#
.SYNOPSIS
    产物一致性：入库的 index.html 必须等于「当前源码 + 文档」构建出来的东西。

.DESCRIPTION
    规范《用 AI 做项目：强制工程校验规范》v1.21.0 §文档先行 · 三层校验的第二层
    「与代码一致」：文档与代码的一致性应当由生成关系产生，再用 git diff 判定，
    而不是靠人工复读比对。

    本项目存在真实的生成关系：`docs/test-checklist.md` 与 `test-checklist.en.md`
    是唯一真相源，`tools/build.mjs` 在构建时把它们渲染进 index.html
    （见 AGENTS.md §4.6）。因此「改了清单却忘了重建产物」是可判定的缺陷，
    而不是风格问题。

    这个门禁之所以成立，前提是构建**可复现**：build.mjs 的指纹是内容哈希
    （DECISIONS.md D-004），同样的输入必得同样的字节。若指纹含时间戳或 commit，
    本脚本会把每次提交都判成不一致。

    先构建再比对，因此本脚本可独立运行，不依赖调用者的执行顺序。

.EXAMPLE
    pwsh -NoLogo -NoProfile -File ./scripts/check-artifact.ps1
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# 手工检查 $LASTEXITCODE，故不开启原生命令的终止错误语义（理由见 verify.ps1 顶部）。
$PSNativeCommandUseErrorActionPreference = $false

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $RepoRoot

$targets = @('index.html')

# 先构建：比对的对象必须是「现在的源码 + 文档」产出的东西，不是上一次的残留。
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "产物一致性：构建失败，无法比对（退出码 $LASTEXITCODE）。" -ForegroundColor Red
    exit $LASTEXITCODE
}

# 产物主体是压缩成少数几行的超长代码，整份 unified diff 的单行可达数百 KB，
# 打进 CI 日志会把日志淹没、也让真正的差异看不见（GitHub 会截掉超长行）。
# 所以这里不直接输出 diff：先记行数统计，再只打印前几行差异且截断到 160 字符。
$stat = ((& git --no-pager diff --numstat -- @targets) -join '; ') -replace "`t", ' '
& git --no-pager diff --exit-code -- @targets | Out-Null
# ⚠️ 必须把 git 的退出码**先存下来**：后面要跑诊断命令，而 $LASTEXITCODE 会被
# 那些命令覆盖。若直接 `exit $LASTEXITCODE`，门禁会被最后一条命令的退出码带走
# （node 成功 → 0 → 门禁失效）。这正是 2026-11-11 踩过的坑。
$diffExit = $LASTEXITCODE
if ($diffExit -ne 0) {
    Write-Host "产物与源码/文档不一致（增/删 行数）：$stat" -ForegroundColor Yellow
    & git --no-pager diff -U0 -- @targets |
        Where-Object { $_ -match '^[-+]' -and $_ -notmatch '^(\+\+\+|---)' } |
        Select-Object -First 4 |
        ForEach-Object {
            if ($_.Length -gt 160) { $_.Substring(0, 160) + ' …（本行过长，已截断）' } else { $_ }
        }
    # 产物主体是压缩成少数几行的超长代码，光看「第几行不同」仍定位不到。
    # 这里再精确到**首个不同的字节**，并把该处上下文（两侧各一段）打出来。
    $diag = @'
const cp = require("child_process");
const fs = require("fs");
const target = process.argv[1];
const a = cp.execFileSync("git", ["cat-file", "blob", "HEAD:" + target], { maxBuffer: 1 << 28 });
const b = fs.readFileSync(target);
/* 指纹必然不同（它就是内容哈希），而且它出现在**两处**：页面页脚的 build xxxxxxxx
   与 bundle 里的 BUILD_STAMP="xxxxxxxx"。两处都要掩掉，否则永远撞在指纹上。 */
const stampOf = (buf) => {
  const m = /build ([0-9a-f]{8})/.exec(buf.toString("latin1"));
  return m ? m[1] : null;
};
const sa = stampOf(a), sb = stampOf(b);
const mask = (buf) => {
  let s = buf.toString("latin1");
  if (sa) s = s.split(sa).join("XXXXXXXX");
  if (sb) s = s.split(sb).join("XXXXXXXX");
  return Buffer.from(s, "latin1");
};
const ma = mask(a), mb = mask(b);
let i = 0;
while (i < ma.length && i < mb.length && ma[i] === mb[i]) i++;
console.log(`掩掉指纹后的首个差异字节偏移: ${i}  (已提交长度 ${ma.length}, 重建后长度 ${mb.length})`);
const win = (buf) => buf.slice(Math.max(0, i - 70), i + 110).toString("utf8").replace(/[^\x20-\x7e]/g, ".");
console.log("已提交 : " + win(ma));
console.log("重建后 : " + win(mb));
'@
    & node -e $diag $targets[0]
    [Console]::Error.WriteLine('产物与源码/文档不一致：index.html 需要重建并提交。')
    [Console]::Error.WriteLine('常见原因：改了 docs/test-checklist*.md、src/ 或 scss/ 之后没跑 npm run build，')
    [Console]::Error.WriteLine('或者跑了 build 但没把产物一并提交。')
    exit $diffExit
}

$untracked = @(& git status --porcelain -- @targets | Where-Object { $_ -match '^\?\?' })
if ($untracked.Count -gt 0) {
    [Console]::Error.WriteLine('产物未纳入版本控制：' + ($untracked -join '; '))
    exit 1
}

Write-Host "产物一致：$($targets -join ', ') 等于当前源码与文档的构建输出。" -ForegroundColor DarkGreen
exit 0
