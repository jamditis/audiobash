import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = join(__dirname, '..');
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const workflow = readFileSync(
  join(rootDir, '.github', 'workflows', 'build-windows-store.yml'),
  'utf8',
);
const directReleaseArtifacts = readFileSync(
  join(rootDir, 'scripts', 'releaseArtifacts.cjs'),
  'utf8',
);

describe('Microsoft Store test-package workflow', () => {
  it('has a dedicated non-publishing build command', () => {
    expect(packageJson.scripts['electron:build:store:win']).toContain(
      '--config build/electron-builder.microsoft-store.cjs',
    );
    expect(packageJson.scripts['electron:build:store:win']).toContain('--publish never');
  });

  it('checks out and verifies one exact reviewed commit', () => {
    expect(workflow).toContain('release_commit:');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).toContain('[[ "$REQUESTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]');
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$REQUESTED_COMMIT"');
  });

  it('uses the locked toolchain and all source gates before packaging', () => {
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm ls electron-builder@26.15.3 app-builder-lib');
    expect(workflow).toContain('npm run format:check');
    expect(workflow).toContain('npm run lint');
    expect(workflow).toContain('npm run typecheck');
    expect(workflow).toContain('npm run version:check');
    expect(workflow).toContain('npm run test:store:win');
    expect(workflow).not.toContain('npm test');
    expect(packageJson.scripts['test:store:win']).toContain('tests/windows-store-config.test.ts');
    expect(packageJson.scripts['test:store:win']).toContain(
      'tests/integration/processTree.windows.test.ts',
    );
    expect(packageJson.scripts['test:store:win']).toContain(
      'tests/unit/windowsPackageProbe.test.ts',
    );
  });

  it('builds and verifies only the marked test-identity AppX', () => {
    expect(workflow).toContain('AUDIOBASH_STORE_MODE: test');
    expect(workflow).toContain('run: npm run electron:build:store:win');
    expect(workflow).not.toContain('npm run electron:build:store:win -- --publish never');
    expect(workflow).toContain('AudioBash-3.4.0-store-test-x64.appx');
    expect(workflow).toContain('verify-windows-store-package.cjs');
    expect(workflow).not.toContain('AUDIOBASH_STORE_MODE: production');
  });

  it('sideloads a temporary signed copy and cleans all test trust state', () => {
    expect(workflow).toContain('New-SelfSignedCertificate');
    expect(workflow).toContain('signtool.exe');
    expect(workflow).toContain('Add-AppxPackage');
    expect(workflow).toContain('AUDIOBASH_WINDOWS_PACKAGE_ROOT');
    expect(workflow).toContain('npm run test:package:win');
    expect(workflow).toContain('Remove-AppxPackage');
    expect(workflow).toContain('Cert:\\CurrentUser\\TrustedPeople');
    expect(workflow).toContain('finally {');
    expect(workflow).toContain('$cleanupFailures');
    expect(workflow).toContain('Invoke-CleanupAction');
    expect(workflow.match(/Get-AppxPackage -Name 'AudioBash\.Store\.Test'/g)).toHaveLength(2);
    expect(workflow).toContain('foreach ($packageToRemove in $packagesToRemove)');
    expect(workflow).not.toContain('store-sideload.appx\n            release/');
  });

  it('keeps the Store artifact outside the direct release contract', () => {
    expect(directReleaseArtifacts).not.toContain('store-test');
    expect(directReleaseArtifacts).not.toContain('microsoft-store');
  });
});
