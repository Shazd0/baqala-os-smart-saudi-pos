'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const db = require('./db.cjs');

// Suppress verbose auto-updater logs in production; errors still surface via the error event
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// ── ESC/POS Pure-JS command builder ─────────────────────────────────────────
function escpos() {
  const cmds = [];
  const ESC = 0x1B, GS = 0x1D;
  return {
    init()        { cmds.push(Buffer.from([ESC, 0x40])); return this; },
    cut()         { cmds.push(Buffer.from([GS, 0x56, 0x00])); return this; },
    lineFeed(n=1) { cmds.push(Buffer.alloc(n, 0x0A)); return this; },
    align(a)      { cmds.push(Buffer.from([ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0])); return this; },
    bold(on)      { cmds.push(Buffer.from([ESC, 0x45, on ? 1 : 0])); return this; },
    doubleSize(on){ cmds.push(Buffer.from([ESC, 0x21, on ? 0x30 : 0x00])); return this; },
    text(s)       { cmds.push(Buffer.from(s + '\n', 'utf8')); return this; },
    textRaw(s)    { cmds.push(Buffer.from(s, 'utf8')); return this; },
    openDrawer()  { cmds.push(Buffer.from([0x10, 0x14, 0x00, 0x01, 0x00])); return this; },
    toBuffer()    { return Buffer.concat(cmds); },
  };
}

function buildReceiptBuffer(data) {
  const p = escpos().init();
  p.align('center').doubleSize(true).bold(true).text(data.storeName || 'Baqala OS');
  p.doubleSize(false).bold(false);
  if (data.address) p.text(data.address);
  if (data.vatNumber) p.text(`VAT: ${data.vatNumber}`);
  p.lineFeed(1);
  p.align('left').text(`Date: ${data.date}   Invoice: ${data.invoiceId}`);
  if (data.cashierName) p.text(`Cashier: ${data.cashierName}`);
  p.text('--------------------------------');
  for (const item of (data.items || [])) {
    const qty   = String(item.qty).padEnd(4);
    const name  = (item.name || '').substring(0, 18).padEnd(18);
    const price = (item.price != null ? item.price.toFixed(2) : '').padStart(8);
    p.text(`${qty} ${name} ${price}`);
  }
  p.text('--------------------------------');
  const lbl  = s => s.padEnd(22);
  const val  = n => (n != null ? n.toFixed(2) : '').padStart(8);
  if (data.discount > 0) p.text(`${lbl('Discount')}${val(-data.discount)}`);
  p.text(`${lbl('Subtotal')}${val(data.subtotal)}`);
  p.text(`${lbl('VAT 15%')}${val(data.vat)}`);
  p.bold(true).text(`${lbl('TOTAL')}${val(data.total)}`).bold(false);
  p.text(`${lbl('Paid (' + (data.paymentMethod || 'Cash') + ')')}${val(data.paid)}`);
  if (data.change > 0) p.text(`${lbl('Change')}${val(data.change)}`);
  p.lineFeed(1);
  if (data.qrCode) p.align('center').text('** Scan for ZATCA QR **').text(data.qrCode);
  if (data.invoiceHash) {
    const hash = data.invoiceHash.substring(0, 40) + '...';
    p.text(hash);
  }
  p.lineFeed(1).align('center').text('Thank you! \u0634\u0643\u0631\u0627\u064b \u0644\u0643').lineFeed(3).cut();
  return p.toBuffer();
}

function sendToTcpPrinter(host, port, buffer) {
  return new Promise((resolve) => {
    const client = require('net').createConnection({ host, port: port || 9100 }, () => {
      client.write(buffer, () => { client.end(); resolve({ success: true }); });
    });
    client.on('error', err  => resolve({ success: false, error: err.message }));
    client.on('timeout', () => { client.destroy(); resolve({ success: false, error: 'timeout' }); });
    client.setTimeout(5000);
  });
}

const isDev = !app.isPackaged;

// Electron security: disable navigation to external URLs
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    const allowed = ['localhost', '127.0.0.1'];
    const allowedOrigins = ['https://gw-fatoora.zatca.gov.sa', 'https://firebaseapp.com'];
    const isAllowed = isDev
      ? allowed.includes(parsed.hostname)
      : allowedOrigins.some(o => url.startsWith(o)) || parsed.protocol === 'file:';
    if (!isAllowed) event.preventDefault();
  });

  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

