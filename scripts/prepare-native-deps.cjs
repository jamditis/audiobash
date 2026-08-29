const path = require('path');
const { repairNodePtyBinaries } = require('./nodePtyBinaries.cjs');

if (process.platform === 'darwin') {
  const nodePtyRoot = path.join(__dirname, '..', 'node_modules', 'node-pty');

  for (const targetArchitecture of ['arm64', 'x64']) {
    repairNodePtyBinaries({
      nodePtyRoot,
      targetArchitecture,
      releaseMode: true,
    });
  }

  console.log('[node-pty] Prepared macOS arm64 and x64 native binaries.');
}
