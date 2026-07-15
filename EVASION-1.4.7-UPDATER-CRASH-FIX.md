# Evasion Browser 1.4.7

## Automatic updater crash fix

Fixed the main-process error:

`TypeError: win.isDestroyed is not a function`

The updater status broadcaster now correctly handles manager-window records,
checks the real BrowserWindow, and verifies its webContents before sending
download progress events.
