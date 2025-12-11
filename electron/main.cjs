const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// node-pty will be loaded dynamically after app ready
let pty = null;
const ptyProcesses = new Map(); // Map of tabId -> ptyProcess
let mainWindow = null;
let tray = null;
let currentShortcuts = {
  toggleRecording: 'Alt+S',
  toggleWindow: 'Alt+H',
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
  const iconPath = path.join(__dirname, '../audiobash-logo.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
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

  // Store the process
  ptyProcesses.set(tabId, ptyProcess);

  // Forward PTY output to renderer
  ptyProcess.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-data', { tabId, data });
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    console.log(`[AudioBash] Shell ${tabId} exited with code ${exitCode}, signal ${signal}`);
    ptyProcesses.delete(tabId);
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
      // Write the text followed by Enter
      ptyProcess.write(text + '\r');
    }
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
