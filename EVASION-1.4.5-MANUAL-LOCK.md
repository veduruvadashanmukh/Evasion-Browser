# Evasion Browser 1.4.5

## Password manager session behavior

- Removed the **Lock after this time** option.
- Removed timer-based automatic vault locking.
- The vault remains unlocked during the active browser session.
- The user can still lock the vault manually.
- Closing Evasion clears the in-memory vault key, so the vault must be unlocked again on the next browser launch.
