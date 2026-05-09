const { app, BrowserWindow } = require('electron');
function createWindow() { const win = new BrowserWindow({ width: 1400, height: 900, title: 'Safety Service Rozliczanie' }); win.loadURL(process.env.APP_URL || 'https://app.safety-service.pl'); }
app.whenReady().then(createWindow);
