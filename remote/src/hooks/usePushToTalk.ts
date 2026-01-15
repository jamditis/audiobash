/**
 * Combined push-to-talk hook supporting both local and server transcription modes
 *
 * Modes:
 * - 'local': Uses Web Speech API for client-side transcription (Chrome/Samsung Internet)
 * - 'server': Uses MediaRecorder to capture audio for server-side transcription (all browsers)
 *
 * The hook automatically selects the appropriate underlying implementation and provides
 * a unified interface for both modes.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { useVoiceInput } from './useVoiceInput';
import { useAudioRecorder } from './useAudioRecorder';

export type TranscriptionMode = 'local' | 'server';

export interface UsePushToTalkOptions {
  /** Transcription mode: 'local' for Web Speech API, 'server' for MediaRecorder */
  mode: TranscriptionMode;
  /** Language code for recognition (default: 'en-US', used in local mode) */
  language?: string;
  /** Callback when transcription is available (local mode: immediate, server mode: after upload) */
  onTranscript?: (text: string) => void;
  /** Callback when interim transcript is available (local mode only) */
  onInterimTranscript?: (text: string) => void;
  /** Callback when audio chunk is available (server mode only) */
  onAudioChunk?: (chunk: Blob) => void;
  /** Callback when recording completes with audio blob (server mode only) */
  onRecordingComplete?: (blob: Blob, duration: number) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
  /** Callback when push-to-talk starts */
  onStart?: () => void;
  /** Callback when push-to-talk ends */
  onEnd?: () => void;
}

export interface UsePushToTalkReturn {
  /** Whether push-to-talk is currently active */
  isActive: boolean;
  /** Whether transcription is being processed (local: always false, server: during upload) */
  isProcessing: boolean;
  /** Whether the selected mode is supported in this browser */
  isSupported: boolean;
  /** Current transcript text */
  transcript: string;
  /** Interim transcript (local mode only, shows partial results) */
  interimTranscript: string;
  /** Recording duration in milliseconds */
  duration: number;
  /** Error message if something failed */
  error: string | null;
  /** Active transcription mode */
  mode: TranscriptionMode;
  /** Start push-to-talk (press/hold) */
  startTalking: () => void;
  /** Stop push-to-talk (release) */
  stopTalking: () => void;
  /** Reset transcript and error state */
  reset: () => void;
  /** Set transcript from server response (server mode only) */
  setTranscriptFromServer: (text: string) => void;
}

/**
 * Unified push-to-talk hook that switches between Web Speech API and MediaRecorder
 *
 * @example
 * ```tsx
 * const {
 *   isActive,
 *   isProcessing,
 *   transcript,
 *   startTalking,
 *   stopTalking
 * } = usePushToTalk({
 *   mode: 'local', // or 'server'
 *   onTranscript: (text) => sendToTerminal(text),
 *   onRecordingComplete: (blob, duration) => uploadToServer(blob)
 * });
 *
 * // Use with button
 * <button
 *   onPointerDown={startTalking}
 *   onPointerUp={stopTalking}
 *   onPointerLeave={stopTalking}
 * >
 *   {isActive ? 'Recording...' : 'Hold to Talk'}
 * </button>
 * ```
 */
