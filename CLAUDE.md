# AudioBash - Voice-controlled terminal for Claude Code

---

## 📖 Documentation & GitHub Pages (2025-01-02)

AudioBash has comprehensive web documentation hosted on GitHub Pages:

### Live documentation URLs
- **Landing page:** https://jamditis.github.io/audiobash/
- **User manual:** https://jamditis.github.io/audiobash/manual.html
- **macOS guide:** https://jamditis.github.io/audiobash/macos.html
- **Release notes:** https://jamditis.github.io/audiobash/releases.html

### Documentation files
```
docs/
├── index.html          # Landing page with download links
├── manual.html         # Full user manual with screenshots
├── macos.html          # macOS-specific announcement page
├── releases.html       # Version history and changelog
└── screenshots/        # UI screenshots (full + web-optimized)
    ├── 01-main-window.png
    ├── 01-main-window-web.png (800px max width)
    ├── 02-settings-panel.png
    ├── ...
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
npm test                           # Verify 70 tests pass
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

### Known issues to investigate
- Multi-tab/split-screen has stability issues (resize debouncing added but may need more work)
- Test the voice recording on Mac (uses same MediaRecorder API, should work)

### Relevant files for macOS
- `docs/MACOS_BUILD.md` - Full build guide
- `.github/workflows/build.yml` - CI/CD for multi-platform builds
- `tests/` - 70 tests for cross-platform compatibility

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
│   ├── main.cjs          # Electron main process, node-pty
│   └── preload.cjs       # Context bridge for IPC
├── src/
│   ├── components/
│   │   ├── Terminal.tsx  # xterm.js wrapper
│   │   ├── VoicePanel.tsx # Voice input UI
│   │   └── TitleBar.tsx  # Frameless window controls
│   ├── services/         # Transcription service (port from Yap)
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
