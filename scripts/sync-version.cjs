'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveReleaseArtifacts } = require('./releaseArtifacts.cjs');

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const DOWNLOAD_ARTIFACT_IDS = Object.freeze({
  windows: ['windows', 'nsis'],
  'mac-arm64': ['mac', 'arm64', 'dmg'],
  'mac-intel': ['mac', 'x64', 'dmg'],
  'linux-appimage': ['linux', 'AppImage'],
  'linux-deb': ['linux', 'deb'],
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function requireVersion(metadata) {
  if (!VERSION_PATTERN.test(metadata.version ?? '')) {
    throw new Error('package.json version must use numeric major.minor.patch form');
  }
  return metadata.version;
}

function compareVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

function requirePublicVersion(metadata, version = requireVersion(metadata)) {
  const publicVersion = metadata.releasePolicy?.publicVersion;
  if (!VERSION_PATTERN.test(publicVersion ?? '')) {
    throw new Error('releasePolicy.publicVersion must use numeric major.minor.patch form');
  }
  if (compareVersions(publicVersion, version) > 0) {
    throw new Error('releasePolicy.publicVersion cannot be newer than package.json version');
  }
  return publicVersion;
}

function valueAtPath(value, keys) {
  return keys.reduce((current, key) => current?.[key], value);
}

function replaceExactlyOnce(contents, pattern, replacement, label) {
  const matches = [...contents.matchAll(pattern)];
  if (matches.length !== 1) {
    throw new Error(`${label} must occur exactly once; found ${matches.length}`);
  }
  return contents.replace(pattern, replacement);
}

function updateVersionJavaScript(contents, metadata) {
  const version = requireVersion(metadata);
  const publicVersion = requirePublicVersion(metadata, version);
  let updated = replaceExactlyOnce(
    contents,
    /const AUDIOBASH_VERSION\s*=\s*'[^']+';/g,
    `const AUDIOBASH_VERSION = '${publicVersion}';`,
    'AUDIOBASH_VERSION declaration',
  );

  if (publicVersion !== version) return updated;

  const artifacts = resolveReleaseArtifacts(metadata);
  for (const [downloadId, artifactPath] of Object.entries(DOWNLOAD_ARTIFACT_IDS)) {
    const fileName = valueAtPath(artifacts, artifactPath);
    if (typeof fileName !== 'string') {
      throw new Error(`No release artifact resolves for ${downloadId}`);
    }
    const escapedId = downloadId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linePattern = new RegExp(
      '([\'"]' + escapedId + '[\'"]\\s*:\\s*`[^`\\r\\n]*/)[^/`\\r\\n]+(`)',
      'g',
    );
    updated = replaceExactlyOnce(
      updated,
      linePattern,
      `$1${fileName}$2`,
      `download mapping ${downloadId}`,
    );
  }

  return updated;
}

function updateHtmlFallbacks(contents, relativePath, version) {
  const targetPattern = /data-version="[^"]*\{version\}[^"]*"/g;
  const targets = [...contents.matchAll(targetPattern)].length;
  let replacements = 0;
  const updated = contents.replace(
    /(<([a-z][\w-]*)\b[^>]*\bdata-version="([^"]*\{version\}[^"]*)"[^>]*>)([^<]*)(<\/\2>)/gi,
    (_match, openingTag, _tagName, template, _fallback, closingTag) => {
      replacements += 1;
      return `${openingTag}${template.replaceAll('{version}', version)}${closingTag}`;
    },
  );
  if (replacements !== targets) {
    throw new Error(
      `${relativePath} has ${targets} templated version elements but ${replacements} safe text fallbacks`,
    );
  }
  return updated;
}

function listHtmlFiles(directory, rootDirectory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listHtmlFiles(absolutePath, rootDirectory);
      return entry.isFile() && entry.name.endsWith('.html')
        ? [path.relative(rootDirectory, absolutePath).split(path.sep).join('/')]
        : [];
    })
    .sort();
}

