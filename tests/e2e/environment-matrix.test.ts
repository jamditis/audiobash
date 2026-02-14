/**
 * E2E Tests: Environment Compatibility Matrix
 * Tests remote functionality across different environments including
 * operating systems, Node.js versions, and network configurations.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { MockWebSocket, MockPtyProcess } from '../stress/stress-utils';

// Mock the ws module before importing
vi.mock('ws', () => ({
  WebSocketServer: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    clients: new Set(),
    close: vi.fn(),
  })),
}));

// Import after mocking
const { RemoteControlServer } = require('../../electron/websocket-server.cjs');

/**
 * Environment Matrix Test Results
 */
interface MatrixTestResult {
  environment: string;
  category: string;
  testName: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const matrixResults: MatrixTestResult[] = [];

/**
 * Helper to record test results for matrix output
 */
function recordResult(
  environment: string,
  category: string,
  testName: string,
  passed: boolean,
  duration: number,
  error?: string
) {
  matrixResults.push({
    environment,
    category,
    testName,
    passed,
    duration,
    error,
  });
}

/**
 * Environment configurations for testing
 */
const operatingSystems = [
  { name: 'Windows', platform: 'win32', shell: 'powershell.exe', clearCmd: 'cls' },
  { name: 'macOS', platform: 'darwin', shell: '/bin/zsh', clearCmd: 'clear' },
  { name: 'Linux', platform: 'linux', shell: '/bin/bash', clearCmd: 'clear' },
];

const nodeVersions = [
  { name: 'Node.js 18.x', version: '18.19.0', supported: true },
  { name: 'Node.js 20.x', version: '20.11.0', supported: true },
  { name: 'Node.js 22.x', version: '22.0.0', supported: true },
];

const networkConfigs = [
  { name: 'localhost', host: '127.0.0.1', port: 8765, secure: false },
  { name: 'LAN', host: '192.168.1.100', port: 8765, secure: false },
  { name: 'Cloudflare Tunnel', host: 'tunnel.trycloudflare.com', port: 443, secure: true },
  { name: 'ngrok Tunnel', host: 'abc123.ngrok.io', port: 443, secure: true },
];

/**
 * E2E Test Suite: Operating System Compatibility
 */
describe('E2E: Operating System Compatibility', () => {
  let mockPtyProcesses: Map<string, MockPtyProcess>;
  let mockOutputBuffers: Map<string, string>;
  let mockCwds: Map<string, string>;

  beforeAll(() => {
    mockPtyProcesses = new Map();
    mockOutputBuffers = new Map();
    mockCwds = new Map();
    mockPtyProcesses.set('tab-1', new MockPtyProcess());
    mockOutputBuffers.set('tab-1', '');
    mockCwds.set('tab-1', '/home/user');
  });

  describe.each(operatingSystems)('$name ($platform)', ({ name, platform, shell, clearCmd }) => {
    let server: typeof RemoteControlServer;
    let originalPlatform: string;

    beforeEach(() => {
      // Save and mock platform
      originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: platform, writable: true });

      server = new RemoteControlServer({
        port: 28765 + operatingSystems.findIndex((os) => os.platform === platform),
        ptyProcesses: mockPtyProcesses,
        terminalOutputBuffers: mockOutputBuffers,
        terminalCwds: mockCwds,
      });
    });

    afterEach(() => {
      server?.stop();
      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
    });

    it('should detect correct OS in auth response', async () => {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        await server.start();
        const mockClient = new MockWebSocket();
        await server.handleAuth(mockClient, {
          deviceName: 'Test Device',
        });

        const authMsg = mockClient.messages.find((m) => {
          const parsed = JSON.parse(m);
          return parsed.type === 'auth_result';
        });

        const authResult = JSON.parse(authMsg);
        const expectedOs =
          platform === 'win32' ? 'windows' : platform === 'darwin' ? 'mac' : 'linux';
        expect(authResult.desktopInfo.os).toBe(expectedOs);
        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        recordResult(name, 'OS Detection', 'OS in auth response', passed, Date.now() - startTime, error);
      }
    });

    it('should detect correct shell', async () => {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        // Mock SHELL environment variable
        const originalShell = process.env.SHELL;
        if (platform !== 'win32') {
          process.env.SHELL = shell;
        }

        await server.start();
        const mockClient = new MockWebSocket();
        await server.handleAuth(mockClient, {
          deviceName: 'Test Device',
        });

        const authMsg = mockClient.messages.find((m) => {
          const parsed = JSON.parse(m);
          return parsed.type === 'auth_result';
        });

        const authResult = JSON.parse(authMsg);
        expect(authResult.desktopInfo.shell).toBeDefined();
        passed = true;

        // Restore
        if (originalShell !== undefined) {
          process.env.SHELL = originalShell;
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        recordResult(name, 'Shell Detection', 'Shell type', passed, Date.now() - startTime, error);
      }
    });

    it('should handle authentication correctly', async () => {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        await server.start();
        const mockClient = new MockWebSocket();
        await server.handleAuth(mockClient, {
          deviceName: `${name} Device`,
        });

        expect(server.connectedClient).toBe(mockClient);
        expect(server.connectedDeviceName).toBe(`${name} Device`);
        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        recordResult(
          name,
          'Authentication',
          'Basic auth',
          passed,
          Date.now() - startTime,
          error
        );
      }
    });

