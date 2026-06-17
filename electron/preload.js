const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('scola', {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, callback) =>
        ipcRenderer.on(channel, (_, ...args) => callback(...args)),
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
})