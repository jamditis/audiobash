'use strict';

const ELEVENLABS_SPEECH_TO_TEXT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const ELEVENLABS_MODEL_ID = 'scribe_v1';
function createElevenLabsError(status) {
  const error = new Error(`ElevenLabs API error: ${status}`);
  error.status = status;
  return error;
}

async function sendElevenLabsRequest({ audioBuffer, apiKey, signal, fetchImpl = fetch }) {
  const formData = new FormData();
  const audio = new Blob([audioBuffer], { type: 'audio/webm' });
  formData.append('file', audio, 'audio.webm');
  formData.append('model_id', ELEVENLABS_MODEL_ID);

  const response = await fetchImpl(ELEVENLABS_SPEECH_TO_TEXT_URL, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
    },
    body: formData,
    signal,
  });

  if (!response.ok) {
    throw createElevenLabsError(response.status);
  }

  try {
    return await response.json();
  } catch (error) {
    const parseError = new Error('ElevenLabs API returned invalid JSON');
    parseError.cause = error;
    throw parseError;
  }
}

module.exports = {
  ELEVENLABS_MODEL_ID,
  ELEVENLABS_SPEECH_TO_TEXT_URL,
  sendElevenLabsRequest,
};
