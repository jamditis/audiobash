# AudioBash Remote Voice Control - Implementation Plan

## Executive Summary

This plan outlines the implementation of remote voice control capabilities for AudioBash, allowing users to control their desktop terminal from mobile devices over the web. Based on comprehensive research of modern best practices, common pitfalls, and competitive analysis.

---

## Research Findings Summary

### Key Insights

1. **WebRTC is the optimal choice** for real-time voice streaming (100-300ms latency vs 300-500ms+ for WebSocket)
2. **Opus codec** is mandatory - universally supported, adaptive bitrate, excellent for voice
3. **iOS PWAs are NOT viable** for voice apps - Web Speech API doesn't work in installed PWAs
4. **Hybrid architecture** (local-first + cloud fallback) provides best UX
5. **QR code pairing** is the gold standard for mobile-to-desktop connection
6. **Terminal-only streaming** (not full desktop) is a major differentiator - lighter, faster, more secure

### Competitive Advantages

| Feature | TeamViewer/AnyDesk | Chrome Remote | Unified Remote | **AudioBash Remote** |
|---------|-------------------|---------------|----------------|---------------------|
| Voice Control | Limited | None | Basic | **AI-Enhanced** |
| Terminal Focus | No (full desktop) | No | Partial | **Yes** |
| Latency | Medium | High | Medium | **Low (text only)** |
| Privacy | Cloud-dependent | Google | Server-based | **Local-first** |
| Claude Integration | No | No | No | **Yes** |
| Pricing | Expensive | Free | $5 one-time | **Freemium** |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AudioBash Remote Architecture                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   MOBILE APP (React Native)              DESKTOP APP (Electron)        │
│   ┌─────────────────────┐                ┌─────────────────────┐       │
│   │  Voice Recording    │                │  Terminal (xterm.js) │       │
│   │  (MediaRecorder)    │                │  + node-pty          │       │
│   │         │           │                │         ▲            │       │
│   │         ▼           │                │         │            │       │
│   │  Local Whisper      │                │  Command Execution   │       │
│   │  (on-device ASR)    │                │         ▲            │       │
│   │         │           │                │         │            │       │
│   │         ▼           │                │  Claude Code         │       │
│   │  Transcribed Text   │◄──WebRTC DC───►│  Integration         │       │
│   └─────────────────────┘                └─────────────────────┘       │
│              │                                      │                   │
│              │         ┌──────────────────┐         │                   │
│              └────────►│ Signaling Server │◄────────┘                   │
│                        │ (Socket.IO)      │                             │
│                        │ Self-hosted on   │                             │
│                        │ Desktop          │                             │
│                        └──────────────────┘                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Connection Flow

```
1. Desktop generates room ID + displays QR code
2. Mobile scans QR → extracts signaling server URL + room ID
3. Both connect to signaling server (WebSocket)
4. Exchange SDP offers/answers + ICE candidates
5. Establish WebRTC DataChannel (P2P)
6. Mobile: Voice → Whisper → Text → DataChannel → Desktop
7. Desktop: Execute command → Terminal output → DataChannel → Mobile
```

---

## Phase 1: Core Infrastructure (Week 1-2)

### 1.1 Embedded Signaling Server

**Location:** `electron/signaling-server.cjs`

```javascript
// Embedded Socket.IO server in Electron main process
const { Server } = require('socket.io');
const http = require('http');
const { networkInterfaces } = require('os');

class SignalingServer {
  constructor(port = 3847) {
    this.port = port;
    this.server = http.createServer();
    this.io = new Server(this.server, {
      cors: { origin: '*' }
    });
    this.rooms = new Map();
  }

  start() {
    this.io.on('connection', (socket) => {
      socket.on('join-room', (roomId) => {
        socket.join(roomId);
        socket.to(roomId).emit('peer-joined', socket.id);
      });

      socket.on('signal', (data) => {
        this.io.to(data.to).emit('signal', {
          from: socket.id,
          signal: data.signal
        });
      });

      socket.on('disconnect', () => {
        // Notify peers
      });
    });

    this.server.listen(this.port);
    return this.getLocalIP();
  }

  getLocalIP() {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return 'localhost';
  }

  generateRoomId() {
    return require('crypto').randomUUID().slice(0, 8);
  }
}
```

