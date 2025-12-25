/**
 * Audio conversion utilities for VAD integration
 * Converts Float32Array (from VAD) to WAV Blob (for transcription service)
 */

/**
 * Convert Float32Array audio data to WAV Blob
 * @param float32 Audio data as Float32Array (normalized to -1.0 to 1.0)
 * @param sampleRate Sample rate in Hz (typically 16000 for VAD)
 * @returns WAV Blob that can be used for transcription
 */
export function float32ToWavBlob(float32: Float32Array, sampleRate: number = 16000): Blob {
  const numChannels = 1; // Mono
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = float32.length * bytesPerSample;
  const bufferSize = 44 + dataSize; // 44 bytes for WAV header + data

  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Write WAV header
  let offset = 0;

  // "RIFF" chunk descriptor
  writeString(view, offset, 'RIFF'); offset += 4;
  view.setUint32(offset, bufferSize - 8, true); offset += 4; // File size - 8
  writeString(view, offset, 'WAVE'); offset += 4;

  // "fmt " sub-chunk
  writeString(view, offset, 'fmt '); offset += 4;
  view.setUint32(offset, 16, true); offset += 4; // Subchunk1Size (16 for PCM)
  view.setUint16(offset, 1, true); offset += 2;  // AudioFormat (1 for PCM)
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, byteRate, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, bitDepth, true); offset += 2;

  // "data" sub-chunk
  writeString(view, offset, 'data'); offset += 4;
  view.setUint32(offset, dataSize, true); offset += 4;

  // Write audio data (convert Float32 to Int16)
  for (let i = 0; i < float32.length; i++) {
    // Clamp to -1.0 to 1.0 range
    const sample = Math.max(-1, Math.min(1, float32[i]));
    // Convert to 16-bit integer
    const int16Sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset, int16Sample, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Helper function to write string to DataView
 */
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Convert WAV Blob to WebM Blob for compatibility with transcription service
 * Uses MediaRecorder to encode WAV as WebM
 * @param wavBlob WAV Blob
 * @returns Promise<Blob> WebM Blob
 */
export async function wavToWebmBlob(wavBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const audioContext = new AudioContext();
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Create a MediaStreamDestination
        const destination = audioContext.createMediaStreamDestination();
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(destination);

        // Record using MediaRecorder
        const mediaRecorder = new MediaRecorder(destination.stream, {
          mimeType: 'audio/webm'
        });
        const chunks: Blob[] = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          const webmBlob = new Blob(chunks, { type: 'audio/webm' });
          audioContext.close();
          resolve(webmBlob);
        };

        mediaRecorder.onerror = (error) => {
          audioContext.close();
          reject(error);
        };

        // Start recording and playback
        mediaRecorder.start();
        source.start(0);

        // Stop when audio finishes playing
        source.onended = () => {
          setTimeout(() => {
            mediaRecorder.stop();
          }, 100); // Small delay to ensure all data is captured
        };
      } catch (err) {
        audioContext.close();
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(reader.error);
    };

    reader.readAsArrayBuffer(wavBlob);
  });
}

/**
 * Direct conversion from Float32Array to WebM Blob
 * Combines float32ToWavBlob and wavToWebmBlob
 * @param float32 Audio data as Float32Array
 * @param sampleRate Sample rate in Hz (typically 16000 for VAD)
 * @returns Promise<Blob> WebM Blob ready for transcription
 */
export async function float32ToWebmBlob(float32: Float32Array, sampleRate: number = 16000): Promise<Blob> {
  const wavBlob = float32ToWavBlob(float32, sampleRate);
  return wavToWebmBlob(wavBlob);
}
