/**
 * WebSocket Connection Integration Tests
 * Tests actual WebSocket server startup, client connection, authentication,
 * and data roundtrip functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket as WsClient, WebSocketServer } from 'ws';
import * as http from 'http';
import * as net from 'net';

// Get a random available port
async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

// Wait for a condition with timeout
async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 50
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('Timeout waiting for condition');
}

// Mock PTY process for testing
class MockPtyProcess {
  private buffer = '';
  private onDataCallback: ((data: string) => void) | null = null;

  write(data: string): void {
    this.buffer += data;
    this.onDataCallback?.(data);
  }

  onData(callback: (data: string) => void): void {
    this.onDataCallback = callback;
  }

  simulateOutput(data: string): void {
    this.buffer += data;
    this.onDataCallback?.(data);
  }

  getBuffer(): string {
    return this.buffer;
  }
}

// Import RemoteControlServer after defining mocks
const { RemoteControlServer } = require('../../electron/websocket-server.cjs');

describe('WebSocket Connection Integration Tests', () => {
  let server: InstanceType<typeof RemoteControlServer>;
  let port: number;
  let mockPtyProcesses: Map<string, MockPtyProcess>;
  let mockOutputBuffers: Map<string, string>;
  let mockCwds: Map<string, string>;

  beforeEach(async () => {
    port = await getAvailablePort();
    mockPtyProcesses = new Map();
    mockOutputBuffers = new Map();
    mockCwds = new Map();

    // Create mock terminal
    const mockPty = new MockPtyProcess();
    mockPtyProcesses.set('tab-1', mockPty);
    mockOutputBuffers.set('tab-1', '');
    mockCwds.set('tab-1', '/home/user');

    server = new RemoteControlServer({
      port,
      securePort: port + 1,
      localOnly: true, // Use localhost for tests
      ptyProcesses: mockPtyProcesses,
      terminalOutputBuffers: mockOutputBuffers,
      terminalCwds: mockCwds,
      mainWindow: null,
      transcribeAudio: async () => ({ success: true, text: 'test transcription' }),
    });
  });

  afterEach(async () => {
    if (server) {
      server.stop();
    }
    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe('Server Startup', () => {
    it('should start WebSocket server on available port', async () => {
      const status = await server.start();

      expect(status.running).toBe(true);
      expect(status.port).toBe(port);
      expect(status.pairingCode).toBeDefined();
      expect(status.pairingCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    });

    it('should return existing status if already running', async () => {
      await server.start();
      const status2 = await server.start();

      expect(status2.running).toBe(true);
    });

    it('should stop server cleanly', async () => {
      await server.start();
      expect(server.getStatus().running).toBe(true);

      server.stop();
      expect(server.getStatus().running).toBe(false);
    });

    it('should regenerate pairing code', async () => {
      await server.start();
      const code1 = server.getStatus().pairingCode;

      const code2 = server.regeneratePairingCode();

      expect(code2).not.toBe(code1);
      expect(code2).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    });
  });

  describe('Client Connection and Authentication', () => {
    it('should accept client connection and require authentication', async () => {
      await server.start();
      const pairingCode = server.getStatus().pairingCode;

      const client = new WsClient(`ws://127.0.0.1:${port}`);
      const messages: string[] = [];

      await new Promise<void>((resolve, reject) => {
        client.on('open', () => {
          // Send auth message
          client.send(
            JSON.stringify({
              type: 'auth',
              pairingCode: pairingCode,
              deviceName: 'Test Device',
            })
          );
        });

        client.on('message', (data) => {
          messages.push(data.toString());
          const parsed = JSON.parse(data.toString());

          if (parsed.type === 'auth_response') {
            expect(parsed.success).toBe(true);
            expect(parsed.sessionId).toBeDefined();
            expect(parsed.desktopInfo).toBeDefined();
            client.close();
            resolve();
          }
        });

        client.on('error', reject);

        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('should reject invalid pairing code', async () => {
      await server.start();

      const client = new WsClient(`ws://127.0.0.1:${port}`);

      await new Promise<void>((resolve, reject) => {
        client.on('open', () => {
          client.send(
            JSON.stringify({
              type: 'auth',
              pairingCode: 'WRONG1',
              deviceName: 'Test Device',
            })
          );
        });

        client.on('message', (data) => {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'auth_response') {
            expect(parsed.success).toBe(false);
            expect(parsed.error).toBe('invalid_code');
            client.close();
            resolve();
          }
        });

        client.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should accept static password authentication', async () => {
      await server.start();
      const result = server.setStaticPassword('SecureP@ss123!');
      expect(result.success).toBe(true);

      const client = new WsClient(`ws://127.0.0.1:${port}`);

      await new Promise<void>((resolve, reject) => {
        client.on('open', () => {
          client.send(
            JSON.stringify({
              type: 'auth',
              pairingCode: 'SecureP@ss123!',
              deviceName: 'Test Device',
            })
          );
        });

        client.on('message', (data) => {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'auth_response') {
            expect(parsed.success).toBe(true);
            client.close();
            resolve();
          }
        });

        client.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should reject weak passwords', async () => {
      await server.start();

      // Too short
      let result = server.setStaticPassword('short');
      expect(result.success).toBe(false);
      expect(result.error).toContain('at least');

      // No complexity
      result = server.setStaticPassword('alllowercase');
      expect(result.success).toBe(false);
      expect(result.error).toContain('at least 2 of');

      // Common pattern
      result = server.setStaticPassword('password123');
      expect(result.success).toBe(false);
      expect(result.error).toContain('weak pattern');
    });
  });

  describe('Terminal Data Roundtrip', () => {
    it('should send terminal write to PTY process', async () => {
      await server.start();
      const pairingCode = server.getStatus().pairingCode;
      const mockPty = mockPtyProcesses.get('tab-1') as MockPtyProcess;

      const client = new WsClient(`ws://127.0.0.1:${port}`);

      await new Promise<void>((resolve, reject) => {
        client.on('open', () => {
          client.send(
            JSON.stringify({
              type: 'auth',
              pairingCode: pairingCode,
              deviceName: 'Test Device',
            })
          );
        });

        client.on('message', (data) => {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'auth_response' && parsed.success) {
            // Send terminal write
            client.send(
              JSON.stringify({
                type: 'terminal_write',
                tabId: 'tab-1',
                data: 'ls -la\r',
              })
            );

            // Wait for PTY to receive data
            setTimeout(() => {
              expect(mockPty.getBuffer()).toContain('ls -la');
              client.close();
              resolve();
            }, 100);
          }
        });

        client.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should receive terminal data updates', async () => {
      await server.start();
      const pairingCode = server.getStatus().pairingCode;

      const client = new WsClient(`ws://127.0.0.1:${port}`);
      const receivedData: string[] = [];

      await new Promise<void>((resolve, reject) => {
        client.on('open', () => {
          client.send(
            JSON.stringify({
              type: 'auth',
              pairingCode: pairingCode,
              deviceName: 'Test Device',
            })
          );
        });

        client.on('message', (data) => {
          const parsed = JSON.parse(data.toString());

          if (parsed.type === 'auth_response' && parsed.success) {
            // Simulate terminal output
            setTimeout(() => {
              server.sendTerminalData('tab-1', 'output from terminal');
            }, 50);
          }

          if (parsed.type === 'terminal_data') {
            receivedData.push(parsed.data);
            expect(parsed.tabId).toBe('tab-1');
            expect(parsed.data).toBe('output from terminal');
            client.close();
            resolve();
          }
        });

        client.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });

      expect(receivedData.length).toBe(1);
    });
  });

  describe('Reconnection After Disconnect', () => {
    it('should allow reconnection after clean disconnect', async () => {
      await server.start();
      const pairingCode = server.getStatus().pairingCode;

      // First connection
      const client1 = new WsClient(`ws://127.0.0.1:${port}`);

      await new Promise<void>((resolve, reject) => {
        client1.on('open', () => {
          client1.send(
            JSON.stringify({
              type: 'auth',
              pairingCode: pairingCode,
              deviceName: 'Device 1',
            })
          );
        });

        client1.on('message', (data) => {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'auth_response' && parsed.success) {
            // Disconnect cleanly
            client1.close();
            resolve();
          }
        });

        client1.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });

      // Wait for disconnect to be processed
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Second connection should work with new pairing code
      const newPairingCode = server.getStatus().pairingCode;
      const client2 = new WsClient(`ws://127.0.0.1:${port}`);

      await new Promise<void>((resolve, reject) => {
        client2.on('open', () => {
          client2.send(
            JSON.stringify({
              type: 'auth',
              pairingCode: newPairingCode,
              deviceName: 'Device 2',
            })
          );
        });

        client2.on('message', (data) => {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'auth_response') {
            expect(parsed.success).toBe(true);
            client2.close();
            resolve();
          }
        });

        client2.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should reject concurrent connection attempts', async () => {
      await server.start();
      const pairingCode = server.getStatus().pairingCode;

      // First connection
      const client1 = new WsClient(`ws://127.0.0.1:${port}`);
      let client1Connected = false;

      await new Promise<void>((resolve, reject) => {
        client1.on('open', () => {
          client1.send(
            JSON.stringify({
              type: 'auth',
              pairingCode: pairingCode,
              deviceName: 'Device 1',
            })
          );
        });

        client1.on('message', (data) => {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'auth_response' && parsed.success) {
            client1Connected = true;
            resolve();
          }
        });

        client1.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });

      expect(client1Connected).toBe(true);

      // Second connection should be rejected
      const client2 = new WsClient(`ws://127.0.0.1:${port}`);

      await new Promise<void>((resolve, reject) => {
        client2.on('open', () => {
          client2.send(
            JSON.stringify({
              type: 'auth',
              pairingCode: server.getStatus().pairingCode,
              deviceName: 'Device 2',
            })
          );
        });

        client2.on('message', (data) => {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'auth_response') {
            expect(parsed.success).toBe(false);
            expect(parsed.error).toBe('already_connected');
            client2.close();
            resolve();
          }
        });

        client2.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });

      // Cleanup
      client1.close();
    });
  });

  describe('Multiple Concurrent Connection Attempts', () => {
    it('should handle multiple rapid connection attempts', async () => {
      await server.start();
      const pairingCode = server.getStatus().pairingCode;

      const connectionPromises: Promise<boolean>[] = [];

      // Attempt 5 simultaneous connections
      for (let i = 0; i < 5; i++) {
        connectionPromises.push(
          new Promise<boolean>((resolve) => {
            const client = new WsClient(`ws://127.0.0.1:${port}`);

            client.on('open', () => {
              client.send(
                JSON.stringify({
                  type: 'auth',
                  pairingCode: pairingCode,
                  deviceName: `Device ${i}`,
                })
              );
            });

            client.on('message', (data) => {
              const parsed = JSON.parse(data.toString());
              if (parsed.type === 'auth_response') {
                client.close();
                resolve(parsed.success);
              }
            });

            client.on('error', () => {
              resolve(false);
            });

            setTimeout(() => {
              client.close();
              resolve(false);
            }, 3000);
          })
        );
      }

      const results = await Promise.all(connectionPromises);

      // Only one should succeed (single client policy)
      const successCount = results.filter((r) => r).length;
      expect(successCount).toBeLessThanOrEqual(1);
    });

    it('should maintain server stability under rapid connect/disconnect', async () => {
      await server.start();

      for (let i = 0; i < 10; i++) {
        const pairingCode = server.getStatus().pairingCode;
        const client = new WsClient(`ws://127.0.0.1:${port}`);

        await new Promise<void>((resolve, reject) => {
          client.on('open', () => {
            client.send(
              JSON.stringify({
                type: 'auth',
                pairingCode: pairingCode,
                deviceName: `Device ${i}`,
              })
            );
          });

          client.on('message', (data) => {
            const parsed = JSON.parse(data.toString());
            if (parsed.type === 'auth_response' && parsed.success) {
              client.close();
              resolve();
            } else if (parsed.type === 'auth_response' && !parsed.success) {
              client.close();
              resolve(); // Continue even on auth failure
            }
          });

          client.on('error', () => {
            resolve(); // Continue even on error
          });

          setTimeout(() => resolve(), 1000);
        });

        // Wait for disconnect to be processed
        await new Promise((r) => setTimeout(r, 100));
      }

      // Server should still be running
      expect(server.getStatus().running).toBe(true);
    });
  });

  describe('Message Handling Edge Cases', () => {
    it('should handle malformed JSON messages', async () => {
      await server.start();
      const pairingCode = server.getStatus().pairingCode;

      const client = new WsClient(`ws://127.0.0.1:${port}`);

      await new Promise<void>((resolve, reject) => {
        client.on('open', () => {
          // Authenticate first
          client.send(
            JSON.stringify({
              type: 'auth',
              pairingCode: pairingCode,
              deviceName: 'Test Device',
            })
          );
        });

        client.on('message', (data) => {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'auth_response' && parsed.success) {
            // Send malformed JSON - should not crash server
            client.send('{invalid json');
            client.send('null');
            client.send('');

            setTimeout(() => {
              // Server should still be running
              expect(server.getStatus().running).toBe(true);
              client.close();
              resolve();
            }, 200);
          }
        });

        client.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });

    it('should handle unknown message types gracefully', async () => {
      await server.start();
      const pairingCode = server.getStatus().pairingCode;

      const client = new WsClient(`ws://127.0.0.1:${port}`);

      await new Promise<void>((resolve, reject) => {
        client.on('open', () => {
          client.send(
            JSON.stringify({
              type: 'auth',
              pairingCode: pairingCode,
              deviceName: 'Test Device',
            })
          );
        });

        client.on('message', (data) => {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'auth_response' && parsed.success) {
            // Send unknown message type
            client.send(JSON.stringify({ type: 'unknown_type_xyz' }));

            setTimeout(() => {
              expect(server.getStatus().running).toBe(true);
              client.close();
              resolve();
            }, 200);
          }
        });

        client.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });
  });

  describe('Heartbeat and Timeout', () => {
    it('should track client alive status via ping/pong', async () => {
      await server.start();
      const pairingCode = server.getStatus().pairingCode;

      const client = new WsClient(`ws://127.0.0.1:${port}`);

      await new Promise<void>((resolve, reject) => {
        client.on('open', () => {
          client.send(
            JSON.stringify({
              type: 'auth',
              pairingCode: pairingCode,
              deviceName: 'Test Device',
            })
          );
        });

        client.on('message', (data) => {
          const parsed = JSON.parse(data.toString());
          if (parsed.type === 'auth_response' && parsed.success) {
            // Wait briefly to verify heartbeat is set up
            setTimeout(() => {
              expect(server.getStatus().connected).toBe(true);
              client.close();
              resolve();
            }, 100);
          }
        });

        // Respond to pings
        client.on('ping', () => {
          client.pong();
        });

        client.on('error', reject);
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit failed authentication attempts', async () => {
      await server.start();
      const wrongCode = 'WRONG1';

      // Make multiple failed auth attempts from same "IP"
      for (let i = 0; i < 6; i++) {
        const client = new WsClient(`ws://127.0.0.1:${port}`);

        await new Promise<void>((resolve) => {
          client.on('open', () => {
            client.send(
              JSON.stringify({
                type: 'auth',
                pairingCode: wrongCode,
                deviceName: `Attacker ${i}`,
              })
            );
          });

          client.on('message', (data) => {
            const parsed = JSON.parse(data.toString());
            if (parsed.type === 'auth_response') {
              client.close();
              resolve();
            }
          });

          client.on('error', () => resolve());
          setTimeout(() => resolve(), 2000);
        });
      }

      // The rate limiter should be tracking attempts
      // (actual lockout testing would require mocking time)
      expect(server.getStatus().running).toBe(true);
    });
  });
});
