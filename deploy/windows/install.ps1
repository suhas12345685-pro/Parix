# â”€â”€â”€ Parix â€” Windows Installer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Installs Parix as a background service on Windows 10/11.
# Usage: powershell -ExecutionPolicy Bypass -File deploy\windows\install.ps1
# Requires: Node.js 20+, Python 3.12+
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# No elevation needed: installs to %LOCALAPPDATA%\Parix, edits the *user* PATH,
# and registers a per-user (Interactive, RunLevel Limited) scheduled task.

$ErrorActionPreference = "Stop"

$PARIX_HOME = "$env:LOCALAPPDATA\Parix"
$PARIX_BIN  = "$PARIX_HOME\bin"
$PARIX_DATA = "$PARIX_HOME\data"
$PARIX_LOG  = "$PARIX_HOME\logs"
$SRC_ROOT   = (Resolve-Path "$PSScriptRoot\..\..").Path
$SERVICE_NAME = "ParixAgent"

$StepCount = 0
$TotalSteps = 11

function Write-Step($msg) {
    $global:StepCount++
    Write-Host "`n✦ [$($global:StepCount)/$TotalSteps] $msg" -ForegroundColor Cyan
}
function Write-Ok($msg)    { Write-Host "  ✔ $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "  ● $msg" -ForegroundColor Yellow }
function Write-Fail($msg)  { Write-Host "  ✘ $msg" -ForegroundColor Red; exit 1 }

function Get-PythonCandidate {
    $candidates = @(
        @{ Command = "python"; Args = @("--version"); RuntimeArgs = @() },
        @{ Command = "python3"; Args = @("--version"); RuntimeArgs = @() },
        @{ Command = "py"; Args = @("-3", "--version"); RuntimeArgs = @("-3") }
    )

    foreach ($candidate in $candidates) {
        if (-not (Get-Command $candidate.Command -ErrorAction SilentlyContinue)) {
            continue
        }

        try {
            $version = & $candidate.Command @($candidate.Args) 2>$null
        }
        catch {
            continue
        }

        if ($LASTEXITCODE -ne 0) {
            continue
        }

        $versionText = ($version | Select-Object -First 1).ToString()
        if ($versionText -match "Python\s+(\d+)\.(\d+)") {
            return [pscustomobject]@{
                Command = $candidate.Command
                Args = $candidate.RuntimeArgs
                Version = $versionText
                Major = [int]$Matches[1]
                Minor = [int]$Matches[2]
            }
        }
    }

    return $null
}

# â”€â”€â”€ Preflight â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Running preflight checks..."

$detectedOs = "windows"
$detectedArch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
$activeSkills = @("skills/os-detect.md", "skills/os-windows.md", "skills/parix-install.md", "skills/parix-hatchery.md")
Write-Ok "OS $detectedOs ($detectedArch)"
Write-Ok "Active OS skill: skills/os-windows.md"

$nodeVer = & node -v 2>$null
if (-not $nodeVer) { Write-Fail "Node.js not found. Install v20+ from https://nodejs.org" }
$major = [int]($nodeVer -replace 'v','').Split('.')[0]
if ($major -lt 20) { Write-Fail "Node.js v20+ required (found $nodeVer)" }
Write-Ok "Node.js $nodeVer"

$npmVer = & npm -v 2>$null
if (-not $npmVer) { Write-Fail "npm not found" }
Write-Ok "npm $npmVer"

$python = Get-PythonCandidate
if (-not $python) { Write-Fail "Python 3.12+ not found" }
$pyCmd = $python.Command
$pyArgs = $python.Args
$pyVer = $python.Version
if ($python.Major -lt 3 -or ($python.Major -eq 3 -and $python.Minor -lt 12)) {
    Write-Fail "Python 3.12+ required (found $pyVer)"
}
Write-Ok "$pyVer"

# â”€â”€â”€ Create directories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Creating Parix directories..."
foreach ($dir in @($PARIX_HOME, $PARIX_BIN, $PARIX_DATA, $PARIX_LOG)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
Write-Ok "Directories created at $PARIX_HOME"

# â”€â”€â”€ Copy project files â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Copying project files..."
$copyDirs = @("atrium", "hands", "shared", "hatchery", "aegis", "skills", "deploy")
foreach ($d in $copyDirs) {
    $src = Join-Path $SRC_ROOT $d
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination "$PARIX_HOME\$d" -Recurse -Force
        Write-Ok "Copied $d"
    } else {
        Write-Warn "Skipped $d (not found)"
    }
}
Copy-Item -Path (Join-Path $SRC_ROOT "package.json") -Destination $PARIX_HOME -Force
if (Test-Path (Join-Path $SRC_ROOT "package-lock.json")) {
    Copy-Item -Path (Join-Path $SRC_ROOT "package-lock.json") -Destination $PARIX_HOME -Force
}
foreach ($file in @("ecosystem.config.js", ".env.example")) {
    $src = Join-Path $SRC_ROOT $file
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $PARIX_HOME -Force
    }
}

