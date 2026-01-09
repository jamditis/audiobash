# Voice Pipeline Test

Test the complete AudioBash voice transcription pipeline including all providers, API key configuration, and agent mode prompts.

## Your Role

You are a QA engineer testing the voice transcription system end-to-end.

## Test Categories

### 1. Transcription Provider Verification

AudioBash supports multiple transcription providers. Verify each is correctly implemented:

**Providers to check:**
- **Gemini 2.0 Flash** - Google's experimental model
- **Gemini 1.5 Flash** - Google's production model
- **Gemini 1.5 Pro** - Google's advanced model
- **OpenAI Whisper** - If implemented
- **Deepgram** - If implemented

**Files to review:**
```bash
# Find transcription service implementation
find src/ -name "*transcription*" -o -name "*voice*"

# Check for provider definitions
grep -rn "gemini-2.0-flash\|gemini-1.5-flash\|whisper\|deepgram" src/ --include="*.ts" --include="*.tsx"
```

**Verify each provider:**
- ✓ Model ID correctly specified
- ✓ API endpoint configured
- ✓ Audio format supported (WebM/Opus)
- ✓ Error handling implemented
- ✓ Cost calculation (if applicable)

### 2. API Key Configuration

Test API key storage and retrieval:

```bash
# Check safeStorage implementation
grep -rn "safeStorage\|getApiKey\|setApiKey" electron/main.cjs -A 5

# Check IPC handlers for API keys
grep -rn "ipcMain.handle.*api.*key" electron/main.cjs -B 2 -A 10
```

**Expected behavior:**

```javascript
// GOOD: Secure storage
const key = await safeStorage.getPassword('gemini-api-key');

// BAD: Plaintext storage
const key = fs.readFileSync('api-key.txt');
```

**Test scenarios:**
1. **First launch** - No API key stored
   - Should prompt user for API key
   - Should validate key format
   - Should store securely in safeStorage

2. **Key already configured**
   - Should load from safeStorage
   - Should not prompt again
   - Should allow updating in settings

3. **Invalid key**
   - Should show error message
   - Should not accept empty keys
   - Should allow retry

**Manual test (if possible):**
```bash
# Start app in dev mode
npm run electron:dev

# Try these flows:
# 1. Open settings, enter API key
# 2. Restart app, verify key persists
# 3. Clear key, verify prompt appears
```

### 3. Audio Recording Pipeline

Verify the audio capture and encoding chain:

**Files to review:**
- `/home/user/audiobash/src/components/VoicePanel.tsx` - Recording UI
- `/home/user/audiobash/src/utils/audioUtils.ts` - Audio utilities (if exists)

```bash
# Find audio-related code
grep -rn "MediaRecorder\|getUserMedia\|AudioContext" src/ --include="*.ts" --include="*.tsx" -B 2 -A 10
```

**Expected flow:**
```
1. User presses Alt+S (or button)
   ↓
2. navigator.mediaDevices.getUserMedia({ audio: true })
   ↓
3. MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
   ↓
4. Start recording
   ↓
5. User releases Alt+S (or button)
   ↓
6. Stop recording
   ↓
7. Collect audio chunks → Blob
   ↓
8. Send to transcription service
   ↓
9. Receive transcribed text
   ↓
10. Send to terminal via IPC
```

**Check for:**
- ✓ Microphone permission requested
- ✓ Recording indicator shown during capture
- ✓ Audio chunks properly collected
- ✓ Blob type is 'audio/webm'
- ✓ MediaRecorder cleanup on component unmount
- ✓ Error handling for no microphone

### 4. Agent Mode Prompts

Test the AI agent prompt generation:

```bash
# Find agent mode implementation
grep -rn "agent.*mode\|generatePrompt\|terminal.*context" src/ --include="*.ts" --include="*.tsx" -B 3 -A 10

# Check for platform-specific prompts
grep -rn "process.platform\|darwin\|win32\|linux" src/ --include="*.ts" --include="*.tsx"
```

**Expected prompts:**

**Raw mode:**
- Transcription sent directly to terminal
- No AI processing

**Agent mode:**
- Transcription + terminal context sent to AI
- AI generates appropriate shell command
- Command sent to terminal

**Example agent prompt structure:**
```
You are a terminal assistant.

Terminal context:
- OS: macOS
- Shell: zsh
- CWD: /Users/joe/audiobash
- Recent output:
  [last 500 chars of terminal output]

User said: "list all JavaScript files"

Generate a single-line shell command to accomplish this task.
Only respond with the command, nothing else.
```

