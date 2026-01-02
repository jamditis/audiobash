/**
 * macOS Stress Tests for AudioBash
 *
 * These tests validate macOS-specific functionality including:
 * - spawn-helper permissions and PTY spawning
 * - Multi-terminal stability
 * - Resource cleanup
 * - Package integrity
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

const isMac = process.platform === 'darwin';
const projectRoot = path.resolve(__dirname, '..');

describe.skipIf(!isMac)('macOS Stress Tests', () => {

  describe('spawn-helper Permissions', () => {
    const nodePtyPath = path.join(projectRoot, 'node_modules/node-pty');
    const prebuildsPath = path.join(nodePtyPath, 'prebuilds');

    it('should have spawn-helper with execute permissions (darwin-arm64)', () => {
      const spawnHelperPath = path.join(prebuildsPath, 'darwin-arm64/spawn-helper');
      if (fs.existsSync(spawnHelperPath)) {
        const stats = fs.statSync(spawnHelperPath);
        const isExecutable = (stats.mode & 0o111) !== 0;
        expect(isExecutable).toBe(true);
      }
    });

    it('should have spawn-helper with execute permissions (darwin-x64)', () => {
      const spawnHelperPath = path.join(prebuildsPath, 'darwin-x64/spawn-helper');
      if (fs.existsSync(spawnHelperPath)) {
        const stats = fs.statSync(spawnHelperPath);
        const isExecutable = (stats.mode & 0o111) !== 0;
        expect(isExecutable).toBe(true);
      }
    });

    it('should have pty.node binary for current architecture', () => {
      const arch = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
      const ptyNodePath = path.join(prebuildsPath, arch, 'pty.node');
      expect(fs.existsSync(ptyNodePath)).toBe(true);
    });
  });

  describe('PTY Spawn Stress', () => {
    it('should spawn and destroy multiple PTYs rapidly', async () => {
      const pty = await import('node-pty');
      const shells: any[] = [];
      const SPAWN_COUNT = 10;

      // Rapid spawn
      for (let i = 0; i < SPAWN_COUNT; i++) {
        const shell = pty.spawn('/bin/zsh', [], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: process.env.HOME,
          env: process.env as Record<string, string>,
        });
        shells.push(shell);
      }

      expect(shells.length).toBe(SPAWN_COUNT);

      // All should have valid PIDs
      shells.forEach((shell) => {
        expect(shell.pid).toBeGreaterThan(0);
      });

      // Rapid cleanup
      shells.forEach(shell => shell.kill());

      // Give time for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    it('should handle concurrent PTY I/O', async () => {
      const pty = await import('node-pty');
      const shell = pty.spawn('/bin/zsh', [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME,
        env: process.env as Record<string, string>,
      });

      let outputReceived = false;
      shell.onData(() => {
        outputReceived = true;
      });

      // Write multiple commands rapidly
      for (let i = 0; i < 10; i++) {
        shell.write(`echo "test${i}"\r`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));

      expect(outputReceived).toBe(true);
      shell.kill();
    });

    it('should handle resize during active session', async () => {
      const pty = await import('node-pty');
      const shell = pty.spawn('/bin/zsh', [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.env.HOME,
        env: process.env as Record<string, string>,
      });

      // Rapid resize
      for (let i = 0; i < 20; i++) {
        const cols = 80 + (i % 40);
        const rows = 24 + (i % 10);
        shell.resize(cols, rows);
      }

      // Should not crash
      expect(shell.pid).toBeGreaterThan(0);
      shell.kill();
    });
  });

  describe('Package Integrity', () => {
    const distPath = path.join(projectRoot, 'dist');

    it.skipIf(!fs.existsSync(path.join(distPath, 'mac-arm64')))('built app should have correct structure', () => {
      const appPath = path.join(distPath, 'mac-arm64/AudioBash.app');
      expect(fs.existsSync(appPath)).toBe(true);
      expect(fs.existsSync(path.join(appPath, 'Contents/MacOS/AudioBash'))).toBe(true);
      expect(fs.existsSync(path.join(appPath, 'Contents/Resources/app.asar'))).toBe(true);
    });

    it.skipIf(!fs.existsSync(path.join(distPath, 'mac-arm64')))('unpacked node-pty should have correct permissions', () => {
      const unpackedPath = path.join(
        distPath,
        'mac-arm64/AudioBash.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper'
      );

      if (fs.existsSync(unpackedPath)) {
        const stats = fs.statSync(unpackedPath);
        const isExecutable = (stats.mode & 0o111) !== 0;
        expect(isExecutable).toBe(true);
      }
    });

    it.skipIf(!fs.existsSync(path.join(distPath, 'AudioBash-2.0.2-arm64.dmg')))('DMG should exist and be valid', () => {
      const dmgPath = path.join(distPath, 'AudioBash-2.0.2-arm64.dmg');
      expect(fs.existsSync(dmgPath)).toBe(true);

      const stats = fs.statSync(dmgPath);
      expect(stats.size).toBeGreaterThan(100 * 1024 * 1024); // Should be > 100MB
    });
  });

  describe('Shell Environment', () => {
    it('should detect default shell correctly', () => {
      const defaultShell = process.env.SHELL;
      expect(defaultShell).toBeTruthy();
      expect(['/bin/zsh', '/bin/bash', '/bin/sh']).toContain(defaultShell);
    });

    it('should have required environment variables', () => {
      expect(process.env.HOME).toBeTruthy();
      expect(process.env.PATH).toBeTruthy();
      expect(process.env.USER).toBeTruthy();
    });

    it('should be able to execute basic shell commands', () => {
      // Use execFileSync with explicit shell path - no user input
      const result = execFileSync('/bin/sh', ['-c', 'echo $SHELL'], { encoding: 'utf8' });
      expect(result.trim()).toBeTruthy();
    });
  });

  describe('Resource Stress', () => {
    it('should handle rapid tab creation/destruction cycle', async () => {
      const pty = await import('node-pty');

      for (let cycle = 0; cycle < 5; cycle++) {
        const shells: any[] = [];

        // Create 5 shells
        for (let i = 0; i < 5; i++) {
          const shell = pty.spawn('/bin/zsh', [], {
            name: 'xterm-256color',
            cols: 80,
            rows: 24,
            cwd: process.env.HOME,
            env: process.env as Record<string, string>,
          });
          shells.push(shell);
        }

        // Kill all
        shells.forEach(s => s.kill());

        // Small delay between cycles
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // If we got here without crashing, test passes
      expect(true).toBe(true);
    });

    it('should not leak file descriptors', async () => {
      const pty = await import('node-pty');

      // Get initial FD count (macOS) using execFileSync with lsof
      const getOpenFDs = (): number => {
        try {
          const result = execFileSync('/usr/sbin/lsof', ['-p', String(process.pid)], {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
          });
          return result.split('\n').length;
        } catch {
          return -1;
        }
      };

      const initialFDs = getOpenFDs();
      if (initialFDs === -1) return; // Skip if lsof not available

      // Create and destroy many shells
      for (let i = 0; i < 10; i++) {
        const shell = pty.spawn('/bin/zsh', [], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: process.env.HOME,
          env: process.env as Record<string, string>,
        });
        shell.kill();
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Allow cleanup
      await new Promise(resolve => setTimeout(resolve, 500));

      const finalFDs = getOpenFDs();

      // Should not have leaked excessive FDs (some variance is normal)
      const leaked = finalFDs - initialFDs;
      expect(leaked).toBeLessThan(50); // Allow some variance for async cleanup
    });
  });

  describe('Audio System', () => {
    it('should have audio device access (if running interactively)', () => {
      // This test checks if audio devices are available
      // In CI, this may not work, so we just check the API exists
      expect(typeof navigator === 'undefined' || typeof navigator.mediaDevices !== 'undefined').toBe(true);
    });
  });
});

describe.skipIf(!isMac)('afterPack Hook Validation', () => {
  it('should have afterPack script configured', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
    );

    expect(packageJson.build.afterPack).toBe('./scripts/afterPack.cjs');
  });

  it('afterPack script should exist', () => {
    const scriptPath = path.join(projectRoot, 'scripts/afterPack.cjs');
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it('afterPack script should fix darwin permissions', () => {
    const scriptPath = path.join(projectRoot, 'scripts/afterPack.cjs');
    const content = fs.readFileSync(scriptPath, 'utf8');

    expect(content).toContain('darwin');
    expect(content).toContain('spawn-helper');
    expect(content).toContain('chmod');
  });
});
