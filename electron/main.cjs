const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// node-pty will be loaded dynamically after app ready
let pty = null;

// Remote control server
const { RemoteControlServer } = require('./websocket-server.cjs');
let remoteServer = null;

// Tunnel service
const { TunnelService } = require('./tunnelService.cjs');
let tunnelService = null;

// Whisper service for local transcription
const whisperService = require('./whisperService.cjs');

// Simple persistent storage (replacement for electron-store)
const storeFilePath = path.join(app.getPath('userData'), 'app-store.json');
const store = {
  data: {},
  load() {
    try {
      if (fs.existsSync(storeFilePath)) {
        this.data = JSON.parse(fs.readFileSync(storeFilePath, 'utf8'));
      }
    } catch (err) {
      console.error('[Store] Failed to load:', err);
    }
  },
  save() {
    try {
      fs.writeFileSync(storeFilePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[Store] Failed to save:', err);
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
    console.log('[AudioBash] WARNING: Could not load tray icon, using empty icon');
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
    } catch (err) {
      console.error('[AudioBash] Failed to load node-pty:', err);
      return null;
    }
  }

  // Check max tabs
  if (ptyProcesses.size >= MAX_TABS) {
    console.warn('[AudioBash] Max tabs reached');
    return null;
  }

  // Determine shell
  const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';

  // Spawn PTY process
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: os.homedir(),
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  console.log(`[AudioBash] Spawned ${shell} for tab ${tabId} with PID ${ptyProcess.pid}`);

  // Store the process and initialize buffers
  ptyProcesses.set(tabId, ptyProcess);
  terminalOutputBuffers.set(tabId, '');
  terminalCwds.set(tabId, os.homedir());

  // Forward PTY output to renderer and track in buffer
  ptyProcess.onData((data) => {
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
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`[AudioBash] Shell ${tabId} exited with code ${exitCode}, signal ${signal}`);
    ptyProcesses.delete(tabId);
    terminalOutputBuffers.delete(tabId);
    terminalCwds.delete(tabId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-closed', { tabId, exitCode, signal });
    }
  });

  return ptyProcess.pid;
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

  // Terminal I/O (with tabId)
  ipcMain.on('terminal-write', (_, { tabId, data }) => {
    const ptyProcess = ptyProcesses.get(tabId);
    ptyProcess?.write(data);
  });

  ipcMain.on('terminal-resize', (_, { tabId, cols, rows }) => {
    const ptyProcess = ptyProcesses.get(tabId);
    ptyProcess?.resize(cols, rows);
  });

  // Send text to terminal (from voice transcription)
  ipcMain.on('send-to-terminal', (_, { tabId, text }) => {
    const ptyProcess = ptyProcesses.get(tabId);
    if (ptyProcess && text) {
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
    const ptyProcess = ptyProcesses.get(tabId);
    if (ptyProcess && text) {
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
      currentShortcuts = { ...currentShortcuts, ...shortcuts };
      saveShortcuts();
      registerShortcuts();
      // Update tray menu with new shortcuts
      createTray();
      return { success: true };
    } catch (err) {
      console.error('[AudioBash] Failed to set shortcuts:', err);
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

  // API key storage (supports multiple providers)
  ipcMain.handle('get-api-key', async (_, provider = 'gemini') => {
    try {
      const keyPath = path.join(app.getPath('userData'), `api-key-${provider}.txt`);
      if (fs.existsSync(keyPath)) {
        return fs.readFileSync(keyPath, 'utf8').trim();
      }
      // Fallback: check old api-key.txt for gemini (migration)
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
  });

  ipcMain.handle('set-api-key', async (_, key, provider = 'gemini') => {
    try {
      const keyPath = path.join(app.getPath('userData'), `api-key-${provider}.txt`);
      fs.writeFileSync(keyPath, key, 'utf8');
      return true;
    } catch (err) {
      console.error(`[AudioBash] Failed to save ${provider} API key:`, err);
      return false;
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
      pairingCode: null,
      addresses: [],
      connected: false,
      deviceName: null,
    };
  });

  ipcMain.handle('regenerate-pairing-code', async () => {
    if (remoteServer) {
      return remoteServer.regeneratePairingCode();
    }
    return null;
  });

  // Set static password for remote access
  ipcMain.handle('set-remote-password', async (_, password) => {
    if (remoteServer) {
      remoteServer.setStaticPassword(password);
      // Save to electron-store
      store.set('remotePassword', password || '');
      return true;
    }
    return false;
  });

  // Get remote password
  ipcMain.handle('get-remote-password', async () => {
    return store.get('remotePassword', '');
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

  // Remote transcription result (from renderer back to main)
  ipcMain.on('remote-transcription-result', (event, result) => {
    // This is handled by the promise in handleRemoteTranscription
    // The event is emitted and caught by the handler registered there
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

  // Tunnel service handlers
  ipcMain.handle('tunnel-start', async (_, port) => {
    try {
      if (!tunnelService) {
        console.error('[AudioBash] Tunnel service not initialized');
        return { success: false, error: 'Tunnel service not available' };
      }
      await tunnelService.start(port || 8765);
      return { success: true, status: tunnelService.getStatus() };
    } catch (err) {
      console.error('[AudioBash] Tunnel start error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tunnel-stop', async () => {
    try {
      if (!tunnelService) {
        return { success: false, error: 'Tunnel service not available' };
      }
      tunnelService.stop();
      return { success: true };
    } catch (err) {
      console.error('[AudioBash] Tunnel stop error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('tunnel-status', async () => {
    try {
      if (!tunnelService) {
        return {
          status: 'disconnected',
          tunnelUrl: null,
          subdomain: null,
          error: 'Tunnel service not initialized'
        };
      }
      return tunnelService.getStatus();
    } catch (err) {
      console.error('[AudioBash] Tunnel status error:', err);
      return {
        status: 'error',
        error: err.message
      };
    }
  });

  ipcMain.handle('tunnel-check-binary', async () => {
    try {
      if (!tunnelService) {
        return {
          available: false,
          path: null,
          message: 'Tunnel service not initialized'
        };
      }
      return tunnelService.checkBinary();
    } catch (err) {
      console.error('[AudioBash] Tunnel check binary error:', err);
      return {
        available: false,
        path: null,
        message: err.message
      };
    }
  });

  // Save tunnel enabled preference
  ipcMain.handle('set-tunnel-enabled', async (_, enabled) => {
    store.set('tunnelEnabled', enabled);
    return true;
  });

  ipcMain.handle('get-tunnel-enabled', async () => {
    return store.get('tunnelEnabled', false);
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
app.whenReady().then(() => {
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
    transcribeAudio: handleRemoteTranscription,
    onStatusChange: (status) => {
      console.log('[RemoteControl] Status:', status.connected ? `Connected: ${status.deviceName}` : 'Waiting for connection');
    },
  });
  remoteServer.start();

  // Load saved static password for remote access
  const savedRemotePassword = store.get('remotePassword', '');
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

  // Initialize tunnel service
  tunnelService = new TunnelService();
  tunnelService.onStatusChange = (status) => {
    console.log('[TunnelService] Status:', status.status, status.tunnelUrl || '');
    // Notify renderer of status change
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel-status-changed', status);
    }
  };

  // Auto-start tunnel if enabled
  const tunnelEnabled = store.get('tunnelEnabled', false);
  if (tunnelEnabled) {
    console.log('[AudioBash] Auto-starting tunnel (saved preference)');
    tunnelService.start(8765);
  }
});

/**
 * Handle audio transcription from remote mobile client
 * This bridges the remote server to the renderer's transcription service
 */
async function handleRemoteTranscription(audioBuffer, tabId, mode) {
  return new Promise((resolve) => {
    // Send audio to renderer for transcription (reuses existing transcriptionService)
    const requestId = `remote-${Date.now()}`;

    const handler = (event, result) => {
      if (result.requestId === requestId) {
        ipcMain.removeListener('remote-transcription-result', handler);
        resolve(result);
      }
    };
    ipcMain.on('remote-transcription-result', handler);

    // Send to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('remote-transcription-request', {
        requestId,
        audioBase64: audioBuffer.toString('base64'),
        tabId,
        mode,
      });
    } else {
      resolve({ success: false, error: 'Main window not available' });
    }

    // Timeout after 30 seconds
    setTimeout(() => {
      ipcMain.removeListener('remote-transcription-result', handler);
      resolve({ success: false, error: 'Transcription timeout' });
    }, 30000);
  });
}

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

  // Stop tunnel
  if (tunnelService) {
    tunnelService.stop();
    tunnelService = null;
  }

  // Stop WebSocket server
  if (remoteServer) {
    remoteServer.stop();
    remoteServer = null;
  }

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
