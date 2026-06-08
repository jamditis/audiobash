// Audio notification utilities for CLI input requests
// Uses Web Audio API with oscillator fallback

let audioContext: AudioContext | null = null;
let lastPlayTime = 0;
const MIN_INTERVAL = 3000; // Minimum 3 seconds between notification sounds

// Check whether debug logging is enabled via localStorage
function isDebugEnabled(): boolean {
  try {
    return localStorage.getItem('audiobash-debug-notifications') === 'true';
  } catch {
    return false;
  }
}

// Initialize audio context (must be called after user interaction)
function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

// Pre-warm the AudioContext so chimes can fire immediately.
// Chromium suspends AudioContexts created before a user gesture,
// so call this once from a click or keydown handler.
export async function preWarmAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}

// Play a two-tone notification chime via Web Audio API
async function playChimeViaWebAudio(): Promise<void> {
  const ctx = getAudioContext();

  // Await resume so oscillators schedule against a running clock
  if (ctx.state === 'suspended') {
    await ctx.resume();
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
}

// Fallback: play a simple single-tone oscillator (no file dependency)
function playFallbackChime(): void {
  try {
    const ctx = getAudioContext();
    const currentTime = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, currentTime); // E5

    gain.gain.setValueAtTime(0, currentTime);
    gain.gain.linearRampToValueAtTime(0.15, currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, currentTime + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(currentTime);
    osc.stop(currentTime + 0.2);
  } catch {
    // Both Web Audio paths failed — nothing more we can do
  }
}

// Play a two-tone notification sound (like a gentle chime)
export function playNotificationSound(): void {
  const now = Date.now();
  if (now - lastPlayTime < MIN_INTERVAL) {
    if (isDebugEnabled()) {
      console.log('[Notification] Skipped - rate limited');
    }
    return; // Rate limit to avoid spam
  }
  lastPlayTime = now;

  console.log('[AudioBash] Playing notification sound');

  playChimeViaWebAudio().catch(() => {
    // Web Audio two-tone failed — fall back to single-tone oscillator
    playFallbackChime();
  });
}

// Patterns that indicate CLI tools are waiting for input/approval
// These patterns are designed to match ACTUAL prompts, not just mentions in text
// Key insight: Real prompts appear near the END of output (last ~300 chars)
// We use looser anchoring because terminal output arrives in chunks and may have
// trailing whitespace, ANSI codes, or partial data after the prompt
export const CLI_INPUT_PATTERNS: RegExp[] = [
  // === Yes/No bracket and paren prompts ===
  /\[Y\/n\]\s*$/im, // [Y/n] at end of line
  /\[y\/N\]\s*$/im, // [y/N] at end of line
  /\(y\/n\)\s*$/im, // (y/n) at end of line
  /\(yes\/no\)\s*$/im, // (yes/no) at end of line
  /\[Y\/n\]/i, // [Y/n] anywhere in tail
  /\[y\/N\]/i, // [y/N] anywhere in tail

  // === Claude Code permission prompts ===
  /Allow .+\? \[Y\/n\]/i,
  /Do you want to proceed\?\s/i,
  /Proceed\?\s/i,
  /Continue\?\s/i,
  /Allow tool/i,
  /Allow once/i,
  /Approve\?/i,

  // === Claude Code TUI selection menus ===
  // Modern Claude Code renders selection prompts with arrow-key navigation
  /Use arrow keys/i,
  /❯\s*(Yes|Allow|Approve)/i, // Inquirer-style selected option
  />\s*(Yes|Allow|Approve)/i, // ASCII arrow selection

  // === Codex CLI prompts ===
  /\(a\)pprove/i, // Codex uses (a)pprove, (d)eny, (e)dit
  /approve, deny/i,

  // === Gemini CLI prompts ===
  /Do you want to run/i,
  /Execute this/i,

  // === Generic prompts ===
  /Press Enter to continue/i,
  /Press any key to continue/i,
  /Press any key/i,
  /\? \[Y\/n\]/, // Any question ending in [Y/n]
  /\? \(y\/n\)/i, // Any question ending in (y/n)
  /\? \(Y\)/i, // Single-letter accept prompt

  // === npm/yarn prompts ===
  /Ok to proceed\? \(y\/n\)/i,
  /Ok to proceed\?/i,
  /Is this OK\? \(yes\/no\)/i,
  /Is this OK\?/i,

  // === Git prompts ===
  /\(y\/n\)\?/i,

  // === sudo / system prompts ===
  /\[sudo\] password/i,
  /Password:/i,
];

// Per-terminal buffers to avoid cross-tab interference
const terminalBuffers = new Map<string, string>();
const terminalTimers = new Map<string, ReturnType<typeof setTimeout>>();

const BUFFER_MAX_LENGTH = 2000;
const BUFFER_CLEAR_DELAY = 5000;
// Check a reasonable tail window - prompts appear at the end
// but we need enough context to catch multi-line prompts
const PROMPT_CHECK_LENGTH = 500;

// Strip ANSI escape codes for cleaner pattern matching
export function stripAnsi(str: string): string {
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

// Check if terminal output contains a CLI input prompt
export function checkForCliInputPrompt(data: string, tabId = '_default'): boolean {
  // Get or create buffer for this terminal
  let buffer = terminalBuffers.get(tabId) || '';

  // Append to buffer
  buffer += data;
  if (buffer.length > BUFFER_MAX_LENGTH) {
    buffer = buffer.slice(-BUFFER_MAX_LENGTH);
  }
  terminalBuffers.set(tabId, buffer);

  // Reset clear timeout for this terminal
  const existingTimer = terminalTimers.get(tabId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  terminalTimers.set(
    tabId,
    setTimeout(() => {
      terminalBuffers.set(tabId, '');
    }, BUFFER_CLEAR_DELAY),
  );

  // Only check the END of the buffer where prompts appear
  // This prevents matching mentions in the middle of explanatory text
  const tail = buffer.slice(-PROMPT_CHECK_LENGTH);
  const cleanTail = stripAnsi(tail);

  // Check for patterns
  const hasPrompt = CLI_INPUT_PATTERNS.some((pattern) => pattern.test(cleanTail));

  if (isDebugEnabled()) {
    // Show what we're checking (last 100 chars for readability)
    const preview = cleanTail.slice(-100).replace(/\n/g, '\\n');
    console.log(
      `[Notification] [${tabId}] Checking: "${preview}" -> ${hasPrompt ? 'MATCH!' : 'no match'}`,
    );
  }

  // If we found a prompt, clear the buffer to prevent re-triggering
  // on the same prompt when more output arrives
  if (hasPrompt) {
    terminalBuffers.set(tabId, '');
    const timer = terminalTimers.get(tabId);
    if (timer) {
      clearTimeout(timer);
      terminalTimers.delete(tabId);
    }
  }

  return hasPrompt;
}

// Reset the output buffer for a specific terminal (call when switching terminals, etc.)
export function resetOutputBuffer(tabId = '_default'): void {
  terminalBuffers.set(tabId, '');
  const timer = terminalTimers.get(tabId);
  if (timer) {
    clearTimeout(timer);
    terminalTimers.delete(tabId);
  }
}
