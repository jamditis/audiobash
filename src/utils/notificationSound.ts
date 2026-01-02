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
// These patterns are designed to match ACTUAL prompts, not just mentions in text
// Key insight: Real prompts appear at the END of output and have specific formats
const CLI_INPUT_PATTERNS = [
  // Claude Code specific prompts - these have very specific formats
  // The [Y/n] or (y/n) at the END is the key indicator of an actual prompt
  /\[Y\/n\]\s*$/i,  // Prompt ending with [Y/n]
  /\[y\/N\]\s*$/i,  // Prompt ending with [y/N]
  /\(y\/n\)\s*$/i,  // Prompt ending with (y/n)
  /\(yes\/no\)\s*$/i,  // Prompt ending with (yes/no)

  // Claude Code tool permission prompts - very specific format
  /Allow .+\? \[Y\/n\]/i,
  /Do you want to proceed\? \[Y\/n\]/i,

  // Generic prompts that END with clear input indicators
  /Press Enter to continue\.?\s*$/i,
  /Press any key to continue\.?\s*$/i,
  /Press any key\.?\s*$/i,

  // npm/yarn prompts - specific format
  /Ok to proceed\? \(y\/n\)\s*$/i,
  /Is this OK\? \(yes\/no\)\s*$/i,
  /Is this OK\?\s*$/i,

  // Git prompts with actual y/n indicator
  /\(y\/n\)\?\s*$/i,
];

// Buffer to accumulate terminal output for pattern matching
let outputBuffer = '';
const BUFFER_MAX_LENGTH = 2000;
const BUFFER_CLEAR_DELAY = 5000;
// Only check the tail of output where prompts actually appear
const PROMPT_CHECK_LENGTH = 500;
let bufferClearTimeout: ReturnType<typeof setTimeout> | null = null;

// Strip ANSI escape codes for cleaner pattern matching
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

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

  // Only check the END of the buffer where prompts appear
  // This prevents matching mentions in the middle of explanatory text
  const tail = outputBuffer.slice(-PROMPT_CHECK_LENGTH);
  const cleanTail = stripAnsi(tail);

  // Check for patterns
  const hasPrompt = CLI_INPUT_PATTERNS.some(pattern => pattern.test(cleanTail));

  // If we found a prompt, clear the buffer to prevent re-triggering
  // on the same prompt when more output arrives
  if (hasPrompt) {
    outputBuffer = '';
    if (bufferClearTimeout) {
      clearTimeout(bufferClearTimeout);
      bufferClearTimeout = null;
    }
  }

  return hasPrompt;
}

// Reset the output buffer (call when switching terminals, etc.)
export function resetOutputBuffer(): void {
  outputBuffer = '';
  if (bufferClearTimeout) {
    clearTimeout(bufferClearTimeout);
    bufferClearTimeout = null;
  }
}
