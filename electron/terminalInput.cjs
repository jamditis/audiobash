const TERMINAL_CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

function sanitizeTerminalPreviewInput(text) {
  if (typeof text !== 'string') {
    return '';
  }

  return text.replace(TERMINAL_CONTROL_CHARACTERS, '');
}

module.exports = {
  sanitizeTerminalPreviewInput,
};
