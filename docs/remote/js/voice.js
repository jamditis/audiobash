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
    this.onError = null; // Callback for error handling
    this.recordingStartTime = null;
    this.minRecordingDuration = 500; // Minimum 500ms to avoid empty recordings
  }

  /**
   * Check if recording is supported
   */
  static isSupported() {
    // Check for secure context (HTTPS or localhost)
    const isSecureContext = window.isSecureContext ||
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (!isSecureContext) {
      console.warn('[Voice] Not in secure context - microphone access requires HTTPS');
      return false;
    }

    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }

  /**
   * Get detailed support info for debugging
   */
  static getSupportInfo() {
    return {
      isSecureContext: window.isSecureContext,
      protocol: window.location.protocol,
      hasMediaDevices: !!navigator.mediaDevices,
      hasGetUserMedia: !!(navigator.mediaDevices?.getUserMedia),
      hasMediaRecorder: !!window.MediaRecorder,
      supportedMimeTypes: VoiceRecorder.getSupportedMimeTypes(),
    };
  }

  /**
   * Get list of supported MIME types
   */
  static getSupportedMimeTypes() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    return types.filter(type => MediaRecorder.isTypeSupported?.(type));
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
    this.recordingStartTime = Date.now();

    try {
      // Get audio stream with error handling for specific permission issues
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
        },
      });

      // Check if WebSocket is connected before starting
      if (!this.wsManager.isConnected) {
        this.cleanup();
        throw new Error('Not connected to desktop. Please reconnect.');
      }

      // Notify server that recording started
      this.wsManager.send({
        type: 'audio_start',
        tabId: tabId,
        mode: this.mode,
        format: 'webm',
        sampleRate: 48000,
      });

      // Create media recorder with best available codec
      const mimeType = this.getSupportedMimeType();
      if (!mimeType) {
        this.cleanup();
        throw new Error('No supported audio codec found. Try a different browser.');
      }

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
        const recordingDuration = Date.now() - this.recordingStartTime;

        // Check if recording was too short
        if (recordingDuration < this.minRecordingDuration || this.chunks.length === 0) {
          console.warn('[Voice] Recording too short, discarding');
          this.notifyError('Recording too short. Hold the button longer.');
          this.cleanup();
          this.notifyStateChange('idle');
          return;
        }

        // Notify server that recording ended
        this.wsManager.send({
          type: 'audio_end',
          tabId: this.activeTabId,
        });
        this.cleanup();
      };

      this.mediaRecorder.onerror = (event) => {
        console.error('[Voice] MediaRecorder error:', event.error);
        this.notifyError(`Recording error: ${event.error?.message || 'Unknown error'}`);
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

      // Provide user-friendly error messages
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        throw new Error('Microphone access denied. Please allow microphone access in your browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        throw new Error('No microphone found. Please connect a microphone and try again.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        throw new Error('Microphone is in use by another app. Please close other apps using the microphone.');
      } else if (err.name === 'OverconstrainedError') {
        throw new Error('Microphone does not support the required settings. Try a different device.');
      } else {
        throw err;
      }
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

  /**
   * Notify error callback
   */
  notifyError(message) {
    if (this.onError) {
      this.onError(message);
    }
  }
}
