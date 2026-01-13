/**
 * AudioBash Remote - Main Application
 * Connects mobile device to desktop AudioBash for voice control
 */

import { WebSocketManager } from './websocket.js';
import { RemoteTerminal } from './terminal.js';
import { FileBrowser } from './file-browser.js';

// Application state
const state = {
  wsManager: new WebSocketManager(),
  terminal: null,
  fileBrowser: null,
  activeTabId: 'tab-1',
  tabs: [],
};

// DOM elements
const elements = {
  // Screens
  connectScreen: document.getElementById('connect-screen'),
  terminalScreen: document.getElementById('terminal-screen'),
  reconnectOverlay: document.getElementById('reconnect-overlay'),

  // Connection form
  ipInput: document.getElementById('ip-input'),
  codeInput: document.getElementById('code-input'),
  connectBtn: document.getElementById('connect-btn'),
  connectError: document.getElementById('connect-error'),

  // Terminal screen
  connectionIndicator: document.getElementById('connection-indicator'),
  connectionStatus: document.getElementById('connection-status'),
  tabSelector: document.getElementById('tab-selector'),
  disconnectBtn: document.getElementById('disconnect-btn'),
  terminalContainer: document.getElementById('terminal-container'),

  // Command input
  commandInput: document.getElementById('command-input'),
  imageInput: document.getElementById('image-input'),
  imageBtn: document.getElementById('image-btn'),
  filesBtn: document.getElementById('files-btn'),
  sendBtn: document.getElementById('send-btn'),

  // Reconnect overlay
  cancelReconnect: document.getElementById('cancel-reconnect'),
};

/**
 * Initialize the application
 */
function init() {
  // Validate that critical elements exist
  const requiredElements = [
    'connectScreen',
    'terminalScreen',
    'ipInput',
    'codeInput',
    'connectBtn',
    'terminalContainer',
    'tabSelector',
    'disconnectBtn',
  ];

  for (const name of requiredElements) {
    if (!elements[name]) {
      console.error(`[App] Required element missing: ${name}`);
      document.body.innerHTML = `
        <div style="padding: 20px; font-family: monospace; color: #ff3333;">
          <h1>Initialization Error</h1>
          <p>Required UI element missing: <strong>${name}</strong></p>
          <p>Please ensure the HTML file is not corrupted.</p>
        </div>
      `;
      return;
    }
  }

  // Load saved connection info
  loadSavedConnection();

  // Set up event listeners
  setupEventListeners();

  // Set up WebSocket event handlers
  setupWebSocketHandlers();

  // Register service worker for PWA offline support
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/remote/service-worker.js')
      .then(reg => console.log('[App] Service worker registered'))
      .catch(err => console.warn('[App] Service worker registration failed:', err));
  }

  console.log('[App] Initialized');
}

/**
 * Load saved connection info from localStorage
 */
function loadSavedConnection() {
  const savedIP = localStorage.getItem('audiobash-remote-ip');
  if (savedIP) {
    elements.ipInput.value = savedIP;
  }
  // Also load saved password/code
  const savedCode = localStorage.getItem('audiobash-remote-code');
  if (savedCode) {
    elements.codeInput.value = savedCode;
  }
}

/**
 * Save connection info to localStorage
 */
function saveConnection(ip, code) {
  localStorage.setItem('audiobash-remote-ip', ip);
  // Save the code/password for persistent access
  if (code) {
    localStorage.setItem('audiobash-remote-code', code);
  }
}

/**
 * Set up DOM event listeners
 */
