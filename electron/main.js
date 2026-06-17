const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const { fork } = require('child_process')

const isDev = !app.isPackaged

let mainWindow
let serverProcess

function startExpressServer() {
    const serverPath = isDev
        ? path.join(__dirname, '../server/index.js')
        : path.join(process.resourcesPath, 'server/index.js')

    serverProcess = fork(serverPath, [], {
        env: {
            ...process.env,
            PORT: '3000',
            NODE_ENV: isDev ? 'development' : 'production',
        },
        stdio: 'pipe',
    })

    serverProcess.stdout?.on('data', (d) =>
        console.log('[SERVER]', d.toString())
    )
    serverProcess.stderr?.on('data', (d) =>
        console.error('[SERVER ERR]', d.toString())
    )
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false,
        titleBarStyle: 'default',
    })

    const url = isDev
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, '../dist/index.html')}`

    mainWindow.loadURL(url)

    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
        if (isDev) mainWindow.webContents.openDevTools()
    })

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
    })
}

app.whenReady().then(() => {
    startExpressServer()
    setTimeout(createWindow, 1500)
})

app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill()
    if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
    if (serverProcess) serverProcess.kill()
})