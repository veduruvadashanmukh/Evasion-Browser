; UPDATE-SAFE UNINSTALL HOOK
; electron-updater invokes the previous uninstaller silently during an update.
; IfSilent must remain the first branch so update installs never display the
; user-data deletion question. Interactive uninstalls still show the prompt.
!macro customUnInstall
  ; electron-builder runs the previous uninstaller silently while applying an
  ; update. Never show the data-deletion question in that silent update path,
  ; and always keep the existing browser profile/data.
  IfSilent keepData

  ; A normal uninstall launched by the user is interactive, so ask whether
  ; local browser data should also be removed.
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to permanently delete all Evasion Browser profiles, passwords, history, bookmarks, cookies, cache and settings?$\r$\n$\r$\nChoose No to keep your data for a future reinstall." \
    IDNO keepData

  RMDir /r "$APPDATA\Evasion Browser"
  RMDir /r "$LOCALAPPDATA\Evasion Browser"
  RMDir /r "$APPDATA\evasion-browser"
  RMDir /r "$LOCALAPPDATA\evasion-browser"
  DetailPrint "Evasion Browser user data was deleted."
  Goto doneData

keepData:
  DetailPrint "Evasion Browser user data was kept."

doneData:
!macroend
