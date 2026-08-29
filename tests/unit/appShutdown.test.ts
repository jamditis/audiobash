// @vitest-environment node

import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createAppShutdownCoordinator } = require('../../electron/appShutdown.cjs') as {
  createAppShutdownCoordinator(options: Record<string, unknown>): {
    beforeQuit(event: { preventDefault(): void }): Promise<void> | undefined;
  };
};

describe('app shutdown coordinator', () => {
  it('prevents the first quit, coalesces cleanup, and re-enters quit only after cleanup', async () => {
    const cleanup = Promise.withResolvers<void>();
    const closeTranscriptions = vi.fn(() => cleanup.promise);
    const closeOtherResources = vi.fn();
    const quit = vi.fn();
    const coordinator = createAppShutdownCoordinator({
      closeTranscriptions,
      closeOtherResources,
      quit,
      logError: vi.fn(),
    });
    const firstEvent = { preventDefault: vi.fn() };
    const secondEvent = { preventDefault: vi.fn() };

    const first = coordinator.beforeQuit(firstEvent);
    const second = coordinator.beforeQuit(secondEvent);
    expect(firstEvent.preventDefault).toHaveBeenCalledOnce();
    expect(secondEvent.preventDefault).toHaveBeenCalledOnce();
    expect(closeTranscriptions).toHaveBeenCalledOnce();
    expect(closeOtherResources).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();

    cleanup.resolve();
    await Promise.all([first, second]);
    expect(closeOtherResources).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();

    const finalEvent = { preventDefault: vi.fn() };
    expect(coordinator.beforeQuit(finalEvent)).toBeUndefined();
    expect(finalEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('continues final quit after the bounded transcription deadline', async () => {
    vi.useFakeTimers();
    const logError = vi.fn();
    const closeOtherResources = vi.fn();
    const quit = vi.fn();
    const coordinator = createAppShutdownCoordinator({
      closeTranscriptions: () => new Promise(() => {}),
      closeOtherResources,
      quit,
      logError,
      timeoutMs: 6500,
    });

    const shutdown = coordinator.beforeQuit({ preventDefault: vi.fn() });
    await vi.advanceTimersByTimeAsync(6500);
    await shutdown;

    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'APP_SHUTDOWN_TIMEOUT' }),
    );
    expect(closeOtherResources).toHaveBeenCalledOnce();
    expect(quit).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it('continues final quit when other resource cleanup throws', async () => {
    const cleanupError = new Error('PTY cleanup failed');
    const logError = vi.fn();
    const quit = vi.fn();
    const coordinator = createAppShutdownCoordinator({
      closeTranscriptions: vi.fn(async () => undefined),
      closeOtherResources: vi.fn(() => {
        throw cleanupError;
      }),
      quit,
      logError,
    });

    await expect(coordinator.beforeQuit({ preventDefault: vi.fn() })).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(cleanupError);
    expect(quit).toHaveBeenCalledOnce();
  });
});
