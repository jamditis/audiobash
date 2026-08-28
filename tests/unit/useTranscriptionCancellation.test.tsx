import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useTranscriptionCancellation } from '../../src/hooks/useTranscriptionCancellation';

describe('useTranscriptionCancellation', () => {
  it('aborts a superseded request and keeps the replacement active', () => {
    const { result } = renderHook(() => useTranscriptionCancellation());
    let first!: AbortController;
    let second!: AbortController;

    act(() => {
      first = result.current.begin();
      second = result.current.begin();
    });

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(result.current.hasActive()).toBe(true);
  });

  it('does not let stale completion clear the active replacement', () => {
    const { result } = renderHook(() => useTranscriptionCancellation());
    let first!: AbortController;
    let second!: AbortController;

    act(() => {
      first = result.current.begin();
      second = result.current.begin();
      result.current.finish(first);
    });

    expect(result.current.hasActive()).toBe(true);
    expect(second.signal.aborted).toBe(false);
  });

  it('cancels the active request once', () => {
    const { result } = renderHook(() => useTranscriptionCancellation());
    let controller!: AbortController;
    let firstCancel!: boolean;
    let secondCancel!: boolean;

    act(() => {
      controller = result.current.begin();
      firstCancel = result.current.cancel();
      secondCancel = result.current.cancel();
    });

    expect(firstCancel).toBe(true);
    expect(secondCancel).toBe(false);
    expect(controller.signal.aborted).toBe(true);
    expect(result.current.hasActive()).toBe(false);
  });

  it('aborts the active request on unmount', () => {
    const { result, unmount } = renderHook(() => useTranscriptionCancellation());
    let controller!: AbortController;

    act(() => {
      controller = result.current.begin();
    });
    unmount();

    expect(controller.signal.aborted).toBe(true);
  });
});
