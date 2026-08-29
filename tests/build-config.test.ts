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
const gitignoreEntries = readFileSync(join(rootDir, '.gitignore'), 'utf8')
  .split(/\r?\n/)
  .map((entry) => entry.trim());

describe('electron-builder configuration', () => {
  it('has valid appId format', () => {
    expect(buildConfig.appId).toMatch(/^[a-z]+\.[a-z]+\.[a-z]+$/i);
    expect(buildConfig.appId).toBe('com.audiobash.app');
  });

  it('has productName defined', () => {
    expect(buildConfig.productName).toBe('AudioBash');
  });

  it('has npmRebuild disabled to use pre-built binaries', () => {
    // Using pre-built binaries avoids node-gyp issues with spaces in paths
    // Native modules like node-pty include pre-built binaries for common platforms
    expect(buildConfig.npmRebuild).toBe(false);
  });

  it('includes required files in build', () => {
    expect(buildConfig.files).toContain('dist/**/*');
    expect(buildConfig.files).toContain('electron/**/*');
    expect(buildConfig.files).toContain('!electron/windowsJobOwner.ps1');
  });

  it('keeps renderer and package output in separate directories', () => {
    expect(buildConfig.directories.output).toBe('release');
    expect(buildConfig.files).toContain('dist/**/*');
  });

  it('ignores package output and local audit evidence', () => {
    expect(gitignoreEntries).toContain('/release/');
    expect(gitignoreEntries).toContain('.audit/');
  });
});

describe('macOS build configuration', () => {
  const macConfig = buildConfig.mac;

  it('has mac configuration defined', () => {
    expect(macConfig).toBeDefined();
  });

  it('leaves architecture selection to the build command', () => {
    const macTargets = macConfig.target.map((target: string | { target: string }) =>
      typeof target === 'string' ? target : target.target,
    );
    const macTargetsWithArch = macConfig.target.filter(
      (target: string | { arch?: string[] }) => typeof target !== 'string' && target.arch,
    );

    expect(macTargets).toEqual(['dmg', 'zip']);
    expect(macTargetsWithArch).toHaveLength(0);
  });

  it('uses explicit architecture-qualified artifact names', () => {
    expect(macConfig.artifactName).toBe('${productName}-${version}-${arch}.${ext}');
  });

  it('has hardened runtime enabled for code signing', () => {
    expect(macConfig.identity).toBeUndefined();
    expect(macConfig.hardenedRuntime).toBe(true);
    expect(macConfig.gatekeeperAssess).toBe(false);
  });

  it('declares macOS 12 as the minimum supported release', () => {
    expect(macConfig.minimumSystemVersion).toBe('12.0');
  });

  it('has entitlements configured for node-pty and microphone', () => {
    expect(macConfig.entitlements).toBe('build/entitlements.mac.plist');
    expect(macConfig.entitlementsInherit).toBe('build/entitlements.mac.inherit.plist');

    // Verify entitlements files exist
    expect(existsSync(join(rootDir, macConfig.entitlements))).toBe(true);
    expect(existsSync(join(rootDir, macConfig.entitlementsInherit))).toBe(true);
  });

  it('has valid category for Mac App Store', () => {
    expect(macConfig.category).toBe('public.app-category.developer-tools');
  });

  it('references icon file that exists', () => {
    const iconPath = join(rootDir, macConfig.icon);
    expect(existsSync(iconPath)).toBe(true);
  });

  it('does not copy duplicate sounds or Windows icons into macOS resources', () => {
    const globalResources = buildConfig.extraResources ?? [];
    const macResources = macConfig.extraResources ?? [];
    const macResourceSources = [...globalResources, ...macResources].map(
      (resource: string | { from: string }) =>
        typeof resource === 'string' ? resource : resource.from,
    );

    expect(macResourceSources).not.toContain('assets');
    expect(macResourceSources).not.toContain('audiobash-logo.ico');
    expect(macResourceSources).toContain('audiobash-logo.png');
  });

  it('keeps the application allowlist when macOS adds package exclusions', () => {
    expect(macConfig.files).toEqual(
      expect.arrayContaining(['dist/**/*', 'electron/**/*', 'node_modules/node-pty/**/*']),
    );
  });

  it('scopes the manual native unpack policy to macOS', () => {
    expect(buildConfig.asar).toBeUndefined();
    expect(buildConfig.asarUnpack).toBeUndefined();
    expect(macConfig.asar).toEqual({ smartUnpack: false });
    expect(macConfig.asarUnpack).toEqual(['node_modules/node-pty/prebuilds/**/*']);
  });

  it('keeps positive application patterns and all macOS package exclusions', () => {
    const macFiles = macConfig.files as string[];
    const positivePatterns = macFiles.filter((pattern) => !pattern.startsWith('!'));

    expect(positivePatterns).toEqual(
      expect.arrayContaining(['dist/**/*', 'electron/**/*', 'node_modules/node-pty/**/*']),
    );
    expect(macFiles).toEqual(
      expect.arrayContaining([
        '!node_modules/node-pty/prebuilds/!(darwin-${arch}){,/**/*}',
        '!node_modules/node-pty/{deps,scripts,src}{,/**/*}',
        '!node_modules/node-pty/**/*.test.{js,ts}',
        '!node_modules/node-pty/**/*.{map,pdb}',
        '!node_modules/node-addon-api{,/**/*}',
        '!node_modules/json-schema-to-ts{,/**/*}',
        '!node_modules/ts-algebra{,/**/*}',
        '!node_modules/@babel/runtime{,/**/*}',
        '!node_modules/@remotion/captions{,/**/*}',
        '!electron/windowsJobOwner.ps1',
      ]),
    );
  });
});

