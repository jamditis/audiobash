import { createHash } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');
const { createMacosReleaseVerifier, readMachOFileType } =
  require('../../scripts/verify-macos-release.cjs') as {
    createMacosReleaseVerifier: (dependencies?: {
      spawnSync?: (
        file: string,
        args: string[],
        options?: object,
      ) => {
        error?: Error;
        status: number;
        stderr: string;
        stdout: string;
      };
    }) => (options: {
      architecture: 'arm64' | 'x64';
      expectedHashes?: Record<string, string>;
      metadata: typeof packageJson;
      releaseDir: string;
    }) => {
      artifacts: Array<{ fileName: string; sha256: string }>;
      checksumPath: string;
    };
    readMachOFileType: (filePath: string) => number;
  };

const temporaryDirectories: string[] = [];
const expectedTeamId = packageJson.releasePolicy.appleTeamId;

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function makeThinMachO(fileType: number, endianness: 'big' | 'little' = 'little'): Buffer {
  const bytes = Buffer.alloc(16);
  if (endianness === 'little') {
    bytes.writeUInt32LE(0xfeedfacf, 0);
    bytes.writeUInt32LE(fileType, 12);
  } else {
    bytes.writeUInt32BE(0xfeedfacf, 0);
    bytes.writeUInt32BE(fileType, 12);
  }
  return bytes;
}

function makeFixture() {
  const releaseDir = mkdtempSync(join(tmpdir(), 'audiobash-macos-release-'));
  temporaryDirectories.push(releaseDir);
  const appPath = join(releaseDir, 'mac-arm64', 'AudioBash.app');
  const mainExecutable = join(appPath, 'Contents', 'MacOS', 'AudioBash');
  const helperExecutable = join(
    appPath,
    'Contents',
    'Frameworks',
    'AudioBash Helper (GPU).app',
    'Contents',
    'MacOS',
    'AudioBash Helper (GPU)',
  );
  const nestedExecutable = join(
    appPath,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'node_modules',
    'node-pty',
    'prebuilds',
    'darwin-arm64',
    'pty.node',
  );
  mkdirSync(join(appPath, 'Contents', 'MacOS'), { recursive: true });
  mkdirSync(join(helperExecutable, '..'), { recursive: true });
  mkdirSync(join(nestedExecutable, '..'), { recursive: true });
  writeFileSync(mainExecutable, makeThinMachO(2), { mode: 0o755 });
  writeFileSync(helperExecutable, makeThinMachO(2), { mode: 0o755 });
  writeFileSync(nestedExecutable, makeThinMachO(8), { mode: 0o644 });

  const dmgName = `AudioBash-${packageJson.version}-arm64.dmg`;
  const zipName = `AudioBash-${packageJson.version}-arm64.zip`;
  writeFileSync(join(releaseDir, dmgName), 'dmg bytes');
  writeFileSync(join(releaseDir, zipName), 'zip bytes');

  return {
    appPath,
    dmgName,
    helperExecutable,
    mainExecutable,
    nestedExecutable,
    releaseDir,
    zipName,
  };
}

