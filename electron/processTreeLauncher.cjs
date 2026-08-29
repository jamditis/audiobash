'use strict';

const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const {
  PARENT_STARTUP_MESSAGE_LIMIT_CHARACTERS,
  parseWindowsOwnerFrame,
} = require('./windowsOwnerProtocol.cjs');

const PIPE_FRAME_LIMIT_BYTES = 4096;
const PARENT_LEASE_INTERVAL_MS = 250;
const WINDOWS_OWNER_READY_TIMEOUT_MS = 10_000;

const [command, ...args] = process.argv.slice(2);
const holdAfterTarget = process.env.AUDIOBASH_LAUNCHER_HOLD === '1';
let started = false;
let settled = false;
let gateToken = '';
let holdTimer;
let jobOwner;
let jobSocket;
let jobStatusServer;
let ownerReadyTimer;

const status = fs.createWriteStream(null, { autoClose: true, fd: 4 });

function hold() {
  if (!holdTimer) {
    holdTimer = setInterval(() => status.write('\n'), PARENT_LEASE_INTERVAL_MS);
  }
}

function stopWindowsOwner() {
  clearTimeout(ownerReadyTimer);
  jobSocket?.destroy();
  jobStatusServer?.close();
  jobOwner?.stdin?.destroy();
  if (Number.isSafeInteger(jobOwner?.pid) && jobOwner.pid > 0) jobOwner.kill();
}

status.once('error', () => {
  if (holdAfterTarget) {
    settled = true;
    stopWindowsOwner();
  } else if (started && process.platform !== 'win32') {
    try {
      process.kill(-process.pid, 'SIGKILL');
    } catch (error) {
      if (error?.code !== 'ESRCH') process.stderr.write(`Could not stop process group: ${error}\n`);
    }
  }
  process.exit(124);
});

function finish(code, signal) {
  if (settled) return;
  settled = true;
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
}

