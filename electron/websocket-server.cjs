/**
 * WebSocket server for mobile remote control
 * Allows a phone to connect and control AudioBash terminals
 * Serves the mobile page over HTTP on the same port
 */

const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const os = require('os');
const http = require('http');
const path = require('path');
const fs = require('fs');
const net = require('net');

/** Check if a port is available for binding */
function isPortAvailable(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      resolve(err.code !== 'EADDRINUSE');
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, host);
  });
}

/** MIME types for serving static files */
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

class RemoteControlServer {
  constructor(options = {}) {
    this.port = options.port || 8765;
    this.ptyProcesses = options.ptyProcesses;
    this.terminalOutputBuffers = options.terminalOutputBuffers;
    this.terminalCwds = options.terminalCwds;
    this.mainWindow = options.mainWindow;
    this.onStatusChange = options.onStatusChange;
    this.getStaticPassword = options.getStaticPassword;

    this.wss = null;
    this.httpServer = null;
    this.connectedClient = null;
    this.connectedDeviceName = null;
    this.sessionId = null;
    this.staticPassword = null;
    this.heartbeatInterval = null;
    this.inactivityTimeout = null;
    this.INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    // Password strength requirements
    this.MIN_PASSWORD_LENGTH = 8;
  }

  /** Validate password strength */
  validatePasswordStrength(password) {
    if (!password) {
      return { valid: true }; // Clearing password is valid
    }

    if (password.length < this.MIN_PASSWORD_LENGTH) {
      return {
        valid: false,
        error: `Password must be at least ${this.MIN_PASSWORD_LENGTH} characters (got ${password.length})`,
      };
    }

    const weakPasswords = ['password', 'audiobash', '12345678', 'qwerty', 'letmein', 'admin'];
    if (weakPasswords.some(weak => password.toLowerCase().includes(weak))) {
      return { valid: false, error: 'Password contains a common weak pattern' };
    }

    return { valid: true };
  }

  /** Set static password for remote access */
  setStaticPassword(password) {
    const validation = this.validatePasswordStrength(password);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    this.staticPassword = password || null;
    console.log(`[RemoteControl] Password ${password ? 'set' : 'cleared'}`);
    this.notifyStatusChange();
    return { success: true, warning: validation.warning };
  }

  /** Get the current static password */
  getStaticPasswordValue() {
    return this.staticPassword;
  }

  /** Get local network IP addresses */
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

  /** Resolve the directory containing the mobile page files */
  getRemotePageDir() {
    // In production: files are in extraResources
    // In dev: files are at project root docs/remote/
    const { app } = require('electron');
    const resourcePath = path.join(process.resourcesPath || '', 'remote');
    if (fs.existsSync(resourcePath)) {
      return resourcePath;
    }
    // Dev fallback
    const devPath = path.join(app.getAppPath(), 'docs', 'remote');
    if (fs.existsSync(devPath)) {
      return devPath;
    }
    return null;
  }

  /** Serve static files for the mobile page */
  handleHttpRequest(req, res) {
    // Health check
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
      return;
    }