function setupEventListeners() {
  // Connect button
  elements.connectBtn.addEventListener('click', handleConnect);

  // Enter key on inputs
  elements.ipInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') elements.codeInput.focus();
  });
  elements.codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleConnect();
  });

  // Handle QR code paste (format: ws://IP:PORT|CODE or wss://hostname|CODE)
  elements.ipInput.addEventListener('paste', (e) => {
    // Small delay to let paste complete
    setTimeout(() => {
      const pastedText = elements.ipInput.value.trim();
      // Try format with port first: ws://IP:PORT|CODE
      let qrMatch = pastedText.match(/^wss?:\/\/([^:/]+):(\d+)\|(.+)$/);
      if (qrMatch) {
        const [, ip, port, code] = qrMatch;
        elements.ipInput.value = ip;
        elements.codeInput.value = code;
        elements.codeInput.focus();
        console.log('[App] Parsed QR code connection string (with port)');
        return;
      }
      // Try format without port: wss://hostname|CODE (for tunnels)
      qrMatch = pastedText.match(/^wss?:\/\/([^|]+)\|(.+)$/);
      if (qrMatch) {
        const [, hostname, code] = qrMatch;
        elements.ipInput.value = hostname;
        elements.codeInput.value = code;
        elements.codeInput.focus();
        console.log('[App] Parsed QR code connection string (tunnel)');
      }
    }, 10);
  });

  // Disconnect button
  elements.disconnectBtn.addEventListener('click', handleDisconnect);

  // Tab selector
  elements.tabSelector.addEventListener('change', (e) => {
    const tabId = e.target.value;
    if (state.terminal) {
      state.terminal.switchTab(tabId);
      state.activeTabId = tabId;
    }
    // Update file browser's active tab too
    if (state.fileBrowser) {
      state.fileBrowser.setActiveTab(tabId);
    }
  });

  // Command input - send on Enter or button click
  elements.commandInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendCommand();
    }
  });
  elements.sendBtn?.addEventListener('click', handleSendCommand);

  // Image upload
  elements.imageBtn?.addEventListener('click', () => {
    elements.imageInput?.click();
  });
  elements.imageInput?.addEventListener('change', handleImageSelect);

  // Cancel reconnect
  elements.cancelReconnect.addEventListener('click', () => {
    state.wsManager.cancelReconnect();
    showScreen('connect');
    elements.reconnectOverlay.hidden = true;
  });
}

/**
 * Set up WebSocket event handlers
 */
function setupWebSocketHandlers() {
  const ws = state.wsManager;

  // Terminal data
  ws.on('terminal_data', (message) => {
    // Terminal handles this internally
  });

  // Connection events
  ws.on('disconnected', (data) => {
    console.log('[App] Disconnected:', data);
    if (!state.wsManager.isManualDisconnect) {
      // Unexpected disconnect - show reconnecting
      elements.connectionIndicator.classList.remove('connected');
      elements.connectionStatus.textContent = 'Disconnected';
    }
  });

  ws.on('reconnecting', ({ attempt, maxAttempts, nextAttemptIn }) => {
    console.log('[App] Reconnecting, attempt:', attempt);
    elements.reconnectOverlay.hidden = false;
    // Update overlay text with attempt info
    const overlayText = elements.reconnectOverlay.querySelector('.overlay-text');
    if (overlayText) {
      overlayText.textContent = `Reconnecting... (${attempt}/${maxAttempts})`;
    }
  });

  ws.on('reconnected', () => {
    console.log('[App] Reconnected successfully');
    elements.reconnectOverlay.hidden = true;
    elements.connectionIndicator.classList.add('connected');
    elements.connectionStatus.textContent = 'Connected';
  });

  ws.on('reconnect_failed', (data) => {
    console.log('[App] Reconnection failed:', data);
    elements.reconnectOverlay.hidden = true;
    showScreen('connect');
    const errorMsg = data?.lastError
      ? `Connection lost: ${data.lastError}`
      : 'Connection lost after multiple attempts. Please reconnect.';
    showError(errorMsg);
  });

  ws.on('reconnect_need_code', () => {
    console.log('[App] Need new pairing code');
    elements.reconnectOverlay.hidden = true;
    showScreen('connect');
    showError('Session expired. Please enter new pairing code.');
  });

  // Tabs update
  ws.on('tabs_update', (message) => {
    updateTabs(message.tabs);
  });

  // Image upload response
  ws.on('image_uploaded', (message) => {
    if (message.success) {
      console.log('[App] Image saved to:', message.path);
      // Show notification that image was saved
      const filename = message.path.split(/[/\\]/).pop();
      alert(`Image saved: ${filename}\n\nPath copied to clipboard. Paste in Claude to reference it.`);
      // Try to copy path to clipboard
      navigator.clipboard?.writeText(message.path).catch(() => {});
    } else {
      console.error('[App] Image upload failed:', message.error);
      alert('Failed to save image: ' + message.error);
    }
  });
}

/**
 * Handle connect button click
 */
async function handleConnect() {
  const address = elements.ipInput.value.trim();
  const code = elements.codeInput.value.trim().toUpperCase();

  // Validation
  if (!address) {
    showError('Please enter the IP address or tunnel URL');
    return;
  }
  if (!code) {
    showError('Please enter the pairing code or password');
    return;
  }

  // Clear error
  hideError();

  // Show loading state
  setConnecting(true);

  try {
    // Get device name
    const deviceName = getDeviceName();

    // Detect if it's a tunnel URL (no port needed) or IP address (port 8766)
    const isTunnelUrl = address.includes('tunnelto') ||
                        address.startsWith('wss://') ||
                        address.startsWith('https://') ||
                        (address.includes('.') && !/^[\d.]+$/.test(address));

    // Connect - tunnel URLs don't need a port, IP addresses use 8766
    const port = isTunnelUrl ? null : 8766;
    const desktopInfo = await state.wsManager.connect(address, port, code, deviceName);

    // Save address and code for next time (persistent password)
    saveConnection(address, code);

    // Initialize terminal
    initializeTerminal(desktopInfo);

    // Update UI
    updateTabs(desktopInfo.tabs);
    state.activeTabId = desktopInfo.activeTabId;

    // Show terminal screen
    showScreen('terminal');

    console.log('[App] Connected to:', desktopInfo.hostname);

  } catch (err) {
    console.error('[App] Connection failed:', err);
    showError(err.message);
  } finally {
    setConnecting(false);
  }
}

