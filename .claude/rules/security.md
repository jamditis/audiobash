# Security Rules

## API Key Handling

### Use safeStorage for Encryption
- **NEVER** store API keys in plain text
- **ALWAYS** use Electron's `safeStorage` API
- Store encrypted keys in app data directory
- Handle encryption failures gracefully

```javascript
// ✅ CORRECT - Encrypted storage
const { safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

function saveApiKey(key) {
  const keyPath = path.join(app.getPath('userData'), 'api-key.enc');

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this system');
  }

  const encryptedKey = safeStorage.encryptString(key);
  fs.writeFileSync(keyPath, encryptedKey);
}

function loadApiKey() {
  const keyPath = path.join(app.getPath('userData'), 'api-key.enc');

  if (!fs.existsSync(keyPath)) {
    return null;
  }

  const encryptedKey = fs.readFileSync(keyPath);
  return safeStorage.decryptString(encryptedKey);
}

// ❌ WRONG - Plain text storage
function saveApiKey(key) {
  fs.writeFileSync('api-key.txt', key);  // Insecure!
  localStorage.setItem('apiKey', key);   // Exposed to renderer!
}
```

### API Key Best Practices
- Never log API keys
- Never expose keys in error messages
- Clear keys from memory after use
- Validate key format before storage
- Allow users to update/delete keys

```javascript
// ✅ CORRECT - Safe error handling
try {
  const response = await callGeminiAPI(apiKey);
} catch (err) {
  logger.error('API call failed', { error: err.message });  // Don't log the key!
}

// ❌ WRONG - Leaking keys
catch (err) {
  console.error('Failed with key:', apiKey, err);  // Key exposed in logs!
}
```

### Key Rotation
- Support updating API keys without restart
- Validate new keys before replacing old ones
- Provide UI feedback for invalid keys

## WebSocket Security

### Rate Limiting
- Implement rate limiting for WebSocket messages
- Prevent abuse and DoS attacks
- Use token bucket or sliding window algorithm

```javascript
// ✅ CORRECT - Rate limiting
class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  checkLimit() {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      return false;  // Rate limit exceeded
    }

    this.requests.push(now);
    return true;
  }
}

const voiceRateLimiter = new RateLimiter(10, 60000);  // 10 requests per minute

function handleVoiceInput(audioBlob) {
  if (!voiceRateLimiter.checkLimit()) {
    throw new Error('Rate limit exceeded. Please wait before trying again.');
  }

  return transcribeAudio(audioBlob);
}
```

