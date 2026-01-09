# Electron Development Patterns

## IPC Security

### Context Bridge Pattern
- **ALWAYS** use `contextBridge` in preload scripts - NEVER enable `nodeIntegration`
- **NEVER** expose raw Node.js modules to renderer
- Define explicit, typed IPC channels in `preload.cjs`

```typescript
// ✅ CORRECT - Expose specific, safe APIs
contextBridge.exposeInMainWorld('electron', {
  sendToTerminal: (text: string) => ipcRenderer.send('send-to-terminal', text),
  onTerminalData: (callback: (data: string) => void) =>
    ipcRenderer.on('terminal-data', (_, data) => callback(data))
});

// ❌ WRONG - Never expose raw IPC or Node modules
contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: ipcRenderer,  // Dangerous!
  require: require           // Dangerous!
});
```

### Channel Naming Convention
- Use namespaced channel names: `module:action`
- Examples: `terminal:write`, `voice:transcribe`, `settings:save`
- Document all channels in `electron/preload.cjs`

## PTY Handling

### Lifecycle Management
- **ALWAYS** clean up PTY processes on window close
- Handle both graceful shutdown and forced termination
- Track PTY instances to prevent leaks

```javascript
// ✅ CORRECT - Proper cleanup
let ptyProcess = null;

function createPty() {
  if (ptyProcess) {
    ptyProcess.kill();
  }
  ptyProcess = pty.spawn(shell, [], options);
  return ptyProcess;
}

app.on('window-all-closed', () => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
  app.quit();
});
```

### Error Handling
- Monitor PTY exit events
- Log PTY errors with structured logging
- Reconnect on unexpected termination with user notification

## Cross-Platform Considerations

### Shell Detection
- **NEVER** hardcode shell paths or names
- Use environment variables for shell detection
- Provide sensible platform-specific defaults

```javascript
// ✅ CORRECT - Cross-platform shell detection
const shell = process.env.SHELL ||
  (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash');

// ❌ WRONG - Platform-specific hardcoding
const shell = 'powershell.exe';  // Breaks on macOS/Linux!
```

### Platform-Specific Commands
- Abstract platform differences behind utilities
- Use `process.platform` checks for platform-specific logic
- Test on all supported platforms (Windows, macOS, Linux)

```javascript
// ✅ CORRECT - Platform-aware command
const clearCommand = process.platform === 'win32' ? 'cls' : 'clear';

// Tab titles
const tabTitle = process.platform === 'darwin' ? 'Terminal' : 'PowerShell';
```

### Path Handling
- Use `path.join()` for cross-platform paths
- Normalize paths with `path.normalize()`
- Handle different path separators automatically

## Structured Logging

### Use logger.cjs Pattern
- Import centralized logger: `const logger = require('./logger.cjs');`
- Use appropriate log levels: `debug`, `info`, `warn`, `error`
- Include context in log messages

```javascript
// ✅ CORRECT - Structured logging
logger.info('PTY spawned', {
  shell,
  platform: process.platform,
  pid: ptyProcess.pid
});

logger.error('PTY spawn failed', {
  error: err.message,
  stack: err.stack
});

// ❌ WRONG - Console logging
console.log('PTY spawned');  // No context, not structured
```

### Log Levels
- `debug` - Verbose development info (IPC calls, state changes)
- `info` - Important events (PTY spawn, window creation)
- `warn` - Recoverable issues (failed reconnect, deprecated APIs)
- `error` - Critical failures (PTY crash, IPC errors)

## State Management

### localStorage vs IPC Sync

**localStorage** - Use for renderer-only state:
- UI preferences (theme, font size)
- Transient state (scroll position, tab selection)
- Non-sensitive data

**IPC Sync** - Use for cross-process state:
- API keys (with safeStorage encryption)
- Application settings
- Data needed in main process

```typescript
// ✅ localStorage for UI state
const saveUiPreferences = () => {
  localStorage.setItem('fontSize', fontSize.toString());
  localStorage.setItem('theme', currentTheme);
};

// ✅ IPC for app settings
const saveApiKey = async (key: string) => {
  await window.electron.saveEncryptedKey('gemini-api-key', key);
};
```

### State Synchronization
- Avoid duplicating state between main and renderer
- Use IPC events to sync state changes
- Implement debouncing for frequent updates

## Window Management

### Frameless Windows
- Implement custom title bar with window controls
- Handle draggable regions with `-webkit-app-region: drag`
- Prevent drag on interactive elements

```css
/* ✅ CORRECT - Draggable title bar */
.title-bar {
  -webkit-app-region: drag;
}

.title-bar button {
  -webkit-app-region: no-drag;  /* Buttons remain clickable */
}
```

### Global Shortcuts
- Register shortcuts in main process
- Check for conflicts with system shortcuts
- Provide user-configurable shortcuts
- Always unregister on app quit

```javascript
// ✅ CORRECT - Proper shortcut management
const { globalShortcut } = require('electron');

app.on('ready', () => {
  globalShortcut.register('Alt+H', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
```

## Build Configuration

### electron-builder Settings
- Configure per-platform builds in `package.json`
- Include native modules (node-pty) in build
- Set appropriate app metadata (name, version, author)

### Native Module Rebuilding
- Always rebuild native modules for Electron target
- Document rebuild steps in README
- Handle arm64 vs x64 architectures

```bash
# Rebuild for current platform
npm rebuild node-pty

# Rebuild for Electron
npm exec electron-rebuild
```

## Performance

### IPC Optimization
- Batch frequent IPC messages
- Use `ipcRenderer.invoke()` for request-response patterns
- Avoid sending large payloads through IPC

### Memory Management
- Remove event listeners when components unmount
- Monitor memory usage with Electron DevTools
- Profile with `--inspect` flag in development

## Error Recovery

### Graceful Degradation
- Handle PTY failures with fallback UI
- Show error messages to user, not just console
- Provide retry mechanisms for transient failures

### Crash Reporting
- Log errors to file in production builds
- Include relevant context (platform, versions, state)
- Never expose sensitive data in crash reports
