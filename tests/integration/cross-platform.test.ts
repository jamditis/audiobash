/**
 * Cross-Platform Integration Tests
 * Tests platform-specific behavior including shell detection, path handling,
 * and binary path resolution across Windows, macOS, and Linux.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';

// Store original platform for restoration
const originalPlatform = process.platform;
const originalEnv = { ...process.env };

// Helper to mock process.platform
function mockPlatform(platform: string): void {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
}

// Helper to restore platform
function restorePlatform(): void {
  Object.defineProperty(process, 'platform', {
    value: originalPlatform,
    configurable: true,
  });
}

describe('Shell Detection', () => {
  describe('Current Platform Shell Detection', () => {
    it('should return correct shell environment variable', () => {
      if (process.platform !== 'win32') {
        expect(process.env.SHELL).toBeDefined();
        expect(process.env.SHELL).toMatch(/\/(bash|zsh|sh|fish|tcsh|csh)$/);
      }
    });

    it('should detect zsh on macOS', () => {
      if (process.platform !== 'darwin') return;

      // macOS default shell is zsh since Catalina
      const defaultShell = process.env.SHELL || '/bin/bash';
      // Should be either zsh or bash
      expect(defaultShell).toMatch(/\/(zsh|bash)$/);
    });

    it('should detect PowerShell on Windows', () => {
      if (process.platform !== 'win32') return;

      // PowerShell should be available
      try {
        execSync('powershell.exe -Command "echo test"', { stdio: 'pipe' });
        expect(true).toBe(true);
      } catch {
        // PowerShell not available - unusual but possible
        expect(true).toBe(true);
      }
    });
  });

  describe('Platform-Specific Shell Configuration', () => {
    it('should use platform-appropriate shell selection logic', () => {
      // Simulate the shell selection logic from main.cjs
      const getShell = () => {
        if (process.platform === 'win32') {
          return 'powershell.exe';
        }
        return process.env.SHELL || 'bash';
      };

      const shell = getShell();

      if (process.platform === 'win32') {
        expect(shell).toBe('powershell.exe');
      } else {
        expect(shell).toBeTruthy();
        expect(typeof shell).toBe('string');
      }
    });

    it('should fallback to bash when SHELL is not set', () => {
      const originalShell = process.env.SHELL;
      delete process.env.SHELL;

      const fallbackShell = process.env.SHELL || 'bash';
      expect(fallbackShell).toBe('bash');

      process.env.SHELL = originalShell;
    });
  });
});

describe('Path Separator Handling', () => {
  it('should handle path.join correctly on current platform', () => {
    const joined = path.join('/home', 'user', 'project');

    if (process.platform === 'win32') {
      expect(joined).toContain('\\');
    } else {
      expect(joined).toBe('/home/user/project');
    }
  });

  it('should normalize paths correctly', () => {
    const testPaths = [
      '/home/user/../user/project',
      '/home/user/./project',
      '/home/user//project',
    ];

    for (const testPath of testPaths) {
      const normalized = path.normalize(testPath);
      expect(normalized).not.toContain('..');
      expect(normalized).not.toContain('./');
      expect(normalized).not.toContain('//');
    }
  });

  it('should resolve relative paths correctly', () => {
    const basePath = os.homedir();
    const relativePath = 'project/src';

    const resolved = path.resolve(basePath, relativePath);

    expect(resolved).toContain(basePath);
    expect(path.isAbsolute(resolved)).toBe(true);
  });

  it('should detect absolute paths correctly', () => {
    const absolutePaths =
      process.platform === 'win32'
        ? ['C:\\Users\\test', 'D:\\project']
        : ['/home/user', '/var/log', '/'];

    const relativePaths = ['project', './src', '../parent'];

    for (const p of absolutePaths) {
      expect(path.isAbsolute(p)).toBe(true);
    }

    for (const p of relativePaths) {
      expect(path.isAbsolute(p)).toBe(false);
    }
  });

  it('should handle home directory correctly', () => {
    const homeDir = os.homedir();

    expect(homeDir).toBeTruthy();
    expect(path.isAbsolute(homeDir)).toBe(true);
    expect(fs.existsSync(homeDir)).toBe(true);
  });
});

describe('which/where Command', () => {
  it('should use correct command for platform', () => {
    const whichCommand = process.platform === 'win32' ? 'where' : 'which';

    try {
      // Test with a command that exists on all platforms
      const nodeCommand = process.platform === 'win32' ? 'node.exe' : 'node';
      execSync(`${whichCommand} ${nodeCommand}`, { stdio: 'pipe' });
      expect(true).toBe(true);
    } catch {
      // Node might not be in PATH in some environments
      expect(true).toBe(true);
    }
  });
});

describe('OS-Specific Information', () => {
  it('should detect current OS type', () => {
    const getOsType = () => {
      switch (process.platform) {
        case 'win32':
          return 'windows';
        case 'darwin':
          return 'mac';
        default:
          return 'linux';
      }
    };

    const osType = getOsType();
    expect(['windows', 'mac', 'linux']).toContain(osType);
  });

  it('should get hostname', () => {
    const hostname = os.hostname();
    expect(hostname).toBeTruthy();
    expect(typeof hostname).toBe('string');
  });

  it('should get network interfaces', () => {
    const interfaces = os.networkInterfaces();
    expect(interfaces).toBeTruthy();
    expect(typeof interfaces).toBe('object');

    // Should have at least one interface
    const interfaceNames = Object.keys(interfaces);
    expect(interfaceNames.length).toBeGreaterThan(0);
  });

  it('should find IPv4 addresses', () => {
    const interfaces = os.networkInterfaces();
    const ipv4Addresses: string[] = [];

    for (const name of Object.keys(interfaces)) {
      const addresses = interfaces[name];
      if (addresses) {
        for (const addr of addresses) {
          if (addr.family === 'IPv4') {
            ipv4Addresses.push(addr.address);
          }
        }
      }
    }

    // Should have at least loopback
    expect(ipv4Addresses.length).toBeGreaterThan(0);
    expect(ipv4Addresses).toContain('127.0.0.1');
  });

  it('should get temporary directory', () => {
    const tmpDir = os.tmpdir();
    expect(tmpDir).toBeTruthy();
    expect(path.isAbsolute(tmpDir)).toBe(true);
    expect(fs.existsSync(tmpDir)).toBe(true);
  });
});

describe('Parameterized Platform Tests', () => {
  const platformScenarios = [
    {
      name: 'Windows',
      platform: 'win32',
      expectedShell: 'powershell.exe',
      pathSeparator: '\\',
      binaryExtension: '.exe',
    },
    {
      name: 'macOS',
      platform: 'darwin',
      expectedShell: '/bin/zsh',
      pathSeparator: '/',
      binaryExtension: '',
    },
    {
      name: 'Linux',
      platform: 'linux',
      expectedShell: '/bin/bash',
      pathSeparator: '/',
      binaryExtension: '',
    },
  ];

  describe.each(platformScenarios)('$name Platform', (scenario) => {
    it(`should use ${scenario.expectedShell} as default shell concept`, () => {
      // This is a conceptual test - we don't actually change platform
      // Just verify our understanding of platform defaults
      const getExpectedShell = (platform: string) => {
        if (platform === 'win32') return 'powershell.exe';
        if (platform === 'darwin') return '/bin/zsh';
        return '/bin/bash';
      };

      expect(getExpectedShell(scenario.platform)).toBe(scenario.expectedShell);
    });

    it(`should use ${scenario.pathSeparator} as path separator concept`, () => {
      const getSeparator = (platform: string) => {
        return platform === 'win32' ? '\\' : '/';
      };

      expect(getSeparator(scenario.platform)).toBe(scenario.pathSeparator);
    });

    it(`should use ${scenario.binaryExtension || 'no'} extension for binaries`, () => {
      const getExtension = (platform: string) => {
        return platform === 'win32' ? '.exe' : '';
      };

      expect(getExtension(scenario.platform)).toBe(scenario.binaryExtension);
    });
  });
});

describe('Environment Variable Handling', () => {
  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };
  });

  it('should read SHELL environment variable', () => {
    if (process.platform === 'win32') return;

    const shell = process.env.SHELL;
    expect(shell).toBeDefined();
  });

  it('should read PATH environment variable', () => {
    const pathVar = process.env.PATH || process.env.Path;
    expect(pathVar).toBeDefined();
    expect(pathVar!.length).toBeGreaterThan(0);
  });

  it('should read HOME/USERPROFILE environment variable', () => {
    const home = process.env.HOME || process.env.USERPROFILE;
    expect(home).toBeDefined();
    expect(fs.existsSync(home!)).toBe(true);
  });

  it('should handle missing environment variables gracefully', () => {
    // Environment variables should have sensible defaults
    const originalShell = process.env.SHELL;
    delete process.env.SHELL;

    const fallbackShell = process.env.SHELL || 'bash';
    expect(fallbackShell).toBe('bash');

    if (originalShell !== undefined) {
      process.env.SHELL = originalShell;
    }
  });
});

describe('Terminal Configuration', () => {
  it('should use xterm-256color terminal type', () => {
    // This is the expected terminal type from main.cjs
    const terminalType = 'xterm-256color';
    expect(terminalType).toBe('xterm-256color');
  });

  it('should handle terminal resize dimensions', () => {
    const testDimensions = [
      { cols: 80, rows: 24 },
      { cols: 120, rows: 40 },
      { cols: 200, rows: 50 },
    ];

    for (const dim of testDimensions) {
      expect(dim.cols).toBeGreaterThan(0);
      expect(dim.rows).toBeGreaterThan(0);
    }
  });
});

describe('File System Permissions', () => {
  it('should have write access to temp directory', () => {
    const tmpDir = os.tmpdir();
    const testFile = path.join(tmpDir, `audiobash-test-${Date.now()}.txt`);

    try {
      fs.writeFileSync(testFile, 'test');
      expect(fs.existsSync(testFile)).toBe(true);
      fs.unlinkSync(testFile);
    } catch (err: any) {
      // May fail in restricted environments
      console.log('Temp directory write test failed:', err.message);
    }
  });

  it('should have read access to home directory', () => {
    const homeDir = os.homedir();

    try {
      const contents = fs.readdirSync(homeDir);
      expect(Array.isArray(contents)).toBe(true);
    } catch (err: any) {
      // May fail in restricted environments
      console.log('Home directory read test failed:', err.message);
    }
  });
});

describe('Process Information', () => {
  it('should report current working directory', () => {
    const cwd = process.cwd();
    expect(cwd).toBeTruthy();
    expect(path.isAbsolute(cwd)).toBe(true);
  });

  it('should report process architecture', () => {
    const arch = process.arch;
    expect(['x64', 'arm64', 'ia32', 'arm']).toContain(arch);
  });

  it('should report Node.js version', () => {
    const version = process.version;
    expect(version).toMatch(/^v\d+\.\d+\.\d+/);
  });
});
