import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const rootDir = join(__dirname, '..');
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const workflow = readFileSync(
  join(rootDir, '.github', 'workflows', 'build-windows-store.yml'),
  'utf8',
);
const productionWorkflowPath = join(
  rootDir,
  '.github',
  'workflows',
  'build-windows-store-production.yml',
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
    const installStep = workflow.slice(
      workflow.indexOf('- name: Install locked dependencies'),
      workflow.indexOf('- name: Run source gates'),
    );
    const sourceGateStep = workflow.slice(
      workflow.indexOf('- name: Run source gates'),
      workflow.indexOf('- name: Build unsigned test-identity AppX'),
    );

    expect(installStep).toContain('shell: bash');
    expect(installStep).toContain('set -euo pipefail');
    expect(sourceGateStep).toContain('shell: bash');
    expect(sourceGateStep).toContain('set -euo pipefail');
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
    expect(workflow).toContain('Cert:\\LocalMachine\\TrustedPeople');
    expect(workflow).not.toContain('Cert:\\CurrentUser\\TrustedPeople');
    expect(workflow).toContain('finally {');
    expect(workflow).toContain('$cleanupFailures');
    expect(workflow).toContain('$primaryFailure');
    expect(workflow).toContain('cleanup also failed');
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

describe('Microsoft Store production-package workflow', () => {
  it('builds one non-publishing package with the assigned production identity', () => {
    expect(existsSync(productionWorkflowPath)).toBe(true);
    const productionWorkflow = readFileSync(productionWorkflowPath, 'utf8');

    expect(productionWorkflow).toContain('AUDIOBASH_STORE_MODE: production');
    expect(productionWorkflow).toContain('AUDIOBASH_STORE_IDENTITY_NAME: JoeAmditis.AudioBash');
    expect(productionWorkflow).toContain(
      'AUDIOBASH_STORE_PUBLISHER: CN=2E720364-B842-4BD2-8709-68E4880764A3',
    );
    expect(productionWorkflow).toContain('AUDIOBASH_STORE_PUBLISHER_DISPLAY_NAME: Joe Amditis');
    expect(productionWorkflow).toContain('AudioBash-3.4.0-store-x64.appx');
    expect(productionWorkflow).toContain('verify-windows-store-package.cjs');
    expect(productionWorkflow).toContain('run: npm run electron:build:store:win');
    expect(productionWorkflow).toContain("-Subject 'CN=2E720364-B842-4BD2-8709-68E4880764A3'");
    expect(productionWorkflow).toContain("Get-AppxPackage -Name 'JoeAmditis.AudioBash'");
    expect(productionWorkflow).toContain('Add-AppxPackage');
    expect(productionWorkflow).toContain('npm run test:package:win');
    expect(productionWorkflow).toContain('Remove-AppxPackage');
    expect(productionWorkflow).toContain('Cert:\\LocalMachine\\TrustedPeople');
    expect(productionWorkflow).toContain("CSC_IDENTITY_AUTO_DISCOVERY: 'false'");
    expect(productionWorkflow).not.toContain('Cert:\\CurrentUser\\TrustedPeople');
    expect(productionWorkflow).toContain('finally {');
    expect(productionWorkflow).toContain('$cleanupFailures');
    expect(productionWorkflow).toContain('$primaryFailure');
    expect(productionWorkflow).toContain('cleanup also failed');
    expect(productionWorkflow).toContain('Invoke-CleanupAction');
    expect(productionWorkflow.match(/Get-AppxPackage -Name 'JoeAmditis\.AudioBash'/g)).toHaveLength(
      2,
    );
    expect(productionWorkflow).toContain('foreach ($packageToRemove in $packagesToRemove)');
    expect(productionWorkflow).not.toContain(
      'store-production-sideload.appx\n            release/',
    );
    expect(productionWorkflow).not.toContain('AUDIOBASH_STORE_MODE: test');
    expect(productionWorkflow).not.toContain('--publish always');
  });

  it('binds the production artifact to one exact reviewed master commit', () => {
    const productionWorkflow = readFileSync(productionWorkflowPath, 'utf8');

    expect(productionWorkflow).toContain('release_commit:');
    expect(productionWorkflow).toContain('persist-credentials: false');
    expect(productionWorkflow).toContain('[[ "$REQUESTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]');
    expect(productionWorkflow).toContain('test "$DISPATCH_REF" = "refs/heads/master"');
    expect(productionWorkflow).toContain('test "$(git rev-parse HEAD)" = "$REQUESTED_COMMIT"');
  });

  it('runs source gates before packaging and retains exact production evidence', () => {
    const productionWorkflow = readFileSync(productionWorkflowPath, 'utf8');

    const sourceGateIndex = productionWorkflow.indexOf('npm run test:store:win');
    const packageIndex = productionWorkflow.indexOf('npm run electron:build:store:win');
    const verifyIndex = productionWorkflow.indexOf('verify-windows-store-package.cjs');
    const uploadIndex = productionWorkflow.indexOf('actions/upload-artifact@');
    const installStep = productionWorkflow.slice(
      productionWorkflow.indexOf('- name: Install locked dependencies'),
      productionWorkflow.indexOf('- name: Run source gates'),
    );
    const sourceGateStep = productionWorkflow.slice(
      productionWorkflow.indexOf('- name: Run source gates'),
      productionWorkflow.indexOf('- name: Build unsigned production-identity AppX'),
    );

    expect(installStep).toContain('shell: bash');
    expect(installStep).toContain('set -euo pipefail');
    expect(sourceGateStep).toContain('shell: bash');
    expect(sourceGateStep).toContain('set -euo pipefail');
    expect(sourceGateIndex).toBeGreaterThan(-1);
    expect(packageIndex).toBeGreaterThan(sourceGateIndex);
    expect(verifyIndex).toBeGreaterThan(packageIndex);
    expect(uploadIndex).toBeGreaterThan(verifyIndex);
    expect(productionWorkflow).toContain('SHA256-windows-store-x64.txt');
    expect(productionWorkflow).toContain('AppxManifest.production.xml');
    expect(productionWorkflow).toContain('name: windows-store-production-x64');
    expect(productionWorkflow).toContain('if-no-files-found: error');
  });
});
