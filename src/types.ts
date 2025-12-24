// TypeScript type declarations

export type ApiProvider = 'gemini' | 'openai' | 'anthropic' | 'elevenlabs';

export interface Shortcuts {
  toggleRecording: string;
  cancelRecording: string;
  toggleWindow: string;
  toggleMode: string;
  clearTerminal: string;
  cycleLayout: string;
  focusNextTerminal: string;
  focusPrevTerminal: string;
  bookmarkDirectory: string;
  resendLast: string;
  switchTab1: string;
  switchTab2: string;
  switchTab3: string;
  switchTab4: string;
  togglePreview: string;
  captureScreenshot: string;
}

export interface TerminalTab {
  id: string;
  title: string;
  isActive: boolean;
}

export interface CreateTerminalResult {
  success: boolean;
  pid?: number;
  tabId: string;
}

export interface CloseTerminalResult {
  success: boolean;
  tabId: string;
}

export interface TerminalCountResult {
  count: number;
  max: number;
}

export interface TerminalContextResult {
  cwd: string;
  recentOutput: string;
  os: 'windows' | 'linux' | 'mac';
  shell: string;
  lastCommand: string;
  lastError: string;
}

export interface DirectoriesResult {
  recent: string[];
  favorites: string[];
}

export interface BrowseDirectoryResult {
  success: boolean;
  path?: string;
}

export interface ShortcutValidationResult {
  valid: boolean;
  error?: string;
}

export interface SetShortcutsResult {
  success: boolean;
  error?: string;
}

export interface ElectronAPI {
  // Window controls
  minimize: () => void;
  maximize: () => void;
  close: () => void;

  // Terminal tab management
  createTerminal: (tabId: string) => Promise<CreateTerminalResult>;
  closeTerminal: (tabId: string) => Promise<CloseTerminalResult>;
  getTerminalCount: () => Promise<TerminalCountResult>;

  // Terminal I/O (with tabId)
  writeToTerminal: (tabId: string, data: string) => void;
  resizeTerminal: (tabId: string, cols: number, rows: number) => void;
  sendToTerminal: (tabId: string, text: string) => void;
  insertToTerminal: (tabId: string, text: string) => void;
  getTerminalContext: (tabId: string) => Promise<TerminalContextResult>;
  onTerminalData: (callback: (tabId: string, data: string) => void) => (() => void);
  onTerminalClosed: (callback: (tabId: string, exitCode: number, signal: number) => void) => (() => void);

  // Voice recording toggle
  onToggleRecording: (callback: () => void) => (() => void);
  onCancelRecording: (callback: () => void) => (() => void);

  // Quick actions
  onToggleMode: (callback: () => void) => (() => void);
  onClearTerminal: (callback: () => void) => (() => void);
  onCycleLayout: (callback: () => void) => (() => void);
  onFocusNextTerminal: (callback: () => void) => (() => void);
  onFocusPrevTerminal: (callback: () => void) => (() => void);
  onBookmarkDirectory: (callback: () => void) => (() => void);
  onResendLast: (callback: () => void) => (() => void);
  onSwitchTab: (callback: (index: number) => void) => (() => void);

  // Keyboard shortcuts
  getShortcuts: () => Promise<Shortcuts>;
  setShortcuts: (shortcuts: Partial<Shortcuts>) => Promise<SetShortcutsResult>;
  validateShortcut: (shortcut: string) => Promise<ShortcutValidationResult>;

  // API key management
  getApiKey: (provider?: ApiProvider) => Promise<string>;
  setApiKey: (key: string, provider?: ApiProvider) => Promise<boolean>;

  // Directory management
  getDirectories: () => Promise<DirectoriesResult>;
  addFavoriteDirectory: (dir: string) => Promise<{ success: boolean; error?: string }>;
  removeFavoriteDirectory: (dir: string) => Promise<{ success: boolean }>;
  cdToDirectory: (tabId: string, dir: string) => Promise<{ success: boolean; error?: string }>;
  browseDirectory: () => Promise<BrowseDirectoryResult>;

  // Preview pane
  capturePreview: (url: string, cwd: string) => Promise<ScreenshotResult>;
  watchFile: (filepath: string) => Promise<FileWatchResult>;
  unwatchFile: (watcherId: string) => Promise<{ success: boolean }>;
  validateFilePath: (filepath: string) => Promise<ValidatePathResult>;
  onFileChanged: (callback: (filepath: string) => void) => (() => void);
  onTogglePreview: (callback: () => void) => (() => void);
  onCaptureScreenshot: (callback: () => void) => (() => void);

  // Remote control (mobile companion)
  getRemoteStatus: () => Promise<RemoteStatus>;
  regeneratePairingCode: () => Promise<string | null>;
  setRemotePassword: (password: string) => Promise<boolean>;
  getRemotePassword: () => Promise<string>;
  setKeepAwake: (enabled: boolean) => Promise<boolean>;
  getKeepAwake: () => Promise<boolean>;
  onRemoteStatusChanged: (callback: (status: RemoteStatus) => void) => (() => void);
  onRemoteTranscriptionRequest: (callback: (request: RemoteTranscriptionRequest) => void) => (() => void);
  sendRemoteTranscriptionResult: (result: RemoteTranscriptionResult) => void;
  onRemoteSwitchTab: (callback: (tabId: string) => void) => (() => void);
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  duration?: number;
}

export interface AudioConfig {
  model: 'gemini' | 'parakeet';
  apiKey?: string;
}

// Preview Pane types
export type PreviewPosition = 'right' | 'bottom' | 'pane';
export type PreviewContentType = 'html' | 'localhost' | 'image' | 'markdown' | 'unknown';

export interface PreviewState {
  isVisible: boolean;
  url: string;
  position: PreviewPosition;
  autoRefresh: boolean;
}

export interface ScreenshotResult {
  success: boolean;
  path?: string;
  filename?: string;
  error?: string;
}

export interface FileWatchResult {
  success: boolean;
  watcherId?: string;
  error?: string;
}

export interface ValidatePathResult {
  valid: boolean;
  absolutePath?: string;
  error?: string;
}

// Remote control types
export interface RemoteStatus {
  running: boolean;
  port: number;
  pairingCode: string | null;
  staticPassword: string | null;
  hasStaticPassword: boolean;
  addresses: string[];
  connected: boolean;
  deviceName: string | null;
}

export interface RemoteTranscriptionRequest {
  requestId: string;
  audioBase64: string;
  tabId: string;
  mode: 'agent' | 'raw';
}

export interface RemoteTranscriptionResult {
  requestId: string;
  success: boolean;
  text?: string;
  executed?: boolean;
  error?: string;
}
