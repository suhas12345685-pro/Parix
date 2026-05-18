$ErrorActionPreference = "Stop"

$RepoUrl = if ($env:PARIX_REPO_URL) { $env:PARIX_REPO_URL } else { "https://github.com/openclaw-ai/openclaw.git" }
$Branch = if ($env:PARIX_BRANCH) { $env:PARIX_BRANCH } else { "main" }
$WorkDir = Join-Path $env:TEMP ("parix-install-" + [guid]::NewGuid().ToString("N"))

function Write-Parix($message) {
    Write-Host "[parix] $message" -ForegroundColor Cyan
}

Write-Parix "Bootstrapping installer..."
New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null

try {
    $osName = "windows"
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    Write-Parix "Detected OS: $osName ($arch)"

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git is required for one-line installation. Install Git for Windows, then rerun this command."
    }

    $nodeVer = & node --version 2>$null
    if (-not $nodeVer) {
        throw "Node.js 20+ is required. Install Node.js, then rerun this command."
    }
    $nodeMajor = [int]($nodeVer.TrimStart("v").Split(".")[0])
    if ($nodeMajor -lt 20) {
        throw "Node.js 20+ is required (found $nodeVer)."
    }
    Write-Parix "Node.js $nodeVer"

    $pyCmd = if (Get-Command python3 -ErrorAction SilentlyContinue) { "python3" }
             elseif (Get-Command python -ErrorAction SilentlyContinue) { "python" }
             else { $null }
    if (-not $pyCmd) {
        throw "Python 3.12+ is required. Install Python, then rerun this command."
    }
    $pyVer = & $pyCmd --version 2>&1
    if ($pyVer -notmatch "Python\\s+(\\d+)\\.(\\d+)") {
        throw "Could not read Python version."
    }
    if ([int]$Matches[1] -lt 3 -or ([int]$Matches[1] -eq 3 -and [int]$Matches[2] -lt 12)) {
        throw "Python 3.12+ is required (found $pyVer)."
    }
    Write-Parix "$pyVer"

    Write-Parix "Cloning $RepoUrl ($Branch)"
    git clone --depth 1 --branch $Branch $RepoUrl $WorkDir

    $Installer = Join-Path $WorkDir "deploy\windows\install.ps1"
    if (-not (Test-Path $Installer)) {
        throw "Windows installer not found at $Installer"
    }

    Write-Parix "Running Windows installer"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Installer
}
finally {
    if (Test-Path $WorkDir) {
        Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
