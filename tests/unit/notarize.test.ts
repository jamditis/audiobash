import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const defaultArtifactsHook = require('../../scripts/notarizeArtifacts.cjs') as (
  context: unknown,
) => Promise<void>;
const {
  buildTargetsMacOs,
  createNotarizeArtifactsHook,
  createNotarizeHook,
  default: defaultNotarizeHook,
} = require('../../scripts/notarize.cjs') as {
  default: (context: unknown) => Promise<void>;
  createNotarizeHook: (dependencies?: {
    env?: Record<string, string | undefined>;
    notarize?: (options: Record<string, string>) => Promise<void>;
    log?: (message: string) => void;
  }) => (context: {
    electronPlatformName: string;
    appOutDir?: string;
    packager?: { appInfo: { productFilename: string } };
  }) => Promise<void>;
  createNotarizeArtifactsHook: (dependencies?: {
    env?: Record<string, string | undefined>;
    notarize?: (options: Record<string, string>) => Promise<void>;
  }) => (context: {
    artifactPaths: string[];
    platformToTargets: Map<{ name: string }, Map<unknown, unknown>>;
  }) => Promise<void>;
  buildTargetsMacOs: (context: unknown) => boolean;
};

const context = {
  electronPlatformName: 'darwin',
  appOutDir: '/tmp/audiobash-release',
  packager: { appInfo: { productFilename: 'AudioBash' } },
};

describe('notarization policy', () => {
  it('exports the configured electron-builder hook', () => {
    expect(defaultNotarizeHook).toBeTypeOf('function');
  });

  it('resolves both electron-builder hooks under require and dynamic import', async () => {
    const requiredApp = require('../../scripts/notarize.cjs');
    const importedApp = await import('../../scripts/notarize.cjs');
    const requiredArtifacts = require('../../scripts/notarizeArtifacts.cjs');
    const importedArtifacts = await import('../../scripts/notarizeArtifacts.cjs');
    const resolveHook = (module: Record<string, unknown>, name: string) =>
      module[name] ?? module.default ?? module;

    expect(resolveHook(requiredApp, 'afterSign')).toBeTypeOf('function');
    expect(resolveHook(importedApp, 'afterSign')).toBeTypeOf('function');
    expect(resolveHook(requiredArtifacts, 'afterAllArtifactBuild')).toBeTypeOf('function');
    expect(resolveHook(importedArtifacts, 'afterAllArtifactBuild')).toBeTypeOf('function');
  });

  it('does nothing outside macOS', async () => {
    const notarize = vi.fn();
    const hook = createNotarizeHook({ env: {}, notarize });

    await expect(hook({ electronPlatformName: 'win32' })).resolves.toBeUndefined();
    expect(notarize).not.toHaveBeenCalled();
  });

  it('allows notarization skip only for an explicit development build', async () => {
    const notarize = vi.fn();
    const hook = createNotarizeHook({
      env: { AUDIOBASH_BUILD_MODE: 'development', SKIP_NOTARIZE: 'true' },
      notarize,
    });

    await expect(hook(context)).resolves.toBeUndefined();
    expect(notarize).not.toHaveBeenCalled();
  });

  it('rejects notarization skip in release mode', async () => {
    const hook = createNotarizeHook({
      env: { AUDIOBASH_BUILD_MODE: 'release', SKIP_NOTARIZE: 'true' },
      notarize: vi.fn(),
    });

    await expect(hook(context)).rejects.toThrow('Release builds cannot skip notarization');
  });

  it('rejects a release without notarization credentials', async () => {
    const hook = createNotarizeHook({
      env: { AUDIOBASH_BUILD_MODE: 'release' },
      notarize: vi.fn(),
    });

    await expect(hook(context)).rejects.toThrow('Release notarization credentials are missing');
  });

  it('uses the approved App Store Connect API key fields', async () => {
    const notarize = vi.fn(async () => undefined);
    const hook = createNotarizeHook({
      env: {
        AUDIOBASH_BUILD_MODE: 'release',
        APPLE_API_KEY: '/tmp/AuthKey.p8',
        APPLE_API_KEY_ID: 'key-id',
        APPLE_API_ISSUER: 'issuer-id',
        APPLE_TEAM_ID: 'team-id',
      },
      notarize,
    });

    await hook(context);

    expect(notarize).toHaveBeenCalledWith({
      appPath: '/tmp/audiobash-release/AudioBash.app',
      appleApiKey: '/tmp/AuthKey.p8',
      appleApiKeyId: 'key-id',
      appleApiIssuer: 'issuer-id',
    });
  });

  it('accepts a stored notarytool keychain profile', async () => {
    const notarize = vi.fn(async () => undefined);
    const hook = createNotarizeHook({
      env: {
        AUDIOBASH_BUILD_MODE: 'release',
        APPLE_KEYCHAIN: '/tmp/release.keychain-db',
        APPLE_KEYCHAIN_PROFILE: 'audiobash-notary',
      },
      notarize,
    });

    await hook(context);

    expect(notarize).toHaveBeenCalledWith({
      appPath: '/tmp/audiobash-release/AudioBash.app',
      keychain: '/tmp/release.keychain-db',
      keychainProfile: 'audiobash-notary',
    });
  });

  it('propagates notarization or stapling failure', async () => {
    const notarize = vi.fn(async () => {
      throw new Error('injected notarization or staple failure');
    });
    const hook = createNotarizeHook({
      env: {
        AUDIOBASH_BUILD_MODE: 'release',
        APPLE_API_KEY: '/tmp/AuthKey.p8',
        APPLE_API_KEY_ID: 'key-id',
        APPLE_API_ISSUER: 'issuer-id',
        APPLE_TEAM_ID: 'team-id',
      },
      notarize,
    });

    await expect(hook(context)).rejects.toThrow('injected notarization or staple failure');
  });
});

