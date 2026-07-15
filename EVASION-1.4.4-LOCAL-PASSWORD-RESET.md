# Evasion Browser 1.4.4

## Local password-vault reset

- Added a friendly incorrect-password notification.
- Added **Forgot master password?** to the unlock screen.
- Added a local reset flow with explicit data-loss warning.
- Requires typing `RESET`, choosing a new master password, and acknowledging deletion.
- Deletes the old encrypted vault and immediately creates a new vault.
- No Google account, OAuth client, internet connection, or external service is required.

Important: encrypted passwords cannot be recovered without the original master password.
