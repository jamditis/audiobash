const {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  safeStorage,
  screen,
  session,
  shell,
} = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Centralized logger - must initialize after app ready
const { logger, appLog, ipcLog, ptyLog, storeLog } = require('./logger.cjs');

// Enable Chromium feature flags before the app is ready (too late inside whenReady). This lets
// global shortcuts register under Wayland, not just X11.
const { enableWaylandShortcuts } = require('./featureFlags.cjs');
const { ensureTray } = require('./trayLifecycle.cjs');
enableWaylandShortcuts(app);

// Global error handlers to prevent silent crashes (fixes #29)
process.on('uncaughtException', (err) => {
  console.error('[AudioBash] Uncaught exception:', err);
  try {
    appLog.error('Uncaught exception', err);
  } catch (_) {
    /* logger may not be initialized */
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('[AudioBash] Unhandled rejection:', reason);
  try {
    appLog.error('Unhandled rejection', { reason: String(reason) });
  } catch (_) {
    /* logger may not be initialized */
  }
});

// node-pty will be loaded dynamically after app ready
let pty = null;

// Whisper service for local transcription
const whisperService = require('./whisperService.cjs');

const { registerTranscriptionHandlers } = require('./transcriptionHandlers.cjs');

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
  },
};
store.load();
const ptyProcesses = new Map(); // Map of tabId -> ptyProcess
const ptyShells = new Map(); // Map of tabId -> shell path the PTY was spawned with
const terminalOutputBuffers = new Map(); // Map of tabId -> recent output (last ~2000 chars)
const terminalCwds = new Map(); // Map of tabId -> current working directory
const terminalReady = new Set(); // Set of tabIds whose renderer xterm is mounted and listening

// Shell selection + safe cd-command quoting (extracted so it can be unit-tested in isolation).
const { getDefaultShell, buildCdCommand } = require('./shellQuote.cjs');
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
  splitHorizontal: 'Alt+-',
  splitVertical: 'Alt+\\',
  closePane: 'Alt+W',
  zoomPane: 'Alt+Z',
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

// Window bounds persistence defaults
const DEFAULT_WINDOW_BOUNDS = { width: 1200, height: 800 };
let boundsDebounceTimer = null;

/**
 * Returns saved window bounds if they fall on a connected display,
 * otherwise returns default size (centered by Electron).
 */
function getWindowBounds() {
  const saved = store.get('windowBounds');
  if (!saved || typeof saved.width !== 'number' || typeof saved.height !== 'number') {
    appLog.debug('No saved window bounds, using defaults');
    return { ...DEFAULT_WINDOW_BOUNDS };
  }

  // Validate that the saved position is on a connected display
  if (typeof saved.x === 'number' && typeof saved.y === 'number') {
    try {
      const displays = screen.getAllDisplays();
      const onScreen = displays.some((display) => {
        const { x, y, width, height } = display.bounds;
        // Check if at least 100px of the window is visible on this display
        return (
          saved.x + saved.width > x + 100 &&
          saved.x < x + width - 100 &&
          saved.y > y - 50 &&
          saved.y < y + height - 100
        );
      });

      if (onScreen) {
        appLog.debug('Restoring saved window bounds', saved);
        return { x: saved.x, y: saved.y, width: saved.width, height: saved.height };
      }

      appLog.info('Saved window position is off-screen, using default size');
    } catch (err) {
      appLog.warn('Failed to validate window bounds against displays', { error: err.message });
    }
  }

  // Position invalid or missing — return size only so Electron centers the window
  return { width: saved.width, height: saved.height };
}

