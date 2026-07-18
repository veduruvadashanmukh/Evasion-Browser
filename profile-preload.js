const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
contextBridge.exposeInMainWorld('profileAPI', {
  status: () => invoke('profile-status'),
  create: (data) => invoke('profile-create', data),
  update: (data) => invoke('profile-update', data),
  resetBrowserData: () => invoke('profile-reset-browser-data'),
  chooseAvatarColor: () => invoke('profile-random-color')
});
