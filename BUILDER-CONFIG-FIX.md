# Electron Builder configuration fix

This project was repaired for electron-builder 26.x.

Changes:
- Removed unsupported Windows publisher fields from `build.win`.
- Corrected Linux desktop metadata to use `linux.desktop.entry`.
- Simplified macOS configuration.
- Changed the Windows build command to `electron-builder --win --x64`.

Build on Windows:

```bat
npm ci --no-audit --no-fund
npm run check
npm run dist:win
```

Artifacts are written to `dist/`.