let mainWindow = null;
let customerWindow = null;

function createCustomerWindow() {
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  const secondDisplay = displays.find(d => d.id !== screen.getPrimaryDisplay().id);
  const bounds = secondDisplay ? secondDisplay.bounds : { x: 0, y: 0, width: 800, height: 600 };

  customerWindow = new BrowserWindow({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    frame: false,
    alwaysOnTop: !secondDisplay,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    customerWindow.loadURL('http://localhost:3000/#customer-display');
  } else {
    customerWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'customer-display' });
  }

  customerWindow.on('closed', () => { customerWindow = null; });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('userData'), 'baqala-os.db');
  db.init(dbPath);

  // Enforce Content-Security-Policy via response headers (overrides meta tag,
  // which cannot be relied on in Electron's file:// protocol).
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self';" +
          "script-src 'self';" +
          "connect-src 'self' https: wss:;" +
          "img-src 'self' data: blob:;" +
          "worker-src blob:;" +
          "style-src 'self' 'unsafe-inline';" +
          "font-src 'self' data:;" +
          "object-src 'none';" +
          "base-uri 'self';"
        ],
        // Prevent the app from being embedded in iframes
        'X-Frame-Options': ['SAMEORIGIN'],
        'X-Content-Type-Options': ['nosniff'],
      },
    });
  });

  createWindow();
  scheduleAutoBackup();

  // Auto-update (production only)
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('update-available', (info) => {
      if (mainWindow) {
        mainWindow.webContents.send('update:available', { version: info.version });
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Update ready — Baqala OS',
          message: `Version ${info.version} has been downloaded. Restart now to apply the update?`,
          buttons: ['Restart Now', 'Later'],
          defaultId: 0,
          cancelId: 1,
        }).then(({ response }) => {
          if (response === 0) autoUpdater.quitAndInstall(false, true);
        });
      }
    });

    autoUpdater.on('error', (err) => {
      console.warn('[AutoUpdater] error:', err?.message || err);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ── IPC: Input validation helpers ────────────────────────────────────────────

function isString(v) { return typeof v === 'string' && v.length < 2_000_000; }
function isSafeKey(k) { return isString(k) && /^[\w.\-:]+$/.test(k) && k.length < 256; }

/** Validate that every key and value in a batch are safe. */
function validateBatch(entries) {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return false;
  for (const [k, v] of Object.entries(entries)) {
    if (!isSafeKey(k)) return false;
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean' &&
        v !== null && typeof v !== 'object') return false;
  }
  return true;
}

// ── IPC: Database ────────────────────────────────────────────────────────────

ipcMain.handle('db:read-all', () => {
  return db.readAll();
});

ipcMain.handle('db:write-entry', (_, key, value) => {
  if (!isSafeKey(key)) { console.warn('[IPC] db:write-entry rejected unsafe key', key); return; }
  db.write(key, value);
});

ipcMain.handle('db:write-batch', (_, entries) => {
  if (!validateBatch(entries)) { console.warn('[IPC] db:write-batch rejected unsafe payload'); return; }
  db.writeBatch(entries);
});

// ── IPC: Backup ──────────────────────────────────────────────────────────────

ipcMain.handle('backup:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Backup Folder',
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

ipcMain.handle('backup:export', async (_, folderPath) => {
  try {
    const targetFolder = folderPath || app.getPath('documents');
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `baqala-backup-${date}.json`;
    const filePath = path.join(targetFolder, fileName);

    const allData = db.readAll();
    const backup = {
      version: app.getVersion(),
      exportedAt: new Date().toISOString(),
      data: allData,
    };

    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf8');

    // Update last backup time in settings
    const settingsRaw = db.read('__backup_settings');
    const settings = settingsRaw || { autoBackup: false, backupFolder: '' };
    settings.lastBackupAt = Date.now();
    settings.lastBackupPath = filePath;
    db.write('__backup_settings', JSON.stringify(settings));

    if (mainWindow) {
      mainWindow.webContents.send('backup:done', { success: true, path: filePath });
    }
    return { success: true, path: filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
});

ipcMain.handle('backup:import', async (_, filePath) => {
  try {
    let targetFile = filePath;
    if (!targetFile) {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        title: 'Select Backup File',
        filters: [{ name: 'JSON Backup', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePaths.length) {
        return { success: false };
      }
      targetFile = result.filePaths[0];
    }

    const raw = fs.readFileSync(targetFile, 'utf8');
    const backup = JSON.parse(raw);
    if (!backup.data || typeof backup.data !== 'object') {
      throw new Error('Invalid backup file format.');
    }

    const entries = {};
    for (const [key, value] of Object.entries(backup.data)) {
      entries[key] = JSON.stringify(value);
    }
    db.writeBatch(entries);

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
});

ipcMain.handle('backup:get-settings', () => {
  const settings = db.read('__backup_settings');
  return settings || { autoBackup: false, backupFolder: '', lastBackupAt: null, lastBackupPath: null };
});

ipcMain.handle('backup:save-settings', (_, settings) => {
  db.write('__backup_settings', JSON.stringify(settings));
});

// ── IPC: App ─────────────────────────────────────────────────────────────────

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('app:open-path', (_, p) => shell.openPath(p));

ipcMain.handle('app:check-update', async () => {
  if (isDev) return { isDev: true };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { updateAvailable: !!result?.updateInfo };
  } catch (e) {
    return { error: e.message };
  }
});

ipcMain.handle('app:install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('zatca:get-data-path', () => app.getPath('userData'));

// ── IPC: ESC/POS Thermal Printer ─────────────────────────────────────────────

ipcMain.handle('printer:print-receipt', async (_, config, receiptData) => {
  try {
    const buf = buildReceiptBuffer(receiptData);
    return await sendToTcpPrinter(config.host, config.port, buf);
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('printer:open-drawer', async (_, config) => {
  try {
    const buf = escpos().init().openDrawer().toBuffer();
    return await sendToTcpPrinter(config.host, config.port, buf);
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('printer:test-print', async (_, config) => {
  try {
    const buf = escpos().init().align('center').bold(true).text('Baqala OS').bold(false)
      .text('Printer Test OK').text(new Date().toLocaleString()).lineFeed(3).cut().toBuffer();
    return await sendToTcpPrinter(config.host, config.port, buf);
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('printer:get-config', () => {
  return db.read('__printer_config') || { host: '', port: 9100, enabled: false };
});

ipcMain.handle('printer:save-config', (_, config) => {
  db.write('__printer_config', JSON.stringify(config));
});

// ── IPC: Customer-facing display ─────────────────────────────────────────────

ipcMain.handle('customer-display:open', () => { if (!customerWindow) createCustomerWindow(); });
ipcMain.handle('customer-display:close', () => { if (customerWindow) { customerWindow.close(); customerWindow = null; } });
ipcMain.handle('customer-display:update', (_, cartData) => {
  if (customerWindow) customerWindow.webContents.send('customer-display:cart', cartData);
});
ipcMain.handle('customer-display:is-open', () => !!customerWindow);

// ── IPC: License ─────────────────────────────────────────────────────────────

function getElectronMachineId() {
  const raw = `${os.hostname()}|${(os.cpus()[0]?.model || '')}|${os.platform()}`;
  return 'electron-' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

ipcMain.handle('license:get-machine-id', () => getElectronMachineId());

ipcMain.handle('license:load', () => {
  const raw = db.read('__activation');
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
});

ipcMain.handle('license:save', (_, record) => {
  if (!record || typeof record !== 'object') return;
  db.write('__activation', JSON.stringify(record));
});

ipcMain.handle('license:clear', () => {
  db.write('__activation', null);
});

// ── Auto-backup ───────────────────────────────────────────────────────────────

function scheduleAutoBackup() {
  try {
    const settings = db.read('__backup_settings');
    if (!settings || !settings.autoBackup || !settings.backupFolder) return;

    const folder = settings.backupFolder;
    if (!fs.existsSync(folder)) return;

    const date = new Date().toISOString().slice(0, 10);
    const fileName = `baqala-backup-${date}.json`;
    const filePath = path.join(folder, fileName);

    // Only back up once per day
    if (fs.existsSync(filePath)) return;

    const allData = db.readAll();
    const backup = {
      version: app.getVersion(),
      exportedAt: new Date().toISOString(),
      data: allData,
    };

    fs.writeFileSync(filePath, JSON.stringify(backup, null, 2), 'utf8');

    settings.lastBackupAt = Date.now();
    settings.lastBackupPath = filePath;
    db.write('__backup_settings', JSON.stringify(settings));
  } catch (error) {
    console.warn('Auto-backup failed on startup:', error);
  }
}
