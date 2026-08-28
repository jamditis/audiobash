import { createRequire } from 'module';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rootDir = join(__dirname, '..');
const releaseElectronVersion = '43.4.1';
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(join(rootDir, 'package-lock.json'), 'utf8'));
const installedElectron = JSON.parse(
  readFileSync(join(rootDir, 'node_modules/electron/package.json'), 'utf8'),
);
const nodeAbiPath = join(rootDir, 'node_modules/@electron/rebuild/node_modules/node-abi');
const nodeAbi = require(nodeAbiPath) as {
  getAbi: (version: string, runtime: string) => string;
};

describe('Electron release contract', () => {
  it('uses the selected supported Electron release everywhere', () => {
    expect(packageJson.devDependencies.electron).toBe(releaseElectronVersion);
    expect(packageLock.packages[''].devDependencies.electron).toBe(releaseElectronVersion);
    expect(packageLock.packages['node_modules/electron'].version).toBe(releaseElectronVersion);
    expect(installedElectron.version).toBe(releaseElectronVersion);
  });

  it('has the Electron 43 native ABI mapping used by the packager', () => {
    expect(
      packageLock.packages['node_modules/@electron/rebuild/node_modules/node-abi'].version,
    ).toBe('4.33.0');
    expect(nodeAbi.getAbi(releaseElectronVersion, 'electron')).toBe('148');
  });

  it('has the exact Electron binary prepared for local runtime checks', () => {
    const electronRoot = join(rootDir, 'node_modules/electron');
    const binaryRelativePath = readFileSync(join(electronRoot, 'path.txt'), 'utf8');

    expect(readFileSync(join(electronRoot, 'dist/version'), 'utf8').trim()).toBe(
      releaseElectronVersion,
    );
    expect(existsSync(join(electronRoot, 'dist', binaryRelativePath))).toBe(true);
  });
});
