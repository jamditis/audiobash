/**
 * electron-builder afterPack hook
 * Fixes spawn-helper permissions for node-pty on macOS
 */
const fs = require('fs');
const path = require('path');

exports.default = async function(context) {
  // Only run on macOS
  if (process.platform !== 'darwin' && context.electronPlatformName !== 'darwin') {
    return;
  }

  const appOutDir = context.appOutDir;
  const resourcesDir = path.join(appOutDir, 'AudioBash.app', 'Contents', 'Resources');
  const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');

  // Fix spawn-helper permissions for both architectures
  const architectures = ['darwin-arm64', 'darwin-x64'];

  for (const arch of architectures) {
    const spawnHelperPath = path.join(
      unpackedDir,
      'node_modules',
      'node-pty',
      'prebuilds',
      arch,
      'spawn-helper'
    );

    if (fs.existsSync(spawnHelperPath)) {
      try {
        fs.chmodSync(spawnHelperPath, 0o755);
        console.log(`[afterPack] Fixed permissions for ${arch}/spawn-helper`);
      } catch (err) {
        console.error(`[afterPack] Failed to fix permissions for ${arch}/spawn-helper:`, err.message);
      }
    }
  }
};
