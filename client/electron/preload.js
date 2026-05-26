const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zynk', {
  sendNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  platform: process.platform,
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close')
});
