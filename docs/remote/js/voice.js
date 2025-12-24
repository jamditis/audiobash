/**
 * Voice recorder for mobile
 * Captures audio and streams to desktop for transcription
 */

export class VoiceRecorder {
  constructor(wsManager) {
    this.wsManager = wsManager;
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.isRecording = false;
    this.mode = 'agent';
    this.activeTabId = null;
    this.onStateChange = null; // Callback for UI updates
  }

  /**
   * Check if recording is supported
   */
  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Request microphone permission
   */
  async requestPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      console.error('[Voice] Permission denied:', err);
      return false;
    }
  }

  /**
   * Set the transcription mode
   * @param {'agent' | 'raw'} mode
   */
  setMode(mode) {
    this.mode = mode;
  }

  /**
   * Start recording
   * @param {string} tabId - Target terminal tab
   */
  async startRecording(tabId) {
    if (this.isRecording) return;

    this.activeTabId = tabId;
    this.chunks = [];

    try {
      // Get audio stream
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
        },
      });

      // Notify server that recording started
      this.wsManager.send({
        type: 'audio_start',
        tabId: tabId,
        mode: this.mode,
        format: 'webm',
        sampleRate: 48000,
      });

      // Create media recorder
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType,
        audioBitsPerSecond: 128000,
      });

      // Stream chunks as they're recorded
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.chunks.push(e.data);
          // Send chunk to server
          this.wsManager.sendBinary(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        // Notify server that recording ended
        this.wsManager.send({
          type: 'audio_end',
          tabId: this.activeTabId,
        });
        this.cleanup();
      };

      this.mediaRecorder.onerror = (err) => {
        console.error('[Voice] MediaRecorder error:', err);
        this.stopRecording();
      };

      // Start recording with 250ms timeslices for streaming
      this.mediaRecorder.start(250);
      this.isRecording = true;

      this.notifyStateChange('recording');
      console.log('[Voice] Recording started');

    } catch (err) {
      console.error('[Voice] Failed to start recording:', err);
      this.cleanup();
      throw err;
    }
  }

  /**
   * Stop recording
   */
  stopRecording() {
    if (!this.isRecording) return;

    this.isRecording = false;
    this.notifyStateChange('processing');

    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    } else {
      this.cleanup();
    }

    console.log('[Voice] Recording stopped');
  }

  /**
   * Cancel recording without sending
   */
  cancelRecording() {
    if (!this.isRecording) return;

    this.isRecording = false;
    this.cleanup();
    this.notifyStateChange('idle');

    console.log('[Voice] Recording cancelled');
  }

  /**
   * Get supported MIME type
   */
  getSupportedMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return '';
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
  }

  /**
   * Notify state change callback
   */
  notifyStateChange(state) {
    if (this.onStateChange) {
      this.onStateChange(state);
    }
  }
}
