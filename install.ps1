param(
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$RepoUrl = if ($env:PARIX_REPO_URL) { $env:PARIX_REPO_URL } else { "https://github.com/suhas12345685-pro/Parix.git" }
$Branch = if ($env:PARIX_BRANCH) { $env:PARIX_BRANCH } else { "main" }
$WorkDir = Join-Path $env:TEMP ("parix-install-" + [guid]::NewGuid().ToString("N"))

function Write-Parix($message) {
    Write-Host "✦ [parix] $message" -ForegroundColor Cyan
}

function Write-Ok($message) {
    Write-Host "  ✔ $message" -ForegroundColor Green
}

function Get-PythonCandidate {
    $candidates = @(
        @{ Command = "python"; Args = @("--version") },
        @{ Command = "python3"; Args = @("--version") },
        @{ Command = "py"; Args = @("-3", "--version") }
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
                Args = $candidate.Args
                Version = $versionText
                Major = [int]$Matches[1]
                Minor = [int]$Matches[2]
            }
        }
    }

    return $null
}

Write-Parix "Bootstrapping installer..."
New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null

try {
    $osName = "windows"
    $arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
    Write-Parix "Detected OS: $osName ($arch)"
    Write-Parix "This will clone Parix, install packages, build workspaces, and start Hatchery onboarding."

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw "Git is required for one-line installation. Install Git for Windows, then rerun this command."
    }

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js 20+ is required. Install Node.js, then rerun this command."
    }
    $nodeVer = & node --version 2>$null
    $nodeMajor = [int]($nodeVer.TrimStart("v").Split(".")[0])
    if ($nodeMajor -lt 20) {
        throw "Node.js 20+ is required (found $nodeVer)."
    }
    Write-Ok "Node.js $nodeVer"

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "npm is required. Install Node.js 20+ with npm, then rerun this command."
    }
    Write-Ok "npm $(& npm --version)"

    $python = Get-PythonCandidate
    if (-not $python) {
        throw "Python 3.12+ is required. Install Python, then rerun this command."
    }
    if ($python.Major -lt 3 -or ($python.Major -eq 3 -and $python.Minor -lt 12)) {
        throw "Python 3.12+ is required (found $($python.Version))."
    }
    Write-Ok "$($python.Version)"

    if ($DryRun) {
        Write-Parix "Dry run: prerequisites OK"
        Write-Parix "Dry run: would clone $RepoUrl ($Branch) into a temporary directory"
        Write-Parix "Dry run: would run deploy\windows\install.ps1 to install packages, build, and start Hatchery"
        return
    }

    Write-Parix "Cloning $RepoUrl ($Branch)"
    # Retry the clone: shallow clones over flaky TLS sometimes abort
    # (schannel "missing close_notify"). Up to 3 attempts with a clean dir.
    $Installer = Join-Path $WorkDir "deploy\windows\install.ps1"
    $cloned = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        if (Test-Path $WorkDir) { Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue }
        git clone --depth 1 --branch $Branch $RepoUrl $WorkDir
        if ((Test-Path $Installer)) { $cloned = $true; break }
        Write-Parix "Clone attempt $attempt failed (network); retrying..."
        Start-Sleep -Seconds 2
    }
    if (-not $cloned) {
        throw "Clone failed after 3 attempts (network). Check connectivity and re-run."
    }

    Write-Parix "Running Windows installer"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $Installer
}
finally {
    if (Test-Path $WorkDir) {
        Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
