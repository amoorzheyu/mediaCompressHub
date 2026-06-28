'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('mediaCompressHub', {
  compressVideoNative(payload) {
    return ipcRenderer.invoke('native-video:compress', payload)
  },
  onNativeVideoProgress(listener) {
    const handler = (_event, message) => listener(message)
    ipcRenderer.on('native-video:progress', handler)
    return () => ipcRenderer.removeListener('native-video:progress', handler)
  },
})
