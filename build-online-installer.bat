@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo =============================================
echo   Evasion Browser Online Installer Builder
echo =============================================
echo.
echo Choose where the full browser package will be hosted:
echo   1. GitHub Releases
echo   2. Your own HTTPS download server
echo   3. Direct package endpoint
set /p EVASION_METHOD=Select 1, 2, or 3: 

if "%EVASION_METHOD%"=="1" goto github
if "%EVASION_METHOD%"=="2" goto generic
if "%EVASION_METHOD%"=="3" goto direct

echo Invalid selection.
pause
exit /b 1

:github
set /p GITHUB_REPOSITORY=Enter GitHub repository as owner/repo: 
if "%GITHUB_REPOSITORY%"=="" goto missing
set EVASION_RELEASE_BASE_URL=
set EVASION_PACKAGE_URL=
goto build

:generic
set /p EVASION_RELEASE_BASE_URL=Enter release base URL, for example https://downloads.example.com/evasion: 
if "%EVASION_RELEASE_BASE_URL%"=="" goto missing
set GITHUB_REPOSITORY=
set EVASION_PACKAGE_URL=
goto build

:direct
set /p EVASION_PACKAGE_URL=Enter full package endpoint URL, for example https://downloads.example.com/evasion/latest: 
if "%EVASION_PACKAGE_URL%"=="" goto missing
set GITHUB_REPOSITORY=
set EVASION_RELEASE_BASE_URL=
goto build

:build
where node >nul 2>nul || (echo Node.js is not installed.& pause & exit /b 1)
call npm ci --no-audit --no-fund || goto error
call npm run check || goto error
call npm run dist:web || goto error

echo.
echo Online installer build completed.
echo Upload every generated web-installer file from the dist folder to the selected release location.
explorer "%cd%\dist"
pause
exit /b 0

:missing
echo A hosting location is required for an online installer.
pause
exit /b 1

:error
echo.
echo Build failed. Review the messages above.
pause
exit /b 1
