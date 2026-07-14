@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo   Evasion Browser - Windows Build

echo ==========================================
echo.

echo [1/3] Installing clean dependencies...
call npm ci
if errorlevel 1 (
  echo.
  echo Installation failed. Running npm repair...
  call npm cache clean --force
  if exist node_modules rmdir /s /q node_modules
  call npm ci
  if errorlevel 1 goto :error
)

echo.
echo [2/3] Checking JavaScript...
call npm run check
if errorlevel 1 goto :error

echo.
echo [3/3] Building installer and portable app...
call npm run dist:win
if errorlevel 1 goto :error

echo.
echo Build complete. Open the dist folder.
pause
exit /b 0

:error
echo.
echo Build failed. Read the error above.
pause
exit /b 1
