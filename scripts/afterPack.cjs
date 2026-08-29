/**
 * Electron-builder afterPack hook.
 *
 * Electron-builder signs the full app after this hook. This hook first repairs,
 * ad hoc signs, and verifies the node-pty files that the packaged app will use.
 */
const path = require('path');
const { Arch: electronArch } = require('electron-builder');
const { repairNodePtyBinaries: repairSystemNodePtyBinaries } = require('./nodePtyBinaries.cjs');

function createAfterPack({
  Arch = electronArch,
  repairNodePtyBinaries = repairSystemNodePtyBinaries,
} = {}) {
  return async function afterPack(context) {
    if (context.electronPlatformName !== 'darwin') {
      return;
    }

    const targetArchitecture = Arch[context.arch];
    if (!['arm64', 'x64'].includes(targetArchitecture)) {
      throw new Error(`Unsupported macOS package architecture: ${context.arch}`);
    }

    const productFilename = context.packager.appInfo.productFilename;
    const nodePtyRoot = path.join(
      context.appOutDir,
      `${productFilename}.app`,
      'Contents',
      'Resources',
      'app.asar.unpacked',
      'node_modules',
      'node-pty',
    );

    repairNodePtyBinaries({
      nodePtyRoot,
      targetArchitecture,
      releaseMode: true,
    });

    console.log(`[afterPack] Repaired and verified node-pty for macOS ${targetArchitecture}.`);
  };
}

module.exports = {
  createAfterPack,
  default: createAfterPack(),
};
