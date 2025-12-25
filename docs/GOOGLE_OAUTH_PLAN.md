# Google OAuth Implementation Plan for AudioBash

> Goal: Allow users to sign in with their Google account instead of manually entering API keys

## Executive Summary

**Feasibility**: ✅ Fully possible with Google Gemini API
**Complexity**: Medium (1-2 days)
**Key Challenge**: The `@google/generative-ai` SDK only supports API keys, so we need to use the REST API with OAuth Bearer tokens

---

## Key Findings from Research

### What's Supported

| Feature | API Key | OAuth Token |
|---------|---------|-------------|
| Gemini SDK (`@google/generative-ai`) | ✅ Yes | ❌ No |
| Gemini REST API | ✅ Yes | ✅ Yes (Bearer token) |
| Model tuning | ❌ No | ✅ Required |
| Semantic retrieval | ❌ No | ✅ Required |

### OAuth Flow for Desktop Apps

Google requires:
1. **PKCE flow** (Proof Key for Code Exchange) - mandatory for OAuth 2.1
2. **Loopback redirect** (`http://127.0.0.1:<port>/callback`)
3. **System browser** (not embedded WebView)

---

## Architecture

### Current Flow (API Key)
```
User → Copy API key from Google AI Studio → Paste in Settings → Store in file → Use with SDK
```

### New Flow (OAuth)
```
User → Click "Sign in with Google" → Browser opens → User consents
    → Redirect to localhost → Exchange code for tokens
    → Store tokens securely → Use with REST API
```

---

## Implementation Plan

### Phase 1: OAuth Infrastructure (Main Process)

#### 1.1 Create `electron/auth/googleOAuth.cjs`

