'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_PROBE_ENV = 'AUDIOBASH_WINDOWS_PACKAGE_PROBE';
const PACKAGE_ROOT_ENV = 'AUDIOBASH_WINDOWS_PACKAGE_ROOT';
const PACKAGE_PROBE_TIMEOUT_MS = 30_000;
const PTY_PROBE_TIMEOUT_MS = 15_000;
const OUTPUT_LIMIT_BYTES = 64 * 1024;
const PTY_PROBE_MARKER = 'AUDIOBASH_PACKAGED_WINDOWS_PTY_OK';

function packagePaths(
  rootDirectory = path.join(__dirname, '..'),
  applicationDirectory = path.join(rootDirectory, 'release', 'win-unpacked'),
) {
  const packageJson = require(path.join(rootDirectory, 'package.json'));
  const resourcesPath = path.join(applicationDirectory, 'resources');
  const ptyModule = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'node-pty');
  return {
    asar: path.join(resourcesPath, 'app.asar'),
    executable: path.join(applicationDirectory, `${packageJson.build.productName}.exe`),
    helper: path.join(resourcesPath, 'windowsJobOwner.ps1'),
    processTree: path.join(resourcesPath, 'app.asar', 'electron', 'processTree.cjs'),
    ptyModule,
    ptyPackage: path.join(ptyModule, 'package.json'),
  };
}

