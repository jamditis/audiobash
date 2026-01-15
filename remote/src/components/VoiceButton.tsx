/**
 * VoiceButton - Push-to-talk button for voice input
 *
 * Large touch target with visual feedback for recording and processing states
 */

import React, { useCallback, useRef, useEffect } from 'react';

export interface VoiceButtonProps {
  onPressStart: () => void;
  onPressEnd: () => void;
  isRecording: boolean;
  isProcessing: boolean;
  disabled?: boolean;
}

/**
 * Push-to-talk voice recording button
 */
export function VoiceButton({
  onPressStart,
  onPressEnd,
  isRecording,
  isProcessing,
  disabled = false,
}: VoiceButtonProps): React.ReactElement {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pressedRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Handle press start (touch or mouse)
  const handlePressStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (disabled || isProcessing || pressedRef.current) return;

    e.preventDefault();
    pressedRef.current = true;

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    // Start recording after a brief delay to prevent accidental taps
    longPressTimerRef.current = setTimeout(() => {
      if (pressedRef.current) {
        onPressStart();
      }
    }, 100);
  }, [disabled, isProcessing, onPressStart]);

  // Handle press end (touch or mouse)
  const handlePressEnd = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!pressedRef.current) return;

    e.preventDefault();
    pressedRef.current = false;

    // Clear the long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    // Only end if we were actually recording
    if (isRecording) {
      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate([50, 50, 50]);
      }
      onPressEnd();
    }
  }, [isRecording, onPressEnd]);

  // Handle touch cancel (e.g., incoming call)
  const handleTouchCancel = useCallback(() => {
    pressedRef.current = false;
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isRecording) {
      onPressEnd();
    }
  }, [isRecording, onPressEnd]);

  // Determine button state label
  const stateLabel = isProcessing ? 'Processing' : isRecording ? 'Recording' : 'Hold to speak';

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Main button */}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || isProcessing}
        onMouseDown={handlePressStart}
        onMouseUp={handlePressEnd}
        onMouseLeave={handlePressEnd}
        onTouchStart={handlePressStart}
        onTouchEnd={handlePressEnd}
        onTouchCancel={handleTouchCancel}
        className={`
          relative
          w-20 h-20
          flex items-center justify-center
          border-2
          transition-all duration-200
          select-none
          touch-none
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${isRecording
            ? 'bg-accent/20 border-accent scale-110 shadow-[0_0_20px_rgba(255,51,51,0.4)]'
            : isProcessing
              ? 'bg-crt-amber/20 border-crt-amber'
              : 'bg-void-200 border-void-300 hover:border-acid active:scale-95'
          }
        `}
        style={{
          // Ensure minimum touch target
          minWidth: '64px',
          minHeight: '64px',
        }}
        aria-label={stateLabel}
        aria-pressed={isRecording}
      >
        {/* Recording animation ring */}
        {isRecording && (
          <div
            className="absolute inset-0 border-2 border-accent animate-ping"
            style={{ animationDuration: '1s' }}
          />
        )}

        {/* Icon */}
        {isProcessing ? (
          // Processing spinner
          <svg
            className="w-10 h-10 text-crt-amber animate-spin"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : (
          // Microphone icon
          <svg
            className={`w-10 h-10 transition-colors ${
              isRecording ? 'text-accent' : 'text-chrome'
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="square"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        )}

        {/* Recording indicator dot */}
        {isRecording && (
          <div
            className="absolute top-2 right-2 w-3 h-3 bg-accent animate-pulse"
            style={{
              boxShadow: '0 0 10px rgba(255, 51, 51, 0.8)',
            }}
          />
        )}
      </button>

      {/* State label */}
      <span
        className={`font-mono text-sm uppercase tracking-wider ${
          isRecording
            ? 'text-accent text-glow-accent'
            : isProcessing
              ? 'text-crt-amber'
              : disabled
                ? 'text-chrome/40'
                : 'text-chrome/60'
        }`}
      >
        {disabled ? 'Not connected' : stateLabel}
      </span>

      {/* Recording duration indicator */}
      {isRecording && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-accent animate-pulse" />
          <span className="font-mono text-xs text-accent">Recording...</span>
        </div>
      )}

      {/* Processing message */}
      {isProcessing && (
        <p className="font-mono text-xs text-crt-amber/80 text-center">
          Transcribing audio...
        </p>
      )}
    </div>
  );
}

export default VoiceButton;
