import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rootDir = join(import.meta.dirname, '..', '..');
const packageJson = require('../../package.json');
const { createReleaseArtifactManifest } = require('../../scripts/releaseArtifacts.cjs') as {
  createReleaseArtifactManifest: (metadata: typeof packageJson) => Array<{ fileName: string }>;
};
const runbook = readFileSync(join(rootDir, '.claude/rules/release-process.md'), 'utf8');
const macosChecklist = readFileSync(join(rootDir, 'dev-docs/MACOS_TESTING_CHECKLIST.md'), 'utf8');
const gatekeeperReleaseSection = macosChecklist.slice(
  macosChecklist.indexOf('### 2.'),
  macosChecklist.indexOf('### 3.'),
);
const checklist = runbook.slice(runbook.indexOf('## Checklist'));
const placeholderArtifactNames = createReleaseArtifactManifest(packageJson).map((record) =>
  record.fileName.replace(packageJson.version, 'X.X.X'),
);

describe('release operator runbook', () => {
  it('uses package.json as the version source and checks generated surfaces', () => {
    expect(runbook).toContain('`package.json` carries two version states');
    expect(runbook).toContain('npm run version:sync');
    expect(runbook).toContain('npm run version:check');
    expect(runbook).not.toContain('docs/js/version.js` — the `AUDIOBASH_VERSION` constant');
    expect(runbook).toContain('git add package.json package-lock.json');
    expect(runbook).toContain('stage every reviewed file reported by `git status --short`');
    expect(runbook).toContain('releasePolicy.publicVersion');
    expect(runbook).toContain('Activate the public version');
    expect(runbook.indexOf('Activate the public version')).toBeGreaterThan(
      runbook.indexOf('verify-release-artifact-set.cjs'),
    );
    expect(runbook).not.toContain('Before changing it, freeze the previous release card');
  });

  it('uses the exact-commit candidate workflow as the only release artifact source', () => {
    expect(runbook).not.toMatch(/npm run electron:build:mac\s+# macOS \(both architectures\)/);
    expect(runbook).toContain('.github/workflows/build.yml');
    expect(runbook).toContain('release_commit');
    expect(runbook).toContain('exact reviewed commit');
    expect(runbook).toContain('all five job runs');
  });

  it('requires candidate verification and every resolved artifact in the checklist', () => {
    expect(checklist).toContain('scripts/verify-release-artifact-set.cjs');
    expect(checklist).toContain('exact reviewed commit');
    expect(checklist).toContain('All five job runs');
    for (const fileName of placeholderArtifactNames) expect(checklist).toContain(fileName);
    expect(checklist).not.toContain('Installer(s) uploaded to release');
  });

  it('requires normal Gatekeeper launch and stops on a trust failure', () => {
    expect(runbook).toContain('Open AudioBash normally from Applications');
    expect(runbook).toContain('stop the release');
    expect(runbook).not.toContain('Right-click → Open');
    expect(runbook).not.toContain('xattr -cr');
  });

  it('requires normal Gatekeeper launch in the macOS release checklist', () => {
    expect(gatekeeperReleaseSection).toContain('Gatekeeper launch (signed release build)');
    expect(gatekeeperReleaseSection).toContain('stop the release');
    expect(gatekeeperReleaseSection).toContain('Do not use right-click Open, `xattr`');
    expect(gatekeeperReleaseSection).not.toContain('Right-click');
    expect(gatekeeperReleaseSection).not.toContain('xattr -cr');
    expect(gatekeeperReleaseSection).not.toContain('NORMAL for unsigned apps');
  });

  it('names only test files that exist in this release tree', () => {
    const testPaths = [...runbook.matchAll(/tests\/unit\/[\w.-]+\.test\.ts/g)].map(
      (match) => match[0],
    );

    expect(testPaths.length).toBeGreaterThan(0);
    for (const testPath of testPaths) expect(existsSync(join(rootDir, testPath))).toBe(true);
  });
});
