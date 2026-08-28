/**
 * Vitest Test Setup
 * Global mocks and configurations for all tests
 */

import { vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// =============================================================================
// Mock Electron APIs
// =============================================================================

export interface MockElectronAPI {
  writeToTerminal: ReturnType<typeof vi.fn>;
  onTerminalData: ReturnType<typeof vi.fn>;
  resizeTerminal: ReturnType<typeof vi.fn>;
  sendToTerminal: ReturnType<typeof vi.fn>;
  closeTab: ReturnType<typeof vi.fn>;
  createNewTab: ReturnType<typeof vi.fn>;
  getApiKeys: ReturnType<typeof vi.fn>;
  saveApiKeys: ReturnType<typeof vi.fn>;
  whisperSetModel: ReturnType<typeof vi.fn>;
  whisperTranscribe: ReturnType<typeof vi.fn>;
  saveTempAudio: ReturnType<typeof vi.fn>;
  getSettings: ReturnType<typeof vi.fn>;
  saveSettings: ReturnType<typeof vi.fn>;
  getPlatform: ReturnType<typeof vi.fn>;
  getShell: ReturnType<typeof vi.fn>;
  minimize: ReturnType<typeof vi.fn>;
  maximize: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  transcribeWithGemini: ReturnType<typeof vi.fn>;
  transcribeWithOpenAI: ReturnType<typeof vi.fn>;
  transcribeWithAnthropic: ReturnType<typeof vi.fn>;
  transcribeWithElevenLabs: ReturnType<typeof vi.fn>;
  cancelTranscription: ReturnType<typeof vi.fn>;
}

export function createMockElectronAPI(): MockElectronAPI {
  return {
    writeToTerminal: vi.fn(),
    onTerminalData: vi.fn(() => vi.fn()), // Returns cleanup function
    resizeTerminal: vi.fn(),
    sendToTerminal: vi.fn(),
    closeTab: vi.fn(),
    createNewTab: vi.fn(() => Promise.resolve({ tabId: 'mock-tab-1' })),
    getApiKeys: vi.fn(() => Promise.resolve({})),
    saveApiKeys: vi.fn(() => Promise.resolve()),
    whisperSetModel: vi.fn(() => Promise.resolve()),
    whisperTranscribe: vi.fn(() => Promise.resolve({ text: 'mock transcription' })),
    saveTempAudio: vi.fn(() => Promise.resolve({ success: true, path: '/tmp/audio.webm' })),
    getSettings: vi.fn(() => Promise.resolve({})),
    saveSettings: vi.fn(() => Promise.resolve()),
    getPlatform: vi.fn(() => 'linux'),
    getShell: vi.fn(() => '/bin/bash'),
    minimize: vi.fn(),
    maximize: vi.fn(),
    close: vi.fn(),
    transcribeWithGemini: vi.fn(),
    transcribeWithOpenAI: vi.fn(),
    transcribeWithAnthropic: vi.fn(),
    transcribeWithElevenLabs: vi.fn(),
    cancelTranscription: vi.fn(() => Promise.resolve({ cancelled: true })),
  };
}

// Global mock electron API
const mockElectronAPI = createMockElectronAPI();

// Attach to window in browser-environment tests. Main-process tests use the Node environment.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'electron', {
    value: mockElectronAPI,
    writable: true,
    configurable: true,
  });
}

// =============================================================================
// Mock xterm.js
// =============================================================================

export class MockTerminal {
  options: Record<string, unknown> = {};
  cols = 80;
  rows = 24;
  private onDataCallbacks: Array<(data: string) => void> = [];
  private onSelectionCallbacks: Array<() => void> = [];
  private buffer: string[] = [];

  constructor(options?: Record<string, unknown>) {
    this.options = options || {};
  }

  open = vi.fn();
  dispose = vi.fn();
  focus = vi.fn();
  write = vi.fn((data: string) => {
    this.buffer.push(data);
  });
  writeln = vi.fn((data: string) => {
    this.buffer.push(data + '\n');
  });
  clear = vi.fn(() => {
    this.buffer = [];
  });
  getSelection = vi.fn(() => '');
  loadAddon = vi.fn();

  onData = vi.fn((callback: (data: string) => void) => {
    this.onDataCallbacks.push(callback);
    return { dispose: vi.fn() };
  });

  onSelectionChange = vi.fn((callback: () => void) => {
    this.onSelectionCallbacks.push(callback);
    return { dispose: vi.fn() };
  });

  // Test helpers
  simulateInput(data: string): void {
    this.onDataCallbacks.forEach((cb) => cb(data));
  }

  getBuffer(): string[] {
    return this.buffer;
  }
}

export class MockFitAddon {
  fit = vi.fn();
  proposeDimensions = vi.fn(() => ({ cols: 80, rows: 24 }));
}

// Mock xterm modules - use factory functions
vi.mock('@xterm/xterm', () => {
  return {
    Terminal: class {
      options: Record<string, unknown> = {};
      cols = 80;
      rows = 24;
      private onDataCallbacks: Array<(data: string) => void> = [];
      private onSelectionCallbacks: Array<() => void> = [];

      constructor(options?: Record<string, unknown>) {
        this.options = options || {};
      }

      open = vi.fn();
      dispose = vi.fn();
      focus = vi.fn();
      write = vi.fn();
      writeln = vi.fn();
      clear = vi.fn();
      getSelection = vi.fn(() => '');
      loadAddon = vi.fn();

      onData = vi.fn((callback: (data: string) => void) => {
        this.onDataCallbacks.push(callback);
        return { dispose: vi.fn() };
      });

      onSelectionChange = vi.fn((callback: () => void) => {
        this.onSelectionCallbacks.push(callback);
        return { dispose: vi.fn() };
      });
    },
  };
});

