// @vitest-environment node

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { createProcessTreeController } = require('../../electron/processTree.cjs') as {
  createProcessTreeController(options?: Record<string, unknown>): {
    spawn(
      command: string,
      args: string[],
      options?: Record<string, unknown>,
    ): Promise<OwnedProcess>;
    stop(process: OwnedProcess): Promise<unknown>;
  };
};
const { createTranscriptionJob } = require('../../electron/transcriptionJob.cjs') as {
  createTranscriptionJob(options: Record<string, unknown>): {
    cancel(): Promise<void>;
    run(stages: Record<string, unknown>): Promise<unknown>;
    shutdown(): Promise<void>;
  };
};

interface OwnedProcess {
  child: import('node:child_process').ChildProcess;
  closeTracker: {
    closePromise: Promise<unknown>;
  };
  groupId?: number;
}

const fixture = join(__dirname, '../fixtures/processTreeParent.cjs');
const cleanupPids = new Set<number>();
const cleanupDirectories = new Set<string>();

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

function processGroupId(pid: number): number {
  return Number(
    execFileSync('/bin/ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim(),
  );
}

async function readProcessIds(child: import('node:child_process').ChildProcess): Promise<{
  childPid: number;
  parentPid: number;
}> {
  return await new Promise((resolve, reject) => {
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk.toString();
      const newline = output.indexOf('\n');
      if (newline >= 0) resolve(JSON.parse(output.slice(0, newline)));
    });
    child.once('error', reject);
  });
}

async function waitForStopped(pid: number): Promise<void> {
  await expect.poll(() => isRunning(pid), { timeout: 5000, interval: 50 }).toBe(false);
  cleanupPids.delete(pid);
}

async function waitForProcessIds(filepath: string): Promise<{
  childPid: number;
  parentPid: number;
}> {
  await expect
    .poll(
      () => {
        if (!existsSync(filepath)) return undefined;
        try {
          return JSON.parse(readFileSync(filepath, 'utf8'));
        } catch {
          return undefined;
        }
      },
      { timeout: 5000, interval: 25 },
    )
    .toEqual(
      expect.objectContaining({ childPid: expect.any(Number), parentPid: expect.any(Number) }),
    );
  const ids = JSON.parse(readFileSync(filepath, 'utf8'));
  cleanupPids.add(ids.parentPid);
  cleanupPids.add(ids.childPid);
  return ids;
}

afterEach(() => {
  for (const pid of cleanupPids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // The test process already stopped.
    }
  }
  cleanupPids.clear();
  for (const directory of cleanupDirectories) {
    rmSync(directory, { force: true, recursive: true });
  }
  cleanupDirectories.clear();
});

