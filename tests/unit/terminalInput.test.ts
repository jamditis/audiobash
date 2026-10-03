import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { sanitizeTerminalPreviewInput } = require('../../electron/terminalInput.cjs');

describe('terminal preview input sanitization', () => {
  it('removes line breaks that would execute commands in preview mode', () => {
    expect(sanitizeTerminalPreviewInput('echo safe\nrm -rf ~/important')).toBe('echo saferm -rf ~/important');
    expect(sanitizeTerminalPreviewInput('echo safe\rprintf pwned')).toBe('echo safeprintf pwned');
  });

  it('removes terminal control characters while preserving printable text', () => {
    const payload = 'echo ok\u001b[2J\u0003\u007f café 🚀';
    expect(sanitizeTerminalPreviewInput(payload)).toBe('echo ok[2J café 🚀');
  });
});
