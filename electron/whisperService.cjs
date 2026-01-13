/**
 * Local Whisper transcription service using @remotion/install-whisper-cpp
 * Provides offline speech-to-text without cloud APIs
 *
 * This service handles:
 * - Installing whisper.cpp binary (cross-platform)
 * - Downloading Whisper models
 * - Transcribing audio files
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const { app } = require('electron');
const { spawn } = require('child_process');

// Model configurations
const MODEL_CONFIGS = {
  'tiny.en': {
    size: '75 MB',
    speed: 'Fastest',
    accuracy: 'Good',
    description: 'Fastest model, good for most use cases'
  },
  'base.en': {
    size: '142 MB',
    speed: 'Fast',
    accuracy: 'Better',
    description: 'Balanced speed and accuracy (default)'
  },
  'small.en': {
    size: '466 MB',
    speed: 'Medium',
    accuracy: 'Best',
    description: 'Slower but more accurate'
  },
};

// Whisper.cpp version to use
const WHISPER_CPP_VERSION = '1.5.5';

/**
 * Convert audio file to 16kHz WAV format required by whisper.cpp
 * @param {string} inputPath - Path to input audio file (WebM, MP3, etc.)
 * @param {string} outputPath - Path for output WAV file
 * @returns {Promise<void>}
 */
