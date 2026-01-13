# Permissions Overreach Prevention

A skill for identifying and avoiding unnecessary permission requests, data access, and privilege escalation in AudioBash.

## Core Principle: Least Privilege

Request only the minimum permissions, data, and access needed for the specific task at hand. When in doubt, use the less intrusive approach.

## Common Overreach Patterns to Avoid

### 1. Fetching All Data When Only Some Is Needed

```typescript
// ❌ WRONG - Fetches all API keys when only checking one provider
const geminiKey = await window.electron?.getApiKey('gemini');
const openaiKey = await window.electron?.getApiKey('openai');
const anthropicKey = await window.electron?.getApiKey('anthropic');
const elevenlabsKey = await window.electron?.getApiKey('elevenlabs');
const hasKey = provider === 'gemini' ? !!geminiKey : /* ... */;

// ✅ CORRECT - Only fetch what's needed for the specific provider
switch (provider) {
  case 'gemini':
    return !!(await window.electron?.getApiKey('gemini'));
  case 'openai':
    return !!(await window.electron?.getApiKey('openai'));
  // ...
}
```

### 2. Broad Event Listeners

```typescript
// ❌ WRONG - Listens to all storage events and processes everything
window.addEventListener('storage', () => {
  reloadAllSettings();
  refetchAllApiKeys();
  reinitializeAllServices();
});

// ✅ CORRECT - Check what changed, only act on relevant changes
window.addEventListener('storage', (e) => {
  if (e.key === 'audiobash-model') {
    updateModelSelection(e.newValue);
  }
});
```

### 3. Excessive IPC Calls

```typescript
// ❌ WRONG - Multiple round trips when one would suffice
const cwd = await window.electron?.getCwd(tabId);
const shell = await window.electron?.getShell(tabId);
const os = await window.electron?.getOs(tabId);

// ✅ CORRECT - Single IPC call returns necessary context
const context = await window.electron?.getTerminalContext(tabId);
// context contains { cwd, shell, os }
```

### 4. Requesting Permissions Before Needed

```typescript
// ❌ WRONG - Request microphone on app startup
useEffect(() => {
  navigator.mediaDevices.getUserMedia({ audio: true });
}, []);

// ✅ CORRECT - Request only when user initiates recording
const startRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // ...
};
```

### 5. Storing Sensitive Data in Renderer

```typescript
// ❌ WRONG - Cache decrypted API keys in renderer state
const [apiKeys, setApiKeys] = useState({
  gemini: 'sk-...',
  openai: 'sk-...',
});

// ✅ CORRECT - Keep keys in main process, only check existence
const [hasGeminiKey, setHasGeminiKey] = useState(false);
// Keys stay encrypted in main process via safeStorage
```

## Decision Framework

When implementing a feature that needs data or permissions, ask:

1. **Do I need this data/permission at all?**
   - Can the feature work without it?
   - Is there an alternative approach?

2. **Do I need it now, or can I defer?**
   - Request permissions at point of use, not at startup
   - Lazy-load sensitive data

3. **Do I need all of it, or just a subset?**
   - Fetch specific fields, not entire objects
   - Query specific keys, not all keys

4. **How long do I need to hold it?**
   - Release resources as soon as possible
   - Clear sensitive data from memory after use

5. **Where should it live?**
   - Main process for sensitive data (encrypted storage)
   - Renderer only for UI state

## IPC Channel Audit Checklist

When adding or modifying IPC channels:

- [ ] Does the channel expose more data than the caller needs?
- [ ] Could a malicious renderer abuse this channel?
- [ ] Is there input validation on the main process side?
- [ ] Are responses sanitized before sending to renderer?
- [ ] Is the channel documented with its security implications?

## Audio/Media Permissions

Special considerations for AudioBash's voice features:

- **Microphone access**: Request only when recording starts, release tracks when done
- **Audio context**: Close when not in use to free system resources
- **Media streams**: Always call `track.stop()` on all tracks when finished

```typescript
// ✅ CORRECT - Clean up audio resources
const stopRecording = () => {
  if (streamRef.current) {
    streamRef.current.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }
  if (audioContextRef.current) {
    audioContextRef.current.close();
    audioContextRef.current = null;
  }
};
```

## File System Access

- Never access files outside the app's data directory without explicit user action
- Use Electron's `dialog` API for user-initiated file selection
- Validate and sanitize all file paths

## Network Requests

- Only call APIs that are necessary for the current operation
- Don't send telemetry or analytics without user consent
- Validate URLs before fetching
- Use HTTPS exclusively

## Review Triggers

Flag for security review when code:

- Adds new IPC channels
- Requests new permissions (microphone, file system, etc.)
- Stores new types of sensitive data
- Adds new external API integrations
- Changes authentication/authorization logic
