# Remote simplification handoff

**Branch:** `experimental/remote-simplification`
**Commit:** `e82c8c3`
**Date:** 2026-02-14

---

## What was done

All 10 steps of the simplification plan are complete. The remote control feature was stripped from ~15K lines of over-engineered code (tunnels, React PWA, voice bridge, file browser, QR pairing, self-signed certs) down to a ~500-line setup: a single WebSocket server on port 8765 that also serves a static mobile page.

### Summary of changes

| Action | Detail |
|--------|--------|
| **Deleted** | `electron/ngrokService.cjs`, `electron/cloudflareService.cjs`, `src/components/TunnelStatus.tsx`, `docs/remote/js/voice.js`, `docs/remote/js/file-browser.js`, entire `remote/` directory (React PWA) |
| **Rewrote** | `electron/websocket-server.cjs` (1488 → ~514 lines) |
| **Simplified** | `electron/main.cjs` (removed tunnel imports/handlers/init), `electron/preload.cjs` (removed ~15 IPC methods), `docs/remote/index.html`, `docs/remote/js/app.js`, `docs/remote/js/websocket.js`, `src/components/Settings.tsx`, `src/types.ts` |
| **Updated docs** | `CLAUDE.md`, `README.md`, `docs/TROUBLESHOOTING.md`, `docs/manual.html`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/remote/service-worker.js` |
| **Superseded** | `docs/AUDIOBASH_REMOTE_DESIGN.md`, `docs/REMOTE_ISSUES_ANALYSIS.md` (notices added) |

**68 files changed, 461 insertions, 22,564 deletions.**

### Test and build status

- **787 tests pass, 0 failures**
- **TypeScript build: clean**
- Test fixes covered: multi-tab context response structure, password validation warnings, stress test constructor params, removed audio/binary/pairing test sections

---

## What remains before merging

### Manual testing (required)

1. **Dev mode:** `npm run electron:dev` — verify app launches, remote server starts on port 8765
2. **Mobile page:** Open `http://localhost:8765` in a phone browser — connection screen should load
3. **Auth:** Set a password in settings, verify it's required on the mobile page
4. **Terminal I/O:** Type commands from mobile, verify they execute in the desktop terminal
5. **Aux keys:** Test Tab, Esc, Ctrl+C, arrows, Ctrl+modifier combos on mobile
6. **Tab switching:** Switch tabs from mobile, verify output updates
7. **Settings UI:** Confirm remote section shows IP, password field, status — no tunnel section visible
8. **Reconnect:** Kill and restart the server, verify mobile auto-reconnects

### Production build (recommended)

```bash
npm run electron:build:mac:arm64
```

Verify the mobile page is bundled in the app's resources and accessible at port 8765 from the packaged app.

### Optional before merge

- Version bump (if releasing as part of a version)
- Delete this handoff file once merged

---

## Architecture after simplification

```
Phone browser → http://<ip>:8765 → static mobile page (served by WebSocket server)
                                  → WebSocket connection (ws://<ip>:8765)
                                  → terminal I/O, tab switching, resize
```

- Single port (8765), ws:// only (no TLS — use Tailscale for encryption off-network)
- Password auth (optional, stored encrypted via safeStorage)
- Mobile page: xterm.js terminal + aux keys row + command input bar
- No tunnels, no pairing codes, no voice bridge, no file browser
