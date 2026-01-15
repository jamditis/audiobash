/**
 * Web Speech API hook for client-side voice transcription
 * Provides real-time speech-to-text using the browser's built-in speech recognition
 *
 * Browser support:
 * - Chrome/Chromium: Full support
 * - Safari: Partial support (webkitSpeechRecognition)
 * - Firefox: Not supported
 * - Samsung Internet: Full support
 */

import { useRef, useState, useCallback, useEffect } from 'react';

// Speech recognition types for browsers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpeechRecognitionType = any;

// Get speech recognition constructor with browser prefixes
function getSpeechRecognition(): SpeechRecognitionType | null {
  if (typeof window === 'undefined') return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const windowWithSpeech = window as any;
  return (
    windowWithSpeech.SpeechRecognition ||
    windowWithSpeech.webkitSpeechRecognition ||
    null
  );
}

export interface UseVoiceInputOptions {
  /** Language code for recognition (default: 'en-US') */
  language?: string;
  /** Keep listening after results (default: false) */
  continuous?: boolean;
  /** Show partial results as user speaks (default: true) */
  interimResults?: boolean;
  /** Maximum number of alternative results (default: 1) */
  maxAlternatives?: number;
  /** Callback when recognition result is received */
  onResult?: (text: string, isFinal: boolean) => void;
  /** Callback when an error occurs */
  onError?: (error: string) => void;
  /** Callback when recognition starts */
  onStart?: () => void;
  /** Callback when recognition ends */
  onEnd?: () => void;
}

export interface UseVoiceInputReturn {
  /** Whether recognition is currently active */
  isListening: boolean;
  /** Whether Web Speech API is supported in this browser */
  isSupported: boolean;
  /** Final transcript from the current session */
  transcript: string;
  /** Interim (partial) transcript while speaking */
  interimTranscript: string;
  /** Error message if recognition failed */
  error: string | null;
  /** Start listening for speech */
  startListening: () => void;
  /** Stop listening for speech */
  stopListening: () => void;
  /** Clear the transcript */
  resetTranscript: () => void;
}

/**
 * Hook for browser-based speech recognition using Web Speech API
 *
 * @example
 * ```tsx
 * const {
 *   isListening,
 *   isSupported,
 *   transcript,
 *   interimTranscript,
 *   startListening,
 *   stopListening
 * } = useVoiceInput({
 *   language: 'en-US',
 *   onResult: (text, isFinal) => {
 *     if (isFinal) sendToTerminal(text);
 *   }
 * });
 * ```
 */
export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const {
    language = 'en-US',
    continuous = false,
    interimResults = true,
    maxAlternatives = 1,
    onResult,
    onError,
    onStart,
    onEnd,
  } = options;

  // State
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Check for Web Speech API support
  const SpeechRecognition = getSpeechRecognition();
  const isSupported = SpeechRecognition !== null;

  // Refs for stable references
  const recognitionRef = useRef<SpeechRecognitionType | null>(null);
  const mountedRef = useRef(true);
  const shouldRestartRef = useRef(false);

  // Callback refs to avoid dependency issues
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onStartRef = useRef(onStart);
  const onEndRef = useRef(onEnd);

  // Update callback refs when they change
  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
    onStartRef.current = onStart;
    onEndRef.current = onEnd;
  }, [onResult, onError, onStart, onEnd]);

  /**
   * Map speech recognition error codes to user-friendly messages
   */
  const getErrorMessage = useCallback((errorEvent: { error: string }): string => {
    switch (errorEvent.error) {
      case 'no-speech':
        return 'No speech detected. Please try again.';
      case 'aborted':
        return 'Speech recognition was aborted.';
      case 'audio-capture':
        return 'No microphone detected. Please check your audio input.';
      case 'network':
        return 'Network error occurred. Please check your connection.';
      case 'not-allowed':
        return 'Microphone access denied. Please allow microphone permissions.';
      case 'service-not-allowed':
        return 'Speech recognition service not allowed.';
      case 'bad-grammar':
        return 'Grammar error in speech recognition.';
      case 'language-not-supported':
        return `Language '${language}' is not supported.`;
      default:
        return `Speech recognition error: ${errorEvent.error}`;
    }
  }, [language]);

  /**
   * Initialize the speech recognition instance
   */
  const initRecognition = useCallback(() => {
    if (!SpeechRecognition) return null;

    const recognition = new SpeechRecognition();

    // Configure recognition
    recognition.lang = language;
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.maxAlternatives = maxAlternatives;

    // Handle start event
    recognition.onstart = () => {
      if (!mountedRef.current) return;
      setIsListening(true);
      setError(null);
      onStartRef.current?.();
    };

    // Handle end event
    recognition.onend = () => {
      if (!mountedRef.current) return;
      setIsListening(false);
      setInterimTranscript('');
      onEndRef.current?.();

      // Auto-restart if continuous mode and should restart
      if (shouldRestartRef.current && continuous) {
        try {
          recognition.start();
        } catch (e) {
          // Ignore restart errors
        }
      }
    };

    // Handle results
    recognition.onresult = (event: { resultIndex: number; results: SpeechRecognitionResultList }) => {
      if (!mountedRef.current) return;

      let finalText = '';
      let interimText = '';

      // Process all results
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }

      // Update transcripts
      if (finalText) {
        setTranscript((prev) => (prev ? `${prev} ${finalText}` : finalText));
        onResultRef.current?.(finalText, true);
      }

      if (interimText) {
        setInterimTranscript(interimText);
        onResultRef.current?.(interimText, false);
      }
    };

    // Handle errors
    recognition.onerror = (event: { error: string }) => {
      if (!mountedRef.current) return;

      const errorMessage = getErrorMessage(event);
      setError(errorMessage);
      setIsListening(false);
      shouldRestartRef.current = false;
      onErrorRef.current?.(errorMessage);
    };

    return recognition;
  }, [SpeechRecognition, language, continuous, interimResults, maxAlternatives, getErrorMessage]);

  /**
   * Start listening for speech
   */
  const startListening = useCallback(() => {
    if (!isSupported) {
      const errorMsg = 'Web Speech API is not supported in this browser.';
      setError(errorMsg);
      onErrorRef.current?.(errorMsg);
      return;
    }

    // Stop any existing recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore stop errors
      }
    }

    // Create new recognition instance
    const recognition = initRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    shouldRestartRef.current = continuous;

    // Clear interim transcript when starting fresh
    setInterimTranscript('');
    setError(null);

    try {
      recognition.start();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start speech recognition';
      setError(errorMsg);
      onErrorRef.current?.(errorMsg);
    }
  }, [isSupported, continuous, initRecognition]);

  /**
   * Stop listening for speech
   */
  const stopListening = useCallback(() => {
    shouldRestartRef.current = false;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // Ignore stop errors
      }
      recognitionRef.current = null;
    }

    setIsListening(false);
    setInterimTranscript('');
  }, []);

  /**
   * Clear the transcript
   */
  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      shouldRestartRef.current = false;

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          // Ignore stop errors
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isListening,
    isSupported,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}

export default useVoiceInput;
