'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync: systemSpawnSync } = require('node:child_process');
const { artifactById, loadPackageMetadata } = require('./releaseArtifacts.cjs');

const MACH_O_MAGICS = new Set([
  'cafebabe',
  'cafebabf',
  'cefaedfe',
  'cffaedfe',
  'feedface',
  'feedfacf',
  'bebafeca',
  'bfbafeca',
]);
const THIN_MACH_O_ENDIANNESS = new Map([
  ['cefaedfe', 'little'],
  ['cffaedfe', 'little'],
  ['feedface', 'big'],
  ['feedfacf', 'big'],
]);
const MACH_O_EXECUTE_FILE_TYPE = 2;
const ARCHITECTURES = Object.freeze({ arm64: 'arm64', x64: 'x86_64' });

function createCommandRunner(spawnSync = systemSpawnSync) {
  return function run(file, args) {
    const result = spawnSync(file, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      throw new Error(`${file} exited with status ${result.status}${detail ? `: ${detail}` : ''}`);
    }
    return [result.stdout, result.stderr].filter(Boolean).join('\n');
  };
}

function requirePathWithinRoot(targetPath, rootPath, description, expectedType) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${description} is missing: ${targetPath}`);
  }
  const stats = fs.lstatSync(targetPath);
  if (stats.isSymbolicLink()) {
    throw new Error(`${description} cannot be a symbolic link: ${targetPath}`);
  }
  const relativePath = path.relative(fs.realpathSync(rootPath), fs.realpathSync(targetPath));
  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`${description} is outside the release directory: ${targetPath}`);
  }
  const hasExpectedType = expectedType === 'file' ? stats.isFile() : stats.isDirectory();
  if (!hasExpectedType) throw new Error(`${description} is missing: ${targetPath}`);
  return stats;
}

function requireFile(filePath, description, rootPath) {
  const stats = requirePathWithinRoot(filePath, rootPath, description, 'file');
  if (stats.size === 0) throw new Error(`${description} is empty: ${filePath}`);
}

function requireDirectory(directoryPath, description, rootPath) {
  requirePathWithinRoot(directoryPath, rootPath, description, 'directory');
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    return entry.isFile() ? [entryPath] : [];
  });
}

function isMachO(filePath) {
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const magic = Buffer.alloc(4);
    if (fs.readSync(descriptor, magic, 0, magic.length, 0) !== magic.length) return false;
    return MACH_O_MAGICS.has(magic.toString('hex'));
  } finally {
    fs.closeSync(descriptor);
  }
}

function readMachOFileType(filePath) {
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(16);
    if (fs.readSync(descriptor, header, 0, header.length, 0) !== header.length) {
      throw new Error(`Mach-O file type is unavailable: ${filePath}`);
    }
    const endianness = THIN_MACH_O_ENDIANNESS.get(header.subarray(0, 4).toString('hex'));
    if (!endianness) {
      throw new Error(`Mach-O file type is unavailable for a non-thin binary: ${filePath}`);
    }
    return endianness === 'little' ? header.readUInt32LE(12) : header.readUInt32BE(12);
  } finally {
    fs.closeSync(descriptor);
  }
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertSignatureMetadata(output, expectedTeamId, target) {
  if (!/^Authority=Developer ID Application:/m.test(output)) {
    throw new Error(`Developer ID Application authority is missing: ${target}`);
  }
  const teamId = output.match(/^TeamIdentifier=([A-Z0-9]+)$/m)?.[1];
  if (teamId !== expectedTeamId) {
    throw new Error(`Developer ID team does not match ${expectedTeamId}: ${target}`);
  }
  const timestamp = output.match(/^Timestamp=(.+)$/m)?.[1].trim();
  if (!timestamp || timestamp.toLowerCase() === 'none') {
    throw new Error(`Secure signature timestamp is missing: ${target}`);
  }
  if (!/^CodeDirectory\b.*\bflags=[^\r\n]*\(runtime\)/m.test(output)) {
    throw new Error(`Hardened runtime signature flag is missing: ${target}`);
  }
}

function verifySignedTarget(run, target, expectedTeamId) {
  run('/usr/bin/codesign', ['--verify', '--strict', '--verbose=4', target]);
  const signature = run('/usr/bin/codesign', ['--display', '--verbose=4', target]);
  assertSignatureMetadata(signature, expectedTeamId, target);
}

function verifyMacOsApp({ appPath, architecture, expectedTeamId, expectedVersion, rootPath, run }) {
  requireDirectory(appPath, 'Required macOS app bundle', rootPath);
  const embeddedVersion = run('/usr/libexec/PlistBuddy', [
    '-c',
    'Print :CFBundleShortVersionString',
    path.join(appPath, 'Contents', 'Info.plist'),
  ]).trim();
  if (embeddedVersion !== expectedVersion) {
    throw new Error(
      `Embedded macOS version mismatch for ${appPath}: expected ${expectedVersion}, received ${embeddedVersion}`,
    );
  }
  const expectedArchitecture = ARCHITECTURES[architecture];
  const nativeFiles = listFiles(appPath).filter(isMachO);
  if (nativeFiles.length === 0) {
    throw new Error(`No Mach-O executables were found in ${appPath}`);
  }

  for (const nativeFile of nativeFiles) {
    const architectures = run('/usr/bin/lipo', ['-archs', nativeFile]).trim().split(/\s+/);
    if (architectures.length !== 1 || architectures[0] !== expectedArchitecture) {
      throw new Error(
        `Mach-O architecture mismatch for ${nativeFile}: expected ${expectedArchitecture}, received ${architectures.join(' ')}`,
      );
    }
    const fileType = readMachOFileType(nativeFile);
    if (fileType === MACH_O_EXECUTE_FILE_TYPE && (fs.statSync(nativeFile).mode & 0o111) === 0) {
      throw new Error(`Mach-O executable has no executable mode bits: ${nativeFile}`);
    }
    verifySignedTarget(run, nativeFile, expectedTeamId);
  }

  verifySignedTarget(run, appPath, expectedTeamId);
  run('/usr/bin/xcrun', ['stapler', 'validate', appPath]);
  run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', appPath]);
}

function normalizeExpectedHashes(expectedHashes, artifacts) {
  if (expectedHashes === undefined) return undefined;
  for (const artifact of artifacts) {
    if (!/^[a-f0-9]{64}$/.test(expectedHashes[artifact.fileName] ?? '')) {
      throw new Error(`Expected SHA-256 is missing or invalid for ${artifact.fileName}`);
    }
  }
  return expectedHashes;
}

function createMacosReleaseVerifier({ spawnSync } = {}) {
  const run = createCommandRunner(spawnSync);

  return function verifyMacosRelease({ architecture, expectedHashes, metadata, releaseDir }) {
    if (!Object.hasOwn(ARCHITECTURES, architecture)) {
      throw new Error(`Unsupported macOS release architecture: ${architecture}`);
    }
    const expectedTeamId = metadata.releasePolicy?.appleTeamId;
    if (!/^[A-Z0-9]{10}$/.test(expectedTeamId ?? '')) {
      throw new Error('A reviewed Apple team ID is required in package release policy');
    }
    requireDirectory(releaseDir, 'Required macOS release directory', releaseDir);

    const appDirectory = architecture === 'arm64' ? 'mac-arm64' : 'mac';
    const appPath = path.join(releaseDir, appDirectory, `${metadata.build.productName}.app`);
    const artifacts = ['dmg', 'zip'].map((extension) => {
      const record = artifactById(metadata, `mac-${architecture}-${extension}`);
      const filePath = path.join(releaseDir, record.fileName);
      requireFile(filePath, 'Required macOS artifact', releaseDir);
      return { ...record, filePath, sha256: sha256(filePath) };
    });
    const normalizedHashes = normalizeExpectedHashes(expectedHashes, artifacts);
    for (const artifact of artifacts) {
      if (normalizedHashes && normalizedHashes[artifact.fileName] !== artifact.sha256) {
        throw new Error(
          `SHA-256 mismatch for ${artifact.fileName}: expected ${normalizedHashes[artifact.fileName]}, received ${artifact.sha256}`,
        );
      }
    }

    verifyMacOsApp({
      appPath,
      architecture,
      expectedTeamId,
      expectedVersion: metadata.version,
      rootPath: releaseDir,
      run,
    });
    const dmg = artifacts.find((artifact) => artifact.extension === 'dmg');
    const zip = artifacts.find((artifact) => artifact.extension === 'zip');
    run('/usr/bin/hdiutil', ['verify', dmg.filePath]);
    run('/usr/bin/xcrun', ['stapler', 'validate', dmg.filePath]);

    const extractionDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'audiobash-release-zip-'));
    try {
      run('/usr/bin/ditto', ['-x', '-k', zip.filePath, extractionDirectory]);
      verifyMacOsApp({
        appPath: path.join(extractionDirectory, `${metadata.build.productName}.app`),
        architecture,
        expectedTeamId,
        expectedVersion: metadata.version,
        rootPath: extractionDirectory,
        run,
      });
      if (sha256(zip.filePath) !== zip.sha256) {
        throw new Error(`SHA-256 changed while verifying ${zip.fileName}`);
      }
    } finally {
      fs.rmSync(extractionDirectory, { force: true, recursive: true });
    }

    const checksumPath = path.join(releaseDir, `SHA256-macos-${architecture}.txt`);
    fs.writeFileSync(
      checksumPath,
      `${artifacts.map((artifact) => `${artifact.sha256}  ${artifact.fileName}`).join('\n')}\n`,
      'utf8',
    );
    return {
      artifacts: artifacts.map(({ fileName, filePath, sha256: hash }) => ({
        fileName,
        filePath,
        sha256: hash,
      })),
      checksumPath,
    };
  };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || value === undefined) {
      throw new Error(`Invalid command argument: ${name ?? ''}`);
    }
    options[name.slice(2)] = value;
  }
  return options;
}

function parseChecksumFile(filePath) {
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const match = line.match(/^([a-f0-9]{64}) {2}(.+)$/);
        if (!match) throw new Error(`Invalid SHA-256 line: ${line}`);
        return [match[2], match[1]];
      }),
  );
}

if (require.main === module) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const metadata = loadPackageMetadata();
    createMacosReleaseVerifier()({
      architecture: args.architecture,
      expectedHashes: args['expected-sha256']
        ? parseChecksumFile(path.resolve(args['expected-sha256']))
        : undefined,
      metadata,
      releaseDir: path.resolve(args['release-dir'] ?? metadata.build.directories.output),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  assertSignatureMetadata,
  createCommandRunner,
  createMacosReleaseVerifier,
  parseChecksumFile,
  readMachOFileType,
  verifyMacOsApp,
};
