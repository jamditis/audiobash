/**
 * MediaRecorder hook for audio recording
 * Records audio for server-side transcription when Web Speech API is unavailable
 *
 * Browser support:
 * - Chrome/Chromium: Full support (WebM with Opus)
 * - Safari: Partial support (may use different codec)
 * - Firefox: Full support
 * - All modern mobile browsers: Full support
 */

import { useRef, useState, useCallback, useEffect } from 'react';

// Preferred MIME types in order of preference
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
  'audio/wav',
];

/**
 * Get the best supported MIME type for audio recording
 */
function getBestMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }

  for (const mimeType of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  // Fallback - let browser choose
  return '';
}

export interface UseAudioRecorderOptions {
  /** MIME type for recording (default: best supported WebM/Opus) */
  mimeType?: string;
  /** Audio bitrate in bits/second (default: 128000) */
  audioBitsPerSecond?: number;
  /** Time slice for data chunks in ms (default: 250) */
  timeSlice?: number;
  /** Callback when audio data chunk is available */
  onDataAvailable?: (chunk: Blob) => void;
  /** Callback when recording stops with complete audio blob */
  onStop?: (blob: Blob) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
  /** Callback when recording starts */
  onStart?: () => void;
}

export interface UseAudioRecorderReturn {
  /** Whether recording is currently active */
  isRecording: boolean;
  /** Whether MediaRecorder API is supported */
  isSupported: boolean;
  /** Recording duration in milliseconds */
  duration: number;
  /** Error message if recording failed */
  error: string | null;
  /** MIME type being used for recording */
  mimeType: string;
  /** Start recording audio */
  startRecording: () => Promise<void>;
  /** Stop recording audio */
  stopRecording: () => void;
  /** Get the recorded audio blob (available after stop) */
  getAudioBlob: () => Blob | null;
}

/**
 * Hook for recording audio using the MediaRecorder API
 *
 * @example
 * ```tsx
 * const {
 *   isRecording,
 *   duration,
 *   startRecording,
 *   stopRecording,
 *   getAudioBlob
 * } = useAudioRecorder({
 *   onDataAvailable: (chunk) => sendChunkToServer(chunk),
 *   onStop: (blob) => uploadAudioForTranscription(blob)
 * });
 * ```
 */
