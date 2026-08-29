import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const packageJson = require('../../package.json');
const { createReleaseArtifactManifest } = require('../../scripts/releaseArtifacts.cjs') as {
  createReleaseArtifactManifest: (metadata: typeof packageJson) => Array<{
    arch: string;
    fileName: string;
    id: string;
    platform: string;
  }>;
};
const { verifyReleaseArtifactSet } = require('../../scripts/verify-release-artifact-set.cjs') as {
  verifyReleaseArtifactSet: (options: {
    artifactsDirectory: string;
    metadata: typeof packageJson;
    releaseCommit: string;
    workflowRepository: string;
    workflowRunAttempt: string;
    workflowRunId: string;
  }) => { manifestPath: string; checksumPath: string };
};

const temporaryDirectories: string[] = [];
const releaseCommit = 'a'.repeat(40);
const workflowRepository = 'jamditis/audiobash';
const workflowRunAttempt = '2';
const workflowRunId = '123456789';

function provenance() {
  return { workflowRepository, workflowRunAttempt, workflowRunId };
}

function sha256(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

function workflowDirectory(record: { arch: string; platform: string }): string {
  if (record.platform === 'mac') return `macos-${record.arch}`;
  if (record.platform === 'windows') return 'windows-x64';
  return 'linux-x64';
}

function checksumName(directory: string): string {
  return `SHA256-${directory}.txt`;
}

function makeFixture() {
  const artifactsDirectory = mkdtempSync(join(tmpdir(), 'audiobash-artifacts-'));
  temporaryDirectories.push(artifactsDirectory);
  const records = createReleaseArtifactManifest(packageJson);
  const byDirectory = new Map<string, Array<{ fileName: string; contents: string }>>();

  for (const record of records) {
    const directory = workflowDirectory(record);
    const contents = `bytes:${record.id}`;
    const files = byDirectory.get(directory) ?? [];
    files.push({ fileName: record.fileName, contents });
    byDirectory.set(directory, files);
  }

  for (const [directory, files] of byDirectory) {
    const outputDirectory = join(artifactsDirectory, directory);
    mkdirSync(outputDirectory, { recursive: true });
    for (const file of files) {
      writeFileSync(join(outputDirectory, file.fileName), file.contents);
    }
    writeFileSync(
      join(outputDirectory, checksumName(directory)),
      files.map((file) => `${sha256(file.contents)}  ${file.fileName}`).join('\n') + '\n',
    );
  }

  return { artifactsDirectory, records };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('release artifact set verifier', () => {
  it('writes a manifest and combined checksum for the exact seven files', () => {
    const fixture = makeFixture();
    const result = verifyReleaseArtifactSet({
      artifactsDirectory: fixture.artifactsDirectory,
      metadata: packageJson,
      releaseCommit,
      ...provenance(),
    });

    const manifest = JSON.parse(readFileSync(result.manifestPath, 'utf8'));
    expect(manifest).toMatchObject({
      packageVersion: packageJson.version,
      releaseCommit,
      workflowRepository,
      workflowRunAttempt,
      workflowRunId,
    });
    expect(manifest.files).toHaveLength(7);
    expect(manifest.files.map((file: { fileName: string }) => file.fileName).sort()).toEqual(
      fixture.records.map((record) => record.fileName).sort(),
    );
    expect(readFileSync(result.checksumPath, 'utf8').trim().split('\n')).toHaveLength(7);
  });

  it('rejects one missing expected release file', () => {
    const fixture = makeFixture();
    const missing = fixture.records[0];
    rmSync(join(fixture.artifactsDirectory, workflowDirectory(missing), missing.fileName));

    expect(() =>
      verifyReleaseArtifactSet({
        artifactsDirectory: fixture.artifactsDirectory,
        metadata: packageJson,
        releaseCommit,
        ...provenance(),
      }),
    ).toThrow(/missing/i);
  });

  it('rejects an unexpected release file', () => {
    const fixture = makeFixture();
    writeFileSync(join(fixture.artifactsDirectory, 'macos-arm64', 'unexpected.dmg'), 'extra');

    expect(() =>
      verifyReleaseArtifactSet({
        artifactsDirectory: fixture.artifactsDirectory,
        metadata: packageJson,
        releaseCommit,
        ...provenance(),
      }),
    ).toThrow(/unexpected/i);
  });

  it('rejects an unexpected artifact root entry', () => {
    const fixture = makeFixture();
    writeFileSync(join(fixture.artifactsDirectory, 'unexpected-root.txt'), 'extra');

    expect(() =>
      verifyReleaseArtifactSet({
        artifactsDirectory: fixture.artifactsDirectory,
        metadata: packageJson,
        releaseCommit,
        ...provenance(),
      }),
    ).toThrow(/Unexpected artifact root entries/);
  });

  it('rejects a checksum that does not match the downloaded bytes', () => {
    const fixture = makeFixture();
    const changed = fixture.records.at(-1)!;
    writeFileSync(
      join(fixture.artifactsDirectory, workflowDirectory(changed), changed.fileName),
      'changed bytes',
    );

    expect(() =>
      verifyReleaseArtifactSet({
        artifactsDirectory: fixture.artifactsDirectory,
        metadata: packageJson,
        releaseCommit,
        ...provenance(),
      }),
    ).toThrow(/checksum mismatch/i);
  });

  it('rejects an expected artifact that is a symbolic link', () => {
    const fixture = makeFixture();
    const record = fixture.records[0];
    const filePath = join(fixture.artifactsDirectory, workflowDirectory(record), record.fileName);
    const outsideDirectory = mkdtempSync(join(tmpdir(), 'audiobash-artifact-outside-'));
    temporaryDirectories.push(outsideDirectory);
    const outsideFile = join(outsideDirectory, record.fileName);
    writeFileSync(outsideFile, readFileSync(filePath));
    rmSync(filePath);
    symlinkSync(outsideFile, filePath);

    expect(() =>
      verifyReleaseArtifactSet({
        artifactsDirectory: fixture.artifactsDirectory,
        metadata: packageJson,
        releaseCommit,
        ...provenance(),
      }),
    ).toThrow(/symbolic link|outside/i);
  });

  it('rejects an expected workflow artifact directory that is a symbolic link', () => {
    const fixture = makeFixture();
    const directory = 'macos-arm64';
    const directoryPath = join(fixture.artifactsDirectory, directory);
    const outsideRoot = mkdtempSync(join(tmpdir(), 'audiobash-artifact-directory-outside-'));
    temporaryDirectories.push(outsideRoot);
    const outsideDirectory = join(outsideRoot, directory);
    renameSync(directoryPath, outsideDirectory);
    symlinkSync(outsideDirectory, directoryPath);

    expect(() =>
      verifyReleaseArtifactSet({
        artifactsDirectory: fixture.artifactsDirectory,
        metadata: packageJson,
        releaseCommit,
        ...provenance(),
      }),
    ).toThrow(/symbolic link|outside/i);
  });

  it('rejects a release commit that is not an exact SHA', () => {
    const fixture = makeFixture();

    expect(() =>
      verifyReleaseArtifactSet({
        artifactsDirectory: fixture.artifactsDirectory,
        metadata: packageJson,
        releaseCommit: 'main',
        ...provenance(),
      }),
    ).toThrow(/40-character commit SHA/);
  });

  it.each([
    ['workflow repository', { ...provenance(), workflowRepository: 'audiobash' }],
    ['workflow run ID', { ...provenance(), workflowRunId: '' }],
    ['workflow run attempt', { ...provenance(), workflowRunAttempt: 'zero' }],
  ])('rejects invalid %s provenance', (_label, invalidProvenance) => {
    const fixture = makeFixture();

    expect(() =>
      verifyReleaseArtifactSet({
        artifactsDirectory: fixture.artifactsDirectory,
        metadata: packageJson,
        releaseCommit,
        ...invalidProvenance,
      }),
    ).toThrow(/workflow/i);
  });
});
