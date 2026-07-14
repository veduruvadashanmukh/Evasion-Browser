@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo =============================================
echo   Evasion Browser Complete Windows Release
echo =============================================
echo.
echo This creates the offline installer, portable app, and online installer.
echo.
call npm ci --no-audit --no-fund || goto error
call npm run check || goto error
call npm run dist:win || goto error
call build-online-installer.bat || goto error
call npm run release:prepare || goto error
explorer "%cd%\dist"
exit /b 0

:error
echo.
echo Build failed. Review the messages above.
pause
exit /b 1
