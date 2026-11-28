# Double-click or:  pwsh -File start-dev.ps1
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path "backend\node_modules")) {
  Write-Host "Installing backend dependencies..."
  npm install --prefix backend
}
if (-not (Test-Path "frontend\node_modules")) {
  Write-Host "Installing frontend dependencies..."
  npm install --prefix frontend
}
if (-not (Test-Path "node_modules\concurrently")) {
  Write-Host "Installing root dev tools..."
  npm install
}

npm run dev