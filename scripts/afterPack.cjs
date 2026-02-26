/**
 * electron-builder afterPack hook
 *
 * Fixes spawn-helper permissions for node-pty on macOS.
 *
 * When a real signing identity is available (Developer ID), electron-builder
 * deep-signs the entire .app bundle AFTER this hook runs, so we only need
 * to fix file permissions here. The ad-hoc fallback handles unsigned local
 * dev builds where electron-builder skips signing entirely.
 *
 * See GitHub issue #29 for the original Apple Silicon crash investigation.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Ad-hoc sign a binary. Used as a fallback when no Developer ID cert
 * is available (local dev builds). When electron-builder signs with a
 * real identity, it re-signs everything and overwrites these.
 */
function adHocSign(filePath) {
  execFileSync('codesign', ['--force', '--sign', '-', filePath], { stdio: 'pipe' });
}

exports.default = async function(context) {
  // Only run on macOS builds
  if (process.platform !== 'darwin' && context.electronPlatformName !== 'darwin') {
    return;
  }

  const appOutDir = context.appOutDir;
  const resourcesDir = path.join(appOutDir, 'AudioBash.app', 'Contents', 'Resources');
  const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');

  // Check if electron-builder will sign with a real identity
  const signingIdentity = process.env.CSC_NAME || process.env.CSC_LINK;
  const willBeRealSigned = !!signingIdentity;

  const architectures = ['darwin-arm64', 'darwin-x64'];

  for (const arch of architectures) {
    const prebuildsDir = path.join(
      unpackedDir,
      'node_modules',
      'node-pty',
      'prebuilds',
      arch
    );

    // Fix spawn-helper permissions (always needed)
    const spawnHelperPath = path.join(prebuildsDir, 'spawn-helper');
    if (fs.existsSync(spawnHelperPath)) {
      try {
        fs.chmodSync(spawnHelperPath, 0o755);

        if (!willBeRealSigned) {
          adHocSign(spawnHelperPath);
          console.log(`[afterPack] Fixed permissions and ad-hoc signed ${arch}/spawn-helper`);
        } else {
          console.log(`[afterPack] Fixed permissions for ${arch}/spawn-helper (real signing will follow)`);
        }
      } catch (err) {
        console.error(`[afterPack] Failed to fix ${arch}/spawn-helper:`, err.message);
      }
    }

    // Ad-hoc sign pty.node only when no real signing will happen
    const ptyNodePath = path.join(prebuildsDir, 'pty.node');
    if (fs.existsSync(ptyNodePath) && !willBeRealSigned) {
      try {
        adHocSign(ptyNodePath);
        console.log(`[afterPack] Ad-hoc signed ${arch}/pty.node`);
      } catch (err) {
        console.error(`[afterPack] Failed to sign ${arch}/pty.node:`, err.message);
      }
    }
  }
};