### 1.2 QR Code Pairing UI

**Location:** `src/components/RemotePairing.tsx`

```typescript
interface PairingData {
  serverUrl: string;
  roomId: string;
  desktopId: string;
  timestamp: number;
  signature: string; // HMAC for verification
}

// QR contains: audiobash://pair?data=<base64-encoded-pairing-data>
```

**Features:**
- Generate unique room ID per session
- Display QR code with pairing URL
- Show PIN fallback for manual entry
- Auto-refresh QR every 5 minutes
- Visual connection status indicator

### 1.3 WebRTC DataChannel Setup

**Location:** `src/services/peer-connection.ts`

```typescript
class PeerConnectionManager {
  private pc: RTCPeerConnection;
  private dataChannel: RTCDataChannel;

  constructor() {
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.dataChannel = this.pc.createDataChannel('audiobash', {
      ordered: true
    });

    this.setupDataChannelHandlers();

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  private setupDataChannelHandlers() {
    this.dataChannel.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };
  }

  send(type: string, payload: any) {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
    }
  }
}
```

### 1.4 Message Protocol

```typescript
// Mobile → Desktop messages
interface VoiceCommandMessage {
  type: 'voice-command';
  payload: {
    transcript: string;
    confidence: number;
    language: string;
  };
}

interface ControlMessage {
  type: 'control';
  payload: {
    action: 'interrupt' | 'clear' | 'scroll-up' | 'scroll-down';
  };
}

// Desktop → Mobile messages
interface TerminalOutputMessage {
  type: 'terminal-output';
  payload: {
    data: string;
    timestamp: number;
  };
}

interface StatusMessage {
  type: 'status';
  payload: {
    connected: boolean;
    claudeActive: boolean;
    currentDirectory: string;
  };
}
```

---

## Phase 2: Mobile App (Week 3-5)

### 2.1 React Native App Structure

**Why React Native (not PWA):**
- iOS PWA cannot do background audio recording
- Web Speech API doesn't work in iOS PWAs
- React Native shares ~60% code with existing React components
- Full hardware access on both platforms

**Project Structure:**
```
audiobash-mobile/
├── src/
│   ├── screens/
│   │   ├── ScanScreen.tsx      # QR scanner
│   │   ├── RemoteScreen.tsx    # Main remote interface
│   │   └── SettingsScreen.tsx  # App settings
│   ├── components/
│   │   ├── VoiceButton.tsx     # Push-to-talk
│   │   ├── TerminalView.tsx    # Terminal output display
│   │   └── StatusBar.tsx       # Connection status
│   ├── services/
│   │   ├── whisper.ts          # On-device transcription
│   │   ├── peer-connection.ts  # WebRTC (shared with desktop)
│   │   └── audio-recorder.ts   # Native audio recording
│   └── App.tsx
├── ios/
├── android/
└── package.json
```

### 2.2 Voice Recording (Native)

```typescript
// Using react-native-audio-recorder-player or expo-av
import AudioRecorderPlayer from 'react-native-audio-recorder-player';

class VoiceRecorder {
  private recorder: AudioRecorderPlayer;
  private isRecording: boolean = false;

  async startRecording() {
    const path = Platform.select({
      ios: 'recording.m4a',
      android: 'recording.mp4',
    });

    await this.recorder.startRecorder(path, {
      AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
      AudioSourceAndroid: AudioSourceAndroidType.MIC,
      AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
      AVNumberOfChannelsKeyIOS: 1,
      AVFormatIDKeyIOS: AVEncodingOption.aac,
    });

    this.isRecording = true;
  }

  async stopRecording(): Promise<string> {
    const result = await this.recorder.stopRecorder();
    this.isRecording = false;
    return result; // File path
  }
}
```

