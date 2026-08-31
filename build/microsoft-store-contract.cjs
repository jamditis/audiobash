'use strict';

const packageJson = require('../package.json');

const STORE_MODE_ENV = 'AUDIOBASH_STORE_MODE';
const PRODUCTION_IDENTITY_ENVIRONMENT = {
  identityName: 'AUDIOBASH_STORE_IDENTITY_NAME',
  publisher: 'AUDIOBASH_STORE_PUBLISHER',
  publisherDisplayName: 'AUDIOBASH_STORE_PUBLISHER_DISPLAY_NAME',
};
const TEST_IDENTITY = Object.freeze({
  identityName: 'AudioBash.Store.Test',
  publisher: 'CN=AudioBash Store Test',
  publisherDisplayName: 'AudioBash Store Test',
});

function requiredEnvironmentValue(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for a production Microsoft Store package`);
  return value;
}

function readStoreIdentity(mode, environment) {
  if (mode === 'test') return TEST_IDENTITY;
  if (mode !== 'production') {
    throw new Error(`${STORE_MODE_ENV} must be either "test" or "production"`);
  }

  return Object.fromEntries(
    Object.entries(PRODUCTION_IDENTITY_ENVIRONMENT).map(([field, environmentName]) => [
      field,
      requiredEnvironmentValue(environment, environmentName),
    ]),
  );
}

function fourPartVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Microsoft Store source version must have three numeric parts: ${version}`);
  }
  return `${version}.0`;
}

function createStoreContract(environment = process.env) {
  const mode = environment[STORE_MODE_ENV]?.trim();
  const identity = readStoreIdentity(mode, environment);
  const isProduction = mode === 'production';

  return Object.freeze({
    mode,
    packageVersion: fourPartVersion(packageJson.version),
    identity: Object.freeze({ ...identity }),
    outputDirectory: isProduction ? 'release/microsoft-store' : 'release/microsoft-store-test',
    artifactName: isProduction
      ? 'AudioBash-${version}-store-${arch}.${ext}'
      : 'AudioBash-${version}-store-test-${arch}.${ext}',
  });
}

module.exports = {
  createStoreContract,
  fourPartVersion,
};
