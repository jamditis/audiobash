# AudioBash - Voice-controlled terminal for Claude Code

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
npm test                           # Verify tests pass
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
Right-click → Open → Click "Open" in Gatekeeper dialog (first launch only)
Or: `xattr -cr /Applications/AudioBash.app`

### Known issues
- Multi-tab/split-screen has stability issues (resize debouncing added but may need more work)
- Test the voice recording on Mac (uses same MediaRecorder API, should work)
- **Apple Silicon crash on launch (#29):** Fixed in v2.4.0 and confirmed on M1 hardware. Two root causes: (1) `chmod` in afterPack.cjs invalidated ARM64 code signatures on node-pty binaries — fixed by re-signing with `codesign --force --sign -` after chmod. (2) No error handling in `app.whenReady()` handler — added try-catch, global error handlers, and tray icon guard. v2.4.0 also upgrades to Electron 39.6.0 (fixes macOS Tahoe GPU lag).

### Relevant files for macOS
- `docs/MACOS_BUILD.md` - Full build guide
- `.github/workflows/build.yml` - CI/CD for multi-platform builds
- `tests/` - Test suite for cross-platform compatibility

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
│   │   ├── Terminal.tsx  # xterm.js wrapper
│   │   ├── VoiceOverlay.tsx # Voice input UI
│   │   └── TitleBar.tsx  # Frameless window controls
│   ├── services/         # Transcription and speech services
│   ├── utils/            # Audio utilities
│   ├── App.tsx           # Main layout
│   ├── index.tsx         # React entry
│   ├── index.css         # Tailwind entry
│   └── types.ts          # TypeScript interfaces
├── assets/               # Icons
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
