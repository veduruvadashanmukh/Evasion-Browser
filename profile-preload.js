const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
contextBridge.exposeInMainWorld('profileAPI', {
  status: () => invoke('profile-status'),
  create: (data) => invoke('profile-create', data),
  login: (data) => invoke('profile-login', data),
  update: (data) => invoke('profile-update', data),
  changePassword: (data) => invoke('profile-change-password', data),
  setPin: (data) => invoke('profile-set-pin', data),
  lock: (forget = false) => invoke('profile-lock', { forget }),
  resetBrowserData: (password) => invoke('profile-reset-browser-data', { password }),
  chooseAvatarColor: () => invoke('profile-random-color')
});
