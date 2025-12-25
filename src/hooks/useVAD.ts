import { useRef, useEffect, useCallback, useState } from 'react';
import { MicVAD } from '@ricky0123/vad-web';

interface UseVADOptions {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
}

export function useVAD(options: UseVADOptions) {
  const { onSpeechStart, onSpeechEnd } = options;
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [vadError, setVadError] = useState<string | null>(null);

  const vadRef = useRef<MicVAD | null>(null);
  const onSpeechStartRef = useRef(onSpeechStart);
  const onSpeechEndRef = useRef(onSpeechEnd);

  // Keep callback refs updated
  useEffect(() => {
    onSpeechStartRef.current = onSpeechStart;
    onSpeechEndRef.current = onSpeechEnd;
  }, [onSpeechStart, onSpeechEnd]);

  const start = useCallback(async () => {
    try {
      setVadError(null);

      const vad = await MicVAD.new({
        positiveSpeechThreshold: 0.5,
        negativeSpeechThreshold: 0.35,
        redemptionMs: 300,
        minSpeechMs: 100,
        onSpeechStart: () => {
          console.log('[VAD] Speech started');
          setIsSpeaking(true);
          onSpeechStartRef.current?.();
        },
        onSpeechEnd: (audio: Float32Array) => {
          console.log('[VAD] Speech ended, audio length:', audio.length);
          setIsSpeaking(false);
          onSpeechEndRef.current?.(audio);
        },
        onVADMisfire: () => {
          console.log('[VAD] Misfire detected');
          setIsSpeaking(false);
        },
      });

      vadRef.current = vad;
      vad.start();
      setIsListening(true);
      console.log('[VAD] Started listening');
    } catch (err: any) {
      console.error('[VAD] Failed to start:', err);
      setVadError(err.message || 'Failed to start VAD');
      setIsListening(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (vadRef.current) {
      try {
        vadRef.current.pause();
        vadRef.current.destroy();
        vadRef.current = null;
        setIsListening(false);
        setIsSpeaking(false);
        console.log('[VAD] Stopped listening');
      } catch (err: any) {
        console.error('[VAD] Error stopping:', err);
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vadRef.current) {
        try {
          vadRef.current.pause();
          vadRef.current.destroy();
        } catch (err) {
          console.error('[VAD] Cleanup error:', err);
        }
      }
    };
  }, []);

  return {
    start,
    stop,
    isListening,
    isSpeaking,
    vadError,
  };
}
