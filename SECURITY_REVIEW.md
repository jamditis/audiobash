# AudioBash Security Review

**Date:** 2026-01-08
**Reviewer:** Claude Code Security Review
**Branch:** claude/security-code-review-sdU7I

---

## Executive Summary

AudioBash is an Electron-based voice-controlled terminal application. This security review identified several areas of concern, mostly at LOW to MEDIUM severity. The codebase follows many Electron security best practices but has room for improvement in secrets management and network security.

**Overall Risk Assessment:** MEDIUM

---

## Findings Summary

| ID | Severity | Category | Issue |
|----|----------|----------|-------|
| SEC-001 | MEDIUM | Secrets | API keys stored in plain text files |
| SEC-002 | MEDIUM | Network | WebSocket server binds to all interfaces |
| SEC-003 | LOW | Secrets | Remote access password stored in plain text |
| SEC-004 | LOW | Crypto | Remote password entropy reduced by uppercasing |
| SEC-005 | MODERATE | Dependency | Electron vulnerability (GHSA-vmqv-hx8q-j7mg) |
| SEC-006 | LOW | Browser API | dangerouslyAllowBrowser flag in AI SDKs |
| SEC-007 | INFO | Design | Voice commands execute without confirmation |

---

## Positive Security Findings

The codebase implements several security best practices:

1. **Electron Security Configuration** (`electron/main.cjs:111-114`)
   - `contextIsolation: true` - Prevents renderer from accessing Node.js directly
   - `nodeIntegration: false` - Disables Node.js in renderer process
   - Proper use of `contextBridge` for IPC communication

2. **WebSocket Authentication** (`electron/websocket-server.cjs`)
   - Rate limiting for failed authentication attempts (5 attempts, 15-minute lockout)
   - Exponential backoff delay on failed attempts
   - Session-based authentication with pairing codes
   - Audio buffer limits to prevent DoS (50MB max)
   - Audio session timeout (30 seconds)
   - Inactivity timeout for connections (5 minutes)

3. **XSS Prevention**
   - React components use JSX which auto-escapes content
   - No use of `dangerouslySetInnerHTML`
   - Terminal uses xterm.js which has built-in sanitization

4. **Input Validation**
   - File path validation in `watch-file` handler (`main.cjs:812-818`)
   - Directory existence checks before operations
   - Path traversal prevention in screenshot capture (`main.cjs:1107-1108`)

---

## Detailed Findings

### SEC-001: API Keys Stored in Plain Text Files (MEDIUM)

**Location:** `electron/main.cjs:779-807`

**Description:**
API keys for Gemini, OpenAI, Anthropic, and ElevenLabs are stored as plain text files in the user's app data directory (e.g., `api-key-gemini.txt`).

**Impact:**
- Any process with read access to the user's profile can read these keys
- Malware or other applications could exfiltrate API keys
- Keys may be exposed in backups or file sync services

**Current Code:**
```javascript
ipcMain.handle('get-api-key', async (_, provider = 'gemini') => {
  const keyPath = path.join(app.getPath('userData'), `api-key-${provider}.txt`);
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf8').trim();
  }
  return '';
});
```

**Recommendation:**
Use the OS credential store via packages like `keytar` or use `safeStorage` from Electron:

```javascript
const { safeStorage } = require('electron');

// Encrypt before storing
if (safeStorage.isEncryptionAvailable()) {
  const encrypted = safeStorage.encryptString(apiKey);
  fs.writeFileSync(keyPath, encrypted);
}

// Decrypt when reading
const encrypted = fs.readFileSync(keyPath);
const apiKey = safeStorage.decryptString(encrypted);
```

---

### SEC-002: WebSocket Server Binds to All Interfaces (MEDIUM)

**Location:** `electron/websocket-server.cjs:239`

**Description:**
The WebSocket server for remote control binds to all network interfaces (0.0.0.0) by default. While authentication is required, this exposes the service to the local network.

**Impact:**
- Any device on the same network can attempt connections
- Increases attack surface for brute-force attempts against pairing codes

**Current Code:**
```javascript
this.wss = new WebSocketServer({ port: this.port });
```

**Recommendation:**
Consider adding a configuration option to restrict binding to localhost only when remote access is not needed:

```javascript
this.wss = new WebSocketServer({
  port: this.port,
  host: this.allowRemote ? '0.0.0.0' : '127.0.0.1'
});
```

---

