import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load the CommonJS module exactly as Node/Electron does, so the test exercises the real
// module.exports the main process consumes (no vite ESM-interop ambiguity).
const require = createRequire(import.meta.url);
const { enableWaylandShortcuts } = require('../../electron/featureFlags.cjs');

describe('enableWaylandShortcuts', () => {
  // Regression guard for the Wayland global-shortcut bug: Electron's globalShortcut API silently
  // no-ops under Wayland unless the app opts into Chromium's GlobalShortcutsPortal feature. We can't
  // reproduce an actual Wayland grab in CI, so we assert the documented switch is applied to the
  // real app.commandLine the main process passes in.
  it('appends the GlobalShortcutsPortal feature so global shortcuts work under Wayland', () => {
    const appendSwitch = vi.fn();
    const app = { commandLine: { appendSwitch } };

    enableWaylandShortcuts(app);

    expect(appendSwitch).toHaveBeenCalledWith('enable-features', 'GlobalShortcutsPortal');
  });
});

describe('main process wiring', () => {
  // main.cjs is too coupled to load in jsdom, so guard the wiring with a source check (same approach
  // as startup-crash.test.ts). The flag must be applied at module load, before app.whenReady() runs.
  const mainProcessCode = readFileSync(
    join(__dirname, '..', '..', 'electron', 'main.cjs'),
    'utf8',
  );

  it('calls enableWaylandShortcuts before app.whenReady so the switch is set before ready', () => {
    expect(mainProcessCode).toContain('enableWaylandShortcuts(app)');

    const callIndex = mainProcessCode.indexOf('enableWaylandShortcuts(app)');
    const whenReadyIndex = mainProcessCode.indexOf('app.whenReady()');
    expect(callIndex).toBeGreaterThan(-1);
    expect(whenReadyIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeLessThan(whenReadyIndex);
  });
});
