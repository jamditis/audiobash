const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, safeStorage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// Centralized logger - must initialize after app ready
const { logger, appLog, ipcLog, ptyLog, storeLog } = require('./logger.cjs');

// Global error handlers to prevent silent crashes (fixes #29)
process.on('uncaughtException', (err) => {
  console.error('[AudioBash] Uncaught exception:', err);
  try { appLog.error('Uncaught exception', err); } catch (_) { /* logger may not be initialized */ }
});

process.on('unhandledRejection', (reason) => {
  console.error('[AudioBash] Unhandled rejection:', reason);
  try { appLog.error('Unhandled rejection', { reason: String(reason) }); } catch (_) { /* logger may not be initialized */ }
});

// node-pty will be loaded dynamically after app ready
let pty = null;

// Remote control server
const { RemoteControlServer } = require('./websocket-server.cjs');
let remoteServer = null;

// Whisper service for local transcription
const whisperService = require('./whisperService.cjs');

// AI SDK imports for transcription (moved from renderer to eliminate dangerouslyAllowBrowser)
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai').default;
const Anthropic = require('@anthropic-ai/sdk').default;

// AI client instances (initialized lazily when keys are set)
let geminiClient = null;
let openaiClient = null;
let anthropicClient = null;

// Simple persistent storage (replacement for electron-store)
const storeFilePath = path.join(app.getPath('userData'), 'app-store.json');
const store = {
  data: {},
  load() {
    try {
      if (fs.existsSync(storeFilePath)) {
        this.data = JSON.parse(fs.readFileSync(storeFilePath, 'utf8'));
        storeLog.debug('Store loaded successfully', { keys: Object.keys(this.data).length });
      }
    } catch (err) {
      storeLog.error('Failed to load store', err, { path: storeFilePath });
    }
  },
  save() {
    try {
      fs.writeFileSync(storeFilePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      storeLog.error('Failed to save store', err, { path: storeFilePath });
    }
  },
  get(key, defaultValue) {
    return this.data[key] !== undefined ? this.data[key] : defaultValue;
  },
  set(key, value) {
    this.data[key] = value;
    this.save();
  }
};
store.load();
const ptyProcesses = new Map(); // Map of tabId -> ptyProcess
const terminalOutputBuffers = new Map(); // Map of tabId -> recent output (last ~2000 chars)
const terminalCwds = new Map(); // Map of tabId -> current working directory
let mainWindow = null;
let tray = null;
const MAX_OUTPUT_BUFFER = 2000; // Keep last 2000 characters of output
const MAX_RECENT_DIRS = 10; // Keep last 10 recent directories

// Recent and favorite directories
let recentDirectories = [];
let favoriteDirectories = [];
let currentShortcuts = {
  toggleRecording: 'Alt+S',
  cancelRecording: 'Alt+A',
  toggleWindow: 'Alt+H',
  toggleMode: 'Alt+M',
  clearTerminal: 'Alt+C',
  cycleLayout: 'Alt+L',
  focusNextTerminal: 'Alt+Right',
  focusPrevTerminal: 'Alt+Left',
  bookmarkDirectory: 'Alt+B',
  resendLast: 'Alt+R',
  switchTab1: 'Alt+1',
  switchTab2: 'Alt+2',
  switchTab3: 'Alt+3',
  switchTab4: 'Alt+4',
  togglePreview: 'Alt+P',
  captureScreenshot: 'Alt+Shift+P',
};

// File watchers for preview auto-refresh
const fileWatchers = new Map(); // watcherId -> { filepath, watcher, debounceTimer }
let watcherIdCounter = 0;

const MAX_TABS = 4;
const isDev = !app.isPackaged;

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false, // Frameless for custom title bar
    backgroundColor: '#050505',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../audiobash-logo.ico'),
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:9527');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Hide instead of close (tray mode)
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // Use ICO for Windows tray (better rendering), PNG for other platforms
  let iconPath;
  if (app.isPackaged) {
    // In production, icons are in resources folder
    const resourcesPath = process.resourcesPath;
    iconPath = process.platform === 'win32'
      ? path.join(resourcesPath, 'audiobash-logo.ico')
      : path.join(resourcesPath, 'audiobash-logo.png');
  } else {
    // In development, icons are in project root
    iconPath = process.platform === 'win32'
      ? path.join(__dirname, '../audiobash-logo.ico')
      : path.join(__dirname, '../audiobash-logo.png');
  }

  console.log('[AudioBash] Tray icon path:', iconPath);
  console.log('[AudioBash] Icon exists:', fs.existsSync(iconPath));

  let icon = nativeImage.createFromPath(iconPath);
  console.log('[AudioBash] Icon isEmpty:', icon.isEmpty());

  // If icon failed to load, try fallback paths
  if (icon.isEmpty()) {
    const fallbackPaths = [
      path.join(process.resourcesPath || '', 'audiobash-logo.ico'),
      path.join(process.resourcesPath || '', 'audiobash-logo.png'),
      path.join(__dirname, '../audiobash-logo.ico'),
      path.join(__dirname, '../audiobash-logo.png'),
      path.join(app.getAppPath(), 'audiobash-logo.ico'),
      path.join(app.getAppPath(), 'audiobash-logo.png'),
    ];

    for (const fallback of fallbackPaths) {
      if (fs.existsSync(fallback)) {
        console.log('[AudioBash] Trying fallback:', fallback);
        icon = nativeImage.createFromPath(fallback);
        if (!icon.isEmpty()) {
          console.log('[AudioBash] Fallback worked:', fallback);
          break;
        }
      }
    }
  }

  // Resize for tray (16x16 is standard for Windows tray)
  if (!icon.isEmpty()) {
    icon = icon.resize({ width: 16, height: 16 });
  } else {
    // Cannot create tray with empty icon on macOS (causes crash).
    // Skip tray creation entirely — the app still works without it.
    console.error('[AudioBash] Cannot create tray: all icon paths failed. Running without tray.');
    return;
  }
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show AudioBash',
      click: () => mainWindow?.show(),
    },
    {
      label: `Toggle Recording (${currentShortcuts.toggleRecording})`,
      click: () => mainWindow?.webContents.send('toggle-recording'),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('AudioBash');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

function loadShortcuts() {
  try {
    const shortcutsPath = path.join(app.getPath('userData'), 'shortcuts.json');
    if (fs.existsSync(shortcutsPath)) {
      const saved = JSON.parse(fs.readFileSync(shortcutsPath, 'utf8'));
      currentShortcuts = { ...currentShortcuts, ...saved };
    }
  } catch (err) {
    console.error('[AudioBash] Failed to load shortcuts:', err);
  }
}

function loadDirectories() {
  try {
    const dirsPath = path.join(app.getPath('userData'), 'directories.json');
    if (fs.existsSync(dirsPath)) {
      const saved = JSON.parse(fs.readFileSync(dirsPath, 'utf8'));
      recentDirectories = saved.recent || [];
      favoriteDirectories = saved.favorites || [];
    }
  } catch (err) {
    console.error('[AudioBash] Failed to load directories:', err);
  }
}

function saveDirectories() {
  try {
    const dirsPath = path.join(app.getPath('userData'), 'directories.json');
    fs.writeFileSync(dirsPath, JSON.stringify({
      recent: recentDirectories,
      favorites: favoriteDirectories,
    }), 'utf8');
  } catch (err) {
    console.error('[AudioBash] Failed to save directories:', err);
  }
}

function addRecentDirectory(dir) {
  if (!dir || !fs.existsSync(dir)) return;

  // Remove if already exists
  recentDirectories = recentDirectories.filter(d => d !== dir);
  // Add to front
  recentDirectories.unshift(dir);
  // Trim to max
  if (recentDirectories.length > MAX_RECENT_DIRS) {
    recentDirectories = recentDirectories.slice(0, MAX_RECENT_DIRS);
  }
  saveDirectories();
}

function saveShortcuts() {
  try {
    const shortcutsPath = path.join(app.getPath('userData'), 'shortcuts.json');
    fs.writeFileSync(shortcutsPath, JSON.stringify(currentShortcuts), 'utf8');
  } catch (err) {
    console.error('[AudioBash] Failed to save shortcuts:', err);
  }
}

function registerShortcuts() {
  // Unregister all first
  globalShortcut.unregisterAll();
  console.log('[AudioBash] Registering shortcuts:', currentShortcuts);

  // Toggle recording
  if (currentShortcuts.toggleRecording) {
    try {
      const success = globalShortcut.register(currentShortcuts.toggleRecording, () => {
        console.log('[AudioBash] Toggle recording triggered');
        mainWindow?.webContents.send('toggle-recording');
      });
      if (success) {
        console.log(`[AudioBash] Registered toggleRecording: ${currentShortcuts.toggleRecording}`);
      } else {
        console.error(`[AudioBash] Failed to register toggleRecording: ${currentShortcuts.toggleRecording} (already in use)`);
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to register ${currentShortcuts.toggleRecording}:`, err);
    }
  }

  // Cancel recording (abort without sending)
  if (currentShortcuts.cancelRecording) {
    try {
      const success = globalShortcut.register(currentShortcuts.cancelRecording, () => {
        console.log('[AudioBash] Cancel recording triggered');
        mainWindow?.webContents.send('cancel-recording');
      });
      if (success) {
        console.log(`[AudioBash] Registered cancelRecording: ${currentShortcuts.cancelRecording}`);
      } else {
        console.error(`[AudioBash] Failed to register cancelRecording: ${currentShortcuts.cancelRecording} (already in use)`);
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to register ${currentShortcuts.cancelRecording}:`, err);
    }
  }

  // Toggle window visibility
  if (currentShortcuts.toggleWindow) {
    try {
      const success = globalShortcut.register(currentShortcuts.toggleWindow, () => {
        console.log('[AudioBash] Toggle window triggered');
        if (mainWindow?.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow?.show();
          mainWindow?.focus();
        }
      });
      if (success) {
        console.log(`[AudioBash] Registered toggleWindow: ${currentShortcuts.toggleWindow}`);
      } else {
        console.error(`[AudioBash] Failed to register toggleWindow: ${currentShortcuts.toggleWindow} (already in use)`);
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to register ${currentShortcuts.toggleWindow}:`, err);
    }
  }

  // Toggle mode (raw/agent)
  if (currentShortcuts.toggleMode) {
    try {
      const success = globalShortcut.register(currentShortcuts.toggleMode, () => {
        console.log('[AudioBash] Toggle mode triggered');
        mainWindow?.webContents.send('toggle-mode');
      });
      if (success) {
        console.log(`[AudioBash] Registered toggleMode: ${currentShortcuts.toggleMode}`);
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to register toggleMode:`, err);
    }
  }

  // Clear terminal
  if (currentShortcuts.clearTerminal) {
    try {
      const success = globalShortcut.register(currentShortcuts.clearTerminal, () => {
        console.log('[AudioBash] Clear terminal triggered');
        mainWindow?.webContents.send('clear-terminal');
      });
      if (success) {
        console.log(`[AudioBash] Registered clearTerminal: ${currentShortcuts.clearTerminal}`);
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to register clearTerminal:`, err);
    }
  }

  // Cycle layout
  if (currentShortcuts.cycleLayout) {
    try {
      const success = globalShortcut.register(currentShortcuts.cycleLayout, () => {
        console.log('[AudioBash] Cycle layout triggered');
        mainWindow?.webContents.send('cycle-layout');
      });
      if (success) {
        console.log(`[AudioBash] Registered cycleLayout: ${currentShortcuts.cycleLayout}`);
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to register cycleLayout:`, err);
    }
  }

  // Focus next terminal
  if (currentShortcuts.focusNextTerminal) {
    try {
      const success = globalShortcut.register(currentShortcuts.focusNextTerminal, () => {
        console.log('[AudioBash] Focus next terminal triggered');
        mainWindow?.webContents.send('focus-next-terminal');
      });
      if (success) {
        console.log(`[AudioBash] Registered focusNextTerminal: ${currentShortcuts.focusNextTerminal}`);
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to register focusNextTerminal:`, err);
    }
  }

  // Focus previous terminal
  if (currentShortcuts.focusPrevTerminal) {
    try {
      const success = globalShortcut.register(currentShortcuts.focusPrevTerminal, () => {
        console.log('[AudioBash] Focus prev terminal triggered');
        mainWindow?.webContents.send('focus-prev-terminal');
      });
      if (success) {
        console.log(`[AudioBash] Registered focusPrevTerminal: ${currentShortcuts.focusPrevTerminal}`);
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to register focusPrevTerminal:`, err);
    }
  }

  // Bookmark directory
  if (currentShortcuts.bookmarkDirectory) {
    try {
      const success = globalShortcut.register(currentShortcuts.bookmarkDirectory, () => {
        console.log('[AudioBash] Bookmark directory triggered');
        mainWindow?.webContents.send('bookmark-directory');
      });
      if (success) {
        console.log(`[AudioBash] Registered bookmarkDirectory: ${currentShortcuts.bookmarkDirectory}`);
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to register bookmarkDirectory:`, err);
    }
  }

  // Resend last transcription
  if (currentShortcuts.resendLast) {
    try {
      const success = globalShortcut.register(currentShortcuts.resendLast, () => {
        console.log('[AudioBash] Resend last triggered');
        mainWindow?.webContents.send('resend-last');
      });
      if (success) {
        console.log(`[AudioBash] Registered resendLast: ${currentShortcuts.resendLast}`);
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to register resendLast:`, err);
    }
  }

  // Toggle preview pane
  if (currentShortcuts.togglePreview) {
    try {
      const success = globalShortcut.register(currentShortcuts.togglePreview, () => {
        console.log('[AudioBash] Toggle preview triggered');
        mainWindow?.webContents.send('toggle-preview');
      });
      if (success) {
        console.log(`[AudioBash] Registered togglePreview: ${currentShortcuts.togglePreview}`);
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to register togglePreview:`, err);
    }
  }

  // Capture screenshot
  if (currentShortcuts.captureScreenshot) {
    try {
      const success = globalShortcut.register(currentShortcuts.captureScreenshot, () => {
        console.log('[AudioBash] Capture screenshot triggered');
        mainWindow?.webContents.send('capture-screenshot');
      });
      if (success) {
        console.log(`[AudioBash] Registered captureScreenshot: ${currentShortcuts.captureScreenshot}`);
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to register captureScreenshot:`, err);
    }
  }

  // Switch tabs (Alt+1-4)
  const tabShortcuts = ['switchTab1', 'switchTab2', 'switchTab3', 'switchTab4'];
  tabShortcuts.forEach((key, index) => {
    if (currentShortcuts[key]) {
      try {
        const success = globalShortcut.register(currentShortcuts[key], () => {
          console.log(`[AudioBash] Switch to tab ${index + 1} triggered`);
          mainWindow?.webContents.send('switch-tab', index);
        });
        if (success) {
          console.log(`[AudioBash] Registered ${key}: ${currentShortcuts[key]}`);
        }
      } catch (err) {
        console.error(`[AudioBash] Failed to register ${key}:`, err);
      }
    }
  });
}

function spawnShell(tabId) {
  // Load node-pty if not loaded
  if (!pty) {
    try {
      pty = require('node-pty');
      ptyLog.info('node-pty loaded successfully');
    } catch (err) {
      ptyLog.error('Failed to load node-pty', err);
      return null;
    }
  }

  // Check max tabs
  if (ptyProcesses.size >= MAX_TABS) {
    ptyLog.warn('Max tabs reached', { current: ptyProcesses.size, max: MAX_TABS });
    return null;
  }

  // Determine shell
  const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';

  try {
    // Spawn PTY process
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    ptyLog.info('Shell spawned', { tabId, shell, pid: ptyProcess.pid });

    // Store the process and initialize buffers
    ptyProcesses.set(tabId, ptyProcess);
    terminalOutputBuffers.set(tabId, '');
    terminalCwds.set(tabId, os.homedir());

    // Forward PTY output to renderer and track in buffer
    ptyProcess.onData((data) => {
      try {
        // Append to output buffer (keep last MAX_OUTPUT_BUFFER chars)
        let buffer = terminalOutputBuffers.get(tabId) || '';
        buffer += data;
        if (buffer.length > MAX_OUTPUT_BUFFER) {
          buffer = buffer.slice(-MAX_OUTPUT_BUFFER);
        }
        terminalOutputBuffers.set(tabId, buffer);

        // Try to detect CWD changes from common shell prompts
        // This is a heuristic - works for PowerShell and most Unix shells
        const cwdMatch = data.match(/(?:PS\s+)?([A-Za-z]:\\[^\r\n>]*|\/[^\r\n$#>]*?)(?:\s*[>$#]|>)/);
        if (cwdMatch && cwdMatch[1]) {
          const newCwd = cwdMatch[1].trim();
          if (newCwd && newCwd !== terminalCwds.get(tabId)) {
            terminalCwds.set(tabId, newCwd);
            // Track as recent directory
            addRecentDirectory(newCwd);
          }
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal-data', { tabId, data });
        }

        // Forward to remote mobile client
        if (remoteServer) {
          remoteServer.sendTerminalData(tabId, data);
        }
      } catch (err) {
        ptyLog.error('Error in PTY onData handler', err, { tabId });
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      try {
        ptyLog.info('Shell exited', { tabId, exitCode, signal });
        ptyProcesses.delete(tabId);
        terminalOutputBuffers.delete(tabId);
        terminalCwds.delete(tabId);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal-closed', { tabId, exitCode, signal });
        }
      } catch (err) {
        ptyLog.error('Error in PTY onExit handler', err, { tabId });
      }
    });

    return ptyProcess.pid;
  } catch (err) {
    ptyLog.error('Failed to spawn shell', err, { tabId, shell });
    return null;
  }
}

function killShell(tabId) {
  const ptyProcess = ptyProcesses.get(tabId);
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcesses.delete(tabId);
    console.log(`[AudioBash] Killed shell for tab ${tabId}`);
    return true;
  }
  return false;
}

// IPC Handlers
function setupIPC() {
  // Window controls
  ipcMain.on('minimize', () => mainWindow?.minimize());
  ipcMain.on('maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on('close', () => mainWindow?.hide());

  // Terminal tab management
  ipcMain.handle('create-terminal', async (_, tabId) => {
    const pid = spawnShell(tabId);
    return { success: !!pid, pid, tabId };
  });

  ipcMain.handle('close-terminal', async (_, tabId) => {
    const success = killShell(tabId);
    return { success, tabId };
  });

  ipcMain.handle('get-terminal-count', async () => {
    return { count: ptyProcesses.size, max: MAX_TABS };
  });

  // Terminal I/O (with tabId) - all inputs validated
  const MAX_TERMINAL_INPUT = 100000; // 100KB max per write
  const MIN_COLS = 10;
  const MAX_COLS = 500;
  const MIN_ROWS = 2;
  const MAX_ROWS = 200;

  ipcMain.on('terminal-write', (_, { tabId, data }) => {
    if (typeof data !== 'string' || data.length > MAX_TERMINAL_INPUT) {
      ipcLog.warn('terminal-write: invalid input', { tabId, type: typeof data, length: data?.length });
      return;
    }
    const ptyProcess = ptyProcesses.get(tabId);
    ptyProcess?.write(data);
  });

  ipcMain.on('terminal-resize', (_, { tabId, cols, rows }) => {
    const numCols = Number(cols);
    const numRows = Number(rows);
    if (!Number.isInteger(numCols) || !Number.isInteger(numRows) ||
        numCols < MIN_COLS || numCols > MAX_COLS ||
        numRows < MIN_ROWS || numRows > MAX_ROWS) {
      ipcLog.warn('terminal-resize: invalid dimensions', { tabId, cols, rows });
      return;
    }
    const ptyProcess = ptyProcesses.get(tabId);
    ptyProcess?.resize(numCols, numRows);
  });

  // Send text to terminal (from voice transcription)
  ipcMain.on('send-to-terminal', (_, { tabId, text }) => {
    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TERMINAL_INPUT) {
      ipcLog.warn('send-to-terminal: invalid input', { tabId, type: typeof text, length: text?.length });
      return;
    }
    const ptyProcess = ptyProcesses.get(tabId);
    if (ptyProcess) {
      // Write the text first
      ptyProcess.write(text);
      // Brief delay then send Enter - helps interactive programs process input correctly
      setTimeout(() => {
        ptyProcess.write('\r');
      }, 50);
    }
  });

  // Insert text to terminal WITHOUT executing (for raw mode)
  ipcMain.on('insert-to-terminal', (_, { tabId, text }) => {
    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TERMINAL_INPUT) {
      ipcLog.warn('insert-to-terminal: invalid input', { tabId, type: typeof text, length: text?.length });
      return;
    }
    const ptyProcess = ptyProcesses.get(tabId);
    if (ptyProcess) {
      // Write the text WITHOUT \r - user can review and press Enter
      ptyProcess.write(text);
    }
  });

  // Get terminal context for AI prompts
  ipcMain.handle('get-terminal-context', async (_, tabId) => {
    const cwd = terminalCwds.get(tabId) || os.homedir();
    const recentOutput = terminalOutputBuffers.get(tabId) || '';

    // Detect OS
    const platform = process.platform;
    const osType = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'linux';

    // Get shell type
    const shell = platform === 'win32' ? 'powershell' : process.env.SHELL || 'bash';

    // Extract last command and potential error from output
    let lastCommand = '';
    let lastError = '';

    // Try to find last command (PowerShell or bash prompt followed by command)
    const commandMatches = recentOutput.match(/(?:PS [^>]+>|[$#])\s*([^\r\n]+)/g);
    if (commandMatches && commandMatches.length > 0) {
      const lastMatch = commandMatches[commandMatches.length - 1];
      lastCommand = lastMatch.replace(/^(?:PS [^>]+>|[$#])\s*/, '').trim();
    }

    // Look for common error patterns
    const errorPatterns = [
      /error[:\s]+([^\r\n]+)/i,
      /not recognized|command not found|cannot find|does not exist/i,
      /permission denied|access denied/i,
      /failed|failure/i,
    ];

    for (const pattern of errorPatterns) {
      const match = recentOutput.slice(-1000).match(pattern);
      if (match) {
        lastError = match[0].slice(0, 200); // Cap error message length
        break;
      }
    }

    return {
      cwd,
      recentOutput: recentOutput.slice(-500), // Send less to renderer
      os: osType,
      shell: path.basename(shell),
      lastCommand,
      lastError,
    };
  });

  // Directory management
  ipcMain.handle('get-directories', async () => {
    return {
      recent: recentDirectories,
      favorites: favoriteDirectories,
    };
  });

  ipcMain.handle('add-favorite-directory', async (_, dir) => {
    if (!dir || favoriteDirectories.includes(dir)) return { success: false };
    if (!fs.existsSync(dir)) return { success: false, error: 'Directory does not exist' };
    favoriteDirectories.unshift(dir);
    saveDirectories();
    return { success: true };
  });

  ipcMain.handle('remove-favorite-directory', async (_, dir) => {
    favoriteDirectories = favoriteDirectories.filter(d => d !== dir);
    saveDirectories();
    return { success: true };
  });

  ipcMain.handle('cd-to-directory', async (_, { tabId, dir }) => {
    const ptyProcess = ptyProcesses.get(tabId);
    if (!ptyProcess) return { success: false, error: 'No terminal' };
    if (!fs.existsSync(dir)) return { success: false, error: 'Directory does not exist' };

    // Send cd command
    const cdCommand = process.platform === 'win32' ? `cd "${dir}"` : `cd "${dir}"`;
    ptyProcess.write(cdCommand + '\r');
    return { success: true };
  });

  ipcMain.handle('browse-directory', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Directory',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false };
    }
    return { success: true, path: result.filePaths[0] };
  });

  // Shortcut management
  ipcMain.handle('get-shortcuts', async () => {
    return currentShortcuts;
  });

  ipcMain.handle('set-shortcuts', async (_, shortcuts) => {
    try {
      // Validate shortcuts input is a plain object with string values
      if (!shortcuts || typeof shortcuts !== 'object' || Array.isArray(shortcuts)) {
        return { success: false, error: 'Invalid shortcuts object' };
      }
      const validKeys = Object.keys(currentShortcuts);
      for (const [key, value] of Object.entries(shortcuts)) {
        if (!validKeys.includes(key)) {
          ipcLog.warn('set-shortcuts: unknown shortcut key', { key });
          continue;
        }
        if (typeof value !== 'string' || value.length > 50) {
          return { success: false, error: `Invalid shortcut value for ${key}` };
        }
      }
      // Only apply known keys
      for (const key of validKeys) {
        if (key in shortcuts && typeof shortcuts[key] === 'string') {
          currentShortcuts[key] = shortcuts[key];
        }
      }
      saveShortcuts();
      registerShortcuts();
      // Update tray menu with new shortcuts
      createTray();
      return { success: true };
    } catch (err) {
      ipcLog.error('Failed to set shortcuts', err);
      return { success: false, error: err.message };
    }
  });

  // Validate shortcut (check if it can be registered)
  ipcMain.handle('validate-shortcut', async (_, shortcut) => {
    if (!shortcut) return { valid: false, error: 'Empty shortcut' };
    try {
      // Try to register and immediately unregister
      const registered = globalShortcut.register(shortcut, () => {});
      if (registered) {
        globalShortcut.unregister(shortcut);
        // Re-register our current shortcuts
        registerShortcuts();
        return { valid: true };
      }
      return { valid: false, error: 'Shortcut already in use by another application' };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  });

  // API key storage (supports multiple providers) with encryption
  ipcMain.handle('get-api-key', async (_, provider = 'gemini') => {
    try {
      const encryptedPath = path.join(app.getPath('userData'), `api-key-${provider}.enc`);
      const plainPath = path.join(app.getPath('userData'), `api-key-${provider}.txt`);

      // Try encrypted file first
      if (fs.existsSync(encryptedPath)) {
        try {
          const encrypted = fs.readFileSync(encryptedPath);
          const decrypted = safeStorage.decryptString(encrypted);
          return decrypted.trim();
        } catch (decryptErr) {
          console.error(`[AudioBash] Failed to decrypt ${provider} API key:`, decryptErr);
          // Fall through to try plain text
        }
      }

      // Fall back to plain text files (for migration)
      if (fs.existsSync(plainPath)) {
        const plainKey = fs.readFileSync(plainPath, 'utf8').trim();
        console.log(`[AudioBash] Found plain text ${provider} API key, will migrate to encrypted on next save`);
        return plainKey;
      }

      // Fallback: check old api-key.txt for gemini (migration from very old versions)
      if (provider === 'gemini') {
        const oldPath = path.join(app.getPath('userData'), 'api-key.txt');
        if (fs.existsSync(oldPath)) {
          const oldKey = fs.readFileSync(oldPath, 'utf8').trim();
          console.log(`[AudioBash] Found legacy api-key.txt, will migrate to encrypted on next save`);
          return oldKey;
        }
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to read ${provider} API key:`, err);
    }
    return '';
  });

  ipcMain.handle('set-api-key', async (_, key, provider = 'gemini') => {
    try {
      const encryptedPath = path.join(app.getPath('userData'), `api-key-${provider}.enc`);
      const plainPath = path.join(app.getPath('userData'), `api-key-${provider}.txt`);

      // Check if encryption is available
      if (safeStorage.isEncryptionAvailable()) {
        // Encrypt and save
        const encrypted = safeStorage.encryptString(key);
        fs.writeFileSync(encryptedPath, encrypted);
        console.log(`[AudioBash] ${provider} API key saved with encryption`);

        // Clean up old plain text files after successful encryption
        try {
          if (fs.existsSync(plainPath)) {
            fs.unlinkSync(plainPath);
            console.log(`[AudioBash] Removed plain text ${provider} API key file after encryption`);
          }
          // Also clean up very old gemini key file
          if (provider === 'gemini') {
            const oldPath = path.join(app.getPath('userData'), 'api-key.txt');
            if (fs.existsSync(oldPath)) {
              fs.unlinkSync(oldPath);
              console.log(`[AudioBash] Removed legacy api-key.txt after encryption`);
            }
          }
        } catch (cleanupErr) {
          console.warn(`[AudioBash] Failed to clean up old API key files:`, cleanupErr);
          // Non-fatal, continue
        }
      } else {
        // Fall back to plain text if encryption is not available
        console.warn(`[AudioBash] Encryption not available, saving ${provider} API key as plain text`);
        fs.writeFileSync(plainPath, key, 'utf8');
      }

      // Reinitialize the corresponding AI client when key changes
      if (provider === 'gemini' && key) {
        geminiClient = new GoogleGenerativeAI(key);
      } else if (provider === 'openai' && key) {
        openaiClient = new OpenAI({ apiKey: key });
      } else if (provider === 'anthropic' && key) {
        anthropicClient = new Anthropic({ apiKey: key });
      }

      return true;
    } catch (err) {
      console.error(`[AudioBash] Failed to save ${provider} API key:`, err);
      return false;
    }
  });

  // Helper function to get API key internally (supports encrypted keys)
  async function getApiKeyInternal(provider = 'gemini') {
    try {
      const encryptedPath = path.join(app.getPath('userData'), `api-key-${provider}.enc`);
      const plainPath = path.join(app.getPath('userData'), `api-key-${provider}.txt`);

      // Try encrypted file first
      if (fs.existsSync(encryptedPath)) {
        try {
          const encrypted = fs.readFileSync(encryptedPath);
          const decrypted = safeStorage.decryptString(encrypted);
          return decrypted.trim();
        } catch (decryptErr) {
          console.error(`[AudioBash] Failed to decrypt ${provider} API key:`, decryptErr);
          // Fall through to try plain text
        }
      }

      // Fall back to plain text files (for migration)
      if (fs.existsSync(plainPath)) {
        return fs.readFileSync(plainPath, 'utf8').trim();
      }

      // Fallback: check old api-key.txt for gemini (migration from very old versions)
      if (provider === 'gemini') {
        const oldPath = path.join(app.getPath('userData'), 'api-key.txt');
        if (fs.existsSync(oldPath)) {
          return fs.readFileSync(oldPath, 'utf8').trim();
        }
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to read ${provider} API key:`, err);
    }
    return '';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AI TRANSCRIPTION HANDLERS (moved from renderer to eliminate dangerouslyAllowBrowser)
  // ═══════════════════════════════════════════════════════════════════════════

  // --- Transcription pipeline hardening utilities ---

  // Rate limiter: sliding window, max requests per window
  const transcriptionRateLimiter = {
    timestamps: [],
    maxRequests: 15,    // 15 requests per minute
    windowMs: 60000,    // 1 minute window
    check() {
      const now = Date.now();
      this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
      if (this.timestamps.length >= this.maxRequests) {
        return false;
      }
      this.timestamps.push(now);
      return true;
    }
  };

  // Audio blob validation
  const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB max (base64 encoded)
  function validateAudioInput(audioBase64) {
    if (typeof audioBase64 !== 'string') {
      return 'Audio data must be a string';
    }
    if (audioBase64.length === 0) {
      return 'Audio data is empty';
    }
    if (audioBase64.length > MAX_AUDIO_SIZE) {
      return `Audio data exceeds maximum size (${Math.round(audioBase64.length / 1024 / 1024)}MB > 25MB)`;
    }
    return null; // valid
  }

  // Retry with exponential backoff for transient API failures
  async function withRetry(fn, { maxRetries = 2, baseDelayMs = 1000, label = 'API call' } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const isRetryable = err.status === 429 || err.status === 503 || err.status === 502 ||
          err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' ||
          (err.message && err.message.includes('RESOURCE_EXHAUSTED'));
        if (!isRetryable || attempt === maxRetries) {
          throw err;
        }
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 500;
        ipcLog.warn(`${label}: retrying after transient error (attempt ${attempt + 1}/${maxRetries})`, {
          error: err.message, delay: Math.round(delay)
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw lastError;
  }

  // Gemini transcription
  ipcMain.handle('transcribe-with-gemini', async (_, { audioBase64, prompt, modelId }) => {
    try {
      // Rate limit check
      if (!transcriptionRateLimiter.check()) {
        return { success: false, error: 'Rate limit exceeded. Please wait before trying again.' };
      }

      // Validate audio input
      const audioError = validateAudioInput(audioBase64);
      if (audioError) {
        return { success: false, error: audioError };
      }

      const apiKey = await getApiKeyInternal('gemini');
      if (!apiKey) {
        return { success: false, error: 'No Gemini API key configured' };
      }

      // Initialize client if not already initialized
      if (!geminiClient) {
        geminiClient = new GoogleGenerativeAI(apiKey);
      }

      // Map model ID to actual Gemini model name
      const geminiModel = modelId === 'gemini-2.5-flash' ? 'gemini-2.5-flash' : 'gemini-2.0-flash';
      const model = geminiClient.getGenerativeModel({ model: geminiModel });

      ipcLog.info(`Transcribing with Gemini (${geminiModel})`);

      const result = await withRetry(async () => {
        return await model.generateContent([
          { text: prompt },
          {
            inlineData: {
              mimeType: 'audio/webm',
              data: audioBase64
            }
          }
        ]);
      }, { label: 'Gemini transcription' });

      const response = await result.response;
      const text = response.text()?.trim() || '';

      ipcLog.info(`Gemini transcription complete`, { textLength: text.length });
      return { success: true, text };
    } catch (err) {
      ipcLog.error('Gemini transcription error', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // OpenAI Whisper transcription
  ipcMain.handle('transcribe-with-openai', async (_, { audioBase64, prompt, modelId }) => {
    try {
      // Rate limit check
      if (!transcriptionRateLimiter.check()) {
        return { success: false, error: 'Rate limit exceeded. Please wait before trying again.' };
      }

      // Validate audio input
      const audioError = validateAudioInput(audioBase64);
      if (audioError) {
        return { success: false, error: audioError };
      }

      const apiKey = await getApiKeyInternal('openai');
      if (!apiKey) {
        return { success: false, error: 'No OpenAI API key configured' };
      }

      // Initialize client if not already initialized
      if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey });
      }

      ipcLog.info('Transcribing with OpenAI Whisper');

      // Convert base64 to buffer and create a File-like object
      const buffer = Buffer.from(audioBase64, 'base64');
      const file = new File([buffer], 'audio.webm', { type: 'audio/webm' });

      // Use Whisper for transcription with retry
      const transcription = await withRetry(async () => {
        return await openaiClient.audio.transcriptions.create({
          file: file,
          model: 'whisper-1',
        });
      }, { label: 'OpenAI Whisper' });

      let text = transcription.text?.trim() || '';

      // If agent mode (has prompt with context), use GPT-4 to process the transcription
      if (prompt && modelId === 'openai-gpt4' && text) {
        ipcLog.info('Processing transcription with GPT-4');
        const completion = await withRetry(async () => {
          return await openaiClient.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [
              { role: 'system', content: prompt },
              { role: 'user', content: text }
            ],
            max_tokens: 200,
          });
        }, { label: 'OpenAI GPT-4' });
        text = completion.choices[0]?.message?.content?.trim() || text;
      }

      ipcLog.info('OpenAI transcription complete', { textLength: text.length });
      return { success: true, text };
    } catch (err) {
      ipcLog.error('OpenAI transcription error', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // Claude/Anthropic transcription (requires OpenAI for Whisper first)
  ipcMain.handle('transcribe-with-anthropic', async (_, { audioBase64, prompt, modelId }) => {
    try {
      // Rate limit check
      if (!transcriptionRateLimiter.check()) {
        return { success: false, error: 'Rate limit exceeded. Please wait before trying again.' };
      }

      // Validate audio input
      const audioError = validateAudioInput(audioBase64);
      if (audioError) {
        return { success: false, error: audioError };
      }

      const openaiKey = await getApiKeyInternal('openai');
      const anthropicKey = await getApiKeyInternal('anthropic');

      if (!openaiKey) {
        return { success: false, error: 'OpenAI API key required for audio transcription with Claude' };
      }
      if (!anthropicKey) {
        return { success: false, error: 'No Anthropic API key configured' };
      }

      // Initialize clients if not already initialized
      if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey: openaiKey });
      }
      if (!anthropicClient) {
        anthropicClient = new Anthropic({ apiKey: anthropicKey });
      }

      ipcLog.info('Transcribing with Whisper + Claude');

      // First, use Whisper for transcription with retry
      const buffer = Buffer.from(audioBase64, 'base64');
      const file = new File([buffer], 'audio.webm', { type: 'audio/webm' });

      const transcription = await withRetry(async () => {
        return await openaiClient.audio.transcriptions.create({
          file: file,
          model: 'whisper-1',
        });
      }, { label: 'Whisper (for Claude)' });

      let text = transcription.text?.trim() || '';

      // If agent mode (has prompt with context), use Claude to process the transcription
      if (prompt && text) {
        ipcLog.info('Processing transcription with Claude');
        const claudeModel = modelId === 'claude-haiku'
          ? 'claude-3-haiku-20240307'
          : 'claude-sonnet-4-20250514';

        const message = await withRetry(async () => {
          return await anthropicClient.messages.create({
            model: claudeModel,
            max_tokens: 200,
            messages: [
              { role: 'user', content: `${prompt}\n\n${text}` }
            ],
          });
        }, { label: 'Claude processing' });

        const content = message.content[0];
        if (content.type === 'text') {
          text = content.text.trim();
        }
      }

      ipcLog.info('Claude transcription complete', { textLength: text.length });
      return { success: true, text };
    } catch (err) {
      ipcLog.error('Claude transcription error', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // ElevenLabs transcription
  ipcMain.handle('transcribe-with-elevenlabs', async (_, { audioBase64 }) => {
    try {
      // Rate limit check
      if (!transcriptionRateLimiter.check()) {
        return { success: false, error: 'Rate limit exceeded. Please wait before trying again.' };
      }

      // Validate audio input
      const audioError = validateAudioInput(audioBase64);
      if (audioError) {
        return { success: false, error: audioError };
      }

      const apiKey = await getApiKeyInternal('elevenlabs');
      if (!apiKey) {
        return { success: false, error: 'No ElevenLabs API key configured' };
      }

      ipcLog.info('Transcribing with ElevenLabs Scribe');

      // Convert base64 to buffer and create FormData
      const buffer = Buffer.from(audioBase64, 'base64');
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('audio', buffer, { filename: 'audio.webm', contentType: 'audio/webm' });
      formData.append('model_id', 'scribe_v1');

      const data = await withRetry(async () => {
        const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            ...formData.getHeaders(),
          },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          const err = new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
          err.status = response.status;
          throw err;
        }

        return await response.json();
      }, { label: 'ElevenLabs Scribe' });

      const text = data.text?.trim() || '';

      ipcLog.info('ElevenLabs transcription complete', { textLength: text.length });
      return { success: true, text };
    } catch (err) {
      ipcLog.error('ElevenLabs transcription error', err);
      return { success: false, error: err.message || String(err) };
    }
  });

  // Preview pane: File watching for auto-refresh
  ipcMain.handle('watch-file', async (event, filepath) => {
    try {
      // Validate file exists and is an absolute path
      if (!filepath || !path.isAbsolute(filepath)) {
        return { success: false, error: 'Invalid file path' };
      }
      if (!fs.existsSync(filepath)) {
        return { success: false, error: 'File does not exist' };
      }

      const watcherId = `watcher-${watcherIdCounter++}`;
      let debounceTimer;

      const watcher = fs.watch(filepath, { persistent: false }, (eventType) => {
        if (eventType === 'change') {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            // Check if watcher still exists before sending event (prevents race condition)
            if (fileWatchers.has(watcherId) && mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('file-changed', { watcherId, filepath });
            }
          }, 300); // 300ms debounce
        }
      });

      fileWatchers.set(watcherId, { filepath, watcher, debounceTimer });
      console.log(`[AudioBash] Watching file: ${filepath} (${watcherId})`);
      return { success: true, watcherId };
    } catch (err) {
      console.error('[AudioBash] Failed to watch file:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('unwatch-file', async (_, watcherId) => {
    try {
      const entry = fileWatchers.get(watcherId);
      if (entry) {
        clearTimeout(entry.debounceTimer);
        entry.watcher.close();
        fileWatchers.delete(watcherId);
        console.log(`[AudioBash] Stopped watching: ${entry.filepath} (${watcherId})`);
      }
      return { success: true };
    } catch (err) {
      console.error('[AudioBash] Failed to unwatch file:', err);
      return { success: false };
    }
  });

  // Preview pane: Validate file path
  ipcMain.handle('validate-file-path', async (_, filepath) => {
    try {
      const absolutePath = path.isAbsolute(filepath) ? filepath : path.resolve(filepath);
      const exists = fs.existsSync(absolutePath);
      return { valid: exists, absolutePath: exists ? absolutePath : undefined };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  });

  // Remote control status
  ipcMain.handle('get-remote-status', async () => {
    return remoteServer?.getStatus() || {
      running: false,
      port: 8765,
      addresses: [],
      connected: false,
      deviceName: null,
    };
  });

  // Set static password for remote access
  ipcMain.handle('set-remote-password', async (_, password) => {
    if (remoteServer) {
      // Validate and set password (returns { success, error?, warning? })
      const result = remoteServer.setStaticPassword(password);

      // Only save if validation passed
      if (!result.success) {
        return result; // Return error to UI
      }

      // Encrypt and save password
      if (password && safeStorage.isEncryptionAvailable()) {
        try {
          const encrypted = safeStorage.encryptString(password);
          store.set('remotePasswordEncrypted', encrypted.toString('base64'));
          store.set('remotePassword', ''); // Clear old plain text
          console.log('[AudioBash] Remote password encrypted and saved');
        } catch (err) {
          console.error('[AudioBash] Failed to encrypt password:', err);
          // Fallback to plain text if encryption fails
          store.set('remotePassword', password);
        }
      } else {
        // No password or encryption not available - fallback to plain text
        store.set('remotePassword', password || '');
        store.set('remotePasswordEncrypted', '');
      }
      return result; // Return success (with optional warning)
    }
    return { success: false, error: 'Remote server not running' };
  });

  // Get remote password
  ipcMain.handle('get-remote-password', async () => {
    // Try to decrypt encrypted password first
    const encryptedB64 = store.get('remotePasswordEncrypted', '');
    if (encryptedB64 && safeStorage.isEncryptionAvailable()) {
      try {
        const encrypted = Buffer.from(encryptedB64, 'base64');
        const decrypted = safeStorage.decryptString(encrypted);
        console.log('[AudioBash] Remote password decrypted successfully');
        return decrypted;
      } catch (err) {
        console.warn('[AudioBash] Failed to decrypt password, falling back to plain text:', err);
      }
    }

    // Fallback to plain text (for migration or if encryption unavailable)
    const plainPassword = store.get('remotePassword', '');

    // Migrate plain text to encrypted if available
    if (plainPassword && safeStorage.isEncryptionAvailable()) {
      try {
        const encrypted = safeStorage.encryptString(plainPassword);
        store.set('remotePasswordEncrypted', encrypted.toString('base64'));
        store.set('remotePassword', ''); // Clear plain text after migration
        console.log('[AudioBash] Migrated plain text password to encrypted storage');
      } catch (err) {
        console.warn('[AudioBash] Failed to migrate password to encrypted storage:', err);
      }
    }

    return plainPassword;
  });

  // Keep-awake mode for remote access
  let powerBlockerId = null;

  ipcMain.handle('set-keep-awake', async (_, enabled) => {
    const { powerSaveBlocker } = require('electron');

    if (enabled && powerBlockerId === null) {
      // Prevent display sleep and system sleep
      powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
      store.set('keepAwakeEnabled', true);
      console.log('[AudioBash] Keep-awake enabled (power blocker ID:', powerBlockerId, ')');
      return true;
    } else if (!enabled && powerBlockerId !== null) {
      powerSaveBlocker.stop(powerBlockerId);
      powerBlockerId = null;
      store.set('keepAwakeEnabled', false);
      console.log('[AudioBash] Keep-awake disabled');
      return false;
    }
    return enabled;
  });

  ipcMain.handle('get-keep-awake', async () => {
    return store.get('keepAwakeEnabled', false);
  });

  // Whisper local transcription
  ipcMain.handle('whisper-transcribe', async (_, audioPath) => {
    try {
      const result = await whisperService.transcribe(audioPath);
      return result;
    } catch (err) {
      console.error('[AudioBash] Whisper transcription error:', err);
      return { text: '', error: err.message };
    }
  });

  ipcMain.handle('whisper-set-model', async (_, modelName) => {
    try {
      whisperService.setModel(modelName);
      return { success: true, model: modelName };
    } catch (err) {
      console.error('[AudioBash] Whisper set model error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('whisper-get-models', async () => {
    try {
      const models = whisperService.getAvailableModels();
      const currentModel = whisperService.getModel();
      return { success: true, models, currentModel };
    } catch (err) {
      console.error('[AudioBash] Whisper get models error:', err);
      return { success: false, error: err.message };
    }
  });

  // Download a local Whisper model (one-click setup)
  ipcMain.handle('whisper-download-model', async (event, modelName) => {
    try {
      console.log(`[AudioBash] Starting model download: ${modelName}`);
      const result = await whisperService.downloadModel(modelName);
      return result;
    } catch (err) {
      console.error('[AudioBash] Whisper download error:', err);
      return { success: false, error: err.message };
    }
  });

  // Check if a model is downloaded
  ipcMain.handle('whisper-is-model-downloaded', async (_, modelName) => {
    try {
      const downloaded = whisperService.isModelDownloaded(modelName);
      return { success: true, downloaded };
    } catch (err) {
      console.error('[AudioBash] Whisper check model error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('whisper-delete-model', async (_, modelName) => {
    try {
      console.log('[AudioBash] Deleting whisper model:', modelName);
      const result = whisperService.deleteModel(modelName);
      return result;
    } catch (err) {
      console.error('[AudioBash] Whisper delete model error:', err);
      return { success: false, error: err.message };
    }
  });

  // Install whisper.cpp binary
  ipcMain.handle('whisper-install', async () => {
    try {
      console.log('[AudioBash] Installing whisper.cpp...');
      const result = await whisperService.installWhisperCpp();
      return result;
    } catch (err) {
      console.error('[AudioBash] Whisper install error:', err);
      return { success: false, error: err.message };
    }
  });

  // Get whisper installation status
  ipcMain.handle('whisper-get-status', async () => {
    try {
      return { success: true, ...whisperService.getStatus() };
    } catch (err) {
      console.error('[AudioBash] Whisper status error:', err);
      return { success: false, error: err.message };
    }
  });

  // Full setup (install + download model)
  ipcMain.handle('whisper-full-setup', async (_, modelName) => {
    try {
      console.log(`[AudioBash] Starting full whisper setup with model: ${modelName}`);
      const result = await whisperService.fullSetup(modelName);
      return result;
    } catch (err) {
      console.error('[AudioBash] Whisper full setup error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('save-temp-audio', async (_, base64Audio) => {
    try {
      const tempDir = path.join(app.getPath('temp'), 'audiobash');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const filename = `audio-${Date.now()}.webm`;
      const filepath = path.join(tempDir, filename);

      // Convert base64 to buffer and save
      const buffer = Buffer.from(base64Audio, 'base64');
      fs.writeFileSync(filepath, buffer);

      console.log(`[AudioBash] Saved temp audio: ${filepath} (${buffer.length} bytes)`);
      return { success: true, path: filepath };
    } catch (err) {
      console.error('[AudioBash] Save temp audio error:', err);
      return { success: false, error: err.message };
    }
  });

  // Preview pane: Capture screenshot
  ipcMain.handle('capture-preview', async (_, url, cwd) => {
    const { clipboard, nativeImage, BrowserWindow: BW } = require('electron');

    try {
      // Create hidden browser window for capture
      const captureWin = new BW({
        width: 1280,
        height: 720,
        show: false,
        webPreferences: {
          offscreen: true,
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      // Load the URL
      await captureWin.loadURL(url);
      // Wait for content to render
      await new Promise(resolve => setTimeout(resolve, 800));

      // Capture the page
      const image = await captureWin.webContents.capturePage();
      const pngBuffer = image.toPNG();

      // Generate filename: {url-part}-{timestamp}.png
      const urlPart = url
        .replace(/^https?:\/\//, '')
        .replace(/^file:\/\//, '')
        .replace(/[^a-zA-Z0-9-_.]/g, '-')
        .slice(0, 40);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${urlPart}-${timestamp}.png`;

      // Determine screenshots directory (use cwd/screenshots or userData/screenshots)
      // Security: Validate cwd to prevent path traversal attacks
      let screenshotsDir;
      if (cwd && path.isAbsolute(cwd) && !cwd.includes('..') && fs.existsSync(cwd)) {
        screenshotsDir = path.join(cwd, 'screenshots');
      } else {
        screenshotsDir = path.join(app.getPath('userData'), 'screenshots');
      }

      // Ensure directory exists
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }

      const fullPath = path.join(screenshotsDir, filename);
      fs.writeFileSync(fullPath, pngBuffer);
      console.log(`[AudioBash] Screenshot saved: ${fullPath}`);

      // Copy to clipboard
      clipboard.writeImage(nativeImage.createFromBuffer(pngBuffer));
      console.log('[AudioBash] Screenshot copied to clipboard');

      captureWin.close();

      return { success: true, path: fullPath, filename };
    } catch (err) {
      console.error('[AudioBash] Screenshot capture failed:', err);
      return { success: false, error: err.message };
    }
  });
}

// App lifecycle
app.whenReady().then(async () => {
  try {
  // Initialize logger first
  logger.init();
  appLog.info('AudioBash starting', {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    isDev,
  });

  // Initialize whisper service
  await whisperService.initialize();

  loadShortcuts();
  loadDirectories();
  createWindow();
  createTray();
  registerShortcuts();
  setupIPC();
  // Spawn initial shell with default tab ID
  spawnShell('tab-1');

  // Start remote control server (auto-start)
  remoteServer = new RemoteControlServer({
    port: 8765,
    ptyProcesses,
    terminalOutputBuffers,
    terminalCwds,
    mainWindow,
    onStatusChange: (status) => {
      console.log('[RemoteControl] Status:', status.connected ? `Connected: ${status.deviceName}` : 'Waiting for connection');
    },
  });
  remoteServer.start();

  // Load saved static password for remote access
  let savedRemotePassword = '';

  // Try to decrypt encrypted password first
  const encryptedB64 = store.get('remotePasswordEncrypted', '');
  if (encryptedB64 && safeStorage.isEncryptionAvailable()) {
    try {
      const encrypted = Buffer.from(encryptedB64, 'base64');
      savedRemotePassword = safeStorage.decryptString(encrypted);
      console.log('[AudioBash] Remote password loaded (encrypted)');
    } catch (err) {
      console.warn('[AudioBash] Failed to decrypt password on startup, trying plain text:', err);
    }
  }

  // Fallback to plain text (for migration or if encryption unavailable)
  if (!savedRemotePassword) {
    const plainPassword = store.get('remotePassword', '');
    if (plainPassword) {
      savedRemotePassword = plainPassword;
      console.log('[AudioBash] Remote password loaded (plain text)');

      // Migrate to encrypted storage if available
      if (safeStorage.isEncryptionAvailable()) {
        try {
          const encrypted = safeStorage.encryptString(plainPassword);
          store.set('remotePasswordEncrypted', encrypted.toString('base64'));
          store.set('remotePassword', ''); // Clear plain text after migration
          console.log('[AudioBash] Migrated plain text password to encrypted storage on startup');
        } catch (err) {
          console.warn('[AudioBash] Failed to migrate password on startup:', err);
        }
      }
    }
  }

  if (savedRemotePassword) {
    remoteServer.setStaticPassword(savedRemotePassword);
  }

  // Restore keep-awake setting
  const keepAwakeEnabled = store.get('keepAwakeEnabled', false);
  if (keepAwakeEnabled) {
    const { powerSaveBlocker } = require('electron');
    const blockerId = powerSaveBlocker.start('prevent-display-sleep');
    console.log('[AudioBash] Keep-awake restored (power blocker ID:', blockerId, ')');
  }

  } catch (err) {
    console.error('[AudioBash] Startup failed:', err);
    try { appLog.error('Startup failed', err); } catch (_) { /* logger may not be initialized */ }

    // Still try to show the window so the user sees something
    if (!mainWindow) {
      try { createWindow(); } catch (_) { /* last resort */ }
    }
  }
});

app.on('window-all-closed', () => {
  // Don't quit on macOS
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();

  // Stop WebSocket server
  if (remoteServer) {
    remoteServer.stop();
    remoteServer = null;
  }

  // Close all file watchers
  for (const [watcherId, entry] of fileWatchers) {
    try {
      clearTimeout(entry.debounceTimer);
      entry.watcher.close();
    } catch (err) {
      // Ignore cleanup errors during shutdown
    }
  }
  fileWatchers.clear();

  // Kill all PTY processes
  for (const [tabId, ptyProcess] of ptyProcesses) {
    ptyProcess.kill();
    console.log(`[AudioBash] Killed shell for tab ${tabId}`);
  }
  ptyProcesses.clear();
});

app.on('before-quit', () => {
  app.isQuitting = true;
});