describe('DMG notarization policy', () => {
  const releaseEnvironment = {
    AUDIOBASH_BUILD_MODE: 'release',
    APPLE_API_KEY: '/tmp/AuthKey.p8',
    APPLE_API_KEY_ID: 'key-id',
    APPLE_API_ISSUER: 'issuer-id',
    APPLE_TEAM_ID: 'team-id',
  };
  const contextFor = (platformName: string, artifactPaths: string[]) => ({
    artifactPaths,
    platformToTargets: new Map([[{ name: platformName }, new Map()]]),
  });

  it('exports the configured electron-builder artifact hook', async () => {
    await expect(defaultArtifactsHook(contextFor('windows', []))).resolves.toBeUndefined();
  });

  it('rejects an invalid electron-builder target context', () => {
    expect(() => buildTargetsMacOs({})).toThrow(/platform targets are required/);
  });

  it('does nothing for a non-macOS target on a macOS host', async () => {
    const notarize = vi.fn();
    const hook = createNotarizeArtifactsHook({
      env: releaseEnvironment,
      notarize,
    });

    await expect(hook(contextFor('windows', ['/tmp/AudioBash.exe']))).resolves.toBeUndefined();
    expect(notarize).not.toHaveBeenCalled();
  });

  it('allows explicit development mode to skip DMG notarization', async () => {
    const notarize = vi.fn();
    const hook = createNotarizeArtifactsHook({
      env: { AUDIOBASH_BUILD_MODE: 'development', SKIP_NOTARIZE: 'true' },
      notarize,
    });

    await expect(
      hook(contextFor('mac', ['/tmp/AudioBash.dmg', '/tmp/AudioBash.zip'])),
    ).resolves.toBeUndefined();
    expect(notarize).not.toHaveBeenCalled();
  });

  it('rejects DMG notarization skip in release mode', async () => {
    const hook = createNotarizeArtifactsHook({
      env: { ...releaseEnvironment, SKIP_NOTARIZE: 'true' },
      notarize: vi.fn(),
    });

    await expect(hook(contextFor('mac', ['/tmp/AudioBash.dmg']))).rejects.toThrow(
      'Release builds cannot skip notarization',
    );
  });

  it('rejects a release DMG without notarization credentials', async () => {
    const hook = createNotarizeArtifactsHook({
      env: { AUDIOBASH_BUILD_MODE: 'release' },
      notarize: vi.fn(),
    });

    await expect(hook(contextFor('mac', ['/tmp/AudioBash.dmg']))).rejects.toThrow(
      'Release notarization credentials are missing',
    );
  });

  it('requires exactly one DMG in a release build', async () => {
    const hook = createNotarizeArtifactsHook({
      env: releaseEnvironment,
      notarize: vi.fn(),
    });

    await expect(hook(contextFor('mac', ['/tmp/AudioBash.zip']))).rejects.toThrow(
      'Release macOS build must produce exactly one DMG',
    );
  });

  it('submits and staples only the DMG with the approved API key', async () => {
    const notarize = vi.fn(async () => undefined);
    const hook = createNotarizeArtifactsHook({
      env: releaseEnvironment,
      notarize,
    });

    await hook(contextFor('mac', ['/tmp/AudioBash.dmg', '/tmp/AudioBash.zip']));

    expect(notarize).toHaveBeenCalledOnce();
    expect(notarize).toHaveBeenCalledWith({
      appPath: '/tmp/AudioBash.dmg',
      appleApiKey: '/tmp/AuthKey.p8',
      appleApiKeyId: 'key-id',
      appleApiIssuer: 'issuer-id',
    });
  });

  it('propagates a DMG notarization or staple failure', async () => {
    const hook = createNotarizeArtifactsHook({
      env: releaseEnvironment,
      notarize: vi.fn(async () => {
        throw new Error('injected DMG notarization failure');
      }),
    });

    await expect(hook(contextFor('mac', ['/tmp/AudioBash.dmg']))).rejects.toThrow(
      'injected DMG notarization failure',
    );
  });
});