function createVersionPlan(rootDirectory = path.join(__dirname, '..')) {
  const metadata = readJson(path.join(rootDirectory, 'package.json'));
  const version = requireVersion(metadata);
  const publicVersion = requirePublicVersion(metadata, version);
  const lock = readJson(path.join(rootDirectory, 'package-lock.json'));
  const errors = [];
  if (lock.version !== version) {
    errors.push(`package-lock.json version must equal package.json version ${version}`);
  }
  if (lock.packages?.['']?.version !== version) {
    errors.push(
      `package-lock.json root package version must equal package.json version ${version}`,
    );
  }
  if (metadata.build?.buildVersion && metadata.build.buildVersion !== version) {
    errors.push(`build.buildVersion must equal package.json version ${version}`);
  }

  const evidencePath = `dev-docs/releases/v${version}.md`;
  const absoluteEvidencePath = path.join(rootDirectory, evidencePath);
  const evidenceHeading = `# AudioBash v${version} release evidence`;
  if (
    !fs.existsSync(absoluteEvidencePath) ||
    !fs.readFileSync(absoluteEvidencePath, 'utf8').startsWith(`${evidenceHeading}\n`)
  ) {
    errors.push(`${evidencePath} must identify AudioBash v${version} release evidence`);
  }

  const updates = new Map();
  const versionJavaScriptPath = 'docs/js/version.js';
  const versionJavaScript = fs.readFileSync(
    path.join(rootDirectory, versionJavaScriptPath),
    'utf8',
  );
  updates.set(versionJavaScriptPath, updateVersionJavaScript(versionJavaScript, metadata));

  for (const relativePath of listHtmlFiles(path.join(rootDirectory, 'docs'), rootDirectory)) {
    const contents = fs.readFileSync(path.join(rootDirectory, relativePath), 'utf8');
    updates.set(relativePath, updateHtmlFallbacks(contents, relativePath, publicVersion));
  }

  return { errors, metadata, publicVersion, updates, version };
}

function checkVersion(rootDirectory = path.join(__dirname, '..')) {
  const plan = createVersionPlan(rootDirectory);
  for (const [relativePath, expected] of plan.updates) {
    const current = fs.readFileSync(path.join(rootDirectory, relativePath), 'utf8');
    if (current !== expected) plan.errors.push(`${relativePath} is not synchronized`);
  }
  return { errors: plan.errors, publicVersion: plan.publicVersion, version: plan.version };
}

function restoreBackup(fileSystem, record) {
  try {
    fileSystem.renameSync(record.absolutePath, record.temporaryPath);
  } catch (error) {
    throw new Error(
      `${record.absolutePath} kept its replacement; the original remains at ${record.backupPath}`,
      { cause: error },
    );
  }
  try {
    fileSystem.renameSync(record.backupPath, record.absolutePath);
  } catch (error) {
    try {
      fileSystem.renameSync(record.temporaryPath, record.absolutePath);
    } catch (reinstallError) {
      throw new AggregateError(
        [error, reinstallError],
        `${record.absolutePath} was left missing; restore it from ${record.backupPath}; its replacement could not be reinstalled`,
      );
    }
    throw error;
  }
}

function removeFiles(fileSystem, filePaths) {
  const errors = [];
  for (const filePath of filePaths) {
    try {
      fileSystem.rmSync(filePath, { force: true });
    } catch (error) {
      errors.push({ error, filePath });
    }
  }
  return errors;
}

function describeFileErrors(fileErrors) {
  return fileErrors
    .map(({ error, filePath }) => `${filePath}: ${error?.message ?? String(error)}`)
    .join('; ');
}

