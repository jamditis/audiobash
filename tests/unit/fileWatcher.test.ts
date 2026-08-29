// @vitest-environment node

import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  lstatSync,
  promises as fsPromises,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fileWatcherModule from '../../electron/fileWatcher.cjs';

interface FileChange {
  filepath: string;
  watcherId: string;
}

interface FileWatchError extends Error {
  code: string;
  filepath: string;
  watcherId: string;
}

type WatchListener = (eventType: string, filename: Buffer | string | null) => void;

interface TestNativeWatcher {
  close: ReturnType<typeof vi.fn>;
  emitError: (error: Error) => void;
  on: (event: string, listener: (error: Error) => void) => TestNativeWatcher;
}

interface FileWatcherManager {
  closeAll(): void;
  unwatchFile(watcherId: string): { filepath: string; watcherId: string } | undefined;
  watchFile(filepath: string): Promise<string>;
}

interface FileWatcherModule {
  createFileWatcherManager(options: {
    onChange: (change: FileChange) => void;
    onError: (error: FileWatchError) => void;
    realpath?: typeof fsPromises.realpath;
    stat?: typeof fsPromises.stat;
    watch?: (
      filepath: string,
      options: { persistent: boolean },
      listener: WatchListener,
    ) => TestNativeWatcher;
  }): FileWatcherManager;
}

const { createFileWatcherManager } = fileWatcherModule as unknown as FileWatcherModule;

const fixtureDirectories: string[] = [];
const managers: FileWatcherManager[] = [];

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createImmediateStat(): typeof fsPromises.stat {
  return (async (filepath) =>
    statSync(filepath, { bigint: true })) as unknown as typeof fsPromises.stat;
}

function createImmediateRealpath(): typeof fsPromises.realpath {
  return (async (filepath) => realpathSync(filepath)) as unknown as typeof fsPromises.realpath;
}

function createWatchHarness(): {
  emit(index: number, eventType: string, filename: Buffer | string | null): void;
  nativeWatchers: TestNativeWatcher[];
  watch: (
    filepath: string,
    options: { persistent: boolean },
    listener: WatchListener,
  ) => TestNativeWatcher;
} {
  const listeners: WatchListener[] = [];
  const nativeWatchers: TestNativeWatcher[] = [];
  const watch = vi.fn(
    (
      _filepath: string,
      _options: { persistent: boolean },
      listener: WatchListener,
    ): TestNativeWatcher => {
      const errorListeners: Array<(error: Error) => void> = [];
      const nativeWatcher: TestNativeWatcher = {
        close: vi.fn(),
        emitError(error) {
          for (const errorListener of errorListeners) errorListener(error);
        },
        on(event, errorListener) {
          if (event === 'error') errorListeners.push(errorListener);
          return nativeWatcher;
        },
      };
      listeners.push(listener);
      nativeWatchers.push(nativeWatcher);
      return nativeWatcher;
    },
  );

  return {
    emit(index, eventType, filename) {
      listeners[index](eventType, filename);
    },
    nativeWatchers,
    watch,
  };
}

