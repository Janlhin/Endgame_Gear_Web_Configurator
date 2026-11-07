#requires -Version 7.4
<#
.SYNOPSIS
    脚本执行基线检查：禁止 cmd / bat，统一 Pwsh。

.DESCRIPTION
    《用 AI 做项目：强制工程校验规范》v1.20.0 §脚本执行基线 的强制校验项。

    禁止 cmd / bat 不是格式偏好，而是消除第二套解析器：cmd 与 PowerShell 在转义、
    错误传播、变量展开与退出码语义上完全不同，允许两者并存等于让同一个入口
    在不同机器上走不同语义，直接破坏校验的确定性前提。

    检查项：
      1. 仓库里没有 .cmd / .bat 文件（豁免须登记在 config/script-baseline-exempt.txt）
      2. 每个 .ps1 首行声明 #requires -Version 7.x
      3. 没有 cmd /c、cmd.exe /c、powershell.exe 等第二解析器调用
      4. package.json 的 scripts 不含 cmd 内联语法；聚合入口 verify 必须转发到 .ps1
      5. CI 工作流的 run 步骤走 pwsh，没有 shell: cmd / shell: powershell

    扫描范围只覆盖**本仓库跟踪的文件**：伞形仓库里可能嵌着别的独立仓库，
    那些文件的规则由它们自己的仓库负责。

.PARAMETER RepoRoot
    仓库根目录，默认是本脚本的上一级。

.EXAMPLE
    pwsh -NoLogo -NoProfile -File ./scripts/check-script-baseline.ps1
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$problems = [System.Collections.Generic.List[string]]::new()
function Add-Problem { param([string]$Message) $problems.Add($Message) }

Write-Host "脚本执行基线检查：$RepoRoot" -ForegroundColor Cyan

# ------------------------------------------------------------ Git 跟踪文件清单
# 用 Process 显式指定 UTF-8 解码：Git 输出 UTF-8，而本机控制台代码页是 GBK(936)，
# 走普通管道会把中文路径解成乱码 —— 既匹配不到扩展名，也对不上豁免清单里的真实文件名。
# 同时关掉 core.quotepath，否则 Git 会把非 ASCII 路径转义成八进制。
function Get-TrackedFiles {
    param([string]$Path)
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return @() }
    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = 'git'
    $psi.Arguments = '-c core.quotepath=false ls-files --cached --others --exclude-standard'
    $psi.WorkingDirectory = $Path
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
    $psi.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
    $process = [System.Diagnostics.Process]::Start($psi)
    $output = $process.StandardOutput.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { return @() }
    return @($output -split "`r?`n" | Where-Object { $_ })
}

$tracked = @(Get-TrackedFiles -Path $RepoRoot)
if ($tracked.Count -eq 0) {
    Write-Host '  （未取到跟踪文件清单，退回目录扫描）' -ForegroundColor DarkGray
}

function Get-RepoFile {
    <# 相对路径 → FileInfo；不存在则返回 $null。 #>
    param([string]$Relative)
    $full = Join-Path $RepoRoot $Relative
    if (Test-Path -LiteralPath $full -PathType Leaf) { return (Get-Item -LiteralPath $full) }
    return $null
}

# ------------------------------------------------------------ 豁免清单
# 格式：相对路径|到期日(yyyy-MM-dd)|理由。到期未清理即重新计入失败。
$exemptPath = Join-Path $RepoRoot 'config/script-baseline-exempt.txt'
$exempt = @{}
if (Test-Path -LiteralPath $exemptPath) {
    foreach ($line in Get-Content -LiteralPath $exemptPath -Encoding utf8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $parts = $trimmed.Split('|')
        if ($parts.Count -lt 3) {
            Add-Problem "豁免清单行格式不正确（应为 路径|到期日|理由）：$trimmed"
            continue
        }
        $exempt[$parts[0].Trim()] = @{ Expiry = $parts[1].Trim(); Reason = $parts[2].Trim() }
    }
}

