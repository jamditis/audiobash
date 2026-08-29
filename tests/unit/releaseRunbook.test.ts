import { readFileSync } from 'node:fs';
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
const checklist = runbook.slice(runbook.indexOf('## Checklist'));
const placeholderArtifactNames = createReleaseArtifactManifest(packageJson).map((record) =>
  record.fileName.replace(packageJson.version, 'X.X.X'),
);

describe('release operator runbook', () => {
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
});
