const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('managerAPI', {
  getContext: () => invoke('manager-context'), close: () => invoke('manager-close'),
  checkUpdates: () => invoke('updates-get'), checkUpdatesNow: () => invoke('updates-check-now'), openUpdateURL: (url) => invoke('updates-open-url', url),
  getSettings: () => invoke('settings-get'), updateSettings: (patch) => invoke('settings-update', patch),
  chooseDownloadFolder: () => invoke('settings-choose-download-folder'), clearBrowsingData: () => invoke('settings-clear-data'),
  getExtensions: () => invoke('extensions-list'), loadExtension: () => invoke('extensions-load'), removeExtension: (id) => invoke('extensions-remove', id), reloadExtension: (id) => invoke('extensions-reload', id),
  getTabGroups: () => invoke('groups-get'), createGroup: (group) => invoke('groups-create', group), updateGroup: (id, patch) => invoke('groups-update', { id, patch }), deleteGroup: (id) => invoke('groups-delete', id), assignTab: (tabId, groupId) => invoke('groups-assign-tab', { tabId, groupId }), ungroupTab: (tabId) => invoke('groups-assign-tab', { tabId, groupId: null }),
  getSecurity: () => invoke('security-get'), resetSecurityStats: () => invoke('security-reset-stats'),
  getPerformanceMetrics: () => invoke('gaming-metrics'), getGamingData: () => invoke('gaming-data'),
  getQuickLaunch: () => invoke('quick-launch-get'), saveQuickLaunch: (items) => invoke('quick-launch-save', items), resetQuickLaunch: () => invoke('quick-launch-reset'),
  saveWorkspace: (name) => invoke('gaming-save-workspace', name), openWorkspace: (id) => invoke('gaming-open-workspace', id), deleteWorkspace: (id) => invoke('gaming-delete-workspace', id),
  addNote: (text) => invoke('gaming-add-note', text), deleteNote: (id) => invoke('gaming-delete-note', id),
  openURL: (url) => invoke('gaming-open-url', url), toggleMute: () => invoke('gaming-toggle-mute'), takeScreenshot: () => invoke('gaming-screenshot'), readerMode: () => invoke('gaming-reader-mode'),


  getAdvancedData: () => invoke('advanced-data'),
  sleepTab: (id) => invoke('advanced-sleep-tab', id), wakeTab: (id) => invoke('advanced-wake-tab', id), sleepInactiveTabs: (minutes) => invoke('advanced-sleep-inactive', minutes),
  shredCurrentSite: () => invoke('advanced-shred-site'), toggleAdvancedMode: (mode, enabled) => invoke('advanced-toggle-mode', { mode, enabled }),
  mediaAction: (tabId, action) => invoke('advanced-media-action', { tabId, action }),
  saveKnowledge: (payload) => invoke('advanced-save-knowledge', payload), deleteKnowledge: (id) => invoke('advanced-delete-knowledge', id),
  runCommand: (command) => invoke('advanced-command', command),
  getEvolutionData: () => invoke('evolution-data'),
  syncExport: (passphrase) => invoke('sync-export', { passphrase }), syncImport: (passphrase) => invoke('sync-import', { passphrase }),
  syncConfigure: (config) => invoke('sync-configure', config), syncPush: () => invoke('sync-push'), syncPull: () => invoke('sync-pull'),
  aiConfigure: (config) => invoke('ai-configure', config), aiAsk: (prompt) => invoke('ai-ask', { prompt }), aiUseActivePage: () => invoke('ai-use-active-page'),
  companionPair: () => invoke('companion-pair'), companionExport: () => invoke('companion-export'),
  clearAdvancedAnalytics: () => invoke('analytics-clear'), setProfileMode: (mode) => invoke('profile-mode-set', mode),
  getToolsData: () => invoke('tools-data'),
  addTask: (text) => invoke('tools-add-task', text), toggleTask: (id) => invoke('tools-toggle-task', id), deleteTask: (id) => invoke('tools-delete-task', id),
  savePomodoro: (value) => invoke('tools-save-pomodoro', value), openToolURL: (url) => invoke('tools-open-url', url), applyTheme: (patch) => invoke('tools-apply-theme', patch), localAI: (input) => invoke('tools-local-ai', input),
  onSettingsChanged: (callback) => { const fn = (_event, payload) => callback(payload); ipcRenderer.on('settings-changed', fn); return () => ipcRenderer.removeListener('settings-changed', fn); },
onUpdateStatus: (callback) => { const fn = (_event, payload) => callback(payload); ipcRenderer.on('manager-update-status', fn); return () => ipcRenderer.removeListener('manager-update-status', fn); }
});
