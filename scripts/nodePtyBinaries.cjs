const fs = require('fs');
const path = require('path');
const { execFileSync: systemExecFileSync } = require('child_process');

const CODESIGN_PATH = '/usr/bin/codesign';
const SUPPORTED_ARCHITECTURES = new Set(['arm64', 'x64']);

function getOptions(options = {}) {
  const {
    nodePtyRoot,
    targetArchitecture,
    releaseMode = false,
    execFileSync = systemExecFileSync,
    chmodSync = fs.chmodSync,
  } = options;

  if (!nodePtyRoot) {
    throw new Error('nodePtyRoot is required');
  }

  if (!SUPPORTED_ARCHITECTURES.has(targetArchitecture)) {
    throw new Error(`Unsupported node-pty architecture: ${targetArchitecture}`);
  }

  if (typeof execFileSync !== 'function') {
    throw new Error('execFileSync must be a function');
  }

  if (typeof chmodSync !== 'function') {
    throw new Error('chmodSync must be a function');
  }

  const prebuildRoot = path.join(nodePtyRoot, 'prebuilds', `darwin-${targetArchitecture}`);

  return {
    targetArchitecture,
    releaseMode,
    execFileSync,
    chmodSync,
    spawnHelperPath: path.join(prebuildRoot, 'spawn-helper'),
    ptyNodePath: path.join(prebuildRoot, 'pty.node'),
  };
}

function runWithFailurePolicy(options, operation, action) {
  try {
    action();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failure = new Error(
      `Failed to ${operation} node-pty ${options.targetArchitecture} binaries: ${message}`,
      { cause: error },
    );

    if (options.releaseMode) {
      throw failure;
    }

    console.warn(`[node-pty] ${failure.message}`);
    return false;
  }
}

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Required native file is missing: ${filePath}`);
  }
}

function verifyStrict(options) {
  requireFile(options.spawnHelperPath);
  requireFile(options.ptyNodePath);

  const spawnHelperMode = fs.statSync(options.spawnHelperPath).mode & 0o777;
  if (spawnHelperMode !== 0o755) {
    throw new Error(
      `spawn-helper has mode ${spawnHelperMode.toString(8)} instead of required mode 755`,
    );
  }

  for (const filePath of [options.spawnHelperPath, options.ptyNodePath]) {
    options.execFileSync(CODESIGN_PATH, ['--verify', '--strict', filePath], { stdio: 'pipe' });
  }
}

function verifyNodePtyBinaries(options) {
  const normalizedOptions = getOptions(options);
  return runWithFailurePolicy(normalizedOptions, 'verify', () => verifyStrict(normalizedOptions));
}

function repairNodePtyBinaries(options) {
  const normalizedOptions = getOptions(options);

  return runWithFailurePolicy(normalizedOptions, 'repair', () => {
    requireFile(normalizedOptions.spawnHelperPath);
    requireFile(normalizedOptions.ptyNodePath);

    normalizedOptions.chmodSync(normalizedOptions.spawnHelperPath, 0o755);

    for (const filePath of [normalizedOptions.spawnHelperPath, normalizedOptions.ptyNodePath]) {
      normalizedOptions.execFileSync(CODESIGN_PATH, ['--force', '--sign', '-', filePath], {
        stdio: 'pipe',
      });
    }

    verifyStrict(normalizedOptions);
  });
}

module.exports = { repairNodePtyBinaries, verifyNodePtyBinaries };
