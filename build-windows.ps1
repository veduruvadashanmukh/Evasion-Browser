$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Evasion Browser - Windows Build" -ForegroundColor Cyan

try {
    npm ci
} catch {
    Write-Host "Initial install failed. Repairing npm cache..." -ForegroundColor Yellow
    npm cache clean --force
    if (Test-Path "node_modules") {
        Remove-Item "node_modules" -Recurse -Force
    }
    npm ci
}

npm run check
npm run dist:win
Write-Host "Build complete. Open the dist folder." -ForegroundColor Green
