# Evasion Browser 1.5.1 — Phase 1

## Release foundation

- Updated application and lockfile versions to 1.5.1.
- Updated the in-app Updates page version.
- Updated the download-site manifest template.
- GitHub Pages now deploys automatically after a version tag build.
- Preserved silent update behavior: the data-deletion prompt is skipped during updates.
- Interactive uninstall still asks whether browser data should be removed.
- Verified that profile management no longer contains Change Password or Quick PIN controls.
- Hardened manager-window broadcasts against stale or invalid window records.
- Added safe checks before sending settings/update events to management windows.

## Release tag

Use `v1.5.1`.
