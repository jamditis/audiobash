/**
 * WebSocket Server Stress Tests
 * Tests the RemoteControlServer under extreme conditions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  runStressTest,
  MockWebSocket,
  MockPtyProcess,
  generateRandomString,
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
      ptyProcesses: mockPtyProcesses,
      terminalOutputBuffers: mockOutputBuffers,
      terminalCwds: mockCwds,
      mainWindow: null,
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

  describe('Authentication Stress', () => {
    it('should handle rapid authentication attempts', async () => {
      server.setStaticPassword('testpass123');

      const result = await runStressTest(
        'Rapid Auth Attempts',
        async (iteration) => {
          const mockWs = new MockWebSocket();

          // Alternate between valid and invalid passwords
          const password = iteration % 2 === 0 ? 'testpass123' : 'wrongpass';

          server.handleAuth(mockWs, {
            password,
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

    it('should handle brute force password attempts', async () => {
      server.setStaticPassword('securepass99');

      const result = await runStressTest(
        'Brute Force Password Attempts',
        async (iteration) => {
          const mockWs = new MockWebSocket();

          // Generate random passwords
          const randomPassword = generateRandomString(12);

          server.handleAuth(mockWs, {
            password: randomPassword,
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

          // Connect (no password set = open access)
          server.handleAuth(mockWs, {
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

          // First connection
          server.handleAuth(mockWs1, {
            deviceName: 'Device 1',
          });

          expect(server.connectedClient).toBe(mockWs1);

          // Second connection should be rejected
          server.handleAuth(mockWs2, {
            deviceName: 'Device 2',
          });

          // First client should still be connected
          expect(server.connectedClient).toBe(mockWs1);

          // Second client should receive error
          const response = JSON.parse(mockWs2.messages[0]);
          expect(response.success).toBe(false);
          expect(response.error).toBe('Another device is already connected');

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

  it('should handle repeated password changes under load', () => {
    for (let i = 0; i < 100; i++) {
      const password = `testpass${i.toString().padStart(3, '0')}`;
      const result = server.setStaticPassword(password);
      expect(result.success).toBe(true);
    }
  });
});
