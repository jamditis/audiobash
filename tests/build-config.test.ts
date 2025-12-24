/**
 * Tests for electron-builder configuration and cross-platform compatibility
 * These tests verify the build will work correctly on macOS
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const rootDir = join(__dirname, '..');
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const buildConfig = packageJson.build;

describe('electron-builder configuration', () => {
  it('has valid appId format', () => {
    expect(buildConfig.appId).toMatch(/^[a-z]+\.[a-z]+\.[a-z]+$/i);
    expect(buildConfig.appId).toBe('com.audiobash.app');
  });

  it('has productName defined', () => {
    expect(buildConfig.productName).toBe('AudioBash');
  });

  it('has npmRebuild enabled for native modules', () => {
    // Critical for node-pty to compile on target platform
    expect(buildConfig.npmRebuild).toBe(true);
  });

  it('includes required files in build', () => {
    expect(buildConfig.files).toContain('dist/**/*');
    expect(buildConfig.files).toContain('electron/**/*');
  });
});

describe('macOS build configuration', () => {
  const macConfig = buildConfig.mac;

  it('has mac configuration defined', () => {
    expect(macConfig).toBeDefined();
  });

  it('targets both architectures (arm64 and x64)', () => {
    const dmgTarget = macConfig.target.find((t: any) => t.target === 'dmg');
    const zipTarget = macConfig.target.find((t: any) => t.target === 'zip');

    expect(dmgTarget).toBeDefined();
    expect(dmgTarget.arch).toContain('arm64');
    expect(dmgTarget.arch).toContain('x64');

    expect(zipTarget).toBeDefined();
    expect(zipTarget.arch).toContain('arm64');
    expect(zipTarget.arch).toContain('x64');
  });

  it('has code signing disabled for unsigned distribution', () => {
    // identity: null skips code signing
    expect(macConfig.identity).toBeNull();
    expect(macConfig.hardenedRuntime).toBe(false);
    expect(macConfig.gatekeeperAssess).toBe(false);
  });

  it('has no entitlements (not needed for unsigned apps)', () => {
    expect(macConfig.entitlements).toBeNull();
    expect(macConfig.entitlementsInherit).toBeNull();
  });

  it('has valid category for Mac App Store', () => {
    expect(macConfig.category).toBe('public.app-category.developer-tools');
  });

  it('references icon file that exists', () => {
    const iconPath = join(rootDir, macConfig.icon);
    expect(existsSync(iconPath)).toBe(true);
  });
});

describe('DMG configuration', () => {
  const dmgConfig = buildConfig.dmg;

  it('has DMG signing disabled', () => {
    expect(dmgConfig.sign).toBe(false);
  });

  it('has proper DMG layout with Applications link', () => {
    const appLink = dmgConfig.contents.find((c: any) => c.type === 'link');
    expect(appLink).toBeDefined();
    expect(appLink.path).toBe('/Applications');
  });
});

describe('Windows build configuration', () => {
  it('has Windows configuration defined', () => {
    expect(buildConfig.win).toBeDefined();
    expect(buildConfig.win.target).toBe('nsis');
  });

  it('has NSIS installer configuration', () => {
    expect(buildConfig.nsis).toBeDefined();
    expect(buildConfig.nsis.oneClick).toBe(false);
    expect(buildConfig.nsis.allowToChangeInstallationDirectory).toBe(true);
  });
});

describe('Linux build configuration', () => {
  it('has Linux configuration defined', () => {
    expect(buildConfig.linux).toBeDefined();
  });

  it('targets AppImage and deb formats', () => {
    expect(buildConfig.linux.target).toContain('AppImage');
    expect(buildConfig.linux.target).toContain('deb');
  });
});

describe('npm scripts', () => {
  const scripts = packageJson.scripts;

  it('has platform-specific build scripts', () => {
    expect(scripts['electron:build']).toBeDefined();
    expect(scripts['electron:build:win']).toBeDefined();
    expect(scripts['electron:build:mac']).toBeDefined();
    expect(scripts['electron:build:linux']).toBeDefined();
  });

  it('has architecture-specific macOS build scripts', () => {
    expect(scripts['electron:build:mac:arm64']).toContain('--arm64');
    expect(scripts['electron:build:mac:x64']).toContain('--x64');
  });

  it('all build scripts include vite build step', () => {
    expect(scripts['electron:build']).toContain('npm run build');
    expect(scripts['electron:build:mac']).toContain('npm run build');
    expect(scripts['electron:build:win']).toContain('npm run build');
  });
});

describe('required assets', () => {
  it('has PNG logo for icon conversion', () => {
    expect(existsSync(join(rootDir, 'audiobash-logo.png'))).toBe(true);
  });

  it('has ICO logo for Windows', () => {
    expect(existsSync(join(rootDir, 'audiobash-logo.ico'))).toBe(true);
  });

  it('has assets directory with audio files', () => {
    expect(existsSync(join(rootDir, 'assets'))).toBe(true);
    expect(existsSync(join(rootDir, 'assets', 'start.mp3'))).toBe(true);
    expect(existsSync(join(rootDir, 'assets', 'stop.mp3'))).toBe(true);
  });
});

describe('dependencies', () => {
  it('has node-pty for terminal emulation', () => {
    expect(packageJson.dependencies['node-pty']).toBeDefined();
  });

  it('has xterm for terminal rendering', () => {
    expect(packageJson.dependencies['@xterm/xterm']).toBeDefined();
    expect(packageJson.dependencies['@xterm/addon-fit']).toBeDefined();
  });

  it('has electron-builder as dev dependency', () => {
    expect(packageJson.devDependencies['electron-builder']).toBeDefined();
  });
});
