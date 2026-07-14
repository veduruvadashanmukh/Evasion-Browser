@echo off
setlocal
cd /d "%~dp0"
echo ==============================================
echo   Evasion Browser - npm Registry Repair
echo ==============================================
echo.
where node >nul 2>nul || (echo Node.js is not installed or not in PATH.& pause& exit /b 1)
where npm >nul 2>nul || (echo npm is not installed or not in PATH.& pause& exit /b 1)
echo Node:
node -v
echo npm:
npm -v
echo.
echo Resetting npm to the public registry...
call npm config delete proxy >nul 2>nul
call npm config delete https-proxy >nul 2>nul
call npm config set registry https://registry.npmjs.org/
call npm cache clean --force
if exist node_modules rmdir /s /q node_modules
for /d %%D in ("%LOCALAPPDATA%\npm-cache\_cacache\tmp\*") do rmdir /s /q "%%D" >nul 2>nul
echo.
echo Checking registry access...
call npm ping --registry=https://registry.npmjs.org/ || goto :fail
echo.
echo Installing dependencies...
call npm ci --registry=https://registry.npmjs.org/ --no-audit --no-fund || goto :fallback
goto :success
:fallback
echo npm ci failed. Trying npm install with the public registry...
if exist node_modules rmdir /s /q node_modules
call npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund || goto :fail
:success
echo.
echo Installation completed successfully.
echo Run: npm start
echo Build: npm run dist:win
pause
exit /b 0
:fail
echo.
echo Installation failed. Check your internet, firewall, VPN, or antivirus network filtering.
pause
exit /b 1
