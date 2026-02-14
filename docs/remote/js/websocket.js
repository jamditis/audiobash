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
    this.maxReconnectAttempts = 10;
    this.baseReconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.listeners = new Map();
    this.connectionParams = null;
    this.isManualDisconnect = false;
    this.reconnectTimeout = null;
    this.lastError = null;
    this.isReconnecting = false;

    // Monitor network changes for proactive reconnection
    if ('onLine' in navigator) {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
    }

    // Reconnect when app comes to foreground
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.sessionId && !this.ws) {
        this.reconnectAttempts = 0;
        this.attemptReconnect();
      }
    });
  }

  /**
   * Connect to the desktop WebSocket server
   * @param {string} host - IP address or hostname
   * @param {number} port - WebSocket port (default 8765)
   * @param {string} password - Optional password
   * @param {string} deviceName - Name to identify this device
   * @returns {Promise<object>} Desktop info on success
   */
  connect(host, port = 8765, password, deviceName = 'Mobile Device') {
    return new Promise((resolve, reject) => {
      this.connectionParams = { host, port, password, deviceName };
      this.isManualDisconnect = false;

      if (!host) {
        reject(new Error('Please enter an IP address or hostname'));
        return;
      }

      // Build WebSocket URL — always ws:// on the configured port
      let url;
      if (host.startsWith('ws://') || host.startsWith('wss://')) {
        url = host;
      } else {
        url = `ws://${host}:${port}`;
      }

      console.log('[WS] Connecting to:', url);

      try {
        this.ws = new WebSocket(url);
      } catch (err) {
        reject(new Error(`Connection failed. Make sure AudioBash is running on port ${port}.`));
        return;
      }

      const timeout = setTimeout(() => {
        if (this.ws.readyState !== WebSocket.OPEN) {
          this.ws.close();
          reject(new Error('Connection timeout'));
        }
      }, 10000);

      this.ws.onopen = () => {
        clearTimeout(timeout);
        this.send({
          type: 'auth',
          password: password || '',
          deviceName,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'auth_result') {
            clearTimeout(timeout);
            if (message.success) {
              this.sessionId = message.sessionId;
              this.desktopInfo = message.desktopInfo;
              this.reconnectAttempts = 0;
              resolve(message.desktopInfo);
            } else {
              this.ws.close();
              reject(new Error(message.error || 'Authentication failed'));
            }
          } else {
            this.emit(message.type, message);
          }
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
      };

      this.ws.onclose = (event) => {
        clearTimeout(timeout);
        if (this.sessionId && !this.isManualDisconnect) {
          this.handleDisconnect();
        } else if (!this.sessionId) {
          reject(new Error('Connection closed before authentication'));
        }
        this.emit('disconnected', { code: event.code, reason: event.reason });
      };
    });
  }

  handleDisconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.isReconnecting) return;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('reconnect_failed', { attempts: this.reconnectAttempts, lastError: this.lastError });
      this.sessionId = null;
      return;
    }

    this.reconnectAttempts++;
    this.isReconnecting = true;

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      delay,
    });

    this.reconnectTimeout = setTimeout(() => {
      this.attemptReconnect();
    }, delay);
  }

  async attemptReconnect() {
    if (!this.connectionParams) {
      this.isReconnecting = false;
      this.emit('reconnect_failed', { reason: 'no_connection_params' });
      return;
    }

    const { host, port, password, deviceName } = this.connectionParams;

    try {
      await this.connect(host, port, password, deviceName);
      this.lastError = null;
      this.isReconnecting = false;
      this.emit('reconnected');
    } catch (err) {
      this.lastError = err.message;
      this.isReconnecting = false;
      this.handleDisconnect();
    }
  }

  handleNetworkChange(online) {
    if (online && this.sessionId && !this.ws) {
      this.reconnectAttempts = 0;
      this.attemptReconnect();
    }
  }

  send(data) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN && this.sessionId;
  }

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

  cancelReconnect() {
    this.isManualDisconnect = true;
    this.reconnectAttempts = this.maxReconnectAttempts;
    this.isReconnecting = false;

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

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const cbs = this.listeners.get(event);
      const idx = cbs.indexOf(callback);
      if (idx !== -1) cbs.splice(idx, 1);
    }
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => cb(data));
  }
}
