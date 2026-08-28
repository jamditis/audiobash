import { useCallback, useEffect, useRef } from 'react';

function cancellationReason(): Error {
  const error = new Error('Transcription cancelled');
  error.name = 'AbortError';
  return error;
}

export function useTranscriptionCancellation() {
  const activeControllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback((): boolean => {
    const controller = activeControllerRef.current;
    if (!controller) return false;

    activeControllerRef.current = null;
    controller.abort(cancellationReason());
    return true;
  }, []);

  const begin = useCallback((): AbortController => {
    cancel();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    return controller;
  }, [cancel]);

  const finish = useCallback((controller: AbortController): void => {
    if (activeControllerRef.current === controller) {
      activeControllerRef.current = null;
    }
  }, []);

  const hasActive = useCallback((): boolean => activeControllerRef.current !== null, []);

  useEffect(
    () => () => {
      cancel();
    },
    [cancel],
  );

  return { begin, cancel, finish, hasActive };
}
