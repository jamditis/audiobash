/**
 * AudioBash Remote - Main Application
 * Connects mobile device to desktop AudioBash for voice control
 */

import { WebSocketManager } from './websocket.js';
import { RemoteTerminal } from './terminal.js';
import { VoiceRecorder } from './voice.js';

// Application state
const state = {
  wsManager: new WebSocketManager(),
  terminal: null,
  voiceRecorder: null,
  mode: 'agent',
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

  // Voice controls
  modeAgent: document.getElementById('mode-agent'),
  modeRaw: document.getElementById('mode-raw'),
  voiceBtn: document.getElementById('voice-btn'),
  micIcon: document.getElementById('mic-icon'),
  stopIcon: document.getElementById('stop-icon'),
  voiceStatus: document.getElementById('voice-status'),
  transcriptionPreview: document.getElementById('transcription-preview'),

  // Reconnect overlay
  cancelReconnect: document.getElementById('cancel-reconnect'),
};

/**
 * Initialize the application
 */
function init() {
  // Load saved connection info
  loadSavedConnection();

  // Set up event listeners
  setupEventListeners();

  // Set up WebSocket event handlers
  setupWebSocketHandlers();

  // Check voice recording support
  if (!VoiceRecorder.isSupported()) {
    elements.voiceBtn.disabled = true;
    elements.voiceStatus.textContent = 'Voice not supported';
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

  // Disconnect button
  elements.disconnectBtn.addEventListener('click', handleDisconnect);

  // Tab selector
  elements.tabSelector.addEventListener('change', (e) => {
    const tabId = e.target.value;
    if (state.terminal) {
      state.terminal.switchTab(tabId);
      state.activeTabId = tabId;
    }
  });

  // Voice mode toggle
  elements.modeAgent.addEventListener('click', () => setMode('agent'));
  elements.modeRaw.addEventListener('click', () => setMode('raw'));

  // Voice button - tap to toggle recording
  elements.voiceBtn.addEventListener('click', handleVoiceToggle);

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

  // Transcription result
  ws.on('transcription', (message) => {
    handleTranscriptionResult(message);
  });

  // Transcription status
  ws.on('transcription_status', (message) => {
    if (message.status === 'processing') {
      setVoiceState('processing');
    }
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

  ws.on('reconnecting', ({ attempt }) => {
    console.log('[App] Reconnecting, attempt:', attempt);
    elements.reconnectOverlay.hidden = false;
  });

  ws.on('reconnect_failed', () => {
    console.log('[App] Reconnection failed');
    elements.reconnectOverlay.hidden = true;
    showScreen('connect');
    showError('Connection lost. Please reconnect.');
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
}

/**
 * Handle connect button click
 */
async function handleConnect() {
  const ip = elements.ipInput.value.trim();
  const code = elements.codeInput.value.trim().toUpperCase();

  // Validation
  if (!ip) {
    showError('Please enter the desktop IP address');
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

    // Connect
    // Use port 8766 for secure wss:// connections (HTTPS pages)
    // The websocket.js will automatically use wss:// when on HTTPS
    const desktopInfo = await state.wsManager.connect(ip, 8766, code, deviceName);

    // Save IP and code for next time (persistent password)
    saveConnection(ip, code);

    // Initialize terminal
    initializeTerminal(desktopInfo);

    // Initialize voice recorder
    initializeVoiceRecorder();

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
 * Handle disconnect button click
 */
function handleDisconnect() {
  state.wsManager.disconnect();

  // Clean up terminal
  if (state.terminal) {
    state.terminal.dispose();
    state.terminal = null;
  }

  // Clean up voice recorder
  if (state.voiceRecorder) {
    state.voiceRecorder.cancelRecording();
    state.voiceRecorder = null;
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
}

/**
 * Initialize voice recorder
 */
function initializeVoiceRecorder() {
  state.voiceRecorder = new VoiceRecorder(state.wsManager);
  state.voiceRecorder.setMode(state.mode);

  // Handle state changes
  state.voiceRecorder.onStateChange = (voiceState) => {
    setVoiceState(voiceState);
  };
}

/**
 * Handle voice button toggle
 */
async function handleVoiceToggle() {
  if (!state.voiceRecorder) return;

  if (state.voiceRecorder.isRecording) {
    state.voiceRecorder.stopRecording();
  } else {
    try {
      await state.voiceRecorder.startRecording(state.activeTabId);
    } catch (err) {
      console.error('[App] Voice recording failed:', err);
      setVoiceState('idle');
      showTranscriptionPreview('Microphone access denied');
    }
  }
}

/**
 * Handle transcription result
 */
function handleTranscriptionResult(message) {
  setVoiceState('idle');

  if (message.success && message.text) {
    showTranscriptionPreview(message.text);
    if (message.executed) {
      setTimeout(() => {
        elements.transcriptionPreview.textContent = '';
      }, 3000);
    }
  } else if (message.error) {
    showTranscriptionPreview(`Error: ${message.error}`);
  }
}

/**
 * Set voice mode
 */
function setMode(mode) {
  state.mode = mode;

  if (state.voiceRecorder) {
    state.voiceRecorder.setMode(mode);
  }

  // Update UI
  elements.modeAgent.classList.toggle('active', mode === 'agent');
  elements.modeRaw.classList.toggle('active', mode === 'raw');
}

/**
 * Set voice recording state
 */
function setVoiceState(voiceState) {
  elements.voiceBtn.classList.remove('recording', 'processing');

  switch (voiceState) {
    case 'recording':
      elements.voiceBtn.classList.add('recording');
      elements.micIcon.hidden = true;
      elements.stopIcon.hidden = false;
      elements.voiceStatus.textContent = 'Recording... Tap to stop';
      break;
    case 'processing':
      elements.voiceBtn.classList.add('processing');
      elements.micIcon.hidden = false;
      elements.stopIcon.hidden = true;
      elements.voiceStatus.textContent = 'Processing...';
      break;
    default:
      elements.micIcon.hidden = false;
      elements.stopIcon.hidden = true;
      elements.voiceStatus.textContent = 'Tap to speak';
  }
}

/**
 * Show transcription preview
 */
function showTranscriptionPreview(text) {
  elements.transcriptionPreview.textContent = text;
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