# â”€â”€â”€ Install Node dependencies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Installing or reusing Node.js dependencies..."
Push-Location $PARIX_HOME
npm ci 2>$null
if (-not $?) { npm install }
Pop-Location
Write-Ok "Node.js dependencies installed"

# â”€â”€â”€ Install Python dependencies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Installing or reusing Python dependencies..."
$reqFile = "$PARIX_HOME\hands\requirements.txt"
if (Test-Path $reqFile) {
    & $pyCmd @pyArgs -m pip install -r $reqFile --quiet
    Write-Ok "Python dependencies installed"
} else {
    Write-Warn "requirements.txt not found"
}

# â”€â”€â”€ Build Atrium â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Building Parix workspaces..."
Push-Location $PARIX_HOME
npm run build --workspace=atrium
npm run build --workspace=hatchery
npm run build --workspace=aegis
Pop-Location
Write-Ok "Workspaces compiled"

# â”€â”€â”€ Create launcher batch file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Creating launcher..."
$launcherPs1 = @'
param(
    [ValidateSet("start", "stop", "restart", "status", "onboarding")]
    [string]$Action = "start",
    [string]$Target = "all",
    [switch]$Reset,
    [switch]$Web
)

$ErrorActionPreference = "Stop"
$Root = if ($env:PARIX_HOME) { $env:PARIX_HOME } else { Split-Path -Parent $PSScriptRoot }
Set-Location $Root
$env:PARIX_HOME = $Root
$env:PARIX_DB_PATH = if ($env:PARIX_DB_PATH) { $env:PARIX_DB_PATH } else { Join-Path $Root "data\parix.db" }

switch ($Action) {
    "start" {
        & node "$Root\hatchery\dist\index.js" --runtime start $Target
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    "stop" {
        & node "$Root\hatchery\dist\index.js" --runtime stop $Target
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    "restart" {
        & node "$Root\hatchery\dist\index.js" --runtime restart $Target
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    "status" {
        & node "$Root\hatchery\dist\index.js" --runtime status $Target
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    "onboarding" {
        $hatchArgs = @()
        if ($Reset) { $hatchArgs += "--reset" }
        if ($Web) { $hatchArgs += "--web" }
        & node "$Root\hatchery\dist\index.js" @hatchArgs
    }
}
'@
$launcherContent = @"
@echo off
setlocal
set "PARIX_HOME=$PARIX_HOME"
set "TARGET=%~2"
if "%TARGET%"=="" set "TARGET=all"
if /I "%1"=="stop" (
    powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%PARIX_HOME%\bin\parix.ps1" stop "%TARGET%"
) else if /I "%1"=="--stop" (
    powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%PARIX_HOME%\bin\parix.ps1" stop all
) else if /I "%1"=="restart" (
    powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%PARIX_HOME%\bin\parix.ps1" restart "%TARGET%"
) else if /I "%1"=="status" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%PARIX_HOME%\bin\parix.ps1" status "%TARGET%"
) else if /I "%1"=="onboarding" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%PARIX_HOME%\bin\parix.ps1" onboarding %2 %3
) else if /I "%1"=="atrium" (
    powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%PARIX_HOME%\bin\parix.ps1" start all
) else if /I "%1"=="start" (
    powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%PARIX_HOME%\bin\parix.ps1" start "%TARGET%"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%PARIX_HOME%\bin\parix.ps1" start all
)
"@
Set-Content -Path "$PARIX_BIN\parix.ps1" -Value $launcherPs1 -Encoding UTF8
Set-Content -Path "$PARIX_BIN\parix.bat" -Value $launcherContent -Encoding UTF8
Write-Ok "Launchers created at $PARIX_BIN\parix.ps1 and $PARIX_BIN\parix.bat"

# â”€â”€â”€ Register as Windows Task Scheduler job â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Registering scheduled task (auto-start on login)..."
$existingTask = Get-ScheduledTask -TaskName $SERVICE_NAME -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $SERVICE_NAME -Confirm:$false
}

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PARIX_BIN\parix.ps1`" start"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $SERVICE_NAME `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Parix autonomous agent â€” monitors and fixes workstation issues" | Out-Null
Write-Ok "Scheduled task '$SERVICE_NAME' registered"

# â”€â”€â”€ Add to PATH â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Adding Parix to user PATH..."
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$PARIX_BIN*") {
    [Environment]::SetEnvironmentVariable("PATH", "$userPath;$PARIX_BIN", "User")
    Write-Ok "Added $PARIX_BIN to user PATH"
} else {
    Write-Ok "Already in PATH"
}

