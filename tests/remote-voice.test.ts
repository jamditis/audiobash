/**
 * Tests for mobile remote voice access features
 * Verifies the WebSocket server, voice recording, and transcription pipeline
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const rootDir = join(__dirname, '..');

// Read source files for testing
const websocketServerCode = readFileSync(join(rootDir, 'electron', 'websocket-server.cjs'), 'utf8');
const mainProcessCode = readFileSync(join(rootDir, 'electron', 'main.cjs'), 'utf8');
const preloadCode = readFileSync(join(rootDir, 'electron', 'preload.cjs'), 'utf8');

// Mobile client files
const mobileAppCode = readFileSync(join(rootDir, 'docs', 'remote', 'js', 'app.js'), 'utf8');
const mobileVoiceCode = readFileSync(join(rootDir, 'docs', 'remote', 'js', 'voice.js'), 'utf8');
const mobileWebsocketCode = readFileSync(join(rootDir, 'docs', 'remote', 'js', 'websocket.js'), 'utf8');

describe('WebSocket server', () => {
  it('creates both ws:// and wss:// servers', () => {
    expect(websocketServerCode).toContain('this.port = options.port || 8765');
    expect(websocketServerCode).toContain('this.securePort = options.securePort || 8766');
    expect(websocketServerCode).toContain('WebSocketServer');
  });

  it('generates 6-character pairing codes', () => {
    expect(websocketServerCode).toContain('generatePairingCode');
    expect(websocketServerCode).toContain('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    expect(websocketServerCode).toContain('length: 6');
  });

  it('supports static password for persistent access', () => {
    expect(websocketServerCode).toContain('setStaticPassword');
    expect(websocketServerCode).toContain('getStaticPasswordValue');
    expect(websocketServerCode).toContain('hasStaticPassword');
  });

  it('enforces single client connection', () => {
    expect(websocketServerCode).toContain('connectedClient');
    expect(websocketServerCode).toContain('already_connected');
  });

  it('implements heartbeat for dead connection detection', () => {
    expect(websocketServerCode).toContain('heartbeatInterval');
    expect(websocketServerCode).toContain('ws.isAlive');
    expect(websocketServerCode).toContain('ping');
    expect(websocketServerCode).toContain('pong');
  });

  it('implements inactivity timeout', () => {
    expect(websocketServerCode).toContain('INACTIVITY_TIMEOUT_MS');
    expect(websocketServerCode).toContain('resetInactivityTimeout');
    expect(websocketServerCode).toContain('inactivity_timeout');
  });
});

describe('WebSocket authentication', () => {
  it('validates pairing code on auth', () => {
    expect(websocketServerCode).toContain("case 'auth':");
    expect(websocketServerCode).toContain('handleAuth');
    expect(websocketServerCode).toContain('invalid_code');
  });

  it('checks static password before pairing code', () => {
    expect(websocketServerCode).toContain('matchesStaticPassword');
    expect(websocketServerCode).toContain('matchesPairingCode');
  });

  it('regenerates pairing code after successful auth', () => {
    expect(websocketServerCode).toContain('generatePairingCode');
    expect(websocketServerCode).toContain('!matchesStaticPassword');
  });

  it('sends desktop info on successful auth', () => {
    expect(websocketServerCode).toContain('auth_response');
    expect(websocketServerCode).toContain('desktopInfo');
    expect(websocketServerCode).toContain('hostname');
    expect(websocketServerCode).toContain('tabs');
  });
});

describe('WebSocket message handling', () => {
  it('handles terminal write messages', () => {
    expect(websocketServerCode).toContain("case 'terminal_write':");
    expect(websocketServerCode).toContain('handleTerminalWrite');
    expect(websocketServerCode).toContain('ptyProcess.write');
  });

  it('handles audio start messages', () => {
    expect(websocketServerCode).toContain("case 'audio_start':");
    expect(websocketServerCode).toContain('handleAudioStart');
    expect(websocketServerCode).toContain('audioChunks');
  });

  it('handles binary audio data', () => {
    expect(websocketServerCode).toContain('isBinary');
    expect(websocketServerCode).toContain('handleAudioData');
    expect(websocketServerCode).toContain('audioChunks.push');
  });

  it('handles audio end and triggers transcription', () => {
    expect(websocketServerCode).toContain("case 'audio_end':");
    expect(websocketServerCode).toContain('handleAudioEnd');
    expect(websocketServerCode).toContain('transcribeAudio');
    expect(websocketServerCode).toContain('transcription_status');
  });

  it('handles tab switching', () => {
    expect(websocketServerCode).toContain("case 'switch_tab':");
    expect(websocketServerCode).toContain('handleSwitchTab');
    expect(websocketServerCode).toContain('remote-switch-tab');
  });
});

describe('Mobile voice recorder', () => {
  it('checks for browser support', () => {
    expect(mobileVoiceCode).toContain('static isSupported()');
    expect(mobileVoiceCode).toContain('navigator.mediaDevices');
    expect(mobileVoiceCode).toContain('getUserMedia');
    expect(mobileVoiceCode).toContain('MediaRecorder');
  });

  it('checks for secure context', () => {
    expect(mobileVoiceCode).toContain('isSecureContext');
    expect(mobileVoiceCode).toContain('https:');
    expect(mobileVoiceCode).toContain('localhost');
  });

  it('supports agent and raw modes', () => {
    expect(mobileVoiceCode).toContain('setMode');
    expect(mobileVoiceCode).toContain("this.mode = 'agent'");
    expect(mobileVoiceCode).toContain("this.mode = mode");
  });

  it('streams audio in chunks', () => {
    expect(mobileVoiceCode).toContain('ondataavailable');
    expect(mobileVoiceCode).toContain('sendBinary');
    expect(mobileVoiceCode).toContain('250'); // 250ms timeslices
  });

  it('validates minimum recording duration', () => {
    expect(mobileVoiceCode).toContain('minRecordingDuration');
    expect(mobileVoiceCode).toContain('Recording too short');
  });

  it('handles microphone permission errors', () => {
    expect(mobileVoiceCode).toContain('NotAllowedError');
    expect(mobileVoiceCode).toContain('NotFoundError');
    expect(mobileVoiceCode).toContain('NotReadableError');
    expect(mobileVoiceCode).toContain('Microphone access denied');
  });

  it('provides detailed support info for debugging', () => {
    expect(mobileVoiceCode).toContain('getSupportInfo');
    expect(mobileVoiceCode).toContain('getSupportedMimeTypes');
  });

  it('has error callback for UI updates', () => {
    expect(mobileVoiceCode).toContain('onError');
    expect(mobileVoiceCode).toContain('notifyError');
  });
});

describe('Mobile WebSocket manager', () => {
  it('supports auto-reconnection', () => {
    expect(mobileWebsocketCode).toContain('maxReconnectAttempts');
    expect(mobileWebsocketCode).toContain('reconnectAttempts');
    expect(mobileWebsocketCode).toContain('handleDisconnect');
    expect(mobileWebsocketCode).toContain('attemptReconnect');
  });

  it('uses exponential backoff for reconnection', () => {
    expect(mobileWebsocketCode).toContain('baseReconnectDelay');
    expect(mobileWebsocketCode).toContain('Math.pow(2');
    expect(mobileWebsocketCode).toContain('maxReconnectDelay');
  });

  it('handles network status changes', () => {
    expect(mobileWebsocketCode).toContain('handleNetworkChange');
    expect(mobileWebsocketCode).toContain("'online'");
    expect(mobileWebsocketCode).toContain("'offline'");
  });

  it('handles visibility changes for app backgrounding', () => {
    expect(mobileWebsocketCode).toContain('visibilitychange');
    expect(mobileWebsocketCode).toContain('visibilityState');
  });

  it('supports both IP address and tunnel URL formats', () => {
    expect(mobileWebsocketCode).toContain('tunnelto');
    expect(mobileWebsocketCode).toContain('wss://');
    expect(mobileWebsocketCode).toContain('ws://');
  });

  it('tracks last error for better messaging', () => {
    expect(mobileWebsocketCode).toContain('lastError');
  });

  it('emits reconnection events with progress info', () => {
    expect(mobileWebsocketCode).toContain("emit('reconnecting'");
    expect(mobileWebsocketCode).toContain("emit('reconnected')");
    expect(mobileWebsocketCode).toContain("emit('reconnect_failed'");
    expect(mobileWebsocketCode).toContain('maxAttempts');
  });

  it('provides human-readable error messages', () => {
    expect(mobileWebsocketCode).toContain('getErrorMessage');
    expect(mobileWebsocketCode).toContain('Invalid pairing code');
    expect(mobileWebsocketCode).toContain('Another device is already connected');
  });
});

describe('Mobile app UI', () => {
  it('shows detailed voice support errors', () => {
    expect(mobileAppCode).toContain('Voice not supported in this browser');
    expect(mobileAppCode).toContain('Voice requires HTTPS');
    expect(mobileAppCode).toContain('MediaRecorder API not available');
  });

  it('shows reconnection progress', () => {
    expect(mobileAppCode).toContain('Reconnecting...');
    expect(mobileAppCode).toContain('maxAttempts');
  });

  it('handles reconnection success', () => {
    expect(mobileAppCode).toContain("ws.on('reconnected'");
    expect(mobileAppCode).toContain('Reconnected successfully');
  });

  it('handles voice recorder errors', () => {
    expect(mobileAppCode).toContain('onError');
    expect(mobileAppCode).toContain('showTranscriptionPreview');
  });

  it('initializes voice recorder with mode', () => {
    expect(mobileAppCode).toContain('initializeVoiceRecorder');
    expect(mobileAppCode).toContain('setMode(state.mode)');
  });
});

describe('Remote control IPC', () => {
  it('exposes remote control API in preload', () => {
    expect(preloadCode).toContain('getRemoteStatus');
    expect(preloadCode).toContain('regeneratePairingCode');
    expect(preloadCode).toContain('setRemotePassword');
    expect(preloadCode).toContain('getRemotePassword');
  });

  it('exposes remote status change listener', () => {
    expect(preloadCode).toContain('onRemoteStatusChanged');
    expect(preloadCode).toContain('remote-status-changed');
  });

  it('handles remote transcription requests', () => {
    expect(preloadCode).toContain('onRemoteTranscriptionRequest');
    expect(preloadCode).toContain('remote-transcription-request');
    expect(preloadCode).toContain('sendRemoteTranscriptionResult');
  });

  it('exposes tunnel service API', () => {
    expect(preloadCode).toContain('tunnelStart');
    expect(preloadCode).toContain('tunnelStop');
    expect(preloadCode).toContain('tunnelGetStatus');
  });
});

describe('Main process remote integration', () => {
  it('initializes remote control server', () => {
    expect(mainProcessCode).toContain('RemoteControlServer');
    expect(mainProcessCode).toContain('remoteServer');
  });

  it('handles remote transcription bridge', () => {
    expect(mainProcessCode).toContain('handleRemoteTranscription');
    expect(mainProcessCode).toContain('remote-transcription-request');
    expect(mainProcessCode).toContain('remote-transcription-result');
  });

  it('sends terminal data to remote clients', () => {
    expect(mainProcessCode).toContain('sendTerminalData');
  });
});

describe('Tunnel service', () => {
  const tunnelServicePath = join(rootDir, 'electron', 'tunnelService.cjs');

  it('tunnel service file exists', () => {
    expect(existsSync(tunnelServicePath)).toBe(true);
  });

  it('uses tunnelto for public access', () => {
    const tunnelServiceCode = readFileSync(tunnelServicePath, 'utf8');
    expect(tunnelServiceCode).toContain('tunnelto');
    expect(tunnelServiceCode).toContain('--port');
    expect(tunnelServiceCode).toContain('--subdomain');
  });
});

describe('Mobile PWA manifest', () => {
  const manifestPath = join(rootDir, 'docs', 'remote', 'manifest.json');

  it('PWA manifest exists', () => {
    expect(existsSync(manifestPath)).toBe(true);
  });

  it('has correct PWA configuration', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.name).toContain('AudioBash');
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBeDefined();
  });
});