**Platform-specific commands:**

| Task | macOS/Linux | Windows |
|------|-------------|---------|
| List files | `ls -la` | `dir` or `Get-ChildItem` |
| Current dir | `pwd` | `cd` or `pwd` in PowerShell |
| Processes | `ps aux` | `Get-Process` |
| Clear | `clear` | `cls` |

**Verify:**
- ✓ Correct shell detected (zsh/bash on Mac, PowerShell on Windows)
- ✓ CWD retrieved from PTY
- ✓ Recent terminal output included
- ✓ Platform-specific commands suggested

### 5. Error Handling

Test error scenarios:

**No API key:**
```
Expected: Show error message
"Please configure your Gemini API key in Settings"
```

**API error (invalid key):**
```
Expected: Show error with details
"Transcription failed: Invalid API key (401)"
```

**Network error:**
```
Expected: Show error with retry option
"Network error: Could not reach transcription service"
```

**No microphone:**
```
Expected: Show permission prompt
"Microphone access required. Please grant permission."
```

**Empty recording:**
```
Expected: Ignore or show warning
"Recording too short to transcribe"
```

**Verify error handling:**
```bash
# Search for error handling patterns
grep -rn "catch\|\.catch\|try.*catch" src/ --include="*.ts" --include="*.tsx" -A 3

# Check for user-facing error messages
grep -rn "error\|Error\|failed\|Failed" src/ --include="*.tsx" -B 2 -A 2
```

### 6. Performance Testing

**Test metrics:**
- Recording latency (press → start): Should be < 100ms
- Transcription time: Depends on audio length and provider
  - Gemini 2.0 Flash: Usually < 1 second for 5-second audio
  - Gemini 1.5 Flash: 1-2 seconds
- End-to-end latency: Press → transcribed text in terminal
  - Target: < 2 seconds for short commands

**Check for:**
```bash
# Look for performance optimizations
grep -rn "debounce\|throttle\|setTimeout\|requestAnimationFrame" src/ --include="*.ts" --include="*.tsx"

# Check for large audio file warnings
grep -rn "size\|length.*audio\|duration" src/ --include="*.ts" --include="*.tsx"
```

### 7. Integration Test

**Manual end-to-end test (if possible):**

```bash
# Start app in dev mode
npm run electron:dev

# Test flow:
# 1. Open Settings
# 2. Enter Gemini API key
# 3. Select "Gemini 2.0 Flash"
# 4. Select "Agent Mode"
# 5. Press Alt+S
# 6. Say "list all TypeScript files"
# 7. Release Alt+S
# 8. Verify:
#    - Recording indicator appears/disappears
#    - Transcription appears in terminal
#    - Command executes correctly
```

## Report Format

Provide test results in this format:

```
## Voice Pipeline Test Report

### Transcription Providers
✓ Gemini 2.0 Flash - Implemented
✓ Gemini 1.5 Flash - Implemented
✓ Gemini 1.5 Pro - Implemented
✗ OpenAI Whisper - Not yet implemented
✗ Deepgram - Not yet implemented

### API Key Management
✓ Secure storage using safeStorage
✓ IPC handlers implemented
✓ Settings UI for key configuration
✓ Key validation on input
⚠️ No key rotation mechanism (consider for future)

### Audio Recording
✓ MediaRecorder initialized correctly
✓ WebM/Opus format configured
✓ Recording indicator implemented
✓ Cleanup on component unmount
⚠️ No audio level meter (nice-to-have)

### Agent Mode
✓ Terminal context collection implemented
✓ Platform-specific shell detection (zsh/bash/PowerShell)
✓ Prompt generation includes CWD and recent output
✓ Commands appropriate for detected platform
✓ Raw mode bypass available

### Error Handling
✓ No API key: Clear error message
✓ Invalid API key: Shows 401 error
✓ Network error: Retry logic implemented
⚠️ No microphone: Could improve permission UI

### Performance
- Recording latency: ~50ms ✓
- Transcription (5s audio): ~800ms ✓
- End-to-end: ~1.2s ✓

### Integration Test
✓ End-to-end flow works correctly
✓ Transcription accurate
✓ Commands execute in terminal
✓ No memory leaks detected

### Recommendations
1. Add OpenAI Whisper as alternative provider
2. Implement audio level meter for better UX
3. Add microphone permission check on startup
4. Consider adding voice command history

### Test Status: PASSED ✓
Voice pipeline is production-ready.
```

## Now Execute

Perform the complete voice pipeline test following all categories above and provide the detailed report.
