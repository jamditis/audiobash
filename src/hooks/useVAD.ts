import { useCallback, useEffect, useRef, useState } from 'react';
import type { MicVAD } from '@ricky0123/vad-web';

interface UseVADOptions {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
}

type VADModule = typeof import('@ricky0123/vad-web');

let vadModulePromise: Promise<VADModule> | null = null;

function loadVADModule(): Promise<VADModule> {
  if (!vadModulePromise) {
    vadModulePromise = import('@ricky0123/vad-web').catch((error: unknown) => {
      vadModulePromise = null;
      if (error instanceof Error) {
        const cause = (error as Error & { cause?: unknown }).cause;
        if (cause instanceof Error) {
          throw cause;
        }
      }
      throw error;
    });
  }

  return vadModulePromise;
}

async function disposeVAD(vad: MicVAD): Promise<void> {
  try {
    await vad.pause();
  } finally {
    await vad.destroy();
  }
}

export function useVAD(options: UseVADOptions) {
  const { onSpeechStart, onSpeechEnd } = options;
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [vadError, setVadError] = useState<string | null>(null);

  const vadRef = useRef<MicVAD | null>(null);
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const cleanupPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const generationRef = useRef(0);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);

  useEffect(() => {
    onSpeechStartRef.current = onSpeechStart;
    onSpeechEndRef.current = onSpeechEnd;
  }, [onSpeechStart, onSpeechEnd]);

  const start = useCallback((): Promise<void> => {
    if (!mountedRef.current) {
      return Promise.resolve();
    }
    if (vadRef.current) {
      return Promise.resolve();
    }
    if (startPromiseRef.current) {
      return startPromiseRef.current;
    }

    const sessionGeneration = ++generationRef.current;
    const priorCleanup = cleanupPromiseRef.current;
    const modulePromise = loadVADModule();

    setVadError(null);

    const startPromise = (async () => {
      try {
        await priorCleanup;
        if (!mountedRef.current || generationRef.current !== sessionGeneration) {
          return;
        }

        const { MicVAD } = await modulePromise;
        if (!mountedRef.current || generationRef.current !== sessionGeneration) {
          return;
        }

        const vad = await MicVAD.new({
          // These generated files are shipped with the app. No VAD runtime code or model is
          // fetched from a CDN.
          baseAssetPath: './vad/',
          onnxWASMBasePath: './vad/',
          model: 'legacy',
          startOnLoad: true,
          positiveSpeechThreshold: 0.5,
          negativeSpeechThreshold: 0.35,
          redemptionMs: 300,
          minSpeechMs: 100,
          onSpeechStart: () => {
            if (!mountedRef.current || generationRef.current !== sessionGeneration) {
              return;
            }

            console.log('[VAD] Speech started');
            setIsSpeaking(true);
            onSpeechStartRef.current?.();
          },
          onSpeechEnd: (audio: Float32Array) => {
            if (!mountedRef.current || generationRef.current !== sessionGeneration) {
              return;
            }

            console.log('[VAD] Speech ended, audio length:', audio.length);
            setIsSpeaking(false);
            onSpeechEndRef.current?.(audio);
          },
          onVADMisfire: () => {
            if (!mountedRef.current || generationRef.current !== sessionGeneration) {
              return;
            }

            console.log('[VAD] Misfire detected');
            setIsSpeaking(false);
          },
        });

        if (!mountedRef.current || generationRef.current !== sessionGeneration) {
          try {
            await disposeVAD(vad);
          } catch (error: unknown) {
            console.error('[VAD] Error disposing canceled session:', error);
          }
          return;
        }

        vadRef.current = vad;
        setIsListening(true);
        console.log('[VAD] Started listening');
      } catch (error: unknown) {
        if (!mountedRef.current || generationRef.current !== sessionGeneration) {
          return;
        }

        console.error('[VAD] Failed to start:', error);
        const message =
          error instanceof Error ? error.message : typeof error === 'string' ? error : '';
        setVadError(message || 'Failed to start VAD');
        setIsListening(false);
        setIsSpeaking(false);
        throw error;
      }
    })();

    startPromiseRef.current = startPromise;
    const clearSettledStart = () => {
      if (startPromiseRef.current === startPromise) {
        startPromiseRef.current = null;
      }
    };
    void startPromise.then(clearSettledStart, clearSettledStart);
    return startPromise;
  }, []);

  const queueVADCleanup = useCallback(
    (
      activeVAD: MicVAD | null,
      pendingStart: Promise<void> | null,
      reason: 'stop' | 'unmount',
    ): Promise<void> => {
      const priorCleanup = cleanupPromiseRef.current;
      const cleanupPromise = (async () => {
        await priorCleanup;

        if (pendingStart) {
          try {
            await pendingStart;
          } catch {
            // The start path owns user-visible error reporting.
          }
        }

        if (activeVAD) {
          try {
            await disposeVAD(activeVAD);
            if (reason === 'stop') {
              console.log('[VAD] Stopped listening');
            }
          } catch (error: unknown) {
            const label = reason === 'stop' ? 'Error stopping' : 'Cleanup error';
            console.error(`[VAD] ${label}:`, error);
          }
        }
      })();

      cleanupPromiseRef.current = cleanupPromise;
      return cleanupPromise;
    },
    [],
  );

  const stop = useCallback((): Promise<void> => {
    generationRef.current += 1;

    const activeVAD = vadRef.current;
    const pendingStart = startPromiseRef.current;
    vadRef.current = null;
    startPromiseRef.current = null;

    if (mountedRef.current) {
      setIsListening(false);
      setIsSpeaking(false);
    }

    return queueVADCleanup(activeVAD, pendingStart, 'stop');
  }, [queueVADCleanup]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      generationRef.current += 1;

      const activeVAD = vadRef.current;
      const pendingStart = startPromiseRef.current;
      vadRef.current = null;
      startPromiseRef.current = null;

      void queueVADCleanup(activeVAD, pendingStart, 'unmount');
    };
  }, [queueVADCleanup]);

  return {
    start,
    stop,
    isListening,
    isSpeaking,
    vadError,
  };
}
