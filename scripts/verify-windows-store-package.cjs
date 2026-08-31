'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REQUIRED_ASSETS = [
  'StoreLogo.png',
  'Square44x44Logo.png',
  'Square150x150Logo.png',
  'Wide310x150Logo.png',
];
const REQUIRED_RESTRICTED_CAPABILITIES = new Set(['runFullTrust']);
const REJECTED_CAPABILITIES = new Set([
  'allowElevation',
  'broadFileSystemAccess',
  'unvirtualizedResources',
]);

function decodeXml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function attributesFromTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}\\b([^>]*)>`, 'i'));
  if (!match) throw new Error(`${tagName} element is missing`);
  const attributes = {};
  for (const attribute of match[1].matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)) {
    attributes[attribute[1]] = decodeXml(attribute[3]);
  }
  return attributes;
}

function requireExact(actual, expected, field) {
  if (actual !== expected) {
    throw new Error(`${field} must be exactly "${expected}", received "${actual ?? ''}"`);
  }
}

function capabilityNames(xml, tagName) {
  return [
    ...xml.matchAll(new RegExp(`<${tagName}\\b[^>]*\\bName=(["'])(.*?)\\1[^>]*/?>`, 'gi')),
  ].map((match) => decodeXml(match[2]));
}

function validateManifest(xml, expected) {
  if (typeof xml !== 'string' || xml.length === 0) throw new Error('Manifest XML is empty');
  const identity = attributesFromTag(xml, 'Identity');
  const application = attributesFromTag(xml, 'Application');
  const publisherDisplayName = xml.match(
    /<PublisherDisplayName>([^<]*)<\/PublisherDisplayName>/i,
  )?.[1];

  requireExact(identity.Name, expected.identityName, 'identityName');
  requireExact(identity.Publisher, expected.publisher, 'publisher');
  requireExact(
    decodeXml(publisherDisplayName || ''),
    expected.publisherDisplayName,
    'publisherDisplayName',
  );
  requireExact(identity.Version, expected.version, 'version');
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(identity.Version)) {
    throw new Error(`version must have four numeric parts: ${identity.Version}`);
  }
  requireExact(identity.ProcessorArchitecture, expected.architecture, 'architecture');
  requireExact(application.Id, expected.applicationId, 'applicationId');
  requireExact(application.Executable, 'app\\AudioBash.exe', 'executable');
  requireExact(application.EntryPoint, 'Windows.FullTrustApplication', 'entry point');

  const restrictedCapabilities = capabilityNames(xml, 'rescap:Capability');
  for (const capability of REQUIRED_RESTRICTED_CAPABILITIES) {
    if (!restrictedCapabilities.includes(capability)) {
      throw new Error(`Required capability is missing: ${capability}`);
    }
  }
  for (const capability of restrictedCapabilities) {
    if (!REQUIRED_RESTRICTED_CAPABILITIES.has(capability)) {
      throw new Error(`Unexpected restricted capability: ${capability}`);
    }
  }

  const standardCapabilities = capabilityNames(xml, 'Capability');
  if (standardCapabilities.length > 0) {
    throw new Error(`Unexpected capability: ${standardCapabilities[0]}`);
  }
  const deviceCapabilities = capabilityNames(xml, 'DeviceCapability');
  if (!deviceCapabilities.includes('microphone')) {
    throw new Error('Required capability is missing: microphone');
  }
  if (deviceCapabilities.length !== 1) {
    const unexpected = deviceCapabilities.find((capability) => capability !== 'microphone');
    throw new Error(`Unexpected device capability: ${unexpected || 'duplicate microphone'}`);
  }
  for (const capability of [...restrictedCapabilities, ...deviceCapabilities]) {
    if (REJECTED_CAPABILITIES.has(capability)) {
      throw new Error(`Rejected capability is present: ${capability}`);
    }
  }
}

function assertProductionIdentity({ identityName, publisher, artifactName }) {
  const productionValues = [identityName, publisher, artifactName];
  if (productionValues.some((value) => /(?:^|[ ._-])test(?:$|[ ._-])/i.test(value || ''))) {
    throw new Error('A test identity or test artifact cannot be used as production');
  }
}

