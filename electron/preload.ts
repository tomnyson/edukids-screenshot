// preload.ts — Must use CommonJS-compatible syntax
// Electron loads preload via require(), NOT ESM import loader
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Returns screen source IDs — renderer uses getUserMedia to capture actual pixels
  getSources: () => ipcRenderer.invoke('get-sources'),
  saveImage: (dataUrl: string, defaultName: string) => ipcRenderer.invoke('save-image', dataUrl, defaultName),
  copyImage: (dataUrl: string) => ipcRenderer.invoke('copy-image', dataUrl),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  startRegionCapture: (dataUrl: string) => ipcRenderer.invoke('start-region-capture', dataUrl),
  closeOverlay: (dataUrl: string | null) => ipcRenderer.invoke('close-overlay', dataUrl),
  getOverlayImage: () => ipcRenderer.invoke('get-overlay-image'),
  onInitOverlay: (callback: (dataUrl: string) => void) => ipcRenderer.on('init-overlay', (_: any, url: string) => callback(url)),
  onRegionCaptured: (callback: (dataUrl: string) => void) => {
    ipcRenderer.removeAllListeners('region-captured');
    ipcRenderer.on('region-captured', (_: any, url: string) => callback(url));
  },
  // Global shortcut triggers from main process
  onTriggerCaptureRegion: (callback: () => void) => {
    ipcRenderer.removeAllListeners('trigger-capture-region');
    ipcRenderer.on('trigger-capture-region', () => callback());
  },
  onTriggerCaptureFull: (callback: () => void) => {
    ipcRenderer.removeAllListeners('trigger-capture-full');
    ipcRenderer.on('trigger-capture-full', () => callback());
  },
});
