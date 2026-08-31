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
const buildWorkflow = readFileSync(join(rootDir, '.github/workflows/build.yml'), 'utf8');

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

  it('notarizes the app and final DMG through separate fail-closed hooks', () => {
    expect(buildConfig.afterSign).toBe('./scripts/notarize.cjs');
    expect(buildConfig.afterAllArtifactBuild).toBe('./scripts/notarizeArtifacts.cjs');
    expect(existsSync(join(rootDir, 'scripts/notarizeArtifacts.cjs'))).toBe(true);
    expect(macConfig.notarize).toBe(false);
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

  it('uses the exact Windows release artifact template', () => {
    expect(buildConfig.win.artifactName).toBe('${productName}.Setup.${version}.${ext}');
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

describe('release-candidate workflow', () => {
  it('binds Apple signing checks to the reviewed repository policy', () => {
    expect(packageJson.releasePolicy.appleTeamId).toBe('5624SD289G');
    expect(buildWorkflow).toContain("require('./package.json').releasePolicy.appleTeamId");
    expect(buildWorkflow).toContain('test "$APPLE_TEAM_ID" = "$expected_team_id"');
    expect(buildWorkflow).not.toContain(
      'APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}\n        run: >-',
    );
  });

  it('pins release actions to reviewed immutable commits', () => {
    expect(buildWorkflow).toContain(
      'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2',
    );
    expect(buildWorkflow).toContain(
      'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0',
    );
    expect(buildWorkflow).toContain(
      'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4',
    );
    expect(buildWorkflow).toContain(
      'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4',
    );
    expect(buildWorkflow).not.toMatch(/uses:\s+actions\/[\w-]+@v\d+/);
  });

  it('removes checkout credentials before release commands run', () => {
    expect(buildWorkflow.match(/persist-credentials: false/g)).toHaveLength(4);
  });

  it('cannot build or upload release assets from a tag push', () => {
    expect(buildWorkflow).not.toMatch(/push:\s*\n\s*tags:/);
    expect(buildWorkflow).not.toContain("startsWith(github.ref, 'refs/tags/v')");
  });

  it('requires an exact reviewed commit for manual release builds', () => {
    expect(buildWorkflow).toMatch(/release_commit:\s*\n\s*description:/);
    expect(buildWorkflow).toContain('required: true');
    expect(buildWorkflow).toContain('ref: ${{ inputs.release_commit }}');
    expect(buildWorkflow).toContain('git rev-parse HEAD');
    expect(buildWorkflow).toContain('test "$DISPATCH_REF" = "refs/heads/master"');
    expect(buildWorkflow).toContain('test "$DISPATCH_COMMIT" = "$REQUESTED_COMMIT"');
  });

  it('protects signing credentials and uses repository policy for final verification', () => {
    expect(buildWorkflow).toContain('environment: release-signing');
    const verificationStep = buildWorkflow.slice(
      buildWorkflow.indexOf('- name: Verify signed and notarized macOS package'),
      buildWorkflow.indexOf('- name: Upload exact macOS artifacts'),
    );
    expect(verificationStep).not.toContain('secrets.APPLE_TEAM_ID');
    expect(verificationStep).toContain('node scripts/verify-macos-release.cjs');
  });

  it('limits temporary signing credentials to the package build', () => {
    const importStart = buildWorkflow.indexOf('- name: Import release signing credentials');
    const buildStart = buildWorkflow.indexOf('- name: Build signed and notarized macOS package');
    const cleanupStart = buildWorkflow.indexOf('- name: Remove temporary signing credentials');
    const resolverStart = buildWorkflow.indexOf('- name: Resolve exact macOS artifacts');
    const importStep = buildWorkflow.slice(importStart, buildStart);
    const cleanupStep = buildWorkflow.slice(cleanupStart, resolverStart);

    expect(importStart).toBeGreaterThan(-1);
    expect(importStart).toBeLessThan(buildStart);
    expect(buildStart).toBeLessThan(cleanupStart);
    expect(cleanupStart).toBeLessThan(resolverStart);
    expect(importStep).toContain('umask 077');
    expect(importStep).toContain('security list-keychains -d user -s "$keychain_path"');
    expect(importStep).toContain('audiobash-original-keychains.txt');
    expect(importStep).toContain('test "${#existing_keychains[@]}" -gt 0');
    expect(importStep.indexOf('security list-keychains -d user -s "$keychain_path"')).toBeLessThan(
      importStep.indexOf('security import "$certificate_path"'),
    );
    expect(importStep).toContain('> /dev/null');
    expect(importStep).toContain('Developer ID signing identity verified.');
    expect(importStep).not.toContain('AUDIOBASH_RELEASE_KEYCHAIN');
    expect(cleanupStep).toContain('if: always()');
    expect(cleanupStep).toContain('security delete-keychain');
    expect(cleanupStep).not.toContain('2>/dev/null');
    expect(cleanupStep).toContain('|| cleanup_status=$?');
    expect(cleanupStep).toContain('exit "$cleanup_status"');
    expect(cleanupStep).toContain('if test -s "$original_keychains_path"');
    expect(cleanupStep).toContain('security list-keychains -d user -s "${original_keychains[@]}"');
    expect(cleanupStep).toContain('audiobash-original-keychains.txt');
    expect(
      cleanupStep.indexOf('security list-keychains -d user -s "${original_keychains[@]}"'),
    ).toBeLessThan(cleanupStep.indexOf('security delete-keychain'));
    expect(cleanupStep).toContain('audiobash-release.p12');
    expect(cleanupStep).toContain('AuthKey_AudioBash.p8');
    expect(cleanupStep).toContain('if ! rm -f');
  });

  it('builds one named macOS architecture artifact per matrix job', () => {
    expect(buildWorkflow).toContain('architecture: [arm64, x64]');
    expect(buildWorkflow).toContain('name: macos-${{ matrix.architecture }}');
  });

  it('does not mask artifact resolver failures inside output commands', () => {
    const macResolver = buildWorkflow.slice(
      buildWorkflow.indexOf('- name: Resolve exact macOS artifacts'),
      buildWorkflow.indexOf('- name: Verify signed and notarized macOS package'),
    );
    const linuxResolver = buildWorkflow.slice(
      buildWorkflow.indexOf('- name: Resolve exact Linux artifacts'),
      buildWorkflow.indexOf('- name: Hash exact Linux artifacts'),
    );
    const windowsResolver = buildWorkflow.slice(
      buildWorkflow.indexOf('- name: Resolve and hash exact Windows artifact'),
      buildWorkflow.indexOf('- name: Upload exact Windows artifact'),
    );

    expect(macResolver).toContain('set -euo pipefail');
    expect(macResolver).toContain('dmg="$(node scripts/releaseArtifacts.cjs');
    expect(macResolver).toContain('zip="$(node scripts/releaseArtifacts.cjs');
    expect(macResolver).not.toContain('echo "dmg=$(node');
    expect(linuxResolver).toContain('set -euo pipefail');
    expect(linuxResolver).toContain('appimage="$(node scripts/releaseArtifacts.cjs');
    expect(linuxResolver).toContain('deb="$(node scripts/releaseArtifacts.cjs');
    expect(linuxResolver).not.toContain('echo "appimage=$(node');
    expect(windowsResolver).toContain('if ($LASTEXITCODE -ne 0)');
  });

  it('preserves workflow provenance in the candidate manifest', () => {
    const candidateVerification = buildWorkflow.slice(
      buildWorkflow.indexOf('- name: Verify exact release candidate set'),
      buildWorkflow.indexOf('- name: Upload release candidate manifest'),
    );
    expect(candidateVerification).toContain('WORKFLOW_REPOSITORY: ${{ github.repository }}');
    expect(candidateVerification).toContain('WORKFLOW_RUN_ATTEMPT: ${{ github.run_attempt }}');
    expect(candidateVerification).toContain('WORKFLOW_RUN_ID: ${{ github.run_id }}');
    expect(candidateVerification).toContain(
      'artifacts "$RELEASE_COMMIT" "$WORKFLOW_REPOSITORY" "$WORKFLOW_RUN_ID" "$WORKFLOW_RUN_ATTEMPT"',
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

  it('disables platform publishing without npm argument forwarding', () => {
    const windowsBuildStep = buildWorkflow.slice(
      buildWorkflow.indexOf('- name: Build Windows package'),
      buildWorkflow.indexOf('- name: Smoke-test packaged Windows process owner'),
    );
    const linuxBuildStep = buildWorkflow.slice(
      buildWorkflow.indexOf('- name: Build Linux packages'),
      buildWorkflow.indexOf('- name: Resolve exact Linux artifacts'),
    );

    expect(scripts['electron:build:win']).toContain('--publish never');
    expect(windowsBuildStep).toContain('run: npm run electron:build:win');
    expect(windowsBuildStep).not.toContain('-- --publish');
    expect(scripts['electron:build:linux']).toContain('--publish never');
    expect(linuxBuildStep).toContain('run: npm run electron:build:linux');
    expect(linuxBuildStep).not.toContain('-- --publish');

    for (const [name, script] of Object.entries<string>(scripts)) {
      if (script.includes('electron-builder')) {
        expect(script, `${name} must disable electron-builder publishing`).toContain(
          '--publish never',
        );
      }
    }
  });

  it('has architecture-specific macOS build scripts', () => {
    expect(scripts['electron:build:mac:arm64']).toContain('--arm64');
    expect(scripts['electron:build:mac:arm64']).not.toContain('--x64');
    expect(scripts['electron:build:mac:arm64']).toContain('--publish never');
    expect(scripts['electron:build:mac:x64']).toContain('--x64');
    expect(scripts['electron:build:mac:x64']).not.toContain('--arm64');
    expect(scripts['electron:build:mac:x64']).toContain('--publish never');
    expect(scripts['electron:build:mac:release:arm64']).toContain('--config.forceCodeSigning=true');
    expect(scripts['electron:build:mac:release:x64']).toContain('--config.forceCodeSigning=true');
  });

  it('separates explicit development and release macOS trust modes', () => {
    for (const architecture of ['arm64', 'x64']) {
      const development = scripts[`electron:build:mac:${architecture}`];
      const release = scripts[`electron:build:mac:release:${architecture}`];

      expect(development).toContain('AUDIOBASH_BUILD_MODE=development');
      expect(development).toContain('SKIP_NOTARIZE=true');
      expect(development).toContain('--config.mac.identity=-');
      expect(release).toContain('AUDIOBASH_BUILD_MODE=release');
      expect(release).toContain('--config.forceCodeSigning=true');
      expect(release).not.toContain('SKIP_NOTARIZE');
      expect(release).not.toContain('identity=-');
    }
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