describe('DMG configuration', () => {
  const dmgConfig = buildConfig.dmg;

  it('has DMG signing disabled', () => {
    expect(dmgConfig.sign).toBe(false);
  });

  it('has proper DMG layout with Applications link', () => {
    const appLink = dmgConfig.contents.find(
      (content: { path?: string; type?: string }) => content.type === 'link',
    );
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

  it('scopes the ICO resource copy to Windows', () => {
    const globalResources = buildConfig.extraResources ?? [];
    const windowsResources = buildConfig.win.extraResources ?? [];
    const globalSources = globalResources.map((resource: string | { from: string }) =>
      typeof resource === 'string' ? resource : resource.from,
    );
    const windowsSources = windowsResources.map((resource: string | { from: string }) =>
      typeof resource === 'string' ? resource : resource.from,
    );

    expect(globalSources).not.toContain('audiobash-logo.ico');
    expect(windowsSources).toContain('audiobash-logo.ico');
  });

  it('copies the Windows Job owner as a physical PowerShell file', () => {
    expect(buildConfig.win.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'electron/windowsJobOwner.ps1',
          to: 'windowsJobOwner.ps1',
        }),
      ]),
    );
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

  // Regression guard for the v3.3.0 tag build: electron-builder's .deb (fpm) target fails the whole
  // build with "Please specify author 'email' ... required to set Linux .deb package maintainer"
  // unless package.json author is an object with an email, or build.linux.maintainer is set.
  // author was a bare "Joe Amditis" string, so the deb step failed in CI and blocked the release job.
  it('provides a maintainer email for the deb target', () => {
    const rawTargets = buildConfig.linux.target ?? [];
    const targetNames = (Array.isArray(rawTargets) ? rawTargets : [rawTargets]).map(
      (target: string | { target?: string }) =>
        typeof target === 'string' ? target : target.target,
    );
    if (!targetNames.includes('deb')) return;
    const author = packageJson.author;
    const authorEmail = author && typeof author === 'object' ? author.email : undefined;
    const source = buildConfig.linux.maintainer || authorEmail || '';
    expect(source, 'deb target needs author.email or build.linux.maintainer').toMatch(
      /[^\s@]+@[^\s@]+\.[^\s@]+/,
    );
  });
});

