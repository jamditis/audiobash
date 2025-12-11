/**
 * Audio feedback for recording states
 */

class AudioFeedback {
  private sounds: Map<string, HTMLAudioElement> = new Map();
  private enabled: boolean = true;

  constructor() {
    // Preload sounds
    this.preload('start', './assets/start.mp3');
    this.preload('stop', './assets/stop.mp3');
    this.preload('success', './assets/success.mp3');
    this.preload('error', './assets/error.mp3');
  }

  private preload(name: string, path: string) {
    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.volume = 0.5;
    this.sounds.set(name, audio);
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  public setVolume(volume: number) {
    this.sounds.forEach(audio => {
      audio.volume = Math.max(0, Math.min(1, volume));
    });
  }

  public play(sound: 'start' | 'stop' | 'success' | 'error') {
    if (!this.enabled) return;

    const audio = this.sounds.get(sound);
    if (audio) {
      // Reset to start if already playing
      audio.currentTime = 0;
      audio.play().catch(err => {
        console.warn('[AudioBash] Failed to play sound:', err);
      });
    }
  }

  // Convenience methods
  public playStart() { this.play('start'); }
  public playStop() { this.play('stop'); }
  public playSuccess() { this.play('success'); }
  public playError() { this.play('error'); }
}

// Singleton instance
export const audioFeedback = new AudioFeedback();