async function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    // Use ffmpeg to convert to 16kHz mono WAV
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ar', '16000',    // 16kHz sample rate (required by whisper.cpp)
      '-ac', '1',        // Mono audio
      '-c:a', 'pcm_s16le', // 16-bit PCM
      '-y',              // Overwrite output file
      outputPath
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stderr = '';
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('[WhisperService] Audio converted to WAV successfully');
        resolve();
      } else {
        console.error('[WhisperService] FFmpeg conversion failed:', stderr);
        reject(new Error(`FFmpeg conversion failed with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    ffmpeg.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('FFmpeg not found. Please install FFmpeg and add it to your PATH.'));
      } else {
        reject(err);
      }
    });
  });
}

class WhisperService {
  constructor() {
    // Store whisper.cpp and models in app's userData directory
    this.whisperDir = null; // Set after app is ready
    this.currentModel = 'base.en';
    this.whisperInstalled = false;
    this.installPromise = null;
  }

  /**
   * Initialize the service (call after app is ready)
   */
  async initialize() {
    // Use userData for persistent storage
    const userDataPath = app.getPath('userData');
    this.whisperDir = path.join(userDataPath, 'whisper-cpp');

    // NOTE: Don't create the directory here - let the remotion package handle it
    // Creating an empty folder causes the package to error out

    // Check if whisper.cpp is already installed
    this.whisperInstalled = this.isWhisperInstalled();
    console.log('[WhisperService] Whisper.cpp installed:', this.whisperInstalled);
  }

  /**
   * Check if whisper.cpp binary is installed
   */
  isWhisperInstalled() {
    const binaryName = process.platform === 'win32' ? 'main.exe' : 'main';
    const binaryPath = path.join(this.whisperDir, WHISPER_CPP_VERSION, binaryName);
    return fs.existsSync(binaryPath);
  }

  /**
   * Install whisper.cpp binary
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async installWhisperCpp() {
    if (this.installPromise) {
      return this.installPromise;
    }

    this.installPromise = (async () => {
      try {
        console.log('[WhisperService] Installing whisper.cpp...');

        // Check if folder exists but executable is missing - clean up stale install
        // IMPORTANT: Don't recreate the folder - let the remotion package create it
        if (fs.existsSync(this.whisperDir) && !this.isWhisperInstalled()) {
          console.log('[WhisperService] Cleaning up incomplete installation...');
          fs.rmSync(this.whisperDir, { recursive: true, force: true });
        }

        // Dynamic import for ESM module
        const { installWhisperCpp } = await import('@remotion/install-whisper-cpp');

        await installWhisperCpp({
          to: this.whisperDir,
          version: WHISPER_CPP_VERSION,
        });

        this.whisperInstalled = true;
        console.log('[WhisperService] Whisper.cpp installed successfully');
        return { success: true };
      } catch (error) {
        console.error('[WhisperService] Install error:', error);
        return { success: false, error: error.message };
      } finally {
        this.installPromise = null;
      }
    })();

    return this.installPromise;
  }

  /**
   * Download a Whisper model
   * @param {string} modelName - Model name (e.g., 'base.en')
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async downloadModel(modelName) {
    if (!MODEL_CONFIGS[modelName]) {
      return { success: false, error: `Unknown model: ${modelName}` };
    }

    try {
      console.log(`[WhisperService] Downloading model: ${modelName}`);

      // Dynamic import for ESM module
      const { downloadWhisperModel } = await import('@remotion/install-whisper-cpp');

      await downloadWhisperModel({
        model: modelName,
        folder: this.whisperDir,
      });

      console.log(`[WhisperService] Model downloaded: ${modelName}`);
      return { success: true };
    } catch (error) {
      console.error('[WhisperService] Download error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if a model is downloaded
   * @param {string} modelName - Model name
   * @returns {boolean}
   */
  isModelDownloaded(modelName) {
    const modelPath = path.join(this.whisperDir, `ggml-${modelName}.bin`);
    return fs.existsSync(modelPath);
  }

  /**
   * Transcribe an audio file
   * @param {string} audioPath - Path to audio file (WebM, WAV, etc.)
   * @returns {Promise<{text: string, error?: string}>}
   */
  async transcribe(audioPath) {
    let wavPath = null;
    try {
      console.log(`[WhisperService] Transcribing with model ${this.currentModel}: ${audioPath}`);

      // Validate audio file exists
      if (!fs.existsSync(audioPath)) {
        throw new Error('Audio file not found: ' + audioPath);
      }

      // Ensure whisper.cpp is installed
      if (!this.whisperInstalled) {
        throw new Error('Whisper.cpp is not installed. Please install it first in Settings.');
      }

      // Ensure model is downloaded
      if (!this.isModelDownloaded(this.currentModel)) {
        throw new Error(`Model ${this.currentModel} is not downloaded. Please download it first in Settings.`);
      }

      // Convert to WAV if not already a WAV file
      let inputPath = audioPath;
      if (!audioPath.toLowerCase().endsWith('.wav')) {
        wavPath = audioPath.replace(/\.[^.]+$/, '.wav');
        console.log(`[WhisperService] Converting ${audioPath} to ${wavPath}`);
        await convertToWav(audioPath, wavPath);
        inputPath = wavPath;
      }

      // Dynamic import for ESM module
      const { transcribe } = await import('@remotion/install-whisper-cpp');

      const result = await transcribe({
        inputPath: inputPath,
        model: this.currentModel,
        whisperPath: this.whisperDir,
        whisperCppVersion: WHISPER_CPP_VERSION,
        tokenLevelTimestamps: false,
      });

      // Extract text from transcription result
      const text = result.transcription
        .map(segment => segment.text)
        .join(' ')
        .trim();

      console.log(`[WhisperService] Transcription complete: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);

      return { text };
    } catch (error) {
      console.error('[WhisperService] Transcription error:', error);
      return {
        text: '',
        error: error.message || 'Unknown transcription error'
      };
    } finally {
      // Clean up temporary WAV file
      if (wavPath && fs.existsSync(wavPath)) {
        try {
          fs.unlinkSync(wavPath);
        } catch (e) {
          console.warn('[WhisperService] Failed to clean up temp WAV:', e.message);
        }
      }
    }
  }

  /**
   * Set the active model
   * @param {string} modelName - Model ID (tiny.en, base.en, small.en)
   */
  setModel(modelName) {
    if (!MODEL_CONFIGS[modelName]) {
      console.warn(`[WhisperService] Invalid model name: ${modelName}, using base.en`);
      this.currentModel = 'base.en';
      return;
    }

    if (this.currentModel !== modelName) {
      console.log(`[WhisperService] Switching model from ${this.currentModel} to ${modelName}`);
      this.currentModel = modelName;
    }
  }

  /**
   * Get current model
   * @returns {string}
   */
  getModel() {
    return this.currentModel;
  }

  /**
   * Get available models with metadata and download status
   * @returns {Array}
   */
  getAvailableModels() {
    return Object.entries(MODEL_CONFIGS).map(([id, config]) => ({
      id,
      size: config.size,
      speed: config.speed,
      accuracy: config.accuracy,
      description: config.description,
      downloaded: this.isModelDownloaded(id),
    }));
  }

  /**
   * Get installation status
   * @returns {{whisperInstalled: boolean, modelsDir: string}}
   */
  getStatus() {
    return {
      whisperInstalled: this.whisperInstalled,
      modelsDir: this.whisperDir,
    };
  }

  /**
   * Delete a downloaded model
   * @param {string} modelName - Model name (e.g., 'base.en')
   * @returns {{success: boolean, error?: string}}
   */
  deleteModel(modelName) {
    if (!MODEL_CONFIGS[modelName]) {
      return { success: false, error: `Unknown model: ${modelName}` };
    }

    const modelPath = path.join(this.whisperDir, `ggml-${modelName}.bin`);

    if (!fs.existsSync(modelPath)) {
      return { success: false, error: `Model ${modelName} is not downloaded` };
    }

    try {
      fs.unlinkSync(modelPath);
      console.log(`[WhisperService] Deleted model: ${modelName}`);
      return { success: true };
    } catch (error) {
      console.error('[WhisperService] Delete error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Full setup - install whisper.cpp and download a model
   * @param {string} modelName - Model to download
   * @param {function} onProgress - Progress callback
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async fullSetup(modelName = 'base.en', onProgress) {
    try {
      if (onProgress) onProgress({ stage: 'whisper', progress: 0 });

      // Install whisper.cpp if needed
      if (!this.whisperInstalled) {
        const installResult = await this.installWhisperCpp();
        if (!installResult.success) {
          return installResult;
        }
      }

      if (onProgress) onProgress({ stage: 'model', progress: 50 });

      // Download model if needed
      if (!this.isModelDownloaded(modelName)) {
        const downloadResult = await this.downloadModel(modelName);
        if (!downloadResult.success) {
          return downloadResult;
        }
      }

      if (onProgress) onProgress({ stage: 'complete', progress: 100 });

      return { success: true };
    } catch (error) {
      console.error('[WhisperService] Full setup error:', error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new WhisperService();
