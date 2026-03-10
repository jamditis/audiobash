// Strip ANSI escape codes for clean pattern matching
// Duplicated here to avoid coupling to notificationSound (which is globally mocked in tests)
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B(?:[@-Z\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

export interface VoiceModeState {
  active: boolean;
  terminalId: string;
}

type StateChangeCallback = (state: VoiceModeState) => void;

// Patterns indicating Claude Code /voice mode is active
const VOICE_ACTIVATE_PATTERNS: RegExp[] = [
  /entering voice mode/i,
  /voice mode activated/i,
  /listening.*microphone/i,
  /\/voice.*started/i,
  /voice mode.*enabled/i,
];

const VOICE_DEACTIVATE_PATTERNS: RegExp[] = [
  /exiting voice mode/i,
  /voice mode deactivated/i,
  /voice mode.*disabled/i,
  /\/voice.*stopped/i,
  /stopped listening/i,
];

export class VoiceModeDetector {
  private activeTerminals = new Set<string>();
  private callbacks: StateChangeCallback[] = [];

  onStateChange(callback: StateChangeCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
    };
  }

  processOutput(terminalId: string, data: string): void {
    const clean = stripAnsi(data);

    if (VOICE_ACTIVATE_PATTERNS.some(p => p.test(clean))) {
      if (!this.activeTerminals.has(terminalId)) {
        this.activeTerminals.add(terminalId);
        this.emit({ active: true, terminalId });
      }
    }

    if (VOICE_DEACTIVATE_PATTERNS.some(p => p.test(clean))) {
      if (this.activeTerminals.has(terminalId)) {
        this.activeTerminals.delete(terminalId);
        this.emit({ active: false, terminalId });
      }
    }
  }

  isVoiceActive(terminalId: string): boolean {
    return this.activeTerminals.has(terminalId);
  }

  getActiveTerminals(): string[] {
    return Array.from(this.activeTerminals);
  }

  private emit(state: VoiceModeState): void {
    this.callbacks.forEach(cb => cb(state));
  }
}
