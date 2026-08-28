import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, extname, join } from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { ESLint } from 'eslint';
import { afterEach, describe, expect, it } from 'vitest';

const rootDir = join(__dirname, '../..');
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const warningBudget = 34;
const lintableRootExtensions = new Set(['.cjs', '.js', '.jsx', '.json', '.mjs', '.ts', '.tsx']);
let fixtureDirectory: string | null = null;

function isCopyableLintInput(relativePath: string) {
  const hasLintInputType =
    relativePath === 'package.json' || lintableRootExtensions.has(extname(relativePath));
  const sourcePath = join(rootDir, relativePath);
  if (!hasLintInputType || !existsSync(sourcePath)) return false;

  const source = lstatSync(sourcePath);
  return source.isFile() || source.isSymbolicLink();
}

function formatWarningCount(count: number) {
  return `${count} ${count === 1 ? 'warning' : 'warnings'}`;
}

function createIsolatedLintWorkspace() {
  fixtureDirectory = mkdtempSync(join(tmpdir(), 'audiobash-lint-budget-'));
  const workspace = join(fixtureDirectory, 'repo');
  mkdirSync(workspace);

  const lintInputs = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: rootDir, encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean)
    .filter(isCopyableLintInput);

  for (const relativePath of lintInputs) {
    const destination = join(workspace, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(rootDir, relativePath), destination);
  }

  symlinkSync(
    join(rootDir, 'node_modules'),
    join(workspace, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  return workspace;
}

afterEach(() => {
  if (fixtureDirectory) {
    rmSync(fixtureDirectory, { recursive: true });
    fixtureDirectory = null;
  }
});

describe('ESLint warning budget', () => {
  it('uses the measured warning count in the normal lint command', () => {
    expect(packageJson.scripts.lint).toBe(`eslint . --max-warnings ${warningBudget}`);
    expect(packageJson.scripts['lint:fix']).toBe(`eslint . --fix --max-warnings ${warningBudget}`);
    expect(formatWarningCount(1)).toBe('1 warning');
  });

  it('excludes local evidence and nested worktrees from normal lint', async () => {
    const eslint = new ESLint({ cwd: rootDir });

    await expect(eslint.isPathIgnored(join(rootDir, '.audit/probe.cjs'))).resolves.toBe(true);
    await expect(
      eslint.isPathIgnored(join(rootDir, '.worktrees/review/src/probe.ts')),
    ).resolves.toBe(true);
  });

  it('skips a Git path that is absent from the working tree', () => {
    expect(isCopyableLintInput('missing-from-working-tree.ts')).toBe(false);
    expect(isCopyableLintInput('package.json')).toBe(true);
    expect(isCopyableLintInput('src/App.tsx')).toBe(true);
  });

  it('fails when one warning is added to the measured baseline', () => {
    const workspace = createIsolatedLintWorkspace();
    writeFileSync(join(workspace, 'added-warning.ts'), 'const addedWarning = true;\n');
    const npmExecPath = process.env.npm_execpath;
    const runsNpmCliScript =
      typeof npmExecPath === 'string' && /npm-cli\.[cm]?js$/.test(npmExecPath);
    const npmCommand = runsNpmCliScript
      ? process.execPath
      : process.platform === 'win32'
        ? 'npm.cmd'
        : 'npm';
    const npmArgs = runsNpmCliScript ? [npmExecPath!, 'run', 'lint'] : ['run', 'lint'];

    const result = spawnSync(npmCommand, npmArgs, {
      cwd: workspace,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
      shell: !runsNpmCliScript && process.platform === 'win32',
      timeout: 30_000,
    });
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(output).toContain(formatWarningCount(warningBudget + 1));
    expect(output).toContain(`ESLint found too many warnings (maximum: ${warningBudget})`);
  });
});
