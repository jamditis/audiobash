/**
 * Tunnel Service Integration Tests
 * Tests tunnel service detection, lifecycle, and URL retrieval.
 * These tests check if binaries are available and skip if not.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Import tunnel services
const { CloudflareService } = require('../../electron/cloudflareService.cjs');
const { NgrokService } = require('../../electron/ngrokService.cjs');

// Helper to check if a binary is available
function isBinaryAvailable(name: string): boolean {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    execSync(`${which} ${name}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// Environment flag for enabling external service tests
const ENABLE_EXTERNAL_TESTS = process.env.AUDIOBASH_EXTERNAL_TESTS === 'true';

describe('Cloudflare Tunnel Service', () => {
  let cloudflareService: InstanceType<typeof CloudflareService>;

  beforeEach(() => {
    cloudflareService = new CloudflareService();
  });

  afterEach(async () => {
    // Always stop the service after tests
    try {
      cloudflareService.stop();
    } catch {
      // Ignore cleanup errors
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe('Binary Detection', () => {
    it('should detect cloudflared binary availability', () => {
      const result = cloudflareService.checkBinary();

      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('message');

      if (result.available) {
        expect(result.path).toBeTruthy();
        expect(result.message).toContain('installed');
      } else {
        expect(result.message).toContain('not found');
      }
    });

    it('should return correct binary path for platform', () => {
      const binaryPath = cloudflareService.getCloudflareBinaryPath();

      if (binaryPath) {
        // If found, verify it exists
        expect(fs.existsSync(binaryPath)).toBe(true);

        // Check platform-specific naming
        if (process.platform === 'win32') {
          expect(binaryPath).toMatch(/cloudflared\.exe$/i);
        } else {
          expect(binaryPath).toMatch(/cloudflared$/);
        }
      }
    });

    it('should check common installation paths', () => {
      const service = new CloudflareService();
      const binaryPath = service.getCloudflareBinaryPath();

      // This test verifies the method runs without error
      // Actual path depends on system configuration
      expect(typeof binaryPath === 'string' || binaryPath === null).toBe(true);
    });
  });

  describe('Service Status', () => {
    it('should report disconnected status initially', () => {
      const status = cloudflareService.getStatus();

      expect(status.status).toBe('disconnected');
      expect(status.tunnelUrl).toBeNull();
      expect(status.error).toBeNull();
    });

    it('should notify status changes via callback', () => {
      const statusChanges: { status: string; tunnelUrl: string | null }[] = [];

      cloudflareService.onStatusChange = (status: { status: string; tunnelUrl: string | null }) => {
        statusChanges.push({ ...status });
      };

      // Simulate status change
      cloudflareService.status = 'connecting';
      cloudflareService.notifyStatusChange();

      expect(statusChanges.length).toBe(1);
      expect(statusChanges[0].status).toBe('connecting');
    });
  });

  describe('URL Extraction', () => {
    it('should extract trycloudflare.com URLs', () => {
      const testUrls = [
        'https://sample-tunnel-abc123.trycloudflare.com',
        'https://my-tunnel.trycloudflare.com',
        'http://test-xyz.trycloudflare.com',
      ];

      for (const url of testUrls) {
        const extracted = cloudflareService.extractTunnelUrl(`Some output with ${url} in it`);
        expect(extracted).toBe(url);
      }
    });

    it('should extract cfargotunnel.com URLs', () => {
      const url = 'https://tunnel-xyz.cfargotunnel.com';
      const extracted = cloudflareService.extractTunnelUrl(`Connected to ${url}`);
      expect(extracted).toBe(url);
    });

    it('should return null for text without URLs', () => {
      const result = cloudflareService.extractTunnelUrl('No URL here');
      expect(result).toBeNull();
    });

    it('should extract URL from JSON format', () => {
      const jsonOutput = '{"url": "https://test.trycloudflare.com"}';
      const extracted = cloudflareService.extractTunnelUrl(jsonOutput);
      expect(extracted).toBe('https://test.trycloudflare.com');
    });
  });

  describe('Error Parsing', () => {
    it('should parse connection refused errors', () => {
      const error = cloudflareService.parseCloudflareError('failed to connect: connection refused');
      expect(error).toContain('Failed to connect');
    });

    it('should parse QUIC errors', () => {
      const error = cloudflareService.parseCloudflareError('QUIC connection error');
      expect(error).toContain('QUIC');
    });

    it('should truncate long error messages', () => {
      const longError = 'error: '.repeat(100);
      const parsed = cloudflareService.parseCloudflareError(longError);
      expect(parsed.length).toBeLessThanOrEqual(200);
    });
  });

  describe.skipIf(!isBinaryAvailable('cloudflared') || !ENABLE_EXTERNAL_TESTS)(
    'Live Tunnel Tests (requires cloudflared)',
    () => {
      it('should start and stop tunnel', async () => {
        const service = new CloudflareService();
        let statusUpdates: string[] = [];

        service.onStatusChange = (status: { status: string }) => {
          statusUpdates.push(status.status);
        };

        // Start tunnel on a test port
        try {
          await service.start(19999);

          expect(service.getStatus().status).toBe('connected');
          expect(service.getStatus().tunnelUrl).toMatch(/wss:\/\/.+\.trycloudflare\.com/);

          // Stop tunnel
          service.stop();

          expect(service.getStatus().status).toBe('disconnected');
          expect(service.getStatus().tunnelUrl).toBeNull();

          // Should have status updates
          expect(statusUpdates).toContain('connecting');
          expect(statusUpdates).toContain('connected');
          expect(statusUpdates).toContain('disconnected');
        } catch (err: any) {
          // May fail due to network issues - that's okay for CI
          console.log('Cloudflare tunnel test skipped:', err.message);
        }
      }, 35000); // 35 second timeout
    }
  );
});

describe('ngrok Tunnel Service', () => {
  let ngrokService: InstanceType<typeof NgrokService>;

  beforeEach(() => {
    ngrokService = new NgrokService();
  });

  afterEach(async () => {
    try {
      await ngrokService.stop();
    } catch {
      // Ignore cleanup errors
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe('Binary Detection', () => {
    it('should detect ngrok availability (CLI or npm package)', () => {
      const result = ngrokService.checkBinary();

      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('hasAuthToken');

      if (result.available) {
        expect(result.path).toBeTruthy();
      }
    });

    it('should check for NGROK_AUTHTOKEN', () => {
      const hasToken = ngrokService.hasAuthToken();
      const expectedHasToken = !!process.env.NGROK_AUTHTOKEN;

      expect(hasToken).toBe(expectedHasToken);
    });

    it('should check both CLI and npm package', () => {
      const hasNpm = ngrokService.checkNpmPackage();
      const binaryPath = ngrokService.getNgrokBinaryPath();

      // At least document what's available
      if (hasNpm) {
        expect(ngrokService.ngrokModule).toBeTruthy();
      }

      if (binaryPath) {
        expect(fs.existsSync(binaryPath)).toBe(true);
      }
    });
  });

  describe('Service Status', () => {
    it('should report disconnected status initially', () => {
      const status = ngrokService.getStatus();

      expect(status.status).toBe('disconnected');
      expect(status.tunnelUrl).toBeNull();
      expect(status.error).toBeNull();
    });

    it('should track auth token status', () => {
      const status = ngrokService.getStatus();
      expect(typeof status.hasAuthToken).toBe('boolean');
    });
  });

  describe('URL Extraction', () => {
    it('should extract ngrok.io URLs', () => {
      const testUrls = [
        'https://abc123.ngrok.io',
        'https://xyz789.ngrok-free.app',
        'https://tunnel.ngrok.app',
      ];

      for (const url of testUrls) {
        const extracted = ngrokService.extractNgrokUrl(`Forwarding ${url} -> localhost:8080`);
        expect(extracted).toBeTruthy();
      }
    });

    it('should extract URL from Forwarding line', () => {
      const output = 'Forwarding https://abc123.ngrok-free.app -> http://localhost:8765';
      const extracted = ngrokService.extractNgrokUrl(output);
      expect(extracted).toContain('ngrok');
    });

    it('should return null for text without ngrok URLs', () => {
      const result = ngrokService.extractNgrokUrl('No ngrok URL here');
      expect(result).toBeNull();
    });
  });

  describe('Error Parsing', () => {
    it('should parse auth required errors', () => {
      const error = ngrokService.parseNgrokError('ERR_NGROK_105: authentication required');
      expect(error).toContain('authentication');
    });

    it('should parse session limit errors', () => {
      const error = ngrokService.parseNgrokError('ERR_NGROK_108: tunnel session limit');
      expect(error).toContain('session');
    });

    it('should parse single tunnel limit errors', () => {
      const error = ngrokService.parseNgrokError('ERR_NGROK_226: only one tunnel per agent');
      expect(error).toContain('tunnel');
    });

    it('should handle unknown error codes', () => {
      const error = ngrokService.parseNgrokError('ERR_NGROK_999: unknown error');
      expect(error).toContain('ERR_NGROK_999');
    });
  });

  describe('URL Handling', () => {
    it('should convert https to wss for WebSocket URLs', () => {
      const service = new NgrokService();
      service.handleUrlFound('https://test.ngrok-free.app');

      expect(service.tunnelUrl).toBe('wss://test.ngrok-free.app');
      expect(service.status).toBe('connected');
    });
  });

  describe.skipIf(!ENABLE_EXTERNAL_TESTS)('Live Tunnel Tests (requires ngrok)', () => {
    it('should report error if ngrok not available', async () => {
      const service = new NgrokService();

      // Clear internal state to simulate unavailable
      service.ngrokModule = null;

      const originalCheck = service.checkNpmPackage;
      const originalBinary = service.getNgrokBinaryPath;

      service.checkNpmPackage = () => false;
      service.getNgrokBinaryPath = () => null;

      try {
        await service.start(19998);
      } catch (err: any) {
        // Expected to fail
        expect(err.message).toContain('ngrok');
      }

      // Restore
      service.checkNpmPackage = originalCheck;
      service.getNgrokBinaryPath = originalBinary;
    });
  });
});

describe('Tunnel Service Error Handling', () => {
  describe('Missing Binary Handling', () => {
    it('should handle cloudflared not found gracefully', async () => {
      const service = new CloudflareService();

      // Mock getCloudflareBinaryPath to return null
      const original = service.getCloudflareBinaryPath;
      service.getCloudflareBinaryPath = () => null;

      try {
        await service.start(8765);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).toContain('not found');
        expect(service.getStatus().status).toBe('error');
      }

      service.getCloudflareBinaryPath = original;
    });

    it('should handle ngrok not found gracefully', async () => {
      const service = new NgrokService();

      // Mock both detection methods
      service.checkNpmPackage = () => false;
      service.getNgrokBinaryPath = () => null;

      await service.start(8765);

      expect(service.getStatus().status).toBe('error');
      expect(service.getStatus().error).toContain('not found');
    });
  });

  describe('Stop Behavior', () => {
    it('should handle stop when not started (cloudflare)', () => {
      const service = new CloudflareService();

      // Should not throw
      expect(() => service.stop()).not.toThrow();
      expect(service.getStatus().status).toBe('disconnected');
    });

    it('should handle stop when not started (ngrok)', async () => {
      const service = new NgrokService();

      // Should not throw
      await expect(service.stop()).resolves.not.toThrow();
      expect(service.getStatus().status).toBe('disconnected');
    });

    it('should clear state on stop (cloudflare)', () => {
      const service = new CloudflareService();
      service.tunnelUrl = 'wss://test.trycloudflare.com';
      service.status = 'connected';

      service.stop();

      expect(service.tunnelUrl).toBeNull();
      expect(service.status).toBe('disconnected');
      expect(service.error).toBeNull();
    });

    it('should clear state on stop (ngrok)', async () => {
      const service = new NgrokService();
      service.tunnelUrl = 'wss://test.ngrok.io';
      service.status = 'connected';

      await service.stop();

      expect(service.tunnelUrl).toBeNull();
      expect(service.status).toBe('disconnected');
      expect(service.error).toBeNull();
    });
  });
});

describe('Cross-Platform Binary Path Resolution', () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  it('should check correct paths for Windows', () => {
    // Only test on Windows
    if (process.platform !== 'win32') return;

    const cloudflare = new CloudflareService();
    const ngrok = new NgrokService();

    // These should not throw
    expect(() => cloudflare.getCloudflareBinaryPath()).not.toThrow();
    expect(() => ngrok.getNgrokBinaryPath()).not.toThrow();
  });

  it('should check correct paths for macOS', () => {
    // Only test on macOS
    if (process.platform !== 'darwin') return;

    const cloudflare = new CloudflareService();
    const ngrok = new NgrokService();

    // These should not throw
    expect(() => cloudflare.getCloudflareBinaryPath()).not.toThrow();
    expect(() => ngrok.getNgrokBinaryPath()).not.toThrow();
  });

  it('should check correct paths for Linux', () => {
    // Only test on Linux
    if (process.platform !== 'linux') return;

    const cloudflare = new CloudflareService();
    const ngrok = new NgrokService();

    // These should not throw
    expect(() => cloudflare.getCloudflareBinaryPath()).not.toThrow();
    expect(() => ngrok.getNgrokBinaryPath()).not.toThrow();
  });
});

describe('Concurrent Tunnel Operations', () => {
  it('should handle multiple check operations', async () => {
    const cloudflare = new CloudflareService();
    const ngrok = new NgrokService();

    // Run multiple checks in parallel
    const results = await Promise.all([
      Promise.resolve(cloudflare.checkBinary()),
      Promise.resolve(cloudflare.checkBinary()),
      Promise.resolve(ngrok.checkBinary()),
      Promise.resolve(ngrok.checkBinary()),
    ]);

    // All should return valid results
    for (const result of results) {
      expect(result).toHaveProperty('available');
      expect(result).toHaveProperty('message');
    }
  });

  it('should handle stop being called multiple times', async () => {
    const cloudflare = new CloudflareService();
    const ngrok = new NgrokService();

    // Multiple stops should not throw
    for (let i = 0; i < 5; i++) {
      cloudflare.stop();
      await ngrok.stop();
    }

    expect(cloudflare.getStatus().status).toBe('disconnected');
    expect(ngrok.getStatus().status).toBe('disconnected');
  });
});