function requireFile(filePath, description) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${description} is missing: ${filePath}`);
  }
}

function appendBounded(chunks, chunk, state) {
  if (state.bytes >= OUTPUT_LIMIT_BYTES) return;
  const buffer = Buffer.from(chunk);
  const remaining = OUTPUT_LIMIT_BYTES - state.bytes;
  chunks.push(buffer.subarray(0, remaining));
  state.bytes += Math.min(buffer.length, remaining);
}

async function runPackagedProbe() {
  if (process.platform !== 'win32') {
    throw new Error('The packaged Windows process-owner probe requires Windows');
  }
  if (!process.resourcesPath) {
    throw new Error('The packaged Electron resources path is unavailable');
  }

  const helper = path.join(process.resourcesPath, 'windowsJobOwner.ps1');
  const processTree = path.join(process.resourcesPath, 'app.asar', 'electron', 'processTree.cjs');
  requireFile(helper, 'Physical Windows Job owner');
  requireFile(processTree, 'Packaged process-tree controller');

  const { createProcessTreeController } = require(processTree);
  const controller = createProcessTreeController();
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const command = process.env.ComSpec || path.join(systemRoot, 'System32', 'cmd.exe');
  const ptyModule = path.join(
    process.resourcesPath,
    'app.asar.unpacked',
    'node_modules',
    'node-pty',
  );
  requireFile(path.join(ptyModule, 'package.json'), 'Packaged node-pty module');
  const packagedPty = require(ptyModule);
  const powerShell = path.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  await exercisePackagedProcessTree(controller, command);
  await exercisePackagedPty(packagedPty, powerShell);

  process.stdout.write('AUDIOBASH_PACKAGED_WINDOWS_PROCESS_TREE_OK\n');
}

function exercisePackagedPty(ptyModule, shell, timeoutMs = PTY_PROBE_TIMEOUT_MS) {
  if (!ptyModule || typeof ptyModule.spawn !== 'function') {
    return Promise.reject(new TypeError('The packaged node-pty module is required'));
  }

  return new Promise((resolve, reject) => {
    const terminal = ptyModule.spawn(shell, ['-NoLogo', '-NoProfile'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.env.USERPROFILE || process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' },
    });
    let output = '';
    let markerReceived = false;
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      try {
        terminal.kill();
      } finally {
        finish(new Error('Packaged Windows PTY probe timed out'));
      }
    }, timeoutMs);

    terminal.onData((data) => {
      if (output.length < OUTPUT_LIMIT_BYTES) {
        output += data.slice(0, OUTPUT_LIMIT_BYTES - output.length);
      }
      if (!markerReceived && output.includes(PTY_PROBE_MARKER)) {
        markerReceived = true;
        terminal.resize(100, 40);
        terminal.write('exit\r\n');
      }
    });
    terminal.onExit(({ exitCode, signal }) => {
      if (!markerReceived) {
        finish(new Error('Packaged Windows PTY exited before returning its marker'));
      } else if (exitCode !== 0 || (signal !== undefined && signal !== 0)) {
        finish(new Error(`Packaged Windows PTY failed with code ${exitCode} and signal ${signal}`));
      } else {
        finish();
      }
    });
    terminal.write("Write-Output ('AUDIOBASH_PACKAGED_WINDOWS_' + 'PTY_OK')\r\n");
  });
}

async function exercisePackagedProcessTree(controller, command) {
  let owned;
  let failure;
  try {
    owned = await controller.spawn(command, ['/d', '/s', '/c', 'exit /b 0']);
    owned.child.stdout?.resume();
    owned.child.stderr?.resume();
    const targetResult = await owned.closeTracker.exitPromise;
    if (targetResult.code !== 0 || targetResult.signal !== null) {
      throw new Error(
        `Packaged Windows target failed with code ${targetResult.code} and signal ${targetResult.signal}`,
      );
    }
  } catch (error) {
    failure = error;
  } finally {
    if (owned) {
      try {
        await controller.stop(owned);
        const closeResult = await owned.closeTracker.closePromise;
        const streamErrors = owned.closeTracker.claimStreamErrors?.() || {};
        const closeError =
          closeResult.processError || streamErrors.stdoutError || streamErrors.stderrError;
        if (closeError) {
          failure = failure
            ? new AggregateError([failure, closeError], 'Packaged Windows probe and cleanup failed')
            : closeError;
        }
      } catch (cleanupError) {
        failure = failure
          ? new AggregateError([failure, cleanupError], 'Packaged Windows probe and cleanup failed')
          : cleanupError;
      } finally {
        owned.child.stdout?.destroy();
        owned.child.stderr?.destroy();
      }
    }
  }
  if (failure) throw failure;
}

function terminateWindowsProcessTree(child) {
  if (!child || typeof child.kill !== 'function') {
    throw new TypeError('The packaged Windows probe child handle is required');
  }
  return child.kill('SIGKILL');
}

function runPackageProbe(
  rootDirectory = path.join(__dirname, '..'),
  applicationDirectory = process.env[PACKAGE_ROOT_ENV],
) {
  if (process.platform !== 'win32') {
    return Promise.reject(new Error('The packaged Windows process-owner probe requires Windows'));
  }

  const paths = packagePaths(rootDirectory, applicationDirectory);
  requireFile(paths.executable, 'Packaged AudioBash executable');
  requireFile(paths.helper, 'Physical Windows Job owner');
  requireFile(paths.asar, 'Packaged application ASAR');
  requireFile(paths.ptyPackage, 'Packaged node-pty module');

  return new Promise((resolve, reject) => {
    const stdoutChunks = [];
    const stderrChunks = [];
    const stdoutState = { bytes: 0 };
    const stderrState = { bytes: 0 };
    const child = spawn(paths.executable, [__filename], {
      cwd: rootDirectory,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        [PACKAGE_PROBE_ENV]: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      terminateWindowsProcessTree(child);
    }, PACKAGE_PROBE_TIMEOUT_MS);
    child.stdout.on('data', (chunk) => appendBounded(stdoutChunks, chunk, stdoutState));
    child.stderr.on('data', (chunk) => appendBounded(stderrChunks, chunk, stderrState));
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (
        timedOut ||
        code !== 0 ||
        signal !== null ||
        !stdout.includes('AUDIOBASH_PACKAGED_WINDOWS_PROCESS_TREE_OK')
      ) {
        reject(
          new Error(
            `Packaged Windows process-owner probe failed with code ${code} and signal ${signal}\n${stdout}\n${stderr}`,
          ),
        );
        return;
      }
      resolve();
    });
  });
}

async function main() {
  if (process.env[PACKAGE_PROBE_ENV] === '1') await runPackagedProbe();
  else await runPackageProbe();
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  exercisePackagedProcessTree,
  exercisePackagedPty,
  packagePaths,
  runPackageProbe,
  runPackagedProbe,
  terminateWindowsProcessTree,
};
