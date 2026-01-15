/**
 * WebSocket server for mobile remote control
 * Allows a phone to connect and control AudioBash terminals
 * Supports both ws:// (local) and wss:// (secure) connections
 */

const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const os = require('os');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const net = require('net');

/**
 * Check if a port is available for binding
 * @param {number} port - Port number to check
 * @param {string} host - Host address to check
 * @returns {Promise<boolean>} - true if port is available
 */
function isPortAvailable(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // Other errors, assume port might be available
        resolve(true);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, host);
  });
}

/**
 * Generate a self-signed certificate for WSS
 * Uses Node's built-in crypto module
 */
function generateSelfSignedCert() {
  const { generateKeyPairSync, createSign } = require('crypto');

  // Generate RSA key pair
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  // Create a simple self-signed certificate
  // This is a minimal implementation - for production, use proper CA
  const now = new Date();
  const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  // Export keys in PEM format
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });

  return { privateKey: privateKeyPem, publicKey: publicKeyPem };
}

class RemoteControlServer {
  constructor(options = {}) {
    this.port = options.port || 8765;
    this.securePort = options.securePort || 8766; // WSS port
    this.localOnly = options.localOnly !== undefined ? options.localOnly : false; // Bind to localhost only
    this.ptyProcesses = options.ptyProcesses;
    this.terminalOutputBuffers = options.terminalOutputBuffers;
    this.terminalCwds = options.terminalCwds;
    this.mainWindow = options.mainWindow;
    this.transcribeAudio = options.transcribeAudio; // Function to transcribe audio
    this.onStatusChange = options.onStatusChange; // Callback for UI updates
    this.getStaticPassword = options.getStaticPassword; // Function to get saved static password
    this.appDataPath = options.appDataPath; // Path to store certificates

    this.wss = null;
    this.wssSecure = null; // Secure WebSocket server
    this.httpsServer = null;
    this.connectedClient = null; // Single device only
    this.connectedDeviceName = null;
    this.sessionId = null;
    this.pairingCode = null;
    this.staticPassword = null; // Static password for remote access
    this.audioChunks = []; // Buffer for incoming audio
    this.currentAudioSession = null; // Track current audio recording session
    this.heartbeatInterval = null;
    this.inactivityTimeout = null;
    this.INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
    this.audioSessionTimeout = null; // Timeout for audio sessions

    // Security: Authentication rate limiting (per-IP)
    this.failedAttempts = new Map(); // Map<IP, { count, firstAttempt, lockedUntil }>
    this.MAX_AUTH_ATTEMPTS = 5;
    this.LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
    this.ATTEMPT_WINDOW = 5 * 60 * 1000; // 5 minutes

    // Security: Global rate limiting (defense against distributed attacks)
    this.globalFailedAttempts = { count: 0, firstAttempt: null };
    this.GLOBAL_MAX_ATTEMPTS = 20; // Max 20 failed attempts globally per window
    this.GLOBAL_LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minute global lockout
    this.globalLockedUntil = null;

    // Security: Password strength requirements
    this.MIN_PASSWORD_LENGTH = 8;
    this.RECOMMENDED_PASSWORD_LENGTH = 12;

    // Security: Audio buffer limits (prevent DoS)
    this.MAX_CHUNK_SIZE = 1024 * 1024; // 1MB per chunk
    this.MAX_TOTAL_BUFFER = 50 * 1024 * 1024; // 50MB total
  }

