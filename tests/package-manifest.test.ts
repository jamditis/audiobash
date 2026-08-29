import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const rootDir = join(__dirname, '..');
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));

const rendererBuildInputs = [
  '@ricky0123/vad-web',
  '@xterm/addon-fit',
  '@xterm/xterm',
  'react',
  'react-dom',
] as const;

describe('package manifest dependency ownership', () => {
  it.each(rendererBuildInputs)('keeps %s as a renderer build input', (dependency) => {
    expect(packageJson.dependencies[dependency]).toBeUndefined();
    expect(packageJson.devDependencies[dependency]).toEqual(expect.any(String));
  });

  it('does not install the unused user-event test helper', () => {
    expect(packageJson.dependencies['@testing-library/user-event']).toBeUndefined();
    expect(packageJson.devDependencies['@testing-library/user-event']).toBeUndefined();
  });

  it('owns the ASAR inspection tool used by the macOS package gate', () => {
    expect(packageJson.devDependencies['@electron/asar']).toEqual(expect.any(String));
  });

  it.each([
    '@anthropic-ai/sdk',
    '@google/generative-ai',
    '@remotion/install-whisper-cpp',
    'node-pty',
    'openai',
  ])('keeps %s available to the Electron main process', (dependency) => {
    expect(packageJson.dependencies[dependency]).toEqual(expect.any(String));
  });
});
