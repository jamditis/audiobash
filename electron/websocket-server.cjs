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

    // Security: Authentication rate limiting
    this.failedAttempts = new Map(); // Map<IP, { count, firstAttempt, lockedUntil }>
    this.MAX_AUTH_ATTEMPTS = 5;
    this.LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
    this.ATTEMPT_WINDOW = 5 * 60 * 1000; // 5 minutes

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
   * Set a static password for remote access (doesn't expire)
   * @param {string|null} password - Password to set, or null to disable
   */
  setStaticPassword(password) {
    this.staticPassword = password || null;
    if (password) {
      console.log('[RemoteControl] Static password set (remote access enabled)');
    } else {
      console.log('[RemoteControl] Static password cleared (pairing code only)');
    }
    this.notifyStatusChange();
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
  start() {
    if (this.wss) {
      console.log('[RemoteControl] Server already running');
      return this.getStatus();
    }

    try {
      // Start regular WebSocket server (ws://)
      this.wss = new WebSocketServer({ port: this.port });
      this.generatePairingCode();

      this.wss.on('connection', (ws, req) => {
        this.setupConnectionHandlers(ws, req);
      });

      console.log(`[RemoteControl] WS server started on port ${this.port}`);

      // Try to start secure WebSocket server (wss://)
      const certs = this.getOrCreateCertificate();
      if (certs) {
        try {
          this.httpsServer = https.createServer(certs);
          this.wssSecure = new WebSocketServer({ server: this.httpsServer });

          this.wssSecure.on('connection', (ws, req) => {
            this.setupConnectionHandlers(ws, req);
          });

          this.httpsServer.listen(this.securePort, () => {
            console.log(`[RemoteControl] WSS server started on port ${this.securePort}`);
          });
        } catch (wssErr) {
          console.warn('[RemoteControl] Failed to start WSS server:', wssErr.message);
        }
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
   * Handle authentication request
   */
  async handleAuth(ws, message) {
    const { pairingCode, deviceName } = message;

    // Security: Get client IP for rate limiting
    const clientIP = ws._socket.remoteAddress;
    const now = Date.now();

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
    const codeUpper = pairingCode?.toUpperCase();
    const matchesStaticPassword = this.staticPassword && codeUpper === this.staticPassword.toUpperCase();
    const matchesPairingCode = codeUpper === this.pairingCode;

    if (!matchesStaticPassword && !matchesPairingCode) {
      // Security: Track failed attempt
      const currentAttempts = attemptData || { count: 0, firstAttempt: now, lockedUntil: null };
      currentAttempts.count++;

      // Security: Exponential backoff delay (100ms * attempt count, max 2000ms)
      const delayMs = Math.min(100 * currentAttempts.count, 2000);

      // Security: Lock out after MAX_AUTH_ATTEMPTS
      if (currentAttempts.count >= this.MAX_AUTH_ATTEMPTS) {
        currentAttempts.lockedUntil = now + this.LOCKOUT_DURATION;
        console.warn(`[RemoteControl] IP ${clientIP} locked out for ${this.LOCKOUT_DURATION / 60000} minutes`);
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
   */
  handleTerminalResize(message) {
    const { tabId, cols, rows } = message;

    // Validate inputs
    if (!tabId || typeof tabId !== 'string') {
      console.warn('[RemoteControl] Invalid tabId in terminal_resize:', tabId);
      return;
    }
    if (!cols || !rows) {
      console.warn('[RemoteControl] Invalid dimensions in terminal_resize:', { cols, rows });
      return;
    }

    // Check if tab exists
    if (!this.ptyProcesses?.has(tabId)) {
      console.warn(`[RemoteControl] Tab not found for resize: ${tabId}`);
      if (this.connectedClient) {
        this.send(this.connectedClient, {
          type: 'error',
          message: `Terminal tab ${tabId} not found`,
          context: 'terminal_resize',
        });
      }
      return;
    }

    const ptyProcess = this.ptyProcesses.get(tabId);
    if (ptyProcess) {
      ptyProcess.resize(cols, rows);
    }
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
