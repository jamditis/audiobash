const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');

function parseVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }

  return 0;
}

function validateToolchain({ nodeVersion, npmVersion, requiredNodeVersion, requiredNpmVersion }) {
  const errors = [];

  if (compareVersions(nodeVersion, requiredNodeVersion) !== 0) {
    errors.push(
      `Node ${nodeVersion.replace(/^v/, '')} does not match required version ${requiredNodeVersion}.`,
    );
  }

  if (npmVersion !== requiredNpmVersion) {
    errors.push(`npm ${npmVersion} does not match required version ${requiredNpmVersion}.`);
  }

  return errors;
}

function readToolchainContract(packageJsonPath) {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const nodeMatch = /^>=(\d+\.\d+\.\d+) <(\d+)$/.exec(packageJson.engines?.node ?? '');
  const npmMatch = /^npm@(\d+\.\d+\.\d+)$/.exec(packageJson.packageManager ?? '');

  if (!nodeMatch || !npmMatch) {
    throw new Error(
      'package.json must define engines.node as >=x.y.z <x and packageManager as npm@x.y.z.',
    );
  }

  const requiredNodeVersion = readFileSync(join(dirname(packageJsonPath), '.nvmrc'), 'utf8').trim();
  const upperNodeVersion = `${nodeMatch[2]}.0.0`;
  parseVersion(requiredNodeVersion);

  if (
    compareVersions(requiredNodeVersion, nodeMatch[1]) < 0 ||
    compareVersions(requiredNodeVersion, upperNodeVersion) >= 0
  ) {
    throw new Error(
      `.nvmrc version ${requiredNodeVersion} is outside engines.node ${packageJson.engines.node}.`,
    );
  }

  return {
    requiredNodeVersion,
    requiredNpmVersion: npmMatch[1],
  };
}

function readActiveNpmVersion(npmExecPath = process.env.npm_execpath) {
  if (!npmExecPath) {
    throw new Error('The active npm executable is unknown. Run this check through npm.');
  }

  return execFileSync(process.execPath, [npmExecPath, '--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function main() {
  const contract = readToolchainContract(join(__dirname, '..', 'package.json'));
  const npmVersion = readActiveNpmVersion();
  const errors = validateToolchain({
    nodeVersion: process.version,
    npmVersion,
    ...contract,
  });

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Toolchain verified: Node ${process.version.replace(/^v/, '')}, npm ${npmVersion}.`);
}

module.exports = {
  compareVersions,
  parseVersion,
  readActiveNpmVersion,
  readToolchainContract,
  validateToolchain,
};

if (require.main === module) {
  main();
}
