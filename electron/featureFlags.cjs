// Chromium/Electron command-line feature flags, set before the app `ready` event.
//
// Extracted from main.cjs so the flag wiring can be unit-tested in isolation. These switches must be
// appended at module load (before `ready`); setting them inside app.whenReady() is too late because
// Chromium has already initialized its feature set.

// Electron's globalShortcut API talks to X11's XGrabKey directly. Under Wayland that grab is denied
// for security, so global shortcuts silently no-op unless the app opts into Chromium's
// GlobalShortcutsPortal feature (routes through the xdg-desktop-portal GlobalShortcuts API).
// See electron/electron#45171.
function enableWaylandShortcuts(app) {
  app.commandLine.appendSwitch('enable-features', 'GlobalShortcutsPortal');
}

module.exports = { enableWaylandShortcuts };
