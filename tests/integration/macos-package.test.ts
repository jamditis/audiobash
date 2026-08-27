import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const rootDir = join(__dirname, '../..');
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const releaseDir = join(rootDir, 'release');

const packages = [
  {
    architecture: 'arm64',
    appDirectory: 'mac-arm64',
  },
  {
    architecture: 'x64',
    appDirectory: 'mac',
  },
] as const;

function artifactPath(architecture: string, extension: 'dmg' | 'zip'): string {
  const artifactName = packageJson.build.mac.artifactName
    .replace('${productName}', packageJson.build.productName)
    .replace('${version}', packageJson.version)
    .replace('${arch}', architecture)
    .replace('${ext}', extension);

  return join(releaseDir, artifactName);
}

describe.each(packages)('macOS $architecture package', (packageTarget) => {
  const appPath = join(
    releaseDir,
    packageTarget.appDirectory,
    `${packageJson.build.productName}.app`,
  );

  it('contains a runnable application bundle', () => {
    expect(existsSync(join(appPath, 'Contents/MacOS', packageJson.build.productName))).toBe(true);
    expect(existsSync(join(appPath, 'Contents/Resources/app.asar'))).toBe(true);
  });

  it('contains an executable node-pty helper for its architecture', () => {
    const spawnHelperPath = join(
      appPath,
      'Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds',
      `darwin-${packageTarget.architecture}`,
      'spawn-helper',
    );

    expect(existsSync(spawnHelperPath)).toBe(true);
    expect(statSync(spawnHelperPath).mode & 0o111).not.toBe(0);
  });

  it.each(['dmg', 'zip'] as const)('contains the current-version %s artifact', (extension) => {
    const expectedArtifactPath = artifactPath(packageTarget.architecture, extension);

    expect(existsSync(expectedArtifactPath), expectedArtifactPath).toBe(true);
    expect(statSync(expectedArtifactPath).size).toBeGreaterThan(0);
  });
});
