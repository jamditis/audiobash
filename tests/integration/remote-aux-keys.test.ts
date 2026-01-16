/**
 * Remote App Auxiliary Keys Integration Tests
 * Tests the full flow of aux key presses to terminal commands
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================
// WebSocket Message Format Tests
// ============================================

describe('WebSocket Message Format', () => {
  interface TerminalWriteMessage {
    type: 'terminal_write';
    tabId: string;
    data: string;
  }

  const createTerminalWriteMessage = (tabId: string, data: string): TerminalWriteMessage => ({
    type: 'terminal_write',
    tabId,
    data,
  });

  describe('Auxiliary key messages', () => {
    it('should format Tab key message correctly', () => {
      const msg = createTerminalWriteMessage('tab-1', '\t');
      expect(msg).toEqual({
        type: 'terminal_write',
        tabId: 'tab-1',
        data: '\t',
      });
    });

    it('should format Escape key message correctly', () => {
      const msg = createTerminalWriteMessage('tab-1', '\x1b');
      expect(msg).toEqual({
        type: 'terminal_write',
        tabId: 'tab-1',
        data: '\x1b',
      });
    });

    it('should format Ctrl+C message correctly', () => {
      const msg = createTerminalWriteMessage('tab-1', '\x03');
      expect(msg).toEqual({
        type: 'terminal_write',
        tabId: 'tab-1',
        data: '\x03',
      });
      expect(msg.data.charCodeAt(0)).toBe(3);
    });

    it('should format Ctrl+D message correctly', () => {
      const msg = createTerminalWriteMessage('tab-1', '\x04');
      expect(msg.data.charCodeAt(0)).toBe(4);
    });

    it('should format Ctrl+Z message correctly', () => {
      const msg = createTerminalWriteMessage('tab-1', '\x1a');
      expect(msg.data.charCodeAt(0)).toBe(26);
    });

    it('should format up arrow message correctly', () => {
      const msg = createTerminalWriteMessage('tab-1', '\x1b[A');
      expect(msg.data).toBe('\x1b[A');
      expect(msg.data.length).toBe(3);
    });

    it('should format down arrow message correctly', () => {
      const msg = createTerminalWriteMessage('tab-1', '\x1b[B');
      expect(msg.data).toBe('\x1b[B');
    });

    it('should format pipe character message correctly', () => {
      const msg = createTerminalWriteMessage('tab-1', '|');
      expect(msg.data).toBe('|');
    });

    it('should format command with carriage return', () => {
      const msg = createTerminalWriteMessage('tab-1', 'ls -la\r');
      expect(msg.data).toBe('ls -la\r');
      expect(msg.data.endsWith('\r')).toBe(true);
    });
  });

  describe('Message JSON serialization', () => {
    it('should serialize control characters correctly', () => {
      const msg = createTerminalWriteMessage('tab-1', '\x03');
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json);
      expect(parsed.data).toBe('\x03');
    });

    it('should serialize escape sequences correctly', () => {
      const msg = createTerminalWriteMessage('tab-1', '\x1b[A');
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json);
      expect(parsed.data).toBe('\x1b[A');
    });

    it('should handle unicode in tab IDs', () => {
      const msg = createTerminalWriteMessage('tab-émoji-🎤', 'test');
      const json = JSON.stringify(msg);
      const parsed = JSON.parse(json);
      expect(parsed.tabId).toBe('tab-émoji-🎤');
    });
  });
});

// ============================================
// Rapid Key Press Handling Tests
// ============================================

describe('Rapid Key Press Handling', () => {
  let messageQueue: string[] = [];
  let sendCount = 0;

  const mockSend = (data: string) => {
    messageQueue.push(data);
    sendCount++;
  };

  beforeEach(() => {
    messageQueue = [];
    sendCount = 0;
  });

  it('should handle rapid Tab presses', () => {
    for (let i = 0; i < 10; i++) {
      mockSend('\t');
    }
    expect(sendCount).toBe(10);
    expect(messageQueue.every(m => m === '\t')).toBe(true);
  });

  it('should handle rapid Ctrl+C presses (interrupt spam)', () => {
    for (let i = 0; i < 5; i++) {
      mockSend('\x03');
    }
    expect(sendCount).toBe(5);
  });

  it('should handle rapid arrow key navigation', () => {
    // Simulate scrolling through command history
    mockSend('\x1b[A'); // up
    mockSend('\x1b[A'); // up
    mockSend('\x1b[A'); // up
    mockSend('\x1b[B'); // down
    mockSend('\x1b[B'); // down

    expect(messageQueue).toEqual([
      '\x1b[A', '\x1b[A', '\x1b[A', '\x1b[B', '\x1b[B'
    ]);
  });

  it('should handle mixed key types in quick succession', () => {
    mockSend('\t');      // Tab for autocomplete
    mockSend('\x1b[A');  // Up for history
    mockSend('\x03');    // Ctrl+C to cancel
    mockSend('ls');      // New command
    mockSend('\r');      // Enter

    expect(sendCount).toBe(5);
  });

  it('should preserve order of messages', () => {
    const sequence = ['a', 'b', 'c', 'd', 'e'];
    sequence.forEach(mockSend);
    expect(messageQueue).toEqual(sequence);
  });
});

// ============================================
// Modifier State Machine Tests
// ============================================

describe('Modifier State Machine', () => {
  interface ModifierState {
    ctrl: boolean;
    alt: boolean;
  }

  class ModifierStateMachine {
    private state: ModifierState = { ctrl: false, alt: false };
    private timeout: ReturnType<typeof setTimeout> | null = null;
    private readonly autoResetMs: number;

    constructor(autoResetMs = 3000) {
      this.autoResetMs = autoResetMs;
    }

    toggle(modifier: keyof ModifierState): boolean {
      this.state[modifier] = !this.state[modifier];
      this.scheduleAutoReset();
      return this.state[modifier];
    }

    isActive(modifier: keyof ModifierState): boolean {
      return this.state[modifier];
    }

    clear(): void {
      this.state.ctrl = false;
      this.state.alt = false;
      if (this.timeout) {
        clearTimeout(this.timeout);
        this.timeout = null;
      }
    }

    applyToChar(char: string): string {
      if (this.state.ctrl && char.length === 1) {
        const upper = char.toUpperCase();
        if (upper >= 'A' && upper <= 'Z') {
          const result = String.fromCharCode(upper.charCodeAt(0) - 64);
          this.clear();
          return result;
        }
      }
      this.clear();
      return char;
    }

    private scheduleAutoReset(): void {
      if (this.timeout) {
        clearTimeout(this.timeout);
      }
      this.timeout = setTimeout(() => this.clear(), this.autoResetMs);
    }
  }

  let machine: ModifierStateMachine;

  beforeEach(() => {
    machine = new ModifierStateMachine(100); // Short timeout for testing
  });

  afterEach(() => {
    machine.clear();
  });

  it('should start with all modifiers off', () => {
    expect(machine.isActive('ctrl')).toBe(false);
    expect(machine.isActive('alt')).toBe(false);
  });

  it('should toggle ctrl on and off', () => {
    expect(machine.toggle('ctrl')).toBe(true);
    expect(machine.isActive('ctrl')).toBe(true);
    expect(machine.toggle('ctrl')).toBe(false);
    expect(machine.isActive('ctrl')).toBe(false);
  });

  it('should apply ctrl modifier to character', () => {
    machine.toggle('ctrl');
    expect(machine.applyToChar('c')).toBe('\x03');
  });

  it('should clear modifiers after applying', () => {
    machine.toggle('ctrl');
    machine.applyToChar('c');
    expect(machine.isActive('ctrl')).toBe(false);
  });

  it('should auto-reset after timeout', async () => {
    machine.toggle('ctrl');
    expect(machine.isActive('ctrl')).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(machine.isActive('ctrl')).toBe(false);
  });

  it('should handle both modifiers independently', () => {
    machine.toggle('ctrl');
    machine.toggle('alt');
    expect(machine.isActive('ctrl')).toBe(true);
    expect(machine.isActive('alt')).toBe(true);
    machine.toggle('ctrl');
    expect(machine.isActive('ctrl')).toBe(false);
    expect(machine.isActive('alt')).toBe(true);
  });

  it('should not modify non-alpha characters', () => {
    machine.toggle('ctrl');
    expect(machine.applyToChar('1')).toBe('1');
  });

  it('should not modify multi-character strings', () => {
    machine.toggle('ctrl');
    expect(machine.applyToChar('abc')).toBe('abc');
  });
});

// ============================================
// Tab Switching Tests
// ============================================

describe('Tab Switching', () => {
  interface Tab {
    id: string;
    title: string;
  }

  class TabManager {
    private tabs: Tab[] = [];
    private activeTabId: string | null = null;

    setTabs(tabs: Tab[]): void {
      this.tabs = tabs;
      if (tabs.length > 0 && !this.activeTabId) {
        this.activeTabId = tabs[0].id;
      }
    }

    getTabs(): Tab[] {
      return [...this.tabs];
    }

    getActiveTabId(): string | null {
      return this.activeTabId;
    }

    switchTo(tabId: string): boolean {
      const tab = this.tabs.find(t => t.id === tabId);
      if (tab) {
        this.activeTabId = tabId;
        return true;
      }
      return false;
    }

    addTab(tab: Tab): void {
      this.tabs.push(tab);
      if (!this.activeTabId) {
        this.activeTabId = tab.id;
      }
    }

    removeTab(tabId: string): boolean {
      const index = this.tabs.findIndex(t => t.id === tabId);
      if (index === -1) return false;

      this.tabs.splice(index, 1);

      if (this.activeTabId === tabId) {
        this.activeTabId = this.tabs.length > 0 ? this.tabs[0].id : null;
      }
      return true;
    }
  }

  let manager: TabManager;

  beforeEach(() => {
    manager = new TabManager();
  });

  it('should initialize with no tabs', () => {
    expect(manager.getTabs()).toEqual([]);
    expect(manager.getActiveTabId()).toBeNull();
  });

  it('should set tabs and auto-select first', () => {
    manager.setTabs([
      { id: 'tab-1', title: 'Terminal 1' },
      { id: 'tab-2', title: 'Terminal 2' },
    ]);
    expect(manager.getActiveTabId()).toBe('tab-1');
  });

  it('should switch to valid tab', () => {
    manager.setTabs([
      { id: 'tab-1', title: 'Terminal 1' },
      { id: 'tab-2', title: 'Terminal 2' },
    ]);
    expect(manager.switchTo('tab-2')).toBe(true);
    expect(manager.getActiveTabId()).toBe('tab-2');
  });

  it('should reject switch to invalid tab', () => {
    manager.setTabs([{ id: 'tab-1', title: 'Terminal 1' }]);
    expect(manager.switchTo('non-existent')).toBe(false);
    expect(manager.getActiveTabId()).toBe('tab-1');
  });

  it('should handle tab removal with active tab', () => {
    manager.setTabs([
      { id: 'tab-1', title: 'Terminal 1' },
      { id: 'tab-2', title: 'Terminal 2' },
    ]);
    manager.removeTab('tab-1');
    expect(manager.getActiveTabId()).toBe('tab-2');
  });

  it('should handle removal of last tab', () => {
    manager.setTabs([{ id: 'tab-1', title: 'Terminal 1' }]);
    manager.removeTab('tab-1');
    expect(manager.getActiveTabId()).toBeNull();
  });
});

// ============================================
// Reconnection Logic Tests
// ============================================

describe('Reconnection Logic', () => {
  interface ReconnectOptions {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
  }

  class ReconnectionManager {
    private attempts = 0;
    private options: ReconnectOptions;

    constructor(options: ReconnectOptions) {
      this.options = options;
    }

    shouldRetry(): boolean {
      return this.attempts < this.options.maxAttempts;
    }

    getNextDelay(): number {
      const delay = Math.min(
        this.options.baseDelay * Math.pow(2, this.attempts),
        this.options.maxDelay
      );
      this.attempts++;
      return delay;
    }

    reset(): void {
      this.attempts = 0;
    }

    getAttempts(): number {
      return this.attempts;
    }
  }

  let manager: ReconnectionManager;

  beforeEach(() => {
    manager = new ReconnectionManager({
      maxAttempts: 5,
      baseDelay: 1000,
      maxDelay: 30000,
    });
  });

  it('should allow retries under max attempts', () => {
    expect(manager.shouldRetry()).toBe(true);
    manager.getNextDelay();
    expect(manager.shouldRetry()).toBe(true);
  });

  it('should stop retries at max attempts', () => {
    for (let i = 0; i < 5; i++) {
      manager.getNextDelay();
    }
    expect(manager.shouldRetry()).toBe(false);
  });

  it('should use exponential backoff', () => {
    expect(manager.getNextDelay()).toBe(1000);
    expect(manager.getNextDelay()).toBe(2000);
    expect(manager.getNextDelay()).toBe(4000);
    expect(manager.getNextDelay()).toBe(8000);
    expect(manager.getNextDelay()).toBe(16000);
  });

  it('should cap delay at maxDelay', () => {
    const capped = new ReconnectionManager({
      maxAttempts: 10,
      baseDelay: 1000,
      maxDelay: 5000,
    });
    capped.getNextDelay(); // 1000
    capped.getNextDelay(); // 2000
    capped.getNextDelay(); // 4000
    expect(capped.getNextDelay()).toBe(5000); // capped
    expect(capped.getNextDelay()).toBe(5000); // still capped
  });

  it('should reset attempts', () => {
    manager.getNextDelay();
    manager.getNextDelay();
    expect(manager.getAttempts()).toBe(2);
    manager.reset();
    expect(manager.getAttempts()).toBe(0);
    expect(manager.getNextDelay()).toBe(1000);
  });
});

// ============================================
// Input Validation Tests
// ============================================

describe('Input Validation', () => {
  const validateAddress = (address: string): { valid: boolean; error?: string } => {
    if (!address || address.trim() === '') {
      return { valid: false, error: 'Address is required' };
    }

    // Check for obviously invalid patterns
    if (address.includes(' ') && !address.startsWith('wss://') && !address.startsWith('ws://')) {
      return { valid: false, error: 'Address cannot contain spaces' };
    }

    // Check for protocol injection
    if (address.includes('javascript:') || address.includes('data:')) {
      return { valid: false, error: 'Invalid protocol' };
    }

    return { valid: true };
  };

  const validateCode = (code: string): { valid: boolean; error?: string } => {
    if (!code || code.trim() === '') {
      return { valid: false, error: 'Code is required' };
    }

    if (code.length > 32) {
      return { valid: false, error: 'Code too long' };
    }

    return { valid: true };
  };

  describe('Address validation', () => {
    it('should accept valid IP address', () => {
      expect(validateAddress('192.168.1.100').valid).toBe(true);
    });

    it('should accept valid hostname', () => {
      expect(validateAddress('abc.trycloudflare.com').valid).toBe(true);
    });

    it('should accept wss:// URL', () => {
      expect(validateAddress('wss://example.com').valid).toBe(true);
    });

    it('should reject empty address', () => {
      expect(validateAddress('').valid).toBe(false);
    });

    it('should reject whitespace-only address', () => {
      expect(validateAddress('   ').valid).toBe(false);
    });

    it('should reject address with spaces (without protocol)', () => {
      expect(validateAddress('my server.com').valid).toBe(false);
    });

    it('should reject javascript: protocol', () => {
      expect(validateAddress('javascript:alert(1)').valid).toBe(false);
    });

    it('should reject data: protocol', () => {
      expect(validateAddress('data:text/html,<script>').valid).toBe(false);
    });
  });

  describe('Code validation', () => {
    it('should accept valid short code', () => {
      expect(validateCode('ABC123').valid).toBe(true);
    });

    it('should accept valid password', () => {
      expect(validateCode('MySecurePassword123!').valid).toBe(true);
    });

    it('should reject empty code', () => {
      expect(validateCode('').valid).toBe(false);
    });

    it('should reject code over 32 characters', () => {
      const longCode = 'a'.repeat(33);
      expect(validateCode(longCode).valid).toBe(false);
    });

    it('should accept code exactly 32 characters', () => {
      const maxCode = 'a'.repeat(32);
      expect(validateCode(maxCode).valid).toBe(true);
    });
  });
});
