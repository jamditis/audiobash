import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');
const { createReleaseArtifactManifest, resolveReleaseArtifacts } =
  require('../../scripts/releaseArtifacts.cjs') as {
    createReleaseArtifactManifest: (
      metadata: typeof packageJson,
      outputDirectory?: string,
    ) => Array<{ fileName: string; relativePath: string }>;
    resolveReleaseArtifacts: (metadata: typeof packageJson) => {
      mac: Record<'arm64' | 'x64', { dmg: string; zip: string }>;
      windows: { nsis: string };
      linux: { AppImage: string; deb: string };
      all: string[];
    };
  };

describe('release artifact names', () => {
  it('resolves every package name from package metadata and templates', () => {
    expect(packageJson.version).toBe('3.4.0');
    const artifacts = resolveReleaseArtifacts(packageJson);

    expect(artifacts.mac.arm64).toEqual({
      dmg: 'AudioBash-3.4.0-arm64.dmg',
      zip: 'AudioBash-3.4.0-arm64.zip',
    });
    expect(artifacts.mac.x64).toEqual({
      dmg: 'AudioBash-3.4.0-x64.dmg',
      zip: 'AudioBash-3.4.0-x64.zip',
    });
    expect(artifacts.windows.nsis).toBe('AudioBash.Setup.3.4.0.exe');
    expect(artifacts.linux).toEqual({
      AppImage: 'AudioBash-3.4.0.AppImage',
      deb: 'AudioBash-3.4.0.deb',
    });
    expect(artifacts.all).toEqual([
      'AudioBash-3.4.0-arm64.dmg',
      'AudioBash-3.4.0-arm64.zip',
      'AudioBash-3.4.0-x64.dmg',
      'AudioBash-3.4.0-x64.zip',
      'AudioBash.Setup.3.4.0.exe',
      'AudioBash-3.4.0.AppImage',
      'AudioBash-3.4.0.deb',
    ]);
  });

  it('rejects a template with unresolved fields', () => {
    const metadata = structuredClone(packageJson);
    metadata.build.mac.artifactName = '${productName}-${version}-${missing}.${ext}';

    expect(() => resolveReleaseArtifacts(metadata)).toThrow('Unresolved artifact template field');
  });

  it.each([
    '../escape.${ext}',
    '..',
    'nested\\artifact.${ext}',
    'bad\nname.${ext}',
    'bad\tname.${ext}',
    'bad:name.${ext}',
    'trailing.',
    'trailing ',
    'CON.exe',
    'glob[1].${ext}',
  ])('rejects unsafe artifact template %s', (template) => {
    const metadata = structuredClone(packageJson);
    metadata.build.mac.artifactName = template;

    expect(() => resolveReleaseArtifacts(metadata)).toThrow(/unsafe filename/);
  });

  it('rejects a malformed macro', () => {
    const metadata = structuredClone(packageJson);
    metadata.build.mac.artifactName = '${productName-${version}.${ext}';

    expect(() => resolveReleaseArtifacts(metadata)).toThrow(/Unresolved artifact template field/);
  });

  it.each([
    '/tmp/release',
    '../release',
    'release\\nested',
    '.',
    'release/bad\tsegment',
    'release/bad:segment',
    'release/trailing.',
    'release/NUL',
  ])('rejects unsafe output directory %s', (outputDirectory) => {
    expect(() => createReleaseArtifactManifest(packageJson, outputDirectory)).toThrow(
      /unsafe output directory/,
    );
  });

  it('uses a safe configured output directory in forward-slash relative paths', () => {
    const manifest = createReleaseArtifactManifest(packageJson, 'candidate/release');

    expect(manifest.every((record) => record.relativePath.startsWith('candidate/release/'))).toBe(
      true,
    );
  });

  it('rejects duplicate resolved filenames', () => {
    const metadata = structuredClone(packageJson);
    metadata.build.mac.artifactName = '${productName}-${version}.bin';

    expect(() => resolveReleaseArtifacts(metadata)).toThrow(/duplicate filenames/);
  });
});
