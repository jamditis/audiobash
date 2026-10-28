import { createRequire } from 'module';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rootDir = join(__dirname, '..');
const releaseElectronVersion = '43.8.3';
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(join(rootDir, 'package-lock.json'), 'utf8'));
const installedElectron = JSON.parse(
  readFileSync(join(rootDir, 'node_modules/electron/package.json'), 'utf8'),
);
const rebuildRequire = createRequire(require.resolve('@electron/rebuild'));
const nodeAbiPackagePath = join(dirname(rebuildRequire.resolve('node-abi')), 'package.json');
const nodeAbiLockPath = relative(rootDir, dirname(nodeAbiPackagePath)).split(sep).join('/');
const nodeAbi = rebuildRequire('node-abi') as {
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
    expect(packageLock.packages[nodeAbiLockPath].version).toBe('4.33.0');
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
