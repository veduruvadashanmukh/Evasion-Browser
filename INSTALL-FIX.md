# Installation and build

## Recommended commands

Open a terminal in this folder and run:

```bat
npm ci
npm run check
npm start
```

To build the Windows installer and portable executable:

```bat
npm run dist:win
```

Or double-click `build-windows.bat`.

## If npm reports "Exit handler never called"

The project now includes a clean, regenerated `package-lock.json`. If npm still fails because of a damaged local cache, double-click:

```text
repair-install.bat
```

That script deletes only this project's `node_modules`, clears npm's cache, and runs `npm ci` again.

You can also run these commands manually:

```bat
rmdir /s /q node_modules
npm cache clean --force
npm ci
```

If the npm command itself remains broken, update npm and reopen the terminal:

```bat
npm install -g npm@latest
```
