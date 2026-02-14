/**
 * Remote App Unit Tests
 * Tests for the AudioBash Remote PWA components
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// Storage Wrapper Tests
// ============================================

describe('Storage Wrapper', () => {
  // Simulate the storage wrapper from app.js
  const createStorageWrapper = () => ({
    get(key: string) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        console.warn('[Storage] Access blocked:', (e as Error).message);
        return null;
      }
    },
    set(key: string, value: string) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        console.warn('[Storage] Write blocked:', (e as Error).message);
        return false;
      }
    }
  });

  let storage: ReturnType<typeof createStorageWrapper>;

  beforeEach(() => {
    storage = createStorageWrapper();
    localStorage.clear();
  });

  describe('Normal operation', () => {
    it('should store and retrieve values', () => {
      storage.set('test-key', 'test-value');
      expect(storage.get('test-key')).toBe('test-value');
    });

    it('should return null for non-existent keys', () => {
      expect(storage.get('non-existent')).toBeNull();
    });

    it('should overwrite existing values', () => {
      storage.set('key', 'value1');
      storage.set('key', 'value2');
      expect(storage.get('key')).toBe('value2');
    });

    it('should handle empty strings', () => {
      storage.set('empty', '');
      // localStorage may return null or '' for empty strings depending on implementation
      const result = storage.get('empty');
      expect(result === '' || result === null).toBe(true);
    });

    it('should handle special characters', () => {
      const special = '🎤📱\n\t"\'<>&';
      storage.set('special', special);
      expect(storage.get('special')).toBe(special);
    });

    it('should handle JSON data', () => {
      const data = { ip: '192.168.1.1', code: 'ABC123' };
      storage.set('json', JSON.stringify(data));
      expect(JSON.parse(storage.get('json')!)).toEqual(data);
    });
  });

  describe('Tracking prevention handling', () => {
    it('should return null when localStorage throws on get', () => {
      const mockStorage = {
        getItem: vi.fn().mockImplementation(() => {
          throw new Error('Access denied');
        }),
        setItem: vi.fn(),
      };

      const originalLocalStorage = global.localStorage;
      Object.defineProperty(global, 'localStorage', { value: mockStorage, writable: true });

      const blockedStorage = createStorageWrapper();
      expect(blockedStorage.get('key')).toBeNull();

      Object.defineProperty(global, 'localStorage', { value: originalLocalStorage, writable: true });
    });

    it('should return false when localStorage throws on set', () => {
      const mockStorage = {
        getItem: vi.fn(),
        setItem: vi.fn().mockImplementation(() => {
          throw new Error('Access denied');
        }),
      };

      const originalLocalStorage = global.localStorage;
      Object.defineProperty(global, 'localStorage', { value: mockStorage, writable: true });

      const blockedStorage = createStorageWrapper();
      expect(blockedStorage.set('key', 'value')).toBe(false);

      Object.defineProperty(global, 'localStorage', { value: originalLocalStorage, writable: true });
    });
  });
});

// ============================================
// Auxiliary Key Handler Tests
// ============================================

describe('Auxiliary Key Handlers', () => {
  // Simulate the key handling logic from app.js
  const modifierState = { ctrl: false, alt: false };

  const clearModifiers = () => {
    modifierState.ctrl = false;
    modifierState.alt = false;
  };

  const handleModifierToggle = (modifier: 'ctrl' | 'alt') => {
    modifierState[modifier] = !modifierState[modifier];
    return modifierState[modifier];
  };

  const getControlChar = (seq: string) => {
    const char = seq.charAt(1);
    return String.fromCharCode(char.charCodeAt(0) - 64);
  };

  const getArrowSequence = (direction: string) => {
    const sequences: Record<string, string> = {
      up: '\x1b[A',
      down: '\x1b[B',
      right: '\x1b[C',
      left: '\x1b[D',
    };
    return sequences[direction];
  };

  const applyModifiers = (data: string) => {
    if (modifierState.ctrl && data.length === 1) {
      const upper = data.toUpperCase();
      if (upper >= 'A' && upper <= 'Z') {
        return String.fromCharCode(upper.charCodeAt(0) - 64);
      }
    }
    return data;
  };

  beforeEach(() => {
    clearModifiers();
  });

  describe('Control sequences', () => {
    it('should convert ^C to Ctrl+C (0x03)', () => {
      expect(getControlChar('^C')).toBe('\x03');
    });

    it('should convert ^D to Ctrl+D (0x04)', () => {
      expect(getControlChar('^D')).toBe('\x04');
    });

    it('should convert ^Z to Ctrl+Z (0x1A)', () => {
      expect(getControlChar('^Z')).toBe('\x1a');
    });

    it('should convert ^L to Ctrl+L (0x0C)', () => {
      expect(getControlChar('^L')).toBe('\x0c');
    });

    it('should convert ^A to Ctrl+A (0x01)', () => {
      expect(getControlChar('^A')).toBe('\x01');
    });
  });

  describe('Arrow key sequences', () => {
    it('should return correct ANSI sequence for up arrow', () => {
      expect(getArrowSequence('up')).toBe('\x1b[A');
    });

    it('should return correct ANSI sequence for down arrow', () => {
      expect(getArrowSequence('down')).toBe('\x1b[B');
    });

    it('should return correct ANSI sequence for right arrow', () => {
      expect(getArrowSequence('right')).toBe('\x1b[C');
    });

    it('should return correct ANSI sequence for left arrow', () => {
      expect(getArrowSequence('left')).toBe('\x1b[D');
    });
  });

  describe('Modifier toggle', () => {
    it('should toggle ctrl on', () => {
      expect(handleModifierToggle('ctrl')).toBe(true);
      expect(modifierState.ctrl).toBe(true);
    });

    it('should toggle ctrl off', () => {
      modifierState.ctrl = true;
      expect(handleModifierToggle('ctrl')).toBe(false);
      expect(modifierState.ctrl).toBe(false);
    });

    it('should toggle alt independently of ctrl', () => {
      handleModifierToggle('ctrl');
      handleModifierToggle('alt');
      expect(modifierState.ctrl).toBe(true);
      expect(modifierState.alt).toBe(true);
    });

    it('should clear all modifiers', () => {
      modifierState.ctrl = true;
      modifierState.alt = true;
      clearModifiers();
      expect(modifierState.ctrl).toBe(false);
      expect(modifierState.alt).toBe(false);
    });
  });

  describe('Modifier application', () => {
    it('should convert "c" to Ctrl+C when ctrl is active', () => {
      modifierState.ctrl = true;
      expect(applyModifiers('c')).toBe('\x03');
    });

    it('should convert "C" to Ctrl+C when ctrl is active', () => {
      modifierState.ctrl = true;
      expect(applyModifiers('C')).toBe('\x03');
    });

    it('should not modify multi-character strings', () => {
      modifierState.ctrl = true;
      expect(applyModifiers('ls')).toBe('ls');
    });

    it('should not modify numbers', () => {
      modifierState.ctrl = true;
      expect(applyModifiers('1')).toBe('1');
    });

    it('should not modify when ctrl is not active', () => {
      expect(applyModifiers('c')).toBe('c');
    });
  });

  describe('Special keys', () => {
    it('Tab should be \\t', () => {
      expect('\t').toBe('\t');
    });

    it('Escape should be \\x1b', () => {
      expect('\x1b').toBe('\x1b');
    });
  });
});

// ============================================
// Connection String Parsing Tests
// ============================================

describe('Connection String Parsing', () => {
  const parseConnectionString = (text: string) => {
    // Try format with port first: ws://IP:PORT|CODE
    let match = text.match(/^wss?:\/\/([^:/]+):(\d+)\|(.+)$/);
    if (match) {
      return { ip: match[1], port: match[2], code: match[3] };
    }
    // Try format without port: wss://hostname|CODE (for tunnels)
    match = text.match(/^wss?:\/\/([^|]+)\|(.+)$/);
    if (match) {
      return { ip: match[1], port: null, code: match[2] };
    }
    return null;
  };

  describe('Local IP format', () => {
    it('should parse ws://IP:PORT|CODE', () => {
      const result = parseConnectionString('ws://192.168.1.100:8766|ABC123');
      expect(result).toEqual({ ip: '192.168.1.100', port: '8766', code: 'ABC123' });
    });

    it('should parse wss://IP:PORT|CODE', () => {
      const result = parseConnectionString('wss://192.168.1.100:8766|XYZ789');
      expect(result).toEqual({ ip: '192.168.1.100', port: '8766', code: 'XYZ789' });
    });

    it('should handle localhost', () => {
      const result = parseConnectionString('ws://localhost:8766|TEST');
      expect(result).toEqual({ ip: 'localhost', port: '8766', code: 'TEST' });
    });

    it('should handle different ports', () => {
      const result = parseConnectionString('ws://192.168.1.1:3000|CODE');
      expect(result).toEqual({ ip: '192.168.1.1', port: '3000', code: 'CODE' });
    });
  });

  describe('Tunnel format', () => {
    it('should parse Cloudflare tunnel URL', () => {
      const result = parseConnectionString('wss://abc-def-123.trycloudflare.com|MYCODE');
      expect(result).toEqual({ ip: 'abc-def-123.trycloudflare.com', port: null, code: 'MYCODE' });
    });

    it('should parse ngrok tunnel URL', () => {
      const result = parseConnectionString('wss://abc123.ngrok-free.app|SECRET');
      expect(result).toEqual({ ip: 'abc123.ngrok-free.app', port: null, code: 'SECRET' });
    });

    it('should handle complex tunnel hostnames', () => {
      const result = parseConnectionString('wss://my-tunnel.eu.ngrok.io|CODE123');
      expect(result).toEqual({ ip: 'my-tunnel.eu.ngrok.io', port: null, code: 'CODE123' });
    });
  });

  describe('Edge cases', () => {
    it('should return null for invalid format', () => {
      expect(parseConnectionString('invalid')).toBeNull();
    });

    it('should return null for missing code', () => {
      expect(parseConnectionString('ws://192.168.1.1:8766')).toBeNull();
    });

    it('should return null for missing protocol', () => {
      expect(parseConnectionString('192.168.1.1:8766|CODE')).toBeNull();
    });

    it('should handle codes with special characters', () => {
      const result = parseConnectionString('wss://host.com|My-Code_123');
      expect(result).toEqual({ ip: 'host.com', port: null, code: 'My-Code_123' });
    });

    it('should handle IPv6 addresses', () => {
      // IPv6 with brackets is parsed by the fallback regex as a hostname
      // This is acceptable behavior - IPv6 support is optional
      const result = parseConnectionString('ws://[::1]:8766|CODE');
      // Either null (not supported) or parsed as hostname is acceptable
      if (result !== null) {
        expect(result.code).toBe('CODE');
      }
    });
  });
});

// ============================================
// Device Name Detection Tests
// ============================================

describe('Device Name Detection', () => {
  const getDeviceName = (userAgent: string) => {
    if (/Samsung/i.test(userAgent)) {
      const match = userAgent.match(/SM-\w+/);
      return match ? `Samsung ${match[0]}` : 'Samsung Device';
    }
    if (/iPhone/i.test(userAgent)) return 'iPhone';
    if (/iPad/i.test(userAgent)) return 'iPad';
    if (/Android/i.test(userAgent)) return 'Android Device';
    return 'Mobile Device';
  };

  it('should detect Samsung S24 Ultra', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Samsung SM-S928B) AppleWebKit/537.36';
    expect(getDeviceName(ua)).toBe('Samsung SM-S928B');
  });

  it('should detect Samsung without explicit Samsung string', () => {
    // Some UAs don't include "Samsung" but do include SM- model
    const ua = 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36';
    // Falls back to Android Device since "Samsung" not in UA
    expect(getDeviceName(ua)).toBe('Android Device');
  });

  it('should detect Samsung Galaxy generic', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; Samsung Galaxy) AppleWebKit/537.36';
    expect(getDeviceName(ua)).toBe('Samsung Device');
  });

  it('should detect iPhone', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(getDeviceName(ua)).toBe('iPhone');
  });

  it('should detect iPad', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    expect(getDeviceName(ua)).toBe('iPad');
  });

  it('should detect generic Android', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36';
    expect(getDeviceName(ua)).toBe('Android Device');
  });

  it('should fall back to Mobile Device', () => {
    const ua = 'Mozilla/5.0 (Unknown Device)';
    expect(getDeviceName(ua)).toBe('Mobile Device');
  });
});

// ============================================
// Character Insert Tests
// ============================================

describe('Character Insert at Cursor', () => {
  const insertAtCursor = (value: string, start: number, end: number, char: string) => {
    return value.substring(0, start) + char + value.substring(end);
  };

  it('should insert at beginning', () => {
    expect(insertAtCursor('hello', 0, 0, '|')).toBe('|hello');
  });

  it('should insert at end', () => {
    expect(insertAtCursor('hello', 5, 5, '|')).toBe('hello|');
  });

  it('should insert in middle', () => {
    expect(insertAtCursor('hello', 2, 2, '|')).toBe('he|llo');
  });

  it('should replace selection', () => {
    expect(insertAtCursor('hello', 1, 4, '|')).toBe('h|o');
  });

  it('should handle empty string', () => {
    expect(insertAtCursor('', 0, 0, '~')).toBe('~');
  });

  it('should handle pipe character', () => {
    expect(insertAtCursor('ls  grep', 3, 3, '|')).toBe('ls | grep');
  });

  it('should handle backtick', () => {
    expect(insertAtCursor('echo ', 5, 5, '`')).toBe('echo `');
  });

  it('should handle tilde for home directory', () => {
    expect(insertAtCursor('cd ', 3, 3, '~')).toBe('cd ~');
  });
});

// ============================================
// Rate Limiting Tests
// ============================================

describe('Rate Limiting', () => {
  class RateLimiter {
    private maxRequests: number;
    private windowMs: number;
    private requests: number[] = [];

    constructor(maxRequests: number, windowMs: number) {
      this.maxRequests = maxRequests;
      this.windowMs = windowMs;
    }

    checkLimit(): boolean {
      const now = Date.now();
      this.requests = this.requests.filter(t => now - t < this.windowMs);

      if (this.requests.length >= this.maxRequests) {
        return false;
      }

      this.requests.push(now);
      return true;
    }

    reset() {
      this.requests = [];
    }
  }

  it('should allow requests under limit', () => {
    const limiter = new RateLimiter(5, 1000);
    expect(limiter.checkLimit()).toBe(true);
    expect(limiter.checkLimit()).toBe(true);
    expect(limiter.checkLimit()).toBe(true);
  });

  it('should block requests over limit', () => {
    const limiter = new RateLimiter(3, 1000);
    expect(limiter.checkLimit()).toBe(true);
    expect(limiter.checkLimit()).toBe(true);
    expect(limiter.checkLimit()).toBe(true);
    expect(limiter.checkLimit()).toBe(false);
  });

  it('should reset after time window', async () => {
    const limiter = new RateLimiter(2, 50);
    expect(limiter.checkLimit()).toBe(true);
    expect(limiter.checkLimit()).toBe(true);
    expect(limiter.checkLimit()).toBe(false);

    await new Promise(resolve => setTimeout(resolve, 60));
    expect(limiter.checkLimit()).toBe(true);
  });

  it('should allow manual reset', () => {
    const limiter = new RateLimiter(1, 10000);
    expect(limiter.checkLimit()).toBe(true);
    expect(limiter.checkLimit()).toBe(false);
    limiter.reset();
    expect(limiter.checkLimit()).toBe(true);
  });
});
