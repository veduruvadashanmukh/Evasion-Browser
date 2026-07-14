# Evasion Browser online installer

This project can create three Windows downloads:

1. `Evasion-Web-Setup-<version>.exe` — small online installer.
2. Offline NSIS installer — full package, no internet required during installation.
3. Portable executable — no installation required.

## Fastest setup: GitHub Releases

1. Create a GitHub repository and upload this project.
2. Open `build-online-installer.bat`.
3. Select **GitHub Releases**.
4. Enter the repository as `owner/repository`.
5. Upload every generated web-installer artifact from `dist` to the same GitHub release.

The online installer is small because it downloads the full application package during installation.
It will not work until the generated package files are publicly reachable at the configured release location.

## Your own server

Select **Your own HTTPS download server** in `build-online-installer.bat` and enter a public HTTPS release URL.
After the build completes, upload all generated online-installer files from `dist` without renaming them.

## Direct endpoint

Set a direct endpoint when your server returns the correct application package for the installer request.
Electron Builder sends an `X-Arch` header so the endpoint can return the matching architecture.

## GitHub Actions

Pushing a tag such as `v1.0.0` runs `.github/workflows/release.yml` and builds:

- online Windows installer;
- offline Windows installer;
- portable Windows executable;
- Linux AppImage and DEB packages;
- GitHub Release assets;
- GitHub Pages download portal.

## Important

An online installer cannot contain the full application. It always needs a public HTTPS hosting location for the package files.
