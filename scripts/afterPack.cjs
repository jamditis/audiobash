/**
 * electron-builder afterPack hook
 * Fixes spawn-helper permissions for node-pty on macOS and re-signs
 * binaries so they pass ARM64 code signature validation.
 *
 * On Apple Silicon, ALL native executables must be at least ad-hoc signed.
 * chmod invalidates existing signatures, so we must re-sign after fixing
 * permissions. Without this, macOS kills the process immediately with
 * SIGKILL (Code Signature Invalid). See GitHub issue #29.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/**
 * Ad-hoc sign a binary with codesign.
 * Uses "-" as the identity for ad-hoc signing (no Apple Developer cert needed).
 * The --force flag overwrites any existing (now-invalid) signature.
 */
function adHocSign(filePath) {
  execFileSync('codesign', ['--force', '--sign', '-', filePath], { stdio: 'pipe' });
}

exports.default = async function(context) {
  // Only run on macOS
  if (process.platform !== 'darwin' && context.electronPlatformName !== 'darwin') {
    return;
  }

  const appOutDir = context.appOutDir;
  const resourcesDir = path.join(appOutDir, 'AudioBash.app', 'Contents', 'Resources');
  const unpackedDir = path.join(resourcesDir, 'app.asar.unpacked');

  // Fix spawn-helper permissions and re-sign for both architectures
  const architectures = ['darwin-arm64', 'darwin-x64'];

  for (const arch of architectures) {
    const prebuildsDir = path.join(
      unpackedDir,
      'node_modules',
      'node-pty',
      'prebuilds',
      arch
    );

    // Fix spawn-helper: chmod + re-sign
    const spawnHelperPath = path.join(prebuildsDir, 'spawn-helper');
    if (fs.existsSync(spawnHelperPath)) {
      try {
        fs.chmodSync(spawnHelperPath, 0o755);
        adHocSign(spawnHelperPath);
        console.log(`[afterPack] Fixed permissions and re-signed ${arch}/spawn-helper`);
      } catch (err) {
        console.error(`[afterPack] Failed to fix ${arch}/spawn-helper:`, err.message);
      }
    }

    // Re-sign pty.node native addon (may also need valid signature)
    const ptyNodePath = path.join(prebuildsDir, 'pty.node');
    if (fs.existsSync(ptyNodePath)) {
      try {
        adHocSign(ptyNodePath);
        console.log(`[afterPack] Re-signed ${arch}/pty.node`);
      } catch (err) {
        console.error(`[afterPack] Failed to re-sign ${arch}/pty.node:`, err.message);
      }
    }
  }
};
