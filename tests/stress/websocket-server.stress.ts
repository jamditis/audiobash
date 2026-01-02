/**
 * WebSocket Server Stress Tests
 * Tests the RemoteControlServer under extreme conditions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  runStressTest,
  runConcurrentStressTest,
  MockWebSocket,
  MockPtyProcess,
  generateRandomData,
  generateRandomString,
  sleep,
  printStressTestReport,
  StressTestResult,
} from './stress-utils';

// Mock the ws module
vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    clients: new Set(),
    close: vi.fn(),
  })),
}));

// Import after mocking
const { RemoteControlServer } = require('../../electron/websocket-server.cjs');

describe('WebSocket Server Stress Tests', () => {
  let server: any;
  let mockPtyProcesses: Map<string, MockPtyProcess>;
  let mockOutputBuffers: Map<string, string>;
  let mockCwds: Map<string, string>;
  const results: StressTestResult[] = [];

  beforeEach(() => {
    mockPtyProcesses = new Map();
    mockOutputBuffers = new Map();
    mockCwds = new Map();

    // Create mock terminals
    for (let i = 1; i <= 5; i++) {
      const tabId = `tab-${i}`;
      mockPtyProcesses.set(tabId, new MockPtyProcess());
      mockOutputBuffers.set(tabId, '');
      mockCwds.set(tabId, '/home/user');
    }

    server = new RemoteControlServer({
      port: 18765,
      securePort: 18766,
      ptyProcesses: mockPtyProcesses,
      terminalOutputBuffers: mockOutputBuffers,
      terminalCwds: mockCwds,
      mainWindow: null,
      transcribeAudio: async () => ({ success: true, text: 'test transcription' }),
    });
  });

  afterEach(() => {
    if (server) {
      server.stop();
    }
  });

  describe('Message Handling Stress', () => {
    it('should handle rapid message flood without crashing', async () => {
      const result = await runStressTest(
        'Rapid Message Flood',
        async (iteration) => {
          const mockWs = new MockWebSocket();
          const messages = [
            { type: 'terminal_write', tabId: 'tab-1', data: `command ${iteration}\r` },
            { type: 'terminal_resize', tabId: 'tab-1', cols: 80 + (iteration % 20), rows: 24 },
            { type: 'get_tabs' },
            { type: 'get_context', tabId: 'tab-1' },
            { type: 'switch_tab', tabId: `tab-${(iteration % 5) + 1}` },
          ];

          for (const msg of messages) {
            server.handleMessage(mockWs, JSON.stringify(msg), false);
          }
        },
        { iterations: 500, cooldown: 1, verbose: true }
      );

      results.push(result);
      expect(result.errors.length).toBeLessThan(5);
    });

    it('should handle malformed JSON messages gracefully', async () => {
      const result = await runStressTest(
        'Malformed JSON Messages',
        async (iteration) => {
          const mockWs = new MockWebSocket();
          const malformedMessages = [
            '{invalid json',
            '{"type": }',
            'null',
            'undefined',
            '',
            '{"type": "unknown_type"}',
            '{"type": "terminal_write"}', // Missing required fields
            '{"type": "terminal_resize", "tabId": "tab-1"}', // Missing cols/rows
            generateRandomString(100, true),
            Buffer.from([0x00, 0xff, 0xfe]).toString(),
          ];

          const msg = malformedMessages[iteration % malformedMessages.length];
          // Should not throw
          server.handleMessage(mockWs, msg, false);
        },
        { iterations: 200, cooldown: 1 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should handle large message payloads', async () => {
      const result = await runStressTest(
        'Large Message Payloads',
        async (iteration) => {
          const mockWs = new MockWebSocket();
          const sizes = [1024, 10240, 102400, 1024000]; // 1KB to 1MB
          const size = sizes[iteration % sizes.length];

          const largeData = generateRandomString(size);
          const msg = JSON.stringify({
            type: 'terminal_write',
            tabId: 'tab-1',
            data: largeData,
          });

          server.handleMessage(mockWs, msg, false);
        },
        { iterations: 50, cooldown: 10, timeout: 60000 }
      );

      results.push(result);
      expect(result.errors.length).toBeLessThan(3);
    });
  });

  describe('Audio Session Stress', () => {
    it('should handle rapid audio start/end cycles', async () => {
      const result = await runStressTest(
        'Rapid Audio Start/End Cycles',
        async (iteration) => {
          const mockWs = new MockWebSocket();
          server.connectedClient = mockWs;

          // Start audio session
          server.handleMessage(
            mockWs,
            JSON.stringify({
              type: 'audio_start',
              tabId: 'tab-1',
              mode: iteration % 2 === 0 ? 'agent' : 'raw',
              format: 'webm',
            }),
            false
          );

          // Send some audio chunks
          for (let i = 0; i < 5; i++) {
            const chunk = generateRandomData(1024);
            server.handleAudioData(chunk);
          }

          // End audio session
          await server.handleAudioEnd({ tabId: 'tab-1' });
        },
        { iterations: 50, cooldown: 50 }
      );

      results.push(result);
      expect(result.errors.length).toBeLessThan(5);
    });

    it('should handle very large audio buffers', async () => {
      const result = await runStressTest(
        'Large Audio Buffers',
        async (iteration) => {
          const mockWs = new MockWebSocket();
          server.connectedClient = mockWs;

          server.handleMessage(
            mockWs,
            JSON.stringify({ type: 'audio_start', tabId: 'tab-1', mode: 'agent' }),
            false
          );

          // Send large audio data (simulating long recording)
          const chunkSize = 64 * 1024; // 64KB chunks
          const numChunks = 10 + (iteration % 50); // 640KB to 3.2MB

          for (let i = 0; i < numChunks; i++) {
            server.handleAudioData(generateRandomData(chunkSize));
          }

          await server.handleAudioEnd({ tabId: 'tab-1' });

          // Verify audio buffer was cleared
          expect(server.audioChunks.length).toBe(0);
        },
        { iterations: 20, cooldown: 100, timeout: 120000 }
      );

      results.push(result);
      expect(result.errors.length).toBeLessThan(3);
    });

    it('should handle audio end without audio start', async () => {
      const result = await runStressTest(
        'Audio End Without Start',
        async () => {
          const mockWs = new MockWebSocket();
          server.connectedClient = mockWs;
          server.currentAudioSession = null;
          server.audioChunks = [];

          // Should not crash
          await server.handleAudioEnd({ tabId: 'tab-1' });

          // Verify error response was sent
          const lastMessage = mockWs.messages[mockWs.messages.length - 1];
          if (lastMessage) {
            const parsed = JSON.parse(lastMessage);
            expect(parsed.success).toBe(false);
          }
        },
        { iterations: 50, cooldown: 10 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });
  });

  describe('Authentication Stress', () => {
    it('should handle rapid authentication attempts', async () => {
      const result = await runStressTest(
        'Rapid Auth Attempts',
        async (iteration) => {
          const mockWs = new MockWebSocket();
          server.pairingCode = 'ABC123';

          // Alternate between valid and invalid codes
          const code = iteration % 2 === 0 ? 'ABC123' : 'WRONG1';

          server.handleAuth(mockWs, {
            pairingCode: code,
            deviceName: `Device ${iteration}`,
          });

          // Reset connection for next iteration
          if (server.connectedClient === mockWs) {
            server.connectedClient = null;
          }
        },
        { iterations: 200, cooldown: 5 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should handle brute force pairing code attempts', async () => {
      const result = await runStressTest(
        'Brute Force Pairing Attempts',
        async (iteration) => {
          const mockWs = new MockWebSocket();
          server.pairingCode = 'XYZ789';

          // Generate random codes
          const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
          let randomCode = '';
          for (let i = 0; i < 6; i++) {
            randomCode += chars[Math.floor(Math.random() * chars.length)];
          }

          server.handleAuth(mockWs, {
            pairingCode: randomCode,
            deviceName: 'Attacker',
          });

          // Clean up
          if (server.connectedClient === mockWs) {
            server.connectedClient = null;
          }
        },
        { iterations: 1000, cooldown: 1 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });
  });

  describe('Connection State Stress', () => {
    it('should handle rapid connect/disconnect cycles', async () => {
      const result = await runStressTest(
        'Rapid Connect/Disconnect',
        async (iteration) => {
          const mockWs = new MockWebSocket();
          server.pairingCode = 'TEST12';

          // Connect
          server.handleAuth(mockWs, {
            pairingCode: 'TEST12',
            deviceName: `Device ${iteration}`,
          });

          expect(server.connectedClient).toBe(mockWs);

          // Disconnect
          server.handleDisconnect(mockWs);

          expect(server.connectedClient).toBeNull();
        },
        { iterations: 100, cooldown: 10 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should reject second connection while first is active', async () => {
      const result = await runStressTest(
        'Concurrent Connection Rejection',
        async () => {
          const mockWs1 = new MockWebSocket();
          const mockWs2 = new MockWebSocket();
          server.pairingCode = 'TEST12';

          // First connection
          server.handleAuth(mockWs1, {
            pairingCode: 'TEST12',
            deviceName: 'Device 1',
          });

          expect(server.connectedClient).toBe(mockWs1);

          // Second connection should be rejected
          server.handleAuth(mockWs2, {
            pairingCode: 'TEST12',
            deviceName: 'Device 2',
          });

          // First client should still be connected
          expect(server.connectedClient).toBe(mockWs1);

          // Second client should receive error
          const response = JSON.parse(mockWs2.messages[0]);
          expect(response.success).toBe(false);
          expect(response.error).toBe('already_connected');

          // Clean up
          server.handleDisconnect(mockWs1);
        },
        { iterations: 50, cooldown: 10 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });
  });

  describe('Memory Stress', () => {
    it('should not leak memory during sustained operation', async () => {
      const result = await runStressTest(
        'Memory Leak Detection',
        async (iteration) => {
          const mockWs = new MockWebSocket();

          // Perform various operations
          server.handleMessage(mockWs, JSON.stringify({ type: 'get_tabs' }), false);
          server.handleMessage(
            mockWs,
            JSON.stringify({ type: 'get_context', tabId: 'tab-1' }),
            false
          );
          server.handleMessage(
            mockWs,
            JSON.stringify({
              type: 'terminal_write',
              tabId: 'tab-1',
              data: generateRandomString(1000),
            }),
            false
          );

          // Force garbage collection every 100 iterations if available
          if (iteration % 100 === 0 && global.gc) {
            global.gc();
          }
        },
        { iterations: 1000, cooldown: 1, verbose: true }
      );

      results.push(result);
      // Allow up to 100MB memory growth for this test
      expect(result.metrics.memoryUsed || 0).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('Binary Data Stress', () => {
    it('should handle binary WebSocket frames correctly', async () => {
      const result = await runStressTest(
        'Binary Frame Handling',
        async (iteration) => {
          const mockWs = new MockWebSocket();
          server.connectedClient = mockWs;

          // Start audio session first
          server.currentAudioSession = { tabId: 'tab-1', mode: 'agent', format: 'webm' };

          // Send binary data of varying sizes
          const sizes = [100, 1000, 10000, 100000];
          const size = sizes[iteration % sizes.length];
          const binaryData = generateRandomData(size);

          server.handleMessage(mockWs, binaryData, true);

          expect(server.audioChunks.length).toBeGreaterThan(0);

          // Clean up
          server.currentAudioSession = null;
          server.audioChunks = [];
        },
        { iterations: 100, cooldown: 5 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });
  });

  // Print summary after all tests
  afterEach(() => {
    if (results.length > 0) {
      // Only print on last test
    }
  });
});

describe('WebSocket Server Edge Cases', () => {
  let server: any;

  beforeEach(() => {
    server = new RemoteControlServer({
      port: 28765,
      ptyProcesses: new Map(),
      terminalOutputBuffers: new Map(),
      terminalCwds: new Map(),
    });
  });

  afterEach(() => {
    server?.stop();
  });

  it('should handle null/undefined message fields', () => {
    const mockWs = new MockWebSocket();
    const edgeCases = [
      { type: 'terminal_write', tabId: null, data: 'test' },
      { type: 'terminal_write', tabId: 'tab-1', data: null },
      { type: 'terminal_write', tabId: undefined, data: undefined },
      { type: 'terminal_resize', tabId: 'tab-1', cols: null, rows: null },
      { type: 'terminal_resize', tabId: 'tab-1', cols: 'invalid', rows: {} },
      { type: 'switch_tab', tabId: null },
      { type: 'get_context', tabId: null },
      { type: null },
      { type: undefined },
      {},
    ];

    for (const msg of edgeCases) {
      expect(() => {
        server.handleMessage(mockWs, JSON.stringify(msg), false);
      }).not.toThrow();
    }
  });

  it('should handle Unicode and special characters in messages', () => {
    const mockWs = new MockWebSocket();
    const specialStrings = [
      '日本語テスト',
      '🚀🔥💻',
      '\x00\x01\x02',
      '\\n\\r\\t',
      '<script>alert("xss")</script>',
      "'; DROP TABLE users; --",
      '../../../etc/passwd',
      'a'.repeat(10000),
    ];

    for (const str of specialStrings) {
      expect(() => {
        server.handleMessage(
          mockWs,
          JSON.stringify({ type: 'terminal_write', tabId: 'tab-1', data: str }),
          false
        );
      }).not.toThrow();
    }
  });

  it('should handle negative and extreme numeric values', () => {
    const mockWs = new MockWebSocket();
    const extremeValues = [
      { cols: -1, rows: -1 },
      { cols: 0, rows: 0 },
      { cols: 999999, rows: 999999 },
      { cols: Number.MAX_SAFE_INTEGER, rows: Number.MAX_SAFE_INTEGER },
      { cols: Number.MIN_SAFE_INTEGER, rows: Number.MIN_SAFE_INTEGER },
      { cols: Infinity, rows: Infinity },
      { cols: NaN, rows: NaN },
    ];

    for (const val of extremeValues) {
      expect(() => {
        server.handleMessage(
          mockWs,
          JSON.stringify({ type: 'terminal_resize', tabId: 'tab-1', ...val }),
          false
        );
      }).not.toThrow();
    }
  });

  it('should handle pairing code regeneration under load', async () => {
    const codes = new Set<string>();

    for (let i = 0; i < 100; i++) {
      const code = server.generatePairingCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      codes.add(code);
    }

    // Codes should be mostly unique (allow some collisions due to randomness)
    expect(codes.size).toBeGreaterThan(90);
  });
});
