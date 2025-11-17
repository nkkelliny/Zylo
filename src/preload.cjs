// CommonJS preload (project is "type":"module", so we use .cjs)
const { contextBridge, ipcRenderer } = require('electron')

// --- INTERNAL: Permission listener registry ---
const permRequestListeners = []
ipcRenderer.on('perm-request', (e, data) => {
  permRequestListeners.forEach(fn => fn(data))
})

contextBridge.exposeInMainWorld('native', {
  // Window / file helpers
  savePageAs: (url, name) => ipcRenderer.invoke('save-page-as', { url, suggestedName: name }),
  newIncognito: () => ipcRenderer.invoke('new-incognito'),
  newWindow: () => ipcRenderer.invoke('new-window'),
  setUserAgent: (ua) => ipcRenderer.invoke('set-user-agent', ua),
  reopenFolder: (p) => ipcRenderer.invoke('reopen-folder', p),
  switchProfile: (id) => ipcRenderer.invoke('switch-profile', id),

  // Downloads shelf events
  onDownloadStarted: (cb) => ipcRenderer.on('download-started', (_e, d) => cb && cb(d)),
  onDownloadUpdated: (cb) => ipcRenderer.on('download-updated', (_e, d) => cb && cb(d)),
  onDownloadDone:    (cb) => ipcRenderer.on('download-done',    (_e, d) => cb && cb(d)),

  // --- Permissions flow ---
  onPermissionRequest: (cb) => {
    if (typeof cb === 'function') permRequestListeners.push(cb)
  },

  permRespond: (id, decision) =>
    ipcRenderer.send('perm-respond', { id, decision }),

  onPermissionsUpdated: (cb) =>
    ipcRenderer.on('permissions-updated', (_e, d) => cb && cb(d))
})
