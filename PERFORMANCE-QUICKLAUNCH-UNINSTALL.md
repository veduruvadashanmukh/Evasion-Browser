# Evasion Browser 1.2 improvements

## Performance modes

Performance settings are stored in the per-user browser store and applied immediately to open tabs and newly created tabs.

- Eco: aggressive sleeping and background throttling.
- Balanced: normal daily-use limits.
- Turbo: prioritizes responsiveness while retaining pressure-based cleanup.
- Systems with about 4 GB RAM automatically receive an aggressive low-memory policy.

No browser can provide unlimited tab capacity; Evasion now degrades more safely by sleeping old background tabs when memory is constrained.

## Quick Launch

The homepage and Evasion Control both support user-specific customizable shortcuts. Users can add, remove, reorder, and restore defaults.

## Passwords

Profile passwords now require 8 or more characters, at least one letter and one number, and no spaces. The rule is displayed before submission.

## Uninstall data choice

The Windows uninstaller asks whether browser data should be permanently deleted or kept for a later reinstall. The default application setting still preserves data unless the user explicitly confirms deletion.
