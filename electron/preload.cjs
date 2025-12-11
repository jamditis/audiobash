const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Window controls
  minimize: () => ipcRenderer.send('minimize'),
  maximize: () => ipcRenderer.send('maximize'),
  close: () => ipcRenderer.send('close'),

  // Terminal tab management
  createTerminal: (tabId) => ipcRenderer.invoke('create-terminal', tabId),
  closeTerminal: (tabId) => ipcRenderer.invoke('close-terminal', tabId),
  getTerminalCount: () => ipcRenderer.invoke('get-terminal-count'),

  // Terminal I/O (with tabId)
  writeToTerminal: (tabId, data) => ipcRenderer.send('terminal-write', { tabId, data }),
  resizeTerminal: (tabId, cols, rows) => ipcRenderer.send('terminal-resize', { tabId, cols, rows }),
  sendToTerminal: (tabId, text) => ipcRenderer.send('send-to-terminal', { tabId, text }),
  onTerminalData: (callback) => {
    const handler = (_, { tabId, data }) => callback(tabId, data);
    ipcRenderer.on('terminal-data', handler);
    return () => ipcRenderer.removeListener('terminal-data', handler);
  },
  onTerminalClosed: (callback) => {
    const handler = (_, { tabId, exitCode, signal }) => callback(tabId, exitCode, signal);
    ipcRenderer.on('terminal-closed', handler);
    return () => ipcRenderer.removeListener('terminal-closed', handler);
  },

  // Voice recording toggle (from global shortcut)
  onToggleRecording: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-recording', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('toggle-recording', handler);
  },

  // Keyboard shortcuts management
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  setShortcuts: (shortcuts) => ipcRenderer.invoke('set-shortcuts', shortcuts),
  validateShortcut: (shortcut) => ipcRenderer.invoke('validate-shortcut', shortcut),

  // API key management (supports multiple providers: gemini, openai, anthropic, elevenlabs)
  getApiKey: (provider = 'gemini') => ipcRenderer.invoke('get-api-key', provider),
  setApiKey: (key, provider = 'gemini') => ipcRenderer.invoke('set-api-key', key, provider),
});
