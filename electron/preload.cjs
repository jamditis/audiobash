/**
 * @fileoverview Electron Preload Script - IPC Bridge API
 *
 * This script runs in the renderer process with access to Node.js APIs before
 * web page scripts execute. It exposes a secure API to the renderer through
 * Electron's contextBridge, enabling communication between the renderer and
 * main process via IPC (Inter-Process Communication).
 *
 * The exposed API is available in the renderer as `window.electron`.
 *
 * @module electron/preload
 * @requires electron
 *
 * @example
 * // In renderer process (React components)
 * const { electron } = window;
 *
 * // Create a terminal
 * await electron.createTerminal('tab-1');
 *
 * // Listen for terminal output
 * const cleanup = electron.onTerminalData((tabId, data) => {
 *   console.log(`Terminal ${tabId} output:`, data);
 * });
 *
 * // Clean up listener on unmount
 * cleanup();
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * The electron API exposed to the renderer process.
 * Provides methods for window control, terminal management, voice input,
 * keyboard shortcuts, file operations, remote control, and tunnel services.
 *
 * @namespace window.electron
 */
contextBridge.exposeInMainWorld('electron', {
  // ═══════════════════════════════════════════════════════════════════════════
  // WINDOW CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Minimizes the application window.
   * @function minimize
   * @memberof window.electron
   * @returns {void}
   * @example
   * window.electron.minimize();
   */
  minimize: () => ipcRenderer.send('minimize'),

  /**
   * Toggles the window between maximized and restored states.
   * If the window is maximized, it will be restored to its previous size.
   * If restored, it will be maximized.
   * @function maximize
   * @memberof window.electron
   * @returns {void}
   * @example
   * window.electron.maximize();
   */
  maximize: () => ipcRenderer.send('maximize'),

  /**
   * Closes the application window and terminates all PTY sessions.
   * @function close
   * @memberof window.electron
   * @returns {void}
   * @example
   * window.electron.close();
   */
  close: () => ipcRenderer.send('close'),

  // ═══════════════════════════════════════════════════════════════════════════
  // TERMINAL TAB MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Creates a new terminal instance with the specified tab ID.
   * Spawns a new PTY (pseudo-terminal) process running the system shell.
   * On macOS, uses the user's default shell ($SHELL, typically zsh).
   * On Windows, uses PowerShell.
   *
   * @function createTerminal
   * @memberof window.electron
   * @param {string} tabId - Unique identifier for the terminal tab
   * @returns {Promise<{success: boolean, tabId: string}>} Creation result
   * @example
   * const result = await window.electron.createTerminal('terminal-1');
   * if (result.success) {
   *   console.log('Terminal created:', result.tabId);
   * }
   */
  createTerminal: (tabId) => ipcRenderer.invoke('create-terminal', tabId),

  /**
   * Closes and destroys a terminal instance.
   * Kills the associated PTY process and cleans up resources.
   *
   * @function closeTerminal
   * @memberof window.electron
   * @param {string} tabId - ID of the terminal tab to close
   * @returns {Promise<{success: boolean}>} Closure result
   * @example
   * await window.electron.closeTerminal('terminal-1');
   */
  closeTerminal: (tabId) => ipcRenderer.invoke('close-terminal', tabId),

  /**
   * Gets the current number of active terminal instances.
   *
   * @function getTerminalCount
   * @memberof window.electron
   * @returns {Promise<number>} Number of active terminals
   * @example
   * const count = await window.electron.getTerminalCount();
   * console.log(`${count} terminals active`);
   */
  getTerminalCount: () => ipcRenderer.invoke('get-terminal-count'),

  // ═══════════════════════════════════════════════════════════════════════════
  // TERMINAL I/O
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Writes raw data to the terminal's PTY process.
   * Use this for keyboard input and raw terminal sequences.
   *
   * @function writeToTerminal
   * @memberof window.electron
   * @param {string} tabId - Target terminal tab ID
   * @param {string} data - Raw data to write (may include escape sequences)
   * @returns {void}
   * @example
   * // Send a character
   * window.electron.writeToTerminal('tab-1', 'a');
   *
   * // Send Enter key
   * window.electron.writeToTerminal('tab-1', '\r');
   *
   * // Send Ctrl+C
   * window.electron.writeToTerminal('tab-1', '\x03');
   */
  writeToTerminal: (tabId, data) => ipcRenderer.send('terminal-write', { tabId, data }),

  /**
   * Resizes the terminal's PTY to match the xterm.js display dimensions.
   * Should be called when the terminal container size changes.
   *
   * @function resizeTerminal
   * @memberof window.electron
   * @param {string} tabId - Target terminal tab ID
   * @param {number} cols - Number of columns (characters per line)
   * @param {number} rows - Number of rows (lines visible)
   * @returns {void}
   * @example
   * window.electron.resizeTerminal('tab-1', 120, 40);
   */
  resizeTerminal: (tabId, cols, rows) => ipcRenderer.send('terminal-resize', { tabId, cols, rows }),

  /**
   * Sends text to the terminal and executes it as a command.
   * Appends a carriage return (\r) to execute the command.
   * Used for voice transcription and programmatic command execution.
   *
   * @function sendToTerminal
   * @memberof window.electron
   * @param {string} tabId - Target terminal tab ID
   * @param {string} text - Command text to execute
   * @returns {void}
   * @example
   * // Execute a command
   * window.electron.sendToTerminal('tab-1', 'ls -la');
   *
   * // Voice transcription sends text here
   * window.electron.sendToTerminal('tab-1', transcribedText);
   */
  sendToTerminal: (tabId, text) => ipcRenderer.send('send-to-terminal', { tabId, text }),

  /**
   * Inserts text at the current cursor position without executing.
   * Does NOT append a carriage return - the user must press Enter.
   * Useful for previewing or editing commands before execution.
   *
   * @function insertToTerminal
   * @memberof window.electron
   * @param {string} tabId - Target terminal tab ID
   * @param {string} text - Text to insert at cursor
   * @returns {void}
   * @example
   * // Insert text for user review
   * window.electron.insertToTerminal('tab-1', 'rm -rf ./node_modules');
   * // User can now edit or press Enter to execute
   */
  insertToTerminal: (tabId, text) => ipcRenderer.send('insert-to-terminal', { tabId, text }),

  /**
   * Gets the current context of a terminal for AI agent prompts.
   * Returns the current working directory and recent terminal output.
   *
   * @function getTerminalContext
   * @memberof window.electron
   * @param {string} tabId - Target terminal tab ID
   * @returns {Promise<{cwd: string, recentOutput: string}>} Terminal context
   * @example
   * const context = await window.electron.getTerminalContext('tab-1');
   * console.log('CWD:', context.cwd);
   * console.log('Recent output:', context.recentOutput);
   */
  getTerminalContext: (tabId) => ipcRenderer.invoke('get-terminal-context', tabId),

  /**
   * Subscribes to terminal output data events.
   * Called whenever the PTY produces output (command results, prompts, etc.).
   *
   * @function onTerminalData
   * @memberof window.electron
   * @param {Function} callback - Handler function receiving (tabId: string, data: string)
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onTerminalData((tabId, data) => {
   *   // Write data to xterm.js
   *   terminals[tabId].write(data);
   * });
   *
   * // On component unmount
   * cleanup();
   */
  onTerminalData: (callback) => {
    const handler = (_, { tabId, data }) => callback(tabId, data);
    ipcRenderer.on('terminal-data', handler);
    return () => ipcRenderer.removeListener('terminal-data', handler);
  },

  /**
   * Subscribes to terminal close events.
   * Called when a PTY process exits (user types 'exit', process killed, etc.).
   *
   * @function onTerminalClosed
   * @memberof window.electron
   * @param {Function} callback - Handler receiving (tabId: string, exitCode: number, signal: string|null)
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onTerminalClosed((tabId, exitCode, signal) => {
   *   console.log(`Terminal ${tabId} closed with code ${exitCode}`);
   *   if (signal) console.log(`Signal: ${signal}`);
   *   removeTab(tabId);
   * });
   */
  onTerminalClosed: (callback) => {
    const handler = (_, { tabId, exitCode, signal }) => callback(tabId, exitCode, signal);
    ipcRenderer.on('terminal-closed', handler);
    return () => ipcRenderer.removeListener('terminal-closed', handler);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE RECORDING EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribes to the voice recording toggle event.
   * Triggered by the global keyboard shortcut (default: Alt+S).
   *
   * @function onToggleRecording
   * @memberof window.electron
   * @param {Function} callback - Handler called when toggle is triggered
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onToggleRecording(() => {
   *   if (isRecording) {
   *     stopRecording();
   *   } else {
   *     startRecording();
   *   }
   * });
   */
  onToggleRecording: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-recording', handler);
    return () => ipcRenderer.removeListener('toggle-recording', handler);
  },

  /**
   * Subscribes to the cancel recording event.
   * Triggered by keyboard shortcut to abort recording without transcribing.
   *
   * @function onCancelRecording
   * @memberof window.electron
   * @param {Function} callback - Handler called when cancel is triggered
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onCancelRecording(() => {
   *   discardRecording();
   *   showMessage('Recording cancelled');
   * });
   */
  onCancelRecording: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('cancel-recording', handler);
    return () => ipcRenderer.removeListener('cancel-recording', handler);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MODE & NAVIGATION EVENTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribes to the mode toggle event.
   * Toggles between 'raw' mode (direct transcription) and 'agent' mode
   * (AI-enhanced command generation).
   *
   * @function onToggleMode
   * @memberof window.electron
   * @param {Function} callback - Handler called when mode toggle is triggered
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onToggleMode(() => {
   *   setMode(mode === 'raw' ? 'agent' : 'raw');
   * });
   */
  onToggleMode: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-mode', handler);
    return () => ipcRenderer.removeListener('toggle-mode', handler);
  },

  /**
   * Subscribes to the clear terminal event.
   * Triggered by keyboard shortcut to clear the active terminal.
   *
   * @function onClearTerminal
   * @memberof window.electron
   * @param {Function} callback - Handler called when clear is triggered
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onClearTerminal(() => {
   *   terminal.clear();
   *   // Also send clear command to shell
   *   window.electron.sendToTerminal(activeTabId, process.platform === 'win32' ? 'cls' : 'clear');
   * });
   */
  onClearTerminal: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('clear-terminal', handler);
    return () => ipcRenderer.removeListener('clear-terminal', handler);
  },

  /**
   * Subscribes to the cycle layout event.
   * Cycles through terminal layout modes (single, split-horizontal, split-vertical, quad).
   *
   * @function onCycleLayout
   * @memberof window.electron
   * @param {Function} callback - Handler called when layout cycle is triggered
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onCycleLayout(() => {
   *   const layouts = ['single', 'split-h', 'split-v', 'quad'];
   *   const nextIndex = (layouts.indexOf(currentLayout) + 1) % layouts.length;
   *   setLayout(layouts[nextIndex]);
   * });
   */
  onCycleLayout: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('cycle-layout', handler);
    return () => ipcRenderer.removeListener('cycle-layout', handler);
  },

  /**
   * Subscribes to the focus next terminal event.
   * Moves focus to the next terminal tab in order.
   *
   * @function onFocusNextTerminal
   * @memberof window.electron
   * @param {Function} callback - Handler called when next focus is triggered
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onFocusNextTerminal(() => {
   *   const nextIndex = (activeTabIndex + 1) % tabs.length;
   *   setActiveTab(tabs[nextIndex].id);
   * });
   */
  onFocusNextTerminal: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('focus-next-terminal', handler);
    return () => ipcRenderer.removeListener('focus-next-terminal', handler);
  },

  /**
   * Subscribes to the focus previous terminal event.
   * Moves focus to the previous terminal tab in order.
   *
   * @function onFocusPrevTerminal
   * @memberof window.electron
   * @param {Function} callback - Handler called when previous focus is triggered
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onFocusPrevTerminal(() => {
   *   const prevIndex = (activeTabIndex - 1 + tabs.length) % tabs.length;
   *   setActiveTab(tabs[prevIndex].id);
   * });
   */
  onFocusPrevTerminal: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('focus-prev-terminal', handler);
    return () => ipcRenderer.removeListener('focus-prev-terminal', handler);
  },

  /**
   * Subscribes to the bookmark directory event.
   * Triggered to bookmark the current terminal's working directory.
   *
   * @function onBookmarkDirectory
   * @memberof window.electron
   * @param {Function} callback - Handler called when bookmark is triggered
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onBookmarkDirectory(async () => {
   *   const context = await window.electron.getTerminalContext(activeTabId);
   *   await window.electron.addFavoriteDirectory(context.cwd);
   * });
   */
  onBookmarkDirectory: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('bookmark-directory', handler);
    return () => ipcRenderer.removeListener('bookmark-directory', handler);
  },

  /**
   * Subscribes to the resend last transcription event.
   * Allows re-executing the most recent voice transcription.
   *
   * @function onResendLast
   * @memberof window.electron
   * @param {Function} callback - Handler called when resend is triggered
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onResendLast(() => {
   *   if (lastTranscription) {
   *     window.electron.sendToTerminal(activeTabId, lastTranscription);
   *   }
   * });
   */
  onResendLast: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('resend-last', handler);
    return () => ipcRenderer.removeListener('resend-last', handler);
  },

  /**
   * Subscribes to the switch tab event.
   * Triggered by keyboard shortcuts (e.g., Alt+1, Alt+2, Alt+3, Alt+4).
   *
   * @function onSwitchTab
   * @memberof window.electron
   * @param {Function} callback - Handler receiving (index: number) where index is 0-3
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onSwitchTab((index) => {
   *   if (tabs[index]) {
   *     setActiveTab(tabs[index].id);
   *   }
   * });
   */
  onSwitchTab: (callback) => {
    const handler = (_, index) => callback(index);
    ipcRenderer.on('switch-tab', handler);
    return () => ipcRenderer.removeListener('switch-tab', handler);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KEYBOARD SHORTCUTS MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets the current keyboard shortcut configuration.
   *
   * @function getShortcuts
   * @memberof window.electron
   * @returns {Promise<Object>} Shortcut configuration object
   * @example
   * const shortcuts = await window.electron.getShortcuts();
   * // Returns: { toggleRecording: 'Alt+S', toggleWindow: 'Alt+H', ... }
   */
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),

  /**
   * Updates the keyboard shortcut configuration.
   * Changes are persisted and take effect immediately.
   *
   * @function setShortcuts
   * @memberof window.electron
   * @param {Object} shortcuts - New shortcut configuration
   * @returns {Promise<{success: boolean}>} Update result
   * @example
   * await window.electron.setShortcuts({
   *   toggleRecording: 'Alt+R',
   *   toggleWindow: 'Alt+W'
   * });
   */
  setShortcuts: (shortcuts) => ipcRenderer.invoke('set-shortcuts', shortcuts),

  /**
   * Validates a keyboard shortcut string format.
   * Checks if the shortcut is syntactically valid and not conflicting.
   *
   * @function validateShortcut
   * @memberof window.electron
   * @param {string} shortcut - Shortcut string to validate (e.g., 'Ctrl+Shift+A')
   * @returns {Promise<{valid: boolean, error?: string}>} Validation result
   * @example
   * const result = await window.electron.validateShortcut('Ctrl+Shift+A');
   * if (!result.valid) {
   *   console.error('Invalid shortcut:', result.error);
   * }
   */
  validateShortcut: (shortcut) => ipcRenderer.invoke('validate-shortcut', shortcut),

  // ═══════════════════════════════════════════════════════════════════════════
  // API KEY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Retrieves the API key for a specified provider.
   * Keys are stored securely using electron-store.
   *
   * @function getApiKey
   * @memberof window.electron
   * @param {string} [provider='gemini'] - Provider name: 'gemini', 'openai', 'anthropic', 'elevenlabs'
   * @returns {Promise<string|null>} The API key or null if not set
   * @example
   * const geminiKey = await window.electron.getApiKey('gemini');
   * const openaiKey = await window.electron.getApiKey('openai');
   */
  getApiKey: (provider = 'gemini') => ipcRenderer.invoke('get-api-key', provider),

  /**
   * Stores an API key for a specified provider.
   * Keys are stored securely using electron-store.
   *
   * @function setApiKey
   * @memberof window.electron
   * @param {string} key - The API key to store
   * @param {string} [provider='gemini'] - Provider name: 'gemini', 'openai', 'anthropic', 'elevenlabs'
   * @returns {Promise<{success: boolean}>} Storage result
   * @example
   * await window.electron.setApiKey('sk-...', 'openai');
   * await window.electron.setApiKey('AIza...', 'gemini');
   */
  setApiKey: (key, provider = 'gemini') => ipcRenderer.invoke('set-api-key', key, provider),

  // ═══════════════════════════════════════════════════════════════════════════
  // AI TRANSCRIPTION (moved from renderer to main process)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Transcribes audio using Google Gemini API in the main process.
   * This eliminates the need for dangerouslyAllowBrowser flag.
   *
   * @function transcribeWithGemini
   * @memberof window.electron
   * @param {Object} data - Transcription data
   * @param {string} data.audioBase64 - Base64-encoded audio data
   * @param {string} data.prompt - The prompt for transcription/agent mode
   * @param {string} data.modelId - Model ID (e.g., 'gemini-2.0-flash')
   * @returns {Promise<{success: boolean, text?: string, error?: string}>} Transcription result
   * @example
   * const result = await window.electron.transcribeWithGemini({
   *   audioBase64: base64Audio,
   *   prompt: 'Transcribe this audio...',
   *   modelId: 'gemini-2.0-flash'
   * });
   */
  transcribeWithGemini: (data) => ipcRenderer.invoke('transcribe-with-gemini', data),

  /**
   * Transcribes audio using OpenAI Whisper API in the main process.
   * Optionally uses GPT-4 for agent mode command generation.
   *
   * @function transcribeWithOpenAI
   * @memberof window.electron
   * @param {Object} data - Transcription data
   * @param {string} data.audioBase64 - Base64-encoded audio data
   * @param {string} data.prompt - The prompt for agent mode (if using GPT-4)
   * @param {string} data.modelId - Model ID (e.g., 'openai-whisper', 'openai-gpt4')
   * @returns {Promise<{success: boolean, text?: string, error?: string}>} Transcription result
   * @example
   * const result = await window.electron.transcribeWithOpenAI({
   *   audioBase64: base64Audio,
   *   prompt: 'Convert to CLI command...',
   *   modelId: 'openai-gpt4'
   * });
   */
  transcribeWithOpenAI: (data) => ipcRenderer.invoke('transcribe-with-openai', data),

  /**
   * Transcribes audio using Whisper + Claude in the main process.
   * First transcribes with Whisper, then processes with Claude for agent mode.
   *
   * @function transcribeWithAnthropic
   * @memberof window.electron
   * @param {Object} data - Transcription data
   * @param {string} data.audioBase64 - Base64-encoded audio data
   * @param {string} data.prompt - The prompt for agent mode
   * @param {string} data.modelId - Model ID (e.g., 'claude-sonnet', 'claude-haiku')
   * @returns {Promise<{success: boolean, text?: string, error?: string}>} Transcription result
   * @example
   * const result = await window.electron.transcribeWithAnthropic({
   *   audioBase64: base64Audio,
   *   prompt: 'Convert to CLI command...',
   *   modelId: 'claude-sonnet'
   * });
   */
  transcribeWithAnthropic: (data) => ipcRenderer.invoke('transcribe-with-anthropic', data),

  /**
   * Transcribes audio using ElevenLabs Scribe API in the main process.
   *
   * @function transcribeWithElevenLabs
   * @memberof window.electron
   * @param {Object} data - Transcription data
   * @param {string} data.audioBase64 - Base64-encoded audio data
   * @returns {Promise<{success: boolean, text?: string, error?: string}>} Transcription result
   * @example
   * const result = await window.electron.transcribeWithElevenLabs({
   *   audioBase64: base64Audio
   * });
   */
  transcribeWithElevenLabs: (data) => ipcRenderer.invoke('transcribe-with-elevenlabs', data),

  // ═══════════════════════════════════════════════════════════════════════════
  // DIRECTORY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets the list of recent and favorite directories.
   *
   * @function getDirectories
   * @memberof window.electron
   * @returns {Promise<{recent: string[], favorites: string[]}>} Directory lists
   * @example
   * const dirs = await window.electron.getDirectories();
   * console.log('Recent:', dirs.recent);
   * console.log('Favorites:', dirs.favorites);
   */
  getDirectories: () => ipcRenderer.invoke('get-directories'),

  /**
   * Adds a directory to the favorites list.
   *
   * @function addFavoriteDirectory
   * @memberof window.electron
   * @param {string} dir - Absolute path to the directory
   * @returns {Promise<{success: boolean}>} Add result
   * @example
   * await window.electron.addFavoriteDirectory('/Users/joe/projects/audiobash');
   */
  addFavoriteDirectory: (dir) => ipcRenderer.invoke('add-favorite-directory', dir),

  /**
   * Removes a directory from the favorites list.
   *
   * @function removeFavoriteDirectory
   * @memberof window.electron
   * @param {string} dir - Absolute path to the directory
   * @returns {Promise<{success: boolean}>} Remove result
   * @example
   * await window.electron.removeFavoriteDirectory('/Users/joe/old-project');
   */
  removeFavoriteDirectory: (dir) => ipcRenderer.invoke('remove-favorite-directory', dir),

  /**
   * Changes the working directory of a terminal.
   * Executes a 'cd' command in the specified terminal.
   *
   * @function cdToDirectory
   * @memberof window.electron
   * @param {string} tabId - Target terminal tab ID
   * @param {string} dir - Absolute path to change to
   * @returns {Promise<{success: boolean}>} CD result
   * @example
   * await window.electron.cdToDirectory('tab-1', '/Users/joe/projects');
   */
  cdToDirectory: (tabId, dir) => ipcRenderer.invoke('cd-to-directory', { tabId, dir }),

  /**
   * Opens a native directory picker dialog.
   *
   * @function browseDirectory
   * @memberof window.electron
   * @returns {Promise<string|null>} Selected directory path or null if cancelled
   * @example
   * const dir = await window.electron.browseDirectory();
   * if (dir) {
   *   await window.electron.cdToDirectory(activeTabId, dir);
   * }
   */
  browseDirectory: () => ipcRenderer.invoke('browse-directory'),

  // ═══════════════════════════════════════════════════════════════════════════
  // PREVIEW PANE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Captures a preview screenshot of a URL or local file.
   * Used for the preview pane to show web pages and rendered content.
   *
   * @function capturePreview
   * @memberof window.electron
   * @param {string} url - URL or file path to capture
   * @param {string} cwd - Current working directory for resolving relative paths
   * @returns {Promise<{success: boolean, data?: string, error?: string}>} Capture result with base64 image data
   * @example
   * const result = await window.electron.capturePreview('http://localhost:3000', '/home/user');
   * if (result.success) {
   *   previewImage.src = `data:image/png;base64,${result.data}`;
   * }
   */
  capturePreview: (url, cwd) => ipcRenderer.invoke('capture-preview', url, cwd),

  /**
   * Starts watching a file for changes.
   * Returns a watcher ID that can be used to stop watching.
   *
   * @function watchFile
   * @memberof window.electron
   * @param {string} filepath - Absolute path to the file to watch
   * @returns {Promise<{success: boolean, watcherId?: string, error?: string}>} Watch result
   * @example
   * const result = await window.electron.watchFile('/home/user/index.html');
   * if (result.success) {
   *   console.log('Watching with ID:', result.watcherId);
   * }
   */
  watchFile: (filepath) => ipcRenderer.invoke('watch-file', filepath),

  /**
   * Stops watching a file for changes.
   *
   * @function unwatchFile
   * @memberof window.electron
   * @param {string} watcherId - The watcher ID returned from watchFile
   * @returns {Promise<{success: boolean}>} Unwatch result
   * @example
   * await window.electron.unwatchFile('watcher-123');
   */
  unwatchFile: (watcherId) => ipcRenderer.invoke('unwatch-file', watcherId),

  /**
   * Validates that a file path exists and is accessible.
   *
   * @function validateFilePath
   * @memberof window.electron
   * @param {string} filepath - Path to validate
   * @returns {Promise<{valid: boolean, error?: string}>} Validation result
   * @example
   * const result = await window.electron.validateFilePath('/home/user/file.txt');
   * if (!result.valid) {
   *   console.error('File not accessible:', result.error);
   * }
   */
  validateFilePath: (filepath) => ipcRenderer.invoke('validate-file-path', filepath),

  /**
   * Subscribes to file change events for watched files.
   *
   * @function onFileChanged
   * @memberof window.electron
   * @param {Function} callback - Handler receiving (filepath: string)
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onFileChanged((filepath) => {
   *   console.log('File changed:', filepath);
   *   refreshPreview();
   * });
   */
  onFileChanged: (callback) => {
    const handler = (_, { watcherId, filepath }) => callback(filepath);
    ipcRenderer.on('file-changed', handler);
    return () => ipcRenderer.removeListener('file-changed', handler);
  },

  /**
   * Subscribes to the toggle preview pane event.
   * Triggered by keyboard shortcut to show/hide the preview panel.
   *
   * @function onTogglePreview
   * @memberof window.electron
   * @param {Function} callback - Handler called when toggle is triggered
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onTogglePreview(() => {
   *   setPreviewVisible(!previewVisible);
   * });
   */
  onTogglePreview: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('toggle-preview', handler);
    return () => ipcRenderer.removeListener('toggle-preview', handler);
  },

  /**
   * Subscribes to the capture screenshot event.
   * Triggered by keyboard shortcut to capture the preview content.
   *
   * @function onCaptureScreenshot
   * @memberof window.electron
   * @param {Function} callback - Handler called when capture is triggered
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onCaptureScreenshot(() => {
   *   captureAndSaveScreenshot();
   * });
   */
  onCaptureScreenshot: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('capture-screenshot', handler);
    return () => ipcRenderer.removeListener('capture-screenshot', handler);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WHISPER LOCAL TRANSCRIPTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Transcribes audio using local Whisper model.
   * Requires whisper.cpp to be installed and configured.
   *
   * @function whisperTranscribe
   * @memberof window.electron
   * @param {string} audioPath - Path to the audio file to transcribe
   * @returns {Promise<{success: boolean, text?: string, error?: string}>} Transcription result
   * @example
   * const result = await window.electron.whisperTranscribe('/tmp/audio.wav');
   * if (result.success) {
   *   console.log('Transcribed:', result.text);
   * }
   */
  whisperTranscribe: (audioPath) => ipcRenderer.invoke('whisper-transcribe', audioPath),

  /**
   * Sets the Whisper model to use for transcription.
   *
   * @function whisperSetModel
   * @memberof window.electron
   * @param {string} modelName - Model name (e.g., 'tiny', 'base', 'small', 'medium', 'large')
   * @returns {Promise<{success: boolean}>} Set result
   * @example
   * await window.electron.whisperSetModel('base');
   */
  whisperSetModel: (modelName) => ipcRenderer.invoke('whisper-set-model', modelName),

  /**
   * Gets the list of available Whisper models.
   *
   * @function whisperGetModels
   * @memberof window.electron
   * @returns {Promise<string[]>} List of available model names
   * @example
   * const models = await window.electron.whisperGetModels();
   * // Returns: ['tiny', 'base', 'small', 'medium', 'large']
   */
  whisperGetModels: () => ipcRenderer.invoke('whisper-get-models'),

  /**
   * Saves base64-encoded audio data to a temporary file.
   * Used to prepare audio for Whisper transcription.
   *
   * @function saveTempAudio
   * @memberof window.electron
   * @param {string} base64Audio - Base64-encoded audio data
   * @returns {Promise<{success: boolean, path?: string, error?: string}>} Save result with temp file path
   * @example
   * const result = await window.electron.saveTempAudio(base64AudioData);
   * if (result.success) {
   *   const transcription = await window.electron.whisperTranscribe(result.path);
   * }
   */
  saveTempAudio: (base64Audio) => ipcRenderer.invoke('save-temp-audio', base64Audio),

  // ═══════════════════════════════════════════════════════════════════════════
  // REMOTE CONTROL (MOBILE COMPANION)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets the current remote control status.
   * Includes WebSocket server state and connected clients.
   *
   * @function getRemoteStatus
   * @memberof window.electron
   * @returns {Promise<{running: boolean, port: number, clients: number, pairingCode: string}>} Remote status
   * @example
   * const status = await window.electron.getRemoteStatus();
   * console.log(`Server running on port ${status.port}`);
   * console.log(`Pairing code: ${status.pairingCode}`);
   * console.log(`${status.clients} clients connected`);
   */
  getRemoteStatus: () => ipcRenderer.invoke('get-remote-status'),

  /**
   * Generates a new pairing code for remote connections.
   * Invalidates the previous pairing code.
   *
   * @function regeneratePairingCode
   * @memberof window.electron
   * @returns {Promise<{success: boolean, pairingCode: string}>} New pairing code
   * @example
   * const result = await window.electron.regeneratePairingCode();
   * displayQRCode(result.pairingCode);
   */
  regeneratePairingCode: () => ipcRenderer.invoke('regenerate-pairing-code'),

  /**
   * Sets a password for remote connections.
   *
   * @function setRemotePassword
   * @memberof window.electron
   * @param {string} password - Password for remote authentication
   * @returns {Promise<{success: boolean}>} Set result
   * @example
   * await window.electron.setRemotePassword('securePassword123');
   */
  setRemotePassword: (password) => ipcRenderer.invoke('set-remote-password', password),

  /**
   * Gets the current remote connection password.
   *
   * @function getRemotePassword
   * @memberof window.electron
   * @returns {Promise<string>} The current password
   * @example
   * const password = await window.electron.getRemotePassword();
   */
  getRemotePassword: () => ipcRenderer.invoke('get-remote-password'),

  /**
   * Sets whether to prevent the system from sleeping.
   * Useful when waiting for remote voice commands.
   *
   * @function setKeepAwake
   * @memberof window.electron
   * @param {boolean} enabled - Whether to keep the system awake
   * @returns {Promise<{success: boolean}>} Set result
   * @example
   * await window.electron.setKeepAwake(true); // Prevent sleep
   */
  setKeepAwake: (enabled) => ipcRenderer.invoke('set-keep-awake', enabled),

  /**
   * Gets the current keep-awake setting.
   *
   * @function getKeepAwake
   * @memberof window.electron
   * @returns {Promise<boolean>} Whether keep-awake is enabled
   * @example
   * const keepAwake = await window.electron.getKeepAwake();
   */
  getKeepAwake: () => ipcRenderer.invoke('get-keep-awake'),

  /**
   * Subscribes to remote status change events.
   * Called when clients connect/disconnect or server state changes.
   *
   * @function onRemoteStatusChanged
   * @memberof window.electron
   * @param {Function} callback - Handler receiving (status: {running, port, clients, pairingCode})
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onRemoteStatusChanged((status) => {
   *   console.log(`Clients connected: ${status.clients}`);
   *   updateStatusIndicator(status);
   * });
   */
  onRemoteStatusChanged: (callback) => {
    const handler = (_, status) => callback(status);
    ipcRenderer.on('remote-status-changed', handler);
    return () => ipcRenderer.removeListener('remote-status-changed', handler);
  },

  /**
   * Subscribes to remote transcription requests.
   * Called when a mobile client sends audio for transcription.
   *
   * @function onRemoteTranscriptionRequest
   * @memberof window.electron
   * @param {Function} callback - Handler receiving (request: {clientId, audio, mode})
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onRemoteTranscriptionRequest(async (request) => {
   *   const text = await transcribe(request.audio);
   *   window.electron.sendRemoteTranscriptionResult({
   *     clientId: request.clientId,
   *     text
   *   });
   * });
   */
  onRemoteTranscriptionRequest: (callback) => {
    const handler = (_, request) => callback(request);
    ipcRenderer.on('remote-transcription-request', handler);
    return () => ipcRenderer.removeListener('remote-transcription-request', handler);
  },

  /**
   * Sends the transcription result back to a remote client.
   *
   * @function sendRemoteTranscriptionResult
   * @memberof window.electron
   * @param {Object} result - Result object
   * @param {string} result.clientId - The requesting client's ID
   * @param {string} result.text - The transcribed text
   * @param {string} [result.error] - Error message if transcription failed
   * @returns {void}
   * @example
   * window.electron.sendRemoteTranscriptionResult({
   *   clientId: 'client-123',
   *   text: 'ls -la'
   * });
   */
  sendRemoteTranscriptionResult: (result) => {
    ipcRenderer.send('remote-transcription-result', result);
  },

  /**
   * Subscribes to remote tab switch requests.
   * Called when a mobile client requests switching to a specific tab.
   *
   * @function onRemoteSwitchTab
   * @memberof window.electron
   * @param {Function} callback - Handler receiving (tabId: string)
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onRemoteSwitchTab((tabId) => {
   *   setActiveTab(tabId);
   * });
   */
  onRemoteSwitchTab: (callback) => {
    const handler = (_, tabId) => callback(tabId);
    ipcRenderer.on('remote-switch-tab', handler);
    return () => ipcRenderer.removeListener('remote-switch-tab', handler);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TUNNEL SERVICE (TUNNELTO)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Starts the tunnel service for remote access.
   * Creates a public URL that tunnels to the local WebSocket server.
   * Uses tunnelto (https://tunnelto.dev) for the tunnel.
   *
   * @function tunnelStart
   * @memberof window.electron
   * @param {number} port - Local port to tunnel
   * @returns {Promise<{success: boolean, url?: string, error?: string}>} Start result with public URL
   * @example
   * const result = await window.electron.tunnelStart(8765);
   * if (result.success) {
   *   console.log('Tunnel URL:', result.url);
   *   // Share this URL with mobile companion
   * }
   */
  tunnelStart: (port) => ipcRenderer.invoke('tunnel-start', port),

  /**
   * Stops the tunnel service.
   *
   * @function tunnelStop
   * @memberof window.electron
   * @returns {Promise<{success: boolean}>} Stop result
   * @example
   * await window.electron.tunnelStop();
   */
  tunnelStop: () => ipcRenderer.invoke('tunnel-stop'),

  /**
   * Gets the current tunnel status.
   *
   * @function tunnelGetStatus
   * @memberof window.electron
   * @returns {Promise<{running: boolean, url?: string}>} Tunnel status
   * @example
   * const status = await window.electron.tunnelGetStatus();
   * if (status.running) {
   *   console.log('Tunnel active at:', status.url);
   * }
   */
  tunnelGetStatus: () => ipcRenderer.invoke('tunnel-status'),

  /**
   * Checks if the tunnel binary (tunnelto) is installed.
   *
   * @function tunnelCheckBinary
   * @memberof window.electron
   * @returns {Promise<{installed: boolean, path?: string}>} Binary check result
   * @example
   * const check = await window.electron.tunnelCheckBinary();
   * if (!check.installed) {
   *   showInstallInstructions();
   * }
   */
  tunnelCheckBinary: () => ipcRenderer.invoke('tunnel-check-binary'),

  /**
   * Sets whether the tunnel should auto-start with the remote server.
   *
   * @function setTunnelEnabled
   * @memberof window.electron
   * @param {boolean} enabled - Whether tunnel auto-start is enabled
   * @returns {Promise<{success: boolean}>} Set result
   * @example
   * await window.electron.setTunnelEnabled(true);
   */
  setTunnelEnabled: (enabled) => ipcRenderer.invoke('set-tunnel-enabled', enabled),

  /**
   * Gets the tunnel auto-start setting.
   *
   * @function getTunnelEnabled
   * @memberof window.electron
   * @returns {Promise<boolean>} Whether tunnel auto-start is enabled
   * @example
   * const enabled = await window.electron.getTunnelEnabled();
   */
  getTunnelEnabled: () => ipcRenderer.invoke('get-tunnel-enabled'),

  /**
   * Subscribes to tunnel status change events.
   * Called when the tunnel connects, disconnects, or errors.
   *
   * @function onTunnelStatusChanged
   * @memberof window.electron
   * @param {Function} callback - Handler receiving (status: {running, url, error?})
   * @returns {Function} Cleanup function to remove the listener
   * @example
   * const cleanup = window.electron.onTunnelStatusChanged((status) => {
   *   if (status.error) {
   *     showError('Tunnel failed:', status.error);
   *   } else if (status.running) {
   *     showSuccess('Tunnel connected:', status.url);
   *   }
   * });
   */
  onTunnelStatusChanged: (callback) => {
    const handler = (_, status) => callback(status);
    ipcRenderer.on('tunnel-status-changed', handler);
    return () => ipcRenderer.removeListener('tunnel-status-changed', handler);
  },
});
