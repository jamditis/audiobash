// TypeScript type declarations

export type ApiProvider = 'gemini' | 'openai' | 'anthropic' | 'elevenlabs';

export interface Shortcuts {
  toggleRecording: string;
  toggleWindow: string;
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