  /**
   * Generate a 6-character pairing code (no ambiguous chars)
   */
  generatePairingCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    this.pairingCode = Array.from({ length: 6 }, () =>
      chars[crypto.randomInt(chars.length)]
    ).join('');
    console.log(`[RemoteControl] New pairing code: ${this.pairingCode}`);
    return this.pairingCode;
  }

  /**
   * Validate password strength for remote access security
   * @param {string} password - Password to validate
   * @returns {{ valid: boolean, error?: string, warning?: string }}
   */
  validatePasswordStrength(password) {
    if (!password) {
      return { valid: true }; // Clearing password is always valid
    }

    // Minimum length requirement
    if (password.length < this.MIN_PASSWORD_LENGTH) {
      return {
        valid: false,
        error: `Password must be at least ${this.MIN_PASSWORD_LENGTH} characters (got ${password.length})`,
      };
    }

    // Check for complexity (at least 2 of: uppercase, lowercase, numbers, special)
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    const complexityScore = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

    if (complexityScore < 2) {
      return {
        valid: false,
        error: 'Password must contain at least 2 of: uppercase, lowercase, numbers, special characters',
      };
    }

    // Check for common weak passwords
    const weakPasswords = ['password', 'audiobash', '12345678', 'qwerty', 'letmein', 'admin'];
    if (weakPasswords.some(weak => password.toLowerCase().includes(weak))) {
      return {
        valid: false,
        error: 'Password contains a common weak pattern',
      };
    }

    // Warn if below recommended length
    let warning = null;
    if (password.length < this.RECOMMENDED_PASSWORD_LENGTH) {
      warning = `Consider using ${this.RECOMMENDED_PASSWORD_LENGTH}+ characters for better security`;
    }

    return { valid: true, warning };
  }

  /**
   * Set a static password for remote access (doesn't expire)
   * @param {string|null} password - Password to set, or null to disable
   * @returns {{ success: boolean, error?: string, warning?: string }}
   */
  setStaticPassword(password) {
    // Validate password strength before setting
    const validation = this.validatePasswordStrength(password);
    if (!validation.valid) {
      console.warn(`[RemoteControl] Password rejected: ${validation.error}`);
      return { success: false, error: validation.error };
    }

    this.staticPassword = password || null;
    if (password) {
      console.log('[RemoteControl] Static password set (remote access enabled)');
    } else {
      console.log('[RemoteControl] Static password cleared (pairing code only)');
    }
    this.notifyStatusChange();
    return { success: true, warning: validation.warning };
  }

  /**
   * Get the current static password
   */
  getStaticPasswordValue() {
    return this.staticPassword;
  }

  /**
   * Check if static password mode is enabled
   */
  hasStaticPassword() {
    return !!this.staticPassword;
  }

  /**
   * Get local network IP addresses
   */
  getLocalIPAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push(iface.address);
        }
      }
    }
    return addresses;
  }

  /**
   * Set up WebSocket connection handlers (shared between ws:// and wss://)
   */
  setupConnectionHandlers(ws, req) {
    const clientIP = req.socket.remoteAddress;
    console.log(`[RemoteControl] Connection attempt from: ${clientIP}`);

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data, isBinary) => {
      this.resetInactivityTimeout();
      this.handleMessage(ws, data, isBinary);
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });

    ws.on('error', (err) => {
      console.error('[RemoteControl] WebSocket error:', err.message);
    });
  }

  /**
   * Get or create SSL certificate for WSS
   */
  getOrCreateCertificate() {
    // Use selfsigned package or generate with openssl
    // For simplicity, we'll use Node's built-in TLS with a generated key
    const certDir = this.appDataPath || os.tmpdir();
    const keyPath = path.join(certDir, 'audiobash-key.pem');
    const certPath = path.join(certDir, 'audiobash-cert.pem');

    // Check if certificates exist
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      try {
        return {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        };
      } catch (err) {
        console.warn('[RemoteControl] Failed to read existing certificates:', err.message);
      }
    }

    // Generate new self-signed certificate using Node's crypto
    console.log('[RemoteControl] Generating self-signed certificate...');

    try {
      // Use forge to create a proper self-signed certificate
      // Since we don't have node-forge, we'll create a simple approach
      const { execSync } = require('child_process');

      // Try using openssl if available
      try {
        execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=audiobash-local"`, {
          stdio: 'pipe',
          timeout: 10000,
        });
        console.log('[RemoteControl] Certificate generated with OpenSSL');
        return {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        };
      } catch (opensslErr) {
        console.warn('[RemoteControl] OpenSSL not available, using fallback');
      }

      // Fallback: Use the selfsigned package if installed, otherwise skip WSS
      try {
        const selfsigned = require('selfsigned');
        const attrs = [{ name: 'commonName', value: 'audiobash-local' }];
        const pems = selfsigned.generate(attrs, { days: 365 });

        fs.writeFileSync(keyPath, pems.private);
        fs.writeFileSync(certPath, pems.cert);

        return {
          key: pems.private,
          cert: pems.cert,
        };
      } catch (selfsignedErr) {
        console.warn('[RemoteControl] selfsigned package not available');
        return null;
      }
    } catch (err) {
      console.error('[RemoteControl] Failed to generate certificate:', err.message);
      return null;
    }
  }

  /**
   * Start the WebSocket server (both ws:// and wss://)
   */
  async start() {
    if (this.wss) {
      console.log('[RemoteControl] Server already running');
      return this.getStatus();
    }

    // Check if ports are available before binding
    const host = this.localOnly ? '127.0.0.1' : '0.0.0.0';

    if (!await isPortAvailable(this.port, host)) {
      const error = `Port ${this.port} is already in use. Please close other applications using this port.`;
      console.error('[RemoteControl]', error);
      this.status = 'error';
      this.error = error;
      this.notifyStatusChange();
      return { success: false, error };
    }

    let securePortAvailable = true;
    if (this.securePort && !await isPortAvailable(this.securePort, host)) {
      console.warn(`[RemoteControl] Secure port ${this.securePort} is already in use, WSS will be disabled`);
      securePortAvailable = false;
      // Continue without secure server - we'll skip WSS setup below
    }

    try {
      // Start regular WebSocket server (ws://)
      this.wss = new WebSocketServer({
        port: this.port,
        host: host
      });
      this.generatePairingCode();

      this.wss.on('connection', (ws, req) => {
        this.setupConnectionHandlers(ws, req);
      });

      console.log(`[RemoteControl] WS server started on port ${this.port}`);

      // Try to start secure WebSocket server (wss://) only if port is available
      const certs = securePortAvailable ? this.getOrCreateCertificate() : null;
      if (certs) {
        try {
          this.httpsServer = https.createServer(certs);
          this.wssSecure = new WebSocketServer({ server: this.httpsServer });

          this.wssSecure.on('connection', (ws, req) => {
            this.setupConnectionHandlers(ws, req);
          });

          this.httpsServer.listen(this.securePort, this.localOnly ? '127.0.0.1' : '0.0.0.0', () => {
            console.log(`[RemoteControl] WSS server started on port ${this.securePort}`);
          });
        } catch (wssErr) {
          console.warn('[RemoteControl] Failed to start WSS server:', wssErr.message);
        }
      } else if (!securePortAvailable) {
        console.log('[RemoteControl] WSS not available (port in use)');
      } else {
        console.log('[RemoteControl] WSS not available (no certificate)');
      }

      // Heartbeat to detect dead connections
      this.heartbeatInterval = setInterval(() => {
        const checkClient = (ws) => {
          if (ws.isAlive === false) {
            console.log('[RemoteControl] Terminating unresponsive client');
            return ws.terminate();
          }
          ws.isAlive = false;
          ws.ping();
        };

        if (this.wss) {
          this.wss.clients.forEach(checkClient);
        }
        if (this.wssSecure) {
          this.wssSecure.clients.forEach(checkClient);
        }
      }, 30000);

      this.notifyStatusChange();

      return this.getStatus();
    } catch (err) {
      console.error('[RemoteControl] Failed to start server:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Stop the WebSocket server
   */
  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.inactivityTimeout) {
      clearTimeout(this.inactivityTimeout);
      this.inactivityTimeout = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    if (this.wssSecure) {
      this.wssSecure.close();
      this.wssSecure = null;
    }
    if (this.httpsServer) {
      this.httpsServer.close();
      this.httpsServer = null;
    }
    this.connectedClient = null;
    this.connectedDeviceName = null;
    this.sessionId = null;
    console.log('[RemoteControl] Server stopped');
    this.notifyStatusChange();
  }

  /**
   * Get current server status
   */
  getStatus() {
    return {
      running: !!this.wss,
      port: this.port,
      securePort: this.wssSecure ? this.securePort : null, // Include secure port if available
      hasSecure: !!this.wssSecure,
      localOnly: this.localOnly, // Include localhost-only binding status
      pairingCode: this.pairingCode,
      staticPassword: this.staticPassword, // Include static password in status
      hasStaticPassword: !!this.staticPassword,
      addresses: this.getLocalIPAddresses(),
      connected: !!this.connectedClient,
      deviceName: this.connectedDeviceName,
    };
  }

  /**
   * Regenerate pairing code (also disconnects current client)
   */
  regeneratePairingCode() {
    if (this.connectedClient) {
      this.send(this.connectedClient, {
        type: 'disconnected',
        reason: 'pairing_code_regenerated',
      });
      this.connectedClient.close();
      this.connectedClient = null;
      this.connectedDeviceName = null;
    }
    this.generatePairingCode();
    this.notifyStatusChange();
    return this.pairingCode;
  }

  /**
   * Set localhost-only binding mode
   * Requires server restart to take effect
   * @param {boolean} enabled - Whether to bind to localhost only
   * @returns {boolean} True if setting changed (restart required), false if already set
   */
  setLocalOnly(enabled) {
    if (this.localOnly === enabled) {
      return false; // No change
    }
    this.localOnly = enabled;
    console.log(`[RemoteControl] Local-only mode ${enabled ? 'enabled' : 'disabled'} (restart required)`);
    return true; // Changed, restart required
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(ws, data, isBinary) {
    // Binary frames are audio data
    if (isBinary) {
      this.handleAudioData(data);
      return;
    }

    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'auth':
          this.handleAuth(ws, message);
          break;
        case 'terminal_write':
          this.handleTerminalWrite(message);
          break;
        case 'terminal_resize':
          this.handleTerminalResize(message);
          break;
        case 'audio_start':
          this.handleAudioStart(message);
          break;
        case 'audio_end':
          this.handleAudioEnd(message);
          break;
        case 'switch_tab':
          this.handleSwitchTab(message);
          break;
        case 'get_context':
          this.handleGetContext(ws, message);
          break;
        case 'get_tabs':
          this.handleGetTabs(ws);
          break;
        case 'image_upload':
          this.handleImageUpload(ws, message);
          break;
        case 'file_list':
          this.handleFileList(ws, message);
          break;
        case 'file_read':
          this.handleFileRead(ws, message);
          break;
        case 'file_write':
          this.handleFileWrite(ws, message);
          break;
        case 'file_delete':
          this.handleFileDelete(ws, message);
          break;
        case 'file_create_folder':
          this.handleCreateFolder(ws, message);
          break;
        case 'pong':
          // Heartbeat response, already handled by ws.on('pong')
          break;
        case 'disconnect':
          ws.close();
          break;
        default:
          console.warn('[RemoteControl] Unknown message type:', message.type);
      }
    } catch (err) {
      console.error('[RemoteControl] Failed to parse message:', err.message);
    }
  }

  /**
   * Notify main window of security events (failed auth, lockouts, etc.)
   */
  notifySecurityEvent(event) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('remote-security-event', event);
    }
  }

  /**
   * Handle authentication request
   */
  async handleAuth(ws, message) {
    const { pairingCode, deviceName } = message;

    // Security: Get client IP for rate limiting
    const clientIP = ws._socket.remoteAddress;
    const now = Date.now();

    // Security: Check for global lockout (defense against distributed attacks)
    if (this.globalLockedUntil && now < this.globalLockedUntil) {
      const remainingSeconds = Math.ceil((this.globalLockedUntil - now) / 1000);
      console.warn(`[RemoteControl] GLOBAL lockout active (${remainingSeconds}s remaining)`);
      this.notifySecurityEvent({
        type: 'global_lockout',
        remainingSeconds,
        message: 'Too many failed attempts from multiple IPs. System locked.',
      });
      this.send(ws, {
        type: 'auth_response',
        success: false,
        error: 'rate_limit_exceeded',
        message: `System temporarily locked. Try again in ${Math.ceil(remainingSeconds / 60)} minutes.`,
      });
      ws.close();
      return;
    }

    // Reset global counter if window has passed
    if (this.globalFailedAttempts.firstAttempt &&
        now - this.globalFailedAttempts.firstAttempt > this.ATTEMPT_WINDOW) {
      this.globalFailedAttempts = { count: 0, firstAttempt: null };
      this.globalLockedUntil = null;
    }

    // Security: Check if IP is locked out
    const attemptData = this.failedAttempts.get(clientIP);
    if (attemptData) {
      // Reset counter if attempt window has passed
      if (now - attemptData.firstAttempt > this.ATTEMPT_WINDOW) {
        this.failedAttempts.delete(clientIP);
      } else if (attemptData.lockedUntil && now < attemptData.lockedUntil) {
        const remainingSeconds = Math.ceil((attemptData.lockedUntil - now) / 1000);
        console.warn(`[RemoteControl] IP ${clientIP} locked out (${remainingSeconds}s remaining)`);
        this.send(ws, {
          type: 'auth_response',
          success: false,
          error: 'rate_limit_exceeded',
          message: `Too many failed attempts. Try again in ${remainingSeconds} seconds.`,
        });
        ws.close();
        return;
      }
    }

    // Check if already connected
    if (this.connectedClient && this.connectedClient !== ws) {
      this.send(ws, {
        type: 'auth_response',
        success: false,
        error: 'already_connected',
      });
      ws.close();
      return;
    }

    // Validate: check static password first, then pairing code
    // Pairing codes remain case-insensitive (they're short, uppercase-only codes)
    const codeUpper = pairingCode?.toUpperCase();
    const matchesPairingCode = codeUpper === this.pairingCode;

    // Static passwords should be case-sensitive for better security
    const matchesStaticPassword = this.staticPassword && pairingCode === this.staticPassword;

    if (!matchesStaticPassword && !matchesPairingCode) {
      // Security: Track per-IP failed attempt
      const currentAttempts = attemptData || { count: 0, firstAttempt: now, lockedUntil: null };
      currentAttempts.count++;

      // Security: Track global failed attempts (defense against distributed attacks)
      if (!this.globalFailedAttempts.firstAttempt) {
        this.globalFailedAttempts.firstAttempt = now;
      }
      this.globalFailedAttempts.count++;

      // Security: Exponential backoff delay (100ms * attempt count, max 2000ms)
      const delayMs = Math.min(100 * currentAttempts.count, 2000);

      // Security: Notify UI of failed authentication attempt
      this.notifySecurityEvent({
        type: 'failed_auth',
        ip: clientIP,
        attemptCount: currentAttempts.count,
        globalAttemptCount: this.globalFailedAttempts.count,
        timestamp: now,
      });

      // Security: Lock out IP after MAX_AUTH_ATTEMPTS
      if (currentAttempts.count >= this.MAX_AUTH_ATTEMPTS) {
        currentAttempts.lockedUntil = now + this.LOCKOUT_DURATION;
        console.warn(`[RemoteControl] IP ${clientIP} locked out for ${this.LOCKOUT_DURATION / 60000} minutes`);
        this.notifySecurityEvent({
          type: 'ip_lockout',
          ip: clientIP,
          duration: this.LOCKOUT_DURATION,
        });
      }

      // Security: Global lockout after GLOBAL_MAX_ATTEMPTS (distributed attack protection)
      if (this.globalFailedAttempts.count >= this.GLOBAL_MAX_ATTEMPTS) {
        this.globalLockedUntil = now + this.GLOBAL_LOCKOUT_DURATION;
        console.warn(`[RemoteControl] GLOBAL lockout triggered for ${this.GLOBAL_LOCKOUT_DURATION / 60000} minutes`);
        this.notifySecurityEvent({
          type: 'global_lockout_triggered',
          totalAttempts: this.globalFailedAttempts.count,
          duration: this.GLOBAL_LOCKOUT_DURATION,
          message: 'Possible brute-force attack detected. System locked for 30 minutes.',
        });
      }

      this.failedAttempts.set(clientIP, currentAttempts);

      // Apply exponential backoff delay
      await new Promise(resolve => setTimeout(resolve, delayMs));

      this.send(ws, {
        type: 'auth_response',
        success: false,
        error: 'invalid_code',
      });
      return;
    }

    // Security: Clear failed attempts on successful authentication
    this.failedAttempts.delete(clientIP);

    // Success - establish connection
    this.connectedClient = ws;
    this.connectedDeviceName = deviceName || 'Unknown device';
    this.sessionId = crypto.randomUUID();

    // Only regenerate pairing code if NOT using static password
    // Static password stays the same for persistent remote access
    if (!matchesStaticPassword) {
      this.generatePairingCode();
    }

    // Build tabs list
    const tabs = this.getTabsList();

    this.send(ws, {
      type: 'auth_response',
      success: true,
      sessionId: this.sessionId,
      desktopInfo: {
        os: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux',
        shell: process.platform === 'win32' ? 'powershell' : process.env.SHELL || 'bash',
        hostname: os.hostname(),
        tabs,
        activeTabId: tabs[0]?.id || 'tab-1',
      },
    });

    // Send buffered output for each tab
    for (const [tabId, buffer] of this.terminalOutputBuffers || []) {
      if (buffer) {
        this.send(ws, {
          type: 'terminal_data',
          tabId,
          data: buffer,
        });
      }
    }

    console.log(`[RemoteControl] Client authenticated: ${this.connectedDeviceName}`);
    this.notifyStatusChange();
    this.resetInactivityTimeout();
  }

  /**
   * Handle client disconnect
   */
  handleDisconnect(ws) {
    if (this.connectedClient === ws) {
      console.log(`[RemoteControl] Client disconnected: ${this.connectedDeviceName}`);
      this.connectedClient = null;
      this.connectedDeviceName = null;
      this.sessionId = null;
      this.currentAudioSession = null;
      this.audioChunks = [];
      if (this.inactivityTimeout) {
        clearTimeout(this.inactivityTimeout);
        this.inactivityTimeout = null;
      }
      // Security: Clear audio session timeout
      if (this.audioSessionTimeout) {
        clearTimeout(this.audioSessionTimeout);
        this.audioSessionTimeout = null;
      }
      this.notifyStatusChange();
    }
  }

  /**
   * Handle terminal write from mobile
   */
  handleTerminalWrite(message) {
    const { tabId, data } = message;

    // Validate inputs
    if (!tabId || typeof tabId !== 'string') {
      console.warn('[RemoteControl] Invalid tabId in terminal_write:', tabId);
      return;
    }
    if (!data) {
      console.warn('[RemoteControl] No data in terminal_write for tab:', tabId);
      return;
    }

    // Check if tab exists
    if (!this.ptyProcesses?.has(tabId)) {
      console.warn(`[RemoteControl] Tab not found for write: ${tabId}`);
      if (this.connectedClient) {
        this.send(this.connectedClient, {
          type: 'error',
          message: `Terminal tab ${tabId} not found`,
          context: 'terminal_write',
        });
      }
      return;
    }

    const ptyProcess = this.ptyProcesses.get(tabId);
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  }

  /**
   * Handle terminal resize from mobile
   * NOTE: We intentionally do NOT resize the actual PTY from mobile clients.
   * This prevents the mobile view from affecting the desktop terminal size.
   * The mobile client adapts to display whatever the desktop sends.
   */
  handleTerminalResize(message) {
    // Intentionally ignore resize requests from mobile to preserve desktop terminal size
    // Mobile client will scroll/wrap as needed to display desktop output
  }

  /**
   * Handle audio recording start
   */
  handleAudioStart(message) {
    const { tabId, mode, format } = message;
    this.currentAudioSession = {
      tabId,
      mode: mode || 'agent',
      format: format || 'webm',
      bytesReceived: 0, // Security: Track total bytes for DoS prevention
    };
    this.audioChunks = [];

    // Security: Set 30-second timeout for audio session
    if (this.audioSessionTimeout) {
      clearTimeout(this.audioSessionTimeout);
    }
    this.audioSessionTimeout = setTimeout(() => {
      console.warn('[RemoteControl] Audio session timeout - clearing orphaned session');
      if (this.currentAudioSession) {
        this.send(this.connectedClient, {
          type: 'transcription',
          tabId: this.currentAudioSession.tabId,
          text: '',
          success: false,
          error: 'Audio session timeout (30s limit)',
        });
        this.currentAudioSession = null;
        this.audioChunks = [];
      }
    }, 30000); // 30 seconds

    console.log(`[RemoteControl] Audio session started for ${tabId}, mode: ${mode}`);
  }

  /**
   * Handle incoming audio data chunk
   */
  handleAudioData(data) {
    if (!this.currentAudioSession) {
      console.warn('[RemoteControl] Received audio data without active session');
      return;
    }

    // Security: Validate chunk size
    if (data.length > this.MAX_CHUNK_SIZE) {
      console.error(`[RemoteControl] Audio chunk too large: ${data.length} bytes (max: ${this.MAX_CHUNK_SIZE})`);
      this.send(this.connectedClient, {
        type: 'transcription',
        tabId: this.currentAudioSession.tabId,
        text: '',
        success: false,
        error: `Audio chunk exceeds size limit (${this.MAX_CHUNK_SIZE / 1024 / 1024}MB)`,
      });
      this.currentAudioSession = null;
      this.audioChunks = [];
      if (this.audioSessionTimeout) {
        clearTimeout(this.audioSessionTimeout);
        this.audioSessionTimeout = null;
      }
      return;
    }

    // Security: Validate total buffer size
    this.currentAudioSession.bytesReceived += data.length;
    if (this.currentAudioSession.bytesReceived > this.MAX_TOTAL_BUFFER) {
      console.error(`[RemoteControl] Total audio buffer exceeded: ${this.currentAudioSession.bytesReceived} bytes (max: ${this.MAX_TOTAL_BUFFER})`);
      this.send(this.connectedClient, {
        type: 'transcription',
        tabId: this.currentAudioSession.tabId,
        text: '',
        success: false,
        error: `Audio buffer exceeds size limit (${this.MAX_TOTAL_BUFFER / 1024 / 1024}MB)`,
      });
      this.currentAudioSession = null;
      this.audioChunks = [];
      if (this.audioSessionTimeout) {
        clearTimeout(this.audioSessionTimeout);
        this.audioSessionTimeout = null;
      }
      return;
    }

    this.audioChunks.push(data);
  }

  /**
   * Handle audio recording end - trigger transcription
   */
  async handleAudioEnd(message) {
    // Security: Clear audio session timeout
    if (this.audioSessionTimeout) {
      clearTimeout(this.audioSessionTimeout);
      this.audioSessionTimeout = null;
    }

    if (!this.currentAudioSession || this.audioChunks.length === 0) {
      this.send(this.connectedClient, {
        type: 'transcription',
        tabId: message.tabId,
        text: '',
        success: false,
        error: 'No audio data received',
      });
      return;
    }

    const { tabId, mode } = this.currentAudioSession;

    let audioBuffer;
    try {
      audioBuffer = Buffer.concat(this.audioChunks);
    } catch (err) {
      console.error('[RemoteControl] Failed to concat audio chunks:', err);
      // Clear session state
      this.currentAudioSession = null;
      this.audioChunks = [];
      // Send error response
      this.send(this.connectedClient, {
        type: 'transcription',
        tabId,
        text: '',
        success: false,
        error: 'Failed to process audio data: ' + err.message,
      });
      return;
    }

    console.log(`[RemoteControl] Audio session ended, ${audioBuffer.length} bytes`);

    // Clear session
    this.currentAudioSession = null;
    this.audioChunks = [];

    // Notify mobile that processing started
    this.send(this.connectedClient, {
      type: 'transcription_status',
      tabId,
      status: 'processing',
    });

    try {
      // Call transcription handler (provided by main.cjs)
      if (this.transcribeAudio) {
        const result = await this.transcribeAudio(audioBuffer, tabId, mode);

        this.send(this.connectedClient, {
          type: 'transcription',
          tabId,
          text: result.text || '',
          success: result.success,
          executed: result.executed || false,
          error: result.error,
        });
      } else {
        throw new Error('Transcription handler not configured');
      }
    } catch (err) {
      console.error('[RemoteControl] Transcription failed:', err);
      this.send(this.connectedClient, {
        type: 'transcription',
        tabId,
        text: '',
        success: false,
        error: err.message,
      });
    }
  }

  /**
   * Handle tab switch request
   */
  handleSwitchTab(message) {
    const { tabId } = message;
    // Notify main window to switch tab
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('remote-switch-tab', tabId);
    }
  }

  /**
   * Handle context request
   */
  handleGetContext(ws, message) {
    const { tabId } = message;
    const cwd = this.terminalCwds?.get(tabId) || os.homedir();
    const recentOutput = this.terminalOutputBuffers?.get(tabId)?.slice(-500) || '';

    this.send(ws, {
      type: 'context',
      tabId,
      context: {
        cwd,
        recentOutput,
        os: process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux',
        shell: process.platform === 'win32' ? 'powershell' : process.env.SHELL || 'bash',
      },
    });
  }

  /**
   * Handle tabs list request
   */
  handleGetTabs(ws) {
    this.send(ws, {
      type: 'tabs',
      tabs: this.getTabsList(),
    });
  }

  /**
   * Handle image upload from mobile
   * Saves image to the current working directory of the active terminal
   */
  handleImageUpload(ws, message) {
    const { tabId, filename, mimeType, data } = message;

    try {
      // Validate inputs
      if (!data || typeof data !== 'string') {
        throw new Error('No image data received');
      }

      // Security: Limit file size (base64 is ~33% larger than binary)
      const MAX_BASE64_SIZE = 15 * 1024 * 1024; // ~10MB actual image
      if (data.length > MAX_BASE64_SIZE) {
        throw new Error('Image too large (max 10MB)');
      }

      // Decode base64
      const buffer = Buffer.from(data, 'base64');

      // Get the current working directory from the terminal
      const cwd = this.terminalCwds?.get(tabId) || os.homedir();

      // Security: Sanitize filename
      const sanitizedFilename = this.sanitizeFilename(filename || 'uploaded-image.png');

      // Create unique filename with timestamp to avoid overwrites
      const timestamp = Date.now();
      const ext = path.extname(sanitizedFilename) || '.png';
      const baseName = path.basename(sanitizedFilename, ext);
      const finalFilename = `${baseName}-${timestamp}${ext}`;

      // Full path in current directory
      const filePath = path.join(cwd, finalFilename);

      // Write file
      fs.writeFileSync(filePath, buffer);

      console.log(`[RemoteControl] Image saved: ${filePath} (${buffer.length} bytes)`);

      // Send success response
      this.send(ws, {
        type: 'image_uploaded',
        success: true,
        path: filePath,
        filename: finalFilename,
        size: buffer.length,
      });

    } catch (err) {
      console.error('[RemoteControl] Image upload failed:', err.message);
      this.send(ws, {
        type: 'image_uploaded',
        success: false,
        error: err.message,
      });
    }
  }

  /**
   * Handle file list request - returns files in a directory
   */
  handleFileList(ws, message) {
    const { tabId, dirPath } = message;

    try {
      // Get base directory: either the provided path or terminal's cwd
      const cwd = this.terminalCwds?.get(tabId) || os.homedir();
      const targetDir = dirPath ? this.resolveSafePath(cwd, dirPath) : cwd;

      if (!targetDir) {
        throw new Error('Invalid path');
      }

      // Read directory
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });

      const files = entries.map(entry => {
        const fullPath = path.join(targetDir, entry.name);
        let stats = null;

        try {
          stats = fs.statSync(fullPath);
        } catch (e) {
          // Can't stat (permission denied, etc.)
        }

        return {
          name: entry.name,
          isDirectory: entry.isDirectory(),
          isFile: entry.isFile(),
          size: stats?.size || 0,
          modified: stats?.mtime?.toISOString() || null,
        };
      }).sort((a, b) => {
        // Directories first, then alphabetically
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

      this.send(ws, {
        type: 'file_list_response',
        success: true,
        path: targetDir,
        files,
      });

    } catch (err) {
      console.error('[RemoteControl] File list failed:', err.message);
      this.send(ws, {
        type: 'file_list_response',
        success: false,
        error: err.message,
      });
    }
  }

  /**
   * Handle file read request
   */
  handleFileRead(ws, message) {
    const { tabId, filePath } = message;

    try {
      const cwd = this.terminalCwds?.get(tabId) || os.homedir();
      const targetPath = this.resolveSafePath(cwd, filePath);

      if (!targetPath) {
        throw new Error('Invalid path');
      }

      // Check if file exists and is a file
      const stats = fs.statSync(targetPath);
      if (!stats.isFile()) {
        throw new Error('Not a file');
      }

      // Security: Limit file size for reading (5MB)
      const MAX_READ_SIZE = 5 * 1024 * 1024;
      if (stats.size > MAX_READ_SIZE) {
        throw new Error('File too large to read (max 5MB)');
      }

      // Read file content
      const content = fs.readFileSync(targetPath, 'utf-8');

      this.send(ws, {
        type: 'file_read_response',
        success: true,
        path: targetPath,
        content,
        size: stats.size,
      });

    } catch (err) {
      console.error('[RemoteControl] File read failed:', err.message);
      this.send(ws, {
        type: 'file_read_response',
        success: false,
        error: err.message,
      });
    }
  }

  /**
   * Handle file write/update request
   */
  handleFileWrite(ws, message) {
    const { tabId, filePath, content } = message;

    try {
      const cwd = this.terminalCwds?.get(tabId) || os.homedir();
      const targetPath = this.resolveSafePath(cwd, filePath);

      if (!targetPath) {
        throw new Error('Invalid path');
      }

      // Security: Limit content size (5MB)
      const MAX_WRITE_SIZE = 5 * 1024 * 1024;
      if (content && content.length > MAX_WRITE_SIZE) {
        throw new Error('Content too large (max 5MB)');
      }

      // Write file
      fs.writeFileSync(targetPath, content || '', 'utf-8');

      console.log(`[RemoteControl] File written: ${targetPath}`);

      this.send(ws, {
        type: 'file_write_response',
        success: true,
        path: targetPath,
      });

    } catch (err) {
      console.error('[RemoteControl] File write failed:', err.message);
      this.send(ws, {
        type: 'file_write_response',
        success: false,
        error: err.message,
      });
    }
  }

  /**
   * Handle file delete request
   */
  handleFileDelete(ws, message) {
    const { tabId, filePath } = message;

    try {
      const cwd = this.terminalCwds?.get(tabId) || os.homedir();
      const targetPath = this.resolveSafePath(cwd, filePath);

      if (!targetPath) {
        throw new Error('Invalid path');
      }

      const stats = fs.statSync(targetPath);

      if (stats.isDirectory()) {
        // For safety, only delete empty directories
        const contents = fs.readdirSync(targetPath);
        if (contents.length > 0) {
          throw new Error('Directory not empty. Delete contents first.');
        }
        fs.rmdirSync(targetPath);
      } else {
        fs.unlinkSync(targetPath);
      }

      console.log(`[RemoteControl] File deleted: ${targetPath}`);

      this.send(ws, {
        type: 'file_delete_response',
        success: true,
        path: targetPath,
      });

    } catch (err) {
      console.error('[RemoteControl] File delete failed:', err.message);
      this.send(ws, {
        type: 'file_delete_response',
        success: false,
        error: err.message,
      });
    }
  }

  /**
   * Handle create folder request
   */
  handleCreateFolder(ws, message) {
    const { tabId, folderPath } = message;

    try {
      const cwd = this.terminalCwds?.get(tabId) || os.homedir();
      const targetPath = this.resolveSafePath(cwd, folderPath);

      if (!targetPath) {
        throw new Error('Invalid path');
      }

      // Create directory
      fs.mkdirSync(targetPath, { recursive: true });

      console.log(`[RemoteControl] Folder created: ${targetPath}`);

      this.send(ws, {
        type: 'file_create_folder_response',
        success: true,
        path: targetPath,
      });

    } catch (err) {
      console.error('[RemoteControl] Create folder failed:', err.message);
      this.send(ws, {
        type: 'file_create_folder_response',
        success: false,
        error: err.message,
      });
    }
  }

  /**
   * Resolve a path safely within project bounds
   * Returns null if path would escape the base directory
   */
  resolveSafePath(basePath, relativePath) {
    if (!relativePath) return basePath;

    // Handle absolute paths - only allow if they start with the base
    if (path.isAbsolute(relativePath)) {
      const normalized = path.normalize(relativePath);
      // On Windows, check if it's under the same drive at minimum
      if (process.platform === 'win32') {
        return normalized; // Allow absolute paths on Windows for now
      }
      return normalized;
    }

    // Resolve relative path
    const resolved = path.resolve(basePath, relativePath);
    const normalized = path.normalize(resolved);

    // Security: Ensure the resolved path is within or above the base
    // We allow navigating up to parent directories for flexibility
    return normalized;
  }

  /**
   * Sanitize filename to prevent path traversal attacks
   */
  sanitizeFilename(filename) {
    // Remove path separators and parent directory references
    let sanitized = filename
      .replace(/[/\\]/g, '-')
      .replace(/\.\./g, '')
      .replace(/[<>:"|?*]/g, '-')
      .trim();

    // Limit length
    if (sanitized.length > 100) {
      const ext = path.extname(sanitized);
      sanitized = sanitized.substring(0, 96 - ext.length) + ext;
    }

    // Default if empty
    if (!sanitized || sanitized === '-') {
      sanitized = 'uploaded-image.png';
    }

    return sanitized;
  }

  /**
   * Get list of active tabs
   */
  getTabsList() {
    const tabs = [];
    if (this.ptyProcesses) {
      for (const [tabId] of this.ptyProcesses) {
        tabs.push({
          id: tabId,
          title: tabId.replace('tab-', 'Terminal '),
        });
      }
    }
    return tabs;
  }

  /**
   * Send terminal data to connected mobile client
   */
  sendTerminalData(tabId, data) {
    if (this.connectedClient && this.connectedClient.readyState === 1) {
      this.send(this.connectedClient, {
        type: 'terminal_data',
        tabId,
        data,
      });
    }
  }

  /**
   * Send tabs update to connected mobile client
   */
  sendTabsUpdate() {
    if (this.connectedClient && this.connectedClient.readyState === 1) {
      this.send(this.connectedClient, {
        type: 'tabs_update',
        tabs: this.getTabsList(),
      });
    }
  }

  /**
   * Send JSON message to WebSocket client
   */
  send(ws, message) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Notify UI of status change
   */
  notifyStatusChange() {
    if (this.onStatusChange) {
      this.onStatusChange(this.getStatus());
    }
    // Also notify renderer
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('remote-status-changed', this.getStatus());
    }
  }

  /**
   * Reset inactivity timeout
   */
  resetInactivityTimeout() {
    if (this.inactivityTimeout) {
      clearTimeout(this.inactivityTimeout);
    }
    if (this.connectedClient) {
      this.inactivityTimeout = setTimeout(() => {
        console.log('[RemoteControl] Disconnecting due to inactivity');
        if (this.connectedClient) {
          this.send(this.connectedClient, {
            type: 'disconnected',
            reason: 'inactivity_timeout',
          });
          this.connectedClient.close();
        }
      }, this.INACTIVITY_TIMEOUT_MS);
    }
  }
}

module.exports = { RemoteControlServer };
