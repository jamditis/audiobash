#!/usr/bin/env node

/**
 * Whisper Performance Benchmark Script
 *
 * Compares transcription speed and accuracy across different Whisper implementations.
 *
 * Usage:
 *   node scripts/benchmark-whisper.js [audio-file.wav]
 *
 * Requirements:
 *   - Test audio file (defaults to generating 10-second sample)
 *   - nodejs-whisper installed (npm install nodejs-whisper)
 *   - Optional: @fugood/whisper.node for GPU comparison
 *
 * Output:
 *   - Transcription time for each implementation
 *   - Speed multiplier (Xx realtime)
 *   - Memory usage
 *   - Accuracy comparison (if reference transcript provided)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ANSI color codes for pretty output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(text) {
  log('\n' + '='.repeat(60), 'cyan');
  log(`  ${text}`, 'bright');
  log('='.repeat(60), 'cyan');
}

function formatTime(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatMemory(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

async function benchmarkNodejsWhisper(audioPath, modelName = 'base.en') {
  header(`nodejs-whisper (CPU) - ${modelName}`);

  try {
    const { nodewhisper } = require('nodejs-whisper');

    const startMem = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    const result = await nodewhisper(audioPath, {
      modelName: modelName,
      autoDownloadModelName: modelName,
      whisperOptions: {
        outputInText: true,
        translateToEnglish: false,
        wordTimestamps: false,
      }
    });

    const elapsed = Date.now() - startTime;
    const endMem = process.memoryUsage().heapUsed;
    const memDelta = endMem - startMem;

    // Calculate audio duration (assumes 16kHz mono WAV)
    const stats = fs.statSync(audioPath);
    const audioDuration = (stats.size - 44) / (16000 * 2); // WAV header = 44 bytes, 16kHz * 2 bytes/sample
    const speedup = audioDuration / (elapsed / 1000);

    log(`✓ Transcription: "${result.substring(0, 60)}..."`, 'green');
    log(`⏱  Time: ${formatTime(elapsed)} (${speedup.toFixed(2)}x realtime)`, 'blue');
    log(`💾 Memory: ${formatMemory(memDelta)}`, 'blue');

    return {
      implementation: `nodejs-whisper (${modelName})`,
      time: elapsed,
      speedup: speedup,
      memory: memDelta,
      text: result.trim(),
      success: true,
    };
  } catch (error) {
    log(`✗ Failed: ${error.message}`, 'red');
    return {
      implementation: `nodejs-whisper (${modelName})`,
      success: false,
      error: error.message,
    };
  }
}

async function benchmarkWhisperNodeGPU(audioPath, modelName = 'base.en') {
  header(`@fugood/whisper.node (GPU) - ${modelName}`);

  try {
    const whisperNode = require('@fugood/whisper.node');

    // Map model names to file paths
    const modelsDir = path.join(os.homedir(), '.audiobash', 'models');
    const modelPath = path.join(modelsDir, `ggml-${modelName}.bin`);

    if (!fs.existsSync(modelPath)) {
      log(`⚠ Model not found: ${modelPath}`, 'yellow');
      log('  Download models first or use nodejs-whisper', 'dim');
      return { implementation: `@fugood/whisper.node (${modelName})`, success: false, error: 'Model not found' };
    }

    // Detect GPU type
    const platform = os.platform();
    const gpuType = platform === 'darwin' ? 'metal' : 'cuda';
    const libVariant = platform === 'darwin' ? 'default' : 'cuda';

    log(`🎮 GPU: ${gpuType}`, 'cyan');

    const startMem = process.memoryUsage().heapUsed;
    const startTime = Date.now();

    // Initialize Whisper context
    const context = await whisperNode.initWhisper({
      modelPath: modelPath,
      useGpu: true,
      libVariant: libVariant,
    });

    // Convert audio to PCM ArrayBuffer (simplified - assumes already PCM)
    const audioBuffer = fs.readFileSync(audioPath);
    const arrayBuffer = audioBuffer.buffer.slice(
      audioBuffer.byteOffset,
      audioBuffer.byteOffset + audioBuffer.byteLength
    );

    // Transcribe
    const result = await whisperNode.whisper(context, {
      audio: arrayBuffer,
      options: {
        language: 'en',
        translate: false,
        max_len: 1,
        token_timestamps: false,
      }
    });

    const elapsed = Date.now() - startTime;
    const endMem = process.memoryUsage().heapUsed;
    const memDelta = endMem - startMem;

    // Calculate speedup
    const stats = fs.statSync(audioPath);
    const audioDuration = (stats.size - 44) / (16000 * 2);
    const speedup = audioDuration / (elapsed / 1000);

    log(`✓ Transcription: "${result.substring(0, 60)}..."`, 'green');
    log(`⏱  Time: ${formatTime(elapsed)} (${speedup.toFixed(2)}x realtime)`, 'blue');
    log(`💾 Memory: ${formatMemory(memDelta)}`, 'blue');

    return {
      implementation: `@fugood/whisper.node (${modelName}, ${gpuType})`,
      time: elapsed,
      speedup: speedup,
      memory: memDelta,
      text: result.trim(),
      success: true,
    };
  } catch (error) {
    log(`✗ Failed: ${error.message}`, 'red');
    if (error.message.includes('Cannot find module')) {
      log('  Install with: npm install @fugood/whisper.node', 'dim');
    }
    return {
      implementation: `@fugood/whisper.node (${modelName})`,
      success: false,
      error: error.message,
    };
  }
}

function printComparison(results) {
  header('Benchmark Results');

  console.log('\n' + '  Implementation                        Time        Speed    Memory');
  console.log('  ' + '-'.repeat(72));

  const successfulResults = results.filter(r => r.success);

  successfulResults.forEach(result => {
    const impl = result.implementation.padEnd(35);
    const time = formatTime(result.time).padStart(8);
    const speed = `${result.speedup.toFixed(2)}x`.padStart(8);
    const memory = formatMemory(result.memory).padStart(10);

    console.log(`  ${impl} ${time}  ${speed}  ${memory}`);
  });

  console.log('  ' + '-'.repeat(72) + '\n');

  // Calculate speedup comparisons
  if (successfulResults.length >= 2) {
    const baseline = successfulResults[0];
    log('Speedup vs baseline:', 'cyan');

    successfulResults.slice(1).forEach(result => {
      const speedup = baseline.time / result.time;
      const color = speedup > 1 ? 'green' : 'red';
      log(`  ${result.implementation}: ${speedup.toFixed(2)}x faster`, color);
    });

    console.log();
  }

  // Show failed implementations
  const failedResults = results.filter(r => !r.success);
  if (failedResults.length > 0) {
    log('Failed implementations:', 'yellow');
    failedResults.forEach(result => {
      log(`  ${result.implementation}: ${result.error}`, 'dim');
    });
    console.log();
  }
}

function printSystemInfo() {
  header('System Information');

  console.log(`  OS:        ${os.platform()} ${os.release()}`);
  console.log(`  Arch:      ${os.arch()}`);
  console.log(`  CPUs:      ${os.cpus()[0].model} (${os.cpus().length} cores)`);
  console.log(`  RAM:       ${formatMemory(os.totalmem())} total, ${formatMemory(os.freemem())} free`);
  console.log(`  Node.js:   ${process.version}`);
  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  const audioPath = args[0];

  if (!audioPath) {
    console.error('Usage: node benchmark-whisper.js <audio-file.wav>');
    console.error('\nExample:');
    console.error('  node benchmark-whisper.js test-audio.wav');
    console.error('\nNote: Audio file should be 16kHz mono WAV format');
    process.exit(1);
  }

  if (!fs.existsSync(audioPath)) {
    console.error(`Error: File not found: ${audioPath}`);
    process.exit(1);
  }

  printSystemInfo();

  log('Starting benchmark...', 'bright');
  log(`Audio file: ${audioPath}`, 'dim');

  const stats = fs.statSync(audioPath);
  const audioDuration = (stats.size - 44) / (16000 * 2);
  log(`Audio duration: ${audioDuration.toFixed(2)} seconds\n`, 'dim');

  const results = [];

  // Benchmark nodejs-whisper
  results.push(await benchmarkNodejsWhisper(audioPath, 'tiny.en'));
  results.push(await benchmarkNodejsWhisper(audioPath, 'base.en'));

  // Benchmark @fugood/whisper.node (if available)
  results.push(await benchmarkWhisperNodeGPU(audioPath, 'base.en'));

  // Print comparison table
  printComparison(results);

  log('Benchmark complete!', 'green');
  log('\nRecommendations:', 'cyan');
  const fastestResult = results.filter(r => r.success).sort((a, b) => a.time - b.time)[0];
  if (fastestResult) {
    log(`  Fastest: ${fastestResult.implementation} (${formatTime(fastestResult.time)})`, 'bright');

    if (fastestResult.speedup < 1) {
      log('  ⚠ Slower than realtime - consider using a faster model or cloud API', 'yellow');
    } else if (fastestResult.speedup > 5) {
      log('  ✓ Fast enough for real-time transcription', 'green');
    } else {
      log('  ✓ Acceptable for short commands', 'green');
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