function Test-Exempt {
    param([string]$RelativePath)
    if (-not $exempt.ContainsKey($RelativePath)) { return $false }
    $expiry = [datetime]::MinValue
    if (-not [datetime]::TryParse($exempt[$RelativePath].Expiry, [ref]$expiry)) {
        Add-Problem "豁免项的到期日无法解析：$RelativePath"
        return $false
    }
    if ($expiry -lt (Get-Date).Date) {
        Add-Problem "豁免已过期，须清理或重新提案：$RelativePath（到期 $($exempt[$RelativePath].Expiry)）"
        return $false
    }
    Write-Host "  [豁免] $RelativePath —— $($exempt[$RelativePath].Reason)" -ForegroundColor Yellow
    return $true
}

# ------------------------------------------------------------ 1. .cmd / .bat
# 以**工作区实际存在**为准：git 索引里可能还留着刚删掉、尚未提交的文件，
# 那条记录对应的文件已经不在仓库里了，不该继续算作违规。
$offenders = @(
    $tracked |
        Where-Object { $_ -match '\.(cmd|bat)$' } |
        Where-Object { Test-Path -LiteralPath (Join-Path $RepoRoot $_) } |
        Where-Object { -not (Test-Exempt $_) }
)
if ($offenders.Count -gt 0) {
    Add-Problem "仓库里有 cmd / bat 文件：$($offenders -join ', ')"
}
else {
    Write-Host '  [OK] 没有未登记的 .cmd / .bat' -ForegroundColor DarkGreen
}

# ------------------------------------------------------------ 2. .ps1 首行
$missing = @()
$ps1Count = 0
foreach ($relative in ($tracked | Where-Object { $_ -match '\.ps1$' })) {
    $file = Get-RepoFile -Relative $relative
    if (-not $file) { continue }
    $ps1Count++
    $first = Get-Content -LiteralPath $file.FullName -TotalCount 1
    if ($first -notmatch '^#requires\s+-Version\s+7\.\d+') {
        if (-not (Test-Exempt $relative)) { $missing += $relative }
    }
}
if ($missing.Count -gt 0) {
    Add-Problem "这些 .ps1 首行不是 '#requires -Version 7.x'：$($missing -join ', ')"
}
else {
    Write-Host "  [OK] $ps1Count 个 .ps1 均声明 Pwsh 7.x" -ForegroundColor DarkGreen
}

# ------------------------------------------------------------ 3. 第二解析器调用
$callPattern = 'cmd(\.exe)?\s+/c|powershell\.exe\s+-|\bcall\s+[A-Za-z0-9_.\\-]+\.(bat|cmd)|if\s+errorlevel|%\w+%\s'

function Get-CodeLines {
    # 注释里写出被禁语法不算违规——校验器自己也不能抓到自己的说明文字。
    param([string]$Text)
    $noBlocks = [regex]::Replace($Text, '(?s)<#.*?#>', '')
    $kept = @()
    foreach ($line in ($noBlocks -split "`r?`n")) {
        if ($line.TrimStart().StartsWith('#')) { continue }
        $kept += $line
    }
    return $kept
}

function Get-FencedLines {
    # 文档里真正「展示命令」的只有围栏代码块——规范 §文档先行第三层要求
    # 命令片段由 codedown 抽取并实跑，所以可执行的片段就是围栏里的内容。
    # 正文里出现「禁止用 cmd /c」这类禁令文字，不构成违规命令，不应被抓。
    param([string]$Text)
    $kept = @()
    $inFence = $false
    foreach ($line in ($Text -split "`r?`n")) {
        if ($line -match '^\s*```') { $inFence = -not $inFence; continue }
        if ($inFence) { $kept += $line }
    }
    return $kept
}

