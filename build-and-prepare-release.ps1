$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "Evasion Browser Release Builder" -ForegroundColor Cyan
npm ci
npm run check
npm run dist:win
npm run release:prepare
npm run download:serve
