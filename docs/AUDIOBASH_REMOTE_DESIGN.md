# AudioBash Remote Design

> **SUPERSEDED** — This document describes the original remote control design (tunnels, pairing codes, voice bridge, file browser). That architecture was replaced in v2.5.0 with a lightweight mobile page served directly by the WebSocket server on port 8765. The new design uses the phone's built-in speech-to-text and Tailscale for remote access.

> "I think I might never sleep again." - @bramk using Claude Code from his iPhone

## Vision

AudioBash Remote brings the full voice-controlled terminal experience to your phone. Talk to Claude Code from anywhere - your couch, a coffee shop, or while walking the dog.

**Target User:** Developer with AudioBash running on their desktop/server, wanting to control it from an Android phone (Samsung S24 Ultra) or any mobile device.

---

## Why a Real Terminal Matters

> "Why not the Claude app directly?" - Twitter reply
> "I can run stuff" - @bramk

The Claude web/mobile app can **suggest** commands. AudioBash Remote can **execute** them.

```
┌─────────────────────────────────────────────────────────────────┐
│              Claude App vs AudioBash Remote                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  What Claude App Does:                What AudioBash Does:       │
│  ─────────────────────               ────────────────────────   │
│                                                                  │
│  "To build your project,            $ npm run build              │
│   run: npm run build"               ✓ Compiled successfully      │
│                                      Built in 3.2s               │
│  (You copy, switch apps,                                        │
│   paste, run manually)              $ git add . && git commit    │
│                                      [main abc123] Fix: auth bug │
│  "To fix this error,                                            │
│   try changing line 42..."          $ npm test                   │
│                                      ✓ 47 tests passed           │
│  (You manually edit,                 ✗ 2 tests failed            │
│   save, run again)                                               │
│                                      Claude sees the failure,    │
│  "It should work now"               fixes it, runs again...     │
│  (Hope it does?)                    ✓ 49 tests passed           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**The feedback loop is everything:**

1. **Claude Code sees real output** - Not your description of it
2. **Iterates on failures** - Runs tests, sees errors, fixes them
3. **Verifies fixes** - Runs again until it actually works
4. **Commits real changes** - `git push` from your couch

**Use cases that require a real terminal:**

| Task | What You Say | What Happens |
|------|--------------|--------------|
| Deploy | "deploy to prod" | `git push origin main` → CI/CD runs |
| Debug | "why is auth failing?" | Claude reads logs, traces code, fixes |
| Build | "build and test" | `npm run build && npm test` |
| Refactor | "rename User to Account" | 50+ file changes, all tested |
| Docker | "spin up the dev stack" | `docker compose up -d` |

This is the **"velocity"** people talk about - you're not context-switching between apps, copying commands, debugging why it didn't work. You just talk, and things happen.

---

## Inspiration: The Bram Setup

From the viral Twitter thread:

```
┌─────────────────────────────────────────────────────┐
│  Bram's Setup (Current State of the Art)           │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Google Cloud VM                                    │
│  └── Claude Code installed                         │
│       └── Running in terminal                      │
│                                                     │
│  iPhone                                            │
│  └── Termius app                                   │
│       └── SSH connection to VM                     │
│       └── Voice typing (iOS keyboard)             │
│                                                     │
│  Alternative (Richard's suggestion):               │
│  └── Mac mini at home                             │
│       └── Tailscale for networking                │
│       └── "Works anywhere"                        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Key insight:** The magic is voice → terminal → Claude Code, not the specific implementation.

**AudioBash advantage:** We already have:
- WebSocket server with authentication
- Tunnel support (ngrok/Cloudflare)
- Voice transcription infrastructure
- Terminal output streaming

We just need a good mobile client.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     AudioBash Remote Architecture                    │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────────┐         ┌──────────────────────────────────┐
│  MOBILE CLIENT       │         │  AUDIOBASH SERVER (Desktop/VM)   │
│  (PWA / Web App)     │         │                                  │
├──────────────────────┤         ├──────────────────────────────────┤
│                      │         │                                  │
│  ┌────────────────┐  │   wss   │  ┌────────────────────────────┐ │
│  │ Voice Input    │  │ ◄─────► │  │ WebSocket Server (8766)    │ │
│  │ (Web Speech    │  │         │  │ - Authentication           │ │
│  │  API / native) │  │         │  │ - Terminal I/O             │ │
│  └───────┬────────┘  │         │  │ - Audio processing         │ │
│          │           │         │  └─────────────┬──────────────┘ │
│          ▼           │         │                │                │
│  ┌────────────────┐  │         │  ┌─────────────▼──────────────┐ │
│  │ Terminal View  │  │         │  │ PTY Process (node-pty)     │ │
│  │ (xterm.js or   │  │         │  │ └── Claude Code running    │ │
│  │  simplified)   │  │         │  │     └── Your project       │ │
│  └────────────────┘  │         │  └────────────────────────────┘ │
│                      │         │                                  │
│  ┌────────────────┐  │         │  ┌────────────────────────────┐ │
│  │ Connection     │  │         │  │ Tunnel Service             │ │
│  │ - QR scan      │  │         │  │ - Cloudflare (default)     │ │
│  │ - URL entry    │  │         │  │ - ngrok (alternative)      │ │
│  │ - Pairing code │  │         │  │ → Public wss:// URL        │ │
│  └────────────────┘  │         │  └────────────────────────────┘ │
│                      │         │                                  │
└──────────────────────┘         └──────────────────────────────────┘

Connection Options:
─────────────────────
1. Local WiFi:    ws://192.168.x.x:8765 (same network)
2. Tailscale:     ws://100.x.x.x:8765   (private mesh VPN)
3. Tunnel:        wss://abc123.trycloudflare.com (anywhere)
```

---

## Mobile Client Design

### Platform: Progressive Web App (PWA)

**Why PWA over native app:**
- Works on Android AND iOS from single codebase
- No app store approval needed
- Instant updates
- Can be "installed" to home screen
- Full access to Web Speech API on Android Chrome
- Samsung Internet browser support

**Tech Stack:**
- React (matches desktop codebase)
- Vite (fast builds)
- Tailwind CSS (same void/brutalist aesthetic)
- xterm.js (same terminal renderer)
- Web Speech API (voice input)

### UI Layout (Mobile-First)

```
┌─────────────────────────────────────┐
│ ≡  AudioBash Remote    ⚙️  🔗 ● │  ← Status bar
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │ $ claude                    │   │
│  │ Welcome back!               │   │
│  │                             │   │
│  │ > how do I log an error?   │   │  ← Terminal output
│  │                             │   │
│  │ I'll help you with error   │   │
│  │ logging. Looking at your   │   │
│  │ codebase...                │   │
│  │                             │   │
│  │ █                          │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │ add a try-catch block...   │   │  ← Voice preview
│  └─────────────────────────────┘   │
│                                     │
│  ┌───────┐  ┌───────────────────┐  │
│  │  🎤   │  │ Send to terminal  │  │  ← Action buttons
│  │ HOLD  │  │        ⏎          │  │
│  └───────┘  └───────────────────┘  │
│                                     │
│  [Tab 1] [Tab 2] [Tab 3] [+]       │  ← Tab bar
└─────────────────────────────────────┘
```

### Voice Input Modes

**1. Push-to-Talk (Default)**
- Hold the microphone button to record
- Release to send
- Visual feedback: pulsing red border, waveform

**2. Continuous Listening (Optional)**
- Tap to start, tap to stop
- Auto-send on silence detection
- Battery warning for extended use

**3. System Voice Keyboard (Fallback)**
- Uses Android's built-in voice typing
- Works with Samsung's voice input
- No AudioBash transcription needed

### Voice Processing Options

```
┌─────────────────────────────────────────────────────────────────┐
│                    Voice Processing Modes                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Option A: Server-Side Transcription (Recommended)              │
│  ─────────────────────────────────────────────────              │
│  Phone → [audio blob] → Server → Gemini/OpenAI → Text → PTY    │
│                                                                  │
│  ✓ Uses your existing API keys                                  │
│  ✓ Agent mode with terminal context                             │
│  ✓ "list all files" → "ls -la"                                  │
│  ✗ Requires data transfer                                       │
│                                                                  │
│  Option B: Client-Side Web Speech API                           │
│  ────────────────────────────────────────                       │
│  Phone → [Web Speech API] → Text → Server → PTY                 │
│                                                                  │
│  ✓ Zero latency                                                 │
│  ✓ Works offline (text only, no AI)                             │
│  ✓ Free (uses Google's speech recognition)                      │
│  ✗ No agent mode (literal transcription only)                   │
│                                                                  │
│  Option C: Hybrid (Best of Both)                                │
│  ────────────────────────────────                               │
│  Quick commands → Client-side (fast)                            │
│  Complex requests → Server-side (smart)                         │
│                                                                  │
│  Toggle: [RAW] ←→ [AGENT]                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Connection Flow

### First-Time Setup

```
┌─────────────────────────────────────────────────────────────────┐
│                     Connection Flow                              │
└─────────────────────────────────────────────────────────────────┘

DESKTOP (AudioBash)                    MOBILE (PWA)
─────────────────────                  ──────────────────

1. Enable Remote Access
   Settings → Remote → Enable

2. Start Tunnel (for external access)
   [Start Cloudflare Tunnel]
   → Generates: abc123.trycloudflare.com

3. Show Pairing QR Code              ──►  Scan QR Code
   ┌──────────────┐                       OR
   │ ▄▄▄▄▄▄▄▄▄▄▄▄│
   │ █  QR CODE  █│                       Enter URL manually:
   │ █           █│                       [wss://abc123.trycloudflare.com]
   │ ▀▀▀▀▀▀▀▀▀▀▀▀│
   │              │
   │ Code: ABC123 │                       Enter pairing code:
   └──────────────┘                       [A] [B] [C] [1] [2] [3]

4. Connection Established           ◄──►  ✓ Connected!
   "Mobile client connected"              "AudioBash Desktop"
```

### QR Code Contents

```json
{
  "url": "wss://abc123.trycloudflare.com",
  "code": "ABC123",
  "version": 1,
  "name": "Joe's Desktop"
}
```

### Security Considerations

- **Pairing code:** 6 characters, expires in 5 minutes, single use
- **Static password:** Optional, for persistent connections
- **Rate limiting:** 5 failed attempts = 5 minute lockout
- **TLS:** Always wss:// for tunnel connections
- **Single device:** Only one mobile client at a time

---

## Android-Specific Features

### Samsung S24 Ultra Optimizations

```
┌─────────────────────────────────────────────────────────────────┐
│                  Samsung S24 Ultra Features                      │
└─────────────────────────────────────────────────────────────────┘

1. S Pen Support
   ─────────────
   - Handwriting recognition for command input
   - Air Actions: wave to send, circle to cancel
   - Hover preview over terminal output

2. Samsung DeX Mode
   ─────────────────
   - Full desktop experience when docked
   - Keyboard shortcuts (Alt+S for voice)
   - Multi-window: terminal + docs side by side

3. Samsung Voice Typing
   ─────────────────────
   - "Hi Bixby, type..." integration
   - Offline voice recognition
   - Punctuation commands ("new line", "period")

4. Good Lock Customization
   ────────────────────────
   - Edge panel quick access
   - Floating window mode
   - One Hand Operation+ gestures

5. Always On Display
   ──────────────────
   - Show connection status
   - Last command preview
   - Quick voice trigger (future)
```

### PWA Installation on Samsung

```
Chrome → ⋮ Menu → "Add to Home screen"
         OR
Samsung Internet → ⋮ → "Add page to" → "Home screen"

Result:
┌─────────────┐
│    ┌───┐    │
│    │ AB│    │  ← App icon on home screen
│    └───┘    │
│  AudioBash  │
│   Remote    │
└─────────────┘
```

---

## Implementation Phases

### Phase 1: Web Client MVP (Week 1-2)
- [ ] Create `/remote` directory in AudioBash repo
- [ ] Set up Vite + React + Tailwind for PWA
- [ ] Implement WebSocket connection to existing server
- [ ] Basic terminal view (receive-only)
- [ ] Text input field with send button
- [ ] Connection status indicator

### Phase 2: Voice Input (Week 2-3)
- [ ] Integrate Web Speech API for client-side transcription
- [ ] Push-to-talk button with visual feedback
- [ ] Voice preview before sending
- [ ] Fallback to server-side transcription
- [ ] Mode toggle: RAW vs AGENT

### Phase 3: Full Terminal Experience (Week 3-4)
- [ ] xterm.js integration for proper terminal rendering
- [ ] Multi-tab support
- [ ] Terminal resize handling
- [ ] Scroll history
- [ ] Copy/paste support

### Phase 4: Polish & PWA Features (Week 4-5)
- [ ] QR code pairing flow
- [ ] Service worker for offline capability
- [ ] Push notifications for long-running commands
- [ ] Settings persistence
- [ ] Samsung-specific optimizations

### Phase 5: Optional Native Wrapper
- [ ] Capacitor.js wrapper for Play Store
- [ ] Native voice recording (better quality)
- [ ] Background audio processing
- [ ] System integration (share to AudioBash)

---

## File Structure

```
audiobash/
├── remote/                          # New PWA client
│   ├── public/
│   │   ├── manifest.json           # PWA manifest
│   │   ├── sw.js                   # Service worker
│   │   └── icons/                  # App icons
│   ├── src/
│   │   ├── components/
│   │   │   ├── Terminal.tsx        # Terminal view
│   │   │   ├── VoiceButton.tsx     # Push-to-talk
│   │   │   ├── ConnectionModal.tsx # QR/pairing UI
│   │   │   └── StatusBar.tsx       # Connection status
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts     # WS connection
│   │   │   ├── useVoice.ts         # Web Speech API
│   │   │   └── useTerminal.ts      # Terminal state
│   │   ├── services/
│   │   │   └── connection.ts       # Auth & reconnection
│   │   ├── App.tsx
│   │   ├── index.tsx
│   │   └── index.css               # Tailwind + void aesthetic
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
│
├── electron/
│   ├── main.cjs                    # Add QR code generation
│   └── websocket-server.cjs        # Already supports mobile!
│
└── docs/
    └── AUDIOBASH_REMOTE_DESIGN.md  # This file
```

---

## Message Protocol

The WebSocket server already supports these messages. The mobile client just needs to implement the client side:

### Authentication
```javascript
// Client → Server
{ "type": "auth", "code": "ABC123" }

// Server → Client
{ "type": "auth_response", "success": true }
```

### Terminal I/O
```javascript
// Client → Server (send command)
{ "type": "terminal_write", "data": "ls -la\r", "tabId": "tab-1" }

// Server → Client (receive output)
{ "type": "terminal_data", "data": "total 42\ndrwxr-xr-x...", "tabId": "tab-1" }
```

### Voice (Server-Side Transcription)
```javascript
// Client → Server
{ "type": "audio_start", "mimeType": "audio/webm" }

// Client → Server (binary frames)
<audio chunk bytes>

// Client → Server
{ "type": "audio_end" }

// Server → Client
{ "type": "transcription", "text": "list all files", "command": "ls -la" }
```

### Tab Management
```javascript
// Get available tabs
{ "type": "get_tabs" }

// Response
{ "type": "tabs", "tabs": [{"id": "tab-1", "active": true}, ...] }

// Switch tab
{ "type": "switch_tab", "tabId": "tab-2" }
```

---

## Design Aesthetic

Matches AudioBash desktop - void/brutalist:

```css
:root {
  --void: #050505;
  --chrome: #e5e5e5;
  --acid: #ccff00;
  --accent-red: #ff3333;
  --crt-green: #33ff33;
}

/* Mobile-specific adjustments */
.terminal {
  font-size: 14px;           /* Readable on phone */
  padding: 8px;              /* Touch-friendly margins */
  -webkit-overflow-scrolling: touch;
}

.voice-button {
  min-height: 64px;          /* Easy to tap */
  min-width: 64px;
}

/* Samsung-specific */
@media (display-mode: standalone) {
  /* PWA installed mode */
  .status-bar {
    padding-top: env(safe-area-inset-top);
  }
}
```

---

## Comparison: AudioBash Remote vs Termius

| Feature | Termius | AudioBash Remote |
|---------|---------|------------------|
| Platform | iOS, Android, Desktop | PWA (any browser) |
| Connection | SSH | WebSocket |
| Voice Input | System keyboard | Built-in + AI agent |
| Context Awareness | None | Terminal context → smart commands |
| Setup | SSH keys, IP address | QR code scan |
| Cost | Free tier limited | Free |
| Terminal Rendering | Native | xterm.js |
| Multi-tab | Yes | Yes |
| File Manager | Yes (paid) | Yes (built-in) |

**AudioBash Remote advantages:**
1. **Voice-first** - Designed for voice, not adapted
2. **Agent mode** - "list files" → `ls -la` with context
3. **Zero config** - QR scan, done
4. **Integrated** - Same app, same experience
5. **Free** - No subscription tiers

---

## Success Metrics

1. **Connection time:** QR scan to first command < 10 seconds
2. **Voice latency:** Speak → command appears < 2 seconds
3. **Reliability:** 99% uptime when tunnel is active
4. **Battery:** < 5% per hour of active use
5. **User satisfaction:** "I might never sleep again" 😴

---

## Open Questions

1. **Keyboard shortcuts on mobile?** - Volume buttons for voice?
2. **Notification sounds?** - When command completes?
3. **Dark mode only?** - Or support light mode too?
4. **Offline mode?** - Cache last terminal state?
5. **Multiple servers?** - Connect to different machines?

---

## References

- Twitter thread: @bramk's iPhone + Claude Code setup
- Existing: `docs/REMOTE_VOICE_CONTROL_PLAN.md` (comprehensive 5-phase plan)
- Existing: `electron/websocket-server.cjs` (1400+ lines, production-ready)
- Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
- PWA: https://web.dev/progressive-web-apps/
