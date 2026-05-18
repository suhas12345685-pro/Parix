# Parix Windows System Info Script
# Collects key system metrics and outputs as JSON.

$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$drives = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Used -ne $null }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$pkgMgr = if (Get-Command winget -ErrorAction SilentlyContinue) { "winget" }
          elseif (Get-Command choco -ErrorAction SilentlyContinue) { "choco" }
          elseif (Get-Command scoop -ErrorAction SilentlyContinue) { "scoop" }
          else { $null }

$report = [ordered]@{
    hostname       = $env:COMPUTERNAME
    os_version     = $os.Caption + " " + $os.Version
    architecture   = $env:PROCESSOR_ARCHITECTURE
    cpu            = $cpu.Name
    cores          = $cpu.NumberOfLogicalProcessors
    total_memory_gb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
    free_memory_gb  = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
    uptime_hours   = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)
    is_admin       = $isAdmin
    package_manager = $pkgMgr
    drives         = @($drives | ForEach-Object {
        [ordered]@{
            name     = $_.Name
            used_gb  = [math]::Round($_.Used / 1GB, 2)
            free_gb  = [math]::Round($_.Free / 1GB, 2)
        }
    })
}

$report | ConvertTo-Json -Depth 3
