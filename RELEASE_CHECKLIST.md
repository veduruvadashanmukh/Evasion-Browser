# Evasion Browser Release Checklist

1. Run `npm install`.
2. Run `npm run check`.
3. Start the app with `npm start` and test normal and private windows.
4. Test tabs, settings, downloads, history, bookmarks, and password vault.
5. Confirm the taskbar and installer icon.
6. Update the version in `package.json`.
7. Build on the target operating system.
8. Test installation and uninstallation on a clean computer.
9. Review `PRIVACY.md` and release notes.
10. Code-sign public installers when a certificate is available.
