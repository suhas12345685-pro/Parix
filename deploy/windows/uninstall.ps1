# ─── Parix — Windows Uninstaller ────────────────────────────────
# Removes Parix installation, scheduled task, and environment vars.
# Usage: powershell -ExecutionPolicy Bypass -File deploy\windows\uninstall.ps1
# ─────────────────────────────────────────────────────────────────
#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$PARIX_HOME = "$env:LOCALAPPDATA\Parix"
$PARIX_BIN  = "$PARIX_HOME\bin"
$SERVICE_NAME = "ParixAgent"

function Write-Step($msg) { Write-Host "[parix] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  + $msg" -ForegroundColor Green }

# ─── Stop running processes ───────────────────────────────────────
Write-Step "Stopping Parix processes..."
Get-Process -Name "node","python","python3" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match "parix|hands|atrium" } |
    Stop-Process -Force -ErrorAction SilentlyContinue
Write-Ok "Processes stopped"

# ─── Remove scheduled task ────────────────────────────────────────
Write-Step "Removing scheduled task..."
$task = Get-ScheduledTask -TaskName $SERVICE_NAME -ErrorAction SilentlyContinue
if ($task) {
    Unregister-ScheduledTask -TaskName $SERVICE_NAME -Confirm:$false
    Write-Ok "Task '$SERVICE_NAME' removed"
} else {
    Write-Ok "No scheduled task found"
}

# ─── Remove from PATH ────────────────────────────────────────────
Write-Step "Cleaning PATH..."
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -like "*$PARIX_BIN*") {
    $newPath = ($userPath.Split(';') | Where-Object { $_ -ne $PARIX_BIN }) -join ';'
    [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
    Write-Ok "Removed from PATH"
}

# ─── Remove environment variables ─────────────────────────────────
Write-Step "Removing environment variables..."
[Environment]::SetEnvironmentVariable("PARIX_HOME", $null, "User")
[Environment]::SetEnvironmentVariable("PARIX_DB_PATH", $null, "User")
Write-Ok "Environment variables cleared"

# ─── Remove files ─────────────────────────────────────────────────
Write-Step "Removing installation directory..."
if (Test-Path $PARIX_HOME) {
    Remove-Item -Path $PARIX_HOME -Recurse -Force
    Write-Ok "Removed $PARIX_HOME"
} else {
    Write-Ok "Directory not found (already clean)"
}

Write-Host ""
Write-Step "Parix has been uninstalled."
