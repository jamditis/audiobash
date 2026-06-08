/**
 * ElevenLabs Real-time Transcription Hook
 * Combines PCM audio capture with WebSocket streaming for real-time speech-to-text
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  ElevenLabsRealtimeService,
  ElevenLabsRealtimeConfig,
} from '../services/elevenLabsRealtimeService';
import { usePCMCapture } from './usePCMCapture';

export interface UseElevenLabsRealtimeOptions {
  apiKey: string;
  language?: string; // 'eng' or null for auto-detect
  keyterms?: string[]; // Up to 100 vocabulary terms
  deviceId?: string; // Specific microphone device ID
  onFinalTranscript: (text: string) => void;
  onError: (error: Error) => void;
  onSessionStart?: () => void;
  onSessionEnd?: () => void;
}

export interface UseElevenLabsRealtimeResult {
  start: () => Promise<void>;
  stop: () => void;
  commit: () => void; // Force commit / manual stop
  isConnected: boolean;
  isListening: boolean;
  error: string | null;
}

/**
 * Hook for real-time speech-to-text with ElevenLabs Scribe v2
 */
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
  const isStoppingRef = useRef(false);

  // Handle incoming audio data from PCM capture
  const handleAudioData = useCallback((pcmBase64: string) => {
    if (serviceRef.current?.isConnected && !isStoppingRef.current) {
      serviceRef.current.sendAudio(pcmBase64);
    }
  }, []);

  // Handle PCM capture errors
  const handleCaptureError = useCallback(
    (err: Error) => {
      setError(err.message);
      onError(err);
    },
    [onError],
  );

  // Set up PCM capture
  const pcmCapture = usePCMCapture({
    sampleRate: 16000,
    onAudioData: handleAudioData,
    onError: handleCaptureError,
    deviceId,
  });

  // Clean up service on unmount
  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        serviceRef.current.disconnect();
        serviceRef.current = null;
      }
    };
  }, []);

  // Start real-time transcription
  const start = useCallback(async () => {
    if (isListening || !apiKey) {
      if (!apiKey) {
        const err = new Error('No ElevenLabs API key configured');
        setError(err.message);
        onError(err);
      }
      return;
    }

    setError(null);
    isStoppingRef.current = false;

    try {
      // Create and configure the service
      const config: ElevenLabsRealtimeConfig = {
        apiKey,
        language,
        keyterms,
        onFinalTranscript: (text) => {
          // Only process if we haven't explicitly stopped
          if (!isStoppingRef.current) {
            onFinalTranscript(text);
          }
        },
        onError: (err) => {
          setError(err.message);
          onError(err);
        },
        onSessionStart: () => {
          setIsConnected(true);
          onSessionStart?.();
        },
        onSessionEnd: () => {
          setIsConnected(false);
          setIsListening(false);
          onSessionEnd?.();
        },
      };

      serviceRef.current = new ElevenLabsRealtimeService(config);

      // Connect to WebSocket
      await serviceRef.current.connect();
      setIsConnected(true);

      // Start capturing audio
      await pcmCapture.start();
      setIsListening(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      onError(err instanceof Error ? err : new Error(errorMessage));

      // Clean up on failure
      if (serviceRef.current) {
        serviceRef.current.disconnect();
        serviceRef.current = null;
      }
      setIsConnected(false);
      setIsListening(false);
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
  ]);

  // Stop real-time transcription
  const stop = useCallback(() => {
    isStoppingRef.current = true;

    // Stop audio capture first (this sends any remaining buffered audio)
    pcmCapture.stop();

    // Then commit to finalize transcription
    if (serviceRef.current?.isConnected) {
      serviceRef.current.commit();

      // Give a brief moment for final transcript before disconnecting
      setTimeout(() => {
        if (serviceRef.current) {
          serviceRef.current.disconnect();
          serviceRef.current = null;
        }
        setIsConnected(false);
        setIsListening(false);
      }, 500);
    } else {
      setIsConnected(false);
      setIsListening(false);
    }
  }, [pcmCapture]);

  // Force commit (manual finalization without full stop)
  const commit = useCallback(() => {
    if (serviceRef.current?.isConnected) {
      serviceRef.current.commit();
    }
  }, []);

  return {
    start,
    stop,
    commit,
    isConnected,
    isListening,
    error,
  };
}
