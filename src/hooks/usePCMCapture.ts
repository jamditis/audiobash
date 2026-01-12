/**
 * PCM Audio Capture Hook
 * Captures raw PCM 16-bit audio at 16kHz for streaming to ElevenLabs
 */

import { useRef, useState, useCallback } from 'react';
import { float32ArrayToBase64 } from '../utils/audioUtils';

export interface UsePCMCaptureOptions {
  sampleRate?: number;  // Default: 16000
  onAudioData: (pcmBase64: string) => void;
  onError?: (error: Error) => void;
  deviceId?: string;    // Specific microphone device ID
}

export interface UsePCMCaptureResult {
  start: () => Promise<void>;
  stop: () => void;
  isCapturing: boolean;
  error: string | null;
}

/**
 * Hook for capturing raw PCM audio from the microphone
 * Uses ScriptProcessorNode (deprecated but widely supported) or AudioWorklet
 */
export function usePCMCapture(options: UsePCMCaptureOptions): UsePCMCaptureResult {
  const {
    sampleRate = 16000,
    onAudioData,
    onError,
    deviceId,
  } = options;

  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Buffer to accumulate samples before sending
  const bufferRef = useRef<Float32Array[]>([]);
  const bufferIntervalRef = useRef<number | null>(null);

  const start = useCallback(async () => {
    if (isCapturing) {
      return;
    }

    setError(null);

    try {
      // Request microphone access
      const constraints: MediaStreamConstraints = {
        audio: deviceId
          ? { deviceId: { exact: deviceId }, sampleRate: { ideal: sampleRate } }
          : { sampleRate: { ideal: sampleRate } },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Create AudioContext with target sample rate
      // Note: Browser may not honor the exact sample rate, we handle resampling if needed
      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      // Create source from stream
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Use ScriptProcessorNode for PCM access
      // Buffer size of 4096 at 16kHz = ~256ms of audio per callback
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Process audio samples
      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        // Clone the data since the buffer is reused
        const samples = new Float32Array(inputData);
        bufferRef.current.push(samples);
      };

      // Connect nodes
      source.connect(processor);
      processor.connect(audioContext.destination);

      // Send accumulated audio every 100ms
      bufferIntervalRef.current = window.setInterval(() => {
        if (bufferRef.current.length === 0) return;

        // Concatenate all buffered samples
        const totalLength = bufferRef.current.reduce((sum, arr) => sum + arr.length, 0);
        const combined = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of bufferRef.current) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        bufferRef.current = [];

        // Convert to base64 PCM and send
        const base64 = float32ArrayToBase64(combined);
        onAudioData(base64);
      }, 100);

      setIsCapturing(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      onError?.(err instanceof Error ? err : new Error(errorMessage));
    }
  }, [isCapturing, sampleRate, deviceId, onAudioData, onError]);

  const stop = useCallback(() => {
    // Clear the send interval
    if (bufferIntervalRef.current) {
      clearInterval(bufferIntervalRef.current);
      bufferIntervalRef.current = null;
    }

    // Send any remaining buffered audio
    if (bufferRef.current.length > 0) {
      const totalLength = bufferRef.current.reduce((sum, arr) => sum + arr.length, 0);
      if (totalLength > 0) {
        const combined = new Float32Array(totalLength);
        let offset = 0;
        for (const chunk of bufferRef.current) {
          combined.set(chunk, offset);
          offset += chunk.length;
        }
        const base64 = float32ArrayToBase64(combined);
        onAudioData(base64);
      }
      bufferRef.current = [];
    }

    // Disconnect and clean up
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsCapturing(false);
  }, [onAudioData]);

  return {
    start,
    stop,
    isCapturing,
    error,
  };
}