function createFixture(): { directory: string; filepath: string } {
  const directory = mkdtempSync(join(tmpdir(), 'audiobash-file-watcher-'));
  const filepath = join(directory, 'preview.html');
  writeFileSync(filepath, 'original');
  fixtureDirectories.push(directory);
  return { directory, filepath };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  for (const manager of managers.splice(0)) {
    manager.closeAll();
  }
  for (const directory of fixtureDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('preview file watcher', () => {
  it('emits one refresh containing the final bytes after an in-place write', async () => {
    const { filepath } = createFixture();
    const savedValues: string[] = [];
    const manager = createFileWatcherManager({
      onChange: ({ filepath: changedFilepath }) => {
        savedValues.push(readFileSync(changedFilepath, 'utf8'));
      },
      onError: vi.fn(),
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    writeFileSync(filepath, 'in-place-save');

    await vi.waitFor(() => expect(savedValues).toEqual(['in-place-save']), { timeout: 5000 });
  });

  it('survives three atomic replacements and emits one refresh for each saved value', async () => {
    vi.useFakeTimers();
    const { directory, filepath } = createFixture();
    const savedValues: string[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: ({ filepath: changedFilepath }) => {
        savedValues.push(readFileSync(changedFilepath, 'utf8'));
      },
      onError: vi.fn(),
      realpath: createImmediateRealpath(),
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    for (const [index, value] of ['atomic-1', 'atomic-2', 'atomic-3'].entries()) {
      const temporaryFilepath = join(directory, `preview-${index}.tmp`);
      writeFileSync(temporaryFilepath, value);
      renameSync(temporaryFilepath, filepath);
      harness.emit(0, 'rename', 'preview.html');
      await vi.runAllTimersAsync();
      expect(savedValues).toHaveLength(index + 1);
    }

    expect(savedValues).toEqual(['atomic-1', 'atomic-2', 'atomic-3']);
  });

  it.runIf(process.platform === 'darwin')(
    'matches the canonical filename on a case-insensitive macOS volume',
    async ({ skip }) => {
      vi.useFakeTimers();
      const { directory, filepath } = createFixture();
      const caseVariantPath = join(directory, 'PREVIEW.HTML');
      if (!existsSync(caseVariantPath)) {
        skip();
        return;
      }
      const savedValues: string[] = [];
      const harness = createWatchHarness();
      const manager = createFileWatcherManager({
        onChange: ({ filepath: changedFilepath }) => {
          savedValues.push(readFileSync(changedFilepath, 'utf8'));
        },
        onError: vi.fn(),
        realpath: createImmediateRealpath(),
        stat: createImmediateStat(),
        watch: harness.watch,
      });
      managers.push(manager);
      await manager.watchFile(caseVariantPath);

      writeFileSync(filepath, 'case-variant-save');
      harness.emit(0, 'change', 'preview.html');
      await vi.runAllTimersAsync();

      expect(savedValues).toEqual(['case-variant-save']);
    },
  );

  it('uses the canonical filename returned by the filesystem', async () => {
    vi.useFakeTimers();
    const { directory, filepath } = createFixture();
    const changes: FileChange[] = [];
    const harness = createWatchHarness();
    const realpath = vi.fn(async (target: Parameters<typeof fsPromises.realpath>[0]) =>
      target === filepath ? join(directory, 'Preview.HTML') : String(target),
    ) as unknown as typeof fsPromises.realpath;
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: vi.fn(),
      realpath,
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    writeFileSync(filepath, 'canonical-name-save');
    harness.emit(0, 'change', 'Preview.HTML');
    await vi.advanceTimersByTimeAsync(400);

    expect(changes).toHaveLength(1);
  });

  it.runIf(process.platform !== 'win32')(
    'watches the canonical target when the requested file is a symlink',
    async () => {
      const { directory } = createFixture();
      const previewDirectory = join(directory, 'preview');
      const buildDirectory = join(directory, 'build');
      mkdirSync(previewDirectory);
      mkdirSync(buildDirectory);
      const targetFilepath = join(buildDirectory, 'index.html');
      const symlinkFilepath = join(previewDirectory, 'preview.html');
      writeFileSync(targetFilepath, 'symlink-original');
      symlinkSync(targetFilepath, symlinkFilepath);
      const savedValues: string[] = [];
      const manager = createFileWatcherManager({
        onChange: ({ filepath: changedFilepath }) => {
          savedValues.push(readFileSync(changedFilepath, 'utf8'));
        },
        onError: vi.fn(),
      });
      managers.push(manager);
      await manager.watchFile(symlinkFilepath);

      writeFileSync(targetFilepath, 'symlink-save');

      await vi.waitFor(() => expect(savedValues).toEqual(['symlink-save']), { timeout: 5000 });
    },
  );

  it.runIf(process.platform !== 'win32')(
    'publishes one conservative refresh when a cross-directory symlink starts',
    async () => {
      const { directory } = createFixture();
      const previewDirectory = join(directory, 'preview-unchanged');
      const buildDirectory = join(directory, 'build-unchanged');
      mkdirSync(previewDirectory);
      mkdirSync(buildDirectory);
      const targetFilepath = join(buildDirectory, 'index.html');
      const symlinkFilepath = join(previewDirectory, 'preview.html');
      writeFileSync(targetFilepath, 'symlink-original');
      symlinkSync(targetFilepath, symlinkFilepath);
      const savedValues: string[] = [];
      const manager = createFileWatcherManager({
        onChange: ({ filepath: changedFilepath }) => {
          savedValues.push(readFileSync(changedFilepath, 'utf8'));
        },
        onError: vi.fn(),
      });
      managers.push(manager);

      await manager.watchFile(symlinkFilepath);
      await delay(800);

      expect(savedValues).toEqual(['symlink-original']);
    },
  );

  it.runIf(process.platform !== 'win32')(
    'survives three atomic replacements made through a cross-directory symlink path',
    async () => {
      const { directory } = createFixture();
      const previewDirectory = join(directory, 'preview-replacements');
      const buildDirectory = join(directory, 'build-replacements');
      mkdirSync(previewDirectory);
      mkdirSync(buildDirectory);
      const targetFilepath = join(buildDirectory, 'index.html');
      const symlinkFilepath = join(previewDirectory, 'preview.html');
      writeFileSync(targetFilepath, 'symlink-original');
      symlinkSync(targetFilepath, symlinkFilepath);
      const savedValues: string[] = [];
      const manager = createFileWatcherManager({
        onChange: ({ filepath: changedFilepath }) => {
          savedValues.push(readFileSync(changedFilepath, 'utf8'));
        },
        onError: vi.fn(),
      });
      managers.push(manager);
      await manager.watchFile(symlinkFilepath);
      await delay(800);
      savedValues.length = 0;

      for (const [index, value] of [
        'symlink-atomic-1',
        'symlink-atomic-2',
        'symlink-atomic-3',
      ].entries()) {
        const temporaryFilepath = join(buildDirectory, `index-${index}.tmp`);
        writeFileSync(temporaryFilepath, value);
        renameSync(temporaryFilepath, targetFilepath);
        await vi.waitFor(() => expect(savedValues).toHaveLength(index + 1), { timeout: 5000 });
        expect(lstatSync(symlinkFilepath).isSymbolicLink()).toBe(true);
      }

      expect(savedValues).toEqual(['symlink-atomic-1', 'symlink-atomic-2', 'symlink-atomic-3']);
    },
  );

  it.runIf(process.platform !== 'win32')(
    'moves the canonical watcher when a symlink is atomically retargeted',
    async () => {
      const { directory } = createFixture();
      const previewDirectory = join(directory, 'preview-retarget');
      const firstBuildDirectory = join(directory, 'build-retarget-a');
      const secondBuildDirectory = join(directory, 'build-retarget-b');
      mkdirSync(previewDirectory);
      mkdirSync(firstBuildDirectory);
      mkdirSync(secondBuildDirectory);
      const firstTarget = join(firstBuildDirectory, 'index.html');
      const secondTarget = join(secondBuildDirectory, 'index.html');
      const symlinkFilepath = join(previewDirectory, 'preview.html');
      writeFileSync(firstTarget, 'target-a');
      writeFileSync(secondTarget, 'target-b');
      symlinkSync(firstTarget, symlinkFilepath);
      const savedValues: string[] = [];
      const manager = createFileWatcherManager({
        onChange: ({ filepath: changedFilepath }) => {
          savedValues.push(readFileSync(changedFilepath, 'utf8'));
        },
        onError: vi.fn(),
      });
      managers.push(manager);
      await manager.watchFile(symlinkFilepath);
      await delay(800);
      savedValues.length = 0;

      const replacementSymlink = join(previewDirectory, 'replacement-link');
      symlinkSync(secondTarget, replacementSymlink);
      renameSync(replacementSymlink, symlinkFilepath);
      await vi.waitFor(() => expect(savedValues).toEqual(['target-b']), { timeout: 5000 });

      writeFileSync(secondTarget, 'target-b-updated');
      await vi.waitFor(() => expect(savedValues).toEqual(['target-b', 'target-b-updated']), {
        timeout: 5000,
      });

      writeFileSync(firstTarget, 'target-a-stale');
      await delay(800);
      expect(savedValues).toEqual(['target-b', 'target-b-updated']);
    },
  );

  it.runIf(process.platform !== 'win32')(
    'reconciles a save while startup switches to a symlink target directory',
    async () => {
      vi.useFakeTimers();
      const { directory } = createFixture();
      const previewDirectory = join(directory, 'preview-startup');
      const buildDirectory = join(directory, 'build-startup');
      mkdirSync(previewDirectory);
      mkdirSync(buildDirectory);
      const targetFilepath = join(buildDirectory, 'index.html');
      const symlinkFilepath = join(previewDirectory, 'preview.html');
      writeFileSync(targetFilepath, 'startup-original');
      symlinkSync(targetFilepath, symlinkFilepath);
      const initialStats = statSync(symlinkFilepath, { bigint: true });
      let resolveCanonicalFilepath: ((value: string) => void) | undefined;
      const canonicalFilepathPromise = new Promise<string>((resolve) => {
        resolveCanonicalFilepath = resolve;
      });
      const realpath = vi.fn((target: Parameters<typeof fsPromises.realpath>[0]) =>
        target === symlinkFilepath ? canonicalFilepathPromise : Promise.resolve(String(target)),
      ) as unknown as typeof fsPromises.realpath;
      const stat = vi
        .fn()
        .mockResolvedValueOnce(initialStats)
        .mockImplementation(async () =>
          statSync(symlinkFilepath, { bigint: true }),
        ) as unknown as typeof fsPromises.stat;
      const changes: FileChange[] = [];
      const harness = createWatchHarness();
      const manager = createFileWatcherManager({
        onChange: (change) => changes.push(change),
        onError: vi.fn(),
        realpath,
        stat,
        watch: harness.watch,
      });
      managers.push(manager);

      const watchPromise = manager.watchFile(symlinkFilepath);
      await Promise.resolve();
      writeFileSync(targetFilepath, 'saved-during-symlink-startup');
      resolveCanonicalFilepath?.(targetFilepath);
      await watchPromise;
      await vi.advanceTimersByTimeAsync(400);

      expect(harness.watch).toHaveBeenNthCalledWith(
        2,
        buildDirectory,
        { persistent: false },
        expect.any(Function),
      );
      expect(changes).toHaveLength(1);
    },
  );

  it('does not refresh when another file in the watched directory changes', async () => {
    const { directory, filepath } = createFixture();
    const changes: FileChange[] = [];
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: vi.fn(),
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    const unrelatedTemporaryPath = join(directory, 'notes.tmp');
    writeFileSync(unrelatedTemporaryPath, 'unrelated');
    renameSync(unrelatedTemporaryPath, join(directory, 'notes.txt'));
    await delay(800);
    expect(changes).toEqual([]);

    writeFileSync(filepath, 'target-save');
    await vi.waitFor(() => expect(changes).toHaveLength(1), { timeout: 5000 });
  });

  it('recovers after the target is deleted and recreated', async () => {
    const { filepath } = createFixture();
    const savedValues: string[] = [];
    const manager = createFileWatcherManager({
      onChange: ({ filepath: changedFilepath }) => {
        savedValues.push(readFileSync(changedFilepath, 'utf8'));
      },
      onError: vi.fn(),
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    unlinkSync(filepath);
    await delay(450);
    writeFileSync(filepath, 'recreated');
    await vi.waitFor(() => expect(savedValues).toEqual(['recreated']), { timeout: 5000 });

    writeFileSync(filepath, 'after-recreate');
    await vi.waitFor(() => expect(savedValues).toEqual(['recreated', 'after-recreate']), {
      timeout: 5000,
    });
  });
});

describe('preview file watcher state machine', () => {
  it('attaches the parent watcher before initial metadata can settle', async () => {
    vi.useFakeTimers();
    const { filepath } = createFixture();
    type FileStats = ReturnType<typeof statSync>;
    let resolveInitialStat: ((stats: FileStats) => void) | undefined;
    const initialStatPromise = new Promise<FileStats>((resolve) => {
      resolveInitialStat = resolve;
    });
    const stat = vi
      .fn(async (target: Parameters<typeof fsPromises.stat>[0]) =>
        statSync(target, { bigint: true }),
      )
      .mockImplementationOnce(() => initialStatPromise) as unknown as typeof fsPromises.stat;
    const harness = createWatchHarness();
    const changes: FileChange[] = [];
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: vi.fn(),
      realpath: createImmediateRealpath(),
      stat,
      watch: harness.watch,
    });
    managers.push(manager);

    const watchPromise = manager.watchFile(filepath);
    await Promise.resolve();
    const callsBeforeInitialStat = vi.mocked(harness.watch).mock.calls.length;
    if (callsBeforeInitialStat === 1) {
      writeFileSync(filepath, 'saved-during-initialization');
      harness.emit(0, 'rename', 'preview.html');
    }
    resolveInitialStat?.(statSync(filepath, { bigint: true }));
    await watchPromise;
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(100);

    expect(callsBeforeInitialStat).toBe(1);
    expect(harness.watch).toHaveBeenCalledWith(
      dirname(filepath),
      { persistent: false },
      expect.any(Function),
    );
    expect(changes).toHaveLength(1);
  });

  it('ignores a known unrelated filename during ordinary startup', async () => {
    vi.useFakeTimers();
    const { filepath } = createFixture();
    const initialStats = statSync(filepath, { bigint: true });
    let resolveInitialStat: ((stats: typeof initialStats) => void) | undefined;
    const initialStatPromise = new Promise<typeof initialStats>((resolve) => {
      resolveInitialStat = resolve;
    });
    const stat = vi.fn(() => initialStatPromise) as unknown as typeof fsPromises.stat;
    const changes: FileChange[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: vi.fn(),
      stat,
      watch: harness.watch,
    });
    managers.push(manager);

    const watchPromise = manager.watchFile(filepath);
    await Promise.resolve();
    harness.emit(0, 'change', 'notes.txt');
    resolveInitialStat?.(initialStats);
    await watchPromise;
    await vi.advanceTimersByTimeAsync(400);

    expect(changes).toEqual([]);
  });

  it('reports a change callback failure without an unhandled rejection', async () => {
    vi.useFakeTimers();
    const { filepath } = createFixture();
    const errors: FileWatchError[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: () => {
        throw new Error('renderer unavailable');
      },
      onError: (error) => errors.push(error),
      realpath: createImmediateRealpath(),
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    writeFileSync(filepath, 'callback-failure');
    harness.emit(0, 'change', 'preview.html');
    await vi.advanceTimersByTimeAsync(400);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: 'FILE_WATCH_CHANGE_FAILED',
      filepath,
    });
    expect(errors[0].cause).toMatchObject({ message: 'renderer unavailable' });
  });

  it('contains a failure from the error callback', async () => {
    vi.useFakeTimers();
    const { filepath } = createFixture();
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: () => {
        throw new Error('renderer unavailable');
      },
      onError: () => {
        throw new Error('logger unavailable');
      },
      realpath: createImmediateRealpath(),
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    writeFileSync(filepath, 'nested-callback-failure');
    harness.emit(0, 'change', 'preview.html');

    await vi.advanceTimersByTimeAsync(400);
  });

  it('replaces a failed native watcher and continues refreshing', async () => {
    vi.useFakeTimers();
    const { filepath } = createFixture();
    const changes: FileChange[] = [];
    const errors: FileWatchError[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
      realpath: createImmediateRealpath(),
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    harness.nativeWatchers[0].emitError(new Error('native failure'));
    harness.nativeWatchers[0].emitError(new Error('duplicate failure'));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'FILE_WATCH_NATIVE_ERROR', filepath });
    expect(harness.nativeWatchers[0].close).toHaveBeenCalledTimes(1);

    writeFileSync(filepath, 'after-native-recovery');
    harness.emit(1, 'change', 'preview.html');
    await vi.advanceTimersByTimeAsync(400);
    expect(changes).toHaveLength(1);

    manager.closeAll();
    expect(harness.nativeWatchers[0].close).toHaveBeenCalledTimes(1);
    expect(harness.nativeWatchers[1].close).toHaveBeenCalledTimes(1);
  });

  it('owns and closes both native watchers for a cross-directory symlink', async () => {
    vi.useFakeTimers();
    const { directory, filepath } = createFixture();
    const canonicalDirectory = join(directory, 'canonical');
    mkdirSync(canonicalDirectory);
    const canonicalFilepath = join(canonicalDirectory, 'index.html');
    const harness = createWatchHarness();
    const realpath = vi.fn(async (target: Parameters<typeof fsPromises.realpath>[0]) =>
      target === filepath ? canonicalFilepath : String(target),
    ) as unknown as typeof fsPromises.realpath;
    const manager = createFileWatcherManager({
      onChange: vi.fn(),
      onError: vi.fn(),
      realpath,
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);

    await manager.watchFile(filepath);

    expect(harness.watch).toHaveBeenCalledTimes(2);
    expect(harness.nativeWatchers.every((watcher) => !watcher.close.mock.calls.length)).toBe(true);

    manager.closeAll();

    expect(harness.nativeWatchers[0].close).toHaveBeenCalledTimes(1);
    expect(harness.nativeWatchers[1].close).toHaveBeenCalledTimes(1);
  });

  it('replaces only the failed slot in a dual-directory watcher', async () => {
    vi.useFakeTimers();
    const { directory, filepath } = createFixture();
    const canonicalDirectory = join(directory, 'canonical-errors');
    mkdirSync(canonicalDirectory);
    const canonicalFilepath = join(canonicalDirectory, 'index.html');
    const harness = createWatchHarness();
    const errors: FileWatchError[] = [];
    const realpath = vi.fn(async (target: Parameters<typeof fsPromises.realpath>[0]) =>
      target === filepath ? canonicalFilepath : String(target),
    ) as unknown as typeof fsPromises.realpath;
    const manager = createFileWatcherManager({
      onChange: vi.fn(),
      onError: (error) => errors.push(error),
      realpath,
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    harness.nativeWatchers[1].emitError(new Error('canonical slot failed'));
    expect(harness.nativeWatchers[0].close).not.toHaveBeenCalled();
    expect(harness.nativeWatchers[1].close).toHaveBeenCalledTimes(1);
    expect(harness.nativeWatchers[2].close).not.toHaveBeenCalled();

    harness.nativeWatchers[0].emitError(new Error('requested slot failed'));
    expect(harness.nativeWatchers[0].close).toHaveBeenCalledTimes(1);
    expect(harness.nativeWatchers[2].close).not.toHaveBeenCalled();
    expect(harness.nativeWatchers[3].close).not.toHaveBeenCalled();
    expect(errors.map((error) => error.code)).toEqual([
      'FILE_WATCH_NATIVE_ERROR',
      'FILE_WATCH_NATIVE_ERROR',
    ]);

    manager.closeAll();
    expect(harness.nativeWatchers[2].close).toHaveBeenCalledTimes(1);
    expect(harness.nativeWatchers[3].close).toHaveBeenCalledTimes(1);
  });

  it('refreshes symlink topology after the requested watcher recovers', async () => {
    vi.useFakeTimers();
    const { directory, filepath } = createFixture();
    const firstCanonicalDirectory = join(directory, 'canonical-recovery-a');
    const secondCanonicalDirectory = join(directory, 'canonical-recovery-b');
    mkdirSync(firstCanonicalDirectory);
    mkdirSync(secondCanonicalDirectory);
    let canonicalFilepath = join(firstCanonicalDirectory, 'index.html');
    const harness = createWatchHarness();
    const realpath = vi.fn(async (target: Parameters<typeof fsPromises.realpath>[0]) =>
      target === filepath ? canonicalFilepath : String(target),
    ) as unknown as typeof fsPromises.realpath;
    const manager = createFileWatcherManager({
      onChange: vi.fn(),
      onError: vi.fn(),
      realpath,
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    harness.nativeWatchers[0].emitError(new Error('requested slot failed'));
    canonicalFilepath = join(secondCanonicalDirectory, 'index.html');
    await vi.advanceTimersByTimeAsync(300);

    expect(harness.watch).toHaveBeenCalledWith(
      secondCanonicalDirectory,
      { persistent: false },
      expect.any(Function),
    );
    expect(harness.nativeWatchers[1].close).toHaveBeenCalledTimes(1);
  });

  it('stops after more than 20 native watcher failures within two seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { filepath } = createFixture();
    const errors: FileWatchError[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: vi.fn(),
      onError: (error) => errors.push(error),
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    for (let index = 0; index < 21; index += 1) {
      harness.nativeWatchers[index].emitError(new Error(`native failure ${index + 1}`));
    }

    expect(harness.nativeWatchers).toHaveLength(21);
    expect(errors).toHaveLength(22);
    expect(errors.at(-1)).toMatchObject({
      code: 'FILE_WATCH_NATIVE_RECOVERY_TIMEOUT',
      filepath,
    });
    for (const nativeWatcher of harness.nativeWatchers) {
      expect(nativeWatcher.close).toHaveBeenCalledTimes(1);
    }
  });

  it('uses a rolling two-second window for native watcher failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { filepath } = createFixture();
    const errors: FileWatchError[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: vi.fn(),
      onError: (error) => errors.push(error),
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    for (let index = 0; index < 10; index += 1) {
      harness.nativeWatchers[index].emitError(new Error(`first burst ${index + 1}`));
    }
    vi.setSystemTime(1500);
    for (let index = 0; index < 10; index += 1) {
      harness.nativeWatchers[index + 10].emitError(new Error(`second burst ${index + 1}`));
    }
    vi.setSystemTime(2001);
    harness.nativeWatchers[20].emitError(new Error('third burst 1'));
    expect(errors.at(-1)).toMatchObject({ code: 'FILE_WATCH_NATIVE_ERROR', filepath });

    vi.setSystemTime(2500);
    for (let index = 0; index < 10; index += 1) {
      harness.nativeWatchers[index + 21].emitError(new Error(`fourth burst ${index + 1}`));
    }

    expect(errors.at(-1)).toMatchObject({
      code: 'FILE_WATCH_NATIVE_RECOVERY_TIMEOUT',
      filepath,
    });
    expect(harness.nativeWatchers).toHaveLength(31);
  });

  it('expires native watcher failures outside the rolling window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { filepath } = createFixture();
    const changes: FileChange[] = [];
    const errors: FileWatchError[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
      realpath: createImmediateRealpath(),
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    for (let index = 0; index < 20; index += 1) {
      harness.nativeWatchers[index].emitError(new Error(`old failure ${index + 1}`));
    }
    vi.setSystemTime(2001);
    harness.nativeWatchers[20].emitError(new Error('new failure'));

    expect(errors).toHaveLength(21);
    expect(errors.at(-1)).toMatchObject({ code: 'FILE_WATCH_NATIVE_ERROR', filepath });

    writeFileSync(filepath, 'after-expired-failures');
    harness.emit(21, 'change', 'preview.html');
    await vi.advanceTimersByTimeAsync(400);
    expect(changes).toHaveLength(1);
  });

  it('closes cleanly when a failed native watcher cannot be replaced', async () => {
    vi.useFakeTimers();
    const { filepath } = createFixture();
    const errors: FileWatchError[] = [];
    const harness = createWatchHarness();
    const recoveryError = Object.assign(new Error('directory unavailable'), { code: 'ENOENT' });
    const watch = vi.fn((...arguments_: Parameters<typeof harness.watch>): TestNativeWatcher => {
      if (vi.mocked(watch).mock.calls.length === 1) {
        return harness.watch(...arguments_);
      }
      throw recoveryError;
    });
    const manager = createFileWatcherManager({
      onChange: vi.fn(),
      onError: (error) => errors.push(error),
      stat: createImmediateStat(),
      watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    harness.nativeWatchers[0].emitError(new Error('native failure'));

    expect(errors.map((error) => error.code)).toEqual([
      'FILE_WATCH_NATIVE_ERROR',
      'FILE_WATCH_NATIVE_RECOVERY_FAILED',
    ]);
    expect(errors[1].cause).toBe(recoveryError);
    expect(harness.nativeWatchers[0].close).toHaveBeenCalledTimes(1);
    expect(() => manager.closeAll()).not.toThrow();
  });

  it('reports a hard metadata failure and stops that recovery cycle', async () => {
    vi.useFakeTimers();
    const { filepath } = createFixture();
    const initialStats = statSync(filepath, { bigint: true });
    const statError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const stat = vi
      .fn()
      .mockResolvedValueOnce(initialStats)
      .mockRejectedValueOnce(statError) as unknown as typeof fsPromises.stat;
    const changes: FileChange[] = [];
    const errors: FileWatchError[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
      realpath: createImmediateRealpath(),
      stat,
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    harness.emit(0, 'change', 'preview.html');
    await vi.advanceTimersByTimeAsync(300);

    expect(changes).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: 'FILE_WATCH_STAT_FAILED', filepath });
    expect(errors[0].cause).toBe(statError);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes the native watcher when canonical path resolution fails', async () => {
    const { filepath } = createFixture();
    const realpathError = Object.assign(new Error('link loop'), { code: 'ELOOP' });
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: vi.fn(),
      onError: vi.fn(),
      realpath: vi.fn().mockRejectedValue(realpathError) as unknown as typeof fsPromises.realpath,
      watch: harness.watch,
    });
    managers.push(manager);

    await expect(manager.watchFile(filepath)).rejects.toBe(realpathError);
    expect(harness.nativeWatchers[0].close).toHaveBeenCalledTimes(1);
  });

  it('rejects with a typed cancellation when shutdown interrupts startup', async () => {
    const { filepath } = createFixture();
    const initialStats = statSync(filepath, { bigint: true });
    let resolveInitialStat: ((stats: typeof initialStats) => void) | undefined;
    const initialStatPromise = new Promise<typeof initialStats>((resolve) => {
      resolveInitialStat = resolve;
    });
    const stat = vi.fn(() => initialStatPromise) as unknown as typeof fsPromises.stat;
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: vi.fn(),
      onError: vi.fn(),
      stat,
      watch: harness.watch,
    });
    managers.push(manager);

    const watchPromise = manager.watchFile(filepath);
    const rejection = expect(watchPromise).rejects.toMatchObject({
      code: 'FILE_WATCH_STARTUP_CANCELLED',
      filepath,
    });
    await Promise.resolve();
    manager.closeAll();
    resolveInitialStat?.(initialStats);

    await rejection;
    expect(harness.nativeWatchers[0].close).toHaveBeenCalledTimes(1);
  });

  it('waits for two equal metadata samples before publishing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { filepath } = createFixture();
    const changes: FileChange[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: vi.fn(),
      realpath: createImmediateRealpath(),
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    writeFileSync(filepath, 'partial');
    harness.emit(0, 'change', 'preview.html');
    await vi.advanceTimersByTimeAsync(300);
    expect(changes).toEqual([]);

    writeFileSync(filepath, 'final-save-with-more-bytes');
    await vi.advanceTimersByTimeAsync(100);
    expect(changes).toEqual([]);
    await vi.advanceTimersByTimeAsync(99);
    expect(changes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(changes).toHaveLength(1);
  });

  it('coalesces an event storm and suppresses a delayed duplicate signal', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { filepath } = createFixture();
    const changes: FileChange[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: vi.fn(),
      realpath: createImmediateRealpath(),
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    writeFileSync(filepath, 'save-one');
    harness.emit(0, 'rename', 'preview.html');
    harness.emit(0, 'change', 'preview.html');
    harness.emit(0, 'rename', 'preview.html');
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(99);
    expect(changes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(changes).toHaveLength(1);

    harness.emit(0, 'change', 'preview.html');
    await vi.advanceTimersByTimeAsync(400);
    expect(changes).toHaveLength(1);

    writeFileSync(filepath, 'save-two-with-new-size');
    harness.emit(0, 'rename', 'preview.html');
    harness.emit(0, 'change', 'preview.html');
    await vi.advanceTimersByTimeAsync(400);
    expect(changes).toHaveLength(2);
  });

  it('reconciles a missing filename without publishing unchanged target metadata', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { filepath } = createFixture();
    const changes: FileChange[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: vi.fn(),
      stat: createImmediateStat(),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);

    harness.emit(0, 'rename', null);
    await vi.advanceTimersByTimeAsync(400);

    expect(changes).toEqual([]);
  });

  it('reports one bounded error after 20 missing-target checks and later recovers', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { filepath } = createFixture();
    const changes: FileChange[] = [];
    const errors: FileWatchError[] = [];
    const harness = createWatchHarness();
    const stat = vi.fn(async (target: Parameters<typeof fsPromises.stat>[0]) =>
      statSync(target, { bigint: true }),
    ) as unknown as typeof fsPromises.stat;
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
      realpath: createImmediateRealpath(),
      stat,
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(filepath);
    vi.mocked(stat).mockClear();

    unlinkSync(filepath);
    harness.emit(0, 'rename', 'preview.html');
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(1899);
    expect(errors).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(stat).toHaveBeenCalledTimes(20);
    expect(changes).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: 'FILE_WATCH_RECOVERY_TIMEOUT',
      filepath,
    });
    expect(errors[0].message).toContain('2 seconds');
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(stat).toHaveBeenCalledTimes(20);
    expect(errors).toHaveLength(1);

    writeFileSync(filepath, 'recovered');
    harness.emit(0, 'rename', 'preview.html');
    await vi.advanceTimersByTimeAsync(400);
    expect(changes).toHaveLength(1);
  });

  it('cancels a pending debounce when explicitly unwatched', async () => {
    vi.useFakeTimers();
    const { filepath } = createFixture();
    const changes: FileChange[] = [];
    const errors: FileWatchError[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
      watch: harness.watch,
    });
    managers.push(manager);
    const watcherId = await manager.watchFile(filepath);

    writeFileSync(filepath, 'pending-save');
    harness.emit(0, 'change', 'preview.html');
    expect(vi.getTimerCount()).toBe(1);
    expect(manager.unwatchFile(watcherId)).toEqual({ filepath, watcherId });

    expect(vi.getTimerCount()).toBe(0);
    await vi.runAllTimersAsync();
    expect(changes).toEqual([]);
    expect(errors).toEqual([]);
    expect(harness.nativeWatchers[0].close).toHaveBeenCalledTimes(1);
    expect(manager.unwatchFile(watcherId)).toBeUndefined();
  });

  it('drops an in-flight stat result after explicit unwatch', async () => {
    vi.useFakeTimers();
    const { filepath } = createFixture();
    const initialStats = statSync(filepath, { bigint: true });
    let resolveStat: ((stats: typeof initialStats) => void) | undefined;
    const deferredStats = new Promise<typeof initialStats>((resolve) => {
      resolveStat = resolve;
    });
    const stat = vi
      .fn()
      .mockResolvedValueOnce(initialStats)
      .mockImplementationOnce(() => deferredStats) as unknown as typeof fsPromises.stat;
    const changes: FileChange[] = [];
    const errors: FileWatchError[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
      stat,
      watch: harness.watch,
    });
    managers.push(manager);
    const watcherId = await manager.watchFile(filepath);

    writeFileSync(filepath, 'pending-stat');
    harness.emit(0, 'change', 'preview.html');
    await vi.advanceTimersByTimeAsync(300);
    manager.unwatchFile(watcherId);
    resolveStat?.(statSync(filepath, { bigint: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(changes).toEqual([]);
    expect(errors).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closeAll cancels every watcher and timer during shutdown', async () => {
    vi.useFakeTimers();
    const first = createFixture();
    const second = createFixture();
    const changes: FileChange[] = [];
    const errors: FileWatchError[] = [];
    const harness = createWatchHarness();
    const manager = createFileWatcherManager({
      onChange: (change) => changes.push(change),
      onError: (error) => errors.push(error),
      watch: harness.watch,
    });
    managers.push(manager);
    await manager.watchFile(first.filepath);
    await manager.watchFile(second.filepath);

    harness.emit(0, 'change', 'preview.html');
    harness.emit(1, 'change', 'preview.html');
    expect(vi.getTimerCount()).toBe(2);
    manager.closeAll();

    expect(vi.getTimerCount()).toBe(0);
    await vi.runAllTimersAsync();
    harness.emit(0, 'change', 'preview.html');
    harness.emit(1, 'change', 'preview.html');
    expect(changes).toEqual([]);
    expect(errors).toEqual([]);
    expect(harness.nativeWatchers[0].close).toHaveBeenCalledTimes(1);
    expect(harness.nativeWatchers[1].close).toHaveBeenCalledTimes(1);
    expect(() => manager.closeAll()).not.toThrow();
  });
});