describe.runIf(process.platform === 'darwin')('macOS process-tree integration', () => {
  it('proves a direct parent kill leaves its descendant running', async () => {
    const parent = spawn(process.execPath, [fixture], { stdio: ['ignore', 'pipe', 'pipe'] });
    const ids = await readProcessIds(parent);
    cleanupPids.add(ids.parentPid);
    cleanupPids.add(ids.childPid);

    parent.kill('SIGTERM');
    await new Promise((resolve) => parent.once('close', resolve));

    expect(isRunning(ids.childPid)).toBe(true);
    process.kill(ids.childPid, 'SIGKILL');
    await waitForStopped(ids.childPid);
    cleanupPids.delete(ids.parentPid);
  });

  it('proves the owned group is isolated and reaps both parent and descendant', async () => {
    const controller = createProcessTreeController();
    const owned = await controller.spawn(process.execPath, [fixture], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const ids = await readProcessIds(owned.child);
    cleanupPids.add(ids.parentPid);
    cleanupPids.add(ids.childPid);

    const runnerGroup = processGroupId(process.pid);
    const parentGroup = processGroupId(ids.parentPid);
    const childGroup = processGroupId(ids.childPid);
    expect(parentGroup).toBe(owned.groupId);
    expect(parentGroup).not.toBe(runnerGroup);
    expect(childGroup).toBe(parentGroup);
    expect(owned.groupId).toBe(owned.child.pid);

    await controller.stop(owned);
    await waitForStopped(ids.parentPid);
    await waitForStopped(ids.childPid);
  });

  it('reaps the owned group when Electron loses the launcher status channel', async () => {
    const controller = createProcessTreeController();
    const owned = await controller.spawn(process.execPath, [fixture], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const ids = await readProcessIds(owned.child);
    cleanupPids.add(ids.parentPid);
    cleanupPids.add(ids.childPid);

    owned.child.stdio[4]?.destroy();

    await owned.closeTracker.closePromise;
    await waitForStopped(ids.parentPid);
    await waitForStopped(ids.childPid);
  });

  it('reaps a descendant before a normally exited stage can complete', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-process-success-'));
    cleanupDirectories.add(directory);
    const idsPath = join(directory, 'process-ids.json');
    const job = createTranscriptionJob({ processTree: createProcessTreeController() });
    const result = job.run({
      transcription: {
        command: process.execPath,
        args: [fixture],
        options: {
          env: {
            ...process.env,
            AUDIOBASH_EXIT_AFTER_SPAWN: '1',
            AUDIOBASH_PROCESS_IDS_PATH: idsPath,
          },
        },
      },
    });
    const ids = await waitForProcessIds(idsPath);

    await expect(result).resolves.toEqual({ stdout: `${JSON.stringify(ids)}\n` });
    await waitForStopped(ids.parentPid);
    await waitForStopped(ids.childPid);
  });

  it('settles the group when a descendant inherits the parent output pipes', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-process-inherited-pipes-'));
    cleanupDirectories.add(directory);
    const idsPath = join(directory, 'process-ids.json');
    const job = createTranscriptionJob({ processTree: createProcessTreeController() });
    const result = job.run({
      transcription: {
        command: process.execPath,
        args: [fixture],
        options: {
          env: {
            ...process.env,
            AUDIOBASH_CHILD_INHERITS_STDIO: '1',
            AUDIOBASH_EXIT_AFTER_SPAWN: '1',
            AUDIOBASH_PROCESS_IDS_PATH: idsPath,
          },
        },
      },
    });
    const ids = await waitForProcessIds(idsPath);

    await expect(result).resolves.toEqual({ stdout: `${JSON.stringify(ids)}\n` });
    await waitForStopped(ids.parentPid);
    await waitForStopped(ids.childPid);
  });

  it('does not start the target before it rejects a non-isolated launcher', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-process-non-isolated-'));
    cleanupDirectories.add(directory);
    const idsPath = join(directory, 'process-ids.json');
    const lookup = Promise.withResolvers<number>();
    const controller = createProcessTreeController({
      getProcessGroupId: () => lookup.promise,
    });
    const spawning = controller.spawn(process.execPath, [fixture], {
      env: { ...process.env, AUDIOBASH_PROCESS_IDS_PATH: idsPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const rejection = expect(spawning).rejects.toMatchObject({
      code: 'PROCESS_GROUP_NOT_ISOLATED',
    });
    lookup.resolve(77);
    await rejection;
    expect(existsSync(idsPath)).toBe(false);
  });

  it('reaps a descendant before it reports a nonzero stage exit', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-process-failure-'));
    cleanupDirectories.add(directory);
    const idsPath = join(directory, 'process-ids.json');
    const job = createTranscriptionJob({ processTree: createProcessTreeController() });
    const result = job.run({
      transcription: {
        command: process.execPath,
        args: [fixture],
        options: {
          env: {
            ...process.env,
            AUDIOBASH_EXIT_AFTER_SPAWN: '1',
            AUDIOBASH_EXIT_CODE: '9',
            AUDIOBASH_PROCESS_IDS_PATH: idsPath,
          },
        },
      },
    });
    const rejection = expect(result).rejects.toMatchObject({
      code: 'TRANSCRIPTION_PROCESS_FAILED',
    });
    const ids = await waitForProcessIds(idsPath);

    await rejection;
    await waitForStopped(ids.parentPid);
    await waitForStopped(ids.childPid);
  });

  it('does not start the target when the runtime ownership lookup fails', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-process-proof-failure-'));
    cleanupDirectories.add(directory);
    const idsPath = join(directory, 'process-ids.json');
    const lookup = Promise.withResolvers<number>();
    const controller = createProcessTreeController({
      getProcessGroupId: () => lookup.promise,
    });
    const spawning = controller.spawn(process.execPath, [fixture], {
      env: { ...process.env, AUDIOBASH_PROCESS_IDS_PATH: idsPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const rejection = expect(spawning).rejects.toMatchObject({
      code: 'PROCESS_GROUP_PROOF_FAILED',
    });
    lookup.reject(new Error('ps unavailable'));
    await rejection;
    expect(existsSync(idsPath)).toBe(false);
  });

  it('runs repeated short commands after process-group proof', async () => {
    for (let run = 0; run < 20; run += 1) {
      const job = createTranscriptionJob({ processTree: createProcessTreeController() });
      await expect(
        job.run({ transcription: { command: '/usr/bin/true', args: [] } }),
      ).resolves.toEqual({ stdout: '' });
    }
  });

  it('uses SIGKILL after a real process group ignores SIGTERM', async () => {
    const controller = createProcessTreeController();
    const owned = await controller.spawn(process.execPath, [fixture], {
      env: { ...process.env, AUDIOBASH_IGNORE_SIGTERM: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const ids = await readProcessIds(owned.child);
    cleanupPids.add(ids.parentPid);
    cleanupPids.add(ids.childPid);

    const startedAt = Date.now();
    await expect(controller.stop(owned)).resolves.toEqual({ forced: true });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(2900);
    await waitForStopped(ids.parentPid);
    await waitForStopped(ids.childPid);
  });

  it('proves and settles separate process groups for both transcription stages', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-process-stages-'));
    cleanupDirectories.add(directory);
    const conversionIdsPath = join(directory, 'conversion-ids.json');
    const transcriptionIdsPath = join(directory, 'transcription-ids.json');
    const job = createTranscriptionJob({ processTree: createProcessTreeController() });
    const result = job.run({
      conversion: {
        command: process.execPath,
        args: [fixture],
        options: {
          env: {
            ...process.env,
            AUDIOBASH_EXIT_AFTER_SPAWN: '1',
            AUDIOBASH_PROCESS_IDS_PATH: conversionIdsPath,
          },
        },
      },
      transcription: {
        command: process.execPath,
        args: [fixture],
        options: {
          env: {
            ...process.env,
            AUDIOBASH_EXIT_AFTER_SPAWN: '1',
            AUDIOBASH_PROCESS_IDS_PATH: transcriptionIdsPath,
          },
        },
      },
    });
    const conversionIds = await waitForProcessIds(conversionIdsPath);
    const transcriptionIds = await waitForProcessIds(transcriptionIdsPath);

    expect(conversionIds.parentPid).not.toBe(transcriptionIds.parentPid);
    await expect(result).resolves.toEqual({ stdout: `${JSON.stringify(transcriptionIds)}\n` });
    for (const ids of [conversionIds, transcriptionIds]) {
      await waitForStopped(ids.parentPid);
      await waitForStopped(ids.childPid);
    }
  });

  it.each([
    ['timeout', 'TRANSCRIPTION_TIMEOUT'],
    ['cancel', 'TRANSCRIPTION_CANCELLED'],
    ['shutdown', 'TRANSCRIPTION_SHUTDOWN'],
  ] as const)('reaps the real transcription tree after %s', async (trigger, errorCode) => {
    const directory = mkdtempSync(join(tmpdir(), 'audiobash-process-job-'));
    cleanupDirectories.add(directory);
    const idsPath = join(directory, 'process-ids.json');
    const job = createTranscriptionJob({
      processTree: createProcessTreeController(),
      timeoutMs: trigger === 'timeout' ? 1000 : 10_000,
    });
    const result = job.run({
      transcription: {
        command: process.execPath,
        args: [fixture],
        options: {
          env: { ...process.env, AUDIOBASH_PROCESS_IDS_PATH: idsPath },
        },
      },
    });
    const ids = await waitForProcessIds(idsPath);

    if (trigger === 'cancel') await job.cancel();
    if (trigger === 'shutdown') await job.shutdown();
    await expect(result).rejects.toMatchObject({ code: errorCode });
    await waitForStopped(ids.parentPid);
    await waitForStopped(ids.childPid);
  });
});
