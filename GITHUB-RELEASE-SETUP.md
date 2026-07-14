# Evasion Browser GitHub release setup

Repository: https://github.com/veduruvadashanmukh/Evasion-Browser

## What is already configured

- GitHub Actions Windows installer build
- Chrome-style online installer (`nsis-web`)
- Offline Windows installer
- Portable Windows executable
- Linux AppImage and DEB builds
- GitHub Release publishing after a `v*` tag is pushed
- GitHub Pages deployment for the download portal
- Public npm registry configuration

## First upload

1. Install **Git for Windows** if `git --version` does not work.
2. Extract the project ZIP.
3. Open the `Evasion-GX-Browser` folder.
4. Double-click `setup-github.bat`.
5. Complete the GitHub sign-in prompt.

Manual equivalent:

```bat
git init
git branch -M main
git remote add origin https://github.com/veduruvadashanmukh/Evasion-Browser.git
git add .
git commit -m "Initial Evasion Browser release setup"
git push -u origin main
```

## Enable GitHub Pages once

On GitHub open:

`Repository → Settings → Pages → Build and deployment → Source`

Choose **GitHub Actions**.

The download portal will later be available at:

https://veduruvadashanmukh.github.io/Evasion-Browser/

## Publish version 1.0.0

Double-click:

`publish-release-v1.0.0.bat`

Or run:

```bat
git add .
git commit -m "Release Evasion Browser v1.0.0"
git push origin main
git tag -a v1.0.0 -m "Evasion Browser v1.0.0"
git push origin v1.0.0
```

The tag starts `.github/workflows/release.yml`. Follow progress at:

https://github.com/veduruvadashanmukh/Evasion-Browser/actions

When complete, installers appear at:

https://github.com/veduruvadashanmukh/Evasion-Browser/releases

## Important

The GitHub workflow uses GitHub's built-in `GITHUB_TOKEN`; do not create or paste a personal access token into the project.

The first public Windows installer will be unsigned and Windows SmartScreen may show a warning. Code signing requires a certificate.
