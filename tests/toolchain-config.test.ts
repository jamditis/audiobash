import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const rootDir = join(__dirname, '..');
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const packageLock = JSON.parse(readFileSync(join(rootDir, 'package-lock.json'), 'utf8'));
const ciWorkflow = readFileSync(join(rootDir, '.github/workflows/ci.yml'), 'utf8');
const buildWorkflow = readFileSync(join(rootDir, '.github/workflows/build.yml'), 'utf8');

function occurrenceIndexes(text: string, value: string): number[] {
  const indexes: number[] = [];
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const index = text.indexOf(value, searchFrom);
    if (index === -1) break;

    indexes.push(index);
    searchFrom = index + value.length;
  }

  return indexes;
}

function expectWorkflowToolchain(workflow: string, jobCount: number): void {
  expect(occurrenceIndexes(workflow, "node-version-file: '.nvmrc'")).toHaveLength(jobCount);
  expect(workflow).not.toMatch(/node-version:\s*['"]?20/);

  const pinIndexes = occurrenceIndexes(workflow, 'npm install --global npm@10.9.2');
  const verifyIndexes = occurrenceIndexes(workflow, 'npm run verify:toolchain');
  const installIndexes = occurrenceIndexes(workflow, 'npm ci');

  expect(pinIndexes).toHaveLength(jobCount);
  expect(verifyIndexes).toHaveLength(jobCount);
  expect(installIndexes).toHaveLength(jobCount);

  for (let jobIndex = 0; jobIndex < jobCount; jobIndex += 1) {
    expect(pinIndexes[jobIndex]).toBeLessThan(verifyIndexes[jobIndex]);
    expect(verifyIndexes[jobIndex]).toBeLessThan(installIndexes[jobIndex]);
  }
}

describe('toolchain contract', () => {
  it('records the tested Node and npm versions', () => {
    const nvmrcPath = join(rootDir, '.nvmrc');

    expect(existsSync(nvmrcPath)).toBe(true);
    expect(readFileSync(nvmrcPath, 'utf8').trim()).toBe('22.17.1');
    expect(packageJson.engines).toEqual({ node: '>=22.13.0 <23' });
    expect(packageJson.packageManager).toBe('npm@10.9.2');
    expect(packageJson.scripts['verify:toolchain']).toBe('node scripts/verify-toolchain.cjs');
    expect(packageLock.packages[''].engines).toEqual({ node: '>=22.13.0 <23' });
  });

  it('enforces the same toolchain before every CI install', () => {
    expectWorkflowToolchain(ciWorkflow, 2);
    expectWorkflowToolchain(buildWorkflow, 4);
  });

  it('runs the complete focused process lifecycle gate on both CI platforms', () => {
    const sharedLifecycleTests = [
      'tests/unit/processTree.test.ts',
      'tests/unit/windowsJobOwnerSource.test.ts',
      'tests/unit/transcriptionJob.test.ts',
      'tests/unit/appShutdown.test.ts',
      'tests/unit/whisperService.test.ts',
      'tests/unit/localWhisperHandlers.test.ts',
      'tests/unit/transcriptionService.test.ts',
      'tests/startup-crash.test.ts',
    ];

    for (const testPath of sharedLifecycleTests) {
      expect(occurrenceIndexes(ciWorkflow, testPath), testPath).toHaveLength(2);
    }
    expect(
      occurrenceIndexes(ciWorkflow, 'tests/integration/processTree.macos.test.ts'),
    ).toHaveLength(1);
    expect(
      occurrenceIndexes(ciWorkflow, 'tests/integration/processTree.windows.test.ts'),
    ).toHaveLength(1);
  });

  it('smoke-tests the physical Windows package helper before artifact upload', () => {
    const windowsBuild = buildWorkflow.indexOf('- name: Build Windows');
    const packageProbe = buildWorkflow.indexOf('- name: Smoke-test packaged Windows process owner');
    const windowsUpload = buildWorkflow.indexOf('- name: Upload exact Windows artifact');

    expect(windowsBuild).toBeGreaterThan(-1);
    expect(packageProbe).toBeGreaterThan(windowsBuild);
    expect(windowsUpload).toBeGreaterThan(packageProbe);
    expect(buildWorkflow.slice(packageProbe, windowsUpload)).toContain(
      'run: npm run test:package:win',
    );
  });

  it('passes the real local toolchain check', () => {
    const npmExecPath = process.env.npm_execpath;
    expect(npmExecPath).toBeTruthy();

    expect(() =>
      execFileSync(process.execPath, [npmExecPath!, 'run', 'verify:toolchain'], {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('has a valid installed dependency tree', () => {
    const npmExecPath = process.env.npm_execpath;
    expect(npmExecPath).toBeTruthy();

    expect(() =>
      execFileSync(process.execPath, [npmExecPath!, 'ls', '--all', '--json'], {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('has a valid minimatch and brace expansion dependency tree', () => {
    const npmExecPath = process.env.npm_execpath;
    expect(npmExecPath).toBeTruthy();

    expect(() =>
      execFileSync(
        process.execPath,
        [npmExecPath!, 'ls', 'brace-expansion', 'minimatch', '--all'],
        {
          cwd: rootDir,
          encoding: 'utf8',
          stdio: 'pipe',
        },
      ),
    ).not.toThrow();
  });
});

describe('dependency cooldown policy', () => {
  it('uses the reviewed cooldown for npm and GitHub Actions updates', () => {
    const dependabotPath = join(rootDir, '.github/dependabot.yml');

    expect(existsSync(dependabotPath)).toBe(true);
    const dependabotConfig = readFileSync(dependabotPath, 'utf8');

    expect(occurrenceIndexes(dependabotConfig, 'package-ecosystem: npm')).toHaveLength(1);
    expect(occurrenceIndexes(dependabotConfig, 'package-ecosystem: github-actions')).toHaveLength(
      1,
    );
    expect(occurrenceIndexes(dependabotConfig, 'default-days: 3')).toHaveLength(2);
    expect(occurrenceIndexes(dependabotConfig, 'semver-major-days: 30')).toHaveLength(2);
    expect(occurrenceIndexes(dependabotConfig, 'semver-minor-days: 7')).toHaveLength(2);
    expect(occurrenceIndexes(dependabotConfig, 'semver-patch-days: 3')).toHaveLength(2);
  });
});

describe('first dependency update group', () => {
  const expectedDevDependencies = {
    '@vitest/coverage-v8': '4.1.11',
    concurrently: '9.2.4',
    'electron-builder': '26.15.3',
    postcss: '8.5.26',
    vite: '6.4.3',
    vitest: '4.1.11',
  };
  const expectedOverrides = {
    '@babel/core': '7.29.7',
    '@noble/hashes@>=2.0.0 <2.4.0': '2.3.0',
    axios: '1.18.0',
    'baseline-browser-mapping': '2.11.19',
    'brace-expansion@>=1.0.0 <1.1.18': '1.1.18',
    'brace-expansion@>=5.0.0 <5.0.9': '5.0.9',
    browserslist: '4.28.8',
    'caniuse-lite': '1.0.30001810',
    'electron-to-chromium': '1.5.413',
    'follow-redirects': '1.16.0',
    'form-data': '4.0.6',
    joi: '18.2.1',
    'js-yaml': '4.3.1',
    lodash: '4.18.1',
    'node-abi': '4.33.0',
    'node-releases': '2.0.53',
    'minimatch@<3.1.4': '3.1.4',
    'picomatch@<2.3.2': '2.3.2',
    'picomatch@>=4.0.0 <4.0.4': '4.0.4',
    protobufjs: '7.6.5',
    readdirp: {
      picomatch: '2.3.2',
    },
    rollup: '4.59.0',
    'update-browserslist-db': '1.3.1',
    ws: '8.21.0',
  };

  it('pins the reviewed tools to exact versions', () => {
    for (const [dependency, version] of Object.entries(expectedDevDependencies)) {
      expect(packageJson.devDependencies[dependency], dependency).toBe(version);
      expect(packageLock.packages[''].devDependencies[dependency], dependency).toBe(version);
    }
  });

  it('uses the cooled protobufjs repair and selected Electron release', () => {
    expect(packageJson.overrides.protobufjs).toBe('7.6.5');
    expect(packageJson.devDependencies.electron).toBe('43.4.1');
  });

  it('forces the reviewed transitive security repairs', () => {
    expect(packageJson.overrides).toEqual(expectedOverrides);
  });

  it('keeps each noble hashes consumer on its compatible major line', () => {
    expect(packageLock.packages['node_modules/@noble/hashes'].version).toBe('2.3.0');
    expect(packageLock.packages['node_modules/pkijs/node_modules/@noble/hashes'].version).toBe(
      '1.4.0',
    );
  });

  it('locks the cooled Browserslist data set', () => {
    expect(packageLock.packages['node_modules/browserslist'].version).toBe('4.28.8');
    expect(packageLock.packages['node_modules/caniuse-lite'].version).toBe('1.0.30001810');
    expect(packageLock.packages['node_modules/update-browserslist-db'].version).toBe('1.3.1');
  });
});
