import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceModeDetector } from '../../src/utils/voiceModeDetector';

describe('VoiceModeDetector', () => {
  let detector: VoiceModeDetector;

  beforeEach(() => {
    detector = new VoiceModeDetector();
  });

  describe('activation detection', () => {
    it('detects "Entering voice mode" pattern', () => {
      const callback = vi.fn();
      detector.onStateChange(callback);
      detector.processOutput('tab-1', 'Entering voice mode...');
      expect(callback).toHaveBeenCalledWith({ active: true, terminalId: 'tab-1' });
    });

    it('detects "voice mode activated" pattern', () => {
      const callback = vi.fn();
      detector.onStateChange(callback);
      detector.processOutput('tab-1', 'Voice mode activated');
      expect(callback).toHaveBeenCalledWith({ active: true, terminalId: 'tab-1' });
    });

    it('detects "/voice started" pattern', () => {
      const callback = vi.fn();
      detector.onStateChange(callback);
      detector.processOutput('tab-1', '/voice started successfully');
      expect(callback).toHaveBeenCalledWith({ active: true, terminalId: 'tab-1' });
    });

    it('does not fire for non-voice output', () => {
      const callback = vi.fn();
      detector.onStateChange(callback);
      detector.processOutput('tab-1', 'Hello world');
      expect(callback).not.toHaveBeenCalled();
    });

    it('does not double-fire for same terminal', () => {
      const callback = vi.fn();
      detector.onStateChange(callback);
      detector.processOutput('tab-1', 'Entering voice mode...');
      detector.processOutput('tab-1', 'Voice mode activated');
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('deactivation detection', () => {
    it('detects "Exiting voice mode" pattern', () => {
      const callback = vi.fn();
      detector.onStateChange(callback);
      detector.processOutput('tab-1', 'Entering voice mode...');
      detector.processOutput('tab-1', 'Exiting voice mode');
      expect(callback).toHaveBeenLastCalledWith({ active: false, terminalId: 'tab-1' });
    });

    it('detects "voice mode deactivated" pattern', () => {
      const callback = vi.fn();
      detector.onStateChange(callback);
      detector.processOutput('tab-1', 'Entering voice mode...');
      detector.processOutput('tab-1', 'Voice mode deactivated');
      expect(callback).toHaveBeenLastCalledWith({ active: false, terminalId: 'tab-1' });
    });

    it('does not fire deactivation if not active', () => {
      const callback = vi.fn();
      detector.onStateChange(callback);
      detector.processOutput('tab-1', 'Exiting voice mode');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('per-terminal tracking', () => {
    it('tracks state independently per terminal', () => {
      detector.processOutput('tab-1', 'Entering voice mode...');
      detector.processOutput('tab-2', 'some other output');
      expect(detector.isVoiceActive('tab-1')).toBe(true);
      expect(detector.isVoiceActive('tab-2')).toBe(false);
    });

    it('returns false for unknown terminal', () => {
      expect(detector.isVoiceActive('unknown')).toBe(false);
    });
  });

  describe('getActiveTerminals', () => {
    it('returns empty array initially', () => {
      expect(detector.getActiveTerminals()).toEqual([]);
    });

    it('returns all active terminals', () => {
      detector.processOutput('tab-1', 'Entering voice mode...');
      detector.processOutput('tab-2', 'Entering voice mode...');
      const active = detector.getActiveTerminals();
      expect(active).toContain('tab-1');
      expect(active).toContain('tab-2');
      expect(active).toHaveLength(2);
    });

    it('removes deactivated terminals', () => {
      detector.processOutput('tab-1', 'Entering voice mode...');
      detector.processOutput('tab-2', 'Entering voice mode...');
      detector.processOutput('tab-1', 'Exiting voice mode');
      expect(detector.getActiveTerminals()).toEqual(['tab-2']);
    });
  });

  describe('callback cleanup', () => {
    it('unsubscribe removes callback', () => {
      const callback = vi.fn();
      const unsub = detector.onStateChange(callback);
      unsub();
      detector.processOutput('tab-1', 'Entering voice mode...');
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('ANSI handling', () => {
    it('detects patterns through ANSI codes', () => {
      const callback = vi.fn();
      detector.onStateChange(callback);
      detector.processOutput('tab-1', '\x1b[32mEntering voice mode...\x1b[0m');
      expect(callback).toHaveBeenCalledWith({ active: true, terminalId: 'tab-1' });
    });
  });
});
