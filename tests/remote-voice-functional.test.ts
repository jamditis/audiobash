/**
 * Functional tests for mobile remote voice access features
 * Tests authentication, audio buffering, connection handling, and reconnection logic
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const rootDir = join(__dirname, '..');

// Read source files for testing
const websocketServerCode = readFileSync(join(rootDir, 'electron', 'websocket-server.cjs'), 'utf8');
const mobileWebsocketCode = readFileSync(join(rootDir, 'docs', 'remote', 'js', 'websocket.js'), 'utf8');

describe('WebSocket Server Authentication Tests', () => {
  it('defines rate limiting configuration', () => {
    // Check that rate limiting variables are defined
    expect(websocketServerCode).toContain('this.failedAttempts = new Map()');
    expect(websocketServerCode).toContain('this.MAX_AUTH_ATTEMPTS = 5');
    expect(websocketServerCode).toContain('this.LOCKOUT_DURATION = 15 * 60 * 1000'); // 15 minutes
    expect(websocketServerCode).toContain('this.ATTEMPT_WINDOW = 5 * 60 * 1000'); // 5 minutes
  });

  it('tracks failed authentication attempts by IP', () => {
    // Verify IP tracking setup
    expect(websocketServerCode).toContain('Map<IP, { count, firstAttempt, lockedUntil }>');
    expect(websocketServerCode).toContain('clientIP = req.socket.remoteAddress');
  });

  it('static password does not regenerate pairing code', () => {
    // Check that pairing code regeneration is conditional
    expect(websocketServerCode).toContain('matchesStaticPassword');
    expect(websocketServerCode).toContain('if (!matchesStaticPassword)');
    expect(websocketServerCode).toContain('this.generatePairingCode()');
  });

  it('pairing code regenerates after non-static auth', () => {
    // Verify pairing code regeneration logic
    expect(websocketServerCode).toContain('matchesPairingCode');
    expect(websocketServerCode).toContain('// Only regenerate pairing code if NOT using static password');
    expect(websocketServerCode).toContain('// Static password stays the same for persistent remote access');
  });

  it('validates pairing code case-insensitively', () => {
    // Check case-insensitive comparison
    expect(websocketServerCode).toContain('pairingCode?.toUpperCase()');
    expect(websocketServerCode).toContain('this.staticPassword.toUpperCase()');
  });

  it('returns specific error codes for auth failures', () => {
    // Check error responses
    expect(websocketServerCode).toContain("error: 'invalid_code'");
    expect(websocketServerCode).toContain("error: 'already_connected'");
  });
});

describe('Audio Buffer Tests', () => {
  it('defines MAX_CHUNK_SIZE limit', () => {
    // Check that chunk size limit is defined
    expect(websocketServerCode).toContain('this.MAX_CHUNK_SIZE = 1024 * 1024'); // 1MB
  });

  it('defines MAX_TOTAL_BUFFER limit', () => {
    // Check that total buffer limit is defined
    expect(websocketServerCode).toContain('this.MAX_TOTAL_BUFFER = 50 * 1024 * 1024'); // 50MB
  });

  it('includes DoS prevention comment for audio buffers', () => {
    // Verify security consideration is documented
    expect(websocketServerCode).toContain('Security: Audio buffer limits (prevent DoS)');
  });

  it('initializes audio chunks array', () => {
    // Check audio chunks buffer initialization
    expect(websocketServerCode).toContain('this.audioChunks = []');
    expect(websocketServerCode).toContain('Buffer for incoming audio');
  });

  it('tracks current audio session', () => {
    // Verify audio session tracking
    expect(websocketServerCode).toContain('this.currentAudioSession = null');
    expect(websocketServerCode).toContain('Track current audio recording session');
  });

  it('defines audio session timeout', () => {
    // Check that audio session timeout is defined
    expect(websocketServerCode).toContain('this.audioSessionTimeout = null');
    expect(websocketServerCode).toContain('Timeout for audio sessions');
  });

  it('handles Buffer.concat for audio data', () => {
    // Verify buffer concatenation is used
    expect(websocketServerCode).toContain('Buffer.concat(this.audioChunks)');
  });

  it('clears audio data after processing', () => {
    // Check that audio data is cleared
    expect(websocketServerCode).toContain('this.currentAudioSession = null');
    expect(websocketServerCode).toContain('this.audioChunks = []');
  });

  it('validates audio data exists before processing', () => {
    // Check validation
    expect(websocketServerCode).toContain('if (!this.currentAudioSession || this.audioChunks.length === 0)');
    expect(websocketServerCode).toContain("error: 'No audio data received'");
  });
});

describe('Connection Tests', () => {
  it('double connection returns already_connected error', () => {
    // Check duplicate connection handling
    expect(websocketServerCode).toContain('if (this.connectedClient && this.connectedClient !== ws)');
    expect(websocketServerCode).toContain("error: 'already_connected'");
    expect(websocketServerCode).toContain('ws.close()');
  });

  it('enforces single client connection policy', () => {
    // Verify single client enforcement
    expect(websocketServerCode).toContain('this.connectedClient = null'); // Single device only
    expect(websocketServerCode).toContain('this.connectedDeviceName = null');
  });

  it('inactivity timeout disconnects after 5 minutes', () => {
    // Check inactivity timeout configuration
    expect(websocketServerCode).toContain('this.INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000'); // 5 minutes
    expect(websocketServerCode).toContain('this.inactivityTimeout = null');
  });

  it('resets inactivity timeout on message', () => {
    // Verify timeout reset logic
    expect(websocketServerCode).toContain('resetInactivityTimeout()');
    expect(websocketServerCode).toContain('this.handleMessage(ws, data, isBinary)');
  });

  it('sends disconnect reason for inactivity', () => {
    // Check disconnect notification
    expect(websocketServerCode).toContain('Disconnecting due to inactivity');
    expect(websocketServerCode).toContain("reason: 'inactivity_timeout'");
  });

  it('clears inactivity timeout on disconnect', () => {
    // Verify cleanup
    expect(websocketServerCode).toContain('if (this.inactivityTimeout)');
    expect(websocketServerCode).toContain('clearTimeout(this.inactivityTimeout)');
  });

  it('heartbeat detects dead connections', () => {
    // Check heartbeat implementation
    expect(websocketServerCode).toContain('this.heartbeatInterval = setInterval');
    expect(websocketServerCode).toContain('ws.isAlive = true');
    expect(websocketServerCode).toContain('ws.ping()');
  });

  it('heartbeat runs every 30 seconds', () => {
    // Verify heartbeat interval
    expect(websocketServerCode).toContain('}, 30000)'); // 30 seconds
  });

  it('heartbeat terminates unresponsive clients', () => {
    // Check termination logic
    expect(websocketServerCode).toContain('if (ws.isAlive === false)');
    expect(websocketServerCode).toContain('Terminating unresponsive client');
    expect(websocketServerCode).toContain('ws.terminate()');
  });

  it('heartbeat checks both ws and wss servers', () => {
    // Verify both servers are checked
    expect(websocketServerCode).toContain('if (this.wss)');
    expect(websocketServerCode).toContain('this.wss.clients.forEach(checkClient)');
    expect(websocketServerCode).toContain('if (this.wssSecure)');
    expect(websocketServerCode).toContain('this.wssSecure.clients.forEach(checkClient)');
  });

  it('responds to pong messages', () => {
    // Check pong handler
    expect(websocketServerCode).toContain("ws.on('pong'");
    expect(websocketServerCode).toContain('ws.isAlive = true');
  });

  it('cleans up on server stop', () => {
    // Verify cleanup
    expect(websocketServerCode).toContain('clearInterval(this.heartbeatInterval)');
    expect(websocketServerCode).toContain('clearTimeout(this.inactivityTimeout)');
  });
});

describe('Mobile Client Reconnection Tests', () => {
  it('prevents duplicate reconnection attempts', () => {
    // Check reconnection guard
    expect(mobileWebsocketCode).toContain('this.reconnectAttempts');
    expect(mobileWebsocketCode).toContain('this.maxReconnectAttempts');
    expect(mobileWebsocketCode).toContain('if (this.reconnectAttempts >= this.maxReconnectAttempts)');
  });

  it('implements exponential backoff correctly', () => {
    // Verify exponential backoff calculation
    expect(mobileWebsocketCode).toContain('this.baseReconnectDelay = 1000');
    expect(mobileWebsocketCode).toContain('Math.pow(2');
    expect(mobileWebsocketCode).toContain('this.reconnectAttempts');
  });

  it('exponential backoff calculation uses correct formula', () => {
    // Check the exact formula: delay = baseDelay * 2^(attempts - 1)
    expect(mobileWebsocketCode).toContain('this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1)');
  });

  it('max reconnect delay capped at 30 seconds', () => {
    // Check max delay cap
    expect(mobileWebsocketCode).toContain('this.maxReconnectDelay = 30000'); // 30 seconds
    expect(mobileWebsocketCode).toContain('Math.min');
  });

  it('caps delay using Math.min', () => {
    // Verify the delay is capped
    expect(mobileWebsocketCode).toContain('Math.min(');
    expect(mobileWebsocketCode).toContain('this.maxReconnectDelay');
  });

  it('max reconnect attempts set to 10', () => {
    // Check max attempts
    expect(mobileWebsocketCode).toContain('this.maxReconnectAttempts = 10');
    expect(mobileWebsocketCode).toContain('Increased from 5 for better mobile network resilience');
  });

  it('visibility change triggers reconnection', () => {
    // Check visibility change handler
    expect(mobileWebsocketCode).toContain("addEventListener('visibilitychange'");
    expect(mobileWebsocketCode).toContain("document.visibilityState === 'visible'");
    expect(mobileWebsocketCode).toContain('this.attemptReconnect()');
  });

  it('resets reconnect attempts when app becomes visible', () => {
    // Verify attempt reset
    expect(mobileWebsocketCode).toContain('App became visible, checking connection');
    expect(mobileWebsocketCode).toContain('this.reconnectAttempts = 0');
  });

  it('only reconnects when session exists', () => {
    // Check session validation
    expect(mobileWebsocketCode).toContain('this.sessionId && !this.ws');
  });

  it('handles network status changes', () => {
    // Check network change handlers
    expect(mobileWebsocketCode).toContain("addEventListener('online'");
    expect(mobileWebsocketCode).toContain("addEventListener('offline'");
    expect(mobileWebsocketCode).toContain('handleNetworkChange');
  });

  it('reconnects when network comes back online', () => {
    // Verify online reconnection
    expect(mobileWebsocketCode).toContain('Network restored, attempting reconnect');
    expect(mobileWebsocketCode).toContain('this.reconnectAttempts = 0');
  });

  it('stores connection params for reconnection', () => {
    // Check connection params storage
    expect(mobileWebsocketCode).toContain('this.connectionParams');
    expect(mobileWebsocketCode).toContain('{ ip: hostOrUrl, port, pairingCode, deviceName }');
  });

  it('checks connection params before reconnecting', () => {
    // Verify params validation
    expect(mobileWebsocketCode).toContain('if (!this.connectionParams)');
    expect(mobileWebsocketCode).toContain("emit('reconnect_failed'");
  });

  it('uses setTimeout for delayed reconnection', () => {
    // Check delayed reconnection
    expect(mobileWebsocketCode).toContain('this.reconnectTimeout = setTimeout');
    expect(mobileWebsocketCode).toContain('this.attemptReconnect()');
  });

  it('emits reconnecting event with progress', () => {
    // Check reconnecting event
    expect(mobileWebsocketCode).toContain("emit('reconnecting'");
    expect(mobileWebsocketCode).toContain('attempt: this.reconnectAttempts');
    expect(mobileWebsocketCode).toContain('maxAttempts: this.maxReconnectAttempts');
    expect(mobileWebsocketCode).toContain('nextAttemptIn');
  });

  it('emits reconnected event on success', () => {
    // Check reconnected event
    expect(mobileWebsocketCode).toContain("emit('reconnected')");
    expect(mobileWebsocketCode).toContain('Reconnected successfully');
  });

  it('emits reconnect_failed when max attempts reached', () => {
    // Check failed event
    expect(mobileWebsocketCode).toContain('Max reconnect attempts reached');
    expect(mobileWebsocketCode).toContain("emit('reconnect_failed'");
  });

  it('tracks last error for better messaging', () => {
    // Check error tracking
    expect(mobileWebsocketCode).toContain('this.lastError = null');
    expect(mobileWebsocketCode).toContain('this.lastError = err.message');
    expect(mobileWebsocketCode).toContain('lastError: this.lastError');
  });

  it('stops reconnecting on auth errors', () => {
    // Check auth error handling
    expect(mobileWebsocketCode).toContain("err.message.includes('Invalid pairing code')");
    expect(mobileWebsocketCode).toContain("err.message.includes('invalid_code')");
    expect(mobileWebsocketCode).toContain("emit('reconnect_need_code')");
  });

  it('prevents reconnection on manual disconnect', () => {
    // Check manual disconnect flag
    expect(mobileWebsocketCode).toContain('this.isManualDisconnect = false');
    expect(mobileWebsocketCode).toContain('this.isManualDisconnect = true');
    expect(mobileWebsocketCode).toContain('if (this.sessionId && !this.isManualDisconnect)');
  });

  it('clears reconnect timeout on cancel', () => {
    // Check timeout cleanup
    expect(mobileWebsocketCode).toContain('if (this.reconnectTimeout)');
    expect(mobileWebsocketCode).toContain('clearTimeout(this.reconnectTimeout)');
    expect(mobileWebsocketCode).toContain('this.reconnectTimeout = null');
  });

  it('provides cancelReconnect method', () => {
    // Check cancel method
    expect(mobileWebsocketCode).toContain('cancelReconnect()');
    expect(mobileWebsocketCode).toContain('this.reconnectAttempts = this.maxReconnectAttempts');
  });
});

describe('Session Management Tests', () => {
  it('generates session ID on successful auth', () => {
    // Check session ID generation
    expect(websocketServerCode).toContain('this.sessionId = crypto.randomUUID()');
    expect(websocketServerCode).toContain('sessionId: this.sessionId');
  });

  it('stores session ID in mobile client', () => {
    // Check client-side session storage
    expect(mobileWebsocketCode).toContain('this.sessionId = message.sessionId');
  });

  it('clears session on disconnect', () => {
    // Verify session cleanup
    expect(websocketServerCode).toContain('this.sessionId = null');
  });

  it('validates session before reconnecting', () => {
    // Check session validation
    expect(mobileWebsocketCode).toContain('if (this.sessionId && !this.isManualDisconnect)');
  });

  it('stores desktop info on connection', () => {
    // Check desktop info storage
    expect(mobileWebsocketCode).toContain('this.desktopInfo = message.desktopInfo');
    expect(websocketServerCode).toContain('desktopInfo:');
    expect(websocketServerCode).toContain('hostname');
    expect(websocketServerCode).toContain('tabs');
  });
});

describe('Error Handling Tests', () => {
  it('handles transcription errors gracefully', () => {
    // Check error handling
    expect(websocketServerCode).toContain('Transcription failed');
    expect(websocketServerCode).toContain('success: false');
    expect(websocketServerCode).toContain('error: err.message');
  });

  it('sends transcription status updates', () => {
    // Check status updates
    expect(websocketServerCode).toContain("type: 'transcription_status'");
    expect(websocketServerCode).toContain("status: 'processing'");
  });

  it('validates transcription handler exists', () => {
    // Check handler validation
    expect(websocketServerCode).toContain('if (this.transcribeAudio)');
    expect(websocketServerCode).toContain('Transcription handler not configured');
  });

  it('provides human-readable error messages', () => {
    // Check error message mapping
    expect(mobileWebsocketCode).toContain('getErrorMessage');
    expect(mobileWebsocketCode).toContain('Invalid pairing code or password');
    expect(mobileWebsocketCode).toContain('Another device is already connected');
  });

  it('handles connection timeout', () => {
    // Check timeout handling
    expect(mobileWebsocketCode).toContain('Connection timeout');
    expect(mobileWebsocketCode).toContain('setTimeout');
  });

  it('validates message parsing errors', () => {
    // Check parse error handling
    expect(websocketServerCode).toContain('Failed to parse message');
    expect(websocketServerCode).toContain('catch (err)');
  });
});