function syncVersion(rootDirectory = path.join(__dirname, '..'), options = {}) {
  const fileSystem = options.fileSystem ?? fs;
  const temporaryId =
    options.temporaryId ??
    `version-sync-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const plan = createVersionPlan(rootDirectory);
  if (plan.errors.length > 0) {
    throw new Error(plan.errors.join('\n'));
  }
  const changedFiles = [...plan.updates]
    .filter(([relativePath, expected]) => {
      const absolutePath = path.join(rootDirectory, relativePath);
      return fs.readFileSync(absolutePath, 'utf8') !== expected;
    })
    .map(([relativePath]) => relativePath)
    .sort();
  const stagedFiles = [];

  try {
    for (const relativePath of changedFiles) {
      const absolutePath = path.join(rootDirectory, relativePath);
      const temporaryPath = `${absolutePath}.${temporaryId}.tmp`;
      const record = {
        absolutePath,
        backupPath: `${absolutePath}.${temporaryId}.bak`,
        temporaryPath,
      };
      stagedFiles.push(record);
      fileSystem.writeFileSync(temporaryPath, plan.updates.get(relativePath), {
        encoding: 'utf8',
        flag: 'wx',
        mode: fs.statSync(absolutePath).mode,
      });
    }
  } catch (error) {
    const cleanupErrors = removeFiles(
      fileSystem,
      stagedFiles.map(({ temporaryPath }) => temporaryPath),
    );
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors.map(({ error: cleanupError }) => cleanupError)],
        `Version synchronization staging failed: ${error.message}; temporary file cleanup was incomplete: ${describeFileErrors(cleanupErrors)}`,
      );
    }
    throw error;
  }

  const replacedFiles = [];
  try {
    for (const record of stagedFiles) {
      fileSystem.renameSync(record.absolutePath, record.backupPath);
      try {
        fileSystem.renameSync(record.temporaryPath, record.absolutePath);
      } catch (error) {
        try {
          fileSystem.renameSync(record.backupPath, record.absolutePath);
        } catch (restoreError) {
          throw new AggregateError(
            [error, restoreError],
            `Version synchronization failed and ${record.absolutePath} was left missing; restore it from ${record.backupPath}`,
          );
        }
        throw error;
      }
      replacedFiles.push(record);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const record of replacedFiles.reverse()) {
      try {
        restoreBackup(fileSystem, record);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    const cleanupErrors = removeFiles(
      fileSystem,
      stagedFiles.map(({ temporaryPath }) => temporaryPath),
    );
    const cleanupCauses = cleanupErrors.map(({ error: cleanupError }) => cleanupError);
    const cleanupDetails = describeFileErrors(cleanupErrors);
    if (rollbackErrors.length > 0) {
      const rollbackDetails = rollbackErrors
        .map((rollbackError) => rollbackError?.message ?? String(rollbackError))
        .join('; ');
      throw new AggregateError(
        [error, ...rollbackErrors, ...cleanupCauses],
        `Version synchronization failed and rollback was incomplete: ${error.message}; recovery details: ${rollbackDetails}${cleanupDetails ? `; temporary cleanup failures: ${cleanupDetails}` : ''}`,
      );
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupCauses],
        `Version synchronization failed; rollback restored original files, but temporary file cleanup was incomplete: ${cleanupDetails}`,
      );
    }
    throw error;
  }
  const backupCleanupErrors = removeFiles(
    fileSystem,
    stagedFiles.map(({ backupPath }) => backupPath),
  );
  if (backupCleanupErrors.length > 0) {
    throw new AggregateError(
      backupCleanupErrors.map(({ error }) => error),
      `Version synchronization completed, but backup file cleanup was incomplete: ${describeFileErrors(backupCleanupErrors)}`,
    );
  }
  return { changedFiles, publicVersion: plan.publicVersion, version: plan.version };
}

function runCli() {
  const mode = process.argv[2];
  if (mode === '--check') {
    const result = checkVersion();
    if (result.errors.length > 0) {
      for (const error of result.errors) process.stderr.write(`${error}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `Build version ${result.version} and public version ${result.publicVersion} are synchronized.\n`,
    );
    return;
  }
  if (mode === '--write') {
    const result = syncVersion();
    const suffix = result.changedFiles.length > 0 ? result.changedFiles.join(', ') : 'no files';
    process.stdout.write(
      `Synchronized build version ${result.version} and public version ${result.publicVersion}: ${suffix}.\n`,
    );
    return;
  }
  throw new Error('Usage: node scripts/sync-version.cjs --check|--write');
}

if (require.main === module) runCli();

module.exports = {
  checkVersion,
  createVersionPlan,
  syncVersion,
  updateHtmlFallbacks,
  updateVersionJavaScript,
};
