'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createReleaseArtifactManifest, loadPackageMetadata } = require('./releaseArtifacts.cjs');

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function workflowDirectory(record) {
  if (record.platform === 'mac') return `macos-${record.arch}`;
  if (record.platform === 'windows') return 'windows-x64';
  return 'linux-x64';
}

function checksumName(directory) {
  return `SHA256-${directory}.txt`;
}

function parseChecksumFile(filePath) {
  const entries = new Map();
  const lines = fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([a-fA-F0-9]{64})[ \t]+[*]?(.+)$/);
    if (!match) throw new Error(`Invalid checksum line in ${filePath}: ${line}`);
    const [, hash, fileName] = match;
    if (entries.has(fileName)) throw new Error(`Duplicate checksum entry: ${fileName}`);
    entries.set(fileName, hash.toLowerCase());
  }
  return entries;
}

function writeAtomic(filePath, contents) {
  const temporaryPath = `${filePath}.tmp`;
  fs.writeFileSync(temporaryPath, contents, 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function requirePathWithinRoot(targetPath, rootPath, description, expectedType) {
  if (!fs.existsSync(targetPath)) throw new Error(`${description} is missing: ${targetPath}`);
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
    throw new Error(`${description} is outside the artifact directory: ${targetPath}`);
  }
  const hasExpectedType = expectedType === 'file' ? stats.isFile() : stats.isDirectory();
  if (!hasExpectedType) throw new Error(`${description} has the wrong type: ${targetPath}`);
  return stats;
}

function verifyReleaseArtifactSet({
  artifactsDirectory,
  metadata,
  releaseCommit,
  workflowRepository,
  workflowRunAttempt,
  workflowRunId,
}) {
  if (!/^[a-f0-9]{40}$/.test(releaseCommit ?? '')) {
    throw new Error('Release commit must be an exact lowercase 40-character commit SHA');
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(workflowRepository ?? '')) {
    throw new Error('Workflow repository must use the owner/repository format');
  }
  if (!/^[1-9][0-9]*$/.test(workflowRunId ?? '')) {
    throw new Error('Workflow run ID must be a positive integer');
  }
  if (!/^[1-9][0-9]*$/.test(workflowRunAttempt ?? '')) {
    throw new Error('Workflow run attempt must be a positive integer');
  }
  requirePathWithinRoot(artifactsDirectory, artifactsDirectory, 'Artifact directory', 'directory');

  const expected = createReleaseArtifactManifest(metadata);
  const expectedDirectories = [...new Set(expected.map(workflowDirectory))].sort();
  const rootEntries = fs.readdirSync(artifactsDirectory, { withFileTypes: true });
  const unexpectedRootEntries = rootEntries
    .filter(
      (entry) =>
        !expectedDirectories.includes(entry.name) &&
        !['release-candidate-manifest.json', 'SHA256SUMS.txt'].includes(entry.name),
    )
    .map((entry) => entry.name);
  if (unexpectedRootEntries.length > 0) {
    throw new Error(`Unexpected artifact root entries: ${unexpectedRootEntries.join(', ')}`);
  }

  const verifiedFiles = [];
  for (const directory of expectedDirectories) {
    const directoryPath = path.join(artifactsDirectory, directory);
    requirePathWithinRoot(
      directoryPath,
      artifactsDirectory,
      'Expected workflow artifact directory',
      'directory',
    );
    const records = expected.filter((record) => workflowDirectory(record) === directory);
    const expectedNames = [
      ...records.map((record) => record.fileName),
      checksumName(directory),
    ].sort();
    const actualNames = fs.readdirSync(directoryPath).sort();
    const missing = expectedNames.filter((name) => !actualNames.includes(name));
    const unexpected = actualNames.filter((name) => !expectedNames.includes(name));
    if (missing.length > 0) {
      throw new Error(
        `Expected release files are missing from ${directory}: ${missing.join(', ')}`,
      );
    }
    if (unexpected.length > 0) {
      throw new Error(`Unexpected release files in ${directory}: ${unexpected.join(', ')}`);
    }

    const checksumPath = path.join(directoryPath, checksumName(directory));
    requirePathWithinRoot(checksumPath, artifactsDirectory, 'Expected checksum file', 'file');
    const checksums = parseChecksumFile(checksumPath);
    const checksumNames = [...checksums.keys()].sort();
    const releaseNames = records.map((record) => record.fileName).sort();
    if (JSON.stringify(checksumNames) !== JSON.stringify(releaseNames)) {
      throw new Error(`Checksum inventory does not match ${directory}`);
    }

    for (const record of records) {
      const filePath = path.join(directoryPath, record.fileName);
      const stats = requirePathWithinRoot(
        filePath,
        artifactsDirectory,
        'Expected release artifact',
        'file',
      );
      if (stats.size === 0) {
        throw new Error(`Release artifact is empty or not a file: ${record.fileName}`);
      }
      const actualHash = sha256(filePath);
      if (checksums.get(record.fileName) !== actualHash) {
        throw new Error(`Checksum mismatch for ${record.fileName}`);
      }
      verifiedFiles.push({
        architecture: record.arch,
        fileName: record.fileName,
        id: record.id,
        platform: record.platform,
        sha256: actualHash,
        size: stats.size,
        target: record.target,
        workflowArtifact: directory,
      });
    }
  }

  const manifest = {
    schemaVersion: 1,
    productName: metadata.build.productName,
    packageVersion: metadata.version,
    releaseCommit,
    workflowRepository,
    workflowRunAttempt,
    workflowRunId,
    files: verifiedFiles,
  };
  const manifestPath = path.join(artifactsDirectory, 'release-candidate-manifest.json');
  const checksumPath = path.join(artifactsDirectory, 'SHA256SUMS.txt');
  writeAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeAtomic(
    checksumPath,
    `${verifiedFiles.map((file) => `${file.sha256}  ${file.fileName}`).join('\n')}\n`,
  );
  return { checksumPath, manifestPath };
}

if (require.main === module) {
  try {
    const artifactsDirectory = path.resolve(process.argv[2] ?? 'artifacts');
    const releaseCommit = process.argv[3];
    const workflowRepository = process.argv[4];
    const workflowRunId = process.argv[5];
    const workflowRunAttempt = process.argv[6];
    verifyReleaseArtifactSet({
      artifactsDirectory,
      metadata: loadPackageMetadata(),
      releaseCommit,
      workflowRepository,
      workflowRunAttempt,
      workflowRunId,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = {
  parseChecksumFile,
  verifyReleaseArtifactSet,
};
