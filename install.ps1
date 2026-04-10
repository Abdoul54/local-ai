# Run from PowerShell: .\install.ps1

$ErrorActionPreference = "Stop"
$installDir = "$env:USERPROFILE\bin"
$exePath    = "$installDir\local-ai.exe"
$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$builtExe   = Join-Path $scriptDir "dist\local-ai.exe"

# 1. Ensure the binary exists
if (-not (Test-Path $builtExe)) {
    Write-Host "dist\local-ai.exe not found. Build it first from WSL:" -ForegroundColor Red
    Write-Host "  bun run build:windows" -ForegroundColor Yellow
    exit 1
}

# 2. Create ~/bin if needed
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Force $installDir | Out-Null
    Write-Host "Created $installDir" -ForegroundColor DarkGray
}

# 3. Copy the binary
Copy-Item $builtExe $exePath -Force
Write-Host "Copied local-ai.exe to $exePath" -ForegroundColor DarkGray

# 4. Add ~/bin to user PATH if not already there
$userPath = [Environment]::GetEnvironmentVariable("Path", "User") ?? ""
if ($userPath -notlike "*$installDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$installDir", "User")
    Write-Host "Added $installDir to user PATH" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Restart PowerShell, then run: local-ai" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "local-ai is ready. Run: local-ai" -ForegroundColor Green
}