### 2.3 On-Device Transcription (Whisper)

**Options:**
1. **whisper.cpp** via React Native bridge (best quality)
2. **react-native-whisper** package
3. **expo-speech-recognition** (uses platform APIs)

```typescript
// Using whisper.cpp integration
import { transcribe } from 'react-native-whisper';

async function transcribeAudio(audioPath: string): Promise<string> {
  const result = await transcribe({
    filePath: audioPath,
    model: 'tiny.en', // Small model for speed (39MB)
    language: 'en',
  });

  return result.text;
}
```

**Model Selection:**
| Model | Size | Speed | Accuracy | Recommendation |
|-------|------|-------|----------|----------------|
| tiny.en | 39MB | Fast | Good | **Default** |
| base.en | 74MB | Medium | Better | High accuracy mode |
| small.en | 244MB | Slow | Best | WiFi only |

### 2.4 Mobile UI Design

```
┌─────────────────────────────────────┐
│  AudioBash Remote          ● Connected │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │ ~/projects/audiobash        │   │
│  │ $ npm test                  │   │
│  │                             │   │
│  │ PASS tests/terminal.test.ts│   │
│  │ PASS tests/voice.test.ts   │   │
│  │                             │   │
│  │ Tests: 70 passed           │   │
│  │ Time: 4.2s                 │   │
│  └─────────────────────────────┘   │
│                                     │
│  Last command: "run the tests"      │
│                                     │
├─────────────────────────────────────┤
│                                     │
│         ┌───────────────┐           │
│         │               │           │
│         │   🎤 SPEAK    │           │
│         │               │           │
│         └───────────────┘           │
│      Hold to speak, release to send │
│                                     │
│  [⬆️ Scroll] [⏹️ Stop] [🗑️ Clear]    │
└─────────────────────────────────────┘
```

---

## Phase 3: Security Implementation (Week 4-5)

### 3.1 Pairing Security

```typescript
// Desktop: Generate secure pairing token
function generatePairingToken(): PairingToken {
  const roomId = crypto.randomUUID().slice(0, 8);
  const secret = crypto.randomBytes(32).toString('hex');
  const timestamp = Date.now();

  const payload = JSON.stringify({ roomId, timestamp });
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return {
    roomId,
    secret, // Store locally, don't include in QR
    timestamp,
    signature,
    expiresAt: timestamp + 5 * 60 * 1000 // 5 minutes
  };
}

// Mobile: Validate pairing token
function validatePairingToken(token: PairingToken, secret: string): boolean {
  if (Date.now() > token.expiresAt) {
    return false; // Expired
  }

  const payload = JSON.stringify({ roomId: token.roomId, timestamp: token.timestamp });
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return token.signature === expectedSignature;
}
```

### 3.2 Message Authentication

```typescript
// All messages include nonce + timestamp to prevent replay
interface SecureMessage {
  type: string;
  payload: any;
  nonce: string;       // crypto.randomUUID()
  timestamp: number;   // Date.now()
  signature: string;   // HMAC of type + payload + nonce + timestamp
}

class MessageAuthenticator {
  private usedNonces: Set<string> = new Set();
  private secret: string;

  sign(message: Omit<SecureMessage, 'signature'>): SecureMessage {
    const data = JSON.stringify({
      type: message.type,
      payload: message.payload,
      nonce: message.nonce,
      timestamp: message.timestamp
    });

    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('hex');

    return { ...message, signature };
  }

  verify(message: SecureMessage): boolean {
    // Check timestamp (max 60 seconds old)
    if (Math.abs(Date.now() - message.timestamp) > 60000) {
      return false;
    }

    // Check nonce not reused
    if (this.usedNonces.has(message.nonce)) {
      return false;
    }
    this.usedNonces.add(message.nonce);

    // Verify signature
    const { signature, ...rest } = message;
    const expectedSignature = this.sign(rest).signature;

    return signature === expectedSignature;
  }
}
```