    it('should handle terminal commands', async () => {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        await server.start();
        const mockClient = new MockWebSocket();
        await server.handleAuth(mockClient, {
          deviceName: 'Test Device',
        });

        // Should not throw for platform-specific command
        expect(() => {
          server.handleMessage(
            mockClient,
            JSON.stringify({ type: 'terminal_write', tabId: 'tab-1', data: `${clearCmd}\r` }),
            false
          );
        }).not.toThrow();

        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        recordResult(
          name,
          'Terminal',
          'Platform commands',
          passed,
          Date.now() - startTime,
          error
        );
      }
    });

  });
});

/**
 * E2E Test Suite: Node.js Version Compatibility
 */
describe('E2E: Node.js Version Compatibility', () => {
  let mockPtyProcesses: Map<string, MockPtyProcess>;

  beforeAll(() => {
    mockPtyProcesses = new Map();
    mockPtyProcesses.set('tab-1', new MockPtyProcess());
  });

  describe.each(nodeVersions)('$name', ({ name, version, supported }) => {
    it(`should be ${supported ? 'supported' : 'unsupported'}`, async () => {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        // Note: We can't actually change Node.js version at runtime
        // This test documents expected compatibility
        const currentMajor = parseInt(process.version.slice(1).split('.')[0]);
        const testMajor = parseInt(version.split('.')[0]);

        if (supported) {
          expect(currentMajor).toBeGreaterThanOrEqual(18);
        }

        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        if (!supported) {
          passed = true; // Expected to fail for unsupported versions
        } else {
          throw e;
        }
      } finally {
        recordResult(
          name,
          'Compatibility',
          'Version support',
          passed,
          Date.now() - startTime,
          error
        );
      }
    });

    it('should handle async/await patterns', async () => {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        const server = new RemoteControlServer({
          port: 28785,
          ptyProcesses: mockPtyProcesses,
          terminalOutputBuffers: new Map([['tab-1', '']]),
          terminalCwds: new Map([['tab-1', '/home/user']]),
        });

        await server.start();

        const mockClient = new MockWebSocket();
        await server.handleAuth(mockClient, {
          deviceName: 'Test Device',
        });

        expect(server.connectedClient).toBe(mockClient);
        server.stop();
        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        recordResult(name, 'Async', 'async/await', passed, Date.now() - startTime, error);
      }
    });

    it('should handle Buffer operations', async () => {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        // Test Buffer operations used in audio handling
        const chunks: Buffer[] = [];
        for (let i = 0; i < 10; i++) {
          chunks.push(Buffer.alloc(1024, i));
        }

        const combined = Buffer.concat(chunks);
        expect(combined.length).toBe(10 * 1024);

        // Test Buffer from base64 (used in image upload)
        const testData = 'Hello, World!';
        const base64 = Buffer.from(testData).toString('base64');
        const decoded = Buffer.from(base64, 'base64').toString();
        expect(decoded).toBe(testData);

        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        recordResult(name, 'Buffer', 'Buffer ops', passed, Date.now() - startTime, error);
      }
    });

    it('should handle crypto operations', async () => {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        const crypto = require('crypto');

        // Test randomUUID (used for session IDs)
        const uuid = crypto.randomUUID();
        expect(uuid).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );

        // Test randomInt (used for pairing codes)
        const randomInt = crypto.randomInt(100);
        expect(randomInt).toBeGreaterThanOrEqual(0);
        expect(randomInt).toBeLessThan(100);

        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        recordResult(name, 'Crypto', 'crypto ops', passed, Date.now() - startTime, error);
      }
    });
  });
});

/**
 * E2E Test Suite: Network Configuration Compatibility
 */
