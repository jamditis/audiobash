/**
 * AudioBash Remote - Main Application
 * Connects mobile device to desktop AudioBash terminal
 */

import { WebSocketManager } from './websocket.js';
import { RemoteTerminal } from './terminal.js';

// Application state
const state = {
  wsManager: new WebSocketManager(),
  terminal: null,
  activeTabId: 'tab-1',
  tabs: [],
};

// DOM elements
const elements = {
  connectScreen: document.getElementById('connect-screen'),
  terminalScreen: document.getElementById('terminal-screen'),
  reconnectOverlay: document.getElementById('reconnect-overlay'),
  ipInput: document.getElementById('ip-input'),
  codeInput: document.getElementById('code-input'),
  connectBtn: document.getElementById('connect-btn'),
  connectError: document.getElementById('connect-error'),
  connectionIndicator: document.getElementById('connection-indicator'),
  connectionStatus: document.getElementById('connection-status'),
  tabSelector: document.getElementById('tab-selector'),
  disconnectBtn: document.getElementById('disconnect-btn'),
  terminalContainer: document.getElementById('terminal-container'),
  auxKeys: document.getElementById('aux-keys'),
  commandInput: document.getElementById('command-input'),
  sendBtn: document.getElementById('send-btn'),
  cancelReconnect: document.getElementById('cancel-reconnect'),
};

// Modifier key state
const modifierState = { ctrl: false, alt: false };

/** Safe localStorage wrapper */
const storage = {
  get(key) {
    try { return localStorage.getItem(key); }
    catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch { return false; }
  }
};

function init() {
  // Load saved connection info
  const savedIP = storage.get('audiobash-remote-ip');
  if (savedIP) elements.ipInput.value = savedIP;
  const savedCode = storage.get('audiobash-remote-code');
  if (savedCode) elements.codeInput.value = savedCode;

  setupEventListeners();
  setupWebSocketHandlers();

  // Register service worker for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

function setupEventListeners() {
  elements.connectBtn.addEventListener('click', handleConnect);
  elements.ipInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') elements.codeInput.focus();
  });
  elements.codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleConnect();
  });
  elements.disconnectBtn.addEventListener('click', handleDisconnect);

  elements.tabSelector.addEventListener('change', (e) => {
    state.activeTabId = e.target.value;
    if (state.terminal) state.terminal.switchTab(state.activeTabId);
  });

  elements.commandInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendCommand();
    }
  });
  elements.sendBtn?.addEventListener('click', handleSendCommand);

  elements.cancelReconnect.addEventListener('click', () => {
    state.wsManager.cancelReconnect();
    showScreen('connect');
    elements.reconnectOverlay.hidden = true;
  });

  setupAuxiliaryKeys();
}

