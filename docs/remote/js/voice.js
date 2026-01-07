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
    this.onSilenceProgress = null; // Callback for silence countdown
    this.recordingStartTime = null;
    this.minRecordingDuration = 500; // Minimum 500ms to avoid empty recordings

    // VAD (Voice Activity Detection) settings
    this.vadEnabled = true; // Can be disabled via settings
    this.silenceThreshold = 1500; // 1.5 seconds of silence before auto-stop
    this.volumeThreshold = -50; // dB threshold for silence detection
    this.audioContext = null;
    this.analyser = null;
    this.vadCheckInterval = null;
    this.lastSoundTime = null;
    this.silenceStartTime = null;
  }

  /**
   * Detect iOS devices
   */
  static isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  /**
   * Check if recording is supported
   */
  static isSupported() {
    // Check for secure context (HTTPS or localhost)
    const isSecureContext = window.isSecureContext ||
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '[::1]';

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
   * Enable or disable VAD auto-stop
   * @param {boolean} enabled
   */
  setVADEnabled(enabled) {
    this.vadEnabled = enabled;
  }

  /**
   * Set silence threshold in milliseconds
   * @param {number} ms
   */
  setSilenceThreshold(ms) {
    this.silenceThreshold = ms;
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
          sampleRate: { ideal: 48000 },
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

      // Try to create MediaRecorder with mimeType, fall back to default if it fails
      try {
        this.mediaRecorder = new MediaRecorder(this.stream, {
          mimeType,
          audioBitsPerSecond: 128000,
        });
      } catch (err) {
        console.warn('[Voice] Failed to create MediaRecorder with mimeType, trying without:', err);
        // iOS Safari < 15 fallback - create without mimeType
        this.mediaRecorder = new MediaRecorder(this.stream, {
          audioBitsPerSecond: 128000,
        });
        console.log('[Voice] Using default codec (iOS fallback)');
      }

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

      // Initialize VAD if enabled
      if (this.vadEnabled) {
        this.startVAD(this.stream);
      }

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
    // Prioritize codecs based on platform
    const types = VoiceRecorder.isIOS()
      ? [
          'audio/mp4',
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
        ]
      : [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/mp4',
        ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log(`[Voice] Using codec: ${type}`);
        return type;
      }
    }

    return '';
  }

  /**
   * Start Voice Activity Detection
   * @param {MediaStream} stream
   */
  startVAD(stream) {
    try {
      // Create AudioContext for analysis
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(stream);

      // Create analyser node
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);

      // Initialize timing
      this.lastSoundTime = Date.now();
      this.silenceStartTime = null;

      // Check audio level periodically
      this.vadCheckInterval = setInterval(() => {
        this.checkAudioLevel();
      }, 100); // Check every 100ms

      console.log('[Voice] VAD started');
    } catch (err) {
      console.warn('[Voice] VAD initialization failed, continuing without auto-stop:', err);
      // Continue recording without VAD if it fails
    }
  }

  /**
   * Check current audio level and detect silence
   */
  checkAudioLevel() {
    if (!this.analyser || !this.isRecording) return;

    // Get frequency data
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    // Calculate average volume
    const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;

    // Convert to dB (approximate)
    const dB = 20 * Math.log10(average / 255);

    const now = Date.now();
    const isSilent = dB < this.volumeThreshold;

    if (isSilent) {
      // Silence detected
      if (this.silenceStartTime === null) {
        this.silenceStartTime = now;
        console.log('[Voice] Silence detected');
      }

      const silenceDuration = now - this.silenceStartTime;

      // Notify progress (for countdown UI)
      if (this.onSilenceProgress) {
        const progress = Math.min(silenceDuration / this.silenceThreshold, 1);
        this.onSilenceProgress(progress, silenceDuration);
      }

      // Auto-stop if silence threshold exceeded
      if (silenceDuration >= this.silenceThreshold) {
        console.log('[Voice] Auto-stopping due to silence');
        this.stopRecording();
      }
    } else {
      // Sound detected - reset silence timer
      if (this.silenceStartTime !== null) {
        console.log('[Voice] Sound resumed');
      }
      this.lastSoundTime = now;
      this.silenceStartTime = null;

      // Notify that silence was broken
      if (this.onSilenceProgress) {
        this.onSilenceProgress(0, 0);
      }
    }
  }

  /**
   * Stop VAD monitoring
   */
  stopVAD() {
    if (this.vadCheckInterval) {
      clearInterval(this.vadCheckInterval);
      this.vadCheckInterval = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.lastSoundTime = null;
    this.silenceStartTime = null;

    // Clear silence progress
    if (this.onSilenceProgress) {
      this.onSilenceProgress(0, 0);
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    this.stopVAD();

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