vi.mock('@xterm/addon-fit', () => {
  return {
    FitAddon: class {
      fit = vi.fn();
      proposeDimensions = vi.fn(() => ({ cols: 80, rows: 24 }));
    },
  };
});

// =============================================================================
// Mock Browser APIs
// =============================================================================

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });
}

// Mock ResizeObserver
class MockResizeObserver {
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();

  // Test helper to trigger resize
  trigger(entries: Partial<ResizeObserverEntry>[] = []): void {
    this.callback(entries as ResizeObserverEntry[], this);
  }
}

if (typeof window !== 'undefined') {
  window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
}

// Mock requestAnimationFrame - use setTimeout to prevent infinite loops
let rafId = 0;
if (typeof window !== 'undefined') {
  window.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = ++rafId;
    // Don't execute immediately to prevent stack overflow in components
    // that check container dimensions and retry
    Promise.resolve().then(() => callback(performance.now()));
    return id;
  });

  window.cancelAnimationFrame = vi.fn();

  // Mock getBoundingClientRect to return valid dimensions
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    bottom: 600,
    right: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));

  // Mock clipboard
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn(() => Promise.resolve()),
      readText: vi.fn(() => Promise.resolve('')),
    },
    writable: true,
  });
}

// Mock MediaRecorder
export class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: { error: Error }) => void) | null = null;

  constructor(public stream: MediaStream) {}

  start = vi.fn(() => {
    this.state = 'recording';
  });

  stop = vi.fn(() => {
    this.state = 'inactive';
    // Simulate data available event
    if (this.ondataavailable) {
      this.ondataavailable({ data: new Blob(['mock audio'], { type: 'audio/webm' }) });
    }
    if (this.onstop) {
      this.onstop();
    }
  });

  pause = vi.fn(() => {
    this.state = 'paused';
  });

  resume = vi.fn(() => {
    this.state = 'recording';
  });

  static isTypeSupported = vi.fn(() => true);
}

if (typeof window !== 'undefined') {
  window.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder;
}

// Mock MediaDevices
const mockMediaDevices = {
  getUserMedia: vi.fn(() =>
    Promise.resolve({
      getTracks: () => [
        {
          stop: vi.fn(),
          kind: 'audio',
        },
      ],
    } as unknown as MediaStream),
  ),
  enumerateDevices: vi.fn(() =>
    Promise.resolve([
      { deviceId: 'default', kind: 'audioinput', label: 'Default Microphone', groupId: '1' },
      { deviceId: 'mic-2', kind: 'audioinput', label: 'External Microphone', groupId: '2' },
    ]),
  ),
};

if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: mockMediaDevices,
    writable: true,
  });
}

// =============================================================================
// Mock fetch for API tests
// =============================================================================

export interface MockFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  headers: Headers;
}

export function createMockFetch(responses: Map<string, MockFetchResponse>): typeof fetch {
  return vi.fn((url: string | URL | Request) => {
    const urlString = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const response = responses.get(urlString);

    if (response) {
      return Promise.resolve(response as Response);
    }

    return Promise.resolve({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ error: 'Not Found' }),
      text: () => Promise.resolve('Not Found'),
      headers: new Headers(),
    } as Response);
  });
}

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock audio blob for testing
 */
export function createMockAudioBlob(sizeKB = 10): Blob {
  const data = new Uint8Array(sizeKB * 1024);
  return new Blob([data], { type: 'audio/webm' });
}

/**
 * Create mock terminal context
 */
export function createMockTerminalContext() {
  return {
    cwd: '/home/user/project',
    recentOutput: 'user@host:~$ ls\nfile1.txt  file2.txt\n',
    os: 'linux' as const,
    shell: '/bin/bash',
    lastCommand: 'ls',
  };
}

/**
 * Wait for async effects
 */
export function waitForEffects(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Flush all pending promises
 */
export async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// =============================================================================
// Global Test Lifecycle
// =============================================================================

beforeEach(() => {
  // Reset all mocks
  vi.clearAllMocks();

  // Clear localStorage
  localStorageMock.clear();

  // Reset electron API mock in browser-environment tests.
  if (typeof window !== 'undefined') {
    Object.assign(window.electron, createMockElectronAPI());
  }
});

afterEach(() => {
  // Clean up any remaining timers
  vi.clearAllTimers();
});

// =============================================================================
// Mock logger utility
// =============================================================================

vi.mock('../src/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    category: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
  terminalLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  voiceLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  transcriptionLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  appLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  previewLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  ipcLog: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    category: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

// =============================================================================
// Mock notification sound utility
// =============================================================================

vi.mock('../src/utils/notificationSound', () => ({
  playNotificationSound: vi.fn(),
  checkForCliInputPrompt: vi.fn(() => false),
  resetOutputBuffer: vi.fn(),
  preWarmAudioContext: vi.fn().mockResolvedValue(undefined),
}));

// =============================================================================
// Export mocks for direct usage in tests
// =============================================================================

export { mockElectronAPI, localStorageMock, mockMediaDevices };
