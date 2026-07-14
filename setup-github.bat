@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo =============================================
echo   Evasion Browser - First GitHub Upload
echo =============================================
echo.
where git >nul 2>nul || (
  echo Git is not installed or is not in PATH.
  echo Install Git for Windows, reopen this folder, and run this file again.
  pause
  exit /b 1
)

if not exist .git (
  git init || goto error
)

git branch -M main || goto error
git remote remove origin >nul 2>nul
git remote add origin https://github.com/veduruvadashanmukh/Evasion-Browser.git || goto error

git add . || goto error
git commit -m "Prepare Evasion Browser release system" || echo No new changes to commit.
git push -u origin main || goto auth

echo.
echo Project uploaded successfully.
echo Repository: https://github.com/veduruvadashanmukh/Evasion-Browser
pause
exit /b 0

:auth
echo.
echo GitHub authentication is required.
echo Sign in in the browser window or Git Credential Manager prompt, then run this file again.
pause
exit /b 1

:error
echo.
echo Git setup failed. Review the message above.
pause
exit /b 1
