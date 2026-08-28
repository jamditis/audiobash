import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const { compareVersions, validateToolchain } = require('../../scripts/verify-toolchain.cjs') as {
  compareVersions: (left: string, right: string) => number;
  validateToolchain: (options: {
    nodeVersion: string;
    npmVersion: string;
    requiredNodeVersion: string;
    requiredNpmVersion: string;
  }) => string[];
};

describe('toolchain version comparison', () => {
  it.each([
    ['22.11.0', '22.12.0', -1],
    ['v22.12.0', '22.12.0', 0],
    ['22.17.1', '22.12.0', 1],
    ['23.0.0', '22.12.0', 1],
  ] as const)('compares %s with %s', (left, right, expectedSign) => {
    expect(Math.sign(compareVersions(left, right))).toBe(expectedSign);
  });

  it.each(['22.12.0', '22.13.0', '22.17.0', '23.0.0', '24.0.0'])(
    'rejects untested Node %s',
    (nodeVersion) => {
      expect(
        validateToolchain({
          nodeVersion,
          npmVersion: '10.9.2',
          requiredNodeVersion: '22.17.1',
          requiredNpmVersion: '10.9.2',
        }),
      ).toEqual([`Node ${nodeVersion} does not match required version 22.17.1.`]);
    },
  );

  it('rejects Node below the dependency floor', () => {
    expect(
      validateToolchain({
        nodeVersion: '22.11.0',
        npmVersion: '10.9.2',
        requiredNodeVersion: '22.17.1',
        requiredNpmVersion: '10.9.2',
      }),
    ).toEqual(['Node 22.11.0 does not match required version 22.17.1.']);
  });

  it.each(['10.9.1', '10.9.3', '11.0.0'])('rejects npm %s', (npmVersion) => {
    expect(
      validateToolchain({
        nodeVersion: '22.17.1',
        npmVersion,
        requiredNodeVersion: '22.17.1',
        requiredNpmVersion: '10.9.2',
      }),
    ).toEqual([`npm ${npmVersion} does not match required version 10.9.2.`]);
  });

  it('accepts the tested toolchain', () => {
    expect(
      validateToolchain({
        nodeVersion: 'v22.17.1',
        npmVersion: '10.9.2',
        requiredNodeVersion: '22.17.1',
        requiredNpmVersion: '10.9.2',
      }),
    ).toEqual([]);
  });

  it('rejects invalid version text', () => {
    expect(() => compareVersions('22.17', '22.12.0')).toThrow(/Invalid semantic version/);
  });
});
