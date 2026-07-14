@echo off
setlocal
cd /d "%~dp0"

echo Repairing the local npm installation for this project...
if exist node_modules rmdir /s /q node_modules
call npm cache clean --force
call npm ci
if errorlevel 1 (
  echo.
  echo Repair failed. Update npm with: npm install -g npm@latest
  pause
  exit /b 1
)

echo.
echo Dependencies installed successfully.
pause