# â”€â”€â”€ Environment variables â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Setting environment variables..."
[Environment]::SetEnvironmentVariable("PARIX_HOME", $PARIX_HOME, "User")
[Environment]::SetEnvironmentVariable("PARIX_DB_PATH", "$PARIX_DATA\parix.db", "User")
$env:PARIX_HOME = $PARIX_HOME
$env:PARIX_DB_PATH = "$PARIX_DATA\parix.db"
$env:PARIX_WORKSPACE = $PARIX_HOME
Write-Ok "PARIX_HOME=$PARIX_HOME"

# Installer context: tells Hatchery/Atrium which OS skill pack is active.
$installContext = [ordered]@{
    os = $detectedOs
    distro = $null
    arch = $detectedArch
    nodeVersion = $nodeVer
    pythonVersion = "$pyVer"
    activeSkills = $activeSkills
    detectedAt = (Get-Date).ToUniversalTime().ToString("o")
}
$installContext | ConvertTo-Json -Depth 4 | Set-Content -Path "$PARIX_HOME\install-context.json" -Encoding UTF8
Write-Ok "Wrote install context with OS skill routing"

# â”€â”€â”€ .env file â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$envFile = "$PARIX_HOME\.env"
if (-not (Test-Path $envFile)) {
    $envExample = Join-Path $SRC_ROOT ".env.example"
    if (Test-Path $envExample) {
        Copy-Item $envExample $envFile
        Write-Ok "Created .env from .env.example â€” edit with your API keys"
    } else {
        $envTemplate = @(
            "# Parix Environment Configuration",
            "# GEMINI_API_KEY=",
            "# TELEGRAM_BOT_TOKEN=",
            "# TELEGRAM_CHAT_ID="
        ) -join [Environment]::NewLine
        Set-Content -Path $envFile -Value $envTemplate -Encoding UTF8
        Write-Ok "Created blank .env â€” add your API keys"
    }
}

# â”€â”€â”€ Run onboarding â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Step "Starting Hatchery onboarding or runtime..."
try {
    & node "$PARIX_HOME\hatchery\dist\index.js" --post-install
} catch {
    Write-Warn "Onboarding skipped - run parix onboarding later to configure."
}

# â”€â”€â”€ Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "    PARIX INSTALLED SUCCESSFULLY & RUNNING SILENTLY      " -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  ✦ Home Directory : $PARIX_HOME" -ForegroundColor Cyan
Write-Host "  ✦ Data Directory : $PARIX_DATA" -ForegroundColor Cyan
Write-Host "  ✦ Logs Directory : $PARIX_LOG" -ForegroundColor Cyan
Write-Host "  ✦ Global Binary  : parix (reopen terminal to refresh)" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Command Controls:" -ForegroundColor Green
Write-Host "    parix start          - start background agent services" -ForegroundColor Yellow
Write-Host "    parix stop           - stop all running services" -ForegroundColor Yellow
Write-Host "    parix restart        - restart agent" -ForegroundColor Yellow
Write-Host "    parix status         - check live processes & PIDs" -ForegroundColor Yellow
Write-Host "    parix onboarding     - reconfigure preferences" -ForegroundColor Yellow
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green