function setupAuxiliaryKeys() {
  if (!elements.auxKeys) return;

  elements.auxKeys.addEventListener('click', (e) => {
    const btn = e.target.closest('.aux-key');
    if (!btn) return;

    navigator.vibrate?.(15);

    if (btn.dataset.modifier) {
      handleModifierToggle(btn, btn.dataset.modifier);
    } else if (btn.dataset.key) {
      const seqs = { Tab: '\t', Escape: '\x1b' };
      if (seqs[btn.dataset.key]) sendToTerminal(seqs[btn.dataset.key]);
      clearModifiers();
    } else if (btn.dataset.send) {
      const char = btn.dataset.send.charAt(1);
      sendToTerminal(String.fromCharCode(char.charCodeAt(0) - 64));
      clearModifiers();
    } else if (btn.dataset.char) {
      if (document.activeElement === elements.commandInput) {
        const input = elements.commandInput;
        const start = input.selectionStart;
        input.value = input.value.substring(0, start) + btn.dataset.char + input.value.substring(input.selectionEnd);
        input.selectionStart = input.selectionEnd = start + 1;
      } else {
        sendToTerminal(btn.dataset.char);
      }
      clearModifiers();
    } else if (btn.dataset.arrow) {
      const arrows = { up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D' };
      sendToTerminal(arrows[btn.dataset.arrow]);
      clearModifiers();
    }
  });
}

function handleModifierToggle(btn, modifier) {
  modifierState[modifier] = !modifierState[modifier];
  btn.classList.toggle('active', modifierState[modifier]);
  if (modifierState[modifier]) elements.commandInput?.focus();
}

function sendToTerminal(data) {
  if (!state.wsManager) return;
  if (modifierState.ctrl && data.length === 1) {
    const upper = data.toUpperCase();
    if (upper >= 'A' && upper <= 'Z') {
      data = String.fromCharCode(upper.charCodeAt(0) - 64);
    }
  }
  state.wsManager.send({
    type: 'terminal_write',
    tabId: state.activeTabId,
    data,
  });
}

function clearModifiers() {
  modifierState.ctrl = false;
  modifierState.alt = false;
  elements.auxKeys?.querySelectorAll('.aux-key.modifier').forEach(btn => {
    btn.classList.remove('active');
  });
}

function setupWebSocketHandlers() {
  const ws = state.wsManager;

  ws.on('disconnected', () => {
    if (!state.wsManager.isManualDisconnect) {
      elements.connectionIndicator.classList.remove('connected');
      elements.connectionStatus.textContent = 'Disconnected';
    }
  });

  ws.on('reconnecting', ({ attempt, maxAttempts }) => {
    elements.reconnectOverlay.hidden = false;
    const text = elements.reconnectOverlay.querySelector('.overlay-text');
    if (text) text.textContent = `Reconnecting... (${attempt}/${maxAttempts})`;
  });

  ws.on('reconnected', () => {
    elements.reconnectOverlay.hidden = true;
    elements.connectionIndicator.classList.add('connected');
    elements.connectionStatus.textContent = 'Connected';
  });

  ws.on('reconnect_failed', (data) => {
    elements.reconnectOverlay.hidden = true;
    showScreen('connect');
    showError(data?.lastError ? `Connection lost: ${data.lastError}` : 'Connection lost. Please reconnect.');
  });

  ws.on('tabs_update', (message) => { updateTabs(message.tabs); });
}

async function handleConnect() {
  const address = elements.ipInput.value.trim();
  const password = elements.codeInput.value.trim();

  if (!address) {
    showError('Please enter the IP address or hostname');
    return;
  }

  hideError();
  setConnecting(true);

  try {
    const deviceName = getDeviceName();
    const desktopInfo = await state.wsManager.connect(address, 8765, password, deviceName);

    storage.set('audiobash-remote-ip', address);
    if (password) storage.set('audiobash-remote-code', password);

    initializeTerminal(desktopInfo);
    updateTabs(desktopInfo.tabs);
    state.activeTabId = desktopInfo.activeTabId;
    showScreen('terminal');
  } catch (err) {
    showError(err.message);
  } finally {
    setConnecting(false);
  }
}

function handleSendCommand() {
  const command = elements.commandInput?.value?.trim();
  if (!command) return;

  state.wsManager.send({
    type: 'terminal_write',
    tabId: state.activeTabId,
    data: command + '\r',
  });

  elements.commandInput.value = '';
  navigator.vibrate?.(30);
}

function handleDisconnect() {
  state.wsManager.disconnect();
  if (state.terminal) {
    state.terminal.dispose();
    state.terminal = null;
  }
  showScreen('connect');
}

function initializeTerminal(desktopInfo) {
  if (state.terminal) state.terminal.dispose();
  while (elements.terminalContainer.firstChild) {
    elements.terminalContainer.removeChild(elements.terminalContainer.firstChild);
  }
  state.terminal = new RemoteTerminal(elements.terminalContainer, state.wsManager);
  state.terminal.initialize(desktopInfo.activeTabId);
  state.terminal.onTabsUpdate = updateTabs;
}

function updateTabs(tabs) {
  state.tabs = tabs;

  // Clear existing options using safe DOM methods
  while (elements.tabSelector.firstChild) {
    elements.tabSelector.removeChild(elements.tabSelector.firstChild);
  }

  // Build options safely
  for (const tab of tabs) {
    const option = document.createElement('option');
    option.value = tab.id;
    option.textContent = tab.title;
    elements.tabSelector.appendChild(option);
  }

  elements.tabSelector.value = state.activeTabId;
}

function showScreen(name) {
  elements.connectScreen.classList.toggle('active', name === 'connect');
  elements.terminalScreen.classList.toggle('active', name === 'terminal');
}

function showError(message) {
  elements.connectError.textContent = message;
  elements.connectError.classList.add('visible');
}

function hideError() {
  elements.connectError.classList.remove('visible');
}

function setConnecting(connecting) {
  elements.connectBtn.disabled = connecting;
  elements.connectBtn.querySelector('.btn-text').textContent = connecting ? 'Connecting...' : 'Connect';
  elements.connectBtn.querySelector('.btn-spinner').hidden = !connecting;
}

function getDeviceName() {
  const ua = navigator.userAgent;
  if (/Samsung/i.test(ua)) return 'Samsung Device';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android Device';
  return 'Mobile Device';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
