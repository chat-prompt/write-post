# write-post installer for Windows PowerShell

# UTF-8 encoding for Korean text display
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$RepoUrl = if ($env:WRITE_POST_REPO_URL) { $env:WRITE_POST_REPO_URL } else { "https://raw.githubusercontent.com/chat-prompt/write-post/main" }
# 무입력 설치: $env:WP_TOOLS = "claude,codex" (또는 all), $env:WP_SCOPE = "global"|"project". AI 에이전트가 대신 설치할 때 쓴다.
$SkillFiles = @(
    "SKILL.md",
    "VERSION",
    "references/devlog-guide.md",
    "references/best-cases-185.md",
    "references/google-top300.md",
    "references/seo-geo-brief.md",
    "references/rules.md",
    "references/post-templates.md",
    "references/voice-default.md",
    "references/_diagram.css",
    "references/tpl-compare.html",
    "references/tpl-two-roles.html",
    "references/eli5-template.html",
    "scripts/fetch-member-posts.mjs",
    "scripts/find-tags.mjs",
    "scripts/scan-session.mjs",
    "scripts/check-gate.py",
    "scripts/check-ai-tell.py",
    "scripts/blur-region.py",
    "scripts/capture-card.mjs",
    "scripts/preview-mobile.mjs",
    "scripts/open-preview.mjs",
    "scripts/gen-image.mjs",
    "scripts/capture-url.mjs",
    "scripts/check-update.mjs"
)

# Tool selection menu
if ($env:WP_TOOLS) {
    $toolChoice = $env:WP_TOOLS.ToLower().Replace(" ","").Replace("all","6").Replace("claude","1").Replace("opencode","2").Replace("codex","3").Replace("gemini","4").Replace("antigravity","5")
    foreach ($item in ($toolChoice -split ",")) {
        if ($item -notmatch '^[1-6]$') { throw "설치할 도구를 못 알아들었어요: '$item'. claude, codex, gemini, opencode, antigravity, all 중에서 적어 주세요." }
    }
    if (($toolChoice -split ",") -contains "6") { $toolChoice = "6" }   # all이 섞여 있으면 전체
} else {
[Console]::Write("어떤 도구에 설치할까요?`n")
[Console]::Write("1) Claude Code`n")
[Console]::Write("2) OpenCode`n")
[Console]::Write("3) Codex CLI`n")
[Console]::Write("4) Gemini CLI`n")
[Console]::Write("5) Antigravity`n")
[Console]::Write("6) 전체`n")
[Console]::Write("선택 (1-6, 쉼표로 구분 가능): ")
$toolChoice = [Console]::ReadLine()
}

# Scope selection
if ($env:WP_SCOPE) {
    $s = $env:WP_SCOPE.ToLower().Trim()
    if ($s -ne "project" -and $s -ne "global") { throw "설치 위치는 global 또는 project 여야 해요: '$s'" }
    $scopeChoice = if ($s -eq "project") { "2" } else { "1" }
} else {
[Console]::Write("`n설치 위치를 선택하세요:`n")
[Console]::Write("1) 전역 설치 (모든 프로젝트에서 사용)`n")
[Console]::Write("2) 프로젝트 설치 (현재 폴더에서만 사용)`n")
[Console]::Write("선택 (1/2): ")
$scopeChoice = [Console]::ReadLine()
}

if ($scopeChoice -eq "1") {
    $Scope = "global"
    $ScopeLabel = "전역"
} else {
    $Scope = "project"
    $ScopeLabel = "프로젝트"
}

# Parse tool choices
$tools = @()
if ($toolChoice -eq "6") {
    $tools = @("claude", "opencode", "codex", "gemini", "antigravity")
} else {
    $choices = $toolChoice -split ","
    foreach ($choice in $choices) {
        $choice = $choice.Trim()
        switch ($choice) {
            "1" { $tools += "claude" }
            "2" { $tools += "opencode" }
            "3" { $tools += "codex" }
            "4" { $tools += "gemini" }
            "5" { $tools += "antigravity" }
        }
    }
}

