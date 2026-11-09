#requires -Version 7.4
<#
.SYNOPSIS
    根目录白名单校验：git ls-files 的一级条目与 .github/root-allowlist.txt 比对。

.DESCRIPTION
    《用 AI 做项目：强制工程校验规范》v1.21.0 §layout：
      - 第 560 行：根目录只允许六类条目；
      - 第 595 行：白名单外新增必须先询问获批，再补 README.md 的目录结构字段
        与 DECISIONS.md 的理由；
      - 第 597 行：可机器校验 —— 差集非空即失败。

    本脚本把第 597 行落成门禁。清单放在 .github/ 而非根目录，正是为了不制造
    一个新的白名单外条目：.github/ 属六类中的「协作与平台配置」。

    同时落实 §豁免流程三项：例外行必须带 verify-exempt: 标注、ref:D-00N 依据、
    以及到期日；到期未复审则该行自动从允许集移除，门禁转红。

    --cached --others --exclude-standard 的用意：连「尚未 git add 的新文件」也纳入
    比对，否则「先放后报」在提交前根本不会被拦住。

.EXAMPLE
    pwsh -NoLogo -NoProfile -File ./scripts/check-root-layout.ps1
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# 输出经 npm → Git Bash 管道时，pwsh 会退回系统 ANSI 代码页，中文提示会变乱码。
# 显式钉 UTF-8，让「哪一项不合规」在任何 shell 下都读得出来（不影响判定）。
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding

$RepoRoot = Split-Path -Parent $PSScriptRoot
$allowPath = Join-Path $RepoRoot '.github/root-allowlist.txt'
$problems = [System.Collections.Generic.List[string]]::new()
function Add-Problem { param([string]$Message) $problems.Add($Message) }

if (-not (Test-Path -LiteralPath $allowPath -PathType Leaf)) {
    [Console]::Error.WriteLine("缺少根目录白名单清单：$allowPath")
    exit 1
}

# ---------------------------------------------------------------- 读清单
# 格式：一级条目|类别|到期日(- 表示常设)|理由
$allow = @{}
$lineNo = 0
foreach ($line in Get-Content -LiteralPath $allowPath -Encoding utf8) {
    $lineNo++
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $parts = $trimmed.Split('|')
    if ($parts.Count -ne 4) {
        Add-Problem "清单第 $lineNo 行格式错误（应为 条目|类别|到期日|理由）：$trimmed"
        continue
    }
    $name   = $parts[0].Trim()
    $kind   = $parts[1].Trim()
    $expiry = $parts[2].Trim()
    $reason = $parts[3].Trim()
    if ($allow.ContainsKey($name)) {
        Add-Problem "清单重复条目：$name（第 $lineNo 行）"
        continue
    }
    if ($kind -like '*例外*') {
        if ($expiry -eq '-') {
            Add-Problem "例外必须带到期日：$name"
        }
        if ($reason -notmatch 'verify-exempt:' -or $reason -notmatch 'ref:D-\d{3}') {
            Add-Problem "例外缺少显式标注（verify-exempt: 与 ref:D-00N）：$name"
        }
    }
    if ($expiry -ne '-') {
        $parsed = [datetime]::MinValue
        if (-not [datetime]::TryParse($expiry, [ref]$parsed)) {
            Add-Problem "到期日无法解析：$name ($expiry)"
        }
        elseif ($parsed -lt (Get-Date).Date) {
            Add-Problem "豁免已过期，须重新提案或删除条目：$name（到期 $expiry）"
            # 过期项不进允许集：若文件仍在根目录，下面的差集会再报一次。
            continue
        }
    }
    $allow[$name] = @{ Kind = $kind; Reason = $reason; Expiry = $expiry }
}

# -------------------------------------------------- 取根目录一级 git 条目
$psi = [System.Diagnostics.ProcessStartInfo]::new()
$psi.FileName = 'git'
$psi.Arguments = '-c core.quotepath=false ls-files --cached --others --exclude-standard'
$psi.WorkingDirectory = $RepoRoot
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
$psi.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
$process = [System.Diagnostics.Process]::Start($psi)
$output = $process.StandardOutput.ReadToEnd()
$stderr = $process.StandardError.ReadToEnd()
$process.WaitForExit()
if ($process.ExitCode -ne 0) {
    [Console]::Error.WriteLine("git ls-files 失败：$stderr")
    exit 1
}

$entries = @(
    $output -split "`r?`n" |
        Where-Object { $_ } |
        ForEach-Object { ($_ -replace '\\', '/').Split('/')[0] } |
        Where-Object { $_ } |
        Sort-Object -Unique
)

# ---------------------------------------------------------------- 差集
foreach ($entry in $entries) {
    if (-not $allow.ContainsKey($entry)) {
        Add-Problem "根目录出现白名单外条目：$entry（须先询问获批，并同步清单、README.md 的目录结构字段与 DECISIONS.md）"
    }
}

$unused = @($allow.Keys | Where-Object { $_ -notin $entries })
if ($unused.Count -gt 0) {
    Write-Host "  [提示] 清单中 $($unused.Count) 项暂未出现在仓库：$($unused -join ', ')" -ForegroundColor DarkGray
}

$exemptCount = @($allow.Values | Where-Object { $_.Kind -like '*例外*' }).Count

if ($problems.Count -gt 0) {
    [Console]::Error.WriteLine("根目录白名单检查未通过，共 $($problems.Count) 项：")
    foreach ($item in $problems) { [Console]::Error.WriteLine("  - $item") }
    exit 1
}

Write-Host "  [OK] 根目录 $($entries.Count) 个一级条目全部在白名单内（其中获批例外 $exemptCount 项）" -ForegroundColor DarkGreen
exit 0
