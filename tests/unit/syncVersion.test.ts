import { createRequire } from 'node:module';
import * as nodeFileSystem from 'node:fs';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { checkVersion, syncVersion } = require('../../scripts/sync-version.cjs') as {
  checkVersion: (rootDirectory?: string) => {
    errors: string[];
    publicVersion: string;
    version: string;
  };
  syncVersion: (
    rootDirectory?: string,
    options?: { fileSystem?: typeof nodeFileSystem; temporaryId?: string },
  ) => { changedFiles: string[]; publicVersion: string; version: string };
};

const temporaryDirectories: string[] = [];

function writeFixtureFile(root: string, relativePath: string, contents: string): void {
  const filePath = join(root, relativePath);
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, contents);
}

function createFixture(
  options: { lockVersion?: string; packageVersion?: string; publicVersion?: string } = {},
): string {
  const root = mkdtempSync(join(tmpdir(), 'audiobash-version-'));
  temporaryDirectories.push(root);
  const packageVersion = options.packageVersion ?? '3.4.0';
  const lockVersion = options.lockVersion ?? packageVersion;

  writeFixtureFile(
    root,
    'package.json',
    `${JSON.stringify(
      {
        name: 'audiobash',
        version: packageVersion,
        releasePolicy: { publicVersion: options.publicVersion ?? packageVersion },
        build: {
          productName: 'AudioBash',
          directories: { output: 'release' },
          mac: { artifactName: '${productName}-${version}-${arch}.${ext}' },
          win: { artifactName: '${productName}.Setup.${version}.${ext}' },
          linux: { artifactName: '${productName}-${version}.${ext}' },
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFixtureFile(
    root,
    'package-lock.json',
    `${JSON.stringify(
      {
        name: 'audiobash',
        version: lockVersion,
        lockfileVersion: 3,
        packages: { '': { name: 'audiobash', version: lockVersion } },
        dependencies: { historical: { version: '3.3.1' } },
      },
      null,
      2,
    )}\n`,
  );
  writeFixtureFile(
    root,
    'docs/js/version.js',
    `const AUDIOBASH_VERSION = '3.3.1';
const urls = {
    'windows': \`BASE/AudioBash.Setup.3.3.1.exe\`,
    'mac-arm64': \`BASE/AudioBash-3.3.1-arm64.dmg\`,
    'mac-intel': \`BASE/AudioBash-3.3.1.dmg\`,
    'linux-appimage': \`BASE/AudioBash-3.3.1.AppImage\`,
    'linux-deb': \`BASE/AudioBash-3.3.1.deb\`
};
`,
  );
  writeFixtureFile(
    root,
    'docs/index.html',
    '<span data-version="v{version}">v3.3.1</span><span>historical v3.3.1</span>\n',
  );
  writeFixtureFile(
    root,
    'docs/manual.html',
    '<div data-version="AudioBash v{version}">AudioBash v3.3.1</div>\n',
  );
  writeFixtureFile(
    root,
    'docs/releases.html',
    '<article class="release-card latest"><span data-version="v{version}">v3.3.1</span></article><article class="release-card"><span>v3.3.1</span></article>\n',
  );
  writeFixtureFile(
    root,
    'docs/latest.html',
    '<span data-version="Currently at v{version}">Currently at v2.4.0</span><span>v3.3.1</span>\n',
  );
  writeFixtureFile(root, 'dev-docs/releases/v3.4.0.md', '# AudioBash v3.4.0 release evidence\n');

  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release version synchronization', () => {
  it('reports lock-file drift without changing files', () => {
    const root = createFixture({ lockVersion: '3.3.1' });
    const before = readFileSync(join(root, 'package-lock.json'), 'utf8');

    const result = checkVersion(root);

    expect(result.version).toBe('3.4.0');
    expect(result.errors).toContain(
      'package-lock.json version must equal package.json version 3.4.0',
    );
    expect(result.errors).toContain(
      'package-lock.json root package version must equal package.json version 3.4.0',
    );
    expect(readFileSync(join(root, 'package-lock.json'), 'utf8')).toBe(before);
  });

  it('syncs current docs fallbacks and derived download names but preserves history', () => {
    const root = createFixture();

    const result = syncVersion(root);

    expect(result.version).toBe('3.4.0');
    expect(result.publicVersion).toBe('3.4.0');
    expect(result.changedFiles).toEqual([
      'docs/index.html',
      'docs/js/version.js',
      'docs/latest.html',
      'docs/manual.html',
      'docs/releases.html',
    ]);
    expect(readFileSync(join(root, 'docs/index.html'), 'utf8')).toBe(
      '<span data-version="v{version}">v3.4.0</span><span>historical v3.3.1</span>\n',
    );
    expect(readFileSync(join(root, 'docs/releases.html'), 'utf8')).toContain(
      '<article class="release-card"><span>v3.3.1</span></article>',
    );

    const versionJavaScript = readFileSync(join(root, 'docs/js/version.js'), 'utf8');
    expect(versionJavaScript).toContain("const AUDIOBASH_VERSION = '3.4.0';");
    expect(versionJavaScript).toContain('AudioBash.Setup.3.4.0.exe');
    expect(versionJavaScript).toContain('AudioBash-3.4.0-arm64.dmg');
    expect(versionJavaScript).toContain('AudioBash-3.4.0-x64.dmg');
    expect(versionJavaScript).toContain('AudioBash-3.4.0.AppImage');
    expect(versionJavaScript).toContain('AudioBash-3.4.0.deb');
    expect(versionJavaScript).not.toContain('AudioBash-3.4.0.dmg');
    expect(readFileSync(join(root, 'package-lock.json'), 'utf8')).toContain(
      '"historical": {\n      "version": "3.3.1"',
    );
    expect(checkVersion(root).errors).toEqual([]);
    expect(syncVersion(root).changedFiles).toEqual([]);
  });

  it('does not activate package-version downloads before public release approval', () => {
    const root = createFixture({ packageVersion: '3.4.0', publicVersion: '3.3.1' });

    const result = syncVersion(root);
    const versionJavaScript = readFileSync(join(root, 'docs/js/version.js'), 'utf8');

    expect(result.version).toBe('3.4.0');
    expect(result.publicVersion).toBe('3.3.1');
    expect(versionJavaScript).toContain("const AUDIOBASH_VERSION = '3.3.1';");
    expect(versionJavaScript).toContain('AudioBash.Setup.3.3.1.exe');
    expect(versionJavaScript).toContain('AudioBash-3.3.1.dmg');
    expect(versionJavaScript).not.toContain('AudioBash.Setup.3.4.0.exe');
    expect(versionJavaScript).not.toContain('AudioBash-3.4.0-x64.dmg');
    expect(readFileSync(join(root, 'docs/latest.html'), 'utf8')).toContain('Currently at v3.3.1');
    expect(checkVersion(root).errors).toEqual([]);
  });

  it('leaves every original unchanged when a later staged write fails', () => {
    const root = createFixture();
    const trackedFiles = [
      'docs/index.html',
      'docs/js/version.js',
      'docs/latest.html',
      'docs/manual.html',
      'docs/releases.html',
    ];
    const before = Object.fromEntries(
      trackedFiles.map((relativePath) => [
        relativePath,
        readFileSync(join(root, relativePath), 'utf8'),
      ]),
    );
    let stagedWrites = 0;
    const failingFileSystem = {
      ...nodeFileSystem,
      writeFileSync: ((...args: Parameters<typeof nodeFileSystem.writeFileSync>) => {
        stagedWrites += 1;
        if (stagedWrites === 3) {
          nodeFileSystem.writeFileSync(...args);
          throw new Error('injected staged write failure');
        }
        return nodeFileSystem.writeFileSync(...args);
      }) as typeof nodeFileSystem.writeFileSync,
    };

    expect(() =>
      syncVersion(root, { fileSystem: failingFileSystem, temporaryId: 'failure-test' }),
    ).toThrow('injected staged write failure');
    for (const relativePath of trackedFiles) {
      expect(readFileSync(join(root, relativePath), 'utf8')).toBe(before[relativePath]);
      expect(nodeFileSystem.existsSync(`${join(root, relativePath)}.failure-test.tmp`)).toBe(false);
    }
  });

  it('preserves a staging error when temporary cleanup also fails', () => {
    const root = createFixture();
    let stagedWrites = 0;
    const retainedTemporaryPath = `${join(root, 'docs/index.html')}.staging-cleanup.tmp`;
    const stagingCleanupFailureFileSystem = {
      ...nodeFileSystem,
      writeFileSync: ((...args: Parameters<typeof nodeFileSystem.writeFileSync>) => {
        stagedWrites += 1;
        if (stagedWrites === 3) throw new Error('injected staged write failure');
        return nodeFileSystem.writeFileSync(...args);
      }) as typeof nodeFileSystem.writeFileSync,
      rmSync: ((target: nodeFileSystem.PathLike, options?: nodeFileSystem.RmOptions) => {
        if (target.toString() === retainedTemporaryPath) {
          throw new Error('injected staging cleanup failure');
        }
        return nodeFileSystem.rmSync(target, options);
      }) as typeof nodeFileSystem.rmSync,
    };
    let caught: unknown;

    try {
      syncVersion(root, {
        fileSystem: stagingCleanupFailureFileSystem,
        temporaryId: 'staging-cleanup',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).message).toContain('injected staged write failure');
    expect((caught as AggregateError).message).toContain(retainedTemporaryPath);
    expect((caught as AggregateError).errors[0]).toMatchObject({
      message: 'injected staged write failure',
    });
    expect(nodeFileSystem.existsSync(retainedTemporaryPath)).toBe(true);
  });

  it('rolls back earlier replacements when a later rename fails', () => {
    const root = createFixture();
    const trackedFiles = [
      'docs/index.html',
      'docs/js/version.js',
      'docs/latest.html',
      'docs/manual.html',
      'docs/releases.html',
    ];
    const before = Object.fromEntries(
      trackedFiles.map((relativePath) => [
        relativePath,
        readFileSync(join(root, relativePath), 'utf8'),
      ]),
    );
    let renames = 0;
    const failingFileSystem = {
      ...nodeFileSystem,
      renameSync: ((...args: Parameters<typeof nodeFileSystem.renameSync>) => {
        renames += 1;
        if (renames === 4) throw new Error('injected replacement rename failure');
        return nodeFileSystem.renameSync(...args);
      }) as typeof nodeFileSystem.renameSync,
      rmSync: ((target: nodeFileSystem.PathLike, options?: nodeFileSystem.RmOptions) => {
        const targetPath = target.toString();
        if (!targetPath.endsWith('.tmp') && !targetPath.endsWith('.bak')) {
          throw new Error('rollback must not delete an installed file');
        }
        return nodeFileSystem.rmSync(target, options);
      }) as typeof nodeFileSystem.rmSync,
    };

    expect(() =>
      syncVersion(root, { fileSystem: failingFileSystem, temporaryId: 'rename-test' }),
    ).toThrow('injected replacement rename failure');
    for (const relativePath of trackedFiles) {
      expect(readFileSync(join(root, relativePath), 'utf8')).toBe(before[relativePath]);
      expect(nodeFileSystem.existsSync(`${join(root, relativePath)}.rename-test.tmp`)).toBe(false);
      expect(nodeFileSystem.existsSync(`${join(root, relativePath)}.rename-test.bak`)).toBe(false);
    }
  });

  it('rolls back when rename cannot replace an existing file', () => {
    const root = createFixture();
    const trackedFiles = [
      'docs/index.html',
      'docs/js/version.js',
      'docs/latest.html',
      'docs/manual.html',
      'docs/releases.html',
    ];
    const before = Object.fromEntries(
      trackedFiles.map((relativePath) => [
        relativePath,
        readFileSync(join(root, relativePath), 'utf8'),
      ]),
    );
    let renames = 0;
    const windowsStyleFileSystem = {
      ...nodeFileSystem,
      renameSync: ((source: nodeFileSystem.PathLike, destination: nodeFileSystem.PathLike) => {
        renames += 1;
        if (renames === 4) throw new Error('injected replacement rename failure');
        if (nodeFileSystem.existsSync(destination)) {
          throw new Error('simulated Windows rename collision');
        }
        return nodeFileSystem.renameSync(source, destination);
      }) as typeof nodeFileSystem.renameSync,
      rmSync: ((target: nodeFileSystem.PathLike, options?: nodeFileSystem.RmOptions) => {
        const targetPath = target.toString();
        if (!targetPath.endsWith('.tmp') && !targetPath.endsWith('.bak')) {
          throw new Error('rollback must not delete an installed file');
        }
        return nodeFileSystem.rmSync(target, options);
      }) as typeof nodeFileSystem.rmSync,
    };

    expect(() =>
      syncVersion(root, {
        fileSystem: windowsStyleFileSystem,
        temporaryId: 'windows-rename-test',
      }),
    ).toThrow('injected replacement rename failure');
    for (const relativePath of trackedFiles) {
      expect(readFileSync(join(root, relativePath), 'utf8')).toBe(before[relativePath]);
      expect(nodeFileSystem.existsSync(`${join(root, relativePath)}.windows-rename-test.tmp`)).toBe(
        false,
      );
      expect(nodeFileSystem.existsSync(`${join(root, relativePath)}.windows-rename-test.bak`)).toBe(
        false,
      );
    }
  });

  it('reports the recovery path when replacement and backup renames both fail', () => {
    const root = createFixture();
    let renames = 0;
    const doubleFailureFileSystem = {
      ...nodeFileSystem,
      renameSync: ((...args: Parameters<typeof nodeFileSystem.renameSync>) => {
        renames += 1;
        if (renames === 4 || renames === 5) {
          throw new Error(`injected rename failure ${renames}`);
        }
        return nodeFileSystem.renameSync(...args);
      }) as typeof nodeFileSystem.renameSync,
    };
    const affectedPath = join(root, 'docs/js/version.js');
    const backupPath = `${affectedPath}.double-rename-test.bak`;

    expect(() =>
      syncVersion(root, {
        fileSystem: doubleFailureFileSystem,
        temporaryId: 'double-rename-test',
      }),
    ).toThrow(`Version synchronization failed and ${affectedPath} was left missing`);
    expect(nodeFileSystem.existsSync(affectedPath)).toBe(false);
    expect(nodeFileSystem.existsSync(backupPath)).toBe(true);
  });

  it('names the surviving backup when rollback cannot restore or reinstall a file', () => {
    const root = createFixture();
    let renames = 0;
    const rollbackDoubleFailureFileSystem = {
      ...nodeFileSystem,
      renameSync: ((...args: Parameters<typeof nodeFileSystem.renameSync>) => {
        renames += 1;
        if (renames === 4 || renames === 7 || renames === 8) {
          throw new Error(`injected rename failure ${renames}`);
        }
        return nodeFileSystem.renameSync(...args);
      }) as typeof nodeFileSystem.renameSync,
    };
    const affectedPath = join(root, 'docs/index.html');
    const backupPath = `${affectedPath}.rollback-double-failure.bak`;
    let caught: unknown;

    try {
      syncVersion(root, {
        fileSystem: rollbackDoubleFailureFileSystem,
        temporaryId: 'rollback-double-failure',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).message).toContain(
      `${affectedPath} was left missing; restore it from ${backupPath}`,
    );
    expect(nodeFileSystem.existsSync(affectedPath)).toBe(false);
    expect(nodeFileSystem.existsSync(backupPath)).toBe(true);
  });

  it('names the backup when rollback cannot move the replacement aside', () => {
    const root = createFixture();
    let renames = 0;
    const moveAsideFailureFileSystem = {
      ...nodeFileSystem,
      renameSync: ((...args: Parameters<typeof nodeFileSystem.renameSync>) => {
        renames += 1;
        if (renames === 4 || renames === 6) {
          throw new Error(`injected rename failure ${renames}`);
        }
        return nodeFileSystem.renameSync(...args);
      }) as typeof nodeFileSystem.renameSync,
    };
    const affectedPath = join(root, 'docs/index.html');
    const backupPath = `${affectedPath}.move-aside-failure.bak`;
    let caught: unknown;

    try {
      syncVersion(root, {
        fileSystem: moveAsideFailureFileSystem,
        temporaryId: 'move-aside-failure',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).message).toContain(
      `${affectedPath} kept its replacement; the original remains at ${backupPath}`,
    );
    expect(readFileSync(affectedPath, 'utf8')).toContain('v3.4.0');
    expect(nodeFileSystem.existsSync(backupPath)).toBe(true);
  });

  it('reports temporary cleanup failure without misreporting a completed rollback', () => {
    const root = createFixture();
    const trackedFiles = [
      'docs/index.html',
      'docs/js/version.js',
      'docs/latest.html',
      'docs/manual.html',
      'docs/releases.html',
    ];
    const before = Object.fromEntries(
      trackedFiles.map((relativePath) => [
        relativePath,
        readFileSync(join(root, relativePath), 'utf8'),
      ]),
    );
    let renames = 0;
    const temporaryId = 'cleanup-failure';
    const retainedTemporaryPath = `${join(root, 'docs/index.html')}.${temporaryId}.tmp`;
    const cleanupFailureFileSystem = {
      ...nodeFileSystem,
      renameSync: ((...args: Parameters<typeof nodeFileSystem.renameSync>) => {
        renames += 1;
        if (renames === 4) throw new Error('injected replacement rename failure');
        return nodeFileSystem.renameSync(...args);
      }) as typeof nodeFileSystem.renameSync,
      rmSync: ((target: nodeFileSystem.PathLike, options?: nodeFileSystem.RmOptions) => {
        if (target.toString() === retainedTemporaryPath) {
          const error = new Error('injected temporary cleanup failure') as NodeJS.ErrnoException;
          error.code = 'EPERM';
          throw error;
        }
        return nodeFileSystem.rmSync(target, options);
      }) as typeof nodeFileSystem.rmSync,
    };
    let caught: unknown;

    try {
      syncVersion(root, { fileSystem: cleanupFailureFileSystem, temporaryId });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).message).toContain(
      'rollback restored original files, but temporary file cleanup was incomplete',
    );
    expect((caught as AggregateError).message).not.toContain('rollback was incomplete');
    for (const relativePath of trackedFiles) {
      expect(readFileSync(join(root, relativePath), 'utf8')).toBe(before[relativePath]);
    }
    expect(nodeFileSystem.existsSync(retainedTemporaryPath)).toBe(true);
  });

  it('reports incomplete backup cleanup after successful synchronization', () => {
    const root = createFixture();
    const retainedBackupPath = `${join(root, 'docs/index.html')}.backup-cleanup.bak`;
    const backupCleanupFailureFileSystem = {
      ...nodeFileSystem,
      rmSync: ((target: nodeFileSystem.PathLike, options?: nodeFileSystem.RmOptions) => {
        if (target.toString() === retainedBackupPath) {
          throw new Error('injected backup cleanup failure');
        }
        return nodeFileSystem.rmSync(target, options);
      }) as typeof nodeFileSystem.rmSync,
    };
    let caught: unknown;

    try {
      syncVersion(root, {
        fileSystem: backupCleanupFailureFileSystem,
        temporaryId: 'backup-cleanup',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).message).toContain(
      'Version synchronization completed, but backup file cleanup was incomplete',
    );
    expect((caught as AggregateError).message).toContain(retainedBackupPath);
    expect(checkVersion(root).errors).toEqual([]);
    expect(nodeFileSystem.existsSync(retainedBackupPath)).toBe(true);
  });

  it('rejects a public version newer than the build version', () => {
    const root = createFixture({ packageVersion: '3.4.0', publicVersion: '3.5.0' });

    expect(() => checkVersion(root)).toThrow(
      'releasePolicy.publicVersion cannot be newer than package.json version',
    );
  });

  it('rejects a release evidence document for a different version', () => {
    const root = createFixture();
    writeFixtureFile(root, 'dev-docs/releases/v3.4.0.md', '# AudioBash v3.3.1 release evidence\n');

    expect(checkVersion(root).errors).toContain(
      'dev-docs/releases/v3.4.0.md must identify AudioBash v3.4.0 release evidence',
    );
  });

  it('checks the current repository after synchronization', () => {
    expect(checkVersion().errors).toEqual([]);
  });
});
