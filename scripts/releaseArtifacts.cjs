'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ARTIFACT_DEFINITIONS = Object.freeze(
  [
    { id: 'mac-arm64-dmg', platform: 'mac', arch: 'arm64', target: 'dmg', extension: 'dmg' },
    { id: 'mac-arm64-zip', platform: 'mac', arch: 'arm64', target: 'zip', extension: 'zip' },
    { id: 'mac-x64-dmg', platform: 'mac', arch: 'x64', target: 'dmg', extension: 'dmg' },
    { id: 'mac-x64-zip', platform: 'mac', arch: 'x64', target: 'zip', extension: 'zip' },
    { id: 'windows-nsis', platform: 'windows', arch: 'x64', target: 'nsis', extension: 'exe' },
    {
      id: 'linux-appimage',
      platform: 'linux',
      arch: 'x64',
      target: 'AppImage',
      extension: 'AppImage',
    },
    { id: 'linux-deb', platform: 'linux', arch: 'x64', target: 'deb', extension: 'deb' },
  ].map(Object.freeze),
);
const WINDOWS_RESERVED_BASENAMES = new Set([
  'AUX',
  'CON',
  'NUL',
  'PRN',
  ...Array.from({ length: 9 }, (_value, index) => `COM${index + 1}`),
  ...Array.from({ length: 9 }, (_value, index) => `LPT${index + 1}`),
]);

function requireString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${label} is required to resolve release artifacts`);
  }
  return value;
}

function renderArtifactName(template, fields) {
  const fileName = requireString(template, 'Artifact template').replace(
    /\$\{([^}]+)\}/g,
    (_match, field) => {
      if (
        !Object.hasOwn(fields, field) ||
        typeof fields[field] !== 'string' ||
        fields[field].length === 0
      ) {
        throw new Error(`Unresolved artifact template field: ${field}`);
      }
      return fields[field];
    },
  );
  if (fileName.includes('${')) {
    throw new Error(`Unresolved artifact template field in ${fileName}`);
  }
  if (!isSafePathSegment(fileName)) {
    throw new Error(`Artifact template produced an unsafe filename: ${fileName}`);
  }
  return fileName;
}

function isSafePathSegment(segment) {
  if (segment.length === 0 || segment === '.' || segment === '..') return false;
  if (/[\x00-\x1f\x7f<>:"/\\|?*\u005b\u005d{}()!+@$]/.test(segment)) return false;
  if (/[. ]$/.test(segment)) return false;
  const windowsBaseName = segment.split('.')[0].toUpperCase();
  return !WINDOWS_RESERVED_BASENAMES.has(windowsBaseName);
}

function requireSafeOutputDirectory(value) {
  const output = requireString(value, 'build.directories.output');
  const segments = output.split('/');
  if (
    path.posix.isAbsolute(output) ||
    path.win32.isAbsolute(output) ||
    segments.some((segment) => !isSafePathSegment(segment))
  ) {
    throw new Error(`Release artifact manifest has an unsafe output directory: ${output}`);
  }
  return output;
}

function templateFor(metadata, platform) {
  if (platform === 'mac') return metadata.build?.mac?.artifactName;
  if (platform === 'windows') return metadata.build?.win?.artifactName;
  if (platform === 'linux') return metadata.build?.linux?.artifactName;
  throw new Error(`Unsupported release platform: ${platform}`);
}

function createReleaseArtifactManifest(
  metadata,
  outputDirectory = metadata.build?.directories?.output,
) {
  const productName = requireString(metadata.build?.productName, 'build.productName');
  const version = requireString(metadata.version, 'package version');
  const output = requireSafeOutputDirectory(outputDirectory);
  const records = ARTIFACT_DEFINITIONS.map((definition) => {
    const fileName = renderArtifactName(templateFor(metadata, definition.platform), {
      productName,
      version,
      arch: definition.arch,
      ext: definition.extension,
    });
    return Object.freeze({
      ...definition,
      fileName,
      relativePath: `${output}/${fileName}`,
    });
  });
  const fileNames = records.map((record) => record.fileName);
  if (new Set(fileNames).size !== fileNames.length) {
    throw new Error('Release artifact templates produced duplicate filenames');
  }
  return Object.freeze(records);
}

function resolveReleaseArtifacts(metadata) {
  const manifest = createReleaseArtifactManifest(metadata);
  const byId = Object.fromEntries(manifest.map((record) => [record.id, record.fileName]));
  return Object.freeze({
    mac: Object.freeze({
      arm64: Object.freeze({ dmg: byId['mac-arm64-dmg'], zip: byId['mac-arm64-zip'] }),
      x64: Object.freeze({ dmg: byId['mac-x64-dmg'], zip: byId['mac-x64-zip'] }),
    }),
    windows: Object.freeze({ nsis: byId['windows-nsis'] }),
    linux: Object.freeze({ AppImage: byId['linux-appimage'], deb: byId['linux-deb'] }),
    all: Object.freeze(manifest.map((record) => record.fileName)),
  });
}

function loadPackageMetadata(packagePath = path.join(__dirname, '..', 'package.json')) {
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

function artifactById(metadata, id) {
  const artifact = createReleaseArtifactManifest(metadata).find((record) => record.id === id);
  if (!artifact) throw new Error(`Unknown release artifact ID: ${id}`);
  return artifact;
}

if (require.main === module) {
  const id = process.argv[2];
  if (!id) throw new Error('A release artifact ID is required');
  process.stdout.write(`${artifactById(loadPackageMetadata(), id).fileName}\n`);
}

module.exports = {
  ARTIFACT_DEFINITIONS,
  artifactById,
  createReleaseArtifactManifest,
  loadPackageMetadata,
  isSafePathSegment,
  renderArtifactName,
  requireSafeOutputDirectory,
  resolveReleaseArtifacts,
};