### 3.3 Rate Limiting

```typescript
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests = 60;  // per minute
  private windowMs = 60000;

  isAllowed(clientId: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(clientId) || [];

    // Remove old timestamps
    const recent = timestamps.filter(t => now - t < this.windowMs);

    if (recent.length >= this.maxRequests) {
      return false;
    }

    recent.push(now);
    this.requests.set(clientId, recent);
    return true;
  }
}
```

---

## Phase 4: Advanced Features (Week 6-8)

### 4.1 Offline Command Queue

```typescript
// Mobile: Queue commands when disconnected
class OfflineCommandQueue {
  private db: IDBDatabase;

  async enqueue(command: string) {
    const tx = this.db.transaction('commands', 'readwrite');
    await tx.objectStore('commands').add({
      command,
      timestamp: Date.now(),
      status: 'pending'
    });
  }

  async flushToDesktop(connection: PeerConnectionManager) {
    const tx = this.db.transaction('commands', 'readonly');
    const commands = await tx.objectStore('commands').getAll();

    for (const cmd of commands) {
      if (cmd.status === 'pending') {
        connection.send('voice-command', { transcript: cmd.command });
        await this.markSent(cmd.id);
      }
    }
  }
}
```

### 4.2 Session Persistence

```typescript
// Desktop: Persist terminal sessions (like tmux)
class SessionManager {
  private sessions: Map<string, TerminalSession> = new Map();

  createSession(id: string): TerminalSession {
    const session = new TerminalSession(id);
    this.sessions.set(id, session);
    this.persistToDisk();
    return session;
  }

  restoreSession(id: string): TerminalSession | null {
    // Restore from disk if exists
    const savedSessions = this.loadFromDisk();
    if (savedSessions[id]) {
      return this.hydrateSession(savedSessions[id]);
    }
    return null;
  }
}
```

### 4.3 AI-Enhanced Command Interpretation

```typescript
// Use Claude to interpret natural language commands
async function interpretCommand(
  transcript: string,
  context: TerminalContext
): Promise<string> {
  // Simple commands pass through directly
  if (isSimpleCommand(transcript)) {
    return transcript;
  }

  // Complex natural language → Claude interprets
  const prompt = `
    User said: "${transcript}"
    Current directory: ${context.cwd}
    Recent commands: ${context.recentCommands.join(', ')}

    Convert this to a terminal command. Output ONLY the command, nothing else.
  `;

  const command = await claudeAPI.complete(prompt);
  return command.trim();
}

function isSimpleCommand(text: string): boolean {
  const simplePatterns = [
    /^(ls|cd|pwd|git|npm|yarn|cat|grep|find|mkdir|rm|cp|mv)\b/,
    /^(exit|clear|quit|stop)/
  ];
  return simplePatterns.some(p => p.test(text.toLowerCase()));
}
```

### 4.4 State Synchronization (Yjs)

```typescript
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

// Shared state between mobile and desktop
const doc = new Y.Doc();
const settings = doc.getMap('settings');
const commandHistory = doc.getArray('commandHistory');

// Sync via WebRTC DataChannel
const provider = new WebrtcProvider('audiobash-session', doc, {
  signaling: ['ws://localhost:3847']
});

// Changes automatically sync to all connected peers
settings.set('theme', 'dark');
commandHistory.push(['git status', 'npm test']);
```

---

## Phase 5: Polish & Production (Week 9-10)

### 5.1 Connection Resilience

```typescript
class ConnectionManager {
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  async connect() {
    try {
      await this.establishConnection();
      this.reconnectAttempts = 0;
    } catch (error) {
      await this.handleConnectionFailure(error);
    }
  }

  private async handleConnectionFailure(error: Error) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit('connection-failed', error);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

    await new Promise(resolve => setTimeout(resolve, delay));
    await this.connect();
  }
}
```

### 5.2 Battery Optimization (Mobile)

