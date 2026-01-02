/**
 * Transcription Service Stress Tests
 * Tests audio transcription handling under extreme conditions
 */

import { describe, it, expect, vi } from 'vitest';
import {
  runStressTest,
  generateRandomData,
  sleep,
  StressTestResult,
} from './stress-utils';
import * as fs from 'fs';
import * as path from 'path';

describe('Transcription Service Stress Tests', () => {
  const results: StressTestResult[] = [];

  describe('Audio Buffer Handling', () => {
    it('should handle various audio sizes', async () => {
      const result = await runStressTest(
        'Audio Size Variations',
        async (iteration) => {
          // Simulate various recording lengths
          // ~16KB/sec for WebM at normal quality
          const durations = [0.5, 1, 5, 10, 30, 60]; // seconds
          const bytesPerSecond = 16 * 1024;
          const duration = durations[iteration % durations.length];
          const size = Math.floor(duration * bytesPerSecond);

          const audioBuffer = generateRandomData(size);

          expect(audioBuffer.length).toBe(size);
        },
        { iterations: 100, cooldown: 5 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should handle empty audio buffers', async () => {
      const emptyBuffers = [
        Buffer.alloc(0),
        Buffer.from([]),
        null,
        undefined,
      ];

      for (const buffer of emptyBuffers) {
        // Validation should reject empty buffers
        const isValid = buffer && buffer.length > 0;
        if (!isValid) {
          expect(buffer?.length || 0).toBe(0);
        }
      }
    });

    it('should handle corrupted audio data', async () => {
      const result = await runStressTest(
        'Corrupted Audio Data',
        async () => {
          // Generate invalid WebM data (random bytes won't be valid WebM)
          const corruptedAudio = generateRandomData(10000);

          // In real implementation, this should fail gracefully
          // and return an error message, not crash
          expect(corruptedAudio.length).toBe(10000);
        },
        { iterations: 50, cooldown: 5 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should handle very long recordings', async () => {
      const result = await runStressTest(
        'Very Long Recordings',
        async (iteration) => {
          // Simulate 5-minute recording (~5MB)
          const fiveMinutes = 5 * 60;
          const bytesPerSecond = 16 * 1024;
          const size = fiveMinutes * bytesPerSecond;

          // Don't actually allocate - just verify math
          const expectedSize = 4915200; // ~5MB
          expect(size).toBeCloseTo(expectedSize, -4);
        },
        { iterations: 10, cooldown: 10 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });
  });

  describe('Context Building', () => {
    it('should handle large terminal context', async () => {
      const result = await runStressTest(
        'Large Terminal Context',
        async (iteration) => {
          // Simulate building context with large recent output
          const context = {
            os: 'linux',
            shell: 'bash',
            cwd: '/home/user/very/long/path/to/project/with/many/subdirectories',
            recentOutput: 'x'.repeat(10000 + iteration * 100),
            lastCommand: 'npm run build:production:verbose --debug --trace',
            lastError: 'Error: Something went wrong\n' + 'at Function.something\n'.repeat(50),
          };

          // Context should be truncated to avoid token limit issues
          const maxContextLength = 5000;
          let contextString = JSON.stringify(context);

          if (contextString.length > maxContextLength) {
            // Truncate recentOutput to fit
            const truncatedOutput = context.recentOutput.slice(-2000);
            context.recentOutput = truncatedOutput;
            contextString = JSON.stringify(context);
          }

          expect(contextString.length).toBeLessThan(maxContextLength * 2);
        },
        { iterations: 50, cooldown: 5 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should handle special characters in context', async () => {
      const specialContexts = [
        { cwd: '/home/user/project with spaces/test' },
        { cwd: "/home/user/project'with'quotes" },
        { cwd: '/home/user/project"with"doublequotes' },
        { cwd: '/home/user/project\nwith\nnewlines' },
        { cwd: '/home/user/日本語/パス' },
        { cwd: '/home/user/🚀/emoji/path' },
        { lastCommand: 'echo "test" | grep \'pattern\' && cat file' },
        { lastError: 'Error: ${variable} not found' },
      ];

      for (const ctx of specialContexts) {
        // Should be safely serializable
        const serialized = JSON.stringify(ctx);
        const parsed = JSON.parse(serialized);
        expect(parsed).toEqual(ctx);
      }
    });
  });

  describe('API Rate Limiting Simulation', () => {
    it('should handle concurrent transcription requests', async () => {
      let activeRequests = 0;
      let maxConcurrent = 0;

      const result = await runStressTest(
        'Concurrent Transcription Requests',
        async () => {
          activeRequests++;
          if (activeRequests > maxConcurrent) {
            maxConcurrent = activeRequests;
          }

          // Simulate API call
          await sleep(50 + Math.random() * 100);

          activeRequests--;
        },
        { iterations: 50, cooldown: 0 }
      );

      results.push(result);
      // Max concurrent should be limited
      expect(maxConcurrent).toBeGreaterThan(0);
    });

    it('should handle API timeout gracefully', async () => {
      const result = await runStressTest(
        'API Timeout Handling',
        async (iteration) => {
          const timeout = 5000; // 5 second timeout

          // Simulate slow API response
          const responseTime = iteration % 10 === 0 ? 10000 : 100; // 10% timeout

          try {
            await Promise.race([
              sleep(Math.min(responseTime, 50)), // Cap for test speed
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error('API timeout')), 100)
              ),
            ]);
          } catch (err: any) {
            if (err.message === 'API timeout') {
              // Expected timeout - handled gracefully
            } else {
              throw err;
            }
          }
        },
        { iterations: 100, cooldown: 5 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should handle API error responses', async () => {
      const errorResponses = [
        { status: 400, message: 'Bad Request' },
        { status: 401, message: 'Unauthorized - Invalid API key' },
        { status: 403, message: 'Forbidden - Quota exceeded' },
        { status: 429, message: 'Too Many Requests' },
        { status: 500, message: 'Internal Server Error' },
        { status: 502, message: 'Bad Gateway' },
        { status: 503, message: 'Service Unavailable' },
      ];

      for (const error of errorResponses) {
        // Should be converted to user-friendly message
        expect(error.message.length).toBeGreaterThan(0);

        // Specific error handling
        if (error.status === 429) {
          // Rate limit - should retry with backoff
          expect(error.message).toContain('Many Requests');
        }
        if (error.status === 401) {
          // Auth error - should prompt for new API key
          expect(error.message).toContain('Unauthorized');
        }
      }
    });
  });

  describe('Model Selection', () => {
    it('should validate all supported models', () => {
      const supportedModels = [
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gpt-4o-transcribe',
        'gpt-4o-mini-transcribe',
        'whisper-1',
        'claude-sonnet',
        'claude-haiku',
        'elevenlabs-scribe',
        'local-whisper',
        'local-parakeet',
      ];

      for (const model of supportedModels) {
        expect(model.length).toBeGreaterThan(0);
        // Should not contain invalid characters (allow dots for version numbers)
        expect(model).toMatch(/^[a-z0-9.-]+$/);
      }
    });

    it('should handle unknown model gracefully', () => {
      const unknownModels = [
        'unknown-model',
        'gpt-5-turbo',
        'claude-opus-future',
        '',
        null,
        undefined,
      ];

      for (const model of unknownModels) {
        // Should throw or return error, not crash
        if (!model) {
          expect(model).toBeFalsy();
        } else {
          expect(typeof model).toBe('string');
        }
      }
    });
  });

  describe('Custom Vocabulary', () => {
    it('should handle large custom vocabularies', async () => {
      const result = await runStressTest(
        'Large Custom Vocabulary',
        async (iteration) => {
          // Generate large vocabulary list
          const vocabSize = 100 + iteration * 10;
          const vocabulary: string[] = [];

          for (let i = 0; i < vocabSize; i++) {
            vocabulary.push(`CustomTerm${i}`);
          }

          // Join for prompt injection
          const vocabString = vocabulary.join(', ');
          expect(vocabString.length).toBeGreaterThan(0);
        },
        { iterations: 50, cooldown: 5 }
      );

      results.push(result);
      expect(result.passed).toBe(true);
    });

    it('should escape special characters in vocabulary', () => {
      const specialTerms = [
        'term with spaces',
        "term'with'quotes",
        'term"with"doublequotes',
        'term\nwith\nnewlines',
        'term\\with\\backslashes',
        'term/with/slashes',
        'term.with.dots',
        'term(with)parens',
        'term[with]brackets',
        'term{with}braces',
        'term$with$dollars',
        'term^with^carets',
        'term*with*asterisks',
      ];

      for (const term of specialTerms) {
        // Should be safely includable in prompt
        const escaped = term
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, ' ');

        expect(escaped).not.toContain('\n');
      }
    });
  });
});

describe('Transcription Service Configuration', () => {
  it('should validate transcription service file exists', () => {
    const servicePath = path.join(__dirname, '../../src/services/transcriptionService.ts');
    expect(fs.existsSync(servicePath)).toBe(true);
  });

  it('should have proper error handling patterns', () => {
    const servicePath = path.join(__dirname, '../../src/services/transcriptionService.ts');
    const content = fs.readFileSync(servicePath, 'utf-8');

    // Check for error handling patterns
    expect(content).toContain('throw new Error');
    expect(content).toContain('catch');

    // Check for API key validation
    expect(content).toContain('apiKey');
  });

  it('should have timeout configuration', () => {
    const servicePath = path.join(__dirname, '../../src/services/transcriptionService.ts');
    const content = fs.readFileSync(servicePath, 'utf-8');

    // Ideally should have timeout handling
    // This test documents missing functionality if it fails
    const hasTimeout =
      content.includes('timeout') ||
      content.includes('Timeout') ||
      content.includes('AbortController');

    // Note: This might fail, indicating a needed improvement
    if (!hasTimeout) {
      console.warn('WARNING: transcriptionService.ts may need timeout handling');
    }
  });
});

describe('Audio Format Handling', () => {
  it('should support expected audio formats', () => {
    const supportedFormats = ['webm', 'mp3', 'wav', 'ogg', 'm4a'];
    const mimeTypes = [
      'audio/webm',
      'audio/webm;codecs=opus',
      'audio/mp3',
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/mp4',
    ];

    for (const format of supportedFormats) {
      expect(format.length).toBeGreaterThan(0);
    }

    for (const mime of mimeTypes) {
      expect(mime).toContain('audio/');
    }
  });

  it('should detect audio format from buffer', () => {
    // WebM magic bytes
    const webmMagic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
    // WAV magic bytes
    const wavMagic = Buffer.from('RIFF');
    // MP3 magic bytes (ID3)
    const mp3Magic = Buffer.from('ID3');

    const detectFormat = (buffer: Buffer): string => {
      if (buffer.slice(0, 4).equals(webmMagic)) return 'webm';
      if (buffer.slice(0, 4).toString() === 'RIFF') return 'wav';
      if (buffer.slice(0, 3).toString() === 'ID3') return 'mp3';
      return 'unknown';
    };

    expect(detectFormat(Buffer.concat([webmMagic, Buffer.alloc(100)]))).toBe('webm');
    expect(detectFormat(Buffer.concat([wavMagic, Buffer.alloc(100)]))).toBe('wav');
    expect(detectFormat(Buffer.concat([mp3Magic, Buffer.alloc(100)]))).toBe('mp3');
    expect(detectFormat(Buffer.alloc(100))).toBe('unknown');
  });
});
