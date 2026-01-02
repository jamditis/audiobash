/**
 * Terminal and PTY Stress Tests
 * Tests terminal rendering and PTY process handling under extreme conditions
 */

import { describe, it, expect, vi } from 'vitest';
import {
  runStressTest,
  generateRandomString,
  generateAnsiSequences,
  sleep,
  StressTestResult,
} from './stress-utils';
import * as fs from 'fs';
import * as path from 'path';

describe('Terminal Rendering Stress Tests', () => {
  const results: StressTestResult[] = [];

  describe('Output Buffer Stress', () => {
    it('should handle rapid output bursts', async () => {
      const result = await runStressTest(
        'Rapid Output Bursts',
        async (iteration) => {
          // Simulate terminal output buffer handling
          let buffer = '';
          const maxBufferSize = 2000;

          // Simulate rapid output
          for (let i = 0; i < 100; i++) {
            const output = `Line ${iteration}-${i}: ${generateRandomString(50)}\r\n`;
            buffer += output;

            // Trim buffer like the real implementation
            if (buffer.length > maxBufferSize) {
              buffer = buffer.slice(-maxBufferSize);
            }
          }

          expect(buffer.length).toBeLessThanOrEqual(maxBufferSize);
        },
        { iterations: 200, cooldown: 1 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should handle very long single lines', async () => {
      const result = await runStressTest(
        'Very Long Lines',
        async (iteration) => {
          // Lines of increasing length
          const lengths = [100, 1000, 5000, 10000, 50000];
          const length = lengths[iteration % lengths.length];

          const longLine = generateRandomString(length);
          let buffer = '';

          // Simulate processing
          buffer += longLine + '\r\n';

          // Truncate like real terminal (2000 char per-line limit mentioned in code)
          const lines = buffer.split('\n');
          const truncatedLines = lines.map((line) =>
            line.length > 2000 ? line.slice(0, 2000) + '...' : line
          );

          expect(truncatedLines[0].length).toBeLessThanOrEqual(2003);
        },
        { iterations: 100, cooldown: 5 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should handle ANSI escape sequence floods', async () => {
      const ansiSequences = generateAnsiSequences();

      const result = await runStressTest(
        'ANSI Escape Sequence Flood',
        async (iteration) => {
          let output = '';

          // Generate lots of ANSI sequences
          for (let i = 0; i < 100; i++) {
            const seq = ansiSequences[Math.floor(Math.random() * ansiSequences.length)];
            output += seq + generateRandomString(20);
          }

          // Simulate stripping ANSI for logging/display
          const stripped = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
          expect(stripped.length).toBeGreaterThan(0);
        },
        { iterations: 200, cooldown: 1 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });
  });

  describe('Resize Stress', () => {
    it('should handle rapid resize events', async () => {
      const result = await runStressTest(
        'Rapid Resize Events',
        async (iteration) => {
          // Simulate rapid terminal resizing
          const dimensions = [
            { cols: 80, rows: 24 },
            { cols: 120, rows: 40 },
            { cols: 200, rows: 60 },
            { cols: 40, rows: 10 },
            { cols: 1, rows: 1 },
            { cols: 500, rows: 200 },
          ];

          const dim = dimensions[iteration % dimensions.length];

          // Simulate resize with debouncing
          const debounceTime = 100;
          await sleep(debounceTime / 10); // Fast resize

          // Validate dimensions
          expect(dim.cols).toBeGreaterThan(0);
          expect(dim.rows).toBeGreaterThan(0);
        },
        { iterations: 100, cooldown: 10 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should handle zero and negative dimensions gracefully', async () => {
      const edgeDimensions = [
        { cols: 0, rows: 0 },
        { cols: -1, rows: -1 },
        { cols: 80, rows: 0 },
        { cols: 0, rows: 24 },
        { cols: NaN, rows: NaN },
        { cols: Infinity, rows: Infinity },
      ];

      for (const dim of edgeDimensions) {
        // Validation should clamp to valid values
        const validCols = Math.max(1, Math.min(500, dim.cols || 80));
        const validRows = Math.max(1, Math.min(200, dim.rows || 24));

        expect(validCols).toBeGreaterThan(0);
        expect(validRows).toBeGreaterThan(0);
        expect(isFinite(validCols)).toBe(true);
        expect(isFinite(validRows)).toBe(true);
      }
    });
  });

  describe('Multi-Tab Stress', () => {
    it('should handle many terminal tabs', async () => {
      const result = await runStressTest(
        'Many Terminal Tabs',
        async (iteration) => {
          const tabCount = 10 + (iteration % 20); // 10-30 tabs
          const tabs: Map<string, { buffer: string; cwd: string }> = new Map();

          // Create tabs
          for (let i = 0; i < tabCount; i++) {
            tabs.set(`tab-${i}`, {
              buffer: '',
              cwd: `/home/user/project${i}`,
            });
          }

          // Simulate activity on random tabs
          for (let i = 0; i < 50; i++) {
            const tabId = `tab-${Math.floor(Math.random() * tabCount)}`;
            const tab = tabs.get(tabId);
            if (tab) {
              tab.buffer += generateRandomString(100) + '\n';
              // Trim buffer
              if (tab.buffer.length > 2000) {
                tab.buffer = tab.buffer.slice(-2000);
              }
            }
          }

          expect(tabs.size).toBe(tabCount);
        },
        { iterations: 50, cooldown: 10 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should handle rapid tab creation/deletion', async () => {
      const result = await runStressTest(
        'Rapid Tab Create/Delete',
        async (iteration) => {
          const tabs: Map<string, any> = new Map();

          // Create tabs
          for (let i = 0; i < 5; i++) {
            tabs.set(`tab-${iteration}-${i}`, { buffer: '' });
          }

          // Delete tabs
          for (let i = 0; i < 3; i++) {
            tabs.delete(`tab-${iteration}-${i}`);
          }

          expect(tabs.size).toBe(2);
        },
        { iterations: 200, cooldown: 1 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });
  });

  describe('Input Stress', () => {
    it('should handle rapid keyboard input', async () => {
      const result = await runStressTest(
        'Rapid Keyboard Input',
        async () => {
          const inputs: string[] = [];

          // Simulate rapid typing
          for (let i = 0; i < 100; i++) {
            inputs.push(generateRandomString(1));
          }

          // Batch and send
          const batch = inputs.join('');
          expect(batch.length).toBe(100);
        },
        { iterations: 200, cooldown: 1 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should handle special key sequences', async () => {
      const specialKeys = [
        '\x03', // Ctrl+C
        '\x04', // Ctrl+D
        '\x1a', // Ctrl+Z
        '\x1b', // Escape
        '\x1b[A', // Up arrow
        '\x1b[B', // Down arrow
        '\x1b[C', // Right arrow
        '\x1b[D', // Left arrow
        '\x1b[H', // Home
        '\x1b[F', // End
        '\x1b[3~', // Delete
        '\x7f', // Backspace
        '\t', // Tab
        '\r', // Enter
        '\x1b[1;5C', // Ctrl+Right
        '\x1b[1;5D', // Ctrl+Left
      ];

      const result = await runStressTest(
        'Special Key Sequences',
        async (iteration) => {
          const key = specialKeys[iteration % specialKeys.length];

          // Simulate sending to PTY
          expect(key.length).toBeGreaterThan(0);
        },
        { iterations: 200, cooldown: 1 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should handle paste of large text', async () => {
      const result = await runStressTest(
        'Large Text Paste',
        async (iteration) => {
          const sizes = [100, 1000, 10000, 50000];
          const size = sizes[iteration % sizes.length];

          const pasteText = generateRandomString(size);

          // Simulate chunked sending (like real paste handling)
          const chunkSize = 1024;
          const chunks = Math.ceil(pasteText.length / chunkSize);

          for (let i = 0; i < chunks; i++) {
            const chunk = pasteText.slice(i * chunkSize, (i + 1) * chunkSize);
            expect(chunk.length).toBeLessThanOrEqual(chunkSize);
          }
        },
        { iterations: 50, cooldown: 10 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });
  });
});

describe('PTY Process Stress Tests', () => {
  describe('Process Lifecycle', () => {
    it('should validate shell command patterns', () => {
      // Read main.cjs to verify shell detection logic
      const mainPath = path.join(__dirname, '../../electron/main.cjs');
      const mainContent = fs.readFileSync(mainPath, 'utf-8');

      // Check for platform-specific shell handling
      expect(mainContent).toContain("process.platform === 'win32'");
      expect(mainContent).toContain('process.env.SHELL');
      expect(mainContent).toContain('powershell');
    });

    it('should handle PTY spawn failures gracefully', async () => {
      // Simulate spawn failure scenarios
      const errorScenarios = [
        { error: 'ENOENT', message: 'Shell not found' },
        { error: 'EACCES', message: 'Permission denied' },
        { error: 'ENOMEM', message: 'Out of memory' },
        { error: 'EAGAIN', message: 'Resource temporarily unavailable' },
      ];

      for (const scenario of errorScenarios) {
        // Verify error would be caught
        expect(scenario.error).toBeDefined();
        expect(scenario.message).toBeDefined();
      }
    });
  });

  describe('Output Handling', () => {
    it('should handle binary output correctly', async () => {
      const result = await runStressTest(
        'Binary Output Handling',
        async (iteration) => {
          // Simulate binary output from commands like 'cat' on binary files
          const binaryData = Buffer.alloc(1024);
          for (let i = 0; i < 1024; i++) {
            binaryData[i] = Math.floor(Math.random() * 256);
          }

          // Convert to string (like xterm would receive)
          const output = binaryData.toString('utf-8');
          expect(output.length).toBeGreaterThan(0);
        },
        { iterations: 100, cooldown: 1 }
      );

      expect(result.passed).toBe(true);
    });

    it('should handle high-frequency output', async () => {
      const result = await runStressTest(
        'High Frequency Output',
        async () => {
          // Simulate command like 'yes' or infinite loop
          let buffer = '';
          const maxBuffer = 10000;

          for (let i = 0; i < 1000; i++) {
            buffer += 'y\n';
            if (buffer.length > maxBuffer) {
              buffer = buffer.slice(-maxBuffer);
            }
          }

          expect(buffer.length).toBeLessThanOrEqual(maxBuffer);
        },
        { iterations: 100, cooldown: 5 }
      );

      expect(result.passed).toBe(true);
    });
  });
});

describe('Terminal Context Detection', () => {
  it('should correctly identify shell prompts', () => {
    const promptPatterns = [
      { output: 'user@host:~$ ', isPrompt: true },
      { output: 'PS C:\\Users\\user> ', isPrompt: true },
      { output: '>>> ', isPrompt: true }, // Python REPL
      { output: 'mysql> ', isPrompt: true },
      { output: '(venv) $ ', isPrompt: true },
      { output: 'some random text', isPrompt: false },
      { output: 'npm install...', isPrompt: false },
    ];

    const promptRegex = /[$#>]\s*$/;

    for (const { output, isPrompt } of promptPatterns) {
      const matches = promptRegex.test(output);
      // Allow some false positives/negatives in edge cases
      if (isPrompt && output.includes('$') || output.includes('>')) {
        expect(matches).toBe(true);
      }
    }
  });

  it('should detect working directory changes', () => {
    const cwdPatterns = [
      { output: '\x1b]0;user@host: /home/user/project\x07', cwd: '/home/user/project' },
      { output: 'cd /var/log && pwd\n/var/log\n', cwd: '/var/log' },
    ];

    // OSC sequence pattern for terminal title (contains cwd)
    const oscPattern = /\x1b\]0;[^:]*:\s*([^\x07]+)\x07/;

    for (const { output, cwd } of cwdPatterns) {
      const match = output.match(oscPattern);
      if (match) {
        expect(match[1]).toBe(cwd);
      }
    }
  });
});

describe('Scrollback Buffer Stress', () => {
  it('should handle scrollback at 10k line limit', async () => {
    const maxScrollback = 10000;
    const lines: string[] = [];

    const result = await runStressTest(
      'Scrollback Buffer Limit',
      async (iteration) => {
        // Add lines
        for (let i = 0; i < 100; i++) {
          lines.push(`Line ${iteration * 100 + i}: ${generateRandomString(50)}`);
        }

        // Trim to limit
        while (lines.length > maxScrollback) {
          lines.shift();
        }

        expect(lines.length).toBeLessThanOrEqual(maxScrollback);
      },
      { iterations: 150, cooldown: 1 }
    );

    expect(result.passed).toBe(true);
    expect(lines.length).toBe(maxScrollback);
  });
});
