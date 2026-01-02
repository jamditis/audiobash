/**
 * WebSocket connection manager with auto-reconnect
 * Handles connection drops from WiFi/mobile data switches
 */

export class WebSocketManager {
  constructor() {
    this.ws = null;
    this.sessionId = null;
    this.desktopInfo = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.baseReconnectDelay = 1000;
    this.listeners = new Map();
    this.connectionParams = null;
    this.isManualDisconnect = false;
    this.reconnectTimeout = null;

    // Monitor network changes for proactive reconnection
    if ('onLine' in navigator) {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
    }
  }

  /**
   * Connect to the desktop WebSocket server
   * @param {string} ip - Desktop IP address
   * @param {number} port - WebSocket port (default 8766 for secure, 8765 for insecure)
   * @param {string} pairingCode - 6-character pairing code or static password
   * @param {string} deviceName - Name to identify this device
   * @returns {Promise<object>} Desktop info on success
   */
  connect(hostOrUrl, port = 8766, pairingCode, deviceName = 'Mobile Device') {
    return new Promise((resolve, reject) => {
      // Store params for reconnection
      this.connectionParams = { ip: hostOrUrl, port, pairingCode, deviceName };
      this.isManualDisconnect = false;

      // Validate input
      if (!hostOrUrl) {
        reject(new Error('Please enter an IP address or tunnel URL'));
        return;
      }

      let url;

      // Check if it's already a full WebSocket URL (wss:// or ws://)
      if (hostOrUrl.startsWith('wss://') || hostOrUrl.startsWith('ws://')) {
        url = hostOrUrl;
      }
      // Check if it's an HTTPS/HTTP URL (convert to WSS/WS)
      else if (hostOrUrl.startsWith('https://')) {
        url = hostOrUrl.replace('https://', 'wss://');
      }
      else if (hostOrUrl.startsWith('http://')) {
        url = hostOrUrl.replace('http://', 'ws://');
      }
      // Check if it's a hostname (tunnel URL like subdomain.tunnelto.dev)
      else if (hostOrUrl.includes('.') && !/^[\d.]+$/.test(hostOrUrl)) {
        // It's a hostname - always use wss:// for tunnel URLs (no port needed)
        url = `wss://${hostOrUrl}`;
      }
      // Otherwise treat as IP address
      else if (/^[\d.]+$/.test(hostOrUrl)) {
        // Use wss:// (secure) when on HTTPS page, ws:// otherwise
        const isSecurePage = window.location.protocol === 'https:';
        const protocol = isSecurePage ? 'wss' : 'ws';
        // Default to secure port 8766 for wss://, 8765 for ws://
        const effectivePort = port || (isSecurePage ? 8766 : 8765);
        url = `${protocol}://${hostOrUrl}:${effectivePort}`;
      }
      else {
        reject(new Error('Invalid address. Use IP (192.168.1.70) or tunnel URL (xxx.tunnelto.dev)'));
        return;
      }

      console.log('[WS] Connecting to:', url);

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        console.error('[WS] WebSocket constructor failed:', err);
        reject(new Error(`Connection failed. Make sure AudioBash is running and port ${effectivePort} is forwarded.`));
        return;
      }

      // Connection timeout
      const timeout = setTimeout(() => {
        if (this.ws.readyState !== WebSocket.OPEN) {
          this.ws.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        console.log('[WS] Connected, sending auth');

        // Send authentication
        this.send({
          type: 'auth',
          pairingCode: pairingCode.toUpperCase(),
          deviceName: deviceName,
        });
      };

      this.ws.onmessage = (event) => {
        if (event.data instanceof Blob) {
          // Binary data - shouldn't receive this from server
          return;
        }

        try {
          const message = JSON.parse(event.data);

          // Handle auth response specially during connection
          if (message.type === 'auth_response') {
            clearTimeout(timeout);
            if (message.success) {
              this.sessionId = message.sessionId;
              this.desktopInfo = message.desktopInfo;
              this.reconnectAttempts = 0;
              console.log('[WS] Authenticated:', message.desktopInfo);
              resolve(message.desktopInfo);
            } else {
              const errorMsg = this.getErrorMessage(message.error);
              this.ws.close();
              reject(new Error(errorMsg));
            }
          } else {
            // Emit other messages to listeners
            this.emit(message.type, message);
          }
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };

      this.ws.onerror = (err) => {
        clearTimeout(timeout);
        console.error('[WS] Error:', err);
      };

      this.ws.onclose = (event) => {
        clearTimeout(timeout);
        console.log('[WS] Closed:', event.code, event.reason);

        // Only auto-reconnect if we had a session and didn't manually disconnect
        if (this.sessionId && !this.isManualDisconnect) {
          this.handleDisconnect();
        } else if (!this.sessionId) {
          // Never connected successfully
          reject(new Error('Connection closed before authentication'));
        }

        this.emit('disconnected', { code: event.code, reason: event.reason });
      };
    });
  }

  /**
   * Get human-readable error message
   */
  getErrorMessage(error) {
    switch (error) {
      case 'invalid_code':
        return 'Invalid pairing code or password. Check AudioBash Settings > Remote Control.';
      case 'already_connected':
        return 'Another device is already connected. Disconnect it first in AudioBash Settings.';
      case 'connection_refused':
        return 'Connection refused. Make sure AudioBash is running and Remote Control is enabled.';
      default:
        return error || 'Connection failed';
    }
  }

  /**
   * Handle unexpected disconnect - attempt reconnection
   */
  handleDisconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WS] Max reconnect attempts reached');
      this.emit('reconnect_failed');
      this.sessionId = null;
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      10000
    );

    console.log(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    this.reconnectTimeout = setTimeout(() => {
      this.attemptReconnect();
    }, delay);
  }

  /**
   * Attempt to reconnect to server
   */
  async attemptReconnect() {
    if (!this.connectionParams) {
      this.emit('reconnect_failed');
      return;
    }

    const { ip, port, pairingCode } = this.connectionParams;

    // If we have a static password saved, we can try to reconnect with it
    if (pairingCode) {
      try {
        await this.connect(ip, port, pairingCode, this.connectionParams.deviceName);
        console.log('[WS] Reconnected successfully');
      } catch (err) {
        console.log('[WS] Reconnect failed:', err.message);
        this.handleDisconnect();
      }
    } else {
      // No saved password, need new pairing code
      console.log('[WS] Need new pairing code');
      this.emit('reconnect_need_code');
    }
  }

  /**
   * Handle network status changes
   */
  handleNetworkChange(online) {
    console.log('[WS] Network status:', online ? 'online' : 'offline');

    if (online && this.sessionId && !this.ws) {
      // Network came back, try to reconnect
      console.log('[WS] Network restored, attempting reconnect');
      this.reconnectAttempts = 0;
      this.attemptReconnect();
    }
  }

  /**
   * Send a JSON message
   */
  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Send binary data (for audio)
   */
  sendBinary(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  /**
   * Check if connected
   */
  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN && this.sessionId;
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    this.isManualDisconnect = true;
    this.sessionId = null;
    this.connectionParams = null;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.send({ type: 'disconnect' });
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Cancel reconnection attempts
   */
  cancelReconnect() {
    this.isManualDisconnect = true;
    this.reconnectAttempts = this.maxReconnectAttempts;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.sessionId = null;
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event to listeners
   */
  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => cb(data));
  }
}