export function usePushToTalk(options: UsePushToTalkOptions): UsePushToTalkReturn {
  const {
    mode,
    language = 'en-US',
    onTranscript,
    onInterimTranscript,
    onAudioChunk,
    onRecordingComplete,
    onError,
    onStart,
    onEnd,
  } = options;

  // Local state
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Refs for callbacks
  const onTranscriptRef = useRef(onTranscript);
  const onInterimTranscriptRef = useRef(onInterimTranscript);
  const onAudioChunkRef = useRef(onAudioChunk);
  const onRecordingCompleteRef = useRef(onRecordingComplete);
  const onErrorRef = useRef(onError);
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);
  const mountedRef = useRef(true);

  // Track recording duration for server mode
  const durationRef = useRef(0);

  // Update callback refs
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onInterimTranscriptRef.current = onInterimTranscript;
    onAudioChunkRef.current = onAudioChunk;
    onRecordingCompleteRef.current = onRecordingComplete;
    onErrorRef.current = onError;
    onStartRef.current = onStart;
    onEndRef.current = onEnd;
  }, [
    onTranscript,
    onInterimTranscript,
    onAudioChunk,
    onRecordingComplete,
    onError,
    onStart,
    onEnd,
  ]);

  /**
   * Handle voice input result (local mode)
   */
  const handleVoiceResult = useCallback((text: string, isFinal: boolean) => {
    if (!mountedRef.current) return;

    if (isFinal) {
      setTranscript((prev) => (prev ? `${prev} ${text}` : text));
      onTranscriptRef.current?.(text);
    } else {
      onInterimTranscriptRef.current?.(text);
    }
  }, []);

  /**
   * Handle voice input error (local mode)
   */
  const handleVoiceError = useCallback((errorMsg: string) => {
    if (!mountedRef.current) return;
    setError(errorMsg);
    onErrorRef.current?.(errorMsg);
  }, []);

  /**
   * Handle voice input start (local mode)
   */
  const handleVoiceStart = useCallback(() => {
    if (!mountedRef.current) return;
    onStartRef.current?.();
  }, []);

  /**
   * Handle voice input end (local mode)
   */
  const handleVoiceEnd = useCallback(() => {
    if (!mountedRef.current) return;
    onEndRef.current?.();
  }, []);

  // Web Speech API hook (local mode)
  const voiceInput = useVoiceInput({
    language,
    continuous: false,
    interimResults: true,
    onResult: handleVoiceResult,
    onError: handleVoiceError,
    onStart: handleVoiceStart,
    onEnd: handleVoiceEnd,
  });

  /**
   * Handle audio chunk (server mode)
   */
  const handleAudioChunk = useCallback((chunk: Blob) => {
    if (!mountedRef.current) return;
    onAudioChunkRef.current?.(chunk);
  }, []);

  /**
   * Handle recording stop (server mode)
   */
  const handleRecordingStop = useCallback((blob: Blob) => {
    if (!mountedRef.current) return;
    setIsProcessing(true);
    onRecordingCompleteRef.current?.(blob, durationRef.current);
    onEndRef.current?.();
  }, []);

  /**
   * Handle recording error (server mode)
   */
  const handleRecordingError = useCallback((errorMsg: string) => {
    if (!mountedRef.current) return;
    setError(errorMsg);
    setIsProcessing(false);
    onErrorRef.current?.(errorMsg);
  }, []);

  /**
   * Handle recording start (server mode)
   */
  const handleRecordingStart = useCallback(() => {
    if (!mountedRef.current) return;
    onStartRef.current?.();
  }, []);

  // MediaRecorder hook (server mode)
  const audioRecorder = useAudioRecorder({
    onDataAvailable: handleAudioChunk,
    onStop: handleRecordingStop,
    onError: handleRecordingError,
    onStart: handleRecordingStart,
  });

  // Update duration ref when recorder duration changes
  useEffect(() => {
    durationRef.current = audioRecorder.duration;
  }, [audioRecorder.duration]);

  // Determine support based on mode
  const isSupported = mode === 'local' ? voiceInput.isSupported : audioRecorder.isSupported;

  // Determine if active based on mode
  const isActive = mode === 'local' ? voiceInput.isListening : audioRecorder.isRecording;

  // Get duration based on mode
  const duration = mode === 'server' ? audioRecorder.duration : 0;

  // Get interim transcript (local mode only)
  const interimTranscript = mode === 'local' ? voiceInput.interimTranscript : '';

  /**
   * Start push-to-talk
   */
  const startTalking = useCallback(() => {
    setError(null);
    setIsProcessing(false);

    if (mode === 'local') {
      // Clear previous transcript for new session
      voiceInput.resetTranscript();
      setTranscript('');
      voiceInput.startListening();
    } else {
      // Clear transcript when starting new recording
      setTranscript('');
      audioRecorder.startRecording();
    }
  }, [mode, voiceInput, audioRecorder]);

  /**
   * Stop push-to-talk
   */
  const stopTalking = useCallback(() => {
    if (mode === 'local') {
      voiceInput.stopListening();
    } else {
      audioRecorder.stopRecording();
    }
  }, [mode, voiceInput, audioRecorder]);

  /**
   * Reset transcript and error state
   */
  const reset = useCallback(() => {
    setTranscript('');
    setError(null);
    setIsProcessing(false);

    if (mode === 'local') {
      voiceInput.resetTranscript();
    }
  }, [mode, voiceInput]);

  /**
   * Set transcript from server response (for server mode)
   * Call this when server transcription completes to update the transcript
   * and clear the processing state
   */
  const setTranscriptFromServer = useCallback((text: string) => {
    if (!mountedRef.current) return;
    setTranscript(text);
    setIsProcessing(false);
    onTranscriptRef.current?.(text);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Combine errors from both modes
  const combinedError = error || (mode === 'local' ? voiceInput.error : audioRecorder.error);

  return {
    isActive,
    isProcessing,
    isSupported,
    transcript,
    interimTranscript,
    duration,
    error: combinedError,
    mode,
    startTalking,
    stopTalking,
    reset,
    setTranscriptFromServer,
  };
}

/**
 * Helper function to detect the best transcription mode for the current browser
 *
 * @returns 'local' if Web Speech API is available, 'server' otherwise
 */
export function detectBestMode(): TranscriptionMode {
  if (typeof window === 'undefined') {
    return 'server';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const windowWithSpeech = window as any;
  const hasSpeechRecognition =
    windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;

  return hasSpeechRecognition ? 'local' : 'server';
}

export default usePushToTalk;