function createWindow() {
  const bounds = getWindowBounds();

  const windowOptions = {
    ...bounds,
    minWidth: 800,
    minHeight: 600,
    frame: false, // Frameless for custom title bar
    backgroundColor: '#050505',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  if (process.platform !== 'darwin') {
    windowOptions.icon = path.join(__dirname, '../audiobash-logo.ico');
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:9527');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Security: never let a new BrowserWindow open inside the app (it would inherit the app's
  // preload and privileges). Legitimate external links (help links in Settings, the GitHub
  // issue link in ErrorBoundary, etc.) are handed to the OS default browser via openExternal,
  // which runs in a separate, unprivileged process. Only http/https are allowed through; any
  // other scheme (file:, javascript:, smb:, ...) is dropped because openExternal is an RCE sink.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const { protocol } = new URL(url);
      if (protocol === 'http:' || protocol === 'https:') {
        // openExternal returns a Promise; an unhandled rejection would surface as a noisy
        // main-process warning, so log failures instead of letting them escape.
        shell.openExternal(url).catch((openErr) => {
          appLog.warn('Failed to open external URL', { error: openErr.message });
        });
      } else {
        appLog.warn('Blocked window-open for non-http(s) scheme', { protocol });
      }
    } catch (err) {
      appLog.warn('Blocked window-open for unparseable URL', { error: err.message });
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const isDevNav = isDev && navigationUrl.startsWith('http://localhost:9527');
    if (!navigationUrl.startsWith('file://') && !isDevNav) {
      event.preventDefault();
      appLog.warn('Blocked navigation attempt', { url: navigationUrl });
    }
  });

  // Debounced save of window bounds on resize and move (skip when maximized)
  const saveWindowBounds = () => {
    if (boundsDebounceTimer) clearTimeout(boundsDebounceTimer);
    boundsDebounceTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isMaximized() || mainWindow.isMinimized()) return;
      const currentBounds = mainWindow.getBounds();
      store.set('windowBounds', currentBounds);
      appLog.debug('Window bounds saved', currentBounds);
    }, 500);
  };

  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);
  // Intercept Ctrl+Plus/Minus/0 for font zoom (before Chromium handles them)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && !input.alt && !input.shift) {
      if (input.key === '=' || input.key === '+') {
        event.preventDefault();
        mainWindow.webContents.send('zoom-in');
      } else if (input.key === '-') {
        event.preventDefault();
        mainWindow.webContents.send('zoom-out');
      } else if (input.key === '0') {
        event.preventDefault();
        mainWindow.webContents.send('zoom-reset');
      }
    }
    // Alt+Shift+Arrow for pane resize
    if (input.alt && input.shift && !input.control) {
      if (input.key === 'ArrowLeft') {
        event.preventDefault();
        mainWindow.webContents.send('resize-pane', 'left');
      } else if (input.key === 'ArrowRight') {
        event.preventDefault();
        mainWindow.webContents.send('resize-pane', 'right');
      } else if (input.key === 'ArrowUp') {
        event.preventDefault();
        mainWindow.webContents.send('resize-pane', 'up');
      } else if (input.key === 'ArrowDown') {
        event.preventDefault();
        mainWindow.webContents.send('resize-pane', 'down');
      }
    }
  });

  // Hide instead of close (tray mode)
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTrayContextMenu() {
  return Menu.buildFromTemplate([
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
}

function createTray() {
  const contextMenu = createTrayContextMenu();
  if (tray) {
    tray = ensureTray({ currentTray: tray, contextMenu });
    return;
  }

  // Use ICO for Windows tray (better rendering), PNG for other platforms
  let iconPath;
  if (app.isPackaged) {
    // In production, icons are in resources folder
    const resourcesPath = process.resourcesPath;
    iconPath =
      process.platform === 'win32'
        ? path.join(resourcesPath, 'audiobash-logo.ico')
        : path.join(resourcesPath, 'audiobash-logo.png');
  } else {
    // In development, icons are in project root
    iconPath =
      process.platform === 'win32'
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
  tray = ensureTray({
    TrayClass: Tray,
    icon,
    contextMenu,
    tooltip: 'AudioBash',
    onClick: () => mainWindow?.show(),
  });
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
    fs.writeFileSync(
      dirsPath,
      JSON.stringify({
        recent: recentDirectories,
        favorites: favoriteDirectories,
      }),
      'utf8',
    );
  } catch (err) {
    console.error('[AudioBash] Failed to save directories:', err);
  }
}

function addRecentDirectory(dir) {
  if (!dir || !fs.existsSync(dir)) return;

  // Remove if already exists
  recentDirectories = recentDirectories.filter((d) => d !== dir);
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
        console.error(
          `[AudioBash] Failed to register toggleRecording: ${currentShortcuts.toggleRecording} (already in use)`,
        );
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
        console.error(
          `[AudioBash] Failed to register cancelRecording: ${currentShortcuts.cancelRecording} (already in use)`,
        );
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
        console.error(
          `[AudioBash] Failed to register toggleWindow: ${currentShortcuts.toggleWindow} (already in use)`,
        );
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
        console.log(
          `[AudioBash] Registered focusNextTerminal: ${currentShortcuts.focusNextTerminal}`,
        );
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
        console.log(
          `[AudioBash] Registered focusPrevTerminal: ${currentShortcuts.focusPrevTerminal}`,
        );
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
        console.log(
          `[AudioBash] Registered bookmarkDirectory: ${currentShortcuts.bookmarkDirectory}`,
        );
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
        console.log(
          `[AudioBash] Registered captureScreenshot: ${currentShortcuts.captureScreenshot}`,
        );
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

  // Split horizontal
  if (currentShortcuts.splitHorizontal) {
    try {
      const success = globalShortcut.register(currentShortcuts.splitHorizontal, () => {
        console.log('[AudioBash] Split horizontal triggered');
        mainWindow?.webContents.send('split-horizontal');
      });
      if (success) {
        console.log(`[AudioBash] Registered splitHorizontal: ${currentShortcuts.splitHorizontal}`);
      }
    } catch (err) {
      console.error('[AudioBash] Failed to register splitHorizontal:', err);
    }
  }

  // Split vertical
  if (currentShortcuts.splitVertical) {
    try {
      const success = globalShortcut.register(currentShortcuts.splitVertical, () => {
        console.log('[AudioBash] Split vertical triggered');
        mainWindow?.webContents.send('split-vertical');
      });
      if (success) {
        console.log(`[AudioBash] Registered splitVertical: ${currentShortcuts.splitVertical}`);
      }
    } catch (err) {
      console.error('[AudioBash] Failed to register splitVertical:', err);
    }
  }

  // Close pane
  if (currentShortcuts.closePane) {
    try {
      const success = globalShortcut.register(currentShortcuts.closePane, () => {
        console.log('[AudioBash] Close pane triggered');
        mainWindow?.webContents.send('close-pane');
      });
      if (success) {
        console.log(`[AudioBash] Registered closePane: ${currentShortcuts.closePane}`);
      }
    } catch (err) {
      console.error('[AudioBash] Failed to register closePane:', err);
    }
  }

  // Zoom pane
  if (currentShortcuts.zoomPane) {
    try {
      const success = globalShortcut.register(currentShortcuts.zoomPane, () => {
        console.log('[AudioBash] Zoom pane triggered');
        mainWindow?.webContents.send('zoom-pane');
      });
      if (success) {
        console.log(`[AudioBash] Registered zoomPane: ${currentShortcuts.zoomPane}`);
      }
    } catch (err) {
      console.error('[AudioBash] Failed to register zoomPane:', err);
    }
  }
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
  const shell = getDefaultShell();

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
    ptyShells.set(tabId, shell);
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
        const cwdMatch = data.match(
          /(?:PS\s+)?([A-Za-z]:\\[^\r\n>]*|\/[^\r\n$#>]*?)(?:\s*[>$#]|>)/,
        );
        if (cwdMatch && cwdMatch[1]) {
          const newCwd = cwdMatch[1].trim();
          if (newCwd && newCwd !== terminalCwds.get(tabId)) {
            terminalCwds.set(tabId, newCwd);
            // Track as recent directory
            addRecentDirectory(newCwd);
          }
        }

        // Only forward to renderer if xterm has signaled ready
        if (terminalReady.has(tabId) && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('terminal-data', { tabId, data });
        }
      } catch (err) {
        ptyLog.error('Error in PTY onData handler', err, { tabId });
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      try {
        ptyLog.info('Shell exited', { tabId, exitCode, signal });
        ptyProcesses.delete(tabId);
        ptyShells.delete(tabId);
        terminalOutputBuffers.delete(tabId);
        terminalCwds.delete(tabId);
        terminalReady.delete(tabId);
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
    ptyShells.delete(tabId);
    terminalReady.delete(tabId);
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
      ipcLog.warn('terminal-write: invalid input', {
        tabId,
        type: typeof data,
        length: data?.length,
      });
      return;
    }
    const ptyProcess = ptyProcesses.get(tabId);
    ptyProcess?.write(data);
  });

  ipcMain.on('terminal-resize', (_, { tabId, cols, rows }) => {
    const numCols = Number(cols);
    const numRows = Number(rows);
    if (
      !Number.isInteger(numCols) ||
      !Number.isInteger(numRows) ||
      numCols < MIN_COLS ||
      numCols > MAX_COLS ||
      numRows < MIN_ROWS ||
      numRows > MAX_ROWS
    ) {
      ipcLog.warn('terminal-resize: invalid dimensions', { tabId, cols, rows });
      return;
    }
    const ptyProcess = ptyProcesses.get(tabId);
    ptyProcess?.resize(numCols, numRows);
  });

  // Send text to terminal (from voice transcription)
  ipcMain.on('send-to-terminal', (_, { tabId, text }) => {
    if (typeof text !== 'string' || text.length === 0 || text.length > MAX_TERMINAL_INPUT) {
      ipcLog.warn('send-to-terminal: invalid input', {
        tabId,
        type: typeof text,
        length: text?.length,
      });
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
      ipcLog.warn('insert-to-terminal: invalid input', {
        tabId,
        type: typeof text,
        length: text?.length,
      });
      return;
    }
    const ptyProcess = ptyProcesses.get(tabId);
    if (ptyProcess) {
      // Write the text WITHOUT \r - user can review and press Enter
      ptyProcess.write(text);
    }
  });

  // Get buffered terminal output (for replaying after late mount)
  ipcMain.handle('get-terminal-buffer', async (_, tabId) => {
    return terminalOutputBuffers.get(tabId) || '';
  });

  // Terminal ready signal — renderer xterm is mounted and listening
  // Flushes buffered output then starts live forwarding
  ipcMain.handle('terminal-ready', async (_, tabId) => {
    ptyLog.debug('Terminal ready signal received', { tabId });
    terminalReady.add(tabId);
    // Flush any buffered output that arrived before xterm mounted
    const buffer = terminalOutputBuffers.get(tabId) || '';
    if (buffer && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-data', { tabId, data: buffer });
    }
    return { success: true };
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
    favoriteDirectories = favoriteDirectories.filter((d) => d !== dir);
    saveDirectories();
    return { success: true };
  });

  ipcMain.handle('cd-to-directory', async (_, { tabId, dir }) => {
    const ptyProcess = ptyProcesses.get(tabId);
    if (!ptyProcess) return { success: false, error: 'No terminal' };
    if (typeof dir !== 'string' || !dir.trim())
      return { success: false, error: 'Invalid directory' };
    // Reject only line terminators: the command is submitted to the PTY with a trailing \r, so an
    // embedded \r/\n would split it into a second command line. Every other character (including
    // quotes, $, &, spaces) is made safe by single-quote shell quoting below, so legitimate
    // directory names with those characters (common on macOS/Linux) are accepted.
    if (/[\r\n]/.test(dir)) {
      return { success: false, error: 'Directory path contains line breaks' };
    }
    if (!path.isAbsolute(dir))
      return { success: false, error: 'Directory must be an absolute path' };
    if (!fs.existsSync(dir)) return { success: false, error: 'Directory does not exist' };

    // Quote the path for the shell this PTY was actually spawned with (recorded in ptyShells), not
    // a guess from process.platform, so the quoting can never mismatch the running shell.
    const shell = ptyShells.get(tabId) || getDefaultShell();
    const { command, error } = buildCdCommand(shell, dir);
    if (error) return { success: false, error };
    ptyProcess.write(`${command}\r`);
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

  // API key storage (supports multiple providers) with encryption.
  // The provider string is interpolated into the on-disk filename (api-key-<provider>.enc),
  // so it MUST be validated against an allowlist — otherwise a compromised renderer could
  // read/write/delete arbitrary paths via a traversal value (e.g. "../../something").
  const API_KEY_PROVIDERS = new Set(['gemini', 'openai', 'anthropic', 'elevenlabs']);
  function isValidProvider(provider) {
    return typeof provider === 'string' && API_KEY_PROVIDERS.has(provider);
  }

  // In-memory key cache. Lets the main process use a key for the current session without a
  // disk read, and lets keys work even when secure storage is unavailable (so we never have
  // to fall back to writing plaintext to disk).
  const apiKeyMemoryCache = {};

  // If secure storage is available, transparently migrate a legacy plaintext key file to the
  // encrypted store and delete the plaintext copy so secrets don't linger on disk.
  function migratePlaintextKey(provider, key, plainPath) {
    if (!key) {
      return;
    }
    // Cache the migrated key so the rest of this session reuses it instead of re-reading disk
    // on every get-api-key / getApiKeyInternal call (the latter is on the transcription hot path).
    apiKeyMemoryCache[provider] = key;
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const encryptedPath = path.join(app.getPath('userData'), `api-key-${provider}.enc`);
        fs.writeFileSync(encryptedPath, safeStorage.encryptString(key));
        fs.unlinkSync(plainPath);
        console.log(`[AudioBash] Migrated plaintext ${provider} API key to encrypted storage`);
      }
    } catch (migrateErr) {
      console.warn(`[AudioBash] Failed to migrate plaintext ${provider} API key:`, migrateErr);
    }
  }

  ipcMain.handle('get-api-key', async (_, provider = 'gemini') => {
    if (!isValidProvider(provider)) {
      ipcLog.warn('get-api-key: invalid provider', { provider: String(provider) });
      return '';
    }
    if (apiKeyMemoryCache[provider]) {
      return apiKeyMemoryCache[provider];
    }
    try {
      const encryptedPath = path.join(app.getPath('userData'), `api-key-${provider}.enc`);
      const plainPath = path.join(app.getPath('userData'), `api-key-${provider}.txt`);

      // Try encrypted file first
      if (fs.existsSync(encryptedPath)) {
        try {
          const encrypted = fs.readFileSync(encryptedPath);
          const decrypted = safeStorage.decryptString(encrypted).trim();
          // Cache so subsequent calls this session skip the synchronous read + decrypt.
          if (decrypted) {
            apiKeyMemoryCache[provider] = decrypted;
          }
          return decrypted;
        } catch (decryptErr) {
          console.error(`[AudioBash] Failed to decrypt ${provider} API key:`, decryptErr);
          // Fall through to try plain text
        }
      }

      // Fall back to plain text files (legacy migration); re-encrypt and remove immediately.
      if (fs.existsSync(plainPath)) {
        const plainKey = fs.readFileSync(plainPath, 'utf8').trim();
        migratePlaintextKey(provider, plainKey, plainPath);
        return plainKey;
      }

      // Fallback: check old api-key.txt for gemini (migration from very old versions)
      if (provider === 'gemini') {
        const oldPath = path.join(app.getPath('userData'), 'api-key.txt');
        if (fs.existsSync(oldPath)) {
          const oldKey = fs.readFileSync(oldPath, 'utf8').trim();
          migratePlaintextKey(provider, oldKey, oldPath);
          return oldKey;
        }
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to read ${provider} API key:`, err);
    }
    return '';
  });

  ipcMain.handle('set-api-key', async (_, key, provider = 'gemini') => {
    if (!isValidProvider(provider)) {
      ipcLog.warn('set-api-key: invalid provider', { provider: String(provider) });
      return false;
    }
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
        // Secure storage unavailable (e.g. Linux without a keyring): NEVER write the key to
        // disk in plain text. Hold it in memory for this session only (see cache below).
        ipcLog.warn(
          'set-api-key: secure storage unavailable; key held in memory for this session only, not persisted',
          { provider },
        );
      }

      // Cache in memory so the key is usable this session regardless of disk persistence.
      if (key) {
        apiKeyMemoryCache[provider] = key;
      } else {
        delete apiKeyMemoryCache[provider];
      }

      return true;
    } catch (err) {
      console.error(`[AudioBash] Failed to save ${provider} API key:`, err);
      return false;
    }
  });

  // Helper function to get API key internally (supports encrypted keys)
  async function getApiKeyInternal(provider = 'gemini') {
    if (!isValidProvider(provider)) {
      return '';
    }
    // Prefer the in-memory cache (also covers systems without secure storage).
    if (apiKeyMemoryCache[provider]) {
      return apiKeyMemoryCache[provider];
    }
    try {
      const encryptedPath = path.join(app.getPath('userData'), `api-key-${provider}.enc`);
      const plainPath = path.join(app.getPath('userData'), `api-key-${provider}.txt`);

      // Try encrypted file first
      if (fs.existsSync(encryptedPath)) {
        try {
          const encrypted = fs.readFileSync(encryptedPath);
          const decrypted = safeStorage.decryptString(encrypted).trim();
          // Cache so subsequent calls this session skip the synchronous read + decrypt.
          if (decrypted) {
            apiKeyMemoryCache[provider] = decrypted;
          }
          return decrypted;
        } catch (decryptErr) {
          console.error(`[AudioBash] Failed to decrypt ${provider} API key:`, decryptErr);
          // Fall through to try plain text
        }
      }

      // Fall back to plain text files (legacy migration); re-encrypt and remove immediately.
      if (fs.existsSync(plainPath)) {
        const plainKey = fs.readFileSync(plainPath, 'utf8').trim();
        migratePlaintextKey(provider, plainKey, plainPath);
        return plainKey;
      }

      // Fallback: check old api-key.txt for gemini (migration from very old versions)
      if (provider === 'gemini') {
        const oldPath = path.join(app.getPath('userData'), 'api-key.txt');
        if (fs.existsSync(oldPath)) {
          const oldKey = fs.readFileSync(oldPath, 'utf8').trim();
          migratePlaintextKey(provider, oldKey, oldPath);
          return oldKey;
        }
      }
    } catch (err) {
      console.error(`[AudioBash] Failed to read ${provider} API key:`, err);
    }
    return '';
  }

  registerTranscriptionHandlers({
    ipcMain,
    getApiKey: getApiKeyInternal,
    log: ipcLog,
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

    // Only capture web/local content. The URL is loaded into a real (offscreen) browser
    // window, so reject schemes like javascript:/data:/vbscript: that could execute attacker
    // payloads in that window's context.
    const ALLOWED_CAPTURE_SCHEMES = new Set(['http:', 'https:', 'file:']);
    if (typeof url !== 'string' || !url.trim()) {
      return { success: false, error: 'Invalid URL' };
    }
    let parsedScheme;
    try {
      parsedScheme = new URL(url).protocol;
    } catch {
      return { success: false, error: 'Malformed URL' };
    }
    if (!ALLOWED_CAPTURE_SCHEMES.has(parsedScheme)) {
      ipcLog.warn('capture-preview: blocked disallowed URL scheme', { scheme: parsedScheme });
      return { success: false, error: `Unsupported URL scheme: ${parsedScheme}` };
    }

    let captureWin = null;
    try {
      // Create hidden browser window for capture. Locked down: no preload, sandboxed, web
      // security on, no Node — it only ever renders untrusted preview content for a screenshot.
      captureWin = new BW({
        width: 1280,
        height: 720,
        show: false,
        webPreferences: {
          offscreen: true,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });

      // The capture window never needs to open new windows; deny any attempt.
      captureWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

      // Load the URL
      await captureWin.loadURL(url);
      // Wait for content to render
      await new Promise((resolve) => setTimeout(resolve, 800));

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

      return { success: true, path: fullPath, filename };
    } catch (err) {
      console.error('[AudioBash] Screenshot capture failed:', err);
      return { success: false, error: err.message };
    } finally {
      // Always destroy the capture window, even if loadURL/capture threw, so it can't leak.
      if (captureWin && !captureWin.isDestroyed()) {
        captureWin.destroy();
      }
    }
  });

  // Pane session management
  ipcMain.handle('save-pane-session', async (event, name, tree) => {
    try {
      const sessions = store.get('paneSessions') || {};
      sessions[name] = { name, tree, timestamp: Date.now() };
      store.set('paneSessions', sessions);
      return { success: true };
    } catch (err) {
      return { success: false };
    }
  });

  ipcMain.handle('load-pane-session', async (event, name) => {
    try {
      const sessions = store.get('paneSessions') || {};
      const session = sessions[name];
      return session ? { success: true, tree: session.tree } : { success: false };
    } catch (err) {
      return { success: false };
    }
  });

  ipcMain.handle('list-pane-sessions', async () => {
    try {
      const sessions = store.get('paneSessions') || {};
      return { sessions: Object.values(sessions) };
    } catch (err) {
      return { sessions: [] };
    }
  });

  ipcMain.handle('delete-pane-session', async (event, name) => {
    try {
      const sessions = store.get('paneSessions') || {};
      delete sessions[name];
      store.set('paneSessions', sessions);
      return { success: true };
    } catch (err) {
      return { success: false };
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

    // Enforce a strict Content-Security-Policy on the app's own document in production.
    // index.html ships a <meta> CSP that must keep 'unsafe-inline' in script-src so Vite's dev
    // HMR preamble (an inline module script) works. The packaged build has no inline scripts, so
    // here we add a response-header CSP whose script-src omits 'unsafe-inline'. The browser enforces
    // every delivered CSP, so the effective policy is the intersection: inline/injected scripts are
    // blocked in the shipped app.
    //
    // The hook is scoped to ONLY the app's own document URL. The offscreen capture-preview window
    // also runs on defaultSession and loads arbitrary user-chosen http(s) pages for screenshots;
    // applying the app CSP to those would break legitimate remote pages, so they are left untouched.
    if (!isDev) {
      const { pathToFileURL } = require('url');
      const appDocumentUrl = pathToFileURL(
        path.join(__dirname, '../dist/index.html'),
      ).href.toLowerCase();
      const CSP_HEADER = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:* wss://api.elevenlabs.io https://api.elevenlabs.io",
        "media-src 'self' blob:",
      ].join('; ');
      session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const requestUrl = (details.url || '').split('#')[0].split('?')[0].toLowerCase();
        if (details.resourceType !== 'mainFrame' || requestUrl !== appDocumentUrl) {
          callback({ cancel: false });
          return;
        }
        const responseHeaders = { ...(details.responseHeaders || {}) };
        for (const key of Object.keys(responseHeaders)) {
          if (key.toLowerCase() === 'content-security-policy') {
            delete responseHeaders[key];
          }
        }
        responseHeaders['Content-Security-Policy'] = [CSP_HEADER];
        callback({ responseHeaders });
      });
    }

    createWindow();
    createTray();
    registerShortcuts();
    setupIPC();
    // Spawn initial shell with default tab ID
    spawnShell('tab-1');
  } catch (err) {
    console.error('[AudioBash] Startup failed:', err);
    try {
      appLog.error('Startup failed', err);
    } catch (_) {
      /* logger may not be initialized */
    }

    // Still try to show the window so the user sees something
    if (!mainWindow) {
      try {
        createWindow();
      } catch (_) {
        /* last resort */
      }
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
