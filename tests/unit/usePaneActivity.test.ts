import { describe, it, expect } from 'vitest';
import { deriveState } from '../../src/hooks/usePaneActivity';

interface PaneActivity {
  lastOutputTime: number;
  exited: boolean;
  exitCode: number | null;
}

describe('pane activity state derivation', () => {
  const NOW = 1710000000000;

  // Active: 0 - 15s
  it('returns active when output received within 15 seconds', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 5000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('active');
  });

  it('returns active at exactly 14999ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 14999, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('active');
  });

  // Fading: 15s - 30s
  it('returns fading at exactly 15000ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 15000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('fading');
  });

  it('returns fading at 20000ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 20000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('fading');
  });

  it('returns fading at exactly 29999ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 29999, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('fading');
  });

  // Dim: 30s - 60s
  it('returns dim at exactly 30000ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 30000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('dim');
  });

  it('returns dim at 45000ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 45000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('dim');
  });

  it('returns dim at exactly 59999ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 59999, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('dim');
  });

  // Inactive: 60s+
  it('returns inactive at exactly 60000ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 60000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('inactive');
  });

  it('returns inactive at 120000ms', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 120000, exited: false, exitCode: null };
    expect(deriveState(activity, NOW)).toBe('inactive');
  });

  // Exit states
  it('returns done when process exited with code 0', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 5000, exited: true, exitCode: 0 };
    expect(deriveState(activity, NOW)).toBe('done');
  });

  it('returns error when process exited with non-zero code', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 5000, exited: true, exitCode: 1 };
    expect(deriveState(activity, NOW)).toBe('error');
  });

  it('returns error when process exited with code 127', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 5000, exited: true, exitCode: 127 };
    expect(deriveState(activity, NOW)).toBe('error');
  });

  // Priority tests
  it('exit state takes priority over any timeout', () => {
    const activity: PaneActivity = { lastOutputTime: NOW - 120000, exited: true, exitCode: 0 };
    expect(deriveState(activity, NOW)).toBe('done');
  });

  it('exit error takes priority over active output', () => {
    const activity: PaneActivity = { lastOutputTime: NOW, exited: true, exitCode: 1 };
    expect(deriveState(activity, NOW)).toBe('error');
  });
});
