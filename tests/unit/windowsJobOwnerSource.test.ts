// @vitest-environment node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const source = readFileSync(join(__dirname, '../../electron/windowsJobOwner.ps1'), 'utf8');
const launcherSource = readFileSync(
  join(__dirname, '../../electron/processTreeLauncher.cjs'),
  'utf8',
);
const settingsSource = readFileSync(join(__dirname, '../../src/components/Settings.tsx'), 'utf8');
const {
  WINDOWS_OWNER_CONTROLLER_TIMEOUT_MS,
  WINDOWS_OWNER_READY_TIMEOUT_MS,
  parseWindowsOwnerFrame,
} = require('../../electron/windowsOwnerProtocol.cjs') as {
  WINDOWS_OWNER_CONTROLLER_TIMEOUT_MS: number;
  WINDOWS_OWNER_READY_TIMEOUT_MS: number;
  parseWindowsOwnerFrame(
    line: string,
    context: { nonce: string; ownerPid: number; pipeState: string },
  ): Record<string, unknown>;
};
const nonce = 'a'.repeat(64);

describe('Windows Job owner source contract', () => {
  it('gives the launcher time to report a bounded cold-start failure before the controller', () => {
    expect(WINDOWS_OWNER_READY_TIMEOUT_MS).toBe(20_000);
    expect(WINDOWS_OWNER_CONTROLLER_TIMEOUT_MS).toBe(25_000);
    expect(WINDOWS_OWNER_CONTROLLER_TIMEOUT_MS).toBeGreaterThan(WINDOWS_OWNER_READY_TIMEOUT_MS);
    expect(launcherSource).toMatch(
      /ownerReadyTimer = setTimeout\([\s\S]*WINDOWS_OWNER_READY_TIMEOUT_MS,[\s\S]*\);/,
    );
    expect(launcherSource).toContain('const ownerStartupStartedAt = Date.now();');
    expect(launcherSource).toContain('after ${Date.now() - ownerStartupStartedAt} ms');

    const startSource = launcherSource.slice(
      launcherSource.indexOf('jobStatusServer.listen(pipePath'),
      launcherSource.indexOf('function startDirectTarget'),
    );
    const timerIndex = startSource.indexOf('ownerReadyTimer = setTimeout(');
    const commandResolutionIndex = startSource.indexOf('resolveWindowsCommand(');
    expect(timerIndex).toBeGreaterThanOrEqual(0);
    expect(commandResolutionIndex).toBeGreaterThanOrEqual(0);
    expect(timerIndex).toBeLessThan(commandResolutionIndex);
  });

  it('decodes launcher configuration as strict UTF-8', () => {
    expect(source).toContain('[Console]::OpenStandardInput()');
    expect(source).toContain('[System.Text.UTF8Encoding]::new($false, $true)');
    expect(source).toContain('[System.IO.StreamReader]::new(');
    expect(source).not.toContain('[Console]::In.Read');
  });

  it('keeps a write lease from the process launcher to its Electron parent', () => {
    expect(launcherSource).toContain('const PARENT_LEASE_INTERVAL_MS = 250;');
    expect(launcherSource).toContain("status.write('\\n')");
    expect(launcherSource).toContain('hold();\n  if (holdAfterTarget)');
  });

  it('does not signal a POSIX process group before ownership proof', () => {
    expect(launcherSource).toContain("else if (started && process.platform !== 'win32')");
  });

  it('stops the POSIX heartbeat before ending the status stream', () => {
    expect(launcherSource).toContain(
      'if (!holdAfterTarget && holdTimer) clearInterval(holdTimer);\n  const finishTarget',
    );
  });

  it('searches only Windows PATH entries for bare executables', () => {
    expect(launcherSource).toContain('for (const entry of pathEntries)');
    expect(launcherSource).toContain('.map((entry) => entry.trim().replace(/^"(.*)"$/, \'$1\'))');
    expect(launcherSource).toContain('.filter((entry) => entry.length > 0)');
    expect(launcherSource).not.toContain('[process.cwd(), ...pathEntries]');
    expect(launcherSource).not.toContain("const directory = (entry || '.').trim()");
  });

  it('accepts an authenticated startup error before Windows owner readiness', () => {
    const frame = { type: 'startup-error', nonce, message: 'CreateJobObjectW failed' };

    expect(
      parseWindowsOwnerFrame(JSON.stringify(frame), {
        nonce,
        ownerPid: 4321,
        pipeState: 'awaiting-owner',
      }),
    ).toEqual(frame);
  });

  it('accepts each exact frame in its valid owner state', () => {
    const cases = [
      {
        context: { nonce, ownerPid: 4321, pipeState: 'awaiting-owner' },
        frame: { type: 'owner-ready', nonce, ownerPid: 4321 },
      },
      {
        context: { nonce, ownerPid: 4321, pipeState: 'awaiting-target' },
        frame: { type: 'startup-error', nonce, message: 'ResumeThread failed' },
      },
      {
        context: { nonce, ownerPid: 4321, pipeState: 'awaiting-target' },
        frame: { type: 'target-result', nonce, code: 7, signal: null },
      },
    ];

    for (const { context, frame } of cases) {
      expect(parseWindowsOwnerFrame(JSON.stringify(frame), context)).toEqual(frame);
    }
  });

  it('rejects malformed, unauthenticated, oversized, or out-of-order owner frames', () => {
    const cases = [
      {
        context: { nonce, ownerPid: 4321, pipeState: 'awaiting-owner' },
        line: '{',
      },
      {
        context: { nonce, ownerPid: 4321, pipeState: 'awaiting-owner' },
        line: JSON.stringify({ type: 'owner-ready', nonce: 'b'.repeat(64), ownerPid: 4321 }),
      },
      {
        context: { nonce, ownerPid: 4321, pipeState: 'awaiting-owner' },
        line: JSON.stringify({ type: 'owner-ready', nonce, ownerPid: 4322 }),
      },
      {
        context: { nonce, ownerPid: 4321, pipeState: 'awaiting-owner' },
        line: JSON.stringify({ type: 'owner-ready', nonce, ownerPid: 4321, extra: true }),
      },
      {
        context: { nonce, ownerPid: 4321, pipeState: 'forwarding-owner' },
        line: JSON.stringify({ type: 'startup-error', nonce, message: 'too early' }),
      },
      {
        context: { nonce, ownerPid: 4321, pipeState: 'awaiting-target' },
        line: JSON.stringify({ type: 'startup-error', nonce, message: 'x'.repeat(513) }),
      },
      {
        context: { nonce, ownerPid: 4321, pipeState: 'awaiting-target' },
        line: JSON.stringify({ type: 'target-result', nonce, code: 0.5, signal: null }),
      },
      {
        context: { nonce, ownerPid: 4321, pipeState: 'awaiting-target' },
        line: JSON.stringify({ type: 'target-result', nonce, code: 0, signal: 'SIGTERM' }),
      },
    ];

    for (const { context, line } of cases) {
      expect(() => parseWindowsOwnerFrame(line, context)).toThrow();
    }
  });

  it('connects the authenticated owner pipe before native job preparation', () => {
    expect(source.indexOf('$pipe.Connect(5000)')).toBeGreaterThan(0);
    expect(source.indexOf('Add-Type -TypeDefinition')).toBeGreaterThan(0);
    expect(source.indexOf('$pipe.Connect(5000)')).toBeLessThan(
      source.indexOf('Add-Type -TypeDefinition'),
    );
  });

  it('bounds raw owner-pipe frame bytes before trimming', () => {
    expect(launcherSource).toContain("Buffer.byteLength(rawLine, 'utf8') > PIPE_FRAME_LIMIT_BYTES");
    expect(launcherSource).toContain('const line = rawLine.trim();');
  });
});

describe('local Whisper setup source contract', () => {
  it('states that one-click setup does not install FFmpeg', () => {
    expect(settingsSource).toContain(
      'Requires FFmpeg on PATH. Setup downloads Whisper.cpp and the selected model.',
    );
  });
});