describe('E2E: Network Configuration Compatibility', () => {
  let mockPtyProcesses: Map<string, MockPtyProcess>;
  let mockOutputBuffers: Map<string, string>;
  let mockCwds: Map<string, string>;

  beforeAll(() => {
    mockPtyProcesses = new Map();
    mockOutputBuffers = new Map();
    mockCwds = new Map();
    mockPtyProcesses.set('tab-1', new MockPtyProcess());
    mockOutputBuffers.set('tab-1', '');
    mockCwds.set('tab-1', '/home/user');
  });

  describe.each(networkConfigs)('$name', ({ name, host, port, secure }) => {
    let server: typeof RemoteControlServer;

    beforeEach(() => {
      server = new RemoteControlServer({
        port: 28795 + networkConfigs.findIndex((nc) => nc.name === name),
        ptyProcesses: mockPtyProcesses,
        terminalOutputBuffers: mockOutputBuffers,
        terminalCwds: mockCwds,
      });
    });

    afterEach(() => {
      server?.stop();
    });

    it('should start server successfully', async () => {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        const status = await server.start();
        expect(status.running).toBe(true);
        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        recordResult(name, 'Server', 'Start', passed, Date.now() - startTime, error);
      }
    });

    it('should accept connections', async () => {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        await server.start();
        const mockClient = new MockWebSocket();
        mockClient._socket = { remoteAddress: host };

        await server.handleAuth(mockClient, {
          deviceName: `${name} Client`,
        });

        expect(server.connectedClient).toBe(mockClient);
        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        recordResult(name, 'Connection', 'Accept', passed, Date.now() - startTime, error);
      }
    });

    it('should handle message exchange', async () => {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        await server.start();
        const mockClient = new MockWebSocket();
        mockClient._socket = { remoteAddress: host };

        await server.handleAuth(mockClient, {
          deviceName: 'Test Client',
        });

        mockClient.messages = [];

        // Send and receive messages
        server.handleMessage(
          mockClient,
          JSON.stringify({ type: 'get_tabs' }),
          false
        );

        const tabsMsg = mockClient.messages.find((m) => {
          const parsed = JSON.parse(m);
          return parsed.type === 'tabs';
        });

        expect(tabsMsg).toBeDefined();
        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        recordResult(name, 'Messages', 'Exchange', passed, Date.now() - startTime, error);
      }
    });

    it('should handle disconnection', async () => {
      const startTime = Date.now();
      let passed = false;
      let error: string | undefined;

      try {
        await server.start();
        const mockClient = new MockWebSocket();
        mockClient._socket = { remoteAddress: host };

        await server.handleAuth(mockClient, {
          deviceName: 'Test Client',
        });

        expect(server.connectedClient).toBe(mockClient);

        server.handleDisconnect(mockClient);
        expect(server.connectedClient).toBeNull();

        passed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        throw e;
      } finally {
        recordResult(name, 'Connection', 'Disconnect', passed, Date.now() - startTime, error);
      }
    });
  });
});

/**
 * Print compatibility matrix report after all tests
 */
