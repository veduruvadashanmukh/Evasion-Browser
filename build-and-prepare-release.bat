@echo off
setlocal
cd /d "%~dp0"
echo ==========================================
echo   Evasion Browser Release Builder
echo ==========================================
where node >nul 2>nul || (echo Node.js is not installed.& pause & exit /b 1)
call npm ci || goto :error
call npm run check || goto :error
call npm run dist:win || goto :error
call npm run release:prepare || goto :error
echo.
echo Release files and download page are ready.
echo The download page will now open locally.
call npm run download:serve
exit /b 0
:error
echo.
echo Build failed. Review the messages above.
pause
exit /b 1
