/**
 * Remote App Edge Case Tests
 * Tests for unusual conditions, error states, and boundary conditions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Offline Mode Tests
// ============================================

describe('Edge Case: Offline Mode', () => {
  describe('Service Worker caching', () => {
    it('should serve cached index.html when offline', async () => {
      const cache = new Map<string, string>();
      cache.set('/remote/', '<html>Cached App</html>');
      cache.set('/remote/index.html', '<html>Cached App</html>');

      const fetchFromCache = (url: string): string | null => {
        return cache.get(url) || null;
      };

      const networkFetch = async (url: string): Promise<string> => {
        throw new Error('Network offline');
      };

      const fetchWithFallback = async (url: string): Promise<string> => {
        try {
          return await networkFetch(url);
        } catch {
          const cached = fetchFromCache(url);
          if (cached) return cached;
          throw new Error('Not in cache');
        }
      };

      const result = await fetchWithFallback('/remote/');
      expect(result).toBe('<html>Cached App</html>');
    });

    it('should queue messages when offline', () => {
      const messageQueue: string[] = [];
      let isOnline = false;

      const send = (data: string): boolean => {
        if (!isOnline) {
          messageQueue.push(data);
          return false;
        }
        // Actually send
        return true;
      };

      // Offline - messages queue
      send('message1');
      send('message2');
      expect(messageQueue.length).toBe(2);

      // Come online - flush queue
      isOnline = true;
      const flushed = [...messageQueue];
      messageQueue.length = 0;
      expect(flushed).toEqual(['message1', 'message2']);
    });

    it('should show offline indicator', () => {
      let statusText = 'Connected';

      const updateStatus = (online: boolean) => {
        statusText = online ? 'Connected' : 'Offline - Reconnecting...';
      };

      updateStatus(false);
      expect(statusText).toBe('Offline - Reconnecting...');

      updateStatus(true);
      expect(statusText).toBe('Connected');
    });
  });

  describe('Connection state transitions', () => {
    type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

    const validTransitions: Record<ConnectionState, ConnectionState[]> = {
      'disconnected': ['connecting'],
      'connecting': ['connected', 'disconnected', 'offline'],
      'connected': ['disconnected', 'reconnecting', 'offline'],
      'reconnecting': ['connected', 'disconnected', 'offline'],
      'offline': ['reconnecting', 'disconnected'],
    };

    const canTransition = (from: ConnectionState, to: ConnectionState): boolean => {
      return validTransitions[from]?.includes(to) ?? false;
    };

    it('should allow valid state transitions', () => {
      expect(canTransition('disconnected', 'connecting')).toBe(true);
      expect(canTransition('connecting', 'connected')).toBe(true);
      expect(canTransition('connected', 'reconnecting')).toBe(true);
    });

    it('should reject invalid state transitions', () => {
      expect(canTransition('disconnected', 'connected')).toBe(false);
      expect(canTransition('connecting', 'reconnecting')).toBe(false);
      expect(canTransition('offline', 'connected')).toBe(false);
    });
  });
});

// ============================================
// Malformed Data Tests
// ============================================

describe('Edge Case: Malformed Data', () => {
  describe('Invalid JSON handling', () => {
    const safeJSONParse = (text: string): { ok: boolean; data?: any; error?: string } => {
      try {
        const data = JSON.parse(text);
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    };

    it('should handle truncated JSON', () => {
      const result = safeJSONParse('{"type":"terminal_data","data":"hel');
      expect(result.ok).toBe(false);
    });

    it('should handle completely invalid JSON', () => {
      const result = safeJSONParse('not json at all');
      expect(result.ok).toBe(false);
    });

    it('should handle empty string', () => {
      const result = safeJSONParse('');
      expect(result.ok).toBe(false);
    });

    it('should handle null literal', () => {
      const result = safeJSONParse('null');
      expect(result.ok).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should handle array instead of object', () => {
      const result = safeJSONParse('[1, 2, 3]');
      expect(result.ok).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should handle deeply nested JSON', () => {
      const deep = '{"a":'.repeat(100) + '1' + '}'.repeat(100);
      const result = safeJSONParse(deep);
      expect(result.ok).toBe(true);
    });

    it('should handle unicode in JSON', () => {
      const result = safeJSONParse('{"emoji":"🎤","chinese":"中文"}');
      expect(result.ok).toBe(true);
      expect(result.data.emoji).toBe('🎤');
    });

    it('should handle escape sequences', () => {
      const result = safeJSONParse('{"text":"line1\\nline2\\ttab"}');
      expect(result.ok).toBe(true);
      expect(result.data.text).toBe('line1\nline2\ttab');
    });
  });

  describe('Invalid message types', () => {
    interface Message {
      type: string;
      [key: string]: any;
    }

    const validateMessage = (msg: any): { valid: boolean; error?: string } => {
      if (typeof msg !== 'object' || msg === null) {
        return { valid: false, error: 'Message must be an object' };
      }

      if (typeof msg.type !== 'string') {
        return { valid: false, error: 'Message must have string type' };
      }

      const knownTypes = ['terminal_data', 'terminal_write', 'tabs_update', 'image_upload', 'auth'];
      if (!knownTypes.includes(msg.type)) {
        return { valid: false, error: `Unknown message type: ${msg.type}` };
      }

      return { valid: true };
    };

    it('should reject message without type', () => {
      const result = validateMessage({ data: 'test' });
      expect(result.valid).toBe(false);
    });

    it('should reject message with numeric type', () => {
      const result = validateMessage({ type: 123 });
      expect(result.valid).toBe(false);
    });

    it('should reject unknown message type', () => {
      const result = validateMessage({ type: 'unknown_type' });
      expect(result.valid).toBe(false);
    });

    it('should accept valid message type', () => {
      const result = validateMessage({ type: 'terminal_data', data: 'test' });
      expect(result.valid).toBe(true);
    });

    it('should handle null message', () => {
      const result = validateMessage(null);
      expect(result.valid).toBe(false);
    });

    it('should handle array message', () => {
      const result = validateMessage([{ type: 'terminal_data' }]);
      expect(result.valid).toBe(false);
    });
  });

  describe('Malformed terminal data', () => {
    const sanitizeTerminalData = (data: any): string => {
      if (typeof data !== 'string') {
        return String(data ?? '');
      }

      // Remove null bytes which can break terminal
      let sanitized = data.replace(/\0/g, '');

      // Limit length to prevent memory issues
      const MAX_LENGTH = 1000000;  // 1MB
      if (sanitized.length > MAX_LENGTH) {
        sanitized = sanitized.substring(0, MAX_LENGTH);
      }

      return sanitized;
    };

    it('should convert number to string', () => {
      expect(sanitizeTerminalData(123)).toBe('123');
    });

    it('should handle null', () => {
      expect(sanitizeTerminalData(null)).toBe('');
    });

    it('should handle undefined', () => {
      expect(sanitizeTerminalData(undefined)).toBe('');
    });

    it('should handle object', () => {
      expect(sanitizeTerminalData({ foo: 'bar' })).toBe('[object Object]');
    });

    it('should remove null bytes', () => {
      expect(sanitizeTerminalData('hello\0world')).toBe('helloworld');
    });

    it('should truncate very long strings', () => {
      const long = 'x'.repeat(2000000);
      const result = sanitizeTerminalData(long);
      expect(result.length).toBe(1000000);
    });

    it('should preserve ANSI escape codes', () => {
      const ansi = '\x1b[32mGreen\x1b[0m';
      expect(sanitizeTerminalData(ansi)).toBe(ansi);
    });
  });
});

// ============================================
// Boundary Condition Tests
// ============================================

describe('Edge Case: Boundary Conditions', () => {
  describe('Tab limits', () => {
    const MAX_TABS = 10;

    it('should enforce maximum tab count', () => {
      const tabs: string[] = [];

      const addTab = (id: string): boolean => {
        if (tabs.length >= MAX_TABS) return false;
        tabs.push(id);
        return true;
      };

      for (let i = 0; i < 15; i++) {
        addTab(`tab-${i}`);
      }

      expect(tabs.length).toBe(MAX_TABS);
    });

    it('should handle tab ID edge cases', () => {
      const tabs = new Map<string, { title: string }>();

      // Empty ID
      tabs.set('', { title: 'Empty ID' });
      expect(tabs.has('')).toBe(true);

      // Very long ID
      const longId = 'x'.repeat(1000);
      tabs.set(longId, { title: 'Long ID' });
      expect(tabs.has(longId)).toBe(true);

      // Unicode ID
      tabs.set('tab-🎤', { title: 'Emoji ID' });
      expect(tabs.has('tab-🎤')).toBe(true);
    });
  });

  describe('Command length limits', () => {
    const MAX_COMMAND_LENGTH = 8192;

    const validateCommand = (cmd: string): { valid: boolean; truncated?: string } => {
      if (cmd.length <= MAX_COMMAND_LENGTH) {
        return { valid: true };
      }
      return {
        valid: false,
        truncated: cmd.substring(0, MAX_COMMAND_LENGTH),
      };
    };

    it('should accept command at max length', () => {
      const cmd = 'x'.repeat(MAX_COMMAND_LENGTH);
      expect(validateCommand(cmd).valid).toBe(true);
    });

    it('should reject command over max length', () => {
      const cmd = 'x'.repeat(MAX_COMMAND_LENGTH + 1);
      const result = validateCommand(cmd);
      expect(result.valid).toBe(false);
      expect(result.truncated?.length).toBe(MAX_COMMAND_LENGTH);
    });

    it('should handle empty command', () => {
      expect(validateCommand('').valid).toBe(true);
    });
  });

  describe('Pairing code validation', () => {
    const validatePairingCode = (code: string): { valid: boolean; error?: string } => {
      if (!code || code.length === 0) {
        return { valid: false, error: 'Code required' };
      }

      if (code.length < 4) {
        return { valid: false, error: 'Code too short' };
      }

      if (code.length > 32) {
        return { valid: false, error: 'Code too long' };
      }

      return { valid: true };
    };

    it('should reject empty code', () => {
      expect(validatePairingCode('').valid).toBe(false);
    });

    it('should reject very short code', () => {
      expect(validatePairingCode('AB').valid).toBe(false);
    });

    it('should accept minimum length code', () => {
      expect(validatePairingCode('ABCD').valid).toBe(true);
    });

    it('should accept maximum length code', () => {
      expect(validatePairingCode('x'.repeat(32)).valid).toBe(true);
    });

    it('should reject over-length code', () => {
      expect(validatePairingCode('x'.repeat(33)).valid).toBe(false);
    });
  });

  describe('Image upload limits', () => {
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024;  // 10MB
    const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

    interface ImageValidation {
      valid: boolean;
      error?: string;
    }

    const validateImage = (size: number, type: string): ImageValidation => {
      if (!ALLOWED_TYPES.includes(type)) {
        return { valid: false, error: 'Invalid image type' };
      }

      if (size > MAX_IMAGE_SIZE) {
        return { valid: false, error: 'Image too large' };
      }

      if (size === 0) {
        return { valid: false, error: 'Empty file' };
      }

      return { valid: true };
    };

    it('should reject oversized image', () => {
      const result = validateImage(15 * 1024 * 1024, 'image/png');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('should accept image at max size', () => {
      const result = validateImage(MAX_IMAGE_SIZE, 'image/png');
      expect(result.valid).toBe(true);
    });

    it('should reject non-image type', () => {
      const result = validateImage(1024, 'text/plain');
      expect(result.valid).toBe(false);
    });

    it('should reject empty file', () => {
      const result = validateImage(0, 'image/png');
      expect(result.valid).toBe(false);
    });

    it('should accept all valid image types', () => {
      ALLOWED_TYPES.forEach(type => {
        expect(validateImage(1024, type).valid).toBe(true);
      });
    });
  });
});

// ============================================
// Race Condition Tests
// ============================================

describe('Edge Case: Race Conditions', () => {
  describe('Double-click prevention', () => {
    let lastClickTime = 0;
    const DEBOUNCE_MS = 300;

    const handleClick = (): boolean => {
      const now = Date.now();
      if (now - lastClickTime < DEBOUNCE_MS) {
        return false;  // Ignored
      }
      lastClickTime = now;
      return true;  // Processed
    };

    beforeEach(() => {
      lastClickTime = 0;
    });

    it('should process first click', () => {
      expect(handleClick()).toBe(true);
    });

    it('should ignore rapid second click', () => {
      handleClick();
      expect(handleClick()).toBe(false);
    });

    it('should process click after debounce', async () => {
      handleClick();
      await new Promise(r => setTimeout(r, 350));
      expect(handleClick()).toBe(true);
    });
  });

  describe('Concurrent WebSocket operations', () => {
    let isConnecting = false;
    let connectionPromise: Promise<boolean> | null = null;

    // Note: This is NOT an async function to ensure the same promise instance is returned
    const connect = (): Promise<boolean> => {
      if (isConnecting && connectionPromise) {
        // Return existing promise to prevent double connection
        return connectionPromise;
      }

      isConnecting = true;
      connectionPromise = new Promise(resolve => {
        setTimeout(() => {
          isConnecting = false;
          resolve(true);
        }, 100);
      });

      return connectionPromise;
    };

    beforeEach(() => {
      isConnecting = false;
      connectionPromise = null;
    });

    it('should prevent concurrent connection attempts', async () => {
      const promise1 = connect();
      const promise2 = connect();

      // Both should resolve to the same promise (deduplication pattern)
      expect(promise1).toBe(promise2);

      await promise1;
    });
  });

  describe('Tab switch during command send', () => {
    it('should send command to correct tab despite switch', () => {
      let activeTab = 'tab-1';
      const sentMessages: { tab: string; data: string }[] = [];

      const sendCommand = (data: string) => {
        // Capture tab at time of send
        const targetTab = activeTab;
        sentMessages.push({ tab: targetTab, data });
      };

      sendCommand('command1');
      activeTab = 'tab-2';  // Switch mid-operation
      sendCommand('command2');

      expect(sentMessages[0].tab).toBe('tab-1');
      expect(sentMessages[1].tab).toBe('tab-2');
    });
  });
});

// ============================================
// Error State Tests
// ============================================

describe('Edge Case: Error States', () => {
  describe('Authentication errors', () => {
    type AuthError = 'invalid_code' | 'expired_code' | 'too_many_attempts' | 'server_error';

    const getErrorMessage = (error: AuthError): string => {
      const messages: Record<AuthError, string> = {
        invalid_code: 'Invalid pairing code. Please check and try again.',
        expired_code: 'Pairing code has expired. Generate a new code in AudioBash settings.',
        too_many_attempts: 'Too many failed attempts. Please wait 5 minutes.',
        server_error: 'Server error. Please try again later.',
      };
      return messages[error];
    };

    it('should provide user-friendly error messages', () => {
      expect(getErrorMessage('invalid_code')).toContain('Invalid');
      expect(getErrorMessage('expired_code')).toContain('expired');
      expect(getErrorMessage('too_many_attempts')).toContain('wait');
    });
  });

  describe('WebSocket error handling', () => {
    const classifyError = (code: number): 'auth' | 'network' | 'server' | 'unknown' => {
      if (code === 1000) return 'auth';  // Normal close (could be auth failure)
      if (code === 1001) return 'network';  // Going away
      if (code === 1006) return 'network';  // Abnormal close
      if (code === 1008) return 'auth';  // Policy violation
      if (code === 1011) return 'server';  // Server error
      if (code >= 4000 && code < 4100) return 'auth';  // Custom auth errors
      if (code >= 4100 && code < 4200) return 'server';  // Custom server errors
      return 'unknown';
    };

    it('should classify code 1006 as network error', () => {
      expect(classifyError(1006)).toBe('network');
    });

    it('should classify code 1008 as auth error', () => {
      expect(classifyError(1008)).toBe('auth');
    });

    it('should classify code 1011 as server error', () => {
      expect(classifyError(1011)).toBe('server');
    });

    it('should classify custom auth codes', () => {
      expect(classifyError(4001)).toBe('auth');
      expect(classifyError(4099)).toBe('auth');
    });
  });

  describe('Recovery from error states', () => {
    it('should allow retry after error', () => {
      let errorCount = 0;
      let lastError: string | null = null;

      const handleError = (error: string) => {
        errorCount++;
        lastError = error;
      };

      const clearError = () => {
        lastError = null;
      };

      handleError('Connection failed');
      expect(lastError).toBe('Connection failed');

      clearError();
      expect(lastError).toBeNull();
      // User can now retry
    });

    it('should track error history for debugging', () => {
      const errorHistory: { time: number; error: string }[] = [];
      const MAX_HISTORY = 10;

      const logError = (error: string) => {
        errorHistory.push({ time: Date.now(), error });
        if (errorHistory.length > MAX_HISTORY) {
          errorHistory.shift();
        }
      };

      for (let i = 0; i < 15; i++) {
        logError(`Error ${i}`);
      }

      expect(errorHistory.length).toBe(MAX_HISTORY);
      expect(errorHistory[0].error).toBe('Error 5');  // Oldest kept
    });
  });
});

// ============================================
// Memory Leak Prevention Tests
// ============================================

describe('Edge Case: Memory Leaks', () => {
  describe('Event listener cleanup', () => {
    it('should track added listeners', () => {
      const listeners: Map<string, Function[]> = new Map();

      const addEventListener = (event: string, fn: Function) => {
        if (!listeners.has(event)) {
          listeners.set(event, []);
        }
        listeners.get(event)!.push(fn);
      };

      const removeEventListener = (event: string, fn: Function) => {
        const list = listeners.get(event);
        if (list) {
          const idx = list.indexOf(fn);
          if (idx >= 0) list.splice(idx, 1);
        }
      };

      const removeAllListeners = (event: string) => {
        listeners.delete(event);
      };

      const handler1 = () => {};
      const handler2 = () => {};

      addEventListener('click', handler1);
      addEventListener('click', handler2);
      expect(listeners.get('click')?.length).toBe(2);

      removeEventListener('click', handler1);
      expect(listeners.get('click')?.length).toBe(1);

      removeAllListeners('click');
      expect(listeners.has('click')).toBe(false);
    });
  });

  describe('Timer cleanup', () => {
    it('should clear all timers on disconnect', () => {
      const timers: ReturnType<typeof setTimeout>[] = [];

      const setManagedTimeout = (fn: Function, ms: number) => {
        const id = setTimeout(fn, ms);
        timers.push(id);
        return id;
      };

      const clearAllTimers = () => {
        timers.forEach(clearTimeout);
        timers.length = 0;
      };

      setManagedTimeout(() => {}, 1000);
      setManagedTimeout(() => {}, 2000);
      setManagedTimeout(() => {}, 3000);

      expect(timers.length).toBe(3);

      clearAllTimers();
      expect(timers.length).toBe(0);
    });
  });

  describe('Object reference cleanup', () => {
    it('should null references on dispose', () => {
      interface Component {
        terminal: any;
        wsManager: any;
        dispose: () => void;
      }

      const createComponent = (): Component => {
        let terminal: any = { write: () => {} };
        let wsManager: any = { send: () => {} };

        return {
          get terminal() { return terminal; },
          get wsManager() { return wsManager; },
          dispose() {
            terminal = null;
            wsManager = null;
          },
        };
      };

      const component = createComponent();
      expect(component.terminal).not.toBeNull();

      component.dispose();
      expect(component.terminal).toBeNull();
      expect(component.wsManager).toBeNull();
    });
  });
});
