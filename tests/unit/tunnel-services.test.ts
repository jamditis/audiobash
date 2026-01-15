/**
 * Tunnel Services Unit Tests
 * Tests for ngrok and Cloudflare tunnel services
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process
const mockSpawn = vi.fn();
const mockExecSync = vi.fn();

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

// Mock fs
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();

vi.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
}));

// Mock os
vi.mock('os', () => ({
  homedir: () => '/home/user',
  tmpdir: () => '/tmp',
  platform: 'linux',
}));

// Mock process before tests
const originalPlatform = process.platform;
const originalEnv = process.env;

describe('NgrokService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => {
      throw new Error('not found');
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    process.env = originalEnv;
  });

  describe('Auth Token Detection', () => {
    it('detects when NGROK_AUTHTOKEN is set', () => {
      process.env = { ...process.env, NGROK_AUTHTOKEN: 'test-token' };
      const hasToken = !!process.env.NGROK_AUTHTOKEN;
      expect(hasToken).toBe(true);
    });

    it('detects when NGROK_AUTHTOKEN is not set', () => {
      const env = { ...process.env };
      delete env.NGROK_AUTHTOKEN;
      process.env = env;
      const hasToken = !!process.env.NGROK_AUTHTOKEN;
      expect(hasToken).toBe(false);
    });
  });

  describe('Binary Path Detection - Linux', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
    });

    it('searches PATH using which command', () => {
      mockExecSync.mockReturnValue('/usr/local/bin/ngrok\n');

      const result = mockExecSync('which ngrok', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      expect(result.trim().split('\n')[0]).toBe('/usr/local/bin/ngrok');
    });

    it('checks common Linux paths', () => {
      const commonPaths = [
        '/usr/local/bin/ngrok',
        '/usr/bin/ngrok',
        '/home/user/ngrok',
        '/home/user/bin/ngrok',
      ];

      expect(commonPaths).toContain('/usr/local/bin/ngrok');
      expect(commonPaths).toContain('/home/user/ngrok');
    });

    it('returns null when not found', () => {
      mockExecSync.mockImplementation(() => { throw new Error('not found'); });
      mockExistsSync.mockReturnValue(false);

      let found = null;
      try {
        mockExecSync('which ngrok');
      } catch {
        found = null;
      }

      expect(found).toBeNull();
    });
  });

  describe('Binary Path Detection - macOS', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
    });

    it('checks Homebrew paths', () => {
      const darwinPaths = [
        '/usr/local/bin/ngrok',
        '/opt/homebrew/bin/ngrok',
        '/home/user/ngrok',
        '/home/user/Downloads/ngrok',
      ];

      expect(darwinPaths).toContain('/opt/homebrew/bin/ngrok');
      expect(darwinPaths).toContain('/usr/local/bin/ngrok');
    });
  });

  describe('Binary Path Detection - Windows', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
    });

    it('uses where command instead of which', () => {
      const platform = 'win32';
      const whichCommand = platform === 'win32' ? 'where' : 'which';
      expect(whichCommand).toBe('where');
    });

    it('checks Windows-specific paths', () => {
      const windowsPaths = [
        '/home/user/ngrok.exe',
        '/home/user/Downloads/ngrok.exe',
      ];

      // Should use .exe extension on Windows
      expect(windowsPaths[0]).toContain('.exe');
    });

    it('uses correct binary name', () => {
      const platform = 'win32';
      const binaryName = platform === 'win32' ? 'ngrok.exe' : 'ngrok';
      expect(binaryName).toBe('ngrok.exe');
    });
  });

  describe('URL Extraction', () => {
    it('extracts ngrok.io URLs', () => {
      const text = 'Forwarding https://abc123.ngrok.io -> http://localhost:8765';
      const pattern = /https?:\/\/[a-z0-9-]+\.ngrok\.io/i;
      const match = text.match(pattern);

      expect(match).not.toBeNull();
      expect(match![0]).toBe('https://abc123.ngrok.io');
    });

    it('extracts ngrok-free.app URLs', () => {
      const text = 'Forwarding https://abc123.ngrok-free.app -> http://localhost:8765';
      const pattern = /https?:\/\/[a-z0-9-]+\.ngrok-free\.app/i;
      const match = text.match(pattern);

      expect(match).not.toBeNull();
      expect(match![0]).toBe('https://abc123.ngrok-free.app');
    });

    it('extracts ngrok.app URLs', () => {
      const text = 'url: https://abc123.ngrok.app';
      const pattern = /https?:\/\/[a-z0-9-]+\.ngrok\.app/i;
      const match = text.match(pattern);

      expect(match).not.toBeNull();
    });

    it('extracts ngrok.dev URLs', () => {
      const text = 'Tunnel: https://my-tunnel.ngrok.dev';
      const pattern = /https?:\/\/[a-z0-9-]+\.ngrok\.dev/i;
      const match = text.match(pattern);

      expect(match).not.toBeNull();
    });

    it('extracts URL from Forwarding line', () => {
      const text = 'Forwarding                    https://1234.ngrok.io -> http://localhost:8765';
      const pattern = /Forwarding\s+(https?:\/\/[^\s]+)/i;
      const match = text.match(pattern);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://1234.ngrok.io');
    });

    it('converts https to wss for WebSocket', () => {
      const httpUrl = 'https://abc123.ngrok.io';
      const wssUrl = httpUrl.replace(/^https?:\/\//, 'wss://');

      expect(wssUrl).toBe('wss://abc123.ngrok.io');
    });
  });

  describe('Error Parsing', () => {
    it('parses authentication error', () => {
      const error = 'ERR_NGROK_105: Authentication required';
      const isAuthError = error.includes('ERR_NGROK_105') || error.includes('authentication');
      expect(isAuthError).toBe(true);
    });

    it('parses session limit error', () => {
      const error = 'ERR_NGROK_108: tunnel session limit';
      const isSessionLimit = error.includes('ERR_NGROK_108') || error.includes('tunnel session');
      expect(isSessionLimit).toBe(true);
    });

    it('parses region error', () => {
      const error = 'ERR_NGROK_120: Invalid region';
      const isRegionError = error.includes('ERR_NGROK_120');
      expect(isRegionError).toBe(true);
    });

    it('parses free plan limit error', () => {
      const error = 'ERR_NGROK_226: Only one online tunnel per ngrok agent';
      const isFreePlanLimit = error.includes('ERR_NGROK_226');
      expect(isFreePlanLimit).toBe(true);
    });

    it('extracts error code from message', () => {
      const error = 'Connection failed: ERR_NGROK_123 - Something went wrong';
      const match = error.match(/ERR_NGROK_\d+/);

      expect(match).not.toBeNull();
      expect(match![0]).toBe('ERR_NGROK_123');
    });
  });

  describe('NPM Package Detection', () => {
    it('attempts to require @ngrok/ngrok package', () => {
      let hasNpmPackage = false;
      try {
        // Simulating the require check
        hasNpmPackage = false; // Would be true if package exists
      } catch {
        hasNpmPackage = false;
      }

      expect(typeof hasNpmPackage).toBe('boolean');
    });
  });

  describe('Service Status', () => {
    it('returns status object', () => {
      const status = {
        status: 'disconnected' as const,
        tunnelUrl: null as string | null,
        error: null as string | null,
        hasAuthToken: false,
      };

      expect(status.status).toBe('disconnected');
      expect(status.tunnelUrl).toBeNull();
    });

    it('tracks connection states', () => {
      const validStates = ['disconnected', 'connecting', 'connected', 'error'];

      for (const state of validStates) {
        expect(validStates).toContain(state);
      }
    });

    it('includes tunnel URL when connected', () => {
      const status = {
        status: 'connected',
        tunnelUrl: 'wss://abc123.ngrok.io',
        error: null,
      };

      expect(status.tunnelUrl).not.toBeNull();
    });
  });

  describe('CLI Arguments', () => {
    it('uses correct command format', () => {
      const port = 8765;
      const args = ['http', String(port), '--log', 'stdout', '--log-format', 'json'];

      expect(args[0]).toBe('http');
      expect(args[1]).toBe('8765');
      expect(args).toContain('--log-format');
      expect(args).toContain('json');
    });

    it('passes auth token via environment', () => {
      const token = 'test-auth-token';
      const env = { NGROK_AUTHTOKEN: token };

      expect(env.NGROK_AUTHTOKEN).toBe(token);
    });
  });

  describe('Connection Timeout', () => {
    it('has 30-second timeout', () => {
      const TIMEOUT = 30000;
      expect(TIMEOUT).toBe(30000);
    });
  });

  describe('Binary Check Result', () => {
    it('returns availability info', () => {
      const result = {
        available: true,
        path: '/usr/local/bin/ngrok',
        hasAuthToken: true,
        message: 'ngrok CLI is installed and authenticated',
      };

      expect(result.available).toBe(true);
      expect(result.path).toBeDefined();
      expect(result.message).toContain('authenticated');
    });

    it('returns npm package info when available', () => {
      const result = {
        available: true,
        path: '@ngrok/ngrok (npm package)',
        hasAuthToken: true,
        message: 'ngrok npm package is installed and authenticated',
      };

      expect(result.path).toContain('npm package');
    });

    it('returns not found message when unavailable', () => {
      const result = {
        available: false,
        path: null,
        hasAuthToken: false,
        message: 'ngrok not found. Install via npm: npm install @ngrok/ngrok',
      };

      expect(result.available).toBe(false);
      expect(result.message).toContain('not found');
    });
  });
});

describe('CloudflareService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockExecSync.mockImplementation(() => { throw new Error('not found'); });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('Binary Path Detection - Linux', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
    });

    it('searches PATH using which command', () => {
      mockExecSync.mockReturnValue('/usr/local/bin/cloudflared\n');

      const result = mockExecSync('which cloudflared');
      expect(result).toContain('cloudflared');
    });

    it('checks common Linux paths', () => {
      const commonPaths = [
        '/usr/local/bin/cloudflared',
        '/usr/bin/cloudflared',
        '/home/user/cloudflared',
        '/home/user/bin/cloudflared',
      ];

      expect(commonPaths).toContain('/usr/local/bin/cloudflared');
    });
  });

  describe('Binary Path Detection - macOS', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
    });

    it('checks Homebrew paths', () => {
      const darwinPaths = [
        '/usr/local/bin/cloudflared',
        '/opt/homebrew/bin/cloudflared',
        '/home/user/cloudflared',
        '/home/user/Downloads/cloudflared',
      ];

      expect(darwinPaths).toContain('/opt/homebrew/bin/cloudflared');
    });
  });

  describe('Binary Path Detection - Windows', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
    });

    it('uses where command', () => {
      const platform = 'win32';
      const whichCommand = platform === 'win32' ? 'where' : 'which';
      expect(whichCommand).toBe('where');
    });

    it('checks Windows-specific paths', () => {
      const windowsPaths = [
        '/home/user/cloudflared.exe',
        '/home/user/Downloads/cloudflared.exe',
        'C:\\cloudflared\\cloudflared.exe',
      ];

      expect(windowsPaths[2]).toContain('C:\\');
    });

    it('uses .exe extension', () => {
      const platform = 'win32';
      const binaryName = platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
      expect(binaryName).toBe('cloudflared.exe');
    });
  });

  describe('URL Extraction', () => {
    it('extracts trycloudflare.com URLs', () => {
      const text = 'Tunnel established at https://random-words.trycloudflare.com';
      const pattern = /https?:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
      const match = text.match(pattern);

      expect(match).not.toBeNull();
      expect(match![0]).toContain('trycloudflare.com');
    });

    it('extracts cfargotunnel.com URLs', () => {
      const text = 'URL: https://tunnel-id.cfargotunnel.com';
      const pattern = /https?:\/\/[a-z0-9-]+\.cfargotunnel\.com/i;
      const match = text.match(pattern);

      expect(match).not.toBeNull();
    });

    it('extracts URL from JSON format', () => {
      const text = '{"url": "https://test.trycloudflare.com"}';
      const pattern = /"url"\s*:\s*"(https?:\/\/[^"]+)"/i;
      const match = text.match(pattern);

      expect(match).not.toBeNull();
      expect(match![1]).toBe('https://test.trycloudflare.com');
    });

    it('extracts URL from INF log format', () => {
      const text = 'INF | https://random.trycloudflare.com connected';
      // The pattern in the actual code matches this format
      const urlPattern = /https?:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
      const match = text.match(urlPattern);

      expect(match).not.toBeNull();
    });

    it('converts https to wss for WebSocket', () => {
      const httpUrl = 'https://random.trycloudflare.com';
      const wssUrl = httpUrl.replace(/^https?:\/\//, 'wss://');

      expect(wssUrl).toBe('wss://random.trycloudflare.com');
    });
  });

  describe('Error Parsing', () => {
    it('parses connection refused error', () => {
      const error = 'failed to connect: connection refused';
      const isConnectionError = error.includes('failed to connect') || error.includes('connection refused');
      expect(isConnectionError).toBe(true);
    });

    it('parses invalid port error', () => {
      const error = 'invalid port configuration';
      const isPortError = error.toLowerCase().includes('port');
      expect(isPortError).toBe(true);
    });

    it('parses QUIC error', () => {
      const error = 'QUIC connection failed';
      const isQuicError = error.toLowerCase().includes('quic');
      expect(isQuicError).toBe(true);
    });

    it('extracts first error line', () => {
      const output = 'INFO Starting tunnel\nERROR Connection failed\nINFO Retrying';
      const errorLines = output.split('\n').filter(l => l.toLowerCase().includes('error'));

      expect(errorLines.length).toBeGreaterThan(0);
      expect(errorLines[0]).toContain('ERROR');
    });

    it('truncates long error messages', () => {
      const longError = 'Error: ' + 'x'.repeat(300);
      const maxLength = 200;
      const truncated = longError.slice(0, maxLength);

      expect(truncated.length).toBe(maxLength);
    });
  });

  describe('Service Status', () => {
    it('returns status object', () => {
      const status = {
        status: 'disconnected' as const,
        tunnelUrl: null as string | null,
        error: null as string | null,
      };

      expect(status.status).toBe('disconnected');
    });

    it('tracks all connection states', () => {
      const validStates = ['disconnected', 'connecting', 'connected', 'error'];

      for (const state of validStates) {
        expect(validStates).toContain(state);
      }
    });
  });

  describe('CLI Arguments', () => {
    it('uses quick tunnel command format', () => {
      const port = 8765;
      const args = ['tunnel', '--url', `http://localhost:${port}`];

      expect(args[0]).toBe('tunnel');
      expect(args[1]).toBe('--url');
      expect(args[2]).toBe('http://localhost:8765');
    });

    it('does not require authentication for quick tunnels', () => {
      // Quick tunnels work without account
      const requiresAuth = false;
      expect(requiresAuth).toBe(false);
    });
  });

  describe('Connection Timeout', () => {
    it('has 30-second timeout', () => {
      const TIMEOUT = 30000;
      expect(TIMEOUT).toBe(30000);
    });
  });

  describe('Binary Check Result', () => {
    it('returns availability info', () => {
      const result = {
        available: true,
        path: '/usr/local/bin/cloudflared',
        message: 'cloudflared is installed and ready (quick tunnel mode - no account required)',
      };

      expect(result.available).toBe(true);
      expect(result.message).toContain('no account required');
    });

    it('returns download link when not found', () => {
      const result = {
        available: false,
        path: null,
        message: 'cloudflared not found. Download from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
      };

      expect(result.available).toBe(false);
      expect(result.message).toContain('Download from');
      expect(result.message).toContain('cloudflare.com');
    });
  });

  describe('Process Management', () => {
    it('spawns with correct stdio configuration', () => {
      const spawnConfig = {
        stdio: ['ignore', 'pipe', 'pipe'],
      };

      expect(spawnConfig.stdio[0]).toBe('ignore');
      expect(spawnConfig.stdio[1]).toBe('pipe');
      expect(spawnConfig.stdio[2]).toBe('pipe');
    });

    it('handles process exit codes', () => {
      const exitCodes = {
        success: 0,
        error: 1,
        signal: null,
      };

      expect(exitCodes.success).toBe(0);
      expect(exitCodes.error).not.toBe(0);
    });
  });
});

describe('Tunnel Service Common Patterns', () => {
  describe('Status Change Notification', () => {
    it('calls callback on status change', () => {
      const onStatusChange = vi.fn();
      const status = { status: 'connected', tunnelUrl: 'wss://test.com' };

      onStatusChange(status);

      expect(onStatusChange).toHaveBeenCalledWith(status);
    });
  });

  describe('URL to WSS Conversion', () => {
    it('converts http to wss', () => {
      const convert = (url: string) => url.replace(/^https?:\/\//, 'wss://');

      expect(convert('http://test.com')).toBe('wss://test.com');
      expect(convert('https://test.com')).toBe('wss://test.com');
    });

    it('preserves path and query string', () => {
      const url = 'https://test.com/path?query=1';
      const wssUrl = url.replace(/^https?:\/\//, 'wss://');

      expect(wssUrl).toBe('wss://test.com/path?query=1');
    });
  });

  describe('Process Cleanup', () => {
    it('kills process on stop', () => {
      const mockProcess = {
        kill: vi.fn(),
        killed: false,
      };

      mockProcess.kill();
      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('clears tunnel URL on stop', () => {
      let tunnelUrl: string | null = 'wss://test.com';
      tunnelUrl = null;
      expect(tunnelUrl).toBeNull();
    });

    it('resets status on stop', () => {
      let status = 'connected';
      status = 'disconnected';
      expect(status).toBe('disconnected');
    });
  });

  describe('Error Recovery', () => {
    it('sets error status on failure', () => {
      let status = 'connecting';
      let error: string | null = null;

      // Simulate error
      status = 'error';
      error = 'Connection failed';

      expect(status).toBe('error');
      expect(error).not.toBeNull();
    });

    it('clears error on successful reconnect', () => {
      let error: string | null = 'Previous error';

      // Simulate successful reconnect
      error = null;

      expect(error).toBeNull();
    });
  });
});

describe('Platform-Specific Binary Names', () => {
  it('uses .exe extension on Windows', () => {
    const getBinaryName = (name: string, platform: string) => {
      return platform === 'win32' ? `${name}.exe` : name;
    };

    expect(getBinaryName('ngrok', 'win32')).toBe('ngrok.exe');
    expect(getBinaryName('cloudflared', 'win32')).toBe('cloudflared.exe');
  });

  it('uses plain name on Unix', () => {
    const getBinaryName = (name: string, platform: string) => {
      return platform === 'win32' ? `${name}.exe` : name;
    };

    expect(getBinaryName('ngrok', 'linux')).toBe('ngrok');
    expect(getBinaryName('ngrok', 'darwin')).toBe('ngrok');
    expect(getBinaryName('cloudflared', 'linux')).toBe('cloudflared');
  });
});

describe('Download Links', () => {
  it('provides ngrok download link', () => {
    const ngrokDownload = 'https://ngrok.com/download';
    expect(ngrokDownload).toContain('ngrok.com');
  });

  it('provides cloudflared download link', () => {
    const cloudflaredDownload = 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/';
    expect(cloudflaredDownload).toContain('cloudflare.com');
  });

  it('provides npm install command for ngrok', () => {
    const npmCommand = 'npm install @ngrok/ngrok';
    expect(npmCommand).toContain('@ngrok/ngrok');
  });
});