# Tool path mappings
$ToolPaths = @{
    "claude" = @{ 
        Global = "$env:USERPROFILE\.claude\skills\write-post"
        Project = ".claude\skills\write-post"
        Label = "Claude Code"
    }
    "opencode" = @{ 
        Global = "$env:USERPROFILE\.config\opencode\skills\write-post"
        Project = ".opencode\skills\write-post"
        Label = "OpenCode"
    }
    "codex" = @{ 
        Global = "$env:USERPROFILE\.codex\skills\write-post"
        Project = ".codex\skills\write-post"
        Label = "Codex CLI"
    }
    "gemini" = @{ 
        Global = "$env:USERPROFILE\.gemini\skills\write-post"
        Project = ".gemini\skills\write-post"
        Label = "Gemini CLI"
    }
    "antigravity" = @{ 
        Global = "$env:USERPROFILE\.gemini\antigravity\skills\write-post"
        Project = ".agent\skills\write-post"
        Label = "Antigravity"
    }
}

# Installation function
function Install-Tool {
    param($Tool, $Scope)
    
    $paths = $ToolPaths[$Tool]
    if (-not $paths) {
        Write-Host "ERROR: Unknown tool '$Tool'" -ForegroundColor Red
        throw "Unknown tool: $Tool"
    }
    
    $TargetDir = if ($Scope -eq "global") { $paths.Global } else { $paths.Project }
    
    # 폴더를 통째로 지우지 않는다(node_modules, 멤버가 둔 파일 보존). 우리가 관리하는 파일만 새로 받는다.
    New-Item -ItemType Directory -Force -Path "$TargetDir\references" | Out-Null
    New-Item -ItemType Directory -Force -Path "$TargetDir\scripts" | Out-Null
    
    foreach ($f in $SkillFiles) {
        $out = Join-Path $TargetDir ($f -replace '/', '\')
        if (Test-Path $out) { Remove-Item -Force $out }
        try {
            Invoke-WebRequest -UseBasicParsing -Uri "$RepoUrl/.claude/skills/write-post/$f" -OutFile $out -ErrorAction Stop
        } catch {
            Write-Host "ERROR: Failed to download $f for $($paths.Label)" -ForegroundColor Red
            throw "Download failed for $($paths.Label)"
        }
    }
    
    # 어디서 받았는지 남긴다. 스킬이 시작할 때 이걸 보고 새 버전을 알린다.
    $rec = '{ "repo_url": "' + $RepoUrl + '", "tools": ["' + ($tools -join '","') + '"], "scope": "' + $Scope + '", "installed_at": "' + (Get-Date -Format "yyyy-MM-ddTHH:mm:ss") + '" }'
    [IO.File]::WriteAllText((Join-Path $TargetDir "install.json"), $rec, (New-Object System.Text.UTF8Encoding $false))
    Write-Host "✓ $($paths.Label): $TargetDir ($($SkillFiles.Count)개 파일)" -ForegroundColor Green
}

if ($tools.Count -eq 0) {
    throw "설치할 도구를 못 알아들었어요: '$toolChoice'. claude, codex, gemini, opencode, antigravity, all 중에서 적어 주세요."
}

# Install selected tools
Write-Host ""
foreach ($tool in $tools) {
    Install-Tool -Tool $tool -Scope $Scope
}

# Cleanup: Remove old installation paths
if ($Scope -eq "global") {
    $oldPath = "$env:USERPROFILE\.claude\commands\write-post.md"
    if (Test-Path $oldPath) {
        Remove-Item $oldPath
        Write-Host "  (Cleaned up old file: $oldPath)" -ForegroundColor Gray
    }
} else {
    $oldPath = ".claude\commands\write-post.md"
    if (Test-Path $oldPath) {
        Remove-Item $oldPath
        Write-Host "  (Cleaned up old file: $oldPath)" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "write-post $ScopeLabel 설치 완료!" -ForegroundColor Green
Write-Host "설치된 도구: $($tools -join ', ')"
Write-Host "사용법: /write-post"
