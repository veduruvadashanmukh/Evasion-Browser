# Building Evasion Browser

## Requirements

- Windows 10/11, macOS, or a supported Linux distribution
- Node.js 20 LTS or newer
- npm

## Development

```bash
npm install
npm run check
npm start
```

## Windows installer and portable app

Run this command on Windows:

```bash
npm run dist:win
```

Outputs are written to `dist/`:

- NSIS installer: `Evasion-Browser-1.0.0-win-x64.exe`
- Portable executable: an additional Windows `.exe`

## Linux packages

```bash
npm run dist:linux
```

## macOS disk image

Run on macOS:

```bash
npm run dist:mac
```

macOS distribution normally requires Apple signing and notarization.

## Windows SmartScreen

Unsigned installers may show a Windows SmartScreen warning. A trusted
code-signing certificate is required to reduce those warnings for public
releases.