/**
 * Handle sending command from text input
 */
function handleSendCommand() {
  const command = elements.commandInput?.value?.trim();
  if (!command) return;

  // Send command to terminal
  state.wsManager.send({
    type: 'terminal_write',
    tabId: state.activeTabId,
    data: command + '\r', // Add carriage return to execute
  });

  // Clear input
  elements.commandInput.value = '';

  // Haptic feedback
  navigator.vibrate?.(30);
}

/**
 * Handle image selection from file input
 */
async function handleImageSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  // Validate file type
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file');
    return;
  }

  // Max 10MB
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    alert('Image too large. Maximum size is 10MB.');
    return;
  }

  // Show uploading state
  elements.imageBtn?.classList.add('uploading');

  try {
    // Convert to base64
    const base64 = await fileToBase64(file);

    // Send to server
    state.wsManager.send({
      type: 'image_upload',
      tabId: state.activeTabId,
      filename: file.name,
      mimeType: file.type,
      data: base64,
    });

    // Haptic feedback
    navigator.vibrate?.(50);

    console.log('[App] Image uploaded:', file.name, file.size, 'bytes');

  } catch (err) {
    console.error('[App] Image upload failed:', err);
    alert('Failed to upload image: ' + err.message);
  } finally {
    // Clear input so same file can be selected again
    elements.imageInput.value = '';
    elements.imageBtn?.classList.remove('uploading');
  }
}

/**
 * Convert file to base64 string
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remove data URL prefix (e.g., "data:image/png;base64,")
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Handle disconnect button click
 */
function handleDisconnect() {
  state.wsManager.disconnect();

  // Clean up terminal
  if (state.terminal) {
    state.terminal.dispose();
    state.terminal = null;
  }

  // Clean up file browser
  if (state.fileBrowser) {
    state.fileBrowser.hide();
    state.fileBrowser = null;
  }

  // Show connect screen
  showScreen('connect');
}

/**
 * Initialize the terminal
 */
function initializeTerminal(desktopInfo) {
  // Clean up existing terminal
  if (state.terminal) {
    state.terminal.dispose();
  }

  // Clear container
  elements.terminalContainer.innerHTML = '';

  // Create new terminal
  state.terminal = new RemoteTerminal(elements.terminalContainer, state.wsManager);
  state.terminal.initialize(desktopInfo.activeTabId);

  // Handle tabs update
  state.terminal.onTabsUpdate = updateTabs;

  // Initialize file browser
  state.fileBrowser = new FileBrowser(state.wsManager, desktopInfo.activeTabId);
}

/**
 * Update tabs in selector
 */
function updateTabs(tabs) {
  state.tabs = tabs;

  // Update tab selector
  elements.tabSelector.innerHTML = tabs.map(tab =>
    `<option value="${tab.id}">${tab.title}</option>`
  ).join('');

  // Select active tab
  elements.tabSelector.value = state.activeTabId;
}

/**
 * Show a specific screen
 */
function showScreen(screenName) {
  elements.connectScreen.classList.toggle('active', screenName === 'connect');
  elements.terminalScreen.classList.toggle('active', screenName === 'terminal');
}

/**
 * Show error message
 */
function showError(message) {
  elements.connectError.textContent = message;
  elements.connectError.classList.add('visible');
}

/**
 * Hide error message
 */
function hideError() {
  elements.connectError.classList.remove('visible');
}

/**
 * Set connecting state
 */
function setConnecting(connecting) {
  elements.connectBtn.disabled = connecting;
  elements.connectBtn.querySelector('.btn-text').textContent = connecting ? 'Connecting...' : 'Connect';
  elements.connectBtn.querySelector('.btn-spinner').hidden = !connecting;
}

/**
 * Get device name
 */
function getDeviceName() {
  const ua = navigator.userAgent;

  // Try to extract device name
  if (/Samsung/i.test(ua)) {
    const match = ua.match(/SM-\w+/);
    return match ? `Samsung ${match[0]}` : 'Samsung Device';
  }
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android Device';

  return 'Mobile Device';
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
