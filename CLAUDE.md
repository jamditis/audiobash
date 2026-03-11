# AudioBash - Voice-controlled terminal for Claude Code


## GitHub Actions suspended (account-wide)

GitHub Actions are disabled on the entire `jamditis` GitHub account until further notice. This means:
- **No CI/CD pipelines will run** — builds, tests, deploys all fail silently
- **GitHub Pages deploys won't work** — even "legacy" static deploys that used Actions under the hood
- **No automated workflows** — PR checks, scheduled jobs, release automation are all dead

**For any project that previously deployed via GitHub Actions or GitHub Pages, you must use an alternative** (manual deploy, Cloudflare Pages, Firebase Hosting, direct FTP, etc.). Do not create or rely on `.github/workflows/` files.

---

## 📖 Documentation & websites (2026-02-14)

AudioBash has a custom domain and web documentation:

### Live URLs
- **Main website:** https://audiobash.app
- **User manual:** https://audiobash.app/manual.html
- **macOS guide:** https://audiobash.app/macos.html
- **Release notes:** https://audiobash.app/releases.html
- **About:** https://audiobash.app/about.html

### Hosting setup
- **audiobash.app** - GitHub Pages (serves `docs/` folder)

### Remote control
The mobile remote page is served directly by AudioBash's WebSocket server at `http://<ip>:8765/`. The static files live in `docs/remote/` and are bundled via `extraResources` in electron-builder. No separate hosting needed.

### Documentation files
```
docs/
├── index.html          # Landing page with download links
├── about.html          # About page with author bio
├── manual.html         # Full user manual with screenshots
├── macos.html          # macOS-specific announcement page
├── releases.html       # Version history and changelog
├── blog.html           # Blog index
├── CNAME               # Custom domain for GitHub Pages
├── remote/             # Mobile remote control page (served by WebSocket server)
│   ├── index.html
│   ├── manifest.json
│   └── ...
└── screenshots/        # UI screenshots (full + web-optimized)
```

### Screenshot capture scripts
Located in `scripts/`:
- `auto-screenshot.py` - Fully automated capture using Windows API + hotkeys
- `manual-screenshot.py` - Step-by-step manual capture (safer during active use)
- `capture-screenshots.py` - Interactive guided capture

**Dependencies:** `pip install pyautogui pillow`

