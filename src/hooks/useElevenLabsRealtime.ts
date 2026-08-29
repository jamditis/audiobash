/**
 * ElevenLabs real-time transcription hook.
 * Combines PCM audio capture with WebSocket speech-to-text.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ElevenLabsRealtimeConfig,
  ElevenLabsRealtimeService,
} from '../services/elevenLabsRealtimeService';
import { usePCMCapture } from './usePCMCapture';

export interface UseElevenLabsRealtimeOptions {
  apiKey: string;
  language?: string;
  keyterms?: string[];
  deviceId?: string;
  onFinalTranscript: (text: string) => void;
  onError: (error: Error) => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

export interface UseElevenLabsRealtimeResult {
  start: () => Promise<boolean>;
  stop: () => void;
  cancel: () => void;
  commit: () => void;
  isConnected: boolean;
  isListening: boolean;
  error: string | null;
}

export function useElevenLabsRealtime(
  options: UseElevenLabsRealtimeOptions,
): UseElevenLabsRealtimeResult {
  const {
    apiKey,
    language,
    keyterms,
    deviceId,
    onFinalTranscript,
    onError,
    onSessionStart,
    onSessionEnd,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serviceRef = useRef<ElevenLabsRealtimeService | null>(null);
  const mountedRef = useRef(true);
  const isStoppingRef = useRef(false);
  const operationGenerationRef = useRef(0);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopFinalDeliveredRef = useRef(false);

  const handleAudioData = useCallback((pcmBase64: string) => {
    if (serviceRef.current?.isConnected && !isStoppingRef.current) {
      serviceRef.current.sendAudio(pcmBase64);
    }
  }, []);

  const handleCaptureError = useCallback((captureError: Error) => {
    if (!mountedRef.current) {
      return;
    }
    setError(captureError.message);
  }, []);

  const pcmCapture = usePCMCapture({
    sampleRate: 16000,
    onAudioData: handleAudioData,
    onError: handleCaptureError,
    deviceId,
  });
  const pcmCaptureRef = useRef(pcmCapture);
  pcmCaptureRef.current = pcmCapture;

  const clearDisconnectTimer = useCallback(() => {
    if (disconnectTimerRef.current !== null) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      isStoppingRef.current = true;
      operationGenerationRef.current += 1;
      clearDisconnectTimer();
      pcmCaptureRef.current.stop();
      serviceRef.current?.disconnect();
      serviceRef.current = null;
    };
  }, [clearDisconnectTimer]);

  const start = useCallback(async () => {
    if (!apiKey) {
      const missingKeyError = new Error('No ElevenLabs API key configured');
      setError(missingKeyError.message);
      throw missingKeyError;
    }

    if (isListening || serviceRef.current) {
      return false;
    }

    clearDisconnectTimer();
    setError(null);
    isStoppingRef.current = false;
    stopFinalDeliveredRef.current = false;
    const generation = ++operationGenerationRef.current;

    const service = new ElevenLabsRealtimeService({
      apiKey,
      language,
      keyterms,
      onFinalTranscript: (text) => {
        if (
          mountedRef.current &&
          operationGenerationRef.current === generation &&
          serviceRef.current === service
        ) {
          if (isStoppingRef.current && stopFinalDeliveredRef.current) {
            return;
          }
          if (isStoppingRef.current) {
            stopFinalDeliveredRef.current = true;
          }
          try {
            onFinalTranscript(text);
          } finally {
            clearDisconnectTimer();
            service.disconnect();
          }
        }
      },
      onError: (serviceError) => {
        if (
          mountedRef.current &&
          operationGenerationRef.current === generation &&
          serviceRef.current === service
        ) {
          setError(serviceError.message);
          onError(serviceError);
        }
      },
      onSessionStart: () => {
        if (
          mountedRef.current &&
          operationGenerationRef.current === generation &&
          serviceRef.current === service
        ) {
          setIsConnected(true);
          onSessionStart?.();
        }
      },
      onSessionEnd: () => {
        if (
          mountedRef.current &&
          operationGenerationRef.current === generation &&
          serviceRef.current === service
        ) {
          isStoppingRef.current = true;
          clearDisconnectTimer();
          pcmCaptureRef.current.stop();
          serviceRef.current = null;
          setIsConnected(false);
          setIsListening(false);
          onSessionEnd?.();
        }
      },
    } satisfies ElevenLabsRealtimeConfig);
    serviceRef.current = service;

    const isCurrentOperation = () =>
      mountedRef.current &&
      !isStoppingRef.current &&
      operationGenerationRef.current === generation &&
      serviceRef.current === service;

    try {
      await service.connect();

      if (!isCurrentOperation()) {
        if (serviceRef.current === service) {
          service.disconnect();
          serviceRef.current = null;
        }
        return false;
      }

      setIsConnected(true);
      await pcmCapture.start();

      if (!isCurrentOperation()) {
        pcmCapture.stop();
        if (serviceRef.current === service) {
          service.disconnect();
          serviceRef.current = null;
        }
        return false;
      }

      setIsListening(true);
      return true;
    } catch (caughtError) {
      if (!mountedRef.current || operationGenerationRef.current !== generation) {
        return false;
      }

      const operationError =
        caughtError instanceof Error ? caughtError : new Error(String(caughtError));

      service.disconnect();
      if (serviceRef.current === service) {
        serviceRef.current = null;
      }
      setIsConnected(false);
      setIsListening(false);
      setError(operationError.message);
      throw operationError;
    }
  }, [
    apiKey,
    language,
    keyterms,
    isListening,
    pcmCapture,
    onFinalTranscript,
    onError,
    onSessionStart,
    onSessionEnd,
    clearDisconnectTimer,
  ]);

  const cancel = useCallback(() => {
    isStoppingRef.current = true;
    operationGenerationRef.current += 1;
    stopFinalDeliveredRef.current = false;
    clearDisconnectTimer();
    pcmCapture.stop();

    const service = serviceRef.current;
    serviceRef.current = null;
    service?.disconnect();

    if (mountedRef.current) {
      setIsConnected(false);
      setIsListening(false);
    }
  }, [clearDisconnectTimer, pcmCapture]);

  const stop = useCallback(() => {
    if (isStoppingRef.current) {
      return;
    }

    const service = serviceRef.current;
    if (!service?.isConnected) {
      cancel();
      return;
    }

    isStoppingRef.current = true;
    stopFinalDeliveredRef.current = false;
    clearDisconnectTimer();
    pcmCapture.stop();

    service.commit();
    disconnectTimerRef.current = setTimeout(() => {
      disconnectTimerRef.current = null;
      service.disconnect();
      if (serviceRef.current === service) {
        serviceRef.current = null;
      }
      if (mountedRef.current) {
        setIsConnected(false);
        setIsListening(false);
      }
    }, 500);
  }, [cancel, clearDisconnectTimer, pcmCapture]);

  const commit = useCallback(() => {
    if (serviceRef.current?.isConnected) {
      serviceRef.current.commit();
    }
  }, []);

  return {
    start,
    stop,
    cancel,
    commit,
    isConnected,
    isListening,
    error,
  };
}
