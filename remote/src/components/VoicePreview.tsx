/**
 * VoicePreview - Shows transcribed text before sending
 *
 * Allows editing, sending, or canceling transcribed voice input
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';

export interface VoicePreviewProps {
  text: string;
  onSend: () => void;
  onCancel: () => void;
  onEdit: (text: string) => void;
}

/**
 * Preview component for transcribed voice input
 */
export function VoicePreview({
  text,
  onSend,
  onCancel,
  onEdit,
}: VoicePreviewProps): React.ReactElement {
  const [editedText, setEditedText] = useState(text);
  const [isEditing, setIsEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update local state when text prop changes
  useEffect(() => {
    setEditedText(text);
    setIsEditing(false);
  }, [text]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length
      );
    }
  }, [isEditing]);

  // Handle text change
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setEditedText(newText);
    onEdit(newText);
  }, [onEdit]);

  // Handle send with haptic feedback
  const handleSend = useCallback(() => {
    if (!editedText.trim()) return;

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }

    onSend();
  }, [editedText, onSend]);

  // Handle cancel with haptic feedback
  const handleCancel = useCallback(() => {
    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate([30, 30]);
    }

    onCancel();
  }, [onCancel]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send (without shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Escape to cancel
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  }, [handleSend, handleCancel]);

  // Enable editing
  const enableEditing = useCallback(() => {
    setIsEditing(true);
  }, []);

  const isEmpty = !editedText.trim();

  return (
    <div className="bg-void-100 border border-void-300 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-void-300 bg-void-200">
        <span className="font-mono text-xs text-chrome/60 uppercase tracking-wider">
          Voice Input Preview
        </span>
        <button
          onClick={enableEditing}
          className={`font-mono text-xs uppercase transition-colors ${
            isEditing ? 'text-acid' : 'text-chrome/60 hover:text-chrome'
          }`}
        >
          {isEditing ? 'EDITING' : 'EDIT'}
        </button>
      </div>

      {/* Text content */}
      <div className="p-3">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editedText}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            className="w-full min-h-[80px] bg-void-200 border border-void-300 px-3 py-2 text-crt-white font-mono text-sm resize-none focus:border-acid focus:outline-none"
            placeholder="Enter command..."
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
        ) : (
          <button
            onClick={enableEditing}
            className="w-full text-left min-h-[80px] px-3 py-2 bg-void-200 border border-void-300 hover:border-acid/50 transition-colors"
          >
            {editedText ? (
              <span className="font-mono text-sm text-crt-white whitespace-pre-wrap break-words">
                {editedText}
              </span>
            ) : (
              <span className="font-mono text-sm text-chrome/40 italic">
                No transcription available
              </span>
            )}
          </button>
        )}

        {/* Character count */}
        <div className="mt-2 text-right">
          <span className="font-mono text-[10px] text-chrome/40">
            {editedText.length} chars
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex border-t border-void-300">
        {/* Cancel button */}
        <button
          onClick={handleCancel}
          className="flex-1 py-3 px-4 bg-void-200 text-chrome/80 font-mono text-sm uppercase tracking-wider border-r border-void-300 hover:bg-void-300 hover:text-chrome transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="square" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cancel
        </button>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={isEmpty}
          className={`flex-1 py-3 px-4 font-mono text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
            isEmpty
              ? 'bg-void-200 text-chrome/40 cursor-not-allowed'
              : 'bg-acid/10 text-acid border-l border-acid/30 hover:bg-acid hover:text-void'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="square"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
          Send
        </button>
      </div>

      {/* Keyboard hints */}
      {isEditing && (
        <div className="px-3 py-2 bg-void-200 border-t border-void-300">
          <p className="font-mono text-[10px] text-chrome/40 text-center">
            <span className="inline-block px-1 bg-void-300 mr-1">Enter</span> to send
            <span className="mx-2">|</span>
            <span className="inline-block px-1 bg-void-300 mr-1">Shift+Enter</span> new line
            <span className="mx-2">|</span>
            <span className="inline-block px-1 bg-void-300 mr-1">Esc</span> cancel
          </p>
        </div>
      )}
    </div>
  );
}

export default VoicePreview;
