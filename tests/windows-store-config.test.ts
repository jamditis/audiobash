import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const rootDir = join(__dirname, '..');
const requireModule = createRequire(import.meta.url);
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const configPath = join(rootDir, 'build', 'electron-builder.microsoft-store.cjs');
const contractPath = join(rootDir, 'build', 'microsoft-store-contract.cjs');
const storeEnvironmentKeys = [
  'AUDIOBASH_STORE_MODE',
  'AUDIOBASH_STORE_IDENTITY_NAME',
  'AUDIOBASH_STORE_PUBLISHER',
  'AUDIOBASH_STORE_PUBLISHER_DISPLAY_NAME',
];

function loadConfig(environment: Record<string, string> = {}) {
  const originalEnvironment = Object.fromEntries(
    storeEnvironmentKeys.map((key) => [key, process.env[key]]),
  );
  for (const key of storeEnvironmentKeys) delete process.env[key];
  Object.assign(process.env, environment);

  try {
    delete requireModule.cache[requireModule.resolve(configPath)];
    return requireModule(configPath);
  } finally {
    for (const key of storeEnvironmentKeys) {
      const value = originalEnvironment[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

afterEach(() => {
  delete requireModule.cache[requireModule.resolve(configPath)];
});

describe('Microsoft Store build configuration', () => {
  it('keeps the direct Windows package contract unchanged', () => {
    expect(packageJson.build.win.target).toBe('nsis');
    expect(packageJson.build.win.artifactName).toBe('${productName}.Setup.${version}.${ext}');
    expect(packageJson.build.nsis.oneClick).toBe(false);
    expect(packageJson.build.directories.output).toBe('release');
  });

  it('uses an isolated x64 full-trust AppX test package', () => {
    const config = loadConfig({ AUDIOBASH_STORE_MODE: 'test' });

    expect(config.directories.output).toBe('release/microsoft-store-test');
    expect(config.win.target).toEqual([{ target: 'appx', arch: ['x64'] }]);
    expect(config.win.artifactName).toBe('AudioBash-${version}-store-test-${arch}.${ext}');
    expect(config.appx).toMatchObject({
      applicationId: 'AudioBash',
      identityName: 'AudioBash.Store.Test',
      publisher: 'CN=AudioBash Store Test',
      publisherDisplayName: 'AudioBash Store Test',
      languages: ['en-US'],
      minVersion: '10.0.17763.0',
      setBuildNumber: false,
      electronUpdaterAware: false,
    });
    expect(config.appx.capabilities).toEqual(['runFullTrust', 'microphone']);
    expect(config.appx.capabilities).not.toEqual(
      expect.arrayContaining(['allowElevation', 'broadFileSystemAccess', 'unvirtualizedResources']),
    );
    expect(config.afterSign).toBeUndefined();
    expect(config.afterAllArtifactBuild).toBeUndefined();
    expect(config.win.files).toEqual(
      expect.arrayContaining([
        '!node_modules/node-pty/prebuilds/!(win32-x64){,/**/*}',
        '!node_modules/node-pty/third_party/conpty/*/!(win10-x64){,/**/*}',
        '!node_modules/node-pty/{deps,scripts,src}{,/**/*}',
        '!node_modules/node-pty/**/*.test.{js,ts}',
        '!node_modules/node-pty/**/*.{map,pdb}',
      ]),
    );
  });

  it('maps the public version to the required four-part package version', () => {
    const { createStoreContract } = requireModule(contractPath);
    const contract = createStoreContract({ AUDIOBASH_STORE_MODE: 'test' });
    expect(contract.packageVersion).toBe(`${packageJson.version}.0`);
  });

  it('requires every Partner Center identity value in production mode', () => {
    expect(() => loadConfig({ AUDIOBASH_STORE_MODE: 'production' })).toThrow(
      /AUDIOBASH_STORE_IDENTITY_NAME/,
    );
  });

  it('uses the exact production identity and a production-only artifact name', () => {
    const config = loadConfig({
      AUDIOBASH_STORE_MODE: 'production',
      AUDIOBASH_STORE_IDENTITY_NAME: 'Publisher.AudioBash',
      AUDIOBASH_STORE_PUBLISHER: 'CN=00000000-0000-0000-0000-000000000000',
      AUDIOBASH_STORE_PUBLISHER_DISPLAY_NAME: 'AudioBash',
    });

    expect(config.directories.output).toBe('release/microsoft-store');
    expect(config.win.artifactName).toBe('AudioBash-${version}-store-${arch}.${ext}');
    expect(config.appx.identityName).toBe('Publisher.AudioBash');
    expect(config.appx.publisher).toBe('CN=00000000-0000-0000-0000-000000000000');
    expect(config.appx.publisherDisplayName).toBe('AudioBash');
  });

  it('rejects an unknown package mode', () => {
    expect(() => loadConfig({ AUDIOBASH_STORE_MODE: 'preview' })).toThrow(/AUDIOBASH_STORE_MODE/);
  });
});