export function useAudioRecorder(options: UseAudioRecorderOptions = {}): UseAudioRecorderReturn {
  const {
    mimeType: requestedMimeType,
    audioBitsPerSecond = 128000,
    timeSlice = 250,
    onDataAvailable,
    onStop,
    onError,
    onStart,
  } = options;

  // Determine best MIME type
  const resolvedMimeType = requestedMimeType || getBestMimeType();

  // State
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Check for MediaRecorder support
  const isSupported =
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices !== undefined &&
    typeof navigator.mediaDevices.getUserMedia === 'function';

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Callback refs
  const onDataAvailableRef = useRef(onDataAvailable);
  const onStopRef = useRef(onStop);
  const onErrorRef = useRef(onError);
  const onStartRef = useRef(onStart);

  // Update callback refs
  useEffect(() => {
    onDataAvailableRef.current = onDataAvailable;
    onStopRef.current = onStop;
    onErrorRef.current = onError;
    onStartRef.current = onStart;
  }, [onDataAvailable, onStop, onError, onStart]);

  /**
   * Clean up media stream and recorder
   */
  const cleanup = useCallback(() => {
    // Stop duration tracking
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Stop media recorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // Ignore stop errors
      }
    }
    mediaRecorderRef.current = null;

    // Stop all tracks in the media stream
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      mediaStreamRef.current = null;
    }
  }, []);

  /**
   * Start duration tracking
   */
  const startDurationTracking = useCallback(() => {
    startTimeRef.current = Date.now();
    setDuration(0);

    durationIntervalRef.current = setInterval(() => {
      if (mountedRef.current) {
        setDuration(Date.now() - startTimeRef.current);
      }
    }, 100);
  }, []);

  /**
   * Stop duration tracking and return final duration
   */
  const stopDurationTracking = useCallback((): number => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    const finalDuration = Date.now() - startTimeRef.current;
    return finalDuration;
  }, []);

  /**
   * Request microphone permission and start recording
   */
  const startRecording = useCallback(async () => {
    if (!isSupported) {
      const errorMsg = 'MediaRecorder API is not supported in this browser.';
      setError(errorMsg);
      onErrorRef.current?.(errorMsg);
      return;
    }

    // Clean up any existing recording
    cleanup();

    // Reset state
    chunksRef.current = [];
    audioBlobRef.current = null;
    setError(null);

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      mediaStreamRef.current = stream;

      // Create MediaRecorder with options
      const recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond,
      };

      // Only set mimeType if we have a valid one
      if (resolvedMimeType && MediaRecorder.isTypeSupported(resolvedMimeType)) {
        recorderOptions.mimeType = resolvedMimeType;
      }

      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      // Handle data available event
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (!mountedRef.current) return;

        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
          onDataAvailableRef.current?.(event.data);
        }
      };

      // Handle stop event
      mediaRecorder.onstop = () => {
        if (!mountedRef.current) return;

        const finalDuration = stopDurationTracking();
        setIsRecording(false);

        // Combine all chunks into final blob
        const mimeTypeToUse = mediaRecorder.mimeType || resolvedMimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: mimeTypeToUse });
        audioBlobRef.current = audioBlob;

        // Stop media stream tracks
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }

        // Notify callback
        onStopRef.current?.(audioBlob);

        // Log recording info
        console.log(
          `[useAudioRecorder] Recording stopped: ${(audioBlob.size / 1024).toFixed(1)}KB, ${finalDuration}ms, ${mimeTypeToUse}`
        );
      };

      // Handle error event
      mediaRecorder.onerror = () => {
        if (!mountedRef.current) return;

        const errorMsg = 'Recording error occurred.';
        setError(errorMsg);
        setIsRecording(false);
        stopDurationTracking();
        cleanup();
        onErrorRef.current?.(errorMsg);
      };

      // Start recording with time slicing
      mediaRecorder.start(timeSlice);
      setIsRecording(true);
      startDurationTracking();
      onStartRef.current?.();

      console.log(
        `[useAudioRecorder] Recording started: ${mediaRecorder.mimeType || resolvedMimeType}`
      );
    } catch (err) {
      if (!mountedRef.current) return;

      let errorMsg: string;

      if (err instanceof DOMException) {
        switch (err.name) {
          case 'NotAllowedError':
            errorMsg = 'Microphone access denied. Please allow microphone permissions.';
            break;
          case 'NotFoundError':
            errorMsg = 'No microphone found. Please connect a microphone.';
            break;
          case 'NotReadableError':
            errorMsg = 'Microphone is in use by another application.';
            break;
          case 'OverconstrainedError':
            errorMsg = 'Audio constraints could not be satisfied.';
            break;
          case 'SecurityError':
            errorMsg = 'Microphone access blocked for security reasons.';
            break;
          default:
            errorMsg = `Microphone error: ${err.message}`;
        }
      } else {
        errorMsg = err instanceof Error ? err.message : 'Failed to start recording';
      }

      setError(errorMsg);
      setIsRecording(false);
      cleanup();
      onErrorRef.current?.(errorMsg);
    }
  }, [
    isSupported,
    cleanup,
    audioBitsPerSecond,
    resolvedMimeType,
    timeSlice,
    startDurationTracking,
    stopDurationTracking,
  ]);

  /**
   * Stop recording audio
   */
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        // Ignore stop errors - onstop will still fire
      }
    } else {
      // No active recording, just clean up
      cleanup();
      setIsRecording(false);
    }
  }, [cleanup]);

  /**
   * Get the recorded audio blob
   */
  const getAudioBlob = useCallback((): Blob | null => {
    return audioBlobRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  return {
    isRecording,
    isSupported,
    duration,
    error,
    mimeType: resolvedMimeType,
    startRecording,
    stopRecording,
    getAudioBlob,
  };
}

export default useAudioRecorder;
