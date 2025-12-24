/**
 * WebSocket server for mobile remote control
 * Allows a phone to connect and control AudioBash terminals
 */

const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const os = require('os');

class RemoteControlServer {
  constructor(options = {}) {
    this.port = options.port || 8765;
    this.ptyProcesses = options.ptyProcesses;
    this.terminalOutputBuffers = options.terminalOutputBuffers;
    this.terminalCwds = options.terminalCwds;
    this.mainWindow = options.mainWindow;
    this.transcribeAudio = options.transcribeAudio; // Function to transcribe audio
    this.onStatusChange = options.onStatusChange; // Callback for UI updates
    this.getStaticPassword = options.getStaticPassword; // Function to get saved static password

    this.wss = null;
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
   * Start the WebSocket server
   */
  start() {
    if (this.wss) {
      console.log('[RemoteControl] Server already running');
      return this.getStatus();
    }

    try {
      this.wss = new WebSocketServer({ port: this.port });
      this.generatePairingCode();

      this.wss.on('connection', (ws, req) => {
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
      });

      // Heartbeat to detect dead connections
      this.heartbeatInterval = setInterval(() => {
        if (this.wss) {
          this.wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
              console.log('[RemoteControl] Terminating unresponsive client');
              return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
          });
        }
      }, 30000);

      console.log(`[RemoteControl] Server started on port ${this.port}`);
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
  handleAuth(ws, message) {
    const { pairingCode, deviceName } = message;

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
      this.send(ws, {
        type: 'auth_response',
        success: false,
        error: 'invalid_code',
      });
      return;
    }

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
      this.notifyStatusChange();
    }
  }

  /**
   * Handle terminal write from mobile
   */
  handleTerminalWrite(message) {
    const { tabId, data } = message;
    if (!tabId || !data) return;

    const ptyProcess = this.ptyProcesses?.get(tabId);
    if (ptyProcess) {
      ptyProcess.write(data);
    }
  }

  /**
   * Handle terminal resize from mobile
   */
  handleTerminalResize(message) {
    const { tabId, cols, rows } = message;
    if (!tabId || !cols || !rows) return;

    const ptyProcess = this.ptyProcesses?.get(tabId);
    if (ptyProcess) {
      ptyProcess.resize(cols, rows);
    }
  }

  /**
   * Handle audio recording start
   */
  handleAudioStart(message) {
    const { tabId, mode, format } = message;
    this.currentAudioSession = { tabId, mode: mode || 'agent', format: format || 'webm' };
    this.audioChunks = [];
    console.log(`[RemoteControl] Audio session started for ${tabId}, mode: ${mode}`);
  }

  /**
   * Handle incoming audio data chunk
   */
  handleAudioData(data) {
    if (this.currentAudioSession) {
      this.audioChunks.push(data);
    }
  }

  /**
   * Handle audio recording end - trigger transcription
   */
  async handleAudioEnd(message) {
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
    const audioBuffer = Buffer.concat(this.audioChunks);

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