function makeSpawn(
  fixture: ReturnType<typeof makeFixture>,
  override?: (file: string, args: string[]) => string | undefined,
) {
  return vi.fn((file: string, args: string[]) => {
    const overridden = override?.(file, args);
    if (overridden !== undefined) {
      return { status: 0, stderr: '', stdout: overridden };
    }

    if (file === '/usr/bin/lipo') {
      return { status: 0, stderr: '', stdout: 'arm64\n' };
    }
    if (file === '/usr/libexec/PlistBuddy') {
      return { status: 0, stderr: '', stdout: `${packageJson.version}\n` };
    }
    if (file === '/usr/bin/codesign' && args[0] === '--display') {
      return {
        status: 0,
        stderr: [
          `Authority=Developer ID Application: AudioBash Test (${expectedTeamId})`,
          `TeamIdentifier=${expectedTeamId}`,
          'Timestamp=Aug 29, 2026 at 04:00:00',
          'CodeDirectory v=20500 size=1234 flags=0x10000(runtime) hashes=30+5 location=embedded',
        ].join('\n'),
        stdout: '',
      };
    }
    if (file === '/usr/bin/ditto') {
      const extractedApp = join(args.at(-1)!, 'AudioBash.app');
      cpSync(fixture.appPath, extractedApp, { recursive: true });
      return { status: 0, stderr: '', stdout: '' };
    }
    return { status: 0, stderr: '', stdout: '' };
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('macOS release verifier', () => {
  it.each([
    ['little', 2],
    ['big', 8],
  ] as const)('reads a %s-endian thin Mach-O file type', (endianness, fileType) => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-macho-header-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'native-file');
    writeFileSync(filePath, makeThinMachO(fileType, endianness));

    expect(readMachOFileType(filePath)).toBe(fileType);
  });

  it.each([
    ['a truncated thin header', Buffer.from([0xcf, 0xfa, 0xed, 0xfe])],
    ['a fat header', Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0])],
  ])('fails closed for %s', (_label, bytes) => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-macho-header-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'native-file');
    writeFileSync(filePath, bytes);

    expect(() => readMachOFileType(filePath)).toThrow(/Mach-O file type is unavailable/);
  });

  it('verifies exact artifacts, every Mach-O signature, notarization, Gatekeeper, and hashes', () => {
    const fixture = makeFixture();
    const spawnSync = makeSpawn(fixture);
    const verify = createMacosReleaseVerifier({ spawnSync });

    const result = verify({
      architecture: 'arm64',
      metadata: packageJson,
      releaseDir: fixture.releaseDir,
    });

    expect(result.artifacts).toEqual([
      expect.objectContaining({
        fileName: fixture.dmgName,
        sha256: sha256(join(fixture.releaseDir, fixture.dmgName)),
      }),
      expect.objectContaining({
        fileName: fixture.zipName,
        sha256: sha256(join(fixture.releaseDir, fixture.zipName)),
      }),
    ]);
    expect(readFileSync(result.checksumPath, 'utf8')).toContain(fixture.dmgName);
    expect(readFileSync(result.checksumPath, 'utf8')).toContain(fixture.zipName);

    const calls = spawnSync.mock.calls as Array<[string, string[]]>;
    const signatureTargets = calls
      .filter(([file, args]) => file === '/usr/bin/codesign' && args[0] === '--verify')
      .map(([, args]) => args.at(-1));
    expect(signatureTargets).toEqual(
      expect.arrayContaining([
        fixture.mainExecutable,
        fixture.nestedExecutable,
        fixture.appPath,
        expect.stringMatching(/AudioBash\.app\/Contents\/MacOS\/AudioBash$/),
        expect.stringMatching(/AudioBash\.app\/.*\/pty\.node$/),
        expect.stringMatching(/AudioBash\.app$/),
      ]),
    );
    expect(calls.some(([, args]) => args.includes('--deep'))).toBe(false);
    expect(calls.some(([file]) => file === '/usr/bin/otool')).toBe(false);
    const commandCalls = calls.map(([file, args]) => [file, args]);
    expect(commandCalls).toEqual(
      expect.arrayContaining([
        ['/usr/bin/xcrun', ['stapler', 'validate', fixture.appPath]],
        ['/usr/bin/xcrun', ['stapler', 'validate', join(fixture.releaseDir, fixture.dmgName)]],
        ['/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', fixture.appPath]],
        ['/usr/bin/hdiutil', ['verify', join(fixture.releaseDir, fixture.dmgName)]],
      ]),
    );
  });

  it('verifies an Electron helper whose path contains parentheses without calling otool', () => {
    const fixture = makeFixture();
    const spawnSync = makeSpawn(fixture, (file, args) => {
      if (file === '/usr/bin/otool' && args.at(-1)?.includes('(')) {
        throw new Error('otool treated the helper path as archive-member syntax');
      }
      return undefined;
    });
    const verify = createMacosReleaseVerifier({ spawnSync });

    expect(() =>
      verify({
        architecture: 'arm64',
        metadata: packageJson,
        releaseDir: fixture.releaseDir,
      }),
    ).not.toThrow();
    expect(spawnSync).not.toHaveBeenCalledWith(
      '/usr/bin/otool',
      expect.arrayContaining([fixture.helperExecutable]),
      expect.anything(),
    );
  });

  it('rejects a missing exact artifact', () => {
    const fixture = makeFixture();
    rmSync(join(fixture.releaseDir, fixture.dmgName));
    const verify = createMacosReleaseVerifier({ spawnSync: makeSpawn(fixture) });

    expect(() =>
      verify({
        architecture: 'arm64',
        metadata: packageJson,
        releaseDir: fixture.releaseDir,
      }),
    ).toThrow(/Required macOS artifact is missing/);
  });

  it('rejects a zero-byte exact artifact', () => {
    const fixture = makeFixture();
    writeFileSync(join(fixture.releaseDir, fixture.dmgName), '');
    const verify = createMacosReleaseVerifier({ spawnSync: makeSpawn(fixture) });

    expect(() =>
      verify({
        architecture: 'arm64',
        metadata: packageJson,
        releaseDir: fixture.releaseDir,
      }),
    ).toThrow(/Required macOS artifact is empty/);
  });

  it.each(['DMG artifact', 'app bundle'])('rejects a symbolic-link %s', (target) => {
    const fixture = makeFixture();
    const outsideDirectory = mkdtempSync(join(tmpdir(), 'audiobash-macos-release-outside-'));
    temporaryDirectories.push(outsideDirectory);

    if (target === 'DMG artifact') {
      const dmgPath = join(fixture.releaseDir, fixture.dmgName);
      const outsideDmg = join(outsideDirectory, fixture.dmgName);
      writeFileSync(outsideDmg, readFileSync(dmgPath));
      rmSync(dmgPath);
      symlinkSync(outsideDmg, dmgPath);
    } else {
      const outsideApp = join(outsideDirectory, 'AudioBash.app');
      cpSync(fixture.appPath, outsideApp, { recursive: true });
      rmSync(fixture.appPath, { recursive: true });
      symlinkSync(outsideApp, fixture.appPath);
    }

    const verify = createMacosReleaseVerifier({ spawnSync: makeSpawn(fixture) });
    expect(() =>
      verify({
        architecture: 'arm64',
        metadata: packageJson,
        releaseDir: fixture.releaseDir,
      }),
    ).toThrow(/symbolic link|outside/i);
  });

  it.each([
    [
      'wrong team',
      'Authority=Developer ID Application: Test (OTHERTEAM)\nTeamIdentifier=OTHERTEAM\nTimestamp=Aug 29, 2026\nCodeDirectory v=20500 flags=0x10000(runtime)',
    ],
    [
      'ad hoc authority',
      `Signature=adhoc\nTeamIdentifier=${expectedTeamId}\nTimestamp=Aug 29, 2026\nCodeDirectory v=20500 flags=0x10000(runtime)`,
    ],
    [
      'missing timestamp',
      `Authority=Developer ID Application: Test (${expectedTeamId})\nTeamIdentifier=${expectedTeamId}\nCodeDirectory v=20500 flags=0x10000(runtime)`,
    ],
    [
      'disabled timestamp',
      `Authority=Developer ID Application: Test (${expectedTeamId})\nTeamIdentifier=${expectedTeamId}\nTimestamp=none\nCodeDirectory v=20500 flags=0x10000(runtime)`,
    ],
    [
      'missing hardened runtime',
      `Authority=Developer ID Application: Test (${expectedTeamId})\nTeamIdentifier=${expectedTeamId}\nTimestamp=Aug 29, 2026\nCodeDirectory v=20500 flags=0x0(none)`,
    ],
    [
      'team identifier superset',
      `Authority=Developer ID Application: Test (${expectedTeamId}X)\nTeamIdentifier=${expectedTeamId}X\nTimestamp=Aug 29, 2026\nCodeDirectory v=20500 flags=0x10000(runtime)`,
    ],
  ])('rejects %s signature metadata', (_label, signatureOutput) => {
    const fixture = makeFixture();
    const spawnSync = makeSpawn(fixture, (file, args) => {
      if (file === '/usr/bin/codesign' && args[0] === '--display') return signatureOutput;
      return undefined;
    });
    const verify = createMacosReleaseVerifier({ spawnSync });

    expect(() =>
      verify({
        architecture: 'arm64',
        metadata: packageJson,
        releaseDir: fixture.releaseDir,
      }),
    ).toThrow(/Developer ID|team|timestamp|hardened runtime/i);
  });

  it('rejects an extracted zip app that is a symbolic link outside the extraction root', () => {
    const fixture = makeFixture();
    const outsideDirectory = mkdtempSync(join(tmpdir(), 'audiobash-extracted-app-outside-'));
    temporaryDirectories.push(outsideDirectory);
    const outsideApp = join(outsideDirectory, 'AudioBash.app');
    cpSync(fixture.appPath, outsideApp, { recursive: true });
    const spawnSync = makeSpawn(fixture, (file, args) => {
      if (file !== '/usr/bin/ditto') return undefined;
      symlinkSync(outsideApp, join(args.at(-1)!, 'AudioBash.app'));
      return '';
    });

    const verify = createMacosReleaseVerifier({ spawnSync });
    expect(() =>
      verify({
        architecture: 'arm64',
        metadata: packageJson,
        releaseDir: fixture.releaseDir,
      }),
    ).toThrow(/symbolic link|outside/i);
  });

  it('propagates one nested signature failure', () => {
    const fixture = makeFixture();
    const spawnSync = makeSpawn(fixture, (file, args) => {
      if (
        file === '/usr/bin/codesign' &&
        args[0] === '--verify' &&
        basename(args.at(-1)!) === 'pty.node'
      ) {
        throw new Error('invalid nested signature');
      }
      return undefined;
    });
    const verify = createMacosReleaseVerifier({ spawnSync });

    expect(() =>
      verify({
        architecture: 'arm64',
        metadata: packageJson,
        releaseDir: fixture.releaseDir,
      }),
    ).toThrow('invalid nested signature');
  });

  it('rejects the wrong Mach-O architecture', () => {
    const fixture = makeFixture();
    const spawnSync = makeSpawn(fixture, (file) => {
      if (file === '/usr/bin/lipo') return 'x86_64\n';
      return undefined;
    });
    const verify = createMacosReleaseVerifier({ spawnSync });

    expect(() =>
      verify({
        architecture: 'arm64',
        metadata: packageJson,
        releaseDir: fixture.releaseDir,
      }),
    ).toThrow(/architecture/i);
  });

  it('rejects a Mach-O file without executable mode bits', () => {
    const fixture = makeFixture();
    chmodSync(fixture.mainExecutable, 0o644);
    const verify = createMacosReleaseVerifier({ spawnSync: makeSpawn(fixture) });

    expect(() =>
      verify({
        architecture: 'arm64',
        metadata: packageJson,
        releaseDir: fixture.releaseDir,
      }),
    ).toThrow(/has no executable mode bits/);
  });

  it('rejects an embedded app version that differs from package.json', () => {
    const fixture = makeFixture();
    const spawnSync = makeSpawn(fixture, (file) => {
      if (file === '/usr/libexec/PlistBuddy') return '0.0.0\n';
      return undefined;
    });
    const verify = createMacosReleaseVerifier({ spawnSync });

    expect(() =>
      verify({
        architecture: 'arm64',
        metadata: packageJson,
        releaseDir: fixture.releaseDir,
      }),
    ).toThrow(/Embedded macOS version mismatch/);
  });

  it('propagates a missing notarization ticket', () => {
    const fixture = makeFixture();
    const spawnSync = makeSpawn(fixture, (file, args) => {
      if (file === '/usr/bin/xcrun' && args[0] === 'stapler') {
        throw new Error('ticket missing');
      }
      return undefined;
    });
    const verify = createMacosReleaseVerifier({ spawnSync });

    expect(() =>
      verify({
        architecture: 'arm64',
        metadata: packageJson,
        releaseDir: fixture.releaseDir,
      }),
    ).toThrow('ticket missing');
  });

  it('rejects an artifact that changed from an expected SHA-256', () => {
    const fixture = makeFixture();
    const verify = createMacosReleaseVerifier({ spawnSync: makeSpawn(fixture) });
    const expectedHashes = {
      [fixture.dmgName]: '0'.repeat(64),
      [fixture.zipName]: sha256(join(fixture.releaseDir, fixture.zipName)),
    };

    expect(() =>
      verify({
        architecture: 'arm64',
        expectedHashes,
        metadata: packageJson,
        releaseDir: fixture.releaseDir,
      }),
    ).toThrow(/SHA-256 mismatch/);
  });
});
