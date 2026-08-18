'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Storage
  readAll: () => ipcRenderer.invoke('db:read-all'),
  writeEntry: (key, value) => ipcRenderer.invoke('db:write-entry', key, value),
  writeBatch: (entries) => ipcRenderer.invoke('db:write-batch', entries),

  // Backup
  selectBackupFolder: () => ipcRenderer.invoke('backup:select-folder'),
  exportBackup: (folderPath) => ipcRenderer.invoke('backup:export', folderPath),
  importBackup: (filePath) => ipcRenderer.invoke('backup:import', filePath),
  getBackupSettings: () => ipcRenderer.invoke('backup:get-settings'),
  saveBackupSettings: (settings) => ipcRenderer.invoke('backup:save-settings', settings),

  // App
  getVersion: () => ipcRenderer.invoke('app:version'),
  openPath: (p) => ipcRenderer.invoke('app:open-path', p),
  getDataPath: () => ipcRenderer.invoke('zatca:get-data-path'),

  // Events
  onBackupComplete: (cb) => {
    const handler = (_, result) => cb(result);
    ipcRenderer.on('backup:done', handler);
    return () => ipcRenderer.removeListener('backup:done', handler);
  },

  // Printer
  getPrinterConfig:   () => ipcRenderer.invoke('printer:get-config'),
  savePrinterConfig:  (cfg) => ipcRenderer.invoke('printer:save-config', cfg),
  printReceipt:       (cfg, data) => ipcRenderer.invoke('printer:print-receipt', cfg, data),
  openCashDrawer:     (cfg) => ipcRenderer.invoke('printer:open-drawer', cfg),
  testPrint:          (cfg) => ipcRenderer.invoke('printer:test-print', cfg),

  // Customer display
  openCustomerDisplay:  () => ipcRenderer.invoke('customer-display:open'),
  closeCustomerDisplay: () => ipcRenderer.invoke('customer-display:close'),
  updateCustomerDisplay: (cartData) => ipcRenderer.invoke('customer-display:update', cartData),
  isCustomerDisplayOpen: () => ipcRenderer.invoke('customer-display:is-open'),
  onCustomerDisplayCart: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('customer-display:cart', handler);
    return () => ipcRenderer.removeListener('customer-display:cart', handler);
  },

  // Updates
  checkForUpdate:  () => ipcRenderer.invoke('app:check-update'),
  installUpdate:   () => ipcRenderer.invoke('app:install-update'),
  onUpdateAvailable: (cb) => {
    const handler = (_, info) => cb(info);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },

  // License
  getMachineId:   () => ipcRenderer.invoke('license:get-machine-id'),
  loadLicense:    () => ipcRenderer.invoke('license:load'),
  saveLicense:    (record) => ipcRenderer.invoke('license:save', record),
  clearLicense:   () => ipcRenderer.invoke('license:clear'),
});
