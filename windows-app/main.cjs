const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

let mainWindow;
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    title: 'GRAPEVINE',
    icon: path.join(__dirname, 'grapevine.ico'),
    backgroundColor: '#111827',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const splash = new BrowserWindow({
    width: 440,
    height: 300,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    backgroundColor: '#111827',
    icon: path.join(__dirname, 'grapevine.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  const splashHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#111827;color:#fff;font-family:Segoe UI,Arial,sans-serif;text-align:center}
  .wrap{padding:24px}.logo{width:78px;height:78px;object-fit:contain;border-radius:50%;margin-bottom:12px}h1{font-size:27px;letter-spacing:3px;margin:0 0 8px}p{font-size:13px;color:#cbd5e1;margin:0}.brand{color:#60a5fa;font-weight:700}
  </style></head><body><div class="wrap"><img class="logo" src="${pathToFileURL(path.join(__dirname, 'launcher-badge.png')).href}"/><h1>GRAPEVINE</h1><p>Powered By <span class="brand">Mafia Boss</span></p></div></body></html>`;
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml));

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (!splash.isDestroyed()) splash.close();
      if (!mainWindow.isDestroyed()) mainWindow.show();
    }, 1100);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('mailto:')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.grapevine.desktop');
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