$hits = @()
foreach ($relative in ($tracked | Where-Object { $_ -match '\.(ps1|psm1|yml|yaml|json|md)$' })) {
    if ([System.IO.Path]::GetFileName($relative) -in @('package-lock.json', 'pnpm-lock.yaml', 'check-script-baseline.ps1')) { continue }
    $file = Get-RepoFile -Relative $relative
    if (-not $file) { continue }
    $text = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $text) { continue }
    $lines = if ($file.Extension -eq '.md') { Get-FencedLines -Text $text } else { Get-CodeLines -Text $text }
    foreach ($line in $lines) {
        if ($line -match $callPattern) { $hits += "$relative :: $($line.Trim())" }
    }
}
if ($hits.Count -gt 0) { foreach ($hit in $hits) { Add-Problem "发现第二解析器调用：$hit" } }
else { Write-Host '  [OK] 没有 cmd / powershell.exe 调用' -ForegroundColor DarkGreen }

# ------------------------------------------------------------ 4. package.json scripts
$packages = @(
    $tracked |
        Where-Object { $_ -match '(^|/)package\.json$' } |
        ForEach-Object { Get-RepoFile -Relative $_ } |
        Where-Object { $_ }
)
$inlinePattern = '&&|\|\||%\w+%|(^|\s)set\s+\w+=|if\s+errorlevel|cmd(\.exe)?\s+/c|\.(bat|cmd)\b'
$packageProblems = 0
foreach ($package in $packages) {
    $relative = $package.FullName.Substring($RepoRoot.Length + 1).Replace('\', '/')
    $json = Get-Content -LiteralPath $package.FullName -Raw | ConvertFrom-Json
    if (-not $json.PSObject.Properties['scripts']) { continue }
    foreach ($property in $json.scripts.PSObject.Properties) {
        $value = [string]$property.Value
        if ($value -match $inlinePattern) {
            Add-Problem "$relative : $($property.Name) 含 cmd 内联语法 —— $value"
            $packageProblems++
        }
    }
    if ($json.scripts.PSObject.Properties['verify']) {
        if ([string]$json.scripts.verify -notmatch '\.ps1') {
            Add-Problem "$relative : 聚合入口 verify 未转发到 .ps1 —— $($json.scripts.verify)"
            $packageProblems++
        }
    }
}
if ($packages.Count -eq 0) { Write-Host '  [OK] 无 package.json，跳过 npm scripts 检查' -ForegroundColor DarkGray }
elseif ($packageProblems -eq 0) { Write-Host '  [OK] npm scripts 无 cmd 内联语法' -ForegroundColor DarkGreen }

# ------------------------------------------------------------ 5. CI shell
$workflowFiles = @(
    $tracked |
        Where-Object { $_ -match '^\.github/workflows/.*\.yml$' } |
        ForEach-Object { Get-RepoFile -Relative $_ } |
        Where-Object { $_ }
)
if ($workflowFiles.Count -gt 0) {
    $ciBefore = $problems.Count
    foreach ($workflow in $workflowFiles) {
        $raw = Get-Content -LiteralPath $workflow.FullName -Raw
        $text = (Get-CodeLines -Text $raw) -join "`n"
        $relative = $workflow.FullName.Substring($RepoRoot.Length + 1).Replace('\', '/')
        if ($text -match 'shell:\s*(cmd|powershell)\b') {
            Add-Problem "$relative 使用了 shell: cmd / shell: powershell"
        }
        if ($text -notmatch 'shell:\s*pwsh') {
            Add-Problem "$relative 没有声明 shell: pwsh"
        }
    }
    if ($problems.Count -eq $ciBefore) { Write-Host '  [OK] CI 全部走 shell: pwsh' -ForegroundColor DarkGreen }
}

# ------------------------------------------------------------ 结论
Write-Host ''
if ($problems.Count -gt 0) {
    Write-Host "脚本基线检查未通过，共 $($problems.Count) 项：" -ForegroundColor Red
    foreach ($problem in $problems) { Write-Host "  - $problem" -ForegroundColor Red }
    exit 1
}
Write-Host '脚本基线检查通过。' -ForegroundColor Green
exit 0
