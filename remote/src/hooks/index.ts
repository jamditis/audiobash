/**
 * Hooks for AudioBash Remote
 */

// WebSocket hooks
export { useWebSocket } from './useWebSocket';
export type {
  UseWebSocketOptions,
  UseWebSocketReturn,
} from './useWebSocket';

export { useAudioBashConnection } from './useAudioBashConnection';
export type {
  Tab,
  DesktopInfo,
  TerminalContext,
  TranscriptionResult,
  TranscriptionStatus,
  UseAudioBashConnectionOptions,
  UseAudioBashConnectionReturn,
  SecurityEvent,
} from './useAudioBashConnection';

// Voice input hooks
export { useVoiceInput } from './useVoiceInput';
export type {
  UseVoiceInputOptions,
  UseVoiceInputReturn,
} from './useVoiceInput';

export { useAudioRecorder } from './useAudioRecorder';
export type {
  UseAudioRecorderOptions,
  UseAudioRecorderReturn,
} from './useAudioRecorder';

export { usePushToTalk, detectBestMode } from './usePushToTalk';
export type {
  TranscriptionMode,
  UsePushToTalkOptions,
  UsePushToTalkReturn,
} from './usePushToTalk';