### Documentation aesthetic
All pages follow the app's void/brutalist design:
- Font: Chakra Petch (display), Share Tech Mono (body)
- Colors: Void (#050505), Chrome (#e5e5e5), Acid (#ccff00)
- Tailwind CSS via CDN with custom config
- CRT scan line overlay effect

---

## 🍎 macOS setup handoff (2024-12-24)

**Context:** Joe set up macOS support from his Windows desktop. If you're running on his M1 MacBook Pro, here's what you need to know:

### First-time setup on Mac
```bash
cd audiobash
git pull                           # Get latest with macOS support
npm install                        # CRITICAL: Compiles node-pty for arm64
npm test                           # Verify 721 tests pass
npm run electron:dev               # Run in dev mode
# OR
npm run electron:build:mac:arm64   # Build DMG for Apple Silicon
```

### Key cross-platform changes made
1. **Shell detection** - Uses `$SHELL` (zsh on Mac) instead of hardcoded PowerShell
2. **Tab titles** - Shows "Terminal" on Mac, "PowerShell" on Windows
3. **Clear command** - Uses `clear` on Mac, `cls` on Windows
4. **AI agent prompts** - Generates Mac-specific commands (ls -la, pwd, ps aux, etc.)

### If node-pty fails to compile
```bash
xcode-select --install    # Install Xcode CLI tools
rm -rf node_modules package-lock.json
npm install
```

### Running the unsigned app
> **Note:** Unsigned DMGs crash on Apple Silicon even with Gatekeeper workarounds. Build from source until signed builds ship. See [macOS code signing](#macos-code-signing) below.

For Intel Macs: Right-click → Open → Click "Open" in Gatekeeper dialog (first launch only)
Or: `xattr -cr /Applications/AudioBash.app`

### Known issues
- **Apple Silicon DMG crash:** Downloaded (quarantined) unsigned DMGs crash on ARM64. Root cause: macOS enforces code signing at the kernel level for quarantined apps. Building from source works because locally built apps aren't quarantined. Signed + notarized builds will fix this.
- Multi-tab/split-screen has stability issues (resize debouncing added but may need more work)
- **Apple Silicon crash on launch (#29):** Fixed in v2.4.0 and confirmed on M1 hardware. Two root causes: (1) `chmod` in afterPack.cjs invalidated ARM64 code signatures on node-pty binaries — fixed by re-signing with `codesign --force --sign -` after chmod. (2) No error handling in `app.whenReady()` handler — added try-catch, global error handlers, and tray icon guard. v2.4.0 also upgrades to Electron 39.6.0 (fixes macOS Tahoe GPU lag).

### macOS code signing
Code signing infrastructure is in place, pending Apple Developer Program activation:
- `build/entitlements.mac.plist` — Parent app entitlements (JIT, unsigned memory, library loading, microphone, networking)
- `build/entitlements.mac.inherit.plist` — Child process entitlements (inherited by node-pty shells)
- `scripts/notarize.cjs` — afterSign hook for Apple notarization
- `scripts/afterPack.cjs` — Fixes node-pty binary permissions, ad-hoc signs for dev builds

**Required env vars for signed builds:**
- `APPLE_ID` — Apple ID email
- `APPLE_ID_PASSWORD` — App-specific password (not Apple ID password)
- `APPLE_TEAM_ID` — 10-char team ID from developer.apple.com
- `SKIP_NOTARIZE=true` — Skip notarization for local dev builds

### Relevant files for macOS
- `docs/MACOS_BUILD.md` - Full build guide
- `.github/workflows/build.yml` - CI/CD for multi-platform builds
- `tests/` - 721 tests for cross-platform compatibility

---

## Project overview
AudioBash is an Electron app with an embedded terminal (xterm.js + node-pty) and push-to-talk voice input. It lets you talk to Claude Code without window switching or manual pasting.

## Tech stack
- **Framework**: Electron + React 19 (TypeScript)
- **Build**: Vite 6
- **Terminal**: xterm.js + node-pty
- **AI**: Google Gemini API (transcription)
- **Audio**: MediaRecorder API (WebM)
- **Styling**: Tailwind CSS v3

## Directory structure
```
audiobash/
├── electron/
│   ├── main.cjs              # Electron main process, node-pty
│   ├── preload.cjs           # Context bridge for IPC
│   ├── websocket-server.cjs  # Remote control server (HTTP + WebSocket)
│   ├── logger.cjs            # Structured logging
│   ├── error-handler.cjs     # Error categorization and recovery
│   └── whisperService.cjs    # Local speech-to-text via whisper.cpp
├── src/
│   ├── components/
│   │   ├── Terminal.tsx       # xterm.js wrapper
│   │   ├── VoiceOverlay.tsx   # Voice input UI (ccVoiceActive aware)
│   │   ├── StatusIndicator.tsx# Bottom status bar
│   │   ├── PaneManager.tsx    # Pane layout manager (imperative handle)
│   │   ├── PaneNode.tsx       # Recursive pane renderer
│   │   ├── PaneToolbar.tsx    # Split/preset/zoom/save toolbar
│   │   ├── PaneDivider.tsx    # Draggable pane resize divider
│   │   ├── Settings.tsx       # Settings panel
│   │   └── TitleBar.tsx       # Frameless window controls
│   ├── contexts/              # React contexts (ConsoleError, etc.)
│   ├── services/              # Transcription and speech services
│   ├── utils/
│   │   ├── paneTree.ts        # Binary tree pane data model
│   │   ├── voiceModeDetector.ts # CC /voice mode detection via terminal output
│   │   └── ...                # Audio utilities
│   ├── App.tsx                # Main layout
│   ├── index.tsx              # React entry
│   ├── index.css              # Tailwind entry
│   └── types.ts               # TypeScript interfaces
├── build/
│   ├── entitlements.mac.plist         # macOS hardened runtime entitlements
│   └── entitlements.mac.inherit.plist # Child process entitlements
├── scripts/
│   ├── afterPack.cjs          # Fix node-pty permissions + ad-hoc signing
│   └── notarize.cjs           # Apple notarization afterSign hook
├── assets/                    # Audio files and icons
├── .github/
│   └── FUNDING.yml            # GitHub Sponsors + Venmo links
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── CLAUDE.md
```

## Quick start

### 1. Install dependencies
```bash
npm install
```

### 2. Run in development
```bash
npm run electron:dev
```

### 3. Build for production
```bash
npm run electron:build
```

## Keyboard shortcuts
- `Alt+S` - Toggle voice recording
- `Alt+H` - Show/hide window

## Architecture

### Data flow
```
User speaks → MediaRecorder → Audio blob → Gemini API → Transcribed text
                                                              ↓
                                                    pty.write(text + '\r')
                                                              ↓
                                                    Shell executes command
                                                              ↓
                                                    pty.onData → xterm.write()
```

### IPC communication
- Main process owns the PTY process (node-pty)
- Renderer uses xterm.js for display
- IPC bridge connects them:
  - `terminal-write`: Renderer → Main (user input)
  - `terminal-data`: Main → Renderer (shell output)
  - `send-to-terminal`: Voice transcription → Shell

## Aesthetic
- **Void/brutalist** - Deep blacks (#050505), minimal decoration
- **Retrotechnofuturism** - CRT-inspired, scan lines, glow effects
- **High contrast** - Clear readability
- **Colors**: Accent red (#ff3333), CRT green (#33ff33), amber (#ffaa00)

## Troubleshooting

### node-pty build errors
node-pty requires native compilation:
```bash
npm rebuild node-pty
```

### Blank terminal
- Check DevTools console for errors
- Ensure PTY spawned successfully (check main process logs)

### Global shortcuts not working
- Check for conflicts with other apps
- Run as administrator if needed

---

## Funding and sponsors

- **GitHub Sponsors:** https://github.com/sponsors/jamditis
- **Venmo:** @jamditis
- **FUNDING.yml:** `.github/FUNDING.yml` enables the Sponsor button on the repo

---

## Multi-machine workflow

This repo is developed across multiple machines (MacBook, work Windows PC, home Windows PC). GitHub is the source of truth.

**Before switching machines:**
```bash
git add . && git commit -m "WIP" && git push
```

**After switching machines:**
```bash
git pull
npm install  # Recompile native modules for current platform
```