### SEC-003: Remote Access Password Stored in Plain Text (LOW)

**Location:** `electron/main.cjs:896`, `electron/websocket-server.cjs:94-101`

**Description:**
The static password for remote access is stored in the app-store.json file without encryption.

**Impact:**
- Password could be read by other applications or users
- Less severe since it requires local file access

**Recommendation:**
Encrypt the password using Electron's `safeStorage` API before storing.

---

### SEC-004: Remote Password Entropy Reduced (LOW)

**Location:** `electron/websocket-server.cjs:458-459`

**Description:**
Remote passwords are compared case-insensitively after uppercasing, which reduces entropy.

**Current Code:**
```javascript
const codeUpper = pairingCode?.toUpperCase();
const matchesStaticPassword = this.staticPassword && codeUpper === this.staticPassword.toUpperCase();
```

**Impact:**
- Reduces password search space (26 characters instead of 52 for letters)
- Makes brute-force slightly easier

**Recommendation:**
Consider case-sensitive password comparison for the static password while keeping pairing codes case-insensitive for user convenience.

---

### SEC-005: Electron Vulnerability GHSA-vmqv-hx8q-j7mg (MODERATE)

**Location:** `package.json:45` (electron: ^33.4.11)

**Description:**
The installed Electron version has a known ASAR integrity bypass vulnerability that allows resource modification.

**CVE Details:**
- **CVSS Score:** 6.1 (Moderate)
- **CWE:** CWE-94 (Code Injection), CWE-829 (Inclusion of Functionality from Untrusted Control Sphere)
- **Fixed in:** Electron 35.7.5+

**Recommendation:**
Update Electron to version 35.7.5 or later:

```bash
npm install electron@latest
```

---

### SEC-006: dangerouslyAllowBrowser Flag in AI SDKs (LOW)

**Location:** `src/services/transcriptionService.ts:255, 263`

**Description:**
The OpenAI and Anthropic SDKs are initialized with `dangerouslyAllowBrowser: true`, which is typically discouraged.

**Current Code:**
```typescript
this.openai = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
this.anthropic = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
```

**Impact:**
- In a typical browser environment, this would expose API keys to the frontend
- In Electron with proper context isolation, this is less of a concern since the app is not served from a public URL

**Recommendation:**
Consider moving API calls to the main process and using IPC to communicate results, which would allow removing this flag.

---

### SEC-007: Voice Commands Execute Without Confirmation (INFORMATIONAL)

**Location:** `src/App.tsx:298-317`

**Description:**
When auto-send is enabled (default), voice transcriptions are sent directly to the terminal and executed without user confirmation.

**Impact:**
- Transcription errors could execute unintended commands
- Malicious audio (if somehow injected) could execute harmful commands
- This is a design choice, not a bug

**Current Mitigations:**
- User can disable auto-send in settings
- Raw mode is available for non-command input
- Users are made aware through onboarding

**Recommendation:**
Consider adding a "preview before execute" mode that shows the transcribed command and requires Enter to confirm.

---

## Dependency Audit Summary

```
Vulnerabilities Found: 1 moderate
Total Dependencies: 700

Affected Package: electron
Severity: moderate
Advisory: GHSA-vmqv-hx8q-j7mg
Fix Available: electron@35.7.5+
```

---

## Recommendations Priority

### High Priority
1. Update Electron to 35.7.5+ to fix ASAR integrity bypass
2. Implement encrypted storage for API keys using `safeStorage`

### Medium Priority
3. Add option to bind WebSocket server to localhost only
4. Encrypt remote access password before storage

### Low Priority
5. Consider case-sensitive password comparison for static passwords
6. Move API calls to main process to remove dangerouslyAllowBrowser
7. Consider adding command preview/confirmation mode

---

## Testing Recommendations

1. **Penetration Testing:** Test WebSocket authentication bypass attempts
2. **Fuzzing:** Test voice transcription with malformed audio data
3. **Credential Scanning:** Ensure API keys are not logged or exposed
4. **Dependency Monitoring:** Set up automated dependency vulnerability scanning (e.g., Dependabot)

---

## Conclusion

AudioBash demonstrates good security practices in its Electron configuration and WebSocket authentication. The main areas for improvement are secrets management (using encrypted storage) and updating the Electron dependency to patch the known vulnerability. None of the findings represent critical or high-severity vulnerabilities that would require immediate action, but addressing them would improve the overall security posture of the application.
