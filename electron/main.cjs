const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// node-pty will be loaded dynamically after app ready
let pty = null;
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
};

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
