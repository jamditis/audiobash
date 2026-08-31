import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const requireModule = createRequire(import.meta.url);
const { assertProductionIdentity, sha256, validateManifest, verifyExtractedPackage } =
  requireModule('../scripts/verify-windows-store-package.cjs');
const temporaryRoots: string[] = [];

const expected = {
  identityName: 'Publisher.AudioBash',
  publisher: 'CN=00000000-0000-0000-0000-000000000000',
  publisherDisplayName: 'AudioBash',
  version: '3.4.0.0',
  architecture: 'x64',
  applicationId: 'AudioBash',
};

function manifest(overrides: Partial<typeof expected> = {}, capabilities = ['runFullTrust']) {
  const values = { ...expected, ...overrides };
  const capabilityXml = capabilities
    .map((capability) =>
      capability === 'microphone'
        ? '<DeviceCapability Name="microphone" />'
        : `<rescap:Capability Name="${capability}" />`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities">
  <Identity Name="${values.identityName}" Publisher="${values.publisher}" Version="${values.version}" ProcessorArchitecture="${values.architecture}" />
  <Properties><PublisherDisplayName>${values.publisherDisplayName}</PublisherDisplayName></Properties>
  <Applications>
    <Application Id="${values.applicationId}" Executable="app\\AudioBash.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements AppListEntry="defaultApp" />
    </Application>
  </Applications>
  <Capabilities>${capabilityXml}<DeviceCapability Name="microphone" /></Capabilities>
</Package>`;
}

function writeFixtureFile(root: string, relativePath: string, contents = 'fixture') {
  const filePath = join(root, ...relativePath.split('/'));
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, contents);
  return filePath;
}

function createPackageFixture() {
  const root = mkdtempSync(join(tmpdir(), 'audiobash-store-package-'));
  temporaryRoots.push(root);
  const packageRoot = join(root, 'package');
  const repositoryRoot = join(root, 'repository');
  const requiredFiles = [
    'app/AudioBash.exe',
    'app/resources/app.asar',
    'app/resources/windowsJobOwner.ps1',
    'app/resources/app.asar.unpacked/node_modules/node-pty/prebuilds/win32-x64/pty.node',
  ];
  writeFixtureFile(packageRoot, 'AppxManifest.xml', manifest());
  for (const relativePath of requiredFiles) writeFixtureFile(packageRoot, relativePath);
  for (const assetName of [
    'StoreLogo.png',
    'Square44x44Logo.png',
    'Square150x150Logo.png',
    'Wide310x150Logo.png',
  ]) {
    writeFixtureFile(packageRoot, `assets/${assetName}`, assetName);
    writeFixtureFile(repositoryRoot, `build/appx/${assetName}`, assetName);
  }
  return { packageRoot, repositoryRoot };
}

afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
});

describe('Microsoft Store manifest verifier', () => {
  it('accepts the exact full-trust production manifest', () => {
    expect(() => validateManifest(manifest(), expected)).not.toThrow();
  });

  it('accepts electron-builder single quotes around the publisher', () => {
    const builderManifest = manifest().replace(
      `Publisher="${expected.publisher}"`,
      `Publisher='${expected.publisher}'`,
    );
    expect(() => validateManifest(builderManifest, expected)).not.toThrow();
  });

  it.each([
    ['identityName', 'publisher.audiobash'],
    ['publisher', 'CN=wrong'],
    ['publisherDisplayName', 'Audio Bash'],
    ['version', '3.4.0'],
    ['architecture', 'arm64'],
    ['applicationId', 'audiobash'],
  ] as const)('rejects a wrong %s', (field, value) => {
    expect(() => validateManifest(manifest({ [field]: value }), expected)).toThrow(field);
  });

  it('rejects a missing full-trust entry point', () => {
    expect(() =>
      validateManifest(
        manifest().replace('Windows.FullTrustApplication', 'AudioBash.App'),
        expected,
      ),
    ).toThrow(/entry point/i);
  });

  it('rejects a missing full-trust capability', () => {
    expect(() => validateManifest(manifest({}, []), expected)).toThrow(/runFullTrust/);
  });

  it('rejects a missing microphone capability', () => {
    const withoutMicrophone = manifest().replace(/<DeviceCapability Name="microphone" \/>/g, '');
    expect(() => validateManifest(withoutMicrophone, expected)).toThrow(/microphone/);
  });

  it('rejects restricted capabilities outside the reviewed set', () => {
    expect(() =>
      validateManifest(manifest({}, ['runFullTrust', 'allowElevation']), expected),
    ).toThrow(/allowElevation/);
  });

  it('rejects any normal capability outside the reviewed set', () => {
    const withInternetClient = manifest().replace(
      '<Capabilities>',
      '<Capabilities><Capability Name="internetClient" />',
    );
    expect(() => validateManifest(withInternetClient, expected)).toThrow(/internetClient/);
  });

  it('rejects a test identity or test artifact as production', () => {
    expect(() =>
      assertProductionIdentity({
        identityName: 'AudioBash.Store.Test',
        publisher: 'CN=AudioBash Store Test',
        artifactName: 'AudioBash-3.4.0-store-test-x64.appx',
      }),
    ).toThrow(/test/i);
  });

  it('accepts the reviewed package file fixture', () => {
    const fixture = createPackageFixture();
    expect(() =>
      verifyExtractedPackage(fixture.packageRoot, expected, fixture.repositoryRoot),
    ).not.toThrow();
  });

  it('rejects a missing required native file', () => {
    const fixture = createPackageFixture();
    unlinkSync(
      join(
        fixture.packageRoot,
        'app/resources/app.asar.unpacked/node_modules/node-pty/prebuilds/win32-x64/pty.node',
      ),
    );
    expect(() =>
      verifyExtractedPackage(fixture.packageRoot, expected, fixture.repositoryRoot),
    ).toThrow(/x64 node-pty binary/);
  });

  it('rejects a packaged asset that differs from reviewed source', () => {
    const fixture = createPackageFixture();
    writeFixtureFile(fixture.packageRoot, 'assets/StoreLogo.png', 'changed');
    expect(() =>
      verifyExtractedPackage(fixture.packageRoot, expected, fixture.repositoryRoot),
    ).toThrow(/StoreLogo\.png/);
  });

  it('rejects a signed package retained for Store upload', () => {
    const fixture = createPackageFixture();
    writeFixtureFile(fixture.packageRoot, 'AppxSignature.p7x', 'signature');
    expect(() =>
      verifyExtractedPackage(fixture.packageRoot, expected, fixture.repositoryRoot),
    ).toThrow(/AppxSignature\.p7x/);
  });

  it('rejects a non-x64 node-pty prebuild directory', () => {
    const fixture = createPackageFixture();
    writeFixtureFile(
      fixture.packageRoot,
      'app/resources/app.asar.unpacked/node_modules/node-pty/prebuilds/win32-arm64/pty.node',
    );
    expect(() =>
      verifyExtractedPackage(fixture.packageRoot, expected, fixture.repositoryRoot),
    ).toThrow(/win32-arm64/);
  });

  it('computes a lowercase SHA-256 digest for the exact artifact bytes', () => {
    const root = mkdtempSync(join(tmpdir(), 'audiobash-store-artifact-'));
    temporaryRoots.push(root);
    const artifact = writeFixtureFile(root, 'AudioBash.appx', 'package');
    expect(sha256(artifact)).toBe(
      'bc4a71180870f7945155fbb02f4b0a2e3faa2a62d6d31b7039013055ed19869a',
    );
  });
});