### Connection Security
- Validate WebSocket origins
- Use secure WebSocket (wss://) in production
- Implement authentication tokens
- Handle connection errors gracefully

### Message Validation
- Validate all incoming messages
- Reject malformed or oversized messages
- Sanitize message content

```javascript
// ✅ CORRECT - Input validation
function handleWebSocketMessage(message) {
  if (typeof message !== 'string') {
    throw new Error('Invalid message type');
  }

  if (message.length > 10000) {
    throw new Error('Message too large');
  }

  let data;
  try {
    data = JSON.parse(message);
  } catch (err) {
    throw new Error('Invalid JSON');
  }

  // Further validation...
}
```

## Input Validation

### Terminal Input Sanitization
- Validate input before sending to PTY
- Prevent command injection
- Escape special characters

```javascript
// ✅ CORRECT - Input validation
function sendToTerminal(input) {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }

  if (input.length > 10000) {
    throw new Error('Input too long');
  }

  // Additional platform-specific validation
  if (process.platform === 'win32') {
    // Windows-specific checks
  }

  ptyProcess.write(input + '\r');
}

// ❌ WRONG - No validation
function sendToTerminal(input) {
  ptyProcess.write(input + '\r');  // Accepts anything!
}
```

### File Path Validation
- Validate file paths to prevent directory traversal
- Use path normalization
- Restrict access to app data directory only

```javascript
const path = require('path');

// ✅ CORRECT - Path validation
function readUserFile(filename) {
  const userDataPath = app.getPath('userData');
  const filePath = path.join(userDataPath, filename);

  // Ensure resolved path is within userData directory
  if (!filePath.startsWith(userDataPath)) {
    throw new Error('Invalid file path');
  }

  return fs.readFileSync(filePath);
}

// ❌ WRONG - Directory traversal vulnerability
function readUserFile(filename) {
  return fs.readFileSync(filename);  // Can access any file!
}
```

### Audio Blob Validation
- Validate MIME type
- Check blob size limits
- Verify audio format

```typescript
// ✅ CORRECT - Blob validation
async function validateAudioBlob(blob: Blob): Promise<void> {
  const MAX_SIZE = 10 * 1024 * 1024;  // 10MB
  const ALLOWED_TYPES = ['audio/webm', 'audio/ogg', 'audio/wav'];

  if (!ALLOWED_TYPES.includes(blob.type)) {
    throw new Error(`Invalid audio type: ${blob.type}`);
  }

  if (blob.size > MAX_SIZE) {
    throw new Error('Audio file too large');
  }

  if (blob.size === 0) {
    throw new Error('Empty audio file');
  }
}

async function transcribeAudio(blob: Blob) {
  await validateAudioBlob(blob);
  // Proceed with transcription...
}
```

## XSS Prevention

### Content Security Policy
- Implement strict CSP headers
- Disallow inline scripts and styles
- Restrict external resource loading

```javascript
// ✅ CORRECT - Strict CSP
const session = require('electron').session;

app.on('ready', () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",  // For styled-components
          "img-src 'self' data:",
          "font-src 'self' data:",
          "connect-src 'self' https://generativelanguage.googleapis.com"
        ].join('; ')
      }
    });
  });
});
```

### Sanitize HTML Output
- Never use `dangerouslySetInnerHTML` without sanitization
- Use DOMPurify for HTML sanitization
- Prefer React components over raw HTML

```tsx
import DOMPurify from 'dompurify';

// ✅ CORRECT - Sanitized HTML
function SafeHtml({ html }: { html: string }) {
  const clean = DOMPurify.sanitize(html);
  return <div dangerouslySetInnerHTML={{ __html: clean }} />;
}

// ❌ WRONG - Unsanitized HTML
function UnsafeHtml({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;  // XSS risk!
}
```

### Terminal Output Sanitization
- xterm.js handles most terminal escape sequences safely
- Be cautious with ANSI escape codes from untrusted sources
- Limit terminal buffer size to prevent memory exhaustion

```typescript
// ✅ CORRECT - Safe terminal configuration
const terminal = new Terminal({
  scrollback: 1000,          // Limit history
  allowProposedApi: false,   // Disable experimental APIs
  allowTransparency: true
});

// Validate data before writing
ptyProcess.onData((data: string) => {
  if (data.length > 100000) {
    logger.warn('Truncating large terminal output');
    data = data.substring(0, 100000);
  }
  terminal.write(data);
});
```

## Network Security

### HTTPS Enforcement
- Use HTTPS for all external API calls
- Reject HTTP connections in production
- Validate SSL certificates

```javascript
// ✅ CORRECT - HTTPS only
const https = require('https');

async function callGeminiAPI(apiKey, data) {
  const options = {
    hostname: 'generativelanguage.googleapis.com',
    port: 443,
    path: '/v1beta/models/gemini-pro:generateContent',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    // Enforce certificate validation
    rejectUnauthorized: true
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      // Handle response...
    });

    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}
```

### Certificate Pinning (Advanced)
- Consider certificate pinning for critical APIs
- Handle certificate rotation gracefully

## Data Privacy

### Local Data Only
- AudioBash processes all data locally except transcription
- Never send terminal output to external servers
- Document data flow in privacy policy

### Temporary Data Cleanup
- Delete audio recordings after transcription
- Clear sensitive data from memory
- Clean up temporary files on exit

```javascript
// ✅ CORRECT - Cleanup on exit
app.on('before-quit', () => {
  // Clear sensitive data
  if (apiKey) {
    apiKey = null;
  }

  // Delete temp files
  const tempDir = path.join(app.getPath('temp'), 'audiobash');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});
```

### User Consent
- Ask permission before sending audio to Gemini API
- Display privacy information in settings
- Allow users to opt out of features

## Electron Security Checklist

### Main Process
- ✅ `nodeIntegration: false` in BrowserWindow
- ✅ `contextIsolation: true` in BrowserWindow
- ✅ Use `contextBridge` for IPC
- ✅ Validate all IPC messages
- ✅ Enable `sandbox: true` where possible
- ✅ Disable `webSecurity: false` (never disable in production)

```javascript
// ✅ CORRECT - Secure BrowserWindow
const mainWindow = new BrowserWindow({
  width: 1200,
  height: 800,
  webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    nodeIntegration: false,      // Critical!
    contextIsolation: true,      // Critical!
    sandbox: true,               // Recommended
    webSecurity: true,           // Never disable
    allowRunningInsecureContent: false,
    experimentalFeatures: false
  }
});

// ❌ WRONG - Insecure configuration
const mainWindow = new BrowserWindow({
  webPreferences: {
    nodeIntegration: true,       // Dangerous!
    contextIsolation: false,     // Dangerous!
    webSecurity: false          // Dangerous!
  }
});
```

### Renderer Process
- ✅ No direct access to Node.js APIs
- ✅ All native functionality via IPC
- ✅ Validate all user input
- ✅ Use React for XSS protection
- ✅ Implement CSP headers

## Dependency Security

### Regular Audits
```bash
# Run security audit regularly
npm audit

# Fix vulnerabilities automatically
npm audit fix

# Review high-severity issues manually
npm audit --audit-level=high
```

### Dependency Best Practices
- Keep dependencies up to date
- Review security advisories
- Use `npm ci` for reproducible builds
- Lock dependency versions with package-lock.json
- Audit new dependencies before adding

### Minimize Attack Surface
- Only install necessary dependencies
- Remove unused dependencies
- Prefer well-maintained packages
- Check package download stats and GitHub activity

## Logging Security

### Safe Logging Practices
- Never log sensitive data (API keys, user input, passwords)
- Sanitize logs before writing
- Rotate log files to prevent disk exhaustion
- Restrict log file permissions

```javascript
// ✅ CORRECT - Safe logging
logger.info('Transcription completed', {
  duration: transcriptionMs,
  textLength: result.text.length  // Don't log actual text!
});

logger.error('API call failed', {
  error: err.message,
  statusCode: err.statusCode
  // Don't log API key!
});

// ❌ WRONG - Leaking sensitive data
logger.info('Transcription:', { text: result.text });  // Might contain sensitive commands
logger.error('API failed:', { apiKey, error: err });   // Leaking API key!
```

### Production vs Development Logging
- More verbose logging in development
- Minimal, sanitized logging in production
- Use log levels appropriately

```javascript
if (process.env.NODE_ENV === 'development') {
  logger.debug('PTY input:', input);  // OK in dev
} else {
  logger.debug('PTY input received');  // No sensitive data in prod
}
```

## Incident Response

### Error Handling
- Catch and handle all errors gracefully
- Show user-friendly error messages
- Log technical details for debugging
- Never expose stack traces to users

### Update Mechanism
- Implement automatic updates for security patches
- Use `electron-updater` with code signing
- Verify update signatures
- Test updates before releasing

### Security Disclosures
- Provide security contact in README
- Respond to security reports promptly
- Release patches for vulnerabilities quickly
- Document security issues in release notes
