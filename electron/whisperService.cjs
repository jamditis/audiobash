/**
 * Local Whisper transcription service using nodejs-whisper
 * Provides offline speech-to-text without cloud APIs
 */

const { nodewhisper } = require('nodejs-whisper');
const path = require('path');
const os = require('os');
const fs = require('fs');

class WhisperService {
  constructor() {
    // Models are stored in ~/.audiobash/models/
    this.modelsDir = path.join(os.homedir(), '.audiobash', 'models');
    this.currentModel = 'base.en';

    // Ensure models directory exists
    this.ensureModelsDir();
  }

  ensureModelsDir() {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
      console.log('[WhisperService] Created models directory:', this.modelsDir);
    }
  }

  /**
   * Transcribe an audio file using nodejs-whisper
   * @param {string} audioPath - Path to audio file
   * @returns {Promise<{text: string, error?: string}>}
   */
  async transcribe(audioPath) {
    try {
      console.log(`[WhisperService] Transcribing with model ${this.currentModel}: ${audioPath}`);

      // Validate audio file exists
      if (!fs.existsSync(audioPath)) {
        throw new Error('Audio file not found');
      }

      // nodewhisper configuration
      const options = {
        modelName: this.currentModel,  // Model to use (will auto-download if needed)
        autoDownloadModelName: this.currentModel, // Auto-download model if not present
        whisperOptions: {
          outputInText: true,      // Output as plain text
          outputInVtt: false,      // Don't need VTT format
          outputInSrt: false,      // Don't need SRT format
          outputInCsv: false,      // Don't need CSV format
          translateToEnglish: false, // Keep original language
          wordTimestamps: false,   // Don't need word-level timestamps
          timestamps_length: 60,   // Timestamp granularity (not used if wordTimestamps=false)
          splitOnWord: true,       // Split on word boundaries
        }
      };

      // Transcribe the audio file
      const result = await nodewhisper(audioPath, options);

      // The result is already plain text with nodejs-whisper
      const text = typeof result === 'string' ? result.trim() : '';

      console.log(`[WhisperService] Transcription complete: "${text.substring(0, 100)}..."`);

      return { text };
    } catch (error) {
      console.error('[WhisperService] Transcription error:', error);
      return {
        text: '',
        error: error.message || 'Unknown transcription error'
      };
    }
  }

  /**
   * Set the active model
   * @param {string} modelName - Model ID (tiny.en, base.en, small.en, etc.)
   */
  setModel(modelName) {
    const validModels = ['tiny.en', 'base.en', 'small.en', 'tiny', 'base', 'small', 'medium', 'large'];
    if (!validModels.includes(modelName)) {
      console.warn(`[WhisperService] Invalid model name: ${modelName}, using base.en`);
      this.currentModel = 'base.en';
      return;
    }

    console.log(`[WhisperService] Switching model from ${this.currentModel} to ${modelName}`);
    this.currentModel = modelName;
  }

  /**
   * Get current model
   * @returns {string}
   */
  getModel() {
    return this.currentModel;
  }

  /**
   * Get available models with metadata
   * @returns {Array<{id: string, size: string, speed: string, accuracy: string}>}
   */
  getAvailableModels() {
    return [
      {
        id: 'tiny.en',
        size: '75 MB',
        speed: 'Fastest',
        accuracy: 'Good',
        description: 'Fastest model, good for most use cases'
      },
      {
        id: 'base.en',
        size: '142 MB',
        speed: 'Fast',
        accuracy: 'Better',
        description: 'Balanced speed and accuracy (default)'
      },
      {
        id: 'small.en',
        size: '466 MB',
        speed: 'Medium',
        accuracy: 'Best',
        description: 'Slower but more accurate'
      },
    ];
  }

  /**
   * Check if a model is downloaded
   * @param {string} modelName - Model ID
   * @returns {boolean}
   */
  isModelDownloaded(modelName) {
    // nodejs-whisper stores models in its own directory
    // We can't easily check this without running a transcription
    // Just return true for now - the model will auto-download on first use
    return false;
  }
}

// Export singleton instance
module.exports = new WhisperService();
