// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { WhisperService } = require('../../electron/whisperService.cjs') as {
  WhisperService: new (options: Record<string, unknown>) => WhisperServiceInstance;
};

interface WhisperServiceInstance {
  activeJobs: Map<string, FakeJob>;
  activeRequests: Set<Promise<unknown>>;
  cancel(requestId: string): { cancelled: boolean; queued: boolean; error?: string };
  shutdown(): Promise<{ remainingJobs: number }>;
  transcribe(
    audioPath: string,
    request: { requestId: string; modelName: string },
  ): Promise<{ text: string; error?: string; errorCode?: string }>;
  whisperDir: string;
  whisperInstalled: boolean;
}

interface FakeJob {
  cancel: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
}

const fixtureDirectories: string[] = [];

function createFixture(): { audioPath: string; whisperDir: string } {
  const directory = mkdtempSync(join(tmpdir(), 'audiobash-whisper-service-'));
  const whisperDir = join(directory, 'whisper-cpp');
  mkdirSync(join(whisperDir, '1.5.5'), { recursive: true });
  writeFileSync(join(whisperDir, '1.5.5', 'main'), 'binary');
  writeFileSync(join(whisperDir, 'ggml-small.en.bin'), 'model');
  const audioPath = join(directory, 'audio.wav');
  writeFileSync(audioPath, 'audio');
  fixtureDirectories.push(directory);
  return { audioPath, whisperDir };
}

