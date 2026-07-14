@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo =============================================
echo   Publish Evasion Browser v1.0.0
echo =============================================
echo.
where git >nul 2>nul || (echo Git is not installed.& pause & exit /b 1)

git status --short
set /p CONFIRM=Push current code and create the v1.0.0 release? Type YES: 
if /I not "%CONFIRM%"=="YES" exit /b 0

git add . || goto error
git commit -m "Release Evasion Browser v1.0.0" || echo No new changes to commit.
git push origin main || goto error

git tag -d v1.0.0 >nul 2>nul
git push origin :refs/tags/v1.0.0 >nul 2>nul
git tag -a v1.0.0 -m "Evasion Browser v1.0.0" || goto error
git push origin v1.0.0 || goto error

echo.
echo GitHub Actions is now building the installers.
echo Open: https://github.com/veduruvadashanmukh/Evasion-Browser/actions
start "" "https://github.com/veduruvadashanmukh/Evasion-Browser/actions"
pause
exit /b 0

:error
echo.
echo Release command failed. Review the message above.
pause
exit /b 1
