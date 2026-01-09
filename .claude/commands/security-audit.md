# Security Audit

Perform a comprehensive security audit of AudioBash, focusing on API keys, IPC security, WebSocket authentication, and Electron security configuration.

## Your Role

You are a security auditor reviewing AudioBash for common vulnerabilities and security best practices.

## Audit Categories

### 1. API Key Security

Check for exposed API keys in code:

```bash
# Search for potential API keys in source
grep -rn "sk-" src/ electron/ --include="*.ts" --include="*.tsx" --include="*.js"
grep -rn "AIza" src/ electron/ --include="*.ts" --include="*.tsx" --include="*.js"
grep -rn "key.*:" src/ electron/ --include="*.ts" --include="*.tsx" --include="*.js"

# Check for .env files in repo
git ls-files | grep -E "\.env$|\.env\."
```

**Expected behavior:**
- ✓ API keys stored in Electron's safeStorage
- ✓ Keys never hardcoded in source files
- ✓ `.env` files in `.gitignore`
- ✗ Any hardcoded keys or credentials

### 2. IPC Security Patterns

Review IPC handlers in `electron/main.cjs` and `electron/preload.cjs`:

**Check for:**
- Context isolation enabled
- Node integration disabled in renderer
- Proper IPC whitelisting (no arbitrary channel names)
- Input validation on all IPC handlers
- No shell execution with unsanitized input

**Files to review:**
- `/home/user/audiobash/electron/main.cjs` - IPC handlers
- `/home/user/audiobash/electron/preload.cjs` - Context bridge
- `/home/user/audiobash/vite.config.ts` - Renderer config

**Example secure pattern:**
```javascript
// GOOD: Validated IPC handler
ipcMain.handle('get-api-key', async () => {
  return safeStorage.getPassword('gemini-api-key');
});

// BAD: Arbitrary command execution
ipcMain.handle('run-command', async (event, cmd) => {
  exec(cmd); // ⚠️ DANGEROUS - no validation
});
```

### 3. WebSocket Authentication

Check WebSocket security in agent mode:

**Files to review:**
- Search for WebSocket client code
- Check for authentication headers
- Verify TLS/SSL usage (wss:// not ws://)
- Check for session token validation

```bash
grep -rn "WebSocket\|ws://" src/ --include="*.ts" --include="*.tsx"
```

**Expected behavior:**
- ✓ Uses `wss://` (encrypted) not `ws://`
- ✓ Authentication token sent in headers or first message
- ✓ Validates server certificates
- ✗ Unencrypted WebSocket connections

### 4. Electron Security Settings

Review `electron/main.cjs` BrowserWindow configuration:

**Required settings:**
```javascript
const mainWindow = new BrowserWindow({
  webPreferences: {
    contextIsolation: true,        // ✓ Required
    nodeIntegration: false,         // ✓ Required
    sandbox: true,                  // ✓ Recommended
    webSecurity: true,              // ✓ Required
    allowRunningInsecureContent: false, // ✓ Required
    preload: path.join(__dirname, 'preload.cjs'),
  },
});
```

**Check for dangerous patterns:**
- `nodeIntegration: true` - ⚠️ Enables Node.js in renderer (dangerous)
- `contextIsolation: false` - ⚠️ Allows renderer access to preload context
- `webSecurity: false` - ⚠️ Disables same-origin policy
- `allowRunningInsecureContent: true` - ⚠️ Allows mixed HTTP/HTTPS

### 5. Dependency Vulnerabilities

Run npm audit to check for vulnerable dependencies:

```bash
npm audit --json
```

**Assess severity:**
- Critical: Immediate fix required
- High: Fix in next release
- Moderate: Review and plan fix
- Low: Monitor for updates

### 6. File System Access

Check for file operations that could access sensitive files:

```bash
grep -rn "readFileSync\|writeFileSync\|existsSync" electron/ --include="*.js" --include="*.cjs"
```

**Verify:**
- ✓ File paths are validated/sanitized
- ✓ No access to user home directory without permission
- ✓ Config files stored in app data directory
- ✗ Arbitrary file read/write based on user input

### 7. External Content Loading

Check for loading external resources:

```bash
grep -rn "http://\|https://" src/ electron/ --include="*.ts" --include="*.tsx" --include="*.js"
```

**Verify:**
- ✓ External APIs use HTTPS only
- ✓ Content Security Policy (CSP) configured
- ✓ No inline scripts in HTML
- ✗ Loading scripts from CDNs in Electron app

## Report Format

Provide findings in this format:

```
## Security Audit Report

### ✓ Passed Checks
- API keys stored securely (safeStorage)
- Context isolation enabled
- Node integration disabled
- WebSocket uses TLS (wss://)

### ⚠️ Warnings
- 3 moderate npm vulnerabilities found
  - package-name: CVE-2024-12345 (update available)

### ✗ Critical Issues
- None found

### Recommendations
1. Update vulnerable dependencies: npm audit fix
2. Add Content Security Policy headers
3. Consider sandboxing renderer process

### Risk Level: LOW
```

## Now Execute

Perform the complete security audit following all categories above and provide the detailed report.
