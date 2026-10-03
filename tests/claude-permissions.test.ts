import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const settingsPath = join(__dirname, '..', '.claude', 'settings.local.json');
const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
  permissions?: { allow?: string[] };
};

const allowList = settings.permissions?.allow ?? [];
const approvedAllowList = [
  'Bash(npx tsc:*)',
  'Bash(npm run build:*)',
  'Bash(git add:*)',
  'Bash(git commit:*)',
];

const dangerousClaudeBashApprovals = [
  /^Bash\(python3?:\*\)$/,
  /^Bash\(osascript:\*\)$/,
  /^Bash\(npm run:\*\)$/,
  /^Bash\(gh api:\*\)$/,
  /^Bash\(gh release(?: [^:)]*)?:\*\)$/,
  /^Bash\(git push:\*\)$/,
  /^Bash\(git tag:\*\)$/,
  /^Bash\(cat:\*\)$/,
  /^Bash\(chmod:\*\)$/,
  /^Bash\(node:\*\)$/,
  /^Bash\(npm ?:\*\)$/,
  /^Bash\(vitest ?:\*\)$/,
  /^Bash\(electron-builder ?:\*\)$/,
];

describe('Claude Code local permissions', () => {
  it('keeps the project auto-approval list intentionally small', () => {
    expect(allowList).toEqual(approvedAllowList);
  });

  it('does not auto-approve dangerous wildcard commands', () => {
    const dangerousAllowListEntries = allowList.filter((entry) =>
      dangerousClaudeBashApprovals.some((pattern) => pattern.test(entry))
    );

    expect(dangerousAllowListEntries).toEqual([]);
  });
});