function requireFile(filePath, description) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${description} is missing: ${filePath}`);
  }
  if (fs.statSync(filePath).size === 0) throw new Error(`${description} is empty: ${filePath}`);
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function rejectUnexpectedDirectories(parentDirectory, allowedNames, description) {
  if (!fs.existsSync(parentDirectory) || !fs.statSync(parentDirectory).isDirectory()) {
    throw new Error(`${description} directory is missing: ${parentDirectory}`);
  }
  for (const entry of fs.readdirSync(parentDirectory, { withFileTypes: true })) {
    if (entry.isDirectory() && !allowedNames.has(entry.name)) {
      throw new Error(`Unexpected ${description} directory: ${entry.name}`);
    }
  }
}

function verifyExtractedPackage(packageRoot, expected, repositoryRoot) {
  const manifestPath = path.join(packageRoot, 'AppxManifest.xml');
  requireFile(manifestPath, 'AppX manifest');
  validateManifest(fs.readFileSync(manifestPath, 'utf8'), expected);

  const requiredPackageFiles = [
    ['app/AudioBash.exe', 'AudioBash executable'],
    ['app/resources/app.asar', 'application ASAR'],
    ['app/resources/windowsJobOwner.ps1', 'physical Windows Job owner'],
    [
      'app/resources/app.asar.unpacked/node_modules/node-pty/prebuilds/win32-x64/pty.node',
      'x64 node-pty binary',
    ],
  ];
  for (const [relativePath, description] of requiredPackageFiles) {
    requireFile(path.join(packageRoot, ...relativePath.split('/')), description);
  }
  rejectUnexpectedDirectories(
    path.join(
      packageRoot,
      'app',
      'resources',
      'app.asar.unpacked',
      'node_modules',
      'node-pty',
      'prebuilds',
    ),
    new Set(['win32-x64']),
    'node-pty prebuild',
  );

  for (const assetName of REQUIRED_ASSETS) {
    const packagedAsset = path.join(packageRoot, 'assets', assetName);
    const sourceAsset = path.join(repositoryRoot, 'build', 'appx', assetName);
    requireFile(packagedAsset, `Packaged ${assetName}`);
    requireFile(sourceAsset, `Source ${assetName}`);
    if (sha256(packagedAsset) !== sha256(sourceAsset)) {
      throw new Error(`Packaged asset does not match the reviewed source: ${assetName}`);
    }
  }
}

function expectedFromConfig(config, contract) {
  return {
    identityName: config.appx.identityName,
    publisher: config.appx.publisher,
    publisherDisplayName: config.appx.publisherDisplayName,
    version: contract.packageVersion,
    architecture: 'x64',
    applicationId: config.appx.applicationId,
  };
}

function main() {
  const [packageRoot, artifactPath] = process.argv.slice(2);
  if (!packageRoot || !artifactPath) {
    throw new Error(
      'Usage: node scripts/verify-windows-store-package.cjs <unpacked-package> <appx-artifact>',
    );
  }
  requireFile(artifactPath, 'AppX artifact');

  const repositoryRoot = path.join(__dirname, '..');
  const config = require(
    path.join(repositoryRoot, 'build', 'electron-builder.microsoft-store.cjs'),
  );
  const { createStoreContract } = require(
    path.join(repositoryRoot, 'build', 'microsoft-store-contract.cjs'),
  );
  const contract = createStoreContract();
  const expected = expectedFromConfig(config, contract);
  if (contract.mode === 'production') {
    assertProductionIdentity({
      identityName: expected.identityName,
      publisher: expected.publisher,
      artifactName: path.basename(artifactPath),
    });
  }
  verifyExtractedPackage(path.resolve(packageRoot), expected, repositoryRoot);
  process.stdout.write(`${sha256(artifactPath)}  ${path.basename(artifactPath)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  assertProductionIdentity,
  expectedFromConfig,
  sha256,
  validateManifest,
  verifyExtractedPackage,
};