function reportStartupFailure(error) {
  if (settled) return;
  settled = true;
  stopWindowsOwner();
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Windows Job startup failed: ${message}\n`);
  status.write(
    `${JSON.stringify({
      type: 'startup-error',
      message: message.slice(0, PARENT_STARTUP_MESSAGE_LIMIT_CHARACTERS),
    })}\n`,
  );
  hold();
}

function reportTargetResult(code, signal) {
  if (settled) return;
  settled = true;
  const result = `${JSON.stringify({ type: 'target-result', code, signal })}\n`;
  if (!holdAfterTarget && holdTimer) clearInterval(holdTimer);
  const finishTarget = () => {
    if (holdAfterTarget) return;
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  };
  if (holdAfterTarget) status.write(result, finishTarget);
  else status.end(result, finishTarget);
}

function windowsPowerShellPath() {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  return path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function windowsJobOwnerPath() {
  const packagedPath = process.resourcesPath
    ? path.join(process.resourcesPath, 'windowsJobOwner.ps1')
    : undefined;
  if (packagedPath && fs.existsSync(packagedPath)) return packagedPath;
  return path.join(__dirname, 'windowsJobOwner.ps1');
}

function resolveWindowsCommand(targetCommand, targetEnvironment) {
  let resolved;
  if (path.win32.isAbsolute(targetCommand)) {
    resolved = targetCommand;
  } else if (/[\\/]/.test(targetCommand)) {
    resolved = path.resolve(process.cwd(), targetCommand);
  } else {
    const environmentValue = (name) => {
      const key = Object.keys(targetEnvironment).find(
        (candidate) => candidate.toLowerCase() === name.toLowerCase(),
      );
      return key ? targetEnvironment[key] : undefined;
    };
    const pathEntries = String(environmentValue('PATH') || '')
      .split(path.win32.delimiter)
      .map((entry) => entry.trim().replace(/^"(.*)"$/, '$1'))
      .filter((entry) => entry.length > 0);
    const extensions = String(environmentValue('PATHEXT') || '.COM;.EXE;.BAT;.CMD')
      .split(path.win32.delimiter)
      .filter(Boolean)
      .map((extension) => (extension.startsWith('.') ? extension : `.${extension}`));
    const names = path.win32.extname(targetCommand)
      ? [targetCommand]
      : [targetCommand, ...extensions.map((extension) => `${targetCommand}${extension}`)];

    for (const entry of pathEntries) {
      for (const name of names) {
        const candidate = path.win32.resolve(entry, name);
        try {
          if (!/\.(?:bat|cmd)$/i.test(candidate) && fs.statSync(candidate).isFile()) {
            resolved = candidate;
            break;
          }
        } catch {
          // Continue through the bounded PATH and PATHEXT candidate list.
        }
      }
      if (resolved) break;
    }
  }

  if (!resolved || !path.win32.isAbsolute(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`Windows target is not an absolute executable: ${targetCommand}`);
  }
  if (/\.(?:bat|cmd)$/i.test(resolved)) {
    throw new Error(`Windows command scripts are not supported: ${resolved}`);
  }
  return resolved;
}

function startWindowsJobTarget(targetEnvironment) {
  const nonce = randomBytes(32).toString('hex');
  const pipeName = `audiobash-job-${process.pid}-${randomBytes(32).toString('hex')}`;
  const pipePath = `\\\\.\\pipe\\${pipeName}`;
  let pipeText = '';
  let pipeState = 'awaiting-owner';

  const fail = (error) => reportStartupFailure(error);
  const acceptFrame = (line) => {
    if (settled) return;
    let frame;
    try {
      frame = parseWindowsOwnerFrame(line, {
        nonce,
        ownerPid: jobOwner?.pid,
        pipeState,
      });
    } catch (error) {
      fail(error);
      return;
    }

    if (frame.type === 'startup-error') {
      fail(new Error(frame.message));
      return;
    }

    if (frame.type === 'owner-ready') {
      clearTimeout(ownerReadyTimer);
      pipeState = 'forwarding-owner';
      status.write(
        `${JSON.stringify({ type: 'owner-ready', ownerPid: frame.ownerPid })}\n`,
        (error) => {
          if (error || settled) {
            if (error) fail(error);
            return;
          }
          pipeState = 'awaiting-target';
          jobSocket.write('start\n', (writeError) => {
            if (writeError) fail(writeError);
          });
        },
      );
      return;
    }

    pipeState = 'terminal';
    reportTargetResult(frame.code, null);
  };

  const consumeFrames = (final = false) => {
    let newline = pipeText.indexOf('\n');
    while (newline >= 0) {
      const rawLine = pipeText.slice(0, newline);
      pipeText = pipeText.slice(newline + 1);
      if (Buffer.byteLength(rawLine, 'utf8') > PIPE_FRAME_LIMIT_BYTES) {
        fail(new Error('Windows Job owner returned an invalid frame size'));
        return;
      }
      const line = rawLine.trim();
      if (!line) {
        fail(new Error('Windows Job owner returned an invalid frame size'));
        return;
      }
      acceptFrame(line);
      newline = pipeText.indexOf('\n');
    }
    if (Buffer.byteLength(pipeText, 'utf8') > PIPE_FRAME_LIMIT_BYTES) {
      fail(new Error(`Windows Job owner frame exceeded ${PIPE_FRAME_LIMIT_BYTES} bytes`));
      return;
    }
    if (final && pipeText.trim()) fail(new Error('Windows Job owner returned a partial frame'));
  };

  jobStatusServer = net.createServer({ allowHalfOpen: false }, (socket) => {
    if (jobSocket) {
      socket.destroy();
      return;
    }
    jobSocket = socket;
    jobStatusServer.close();
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      pipeText += chunk;
      consumeFrames();
    });
    socket.once('end', () => {
      consumeFrames(true);
      if (!settled && pipeState !== 'terminal') {
        fail(new Error('Windows Job owner closed its status pipe before the target result'));
      }
    });
    socket.once('error', fail);
  });
  jobStatusServer.once('error', fail);
  jobStatusServer.listen(pipePath, () => {
    try {
      const resolvedCommand = resolveWindowsCommand(command, targetEnvironment);
      const scriptPath = windowsJobOwnerPath();
      if (!fs.existsSync(scriptPath))
        throw new Error(`Windows Job owner is missing: ${scriptPath}`);
      jobOwner = spawn(
        windowsPowerShellPath(),
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
        ],
        {
          env: targetEnvironment,
          stdio: ['pipe', 'inherit', 'inherit'],
          windowsHide: true,
        },
      );
      jobOwner.once('error', fail);
      jobOwner.once('close', (code) => {
        if (!settled) fail(new Error(`Windows Job owner exited before cleanup with code ${code}`));
      });
      jobOwner.stdin.once('error', fail);
      if (!Number.isSafeInteger(jobOwner.pid) || jobOwner.pid <= 0) {
        fail(new Error('Windows Job owner has no valid PID'));
        return;
      }
      ownerReadyTimer = setTimeout(
        () => fail(new Error('Windows Job owner did not report readiness')),
        WINDOWS_OWNER_READY_TIMEOUT_MS,
      );
      jobOwner.stdin.end(
        JSON.stringify({
          args,
          command: resolvedCommand,
          cwd: process.cwd(),
          launcherPid: process.pid,
          nonce,
          pipeName,
        }),
      );
    } catch (error) {
      fail(error);
    }
  });
}

function startDirectTarget(targetEnvironment) {
  const target = spawn(command, args, {
    env: targetEnvironment,
    stdio: ['ignore', 'inherit', 'inherit'],
    windowsHide: true,
  });
  target.once('error', (error) => {
    process.stderr.write(`Could not start ${command}: ${error.message}\n`);
    reportTargetResult(127, null);
  });
  target.once('close', reportTargetResult);
}

const gate = fs.createReadStream(null, { autoClose: true, fd: 3 });
gate.setEncoding('utf8');
gate.on('data', (chunk) => {
  gateToken += chunk;
  if (gateToken.length > 5) process.exit(126);
});
gate.once('error', () => finish(124, null));
gate.once('end', () => {
  if (settled) {
    hold();
    return;
  }
  if (gateToken !== 'start' || started || !command) {
    process.exit(126);
    return;
  }
  started = true;

  const targetEnvironment = { ...process.env };
  delete targetEnvironment.AUDIOBASH_LAUNCHER_HOLD;
  delete targetEnvironment.ELECTRON_RUN_AS_NODE;
  hold();
  if (holdAfterTarget) startWindowsJobTarget(targetEnvironment);
  else startDirectTarget(targetEnvironment);
});

process.once('exit', () => {
  clearTimeout(ownerReadyTimer);
  jobSocket?.destroy();
  jobStatusServer?.close();
  if (holdTimer) clearInterval(holdTimer);
});
