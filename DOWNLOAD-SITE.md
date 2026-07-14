# Evasion Browser Download Page

This project includes a professional download page in `download-site/`.

## One-click Windows workflow

Double-click:

```text
build-and-prepare-release.bat
```

It will:

1. Install dependencies with `npm ci`.
2. Validate JavaScript.
3. Build the Windows installer and portable executable.
4. Copy release files into `download-site/downloads/`.
5. Calculate SHA-256 checksums.
6. Open the download page locally.

## Manual commands

```bash
npm ci
npm run check
npm run dist:win
npm run release:prepare
npm run download:serve
```

## Publish online

The `.github/workflows/release.yml` workflow builds release files when you push a Git tag such as `v1.0.0`. It attaches installers to GitHub Releases and publishes the download page to GitHub Pages.

Before using GitHub Actions, create a GitHub repository, upload this project, and enable **Settings → Pages → GitHub Actions**.

## Important

Public Windows distribution should use a code-signing certificate. Unsigned development installers may display a Windows SmartScreen warning.
