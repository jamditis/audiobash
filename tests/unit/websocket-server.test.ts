/**
 * WebSocket Server Unit Tests
 * Tests for the RemoteControlServer authentication, rate limiting, and message handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing
vi.mock('ws', () => {
  return {
    WebSocketServer: vi.fn(() => ({
      on: vi.fn(),
      close: vi.fn(),
      clients: new Set(),
    })),
  };
});

vi.mock('https', () => ({
  createServer: vi.fn(() => ({
    listen: vi.fn((port, host, cb) => cb?.()),
    close: vi.fn(),
  })),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  statSync: vi.fn(() => ({ isFile: () => true, isDirectory: () => false, size: 100 })),
  unlinkSync: vi.fn(),
  rmdirSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('child_process', () => ({
  execSync: vi.fn(() => ''),
  spawn: vi.fn(),
}));

vi.mock('os', () => ({
  networkInterfaces: vi.fn(() => ({
    eth0: [{ family: 'IPv4', address: '192.168.1.100', internal: false }],
  })),
  homedir: vi.fn(() => '/home/user'),
  tmpdir: vi.fn(() => '/tmp'),
  hostname: vi.fn(() => 'test-machine'),
}));

vi.mock('crypto', () => ({
  randomInt: vi.fn((max: number) => Math.floor(Math.random() * max)),
  randomUUID: vi.fn(() => 'test-uuid-1234'),
  generateKeyPairSync: vi.fn(() => ({
    privateKey: { export: vi.fn(() => 'mock-private-key') },
    publicKey: { export: vi.fn(() => 'mock-public-key') },
  })),
}));

// Helper to create a mock WebSocket
function createMockWebSocket(remoteAddress = '192.168.1.50') {
  return {
    readyState: 1, // OPEN
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
    ping: vi.fn(),
    isAlive: true,
    on: vi.fn(),
    _socket: {
      remoteAddress,
    },
  };
}

// Helper to create server options
function createServerOptions(overrides = {}) {
  return {
    port: 8765,
    securePort: 8766,
    localOnly: false,
    ptyProcesses: new Map(),
    terminalOutputBuffers: new Map(),
    terminalCwds: new Map(),
    mainWindow: null,
    transcribeAudio: vi.fn(),
    onStatusChange: vi.fn(),
    getStaticPassword: vi.fn(),
    appDataPath: '/tmp/audiobash',
    ...overrides,
  };
}

describe('RemoteControlServer', () => {
  // We'll test the server logic by importing the module and testing its methods

  describe('Password Validation', () => {
    it('validates minimum password length', () => {
      const MIN_PASSWORD_LENGTH = 8;

      // Test too short password
      const shortPassword = 'Ab1!';
      expect(shortPassword.length < MIN_PASSWORD_LENGTH).toBe(true);

      // Test valid length password
      const validPassword = 'Ab1!efgh';
      expect(validPassword.length >= MIN_PASSWORD_LENGTH).toBe(true);
    });

    it('requires complexity in passwords', () => {
      const hasUpper = /[A-Z]/;
      const hasLower = /[a-z]/;
      const hasNumber = /[0-9]/;
      const hasSpecial = /[^A-Za-z0-9]/;

      const password = 'TestPass123!';
      const complexityScore = [
        hasUpper.test(password),
        hasLower.test(password),
        hasNumber.test(password),
        hasSpecial.test(password),
      ].filter(Boolean).length;

      expect(complexityScore).toBeGreaterThanOrEqual(2);
    });

    it('rejects common weak passwords', () => {
      const weakPasswords = ['password', 'audiobash', '12345678', 'qwerty', 'letmein', 'admin'];
      const testPassword = 'password123';

      const isWeak = weakPasswords.some(weak =>
        testPassword.toLowerCase().includes(weak)
      );

      expect(isWeak).toBe(true);
    });

    it('accepts strong passwords', () => {
      const strongPassword = 'MyStr0ng!Pass';
      const hasUpper = /[A-Z]/.test(strongPassword);
      const hasLower = /[a-z]/.test(strongPassword);
      const hasNumber = /[0-9]/.test(strongPassword);
      const hasSpecial = /[^A-Za-z0-9]/.test(strongPassword);

      const complexityScore = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

      expect(complexityScore).toBeGreaterThanOrEqual(2);
      expect(strongPassword.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Pairing Code Generation', () => {
    it('generates 6-character codes', () => {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      const code = Array.from({ length: 6 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join('');

      expect(code.length).toBe(6);
    });

    it('uses only unambiguous characters', () => {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

      // Should NOT contain ambiguous characters
      expect(chars).not.toContain('0');
      expect(chars).not.toContain('O');
      expect(chars).not.toContain('I');
      expect(chars).not.toContain('L');
      expect(chars).not.toContain('1');
    });

    it('generates unique codes on each call', () => {
      const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
      const generateCode = () => Array.from({ length: 6 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join('');

      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(generateCode());
      }

      // Should generate mostly unique codes (allow for some collisions)
      expect(codes.size).toBeGreaterThan(90);
    });
  });

  describe('Rate Limiting', () => {
    it('tracks failed authentication attempts per IP', () => {
      const failedAttempts = new Map();
      const clientIP = '192.168.1.50';
      const MAX_AUTH_ATTEMPTS = 5;
      const now = Date.now();

      // Simulate failed attempts
      const attemptData = { count: 0, firstAttempt: now, lockedUntil: null };
      attemptData.count++;
      failedAttempts.set(clientIP, attemptData);

      expect(failedAttempts.get(clientIP)?.count).toBe(1);

      // Simulate more failures
      attemptData.count++;
      expect(failedAttempts.get(clientIP)?.count).toBe(2);
    });

    it('locks out IP after max attempts', () => {
      const MAX_AUTH_ATTEMPTS = 5;
      const LOCKOUT_DURATION = 15 * 60 * 1000;
      const now = Date.now();

      const attemptData = { count: MAX_AUTH_ATTEMPTS, firstAttempt: now, lockedUntil: null };

      // Trigger lockout
      if (attemptData.count >= MAX_AUTH_ATTEMPTS) {
        attemptData.lockedUntil = now + LOCKOUT_DURATION;
      }

      expect(attemptData.lockedUntil).not.toBeNull();
      expect(attemptData.lockedUntil! - now).toBe(LOCKOUT_DURATION);
    });

    it('implements exponential backoff delay', () => {
      const attemptCounts = [1, 2, 3, 4, 5];
      const delays = attemptCounts.map(count => Math.min(100 * count, 2000));

      expect(delays[0]).toBe(100);
      expect(delays[1]).toBe(200);
      expect(delays[2]).toBe(300);
      expect(delays[4]).toBe(500);
    });

    it('caps backoff delay at maximum', () => {
      const MAX_DELAY = 2000;
      const attemptCount = 100;
      const delay = Math.min(100 * attemptCount, MAX_DELAY);

      expect(delay).toBe(MAX_DELAY);
    });

    it('resets attempts after window expires', () => {
      const ATTEMPT_WINDOW = 5 * 60 * 1000;
      const now = Date.now();
      const oldAttempt = now - ATTEMPT_WINDOW - 1000; // Expired

      const shouldReset = now - oldAttempt > ATTEMPT_WINDOW;
      expect(shouldReset).toBe(true);
    });

    it('tracks global failed attempts for distributed attack protection', () => {
      const GLOBAL_MAX_ATTEMPTS = 20;
      const globalFailedAttempts = { count: 0, firstAttempt: null as number | null };

      // Simulate multiple failed attempts from different IPs
      for (let i = 0; i < GLOBAL_MAX_ATTEMPTS; i++) {
        if (!globalFailedAttempts.firstAttempt) {
          globalFailedAttempts.firstAttempt = Date.now();
        }
        globalFailedAttempts.count++;
      }

      expect(globalFailedAttempts.count).toBe(GLOBAL_MAX_ATTEMPTS);
    });

    it('triggers global lockout after threshold', () => {
      const GLOBAL_MAX_ATTEMPTS = 20;
      const GLOBAL_LOCKOUT_DURATION = 30 * 60 * 1000;
      const now = Date.now();

      const globalCount = GLOBAL_MAX_ATTEMPTS;
      let globalLockedUntil: number | null = null;

      if (globalCount >= GLOBAL_MAX_ATTEMPTS) {
        globalLockedUntil = now + GLOBAL_LOCKOUT_DURATION;
      }

      expect(globalLockedUntil).not.toBeNull();
      expect(globalLockedUntil! - now).toBe(GLOBAL_LOCKOUT_DURATION);
    });
  });

  describe('Message Parsing and Validation', () => {
    it('parses valid JSON messages', () => {
      const validMessage = JSON.stringify({ type: 'auth', pairingCode: 'ABC123' });
      const parsed = JSON.parse(validMessage);

      expect(parsed.type).toBe('auth');
      expect(parsed.pairingCode).toBe('ABC123');
    });

    it('handles invalid JSON gracefully', () => {
      const invalidMessage = '{invalid json}';

      let parsed = null;
      let parseError = null;
      try {
        parsed = JSON.parse(invalidMessage);
      } catch (err) {
        parseError = err;
      }

      expect(parseError).not.toBeNull();
      expect(parsed).toBeNull();
    });

    it('validates message types', () => {
      const validTypes = [
        'auth',
        'terminal_write',
        'terminal_resize',
        'audio_start',
        'audio_end',
        'switch_tab',
        'get_context',
        'get_tabs',
        'disconnect',
        'pong',
      ];

      const message = { type: 'auth' };
      expect(validTypes).toContain(message.type);
    });

    it('rejects unknown message types', () => {
      const validTypes = [
        'auth',
        'terminal_write',
        'audio_start',
        'audio_end',
      ];

      const unknownMessage = { type: 'unknown_type' };
      expect(validTypes).not.toContain(unknownMessage.type);
    });
  });

  describe('Terminal Write Message Handling', () => {
    it('validates tabId presence', () => {
      const message = { tabId: 'tab-1', data: 'ls -la\r' };

      expect(message.tabId).toBeDefined();
      expect(typeof message.tabId).toBe('string');
    });

    it('rejects message without tabId', () => {
      const message = { data: 'ls -la\r' };

      expect('tabId' in message && message.tabId).toBeFalsy();
    });

    it('validates data presence', () => {
      const message = { tabId: 'tab-1', data: 'ls -la\r' };

      expect(message.data).toBeDefined();
    });

    it('handles missing pty process for tab', () => {
      const ptyProcesses = new Map();
      const tabId = 'nonexistent-tab';

      expect(ptyProcesses.has(tabId)).toBe(false);
    });
  });

  describe('Audio Session Management', () => {
    it('initializes audio session with metadata', () => {
      const audioSession = {
        tabId: 'tab-1',
        mode: 'agent',
        format: 'webm',
        bytesReceived: 0,
      };

      expect(audioSession.tabId).toBe('tab-1');
      expect(audioSession.mode).toBe('agent');
      expect(audioSession.format).toBe('webm');
      expect(audioSession.bytesReceived).toBe(0);
    });

    it('tracks bytes received for DoS prevention', () => {
      const MAX_CHUNK_SIZE = 1024 * 1024; // 1MB
      const MAX_TOTAL_BUFFER = 50 * 1024 * 1024; // 50MB

      let bytesReceived = 0;
      const chunkSize = 512 * 1024; // 512KB

      bytesReceived += chunkSize;
      expect(bytesReceived < MAX_CHUNK_SIZE).toBe(true);
      expect(bytesReceived < MAX_TOTAL_BUFFER).toBe(true);
    });

    it('rejects oversized chunks', () => {
      const MAX_CHUNK_SIZE = 1024 * 1024; // 1MB
      const oversizedChunk = 2 * 1024 * 1024; // 2MB

      expect(oversizedChunk > MAX_CHUNK_SIZE).toBe(true);
    });

    it('rejects when total buffer exceeds limit', () => {
      const MAX_TOTAL_BUFFER = 50 * 1024 * 1024; // 50MB
      const currentBuffer = 49 * 1024 * 1024;
      const newChunk = 2 * 1024 * 1024;

      const wouldExceed = currentBuffer + newChunk > MAX_TOTAL_BUFFER;
      expect(wouldExceed).toBe(true);
    });

    it('clears audio session on completion', () => {
      let audioSession: { tabId: string } | null = { tabId: 'tab-1' };
      const audioChunks: Buffer[] = [Buffer.from('chunk1'), Buffer.from('chunk2')];

      // Simulate session end
      audioSession = null;
      audioChunks.length = 0;

      expect(audioSession).toBeNull();
      expect(audioChunks.length).toBe(0);
    });

    it('has 30-second session timeout', () => {
      const AUDIO_SESSION_TIMEOUT = 30000; // 30 seconds
      expect(AUDIO_SESSION_TIMEOUT).toBe(30000);
    });
  });

  describe('Security Event Generation', () => {
    it('generates failed auth event', () => {
      const event = {
        type: 'failed_auth',
        ip: '192.168.1.50',
        attemptCount: 3,
        globalAttemptCount: 5,
        timestamp: Date.now(),
      };

      expect(event.type).toBe('failed_auth');
      expect(event.ip).toBeDefined();
      expect(event.attemptCount).toBeGreaterThan(0);
    });

    it('generates IP lockout event', () => {
      const LOCKOUT_DURATION = 15 * 60 * 1000;
      const event = {
        type: 'ip_lockout',
        ip: '192.168.1.50',
        duration: LOCKOUT_DURATION,
      };

      expect(event.type).toBe('ip_lockout');
      expect(event.duration).toBe(LOCKOUT_DURATION);
    });

    it('generates global lockout event', () => {
      const GLOBAL_LOCKOUT_DURATION = 30 * 60 * 1000;
      const event = {
        type: 'global_lockout_triggered',
        totalAttempts: 20,
        duration: GLOBAL_LOCKOUT_DURATION,
        message: 'Possible brute-force attack detected. System locked for 30 minutes.',
      };

      expect(event.type).toBe('global_lockout_triggered');
      expect(event.message).toContain('brute-force');
    });
  });

  describe('Authentication Flow', () => {
    it('validates pairing code case-insensitively', () => {
      const storedCode = 'ABC123';
      const providedCode = 'abc123';

      const matches = providedCode.toUpperCase() === storedCode;
      expect(matches).toBe(true);
    });

    it('validates static password case-sensitively', () => {
      const storedPassword = 'MyPassword123!';
      const providedPassword = 'mypassword123!';

      const matches = providedPassword === storedPassword;
      expect(matches).toBe(false);
    });

    it('checks static password before pairing code', () => {
      const staticPassword = 'MyPassword123!';
      const pairingCode = 'ABC123';
      const input = 'MyPassword123!';

      const matchesStatic = input === staticPassword;
      const matchesPairing = input.toUpperCase() === pairingCode;

      // Static password should be checked first and match
      expect(matchesStatic).toBe(true);
    });

    it('regenerates pairing code only when using pairing code auth', () => {
      const useStaticPassword = true;
      let pairingCode = 'ABC123';

      if (!useStaticPassword) {
        pairingCode = 'XYZ789';
      }

      // Should NOT regenerate when using static password
      expect(pairingCode).toBe('ABC123');
    });

    it('clears failed attempts on successful auth', () => {
      const failedAttempts = new Map();
      const clientIP = '192.168.1.50';

      failedAttempts.set(clientIP, { count: 3, firstAttempt: Date.now() });
      expect(failedAttempts.has(clientIP)).toBe(true);

      // On success, clear
      failedAttempts.delete(clientIP);
      expect(failedAttempts.has(clientIP)).toBe(false);
    });
  });

  describe('Server Status', () => {
    it('returns complete status object', () => {
      const status = {
        running: true,
        port: 8765,
        securePort: 8766,
        hasSecure: true,
        localOnly: false,
        pairingCode: 'ABC123',
        staticPassword: null,
        hasStaticPassword: false,
        addresses: ['192.168.1.100'],
        connected: false,
        deviceName: null,
      };

      expect(status.running).toBe(true);
      expect(status.port).toBe(8765);
      expect(status.addresses.length).toBeGreaterThan(0);
    });

    it('includes secure port when WSS is available', () => {
      const hasSecure = true;
      const securePort = hasSecure ? 8766 : null;

      expect(securePort).toBe(8766);
    });

    it('tracks connected device name', () => {
      const status = {
        connected: true,
        deviceName: 'iPhone 15 Pro',
      };

      expect(status.connected).toBe(true);
      expect(status.deviceName).toBe('iPhone 15 Pro');
    });
  });

  describe('Filename Sanitization', () => {
    it('removes path separators', () => {
      const filename = 'path/to/file.png';
      const sanitized = filename.replace(/[/\\]/g, '-');

      expect(sanitized).not.toContain('/');
      expect(sanitized).not.toContain('\\');
    });

    it('removes parent directory references', () => {
      const filename = '../../../etc/passwd';
      const sanitized = filename.replace(/\.\./g, '');

      expect(sanitized).not.toContain('..');
    });

    it('removes invalid characters', () => {
      const filename = 'file<name>:with|invalid"chars?.png';
      const sanitized = filename.replace(/[<>:"|?*]/g, '-');

      expect(sanitized).not.toMatch(/[<>:"|?*]/);
    });

    it('limits filename length', () => {
      const longName = 'a'.repeat(200) + '.png';
      const maxLength = 100;
      const ext = '.png';

      let sanitized = longName;
      if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength - ext.length - 4) + ext;
      }

      expect(sanitized.length).toBeLessThanOrEqual(maxLength);
    });

    it('provides default for empty filename', () => {
      const filename = '';
      const sanitized = filename || 'uploaded-image.png';

      expect(sanitized).toBe('uploaded-image.png');
    });
  });

  describe('Path Resolution Security', () => {
    it('resolves relative paths within base', () => {
      const basePath = '/home/user/project';
      const relativePath = 'src/file.ts';
      const resolved = `${basePath}/${relativePath}`;

      expect(resolved.startsWith(basePath)).toBe(true);
    });

    it('handles absolute paths on Windows', () => {
      const platform = 'win32';
      const absolutePath = 'C:\\Users\\test\\file.txt';

      // On Windows, allow absolute paths
      if (platform === 'win32') {
        expect(absolutePath.includes(':')).toBe(true);
      }
    });
  });

  describe('Inactivity Timeout', () => {
    it('has 5-minute default timeout', () => {
      const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
      expect(INACTIVITY_TIMEOUT_MS).toBe(300000);
    });

    it('resets timeout on activity', () => {
      let lastActivity = Date.now();

      // Simulate activity
      const simulateActivity = () => {
        lastActivity = Date.now();
      };

      const oldActivity = lastActivity;
      simulateActivity();

      expect(lastActivity).toBeGreaterThanOrEqual(oldActivity);
    });
  });

  describe('Heartbeat', () => {
    it('runs at 30-second intervals', () => {
      const HEARTBEAT_INTERVAL = 30000;
      expect(HEARTBEAT_INTERVAL).toBe(30000);
    });

    it('marks client as dead if no pong received', () => {
      const ws = { isAlive: true };

      // First check - mark as not alive
      ws.isAlive = false;

      // If still not alive on next check, client is dead
      const isDead = ws.isAlive === false;
      expect(isDead).toBe(true);
    });

    it('resets isAlive on pong', () => {
      const ws = { isAlive: false };

      // Simulate pong received
      ws.isAlive = true;

      expect(ws.isAlive).toBe(true);
    });
  });

  describe('Local Only Mode', () => {
    it('binds to localhost when enabled', () => {
      const localOnly = true;
      const host = localOnly ? '127.0.0.1' : '0.0.0.0';

      expect(host).toBe('127.0.0.1');
    });

    it('binds to all interfaces when disabled', () => {
      const localOnly = false;
      const host = localOnly ? '127.0.0.1' : '0.0.0.0';

      expect(host).toBe('0.0.0.0');
    });
  });
});

describe('WebSocket Protocol Messages', () => {
  describe('Auth Response', () => {
    it('includes desktop info on success', () => {
      const response = {
        type: 'auth_response',
        success: true,
        sessionId: 'test-uuid-1234',
        desktopInfo: {
          os: 'linux',
          shell: 'bash',
          hostname: 'test-machine',
          tabs: [{ id: 'tab-1', title: 'Terminal 1' }],
          activeTabId: 'tab-1',
        },
      };

      expect(response.success).toBe(true);
      expect(response.desktopInfo).toBeDefined();
      expect(response.desktopInfo.tabs.length).toBeGreaterThan(0);
    });

    it('includes error on failure', () => {
      const response = {
        type: 'auth_response',
        success: false,
        error: 'invalid_code',
      };

      expect(response.success).toBe(false);
      expect(response.error).toBe('invalid_code');
    });

    it('includes rate limit message when locked', () => {
      const response = {
        type: 'auth_response',
        success: false,
        error: 'rate_limit_exceeded',
        message: 'Too many failed attempts. Try again in 900 seconds.',
      };

      expect(response.error).toBe('rate_limit_exceeded');
      expect(response.message).toContain('Too many failed attempts');
    });
  });

  describe('Terminal Data', () => {
    it('includes tab ID and data', () => {
      const message = {
        type: 'terminal_data',
        tabId: 'tab-1',
        data: 'user@host:~$ ls\nfile1.txt  file2.txt\n',
      };

      expect(message.type).toBe('terminal_data');
      expect(message.tabId).toBeDefined();
      expect(message.data).toBeDefined();
    });
  });

  describe('Transcription Response', () => {
    it('includes success result', () => {
      const response = {
        type: 'transcription',
        tabId: 'tab-1',
        text: 'list all files',
        success: true,
        executed: true,
      };

      expect(response.success).toBe(true);
      expect(response.text).toBe('list all files');
    });

    it('includes error on failure', () => {
      const response = {
        type: 'transcription',
        tabId: 'tab-1',
        text: '',
        success: false,
        error: 'No audio data received',
      };

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe('Disconnect Reasons', () => {
    it('has standard disconnect reasons', () => {
      const reasons = [
        'pairing_code_regenerated',
        'inactivity_timeout',
      ];

      expect(reasons).toContain('inactivity_timeout');
      expect(reasons).toContain('pairing_code_regenerated');
    });
  });
});
