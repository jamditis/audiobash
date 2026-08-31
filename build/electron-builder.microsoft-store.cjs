'use strict';

const packageJson = require('../package.json');
const { createStoreContract } = require('./microsoft-store-contract.cjs');

function createConfig() {
  const contract = createStoreContract();
  const config = JSON.parse(JSON.stringify(packageJson.build));

  delete config.afterSign;
  delete config.afterAllArtifactBuild;
  delete config.nsis;
  delete config.dmg;
  delete config.mac;
  delete config.linux;

  config.directories.output = contract.outputDirectory;
  config.win = {
    ...config.win,
    target: [{ target: 'appx', arch: ['x64'] }],
    artifactName: contract.artifactName,
    files: [
      '!node_modules/node-pty/prebuilds/!(win32-x64){,/**/*}',
      '!node_modules/node-pty/third_party/conpty/*/!(win10-x64){,/**/*}',
      '!node_modules/node-pty/{deps,scripts,src}{,/**/*}',
      '!node_modules/node-pty/**/*.test.{js,ts}',
      '!node_modules/node-pty/**/*.{map,pdb}',
    ],
  };
  config.appx = {
    ...contract.identity,
    applicationId: 'AudioBash',
    displayName: 'AudioBash',
    backgroundColor: '#111827',
    capabilities: ['runFullTrust', 'microphone'],
    languages: ['en-US'],
    minVersion: '10.0.17763.0',
    maxVersionTested: '10.0.26100.0',
    setBuildNumber: false,
    electronUpdaterAware: false,
  };

  return config;
}

module.exports = createConfig();
