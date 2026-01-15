/**
 * AudioBash Remote - Component exports
 *
 * Mobile-optimized terminal components for the AudioBash Remote PWA.
 */

// Terminal components
export { default as Terminal } from './Terminal';
export { default as TerminalOutput } from './TerminalOutput';
export { default as TerminalTabs } from './TerminalTabs';

// Connection components
export { ConnectionModal } from './ConnectionModal';
export type { ConnectionModalProps } from './ConnectionModal';

export { QRScanner } from './QRScanner';
export type { QRScannerProps } from './QRScanner';

export { StatusBar } from './StatusBar';
export type { StatusBarProps } from './StatusBar';

// Voice input components
export { VoiceButton } from './VoiceButton';
export type { VoiceButtonProps } from './VoiceButton';

export { VoicePreview } from './VoicePreview';
export type { VoicePreviewProps } from './VoicePreview';
