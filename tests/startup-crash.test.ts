/**
 * Tests for startup crash prevention (GitHub issue #29)
 *
 * Verifies that the main process has proper error handling in its
 * startup path to prevent silent crashes from unhandled exceptions.
 *
 * Root cause: app.whenReady() handler had no try-catch, so any thrown
 * exception became an unhandled promise rejection -> exit(1) -> the
 * user sees "crashes immediately" with exit code 256 in launchd logs.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const rootDir = join(__dirname, '..');
const mainProcessCode = readFileSync(join(rootDir, 'electron', 'main.cjs'), 'utf8');

describe('startup crash prevention (#29)', () => {
  describe('global error handlers', () => {
    it('has unhandledRejection handler to catch async errors', () => {
      expect(mainProcessCode).toContain("process.on('unhandledRejection'");
    });

    it('has uncaughtException handler to catch sync errors', () => {
      expect(mainProcessCode).toContain("process.on('uncaughtException'");
    });
  });

  describe('whenReady error handling', () => {
    it('wraps startup in try-catch inside whenReady handler', () => {
      // The whenReady handler should have a try-catch to prevent
      // unhandled promise rejections from crashing the process
      const whenReadyMatch = mainProcessCode.match(
        /app\.whenReady\(\)\.then\(async\s*\(\)\s*=>\s*\{/,
      );
      expect(whenReadyMatch).toBeTruthy();

      // Find the code after whenReady and verify it has a try block
      const afterWhenReady = mainProcessCode.slice(
        mainProcessCode.indexOf('app.whenReady().then(async () => {'),
      );
      // The try should appear near the start of the handler (within first 200 chars)
      const tryIndex = afterWhenReady.indexOf('try {');
      expect(tryIndex).toBeGreaterThan(0);
      expect(tryIndex).toBeLessThan(200);
    });
  });

  describe('tray creation safety', () => {
    it('guards tray creation against empty icon on macOS', () => {
      // Creating a Tray with an empty NativeImage can throw on macOS.
      // The code should skip tray creation or provide a fallback.
      const hasTrayGuard =
        mainProcessCode.includes('icon.isEmpty()') &&
        (mainProcessCode.includes('skip') ||
          mainProcessCode.includes('without tray') ||
          mainProcessCode.includes('tray creation') ||
          mainProcessCode.includes('Cannot create tray'));
      expect(hasTrayGuard).toBe(true);
    });
  });

  describe('spawnShell error resilience', () => {
    it('wraps node-pty require in try-catch', () => {
      // node-pty loading should not crash the app
      expect(mainProcessCode).toContain("pty = require('node-pty')");
      // The require should be inside a try block
      const ptyRequireIndex = mainProcessCode.indexOf("pty = require('node-pty')");
      const precedingCode = mainProcessCode.slice(
        Math.max(0, ptyRequireIndex - 100),
        ptyRequireIndex,
      );
      expect(precedingCode).toContain('try');
    });
  });
});

describe('afterPack code signing (#29)', () => {
  const afterPackCode = readFileSync(join(rootDir, 'scripts', 'afterPack.cjs'), 'utf8');

  it('re-signs binaries after chmod to preserve ARM64 code signature', () => {
    // chmod invalidates ad-hoc code signatures on macOS ARM64.
    // The afterPack script must re-sign after fixing permissions.
    expect(afterPackCode).toContain('codesign');
    expect(afterPackCode).toContain('--force');
    expect(afterPackCode).toContain('--sign');
  });

  it('signs both spawn-helper and pty.node', () => {
    expect(afterPackCode).toContain('spawn-helper');
    expect(afterPackCode).toContain('pty.node');
  });

  it('handles both arm64 and x64 architectures', () => {
    expect(afterPackCode).toContain('darwin-arm64');
    expect(afterPackCode).toContain('darwin-x64');
  });

  it('uses execFileSync for shell injection safety', () => {
    // execFileSync prevents shell injection, unlike the shell-based alternative
    expect(afterPackCode).toContain('execFileSync');
  });
});
