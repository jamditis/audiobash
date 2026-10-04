import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const settingsPath = join(__dirname, '..', '.claude', 'settings.local.json');
const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
  permissions?: { allow?: string[] };
  hooks?: Record<string, { hooks?: { type?: string; command?: string }[] }[]>;
};

const allowList = settings.permissions?.allow ?? [];

const dangerousClaudeBashApprovals = [
  /^Bash\(python3?:\*\)$/,
  /^Bash\(osascript:\*\)$/,
  /^Bash\(npm run(?: [^:)]*)?:\*\)$/,
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

// Hook commands run without approval, so they must not execute repository code.
const repositoryCodeRunners =
  /\b(?:npm|npx|pnpm|yarn|vitest|tsx|electron-builder)\b|\bnode\s+(?!--version\b)/;

describe('Claude Code local permissions', () => {
  it('does not auto-approve dangerous wildcard commands', () => {
    const dangerousAllowListEntries = allowList.filter((entry) =>
      dangerousClaudeBashApprovals.some((pattern) => pattern.test(entry)),
    );

    expect(dangerousAllowListEntries).toEqual([]);
  });

  it('does not run repository code from hooks', () => {
    const hookCommands = Object.values(settings.hooks ?? {})
      .flat()
      .flatMap((group) => group.hooks ?? [])
      .map((hook) => hook.command ?? '');

    expect(hookCommands.filter((command) => repositoryCodeRunners.test(command))).toEqual([]);
  });
});
