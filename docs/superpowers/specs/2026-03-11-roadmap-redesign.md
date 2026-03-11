# Roadmap redesign spec

**Date:** 2026-03-11
**Scope:** Replace the existing roadmap section on `docs/releases.html` with a milestone-based roadmap

## Context

The v3.0 release series shipped pane management, CC `/voice` mode detection, and removed the remote control feature. The old roadmap (written pre-v3.0) lists items that are stale, irrelevant, or insufficiently ambitious for where the app is now.

AudioBash's identity: a Claude Code companion first, general voice terminal second. The roadmap should reflect both.

## Top barriers identified

1. **macOS code signing** — unsigned DMGs crash on Apple Silicon when downloaded
2. **Stability** — pane system and voice pipeline still have edge-case bugs
3. **Missing core features** — better voice UX, session management, customizable shortcuts
4. **Polish / discoverability** — the app needs to feel ready for a wider audience

## Milestone structure

### v3.1 — Stability & keyboard shortcuts

Harden what exists. No major new systems.

- Pane system hardening (resize edge cases, race conditions on layout switches)
- Voice pipeline reliability (error recovery, reconnection, timeout handling)
- Customizable keyboard shortcuts (remap Alt+S, Alt+H, user-defined bindings)
- Performance profiling and optimization
- General bug fixes

### v3.5 — Voice evolution

Make voice input feel polished instead of experimental.

- Voice command history browser (review and re-execute past transcriptions)
- Continuous listening mode (hands-free, pause-on-silence)
- Wake word detection (configurable trigger phrase)
- Audio input device selection in settings

### v4.0 — Sessions, workspaces, and signed distribution

The "ready for real users" release.

- macOS code signing & notarization (Developer ID Application cert)
- Auto-update via electron-updater
- Named terminal sessions with save/restore
- Project-based pane layout presets
- Linux support (AppImage, .deb)

### Future / exploratory

Not committed to a milestone. Tracked for interest.

- Local transcription via whisper.cpp — service exists (`electron/whisperService.cjs`) but is not exposed in the UI yet; this item covers finishing the integration and making it a first-class option in settings
- Multi-language transcription
- Terminal session recording & playback
- Custom voice command aliases

## Items removed from old roadmap

These were on the old roadmap and are being dropped:

- **Snippet library** — Claude Code itself handles command suggestions; redundant
- **Multiple configuration profiles** — over-engineering for current user base
- **Export/import settings** — low value relative to effort
- **Plugin system** — premature abstraction
- **VS Code extension** — AudioBash IS the terminal; extending VS Code conflicts with the app's identity
- **SSH session support** — the terminal already supports SSH natively; no dedicated feature needed

## Website changes

### `docs/releases.html`

Replace the current two-column roadmap section. Locate it by the `<!-- ROADMAP -->` comment. The opening tag becomes `<section id="roadmap" class="mt-16">` (preserving the existing margin class, adding the anchor ID). The existing `<h2 class="font-display text-2xl text-chrome mb-6">ROADMAP</h2>` heading stays unchanged.

Replace with a milestone-based layout:

- Each milestone gets its own card with version number, theme title, and bullet list
- Color system for milestone tiers:
  - **v3.1 (near-term):** `text-accent` / `border-accent` (red `#ff3333`)
  - **v3.5 (mid-term):** `text-ice` / `border-ice` (blue `#00f0ff`)
  - **v4.0 (long-term):** `text-apple` / `border-apple` (silver `#a3aaae`) — already defined in the page's Tailwind config
  - **Future / exploratory:** `text-gray-500` / `border-white/10` — visually recessed to signal "not committed". Reduced contrast is intentional for this de-emphasized tier.
- Checkbox-style indicators: use the existing markup pattern (`<span class="w-4 h-4 border border-white/20 flex-shrink-0"></span>`). Checkbox borders stay neutral `border-white/20` across all tiers — only the card border and header text use tier colors.

### Visual treatment

- Keep the void/brutalist aesthetic
- Milestone headers use Chakra Petch display font
- Version badges: `<span>` with `border` + milestone tier color, `text-xs`, `px-2 py-0.5` (intentionally smaller than release card badges, which use `text-sm px-3 py-1`, to keep milestone headers compact)
- Desktop layout: 2x2 grid (`grid md:grid-cols-2 gap-6`) for all four milestone cards. v3.1 top-left, v3.5 top-right, v4.0 bottom-left, Future bottom-right
- Mobile layout: single column stack, all four cards full-width
- "Future / exploratory" card uses `bg-void` (instead of `bg-panel`), `border-white/10`, and `text-gray-500` for both header and body text to distinguish it from committed milestones
- No ETAs or target dates on any milestone — deliberately vague on timing

## Out of scope

- No changes to other docs pages
- No changes to app code
- No changes to release notes content (only the roadmap section)