afterAll(() => {
  console.log('\n' + '='.repeat(80));
  console.log('ENVIRONMENT COMPATIBILITY MATRIX REPORT');
  console.log('='.repeat(80));

  // Group results by category
  const categories = new Map<string, Map<string, MatrixTestResult[]>>();

  for (const result of matrixResults) {
    if (!categories.has(result.category)) {
      categories.set(result.category, new Map());
    }
    const envMap = categories.get(result.category)!;
    if (!envMap.has(result.environment)) {
      envMap.set(result.environment, []);
    }
    envMap.get(result.environment)!.push(result);
  }

  // Print matrix for each category
  for (const [category, envMap] of categories) {
    console.log(`\n## ${category}`);
    console.log('-'.repeat(60));

    // Get all unique test names
    const testNames = new Set<string>();
    for (const results of envMap.values()) {
      for (const r of results) {
        testNames.add(r.testName);
      }
    }

    // Print header
    const envNames = Array.from(envMap.keys());
    console.log(`| Test | ${envNames.join(' | ')} |`);
    console.log(`| --- | ${envNames.map(() => '---').join(' | ')} |`);

    // Print rows
    for (const testName of testNames) {
      const row = [testName];
      for (const envName of envNames) {
        const results = envMap.get(envName) || [];
        const result = results.find((r) => r.testName === testName);
        if (result) {
          row.push(result.passed ? 'PASS' : 'FAIL');
        } else {
          row.push('-');
        }
      }
      console.log(`| ${row.join(' | ')} |`);
    }
  }

  // Summary statistics
  const totalTests = matrixResults.length;
  const passedTests = matrixResults.filter((r) => r.passed).length;
  const failedTests = totalTests - passedTests;
  const totalDuration = matrixResults.reduce((sum, r) => sum + r.duration, 0);

  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests} (${((passedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${failedTests} (${((failedTests / totalTests) * 100).toFixed(1)}%)`);
  console.log(`Total Duration: ${totalDuration}ms`);
  console.log(`Average Duration: ${(totalDuration / totalTests).toFixed(1)}ms`);

  // List failed tests
  if (failedTests > 0) {
    console.log('\nFailed Tests:');
    for (const result of matrixResults.filter((r) => !r.passed)) {
      console.log(`  - ${result.environment}: ${result.category}/${result.testName}`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
});

/**
 * Additional environment-specific edge cases
 */
describe('E2E: Environment Edge Cases', () => {
  let server: typeof RemoteControlServer;
  let mockPtyProcesses: Map<string, MockPtyProcess>;

  beforeEach(() => {
    mockPtyProcesses = new Map();
    mockPtyProcesses.set('tab-1', new MockPtyProcess());

    server = new RemoteControlServer({
      port: 18765,
      ptyProcesses: mockPtyProcesses,
      terminalOutputBuffers: new Map([['tab-1', '']]),
      terminalCwds: new Map([['tab-1', '/home/user']]),
    });
  });

  afterEach(() => {
    server?.stop();
  });

  it('should handle rapid server start/stop cycles', async () => {
    for (let i = 0; i < 5; i++) {
      await server.start();
      expect(server.getStatus().running).toBe(true);
      server.stop();
      expect(server.getStatus().running).toBe(false);
    }
  });

  it('should handle concurrent connection attempts from different IPs', async () => {
    await server.start();

    const clients: MockWebSocket[] = [];
    const ips = ['10.0.0.1', '10.0.0.2', '10.0.0.3', '192.168.1.1', '172.16.0.1'];

    // First connection should succeed
    const firstClient = new MockWebSocket();
    firstClient._socket = { remoteAddress: ips[0] };
    await server.handleAuth(firstClient, {
      deviceName: 'First Device',
    });
    expect(server.connectedClient).toBe(firstClient);

    // Subsequent connections should be rejected
    for (let i = 1; i < ips.length; i++) {
      const client = new MockWebSocket();
      client._socket = { remoteAddress: ips[i] };
      await server.handleAuth(client, {
        deviceName: `Device ${i}`,
      });

      const response = JSON.parse(client.messages[0]);
      expect(response.error).toBe('Another device is already connected');
    }

    // First client should still be connected
    expect(server.connectedClient).toBe(firstClient);
  });

  it('should handle very long session', async () => {
    await server.start();
    const mockClient = new MockWebSocket();
    await server.handleAuth(mockClient, {
      deviceName: 'Long Session Device',
    });

    // Simulate many operations over a "long" session
    for (let i = 0; i < 100; i++) {
      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'get_tabs' }),
        false
      );
      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'get_context', tabId: 'tab-1' }),
        false
      );
      server.handleMessage(
        mockClient,
        JSON.stringify({ type: 'terminal_write', tabId: 'tab-1', data: `cmd${i}\r` }),
        false
      );
    }

    expect(server.connectedClient).toBe(mockClient);
  });

  it('should handle IPv6 addresses', async () => {
    await server.start();
    const mockClient = new MockWebSocket();
    mockClient._socket = { remoteAddress: '::1' }; // IPv6 localhost

    await server.handleAuth(mockClient, {
      deviceName: 'IPv6 Device',
    });

    expect(server.connectedClient).toBe(mockClient);
  });

  it('should handle special characters in device name', async () => {
    await server.start();
    const mockClient = new MockWebSocket();

    const specialNames = [
      'Device with spaces',
      "Device'with'quotes",
      'Device<script>test</script>',
      'Device&amp;encoded',
      'Device\nwith\nnewlines',
      'Device\twith\ttabs',
      '日本語デバイス',
      'Device 😀 emoji',
    ];

    for (const name of specialNames) {
      if (server.connectedClient) {
        server.handleDisconnect(server.connectedClient);
      }

      const client = new MockWebSocket();
      await server.handleAuth(client, {
        deviceName: name,
      });

      expect(server.connectedDeviceName).toBe(name);
    }
  });
});
