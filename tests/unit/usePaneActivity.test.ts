import { describe, it, expect } from 'vitest';
import { deriveState } from '../../src/hooks/usePaneActivity';

interface PaneActivity {
  lastOutputTime: number;
  exited: boolean;
  exitCode: number | null;
}

describe('pane activity state derivation', () => {
  const NOW = 1710000000000;

  it('returns active when output received within 15 seconds', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 5000,
      exited: false,
      exitCode: null,
    };
    expect(deriveState(activity, NOW)).toBe('active');
  });

  it('returns active at exactly 14999ms', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 14999,
      exited: false,
      exitCode: null,
    };
    expect(deriveState(activity, NOW)).toBe('active');
  });

  it('returns silent when no output for 15+ seconds', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 15000,
      exited: false,
      exitCode: null,
    };
    expect(deriveState(activity, NOW)).toBe('silent');
  });

  it('returns silent when no output for 60 seconds', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 60000,
      exited: false,
      exitCode: null,
    };
    expect(deriveState(activity, NOW)).toBe('silent');
  });

  it('returns done when process exited with code 0', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 5000,
      exited: true,
      exitCode: 0,
    };
    expect(deriveState(activity, NOW)).toBe('done');
  });

  it('returns error when process exited with non-zero code', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 5000,
      exited: true,
      exitCode: 1,
    };
    expect(deriveState(activity, NOW)).toBe('error');
  });

  it('returns error when process exited with code 127', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 5000,
      exited: true,
      exitCode: 127,
    };
    expect(deriveState(activity, NOW)).toBe('error');
  });

  it('exit state takes priority over silence timeout', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW - 60000,
      exited: true,
      exitCode: 0,
    };
    expect(deriveState(activity, NOW)).toBe('done');
  });

  it('exit state takes priority over active output', () => {
    const activity: PaneActivity = {
      lastOutputTime: NOW,
      exited: true,
      exitCode: 1,
    };
    expect(deriveState(activity, NOW)).toBe('error');
  });
});