```typescript
// Adjust behavior based on battery status
async function optimizeForBattery() {
  const battery = await navigator.getBattery?.();

  if (battery && !battery.charging && battery.level < 0.2) {
    // Low battery mode
    return {
      whisperModel: 'tiny.en',      // Smaller model
      heartbeatInterval: 30000,      // Less frequent heartbeat
      transcriptionQuality: 'fast',  // Faster, less accurate
    };
  }

  return {
    whisperModel: 'base.en',
    heartbeatInterval: 5000,
    transcriptionQuality: 'balanced',
  };
}
```

### 5.3 Network Adaptation

```typescript
// Monitor network and adapt quality
navigator.connection?.addEventListener('change', () => {
  const connection = navigator.connection;

  if (connection.effectiveType === '4g') {
    setStreamingQuality('high');
  } else if (connection.effectiveType === '3g') {
    setStreamingQuality('medium');
  } else {
    setStreamingQuality('low');
  }
});
```

---

## Testing Strategy

### Unit Tests
- Signaling server message handling
- WebRTC offer/answer generation
- Message authentication/verification
- Rate limiting logic
- Command interpretation

### Integration Tests
- Full pairing flow (QR scan → connection)
- Voice recording → transcription → command execution
- Reconnection after network drop
- Offline queue flush

### E2E Tests
- Complete user journey: pair → speak → see output
- Multi-device scenarios
- Network condition simulation

### Security Tests
- Replay attack prevention
- Token expiration
- Rate limit enforcement
- Unauthorized access attempts

---

## Deployment & Distribution

### Desktop (Existing)
- Auto-update via electron-updater
- DMG for macOS, NSIS for Windows

### Mobile App
- **iOS**: TestFlight → App Store
- **Android**: Internal testing → Play Store
- **Alternative**: Direct APK download for Android

### Pricing Model (Recommended)

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Local voice terminal (unlimited) |
| **Remote** | $4.99/mo | Mobile app access, remote control |
| **Pro** | $9.99/mo | Team features, priority support |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| iOS App Store rejection | Follow Apple guidelines strictly, emphasize productivity use case |
| WebRTC connection failures | Robust fallback to WebSocket proxy |
| Whisper model size on mobile | Start with tiny model, download larger on WiFi |
| Security vulnerabilities | External security audit before launch |
| User adoption | Focus on existing AudioBash users first |

---

## Success Metrics

1. **Connection success rate**: >95% on first attempt
2. **Voice-to-execution latency**: <2 seconds
3. **Transcription accuracy**: >90% for common commands
4. **App Store rating**: >4.5 stars
5. **Monthly active remote users**: Track growth

---

## Timeline Summary

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1-2 | Infrastructure | Signaling server, WebRTC, QR pairing |
| 3-5 | Mobile App | React Native app, voice recording, Whisper |
| 4-5 | Security | Authentication, encryption, rate limiting |
| 6-8 | Advanced | Offline queue, AI commands, state sync |
| 9-10 | Polish | Testing, optimization, App Store prep |

---

## Next Steps

1. **Immediate**: Set up React Native project structure
2. **This week**: Implement embedded signaling server
3. **Review**: Security architecture with team
4. **Decision needed**: Self-hosted TURN server vs cloud service

---

## Appendix: Research Sources

### WebRTC & Streaming
- WebRTC Official Samples: https://webrtc.github.io/samples/
- Simple-Peer: https://github.com/feross/simple-peer
- Opus Codec: https://opus-codec.org/

### Security
- OWASP WebRTC Security: https://cheatsheetseries.owasp.org/
- WebRTC Security Study: https://webrtc-security.github.io/

### Mobile Development
- React Native Audio: https://github.com/doublesymmetry/react-native-audio-api
- Whisper.cpp: https://github.com/ggerganov/whisper.cpp

### State Sync
- Yjs Documentation: https://docs.yjs.dev/
- CRDT Guide: https://crdt.tech/
