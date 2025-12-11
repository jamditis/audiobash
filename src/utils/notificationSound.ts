// Audio notification utilities using Web Audio API
// Generates distinctive sounds for CLI input requests

let audioContext: AudioContext | null = null;
let lastPlayTime = 0;
const MIN_INTERVAL = 3000; // Minimum 3 seconds between notification sounds

// Initialize audio context (must be called after user interaction)
function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// Play a two-tone notification sound (like a gentle chime)
export function playNotificationSound(): void {
  const now = Date.now();
  if (now - lastPlayTime < MIN_INTERVAL) {
    return; // Rate limit to avoid spam
  }
  lastPlayTime = now;

  try {
    const ctx = getAudioContext();

    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const currentTime = ctx.currentTime;

    // Create two oscillators for a pleasant two-tone chime
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    // First tone: higher frequency
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, currentTime); // A5

    // Second tone: slightly lower, delayed
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(660, currentTime); // E5

    // Volume envelope for first tone
    gain1.gain.setValueAtTime(0, currentTime);
    gain1.gain.linearRampToValueAtTime(0.15, currentTime + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.3);

    // Volume envelope for second tone (delayed)
    gain2.gain.setValueAtTime(0, currentTime);
    gain2.gain.setValueAtTime(0, currentTime + 0.1);
    gain2.gain.linearRampToValueAtTime(0.12, currentTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.4);

    // Connect and start
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(currentTime);
    osc1.stop(currentTime + 0.3);
    osc2.start(currentTime + 0.1);
    osc2.stop(currentTime + 0.4);
  } catch (err) {
    console.warn('[AudioBash] Failed to play notification sound:', err);
  }
}

// Patterns that indicate CLI tools are waiting for input/approval
// These patterns match common CLI tool prompts
const CLI_INPUT_PATTERNS = [
  // Claude Code patterns
  /Do you want to proceed\?/i,
  /Allow .+ to .+\?/i,
  /\[Y\/n\]/i,
  /\[y\/N\]/i,
  /Press Enter to continue/i,
  /Waiting for .+ approval/i,
  /approve|reject|confirm/i,
  // Generic y/n prompts
  /\(y\/n\)/i,
  /\(yes\/no\)/i,
  // Generic input prompts
  /Enter .+ to continue/i,
  /Press any key/i,
  // Git prompts
  /Are you sure you want to/i,
  // npm/yarn prompts
  /Ok to proceed\?/i,
  /Is this OK\?/i,
];

// Buffer to accumulate terminal output for pattern matching
let outputBuffer = '';
const BUFFER_MAX_LENGTH = 2000;
const BUFFER_CLEAR_DELAY = 5000;
let bufferClearTimeout: ReturnType<typeof setTimeout> | null = null;

// Check if terminal output contains a CLI input prompt
export function checkForCliInputPrompt(data: string): boolean {
  // Append to buffer
  outputBuffer += data;
  if (outputBuffer.length > BUFFER_MAX_LENGTH) {
    outputBuffer = outputBuffer.slice(-BUFFER_MAX_LENGTH);
  }

  // Reset clear timeout
  if (bufferClearTimeout) {
    clearTimeout(bufferClearTimeout);
  }
  bufferClearTimeout = setTimeout(() => {
    outputBuffer = '';
  }, BUFFER_CLEAR_DELAY);

  // Check for patterns
  return CLI_INPUT_PATTERNS.some(pattern => pattern.test(outputBuffer));
}

// Reset the output buffer (call when switching terminals, etc.)
export function resetOutputBuffer(): void {
  outputBuffer = '';
  if (bufferClearTimeout) {
    clearTimeout(bufferClearTimeout);
    bufferClearTimeout = null;
  }
}
