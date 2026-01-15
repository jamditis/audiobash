/**
 * Audio Utilities Tests
 * Tests for audio conversion and processing functions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  base64ToFloat32Array,
  float32ArrayToBase64,
  getMicrophones,
  blobToBase64,
} from '../../src/utils/audioUtils';
import { mockMediaDevices } from '../setup';

describe('Audio Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('base64ToFloat32Array', () => {
    it('converts valid base64 to Float32Array', () => {
      // Create known Int16 data: [0, 16384, -16384, 32767]
      // In little-endian bytes: [0,0, 0,64, 0,192, 255,127]
      const int16Data = new Int16Array([0, 16384, -16384, 32767]);
      const bytes = new Uint8Array(int16Data.buffer);
      const base64 = btoa(String.fromCharCode(...bytes));

      const result = base64ToFloat32Array(base64);

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(4);
      // Values should be normalized to [-1, 1]
      expect(result[0]).toBeCloseTo(0, 4);
      expect(result[1]).toBeCloseTo(0.5, 2);
      expect(result[2]).toBeCloseTo(-0.5, 2);
      expect(result[3]).toBeCloseTo(1, 2);
    });

    it('handles empty base64 string', () => {
      const result = base64ToFloat32Array('');
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(0);
    });

    it('normalizes values to range [-1, 1]', () => {
      // Test with max positive value (32767)
      const maxPositive = new Int16Array([32767]);
      const bytes = new Uint8Array(maxPositive.buffer);
      const base64 = btoa(String.fromCharCode(...bytes));

      const result = base64ToFloat32Array(base64);

      expect(result[0]).toBeCloseTo(1, 2);
      expect(result[0]).toBeLessThanOrEqual(1);
    });

    it('handles negative values correctly', () => {
      // Test with max negative value (-32768)
      const maxNegative = new Int16Array([-32768]);
      const bytes = new Uint8Array(maxNegative.buffer);
      const base64 = btoa(String.fromCharCode(...bytes));

      const result = base64ToFloat32Array(base64);

      expect(result[0]).toBeCloseTo(-1, 2);
      expect(result[0]).toBeGreaterThanOrEqual(-1);
    });
  });

  describe('float32ArrayToBase64', () => {
    it('converts Float32Array to base64', () => {
      const input = new Float32Array([0, 0.5, -0.5, 1]);

      const result = float32ArrayToBase64(input);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('produces decodable base64', () => {
      const input = new Float32Array([0, 0.5, -0.5, 1]);

      const base64 = float32ArrayToBase64(input);

      // Should be valid base64
      expect(() => atob(base64)).not.toThrow();
    });

    it('handles empty array', () => {
      const input = new Float32Array([]);

      const result = float32ArrayToBase64(input);

      expect(typeof result).toBe('string');
    });

    it('clamps values outside [-1, 1] range', () => {
      const input = new Float32Array([2, -2, 1.5, -1.5]);

      const result = float32ArrayToBase64(input);

      // Should not throw and produce valid base64
      expect(() => atob(result)).not.toThrow();
    });
  });

  describe('Round-trip conversion', () => {
    it('maintains data integrity through round-trip', () => {
      const original = new Float32Array([0, 0.25, 0.5, 0.75, 1, -0.25, -0.5, -0.75, -1]);

      const base64 = float32ArrayToBase64(original);
      const decoded = base64ToFloat32Array(base64);

      expect(decoded.length).toBe(original.length);

      // Values should be approximately equal (some precision loss is expected)
      for (let i = 0; i < original.length; i++) {
        expect(decoded[i]).toBeCloseTo(original[i], 1);
      }
    });

    it('handles edge case values', () => {
      const edgeCases = new Float32Array([0, 1, -1, 0.001, -0.001]);

      const base64 = float32ArrayToBase64(edgeCases);
      const decoded = base64ToFloat32Array(base64);

      expect(decoded.length).toBe(edgeCases.length);
      expect(decoded[0]).toBeCloseTo(0, 2);
      expect(decoded[1]).toBeCloseTo(1, 1);
      expect(decoded[2]).toBeCloseTo(-1, 1);
    });
  });

  describe('getMicrophones', () => {
    it('returns array of audio input devices', async () => {
      const mics = await getMicrophones();

      expect(Array.isArray(mics)).toBe(true);
      expect(mics.length).toBeGreaterThan(0);
      expect(mics.every((d) => d.kind === 'audioinput')).toBe(true);
    });

    it('requests user media permission first', async () => {
      await getMicrophones();

      expect(mockMediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it('enumerates devices after getting permission', async () => {
      await getMicrophones();

      expect(mockMediaDevices.enumerateDevices).toHaveBeenCalled();
    });

    it('returns empty array on permission denied', async () => {
      mockMediaDevices.getUserMedia.mockRejectedValueOnce(new Error('Permission denied'));

      const mics = await getMicrophones();

      expect(mics).toEqual([]);
    });

    it('filters out non-audio devices', async () => {
      mockMediaDevices.enumerateDevices.mockResolvedValueOnce([
        { deviceId: '1', kind: 'audioinput', label: 'Mic 1', groupId: '1' },
        { deviceId: '2', kind: 'videoinput', label: 'Camera', groupId: '2' },
        { deviceId: '3', kind: 'audiooutput', label: 'Speaker', groupId: '3' },
        { deviceId: '4', kind: 'audioinput', label: 'Mic 2', groupId: '4' },
      ]);

      const mics = await getMicrophones();

      expect(mics.length).toBe(2);
      expect(mics.every((d) => d.kind === 'audioinput')).toBe(true);
    });
  });

  describe('blobToBase64', () => {
    it('converts Blob to base64 string', async () => {
      const blob = new Blob(['test content'], { type: 'text/plain' });

      const result = await blobToBase64(blob);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('strips data URL prefix', async () => {
      const blob = new Blob(['test'], { type: 'text/plain' });

      const result = await blobToBase64(blob);

      // Should not start with "data:"
      expect(result.startsWith('data:')).toBe(false);
    });

    it('produces valid base64', async () => {
      const blob = new Blob(['hello world'], { type: 'text/plain' });

      const result = await blobToBase64(blob);

      expect(() => atob(result)).not.toThrow();
    });

    it('handles audio blob', async () => {
      const audioData = new Uint8Array([0, 1, 2, 3, 4, 5]);
      const blob = new Blob([audioData], { type: 'audio/webm' });

      const result = await blobToBase64(blob);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('handles empty blob', async () => {
      const blob = new Blob([], { type: 'audio/webm' });

      const result = await blobToBase64(blob);

      expect(typeof result).toBe('string');
    });

    it('rejects on FileReader error', async () => {
      // Create a mock that will trigger an error
      const originalFileReader = window.FileReader;

      class MockErrorFileReader {
        onerror: ((error: Error) => void) | null = null;
        readAsDataURL() {
          setTimeout(() => {
            this.onerror?.(new Error('Read failed'));
          }, 0);
        }
      }

      window.FileReader = MockErrorFileReader as unknown as typeof FileReader;

      const blob = new Blob(['test'], { type: 'text/plain' });

      await expect(blobToBase64(blob)).rejects.toThrow();

      window.FileReader = originalFileReader;
    });
  });
});

describe('Audio Data Formats', () => {
  describe('Int16 to Float32 conversion', () => {
    it('correctly normalizes Int16 range to Float32', () => {
      // Int16 range: -32768 to 32767
      // Float32 range: -1.0 to 1.0

      const testCases = [
        { int16: 0, expectedFloat: 0 },
        { int16: 32767, expectedFloat: 1 },
        { int16: -32768, expectedFloat: -1 },
        { int16: 16384, expectedFloat: 0.5 },
        { int16: -16384, expectedFloat: -0.5 },
      ];

      for (const { int16, expectedFloat } of testCases) {
        const int16Array = new Int16Array([int16]);
        const bytes = new Uint8Array(int16Array.buffer);
        const base64 = btoa(String.fromCharCode(...bytes));

        const result = base64ToFloat32Array(base64);

        expect(result[0]).toBeCloseTo(expectedFloat, 1);
      }
    });
  });

  describe('Float32 to Int16 conversion', () => {
    it('correctly maps Float32 range to Int16', () => {
      const testCases = [
        { float: 0, expectedInt16: 0 },
        { float: 1, expectedInt16: 32767 },
        { float: -1, expectedInt16: -32768 },
        { float: 0.5, expectedInt16: 16383 },
        { float: -0.5, expectedInt16: -16384 },
      ];

      for (const { float, expectedInt16 } of testCases) {
        const input = new Float32Array([float]);
        const base64 = float32ArrayToBase64(input);
        const decoded = atob(base64);
        const bytes = new Uint8Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) {
          bytes[i] = decoded.charCodeAt(i);
        }
        const int16Array = new Int16Array(bytes.buffer);

        expect(int16Array[0]).toBeCloseTo(expectedInt16, -2); // Allow ~100 error
      }
    });
  });
});
