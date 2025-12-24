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
  insertToTerminal: (tabId, text) => ipcRenderer.send('insert-to-terminal', { tabId, text }),
  getTerminalContext: (tabId) => ipcRenderer.invoke('get-terminal-context', tabId),
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

  // Cancel recording (abort without sending)
  onCancelRecording: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('cancel-recording', handler);
    return () => ipcRenderer.removeListener('cancel-recording', handler);
  },

  // Toggle mode (raw/agent)
  onToggleMode: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-mode', handler);
    return () => ipcRenderer.removeListener('toggle-mode', handler);
  },

  // Clear terminal
  onClearTerminal: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('clear-terminal', handler);
    return () => ipcRenderer.removeListener('clear-terminal', handler);
  },

  // Cycle layout
  onCycleLayout: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('cycle-layout', handler);
    return () => ipcRenderer.removeListener('cycle-layout', handler);
  },

  // Focus next/prev terminal
  onFocusNextTerminal: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('focus-next-terminal', handler);
    return () => ipcRenderer.removeListener('focus-next-terminal', handler);
  },
  onFocusPrevTerminal: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('focus-prev-terminal', handler);
    return () => ipcRenderer.removeListener('focus-prev-terminal', handler);
  },

  // Bookmark directory
  onBookmarkDirectory: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('bookmark-directory', handler);
    return () => ipcRenderer.removeListener('bookmark-directory', handler);
  },

  // Resend last transcription
  onResendLast: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('resend-last', handler);
    return () => ipcRenderer.removeListener('resend-last', handler);
  },

  // Switch tab (receives tab index 0-3)
  onSwitchTab: (callback) => {
    const handler = (_, index) => callback(index);
    ipcRenderer.on('switch-tab', handler);
    return () => ipcRenderer.removeListener('switch-tab', handler);
  },

  // Keyboard shortcuts management
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  setShortcuts: (shortcuts) => ipcRenderer.invoke('set-shortcuts', shortcuts),
  validateShortcut: (shortcut) => ipcRenderer.invoke('validate-shortcut', shortcut),

  // API key management (supports multiple providers: gemini, openai, anthropic, elevenlabs)
  getApiKey: (provider = 'gemini') => ipcRenderer.invoke('get-api-key', provider),
  setApiKey: (key, provider = 'gemini') => ipcRenderer.invoke('set-api-key', key, provider),

  // Directory management
  getDirectories: () => ipcRenderer.invoke('get-directories'),
  addFavoriteDirectory: (dir) => ipcRenderer.invoke('add-favorite-directory', dir),
  removeFavoriteDirectory: (dir) => ipcRenderer.invoke('remove-favorite-directory', dir),
  cdToDirectory: (tabId, dir) => ipcRenderer.invoke('cd-to-directory', { tabId, dir }),
  browseDirectory: () => ipcRenderer.invoke('browse-directory'),

  // Preview pane
  capturePreview: (url, cwd) => ipcRenderer.invoke('capture-preview', url, cwd),
  watchFile: (filepath) => ipcRenderer.invoke('watch-file', filepath),
  unwatchFile: (watcherId) => ipcRenderer.invoke('unwatch-file', watcherId),
  validateFilePath: (filepath) => ipcRenderer.invoke('validate-file-path', filepath),
  onFileChanged: (callback) => {
    const handler = (_, { watcherId, filepath }) => callback(filepath);
    ipcRenderer.on('file-changed', handler);
    return () => ipcRenderer.removeListener('file-changed', handler);
  },
  onTogglePreview: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-preview', handler);
    return () => ipcRenderer.removeListener('toggle-preview', handler);
  },
  onCaptureScreenshot: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('capture-screenshot', handler);
    return () => ipcRenderer.removeListener('capture-screenshot', handler);
  },

  // Remote control (mobile companion)
  getRemoteStatus: () => ipcRenderer.invoke('get-remote-status'),
  regeneratePairingCode: () => ipcRenderer.invoke('regenerate-pairing-code'),
  setRemotePassword: (password) => ipcRenderer.invoke('set-remote-password', password),
  getRemotePassword: () => ipcRenderer.invoke('get-remote-password'),
  setKeepAwake: (enabled) => ipcRenderer.invoke('set-keep-awake', enabled),
  getKeepAwake: () => ipcRenderer.invoke('get-keep-awake'),
  onRemoteStatusChanged: (callback) => {
    const handler = (_, status) => callback(status);
    ipcRenderer.on('remote-status-changed', handler);
    return () => ipcRenderer.removeListener('remote-status-changed', handler);
  },
  onRemoteTranscriptionRequest: (callback) => {
    const handler = (_, request) => callback(request);
    ipcRenderer.on('remote-transcription-request', handler);
    return () => ipcRenderer.removeListener('remote-transcription-request', handler);
  },
  sendRemoteTranscriptionResult: (result) => {
    ipcRenderer.send('remote-transcription-result', result);
  },
  onRemoteSwitchTab: (callback) => {
    const handler = (_, tabId) => callback(tabId);
    ipcRenderer.on('remote-switch-tab', handler);
    return () => ipcRenderer.removeListener('remote-switch-tab', handler);
  },
});
