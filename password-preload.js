const { contextBridge, ipcRenderer } = require('electron');
const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('vaultAPI', {
  status: () => invoke('vault-status'),
  create: (password) => invoke('vault-create', password),
  unlock: (password) => invoke('vault-unlock', password),
  lock: () => invoke('vault-lock'),
  list: () => invoke('vault-list'),
  reveal: (id) => invoke('vault-reveal', id),
  add: (entry) => invoke('vault-add', entry),
  update: (id, entry) => invoke('vault-update', { id, entry }),
  remove: (id) => invoke('vault-remove', id),
  copyUsername: (id) => invoke('vault-copy-username', id),
  copyPassword: (id) => invoke('vault-copy-password', id),
  generate: (options) => invoke('vault-generate', options),
  strength: (password) => invoke('vault-strength', password),
  exportVault: () => invoke('vault-export'),
  importVault: () => invoke('vault-import'),
  changeMasterPassword: (currentPassword, newPassword) => invoke('vault-change-master', { currentPassword, newPassword }),
  resetVault: (confirmation) => invoke('vault-reset', { confirmation })
});
