/**
 * Notification Sound Tests
 * Tests for CLI input prompt detection and pattern matching
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Unmock so we test the real module (setup.ts mocks it globally)
vi.unmock('../../src/utils/notificationSound');

import {
  checkForCliInputPrompt,
  resetOutputBuffer,
  CLI_INPUT_PATTERNS,
  stripAnsi,
  preWarmAudioContext,
  playNotificationSound,
} from '../../src/utils/notificationSound';

describe('notificationSound', () => {
  beforeEach(() => {
    resetOutputBuffer('test-tab');
  });

  describe('stripAnsi', () => {
    it('removes color codes', () => {
      expect(stripAnsi('\x1b[31mred text\x1b[0m')).toBe('red text');
    });

    it('removes cursor positioning', () => {
      expect(stripAnsi('\x1b[1;1HHello')).toBe('Hello');
    });

    it('removes bold/underline', () => {
      expect(stripAnsi('\x1b[1mbold\x1b[22m')).toBe('bold');
    });

    it('passes through plain text unchanged', () => {
      expect(stripAnsi('plain text')).toBe('plain text');
    });

    it('handles mixed ANSI and text', () => {
      const input = '\x1b[36m?\x1b[39m Allow tool? \x1b[1m[Y/n]\x1b[22m';
      expect(stripAnsi(input)).toBe('? Allow tool? [Y/n]');
    });
  });

  describe('checkForCliInputPrompt', () => {
    describe('Claude Code prompts', () => {
      it('detects [Y/n] at end of line', () => {
        expect(checkForCliInputPrompt('Allow tool? [Y/n]', 'test-tab')).toBe(true);
      });

      it('detects [Y/n] with trailing whitespace', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Allow tool? [Y/n]  \n', 'test-tab')).toBe(true);
      });

      it('detects [y/N] format', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Continue? [y/N]', 'test-tab')).toBe(true);
      });

      it('detects "Allow <tool>? [Y/n]" pattern', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Allow Bash? [Y/n]', 'test-tab')).toBe(true);
      });

      it('detects "Do you want to proceed?" pattern', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Do you want to proceed? ', 'test-tab')).toBe(true);
      });

      it('detects "Allow tool" pattern', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Allow tool use', 'test-tab')).toBe(true);
      });

      it('detects "Allow once" pattern', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Allow once', 'test-tab')).toBe(true);
      });

      it('detects "Approve?" pattern', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Approve?', 'test-tab')).toBe(true);
      });

      it('detects [Y/n] with ANSI codes', () => {
        resetOutputBuffer('test-tab');
        const ansiPrompt = '\x1b[36m?\x1b[39m Allow Bash? \x1b[1m[Y/n]\x1b[22m';
        expect(checkForCliInputPrompt(ansiPrompt, 'test-tab')).toBe(true);
      });

      it('detects prompt arriving in multiple chunks', () => {
        resetOutputBuffer('test-tab');
        checkForCliInputPrompt('Compiling...\nDone.\n', 'test-tab');
        expect(checkForCliInputPrompt('Allow Edit? [Y/n]', 'test-tab')).toBe(true);
      });
    });

    describe('Claude Code TUI selection menus', () => {
      it('detects "Use arrow keys" prompt', () => {
        resetOutputBuffer('test-tab');
        expect(
          checkForCliInputPrompt('? Allow tool? (Use arrow keys)\n❯ Yes\n  No', 'test-tab'),
        ).toBe(true);
      });

      it('detects inquirer-style ❯ Yes selection', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('❯ Yes', 'test-tab')).toBe(true);
      });

      it('detects ASCII > Allow selection', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('> Allow', 'test-tab')).toBe(true);
      });
    });

    describe('Codex CLI prompts', () => {
      it('detects (a)pprove format', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('(a)pprove, (d)eny, (e)dit', 'test-tab')).toBe(true);
      });

      it('detects "approve, deny" format', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('approve, deny', 'test-tab')).toBe(true);
      });
    });

    describe('Gemini CLI prompts', () => {
      it('detects "Do you want to run" prompt', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Do you want to run this command?', 'test-tab')).toBe(true);
      });

      it('detects "Execute this" prompt', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Execute this command?', 'test-tab')).toBe(true);
      });
    });

    describe('npm/yarn prompts', () => {
      it('detects "Ok to proceed? (y/n)"', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Ok to proceed? (y/n)', 'test-tab')).toBe(true);
      });

      it('detects "Is this OK?"', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Is this OK?', 'test-tab')).toBe(true);
      });
    });

    describe('generic prompts', () => {
      it('detects "Press Enter to continue"', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Press Enter to continue', 'test-tab')).toBe(true);
      });

      it('detects "Press any key"', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Press any key to continue', 'test-tab')).toBe(true);
      });

      it('detects (y/n) at end of line', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Overwrite? (y/n)', 'test-tab')).toBe(true);
      });

      it('detects (yes/no) at end of line', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Save changes? (yes/no)', 'test-tab')).toBe(true);
      });

      it('detects sudo password prompt', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('[sudo] password for user:', 'test-tab')).toBe(true);
      });

      it('detects Password: prompt', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Password:', 'test-tab')).toBe(true);
      });
    });

    describe('git prompts', () => {
      it('detects git (y/n)?', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('Are you sure (y/n)?', 'test-tab')).toBe(true);
      });
    });

    describe('false positive avoidance', () => {
      it('does not trigger on normal output text', () => {
        resetOutputBuffer('test-tab');
        expect(
          checkForCliInputPrompt('Building project...\nCompiling 42 files\n', 'test-tab'),
        ).toBe(false);
      });

      it('does not trigger on file listings', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('src/index.ts\nsrc/app.ts\npackage.json\n', 'test-tab')).toBe(
          false,
        );
      });

      it('does not trigger on empty input', () => {
        resetOutputBuffer('test-tab');
        expect(checkForCliInputPrompt('', 'test-tab')).toBe(false);
      });
    });

    describe('buffer management', () => {
      it('clears buffer after detecting a prompt', () => {
        resetOutputBuffer('test-tab');
        // First detection
        expect(checkForCliInputPrompt('Allow? [Y/n]', 'test-tab')).toBe(true);
        // Same data shouldn't re-trigger because buffer was cleared
        expect(checkForCliInputPrompt('some normal output\n', 'test-tab')).toBe(false);
      });

      it('uses per-terminal buffers', () => {
        resetOutputBuffer('tab-1');
        resetOutputBuffer('tab-2');
        // Send partial prompt to tab-1
        checkForCliInputPrompt('Allow? [Y/', 'tab-1');
        // Send unrelated data to tab-2
        checkForCliInputPrompt('compiling...\n', 'tab-2');
        // Complete the prompt on tab-1 — should still match
        expect(checkForCliInputPrompt('n]', 'tab-1')).toBe(true);
        // tab-2 should not have matched
        resetOutputBuffer('tab-1');
        resetOutputBuffer('tab-2');
      });

      it('handles buffer overflow gracefully', () => {
        resetOutputBuffer('test-tab');
        // Fill buffer with noise
        const noise = 'x'.repeat(3000);
        checkForCliInputPrompt(noise, 'test-tab');
        // Should still detect prompt after noise
        expect(checkForCliInputPrompt('\nAllow? [Y/n]', 'test-tab')).toBe(true);
      });
    });
  });

  describe('CLI_INPUT_PATTERNS', () => {
    it('exports patterns array', () => {
      expect(Array.isArray(CLI_INPUT_PATTERNS)).toBe(true);
      expect(CLI_INPUT_PATTERNS.length).toBeGreaterThan(10);
    });

    it('all patterns are RegExp objects', () => {
      for (const pattern of CLI_INPUT_PATTERNS) {
        expect(pattern).toBeInstanceOf(RegExp);
      }
    });
  });

  describe('preWarmAudioContext', () => {
    let mockResume: ReturnType<typeof vi.fn>;
    let constructorCalls: number;

    beforeEach(async () => {
      // Re-import the module fresh so the cached audioContext is null
      vi.resetModules();
      constructorCalls = 0;
      mockResume = vi.fn().mockResolvedValue(undefined);

      class MockAudioContext {
        state = 'suspended';
        resume = mockResume;
        currentTime = 0;
        destination = {};
        constructor() {
          constructorCalls++;
        }
        createOscillator() {
          return {
            type: '',
            frequency: { setValueAtTime: vi.fn() },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          };
        }
        createGain() {
          return {
            gain: {
              setValueAtTime: vi.fn(),
              linearRampToValueAtTime: vi.fn(),
              exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
          };
        }
      }
      vi.stubGlobal('AudioContext', MockAudioContext);
    });

    it('creates and resumes AudioContext', async () => {
      const mod = await import('../../src/utils/notificationSound');
      await mod.preWarmAudioContext();
      expect(constructorCalls).toBe(1);
      expect(mockResume).toHaveBeenCalled();
    });

    it('is idempotent - does not create a second context', async () => {
      const mod = await import('../../src/utils/notificationSound');
      await mod.preWarmAudioContext();
      await mod.preWarmAudioContext();
      expect(constructorCalls).toBe(1);
    });

    it('skips resume when context is already running', async () => {
      class RunningAudioContext {
        state = 'running';
        resume = mockResume;
        currentTime = 0;
        destination = {};
        createOscillator() {
          return {
            type: '',
            frequency: { setValueAtTime: vi.fn() },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          };
        }
        createGain() {
          return {
            gain: {
              setValueAtTime: vi.fn(),
              linearRampToValueAtTime: vi.fn(),
              exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
          };
        }
      }
      vi.stubGlobal('AudioContext', RunningAudioContext);
      const mod = await import('../../src/utils/notificationSound');
      await mod.preWarmAudioContext();
      expect(mockResume).not.toHaveBeenCalled();
    });
  });

  describe('playNotificationSound fallback', () => {
    beforeEach(async () => {
      vi.resetModules();

      class MockAudioContext {
        state = 'running';
        resume = vi.fn().mockResolvedValue(undefined);
        currentTime = 0;
        destination = {};
        createOscillator() {
          return {
            type: '',
            frequency: { setValueAtTime: vi.fn() },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          };
        }
        createGain() {
          return {
            gain: {
              setValueAtTime: vi.fn(),
              linearRampToValueAtTime: vi.fn(),
              exponentialRampToValueAtTime: vi.fn(),
            },
            connect: vi.fn(),
          };
        }
      }
      vi.stubGlobal('AudioContext', MockAudioContext);
    });

    it('uses oscillator fallback, not Audio element', async () => {
      const audioSpy = vi.fn();
      vi.stubGlobal('Audio', audioSpy);

      const mod = await import('../../src/utils/notificationSound');
      mod.playNotificationSound();

      // The fallback should NOT create an Audio element
      expect(audioSpy).not.toHaveBeenCalled();
    });
  });

  describe('debug flag', () => {
    it('reads from localStorage', () => {
      localStorage.setItem('audiobash-debug-notifications', 'true');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      resetOutputBuffer('debug-test');
      checkForCliInputPrompt('Allow? [Y/n]', 'debug-test');

      // When debug is enabled, we should see debug output
      const debugCalls = consoleSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('[Notification]'),
      );
      expect(debugCalls.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
      localStorage.removeItem('audiobash-debug-notifications');
    });

    it('does not log when debug is disabled', () => {
      localStorage.removeItem('audiobash-debug-notifications');
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      resetOutputBuffer('debug-test-off');
      checkForCliInputPrompt('Allow? [Y/n]', 'debug-test-off');

      const debugCalls = consoleSpy.mock.calls.filter(
        (args) => typeof args[0] === 'string' && args[0].includes('[Notification]'),
      );
      expect(debugCalls.length).toBe(0);

      consoleSpy.mockRestore();
    });
  });
});