    const remoteDir = this.getRemotePageDir();
    if (!remoteDir) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Mobile page not found');
      return;
    }

    // Map URL to file path
    let urlPath = req.url.split('?')[0]; // Strip query params
    if (urlPath === '/') urlPath = '/index.html';

    const filePath = path.join(remoteDir, urlPath);
    const normalized = path.normalize(filePath);

    // Prevent directory traversal
    if (!normalized.startsWith(remoteDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    // Read and serve file
    try {
      if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const ext = path.extname(normalized).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const content = fs.readFileSync(normalized);

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch (err) {
      console.error('[RemoteControl] HTTP serve error:', err.message);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal error');
    }
  }

  /** Start the WebSocket + HTTP server */
  async start() {
    if (this.wss) {
      console.log('[RemoteControl] Server already running');
      return this.getStatus();
    }

    if (!await isPortAvailable(this.port)) {
      const error = `Port ${this.port} is already in use`;
      console.error('[RemoteControl]', error);
      this.notifyStatusChange();
      return { success: false, error };
    }

    try {
      // HTTP server serves the mobile page, WebSocket upgrades handled by ws
      this.httpServer = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.wss = new WebSocketServer({ server: this.httpServer });

      this.wss.on('connection', (ws, req) => {
        this.setupConnectionHandlers(ws, req);
      });

      await new Promise((resolve, reject) => {
        this.httpServer.on('error', reject);
        this.httpServer.listen(this.port, '0.0.0.0', () => {
          console.log(`[RemoteControl] Server started on port ${this.port}`);
          resolve();
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

      this.notifyStatusChange();
      return this.getStatus();
    } catch (err) {
      console.error('[RemoteControl] Failed to start server:', err);
      return { success: false, error: err.message };
    }
  }

  /** Stop the server */
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
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }
    this.connectedClient = null;
    this.connectedDeviceName = null;
    this.sessionId = null;
    console.log('[RemoteControl] Server stopped');
    this.notifyStatusChange();
  }

  /** Get current server status */
  getStatus() {
    return {
      running: !!this.wss,
      port: this.port,
      hasStaticPassword: !!this.staticPassword,
      addresses: this.getLocalIPAddresses(),
      connected: !!this.connectedClient,
      deviceName: this.connectedDeviceName,
    };
  }

  /** Set up handlers for a new WebSocket connection */
  setupConnectionHandlers(ws, req) {
    const clientIP = req.socket.remoteAddress;
    console.log(`[RemoteControl] Connection from: ${clientIP}`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      this.resetInactivityTimeout();
      this.handleMessage(ws, data);
    });

    ws.on('close', () => { this.handleDisconnect(ws); });
    ws.on('error', (err) => {
      console.error('[RemoteControl] WebSocket error:', err.message);
    });
  }

  /** Handle incoming WebSocket message */
  handleMessage(ws, data) {
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
          // Intentionally ignored — mobile shouldn't resize the desktop terminal
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

  /** Handle authentication */
  handleAuth(ws, message) {
    const { password, deviceName } = message;

    // If a password is set, require it
    if (this.staticPassword) {
      if (password !== this.staticPassword) {
        this.send(ws, {
          type: 'auth_result',
          success: false,
          error: 'Invalid password',
        });
        return;
      }
    }

    // Reject if another client is already connected
    if (this.connectedClient && this.connectedClient !== ws) {
      this.send(ws, {
        type: 'auth_result',
        success: false,
        error: 'Another device is already connected',
      });
      ws.close();
      return;
    }

    // Success
    this.connectedClient = ws;
    this.connectedDeviceName = deviceName || 'Unknown device';
    this.sessionId = crypto.randomUUID();

    const tabs = this.getTabsList();

    this.send(ws, {
      type: 'auth_result',
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
        this.send(ws, { type: 'terminal_data', tabId, data: buffer });
      }
    }

    console.log(`[RemoteControl] Client authenticated: ${this.connectedDeviceName}`);
    this.notifyStatusChange();
    this.resetInactivityTimeout();
  }

  /** Handle client disconnect */
  handleDisconnect(ws) {
    if (this.connectedClient === ws) {
      console.log(`[RemoteControl] Client disconnected: ${this.connectedDeviceName}`);
      this.connectedClient = null;
      this.connectedDeviceName = null;
      this.sessionId = null;
      if (this.inactivityTimeout) {
        clearTimeout(this.inactivityTimeout);
        this.inactivityTimeout = null;
      }
      this.notifyStatusChange();
    }
  }

  /** Handle terminal write from mobile */
  handleTerminalWrite(message) {
    const { tabId, data } = message;
    if (!tabId || !data) return;

    const ptyProcess = this.ptyProcesses?.get(tabId);
    if (ptyProcess) {
      ptyProcess.write(data);
    } else if (this.connectedClient) {
      this.send(this.connectedClient, {
        type: 'error',
        message: `Terminal tab ${tabId} not found`,
      });
    }
  }

  /** Handle tab switch request */
  handleSwitchTab(message) {
    const { tabId } = message;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('remote-switch-tab', tabId);
    }
  }

  /** Handle context request */
  handleGetContext(ws, message) {
    const { tabId } = message;
    const cwd = this.terminalCwds?.get(tabId) || os.homedir();
    const recentOutput = this.terminalOutputBuffers?.get(tabId)?.slice(-500) || '';

    this.send(ws, {
      type: 'context',
      tabId,
      cwd,
      recentOutput,
    });
  }

  /** Handle tabs list request */
  handleGetTabs(ws) {
    this.send(ws, { type: 'tabs', tabs: this.getTabsList() });
  }

  /** Get list of active tabs */
  getTabsList() {
    const tabs = [];
    if (this.ptyProcesses) {
      for (const [tabId] of this.ptyProcesses) {
        tabs.push({ id: tabId, title: tabId.replace('tab-', 'Terminal ') });
      }
    }
    return tabs;
  }

  /** Send terminal data to connected mobile client */
  sendTerminalData(tabId, data) {
    if (this.connectedClient && this.connectedClient.readyState === 1) {
      this.send(this.connectedClient, { type: 'terminal_data', tabId, data });
    }
  }

  /** Send tabs update to connected mobile client */
  sendTabsUpdate() {
    if (this.connectedClient && this.connectedClient.readyState === 1) {
      this.send(this.connectedClient, { type: 'tabs_update', tabs: this.getTabsList() });
    }
  }

  /** Send JSON message to WebSocket client */
  send(ws, message) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }

  /** Notify UI of status change */
  notifyStatusChange() {
    if (this.onStatusChange) {
      this.onStatusChange(this.getStatus());
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('remote-status-changed', this.getStatus());
    }
  }

  /** Reset inactivity timeout */
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