afterEach(() => {
  for (const directory of fixtureDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('Whisper service job registry', () => {
  it('cancels the exact active request and removes it only after the job settles', async () => {
    const fixture = createFixture();
    const runResult = Promise.withResolvers<{ stdout: string }>();
    const job: FakeJob = {
      cancel: vi.fn(() => {
        const error = Object.assign(new Error('Transcription cancelled'), {
          code: 'TRANSCRIPTION_CANCELLED',
        });
        runResult.reject(error);
        return Promise.resolve();
      }),
      run: vi.fn(() => runResult.promise),
      shutdown: vi.fn(() => Promise.resolve()),
    };
    const service = new WhisperService({
      createJob: vi.fn(() => job),
      processTree: {},
    });
    service.whisperDir = fixture.whisperDir;
    service.whisperInstalled = true;

    const transcription = service.transcribe(fixture.audioPath, {
      requestId: 'local-job-1',
      modelName: 'small.en',
    });
    await vi.waitFor(() => expect(service.activeJobs.has('local-job-1')).toBe(true));

    expect(service.cancel('local-job-1')).toEqual({ cancelled: true, queued: false });
    expect(job.cancel).toHaveBeenCalledOnce();
    expect(service.activeJobs.has('local-job-1')).toBe(true);

    await expect(transcription).resolves.toMatchObject({
      error: 'Transcription cancelled',
      errorCode: 'TRANSCRIPTION_CANCELLED',
    });
    expect(service.activeJobs.has('local-job-1')).toBe(false);
  });

  it('handles an active job cancellation cleanup rejection', async () => {
    const fixture = createFixture();
    const runResult = Promise.withResolvers<{ stdout: string }>();
    const cleanupError = Object.assign(new Error('Process tree 50231 remained'), {
      code: 'TRANSCRIPTION_CLEANUP_FAILED',
    });
    const job: FakeJob = {
      cancel: vi.fn(() => Promise.reject(cleanupError)),
      run: vi.fn(() => runResult.promise),
      shutdown: vi.fn(() => Promise.resolve()),
    };
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new WhisperService({
      createJob: vi.fn(() => job),
      processTree: {},
    });
    service.whisperDir = fixture.whisperDir;
    service.whisperInstalled = true;
    const transcription = service.transcribe(fixture.audioPath, {
      requestId: 'local-job-cleanup-error',
      modelName: 'small.en',
    });
    await vi.waitFor(() => expect(service.activeJobs.has('local-job-cleanup-error')).toBe(true));

    expect(service.cancel('local-job-cleanup-error')).toEqual({ cancelled: true, queued: false });
    await vi.waitFor(() =>
      expect(logError).toHaveBeenCalledWith(
        '[WhisperService] Cancellation cleanup failed:',
        cleanupError,
      ),
    );

    runResult.reject(cleanupError);
    await expect(transcription).resolves.toMatchObject({
      errorCode: 'TRANSCRIPTION_CLEANUP_FAILED',
    });
  });

  it('queues an early cancellation and does not start that request', async () => {
    const fixture = createFixture();
    const createJob = vi.fn();
    const service = new WhisperService({ createJob, processTree: {}, now: () => 1000 });
    service.whisperDir = fixture.whisperDir;
    service.whisperInstalled = true;

    expect(service.cancel('local-job-2')).toEqual({ cancelled: false, queued: true });
    await expect(
      service.transcribe(fixture.audioPath, {
        requestId: 'local-job-2',
        modelName: 'small.en',
      }),
    ).resolves.toMatchObject({ errorCode: 'TRANSCRIPTION_CANCELLED' });
    expect(createJob).not.toHaveBeenCalled();
  });

  it('rejects a missing request ID before it creates a job', async () => {
    const fixture = createFixture();
    const createJob = vi.fn();
    const service = new WhisperService({ createJob, processTree: {} });
    service.whisperDir = fixture.whisperDir;
    service.whisperInstalled = true;

    await expect(
      service.transcribe(fixture.audioPath, { modelName: 'small.en' } as never),
    ).resolves.toMatchObject({ error: 'Invalid local transcription request ID' });
    expect(createJob).not.toHaveBeenCalled();
  });

  it('waits for every active job during app shutdown', async () => {
    const fixture = createFixture();
    const shutdowns = [Promise.withResolvers<void>(), Promise.withResolvers<void>()];
    const runs = [
      Promise.withResolvers<{ stdout: string }>(),
      Promise.withResolvers<{ stdout: string }>(),
    ];
    let jobIndex = 0;
    const jobs = shutdowns.map((shutdown, index) => ({
      cancel: vi.fn(),
      run: vi.fn(() => runs[index].promise),
      shutdown: vi.fn(async () => {
        await shutdown.promise;
        runs[index].reject(
          Object.assign(new Error('Transcription stopped during app shutdown'), {
            code: 'TRANSCRIPTION_SHUTDOWN',
          }),
        );
      }),
    }));
    const service = new WhisperService({
      createJob: () => jobs[jobIndex++],
      processTree: {},
    });
    service.whisperDir = fixture.whisperDir;
    service.whisperInstalled = true;
    void service.transcribe(fixture.audioPath, {
      requestId: 'local-job-a',
      modelName: 'small.en',
    });
    void service.transcribe(fixture.audioPath, {
      requestId: 'local-job-b',
      modelName: 'small.en',
    });
    await vi.waitFor(() => expect(service.activeJobs.size).toBe(2));

    let settled = false;
    const shutdown = service.shutdown().finally(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(jobs.every((job) => job.shutdown.mock.calls.length === 1)).toBe(true);
    expect(settled).toBe(false);

    shutdowns[0].resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    shutdowns[1].resolve();
    await expect(shutdown).resolves.toEqual({ remainingJobs: 0 });
    expect(service.activeRequests.size).toBe(0);
    await expect(
      service.transcribe(fixture.audioPath, {
        requestId: 'local-job-after-shutdown',
        modelName: 'small.en',
      }),
    ).resolves.toMatchObject({ errorCode: 'TRANSCRIPTION_SHUTDOWN' });
  });

  it('cancels only the matching request when two jobs are active', async () => {
    const fixture = createFixture();
    const runs = [
      Promise.withResolvers<{ stdout: string }>(),
      Promise.withResolvers<{ stdout: string }>(),
    ];
    let jobIndex = 0;
    const jobs = runs.map((run) => ({
      cancel: vi.fn(() => {
        run.reject(Object.assign(new Error('cancelled'), { code: 'TRANSCRIPTION_CANCELLED' }));
        return Promise.resolve();
      }),
      run: vi.fn(() => run.promise),
      shutdown: vi.fn(async () => undefined),
    }));
    const service = new WhisperService({
      createJob: () => jobs[jobIndex++],
      processTree: {},
    });
    service.whisperDir = fixture.whisperDir;
    service.whisperInstalled = true;
    const first = service.transcribe(fixture.audioPath, {
      requestId: 'local-isolated-a',
      modelName: 'small.en',
    });
    const second = service.transcribe(fixture.audioPath, {
      requestId: 'local-isolated-b',
      modelName: 'small.en',
    });
    await vi.waitFor(() => expect(service.activeJobs.size).toBe(2));

    expect(service.cancel('local-isolated-a')).toEqual({ cancelled: true, queued: false });
    await expect(first).resolves.toMatchObject({ errorCode: 'TRANSCRIPTION_CANCELLED' });
    expect(jobs[0].cancel).toHaveBeenCalledOnce();
    expect(jobs[1].cancel).not.toHaveBeenCalled();
    expect(service.activeJobs.has('local-isolated-b')).toBe(true);

    runs[1].resolve({ stdout: 'second transcript' });
    await expect(second).resolves.toMatchObject({ text: 'second transcript' });
  });

  it('rejects a third direct service request while two jobs are active', async () => {
    const fixture = createFixture();
    const runs = [
      Promise.withResolvers<{ stdout: string }>(),
      Promise.withResolvers<{ stdout: string }>(),
    ];
    let jobIndex = 0;
    const createJob = vi.fn(() => ({
      cancel: vi.fn(),
      run: vi.fn(() => runs[jobIndex++].promise),
      shutdown: vi.fn(async () => undefined),
    }));
    const service = new WhisperService({ createJob, processTree: {} });
    service.whisperDir = fixture.whisperDir;
    service.whisperInstalled = true;
    const first = service.transcribe(fixture.audioPath, {
      requestId: 'local-cap-a',
      modelName: 'small.en',
    });
    const second = service.transcribe(fixture.audioPath, {
      requestId: 'local-cap-b',
      modelName: 'small.en',
    });
    await vi.waitFor(() => expect(service.activeJobs.size).toBe(2));

    await expect(
      service.transcribe(fixture.audioPath, {
        requestId: 'local-cap-c',
        modelName: 'small.en',
      }),
    ).resolves.toMatchObject({ errorCode: 'TRANSCRIPTION_BUSY' });
    expect(createJob).toHaveBeenCalledTimes(2);

    runs[0].resolve({ stdout: 'first' });
    runs[1].resolve({ stdout: 'second' });
    await Promise.all([first, second]);
  });

  it('waits for every request before it reports one job shutdown failure', async () => {
    const fixture = createFixture();
    const cleanupError = Object.assign(new Error('first tree remained'), {
      code: 'TRANSCRIPTION_CLEANUP_FAILED',
    });
    const secondShutdown = Promise.withResolvers<void>();
    const runs = [
      Promise.withResolvers<{ stdout: string }>(),
      Promise.withResolvers<{ stdout: string }>(),
    ];
    let jobIndex = 0;
    const jobs = [
      {
        cancel: vi.fn(),
        run: vi.fn(() => runs[0].promise),
        shutdown: vi.fn(() => {
          runs[0].reject(cleanupError);
          return Promise.reject(cleanupError);
        }),
      },
      {
        cancel: vi.fn(),
        run: vi.fn(() => runs[1].promise),
        shutdown: vi.fn(async () => {
          await secondShutdown.promise;
          runs[1].reject(Object.assign(new Error('shutdown'), { code: 'TRANSCRIPTION_SHUTDOWN' }));
        }),
      },
    ];
    const service = new WhisperService({
      createJob: () => jobs[jobIndex++],
      processTree: {},
    });
    service.whisperDir = fixture.whisperDir;
    service.whisperInstalled = true;
    void service.transcribe(fixture.audioPath, {
      requestId: 'local-shutdown-error-a',
      modelName: 'small.en',
    });
    void service.transcribe(fixture.audioPath, {
      requestId: 'local-shutdown-error-b',
      modelName: 'small.en',
    });
    await vi.waitFor(() => expect(service.activeJobs.size).toBe(2));

    let settled = false;
    const shutdown = service.shutdown().finally(() => {
      settled = true;
    });
    const rejection = expect(shutdown).rejects.toBe(cleanupError);
    await Promise.resolve();
    expect(settled).toBe(false);
    secondShutdown.resolve();

    await rejection;
    expect(service.activeJobs.size).toBe(0);
    expect(service.activeRequests.size).toBe(0);
  });
});
