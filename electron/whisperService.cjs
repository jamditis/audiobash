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
const fs = require('fs');
const { app } = require('electron');
const { execSync } = require('child_process');
const { createProcessTreeController } = require('./processTree.cjs');
const { createTranscriptionJob } = require('./transcriptionJob.cjs');

// Model configurations - only small.en is supported now
const MODEL_CONFIGS = {
  'small.en': {
    size: '466 MB',
    speed: 'Fast',
    accuracy: 'Best',
    description: 'High accuracy local transcription',
  },
};

// Whisper.cpp version to use
const WHISPER_CPP_VERSION = '1.5.5';
const MAX_ACTIVE_JOBS = 2;

/**
 * Fallback zip extraction when @remotion/install-whisper-cpp fails
 * Tries multiple extraction methods available on Windows
 * @param {string} zipPath - Path to the zip file
 * @param {string} destDir - Destination directory
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function fallbackExtractZip(zipPath, destDir) {
  console.log('[WhisperService] Attempting fallback zip extraction...');
  console.log('[WhisperService] Zip path:', zipPath);
  console.log('[WhisperService] Dest dir:', destDir);

  if (!fs.existsSync(zipPath)) {
    return { success: false, error: 'Zip file not found for fallback extraction' };
  }

  // Ensure destination directory exists
  fs.mkdirSync(destDir, { recursive: true });

  // Method 1: Try 'unzip' command (available via Git Bash, Cygwin, WSL)
  try {
    console.log('[WhisperService] Trying unzip command...');
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, {
      stdio: 'pipe',
      windowsHide: true,
    });
    console.log('[WhisperService] Fallback extraction successful (unzip)');
    return { success: true };
  } catch (e) {
    console.log('[WhisperService] unzip failed:', e.message);
  }

  // Method 2: Try 'tar' command (available in Windows 10 1803+)
  try {
    console.log('[WhisperService] Trying tar command...');
    execSync(`tar -xf "${zipPath}" -C "${destDir}"`, {
      stdio: 'pipe',
      windowsHide: true,
    });
    console.log('[WhisperService] Fallback extraction successful (tar)');
    return { success: true };
  } catch (e) {
    console.log('[WhisperService] tar failed:', e.message);
  }

  // Method 3: Try 7-Zip if installed
  const sevenZipPaths = [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  ];
  for (const szPath of sevenZipPaths) {
    if (fs.existsSync(szPath)) {
      try {
        console.log('[WhisperService] Trying 7-Zip...');
        execSync(`"${szPath}" x "${zipPath}" -o"${destDir}" -y`, {
          stdio: 'pipe',
          windowsHide: true,
        });
        console.log('[WhisperService] Fallback extraction successful (7-Zip)');
        return { success: true };
      } catch (e) {
        console.log('[WhisperService] 7-Zip failed:', e.message);
      }
    }
  }

  return {
    success: false,
    error:
      'All extraction methods failed. Please install 7-Zip, Git Bash, or update Windows to 10 1803+.',
  };
}

class WhisperService {
  constructor({
    processTree = createProcessTreeController(),
    createJob = createTranscriptionJob,
    now = Date.now,
  } = {}) {
    // Store whisper.cpp and models in app's userData directory
    this.whisperDir = null; // Set after app is ready
    this.currentModel = 'small.en';
    this.whisperInstalled = false;
    this.installPromise = null;
    this.processTree = processTree;
    this.createJob = createJob;
    this.now = now;
    this.activeJobs = new Map();
    this.activeRequests = new Set();
    this.earlyCancellations = new Map();
    this.shuttingDown = false;
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
    // Check both versioned path and root path (for backwards compatibility)
    const versionedPath = path.join(this.whisperDir, WHISPER_CPP_VERSION, binaryName);
    const rootPath = path.join(this.whisperDir, binaryName);
    return fs.existsSync(versionedPath) || fs.existsSync(rootPath);
  }

  /**
   * Get the actual path to the whisper.cpp binary
   */
  getWhisperBinaryPath() {
    const binaryName = process.platform === 'win32' ? 'main.exe' : 'main';
    const versionedPath = path.join(this.whisperDir, WHISPER_CPP_VERSION, binaryName);
    const rootPath = path.join(this.whisperDir, binaryName);
    // Prefer versioned path, fall back to root
    return fs.existsSync(versionedPath) ? versionedPath : rootPath;
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
      // Save original cwd - the @remotion/install-whisper-cpp package downloads
      // the zip file to process.cwd(), which fails in production when running
      // from C:\Program Files (requires admin privileges). We temporarily change
      // to the userData directory which is always writable.
      const originalCwd = process.cwd();
      const userDataPath = app.getPath('userData');

      try {
        console.log('[WhisperService] Installing whisper.cpp...');

        // Check if folder exists but executable is missing - clean up stale install
        // IMPORTANT: Don't recreate the folder - let the remotion package create it
        if (fs.existsSync(this.whisperDir) && !this.isWhisperInstalled()) {
          console.log('[WhisperService] Cleaning up incomplete installation...');
          fs.rmSync(this.whisperDir, { recursive: true, force: true });
        }

        // Change to userData directory before installing
        // This is where the zip file will be downloaded temporarily
        console.log('[WhisperService] Changing cwd to:', userDataPath);
        process.chdir(userDataPath);

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
        console.error('[WhisperService] Primary install failed:', error.message);

        // Fallback: Check if zip was downloaded but extraction failed (common on Windows)
        // The remotion package uses PowerShell's Expand-Archive which can fail
        const zipPath = path.join(userDataPath, 'whisper-bin-x64.zip');
        const destDir = path.join(this.whisperDir, WHISPER_CPP_VERSION);

        if (fs.existsSync(zipPath)) {
          console.log('[WhisperService] Zip file found, attempting fallback extraction...');

          const fallbackResult = await fallbackExtractZip(zipPath, destDir);

          if (fallbackResult.success && this.isWhisperInstalled()) {
            this.whisperInstalled = true;
            console.log('[WhisperService] Whisper.cpp installed via fallback extraction');
            return { success: true };
          } else {
            console.error('[WhisperService] Fallback extraction failed:', fallbackResult.error);
            return {
              success: false,
              error: `Installation failed. ${fallbackResult.error || error.message}`,
            };
          }
        }

        return { success: false, error: error.message };
      } finally {
        // Always restore original cwd
        try {
          process.chdir(originalCwd);
          console.log('[WhisperService] Restored cwd to:', originalCwd);
        } catch (e) {
          console.warn('[WhisperService] Failed to restore cwd:', e.message);
        }
        this.installPromise = null;
      }
    })();

    return this.installPromise;
  }

  /**
   * Download a Whisper model
   * @param {string} modelName - Supported model name (`small.en`)
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
  transcribe(audioPath, request = {}) {
    if (this.shuttingDown) {
      return Promise.resolve({
        text: '',
        error: 'Local transcription is shutting down',
        errorCode: 'TRANSCRIPTION_SHUTDOWN',
      });
    }
    if (this.activeRequests.size >= MAX_ACTIVE_JOBS) {
      return Promise.resolve({
        text: '',
        error: 'Too many local transcription requests are active',
        errorCode: 'TRANSCRIPTION_BUSY',
      });
    }

    const requestPromise = this.runTranscription(audioPath, request);
    this.activeRequests.add(requestPromise);
    void requestPromise.then(
      () => this.activeRequests.delete(requestPromise),
      () => this.activeRequests.delete(requestPromise),
    );
    return requestPromise;
  }

  async runTranscription(audioPath, { requestId, modelName = this.currentModel } = {}) {
    let wavPath = null;
    let job = null;

    try {
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(requestId)) {
        throw new Error('Invalid local transcription request ID');
      }
      if (this.activeJobs.has(requestId)) {
        throw new Error('A local transcription request with this ID is already active');
      }
      this.pruneEarlyCancellations();
      if (this.earlyCancellations.delete(requestId)) {
        const error = new Error('Transcription cancelled');
        error.code = 'TRANSCRIPTION_CANCELLED';
        throw error;
      }
      if (!MODEL_CONFIGS[modelName]) {
        throw new Error(`Unknown model: ${modelName}`);
      }

      console.log(`[WhisperService] Transcribing with model ${modelName}: ${audioPath}`);

      // Validate audio file exists
      if (!fs.existsSync(audioPath)) {
        throw new Error('Audio file not found: ' + audioPath);
      }

      // Ensure whisper.cpp is installed
      if (!this.whisperInstalled) {
        throw new Error('Whisper.cpp is not installed. Please install it first in Settings.');
      }

      // Ensure model is downloaded
      if (!this.isModelDownloaded(modelName)) {
        throw new Error(
          `Model ${modelName} is not downloaded. Please download it first in Settings.`,
        );
      }

      let inputPath = audioPath;
      let conversion;
      if (!audioPath.toLowerCase().endsWith('.wav')) {
        wavPath = audioPath.replace(/\.[^.]+$/, '.wav');
        console.log(`[WhisperService] Converting ${audioPath} to ${wavPath}`);
        inputPath = wavPath;
        conversion = {
          command: 'ffmpeg',
          args: ['-i', audioPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', wavPath],
        };
      }

      const binaryPath = this.getWhisperBinaryPath();
      const modelPath = path.join(this.whisperDir, `ggml-${modelName}.bin`);

      console.log(`[WhisperService] Running: ${binaryPath} -m ${modelPath} -f ${inputPath}`);
      job = this.createJob({
        processTree: this.processTree,
        timeoutMs: 60_000,
      });
      this.activeJobs.set(requestId, job);

      const result = await job.run({
        conversion,
        transcription: {
          command: binaryPath,
          args: ['-m', modelPath, '-f', inputPath, '-nt', '-np'],
        },
      });

      const lines = result.stdout.split('\n');
      const text = lines
        .filter(
          (line) =>
            !line.startsWith('whisper_') &&
            !line.startsWith('main:') &&
            !line.includes('system_info') &&
            line.trim().length > 0,
        )
        .join(' ')
        .trim();

      console.log(
        `[WhisperService] Transcription complete: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`,
      );

      return { text };
    } catch (error) {
      console.error('[WhisperService] Transcription error:', error);
      const errorCode =
        error.code === 'TRANSCRIPTION_SHUTDOWN' ? 'TRANSCRIPTION_CANCELLED' : error.code;
      return {
        text: '',
        error: error.message || 'Unknown transcription error',
        errorCode,
      };
    } finally {
      if (job && this.activeJobs.get(requestId) === job) {
        this.activeJobs.delete(requestId);
      }
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

  pruneEarlyCancellations() {
    const currentTime = this.now();
    for (const [requestId, expiresAt] of this.earlyCancellations) {
      if (expiresAt <= currentTime) this.earlyCancellations.delete(requestId);
    }
  }

  cancel(requestId) {
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(requestId)) {
      return { cancelled: false, queued: false, error: 'Invalid local transcription request ID' };
    }
    const job = this.activeJobs.get(requestId);
    if (job) {
      void job.cancel().catch((error) => {
        console.error('[WhisperService] Cancellation cleanup failed:', error);
      });
      return { cancelled: true, queued: false };
    }

    this.pruneEarlyCancellations();
    this.earlyCancellations.set(requestId, this.now() + 10_000);
    while (this.earlyCancellations.size > 100) {
      this.earlyCancellations.delete(this.earlyCancellations.keys().next().value);
    }
    return { cancelled: false, queued: true };
  }

  async shutdown() {
    this.shuttingDown = true;
    const jobs = [...this.activeJobs.values()];
    const shutdownResults = await Promise.allSettled(jobs.map((job) => job.shutdown()));
    await Promise.allSettled([...this.activeRequests]);
    const failure = shutdownResults.find((result) => result.status === 'rejected');
    if (failure) throw failure.reason;
    return { remainingJobs: this.activeJobs.size };
  }

  /**
   * Set the active model
   * @param {string} modelName - Model ID (small.en)
   */
  setModel(modelName) {
    if (!MODEL_CONFIGS[modelName]) {
      console.warn(`[WhisperService] Invalid model name: ${modelName}, using small.en`);
      this.currentModel = 'small.en';
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
   * @param {string} modelName - Supported model name (`small.en`)
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
  async fullSetup(modelName = 'small.en', onProgress) {
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

// Export the production singleton and the class for dependency-injected tests.
module.exports = new WhisperService();
module.exports.WhisperService = WhisperService;