```javascript
const { shell } = require('electron');
const http = require('http');
const crypto = require('crypto');
const { safeStorage } = require('electron');
const Store = require('electron-store');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

// Scopes needed for Gemini API
const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/generative-language.retriever'
];

class GoogleOAuth {
  constructor(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.store = new Store({ name: 'oauth-tokens' });
    this.server = null;
  }

  // Generate PKCE code verifier and challenge
  generatePKCE() {
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    return { verifier, challenge };
  }

  // Start OAuth flow
  async startAuthFlow() {
    return new Promise((resolve, reject) => {
      // Start local server
      this.server = http.createServer();
      this.server.listen(0, '127.0.0.1');
      const port = this.server.address().port;
      const redirectUri = `http://127.0.0.1:${port}/callback`;

      // Generate PKCE
      const { verifier, challenge } = this.generatePKCE();
      const state = crypto.randomBytes(16).toString('hex');

      // Build auth URL
      const params = new URLSearchParams({
        client_id: this.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: state
      });

      const authUrl = `${GOOGLE_AUTH_URL}?${params}`;

      // Open system browser
      shell.openExternal(authUrl);

      // Handle callback
      const timeout = setTimeout(() => {
        this.server.close();
        reject(new Error('OAuth timeout (5 minutes)'));
      }, 5 * 60 * 1000);

      this.server.on('request', async (req, res) => {
        const url = new URL(req.url, `http://localhost:${port}`);

        if (url.pathname !== '/callback') {
          res.writeHead(404);
          res.end();
          return;
        }

        const code = url.searchParams.get('code');
        const returnedState = url.searchParams.get('state');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.errorPage(error));
          clearTimeout(timeout);
          this.server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (returnedState !== state) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.errorPage('State mismatch'));
          clearTimeout(timeout);
          this.server.close();
          reject(new Error('State mismatch - possible CSRF attack'));
          return;
        }

        try {
          // Exchange code for tokens
          const tokens = await this.exchangeCodeForTokens(code, redirectUri, verifier);

          // Store tokens securely
          await this.storeTokens(tokens);

          // Get user info
          const userInfo = await this.getUserInfo(tokens.access_token);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.successPage(userInfo.name));

          clearTimeout(timeout);
          this.server.close();
          resolve({ tokens, userInfo });

        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(this.errorPage(err.message));
          clearTimeout(timeout);
          this.server.close();
          reject(err);
        }
      });
    });
  }

  // Exchange authorization code for tokens
  async exchangeCodeForTokens(code, redirectUri, codeVerifier) {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error_description || 'Token exchange failed');
    }

    return response.json();
  }

  // Refresh access token
  async refreshAccessToken() {
    const refreshToken = await this.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });

    if (!response.ok) {
      // Refresh token expired or revoked
      await this.clearTokens();
      throw new Error('Session expired - please sign in again');
    }

    const tokens = await response.json();
    await this.storeAccessToken(tokens.access_token, tokens.expires_in);

    return tokens.access_token;
  }

  // Get user info from Google
  async getUserInfo(accessToken) {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    return response.json();
  }

  // Store tokens securely using safeStorage
  async storeTokens(tokens) {
    if (tokens.refresh_token) {
      await this.storeRefreshToken(tokens.refresh_token);
    }
    await this.storeAccessToken(tokens.access_token, tokens.expires_in);
  }

  async storeRefreshToken(token) {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(token);
      this.store.set('google.refreshToken', encrypted.toString('base64'));
      this.store.set('google.refreshTokenEncrypted', true);
    } else {
      console.warn('[OAuth] Secure storage unavailable - token stored with reduced security');
      this.store.set('google.refreshToken', token);
      this.store.set('google.refreshTokenEncrypted', false);
    }
  }

  async storeAccessToken(token, expiresIn) {
    const expiresAt = Date.now() + (expiresIn * 1000);
    this.store.set('google.accessToken', token);
    this.store.set('google.accessTokenExpiresAt', expiresAt);
  }

  async getRefreshToken() {
    const stored = this.store.get('google.refreshToken');
    if (!stored) return null;

    const isEncrypted = this.store.get('google.refreshTokenEncrypted', true);
    if (isEncrypted && safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(stored, 'base64');
        return safeStorage.decryptString(buffer);
      } catch {
        return null;
      }
    }
    return stored;
  }

  async getValidAccessToken() {
    const accessToken = this.store.get('google.accessToken');
    const expiresAt = this.store.get('google.accessTokenExpiresAt');

    // Check if token exists and is still valid (with 60s buffer)
    if (accessToken && expiresAt && Date.now() < expiresAt - 60000) {
      return accessToken;
    }

    // Try to refresh
    return this.refreshAccessToken();
  }

  async isAuthenticated() {
    const refreshToken = await this.getRefreshToken();
    return !!refreshToken;
  }

  async clearTokens() {
    this.store.delete('google.refreshToken');
    this.store.delete('google.refreshTokenEncrypted');
    this.store.delete('google.accessToken');
    this.store.delete('google.accessTokenExpiresAt');
    this.store.delete('google.userInfo');
  }

  async storeUserInfo(userInfo) {
    this.store.set('google.userInfo', userInfo);
  }

  getUserInfoCached() {
    return this.store.get('google.userInfo');
  }

  successPage(name) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Successful</title>
        <style>
          body { font-family: -apple-system, sans-serif; text-align: center; padding: 50px; background: #0a0a0a; color: #fff; }
          h1 { color: #33ff33; }
        </style>
      </head>
      <body>
        <h1>✓ Signed in as ${name}</h1>
        <p>You can close this window and return to AudioBash.</p>
      </body>
      </html>
    `;
  }

  errorPage(error) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authentication Failed</title>
        <style>
          body { font-family: -apple-system, sans-serif; text-align: center; padding: 50px; background: #0a0a0a; color: #fff; }
          h1 { color: #ff3333; }
        </style>
      </head>
      <body>
        <h1>✗ Authentication Failed</h1>
        <p>${error}</p>
        <p>Please close this window and try again.</p>
      </body>
      </html>
    `;
  }
}

module.exports = { GoogleOAuth };
```

#### 1.2 Create OAuth Config

Create `oauth-config.json` in project root (add to `.gitignore`):
```json
{
  "google": {
    "clientId": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "clientSecret": "YOUR_CLIENT_SECRET"
  }
}
```

---

### Phase 2: IPC Handlers (Main Process)

#### 2.1 Update `electron/main.cjs`

Add at top:
```javascript
const { GoogleOAuth } = require('./auth/googleOAuth.cjs');