describe('npm scripts', () => {
  const scripts = packageJson.scripts;

  it('pins the local Ruff setup and runs both Python static checks', () => {
    expect(scripts['setup:ruff']).toBe('uv tool run --from ruff==0.15.1 ruff --version');
    expect(scripts['lint:py']).toBe(
      'uv tool run --from ruff==0.15.1 ruff check scripts build && uv tool run --from ruff==0.15.1 ruff format --check scripts build',
    );
  });

  it('prepares native dependencies before each test and Electron entry point', () => {
    expect(scripts['prepare:native']).toBe('node scripts/prepare-native-deps.cjs');
    expect(scripts['prepare:electron']).toBe('node node_modules/electron/install.js');
    expect(scripts.postinstall).toBeUndefined();

    const testHooks = ['pretest', 'pretest:watch', 'pretest:coverage', 'pretest:ui'];
    const electronHooks = [
      'preelectron:dev',
      'preelectron:build',
      'preelectron:build:win',
      'preelectron:build:mac',
      'preelectron:build:mac:arm64',
      'preelectron:build:mac:x64',
      'preelectron:build:linux',
    ];

    for (const hook of testHooks) {
      expect(scripts[hook], `${hook} must prepare native dependencies and Electron`).toBe(
        'npm run prepare:native && npm run prepare:electron',
      );
    }

    for (const hook of electronHooks) {
      expect(scripts[hook], `${hook} must prepare native dependencies and Electron`).toBe(
        'npm run prepare:native && npm run prepare:electron',
      );
    }
  });

  it('has platform-specific build scripts', () => {
    expect(scripts['electron:build']).toBeDefined();
    expect(scripts['electron:build:win']).toBeDefined();
    expect(scripts['electron:build:mac']).toBeDefined();
    expect(scripts['electron:build:linux']).toBeDefined();
  });

  it('has architecture-specific macOS build scripts', () => {
    expect(scripts['electron:build:mac:arm64']).toContain('--arm64');
    expect(scripts['electron:build:mac:arm64']).not.toContain('--x64');
    expect(scripts['electron:build:mac:arm64']).toContain('--publish never');
    expect(scripts['electron:build:mac:x64']).toContain('--x64');
    expect(scripts['electron:build:mac:x64']).not.toContain('--arm64');
    expect(scripts['electron:build:mac:x64']).toContain('--publish never');
  });

  it('builds both macOS architectures in sequence when explicitly requested', () => {
    const combinedScript = scripts['electron:build:mac'];

    expect(combinedScript).toBe(
      'npm --ignore-scripts run electron:build:mac:arm64 && npm --ignore-scripts run electron:build:mac:x64',
    );
  });

  it('has an explicit fail-closed macOS package test command', () => {
    expect(scripts['test:package:mac']).toBe('vitest run --config vitest.package.config.ts');
  });

  it('has an explicit packaged Windows process-owner probe', () => {
    expect(scripts['test:package:win']).toBe('node scripts/verify-windows-package.cjs');
    expect(existsSync(join(rootDir, 'scripts/verify-windows-package.cjs'))).toBe(true);
  });

  it('runs the Vite build before each direct package build', () => {
    expect(scripts['electron:build']).toContain('npm run build');
    expect(scripts['electron:build:win']).toContain('npm run build');
    expect(scripts['electron:build:mac:arm64']).toContain('npm run build');
    expect(scripts['electron:build:mac:x64']).toContain('npm run build');
    expect(scripts['electron:build:linux']).toContain('npm run build');
  });
});

describe('required assets', () => {
  it('has PNG logo for icon conversion', () => {
    expect(existsSync(join(rootDir, 'audiobash-logo.png'))).toBe(true);
  });

  it('has ICO logo for Windows', () => {
    expect(existsSync(join(rootDir, 'audiobash-logo.ico'))).toBe(true);
  });

  it('keeps renderer sounds in the public asset source', () => {
    for (const sound of ['start.mp3', 'stop.mp3', 'success.mp3', 'error.mp3']) {
      expect(existsSync(join(rootDir, 'public', 'assets', sound))).toBe(true);
      expect(existsSync(join(rootDir, 'assets', sound))).toBe(false);
    }
  });

  it('keeps the renderer SVG favicon in the public asset source', () => {
    expect(existsSync(join(rootDir, 'public', 'favicon.svg'))).toBe(true);
  });

  it('does not keep the placeholder root asset icon', () => {
    expect(existsSync(join(rootDir, 'assets', 'icon.png'))).toBe(false);
  });
});

describe('dependencies', () => {
  it('has node-pty for terminal emulation', () => {
    expect(packageJson.dependencies['node-pty']).toBeDefined();
  });

  it('has electron-builder as dev dependency', () => {
    expect(packageJson.devDependencies['electron-builder']).toBeDefined();
  });
});