// Load OAuth config
let googleOAuth = null;
try {
  const oauthConfig = require('../oauth-config.json');
  if (oauthConfig.google?.clientId) {
    googleOAuth = new GoogleOAuth(
      oauthConfig.google.clientId,
      oauthConfig.google.clientSecret
    );
  }
} catch {
  console.log('[OAuth] No oauth-config.json found - OAuth disabled');
}
```

Add IPC handlers:
```javascript
// Google OAuth handlers
ipcMain.handle('google-oauth-start', async () => {
  if (!googleOAuth) {
    return { success: false, error: 'OAuth not configured' };
  }
  try {
    const result = await googleOAuth.startAuthFlow();
    await googleOAuth.storeUserInfo(result.userInfo);
    return { success: true, userInfo: result.userInfo };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('google-oauth-get-token', async () => {
  if (!googleOAuth) {
    return { success: false, error: 'OAuth not configured' };
  }
  try {
    const token = await googleOAuth.getValidAccessToken();
    return { success: true, token };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('google-oauth-get-user', async () => {
  if (!googleOAuth) {
    return { success: false, error: 'OAuth not configured' };
  }
  const isAuth = await googleOAuth.isAuthenticated();
  if (!isAuth) {
    return { success: false, error: 'Not authenticated' };
  }
  const userInfo = googleOAuth.getUserInfoCached();
  return { success: true, userInfo };
});

ipcMain.handle('google-oauth-sign-out', async () => {
  if (!googleOAuth) {
    return { success: false, error: 'OAuth not configured' };
  }
  await googleOAuth.clearTokens();
  return { success: true };
});

ipcMain.handle('google-oauth-available', async () => {
  return { available: !!googleOAuth };
});
```

#### 2.2 Update `electron/preload.cjs`

Add OAuth methods:
```javascript
// Google OAuth
googleOAuthStart: () => ipcRenderer.invoke('google-oauth-start'),
googleOAuthGetToken: () => ipcRenderer.invoke('google-oauth-get-token'),
googleOAuthGetUser: () => ipcRenderer.invoke('google-oauth-get-user'),
googleOAuthSignOut: () => ipcRenderer.invoke('google-oauth-sign-out'),
googleOAuthAvailable: () => ipcRenderer.invoke('google-oauth-available'),
```

---

### Phase 3: Gemini REST API Integration

#### 3.1 Update `src/services/transcriptionService.ts`

Add OAuth token support:
```typescript
private oauthToken: string | null = null;
private useOAuth: boolean = false;

public setOAuthToken(token: string) {
  this.oauthToken = token;
  this.useOAuth = true;
}

public clearOAuth() {
  this.oauthToken = null;
  this.useOAuth = false;
}

// New method for OAuth-based Gemini calls
private async transcribeWithGeminiOAuth(
  audioBlob: Blob,
  mode: TranscriptionMode,
  modelId: ModelId,
  durationMs: number
): Promise<TranscribeResult> {
  if (!this.oauthToken) {
    throw new Error('Not authenticated with Google');
  }

  const base64Audio = await blobToBase64(audioBlob);
  const prompt = mode === 'agent' ? this.buildAgentPrompt() : this.buildRawPrompt();

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inline_data: {
            mime_type: 'audio/webm',
            data: base64Audio
          }
        }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024
    }
  };

  const modelName = modelId === 'gemini-2.5-flash' ? 'gemini-2.5-flash' : 'gemini-2.0-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.oauthToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('OAuth token expired - please sign in again');
    }
    const error = await response.json();
    throw new Error(error.error?.message || 'Gemini API error');
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const cost = this.calculateCost(durationMs, 'gemini');

  return { text: text.trim(), cost };
}
```

Update `transcribeWithGemini` to check for OAuth:
```typescript
private async transcribeWithGemini(...): Promise<TranscribeResult> {
  // If OAuth is enabled, use REST API
  if (this.useOAuth && this.oauthToken) {
    return this.transcribeWithGeminiOAuth(audioBlob, mode, modelId, durationMs);
  }

  // Otherwise use SDK with API key
  // ... existing implementation
}
```

---

### Phase 4: Settings UI

#### 4.1 Update `src/components/Settings.tsx`

Add state and handlers:
```typescript
// OAuth state
const [oauthAvailable, setOauthAvailable] = useState(false);
const [googleUser, setGoogleUser] = useState<{
  email: string;
  name: string;
  picture: string;
} | null>(null);
const [oauthLoading, setOauthLoading] = useState(false);
const [oauthError, setOauthError] = useState<string | null>(null);

// Check OAuth availability on mount
useEffect(() => {
  const checkOAuth = async () => {
    const result = await window.electron?.googleOAuthAvailable();
    setOauthAvailable(result?.available || false);

    if (result?.available) {
      const userResult = await window.electron?.googleOAuthGetUser();
      if (userResult?.success) {
        setGoogleUser(userResult.userInfo);
      }
    }
  };
  checkOAuth();
}, []);

const handleGoogleSignIn = async () => {
  setOauthLoading(true);
  setOauthError(null);
  try {
    const result = await window.electron?.googleOAuthStart();
    if (result?.success) {
      setGoogleUser(result.userInfo);
    } else {
      setOauthError(result?.error || 'Sign in failed');
    }
  } catch (err: any) {
    setOauthError(err.message);
  }
  setOauthLoading(false);
};

const handleGoogleSignOut = async () => {
  await window.electron?.googleOAuthSignOut();
  setGoogleUser(null);
};
```

Add UI in the Gemini section:
```tsx
{/* Google Authentication */}
<div className="space-y-3">
  <label className="block text-[10px] text-crt-white/50 font-mono uppercase">
    Google Account
  </label>

  {oauthAvailable ? (
    googleUser ? (
      <div className="flex items-center justify-between p-3 bg-void-200 rounded border border-void-300">
        <div className="flex items-center gap-3">
          <img
            src={googleUser.picture}
            alt=""
            className="w-8 h-8 rounded-full"
          />
          <div>
            <div className="text-xs font-mono text-crt-white">
              {googleUser.name}
            </div>
            <div className="text-[10px] text-crt-white/50">
              {googleUser.email}
            </div>
          </div>
        </div>
        <button
          onClick={handleGoogleSignOut}
          className="text-[10px] text-accent hover:underline"
        >
          Sign out
        </button>
      </div>
    ) : (
      <button
        onClick={handleGoogleSignIn}
        disabled={oauthLoading}
        className="w-full flex items-center justify-center gap-2 p-3 bg-white hover:bg-gray-100 rounded border border-void-300 transition-colors disabled:opacity-50"
      >
        <GoogleLogo />
        <span className="text-sm font-medium text-gray-800">
          {oauthLoading ? 'Signing in...' : 'Sign in with Google'}
        </span>
      </button>
    )
  ) : (
    <div className="p-3 bg-void-200 rounded border border-void-300">
      <p className="text-[10px] text-crt-white/50">
        OAuth not configured. Use API key below.
      </p>
    </div>
  )}

  {oauthError && (
    <p className="text-[10px] text-accent">{oauthError}</p>
  )}

  {/* Divider */}
  <div className="relative py-2">
    <div className="absolute inset-0 flex items-center">
      <div className="w-full border-t border-void-300"></div>
    </div>
    <div className="relative flex justify-center">
      <span className="bg-void-100 px-2 text-[9px] text-crt-white/30 uppercase">
        Or use API key
      </span>
    </div>
  </div>

  {/* Existing API key input */}
  ...
</div>
```

---

### Phase 5: Google Cloud Setup

#### 5.1 Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Enable "Generative Language API"
4. Go to **APIs & Services → Credentials**
5. Click **Create Credentials → OAuth 2.0 Client ID**
6. Select **Desktop app**
7. Download the JSON and extract `client_id` and `client_secret`
8. Create `oauth-config.json` with these values

#### 5.2 Configure OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**
2. Select **External** user type
3. Fill in app name, support email, developer email
4. Add scopes:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/generative-language.retriever`
5. Add test users (your email) while in testing mode

---

## File Summary

### New Files
| File | Purpose |
|------|---------|
| `electron/auth/googleOAuth.cjs` | OAuth flow, token management |
| `oauth-config.json` | Client ID/secret (gitignored) |

### Modified Files
| File | Changes |
|------|---------|
| `electron/main.cjs` | Add OAuth IPC handlers |
| `electron/preload.cjs` | Expose OAuth methods |
| `src/services/transcriptionService.ts` | Add REST API with OAuth |
| `src/components/Settings.tsx` | Add Google Sign-In UI |
| `src/types.ts` | Add OAuth type definitions |
| `.gitignore` | Add `oauth-config.json` |

---

## Security Considerations

1. **Token Storage**: Uses Electron's `safeStorage` API
   - macOS: Keychain
   - Windows: Credential Vault
   - Linux: Secret Service (if available)

2. **PKCE Flow**: Mandatory for OAuth 2.1 compliance

3. **State Parameter**: CSRF protection

4. **Loopback Redirect**: No custom URL schemes (Google's requirement)

5. **Token Refresh**: Automatic before expiry (60s buffer)

---

## Testing Checklist

- [ ] OAuth config loads correctly
- [ ] "Sign in with Google" opens browser
- [ ] Consent screen shows correct app name
- [ ] Redirect works on all platforms
- [ ] Tokens stored securely
- [ ] Token refresh works
- [ ] Sign out clears all tokens
- [ ] Fallback to API key works
- [ ] Transcription works with OAuth token
- [ ] 401 errors trigger re-auth prompt

---

## Estimated Timeline

| Phase | Time |
|-------|------|
| Phase 1: OAuth Infrastructure | 2-3 hours |
| Phase 2: IPC Handlers | 1 hour |
| Phase 3: REST API Integration | 2 hours |
| Phase 4: Settings UI | 1-2 hours |
| Phase 5: Testing & Polish | 2 hours |
| **Total** | **8-10 hours** |

---

## Dependencies

```bash
npm install electron-store
```

Note: `electron-store` may already be installed or we can use the existing file-based store.
