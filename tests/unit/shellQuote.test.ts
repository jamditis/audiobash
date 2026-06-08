import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';

// Load the CommonJS module exactly as Node/Electron does, so the test exercises the real
// module.exports the main process consumes (no vite ESM-interop ambiguity).
const require = createRequire(import.meta.url);
const { getDefaultShell, buildCdCommand } = require('../../electron/shellQuote.cjs');

describe('buildCdCommand', () => {
  describe('PowerShell', () => {
    it('quotes a plain Windows path with Set-Location -LiteralPath', () => {
      const { command, error } = buildCdCommand('powershell.exe', 'C:\\Users\\Joe');
      expect(error).toBeUndefined();
      expect(command).toBe("Set-Location -LiteralPath 'C:\\Users\\Joe'");
    });

    it('doubles an embedded single quote (PowerShell escape)', () => {
      const { command } = buildCdCommand('powershell.exe', "C:\\Users\\O'Brien");
      expect(command).toBe("Set-Location -LiteralPath 'C:\\Users\\O''Brien'");
    });

    it('neutralizes an injection attempt by keeping it inside the literal string', () => {
      const malicious = "C:\\x'; Remove-Item -Recurse -Force C:\\ #";
      const { command } = buildCdCommand('powershell.exe', malicious);
      // The lone quote is doubled, so the payload stays a literal argument and cannot break out.
      expect(command).toBe(
        "Set-Location -LiteralPath 'C:\\x''; Remove-Item -Recurse -Force C:\\ #'",
      );
    });

    it('matches pwsh (PowerShell Core) by basename', () => {
      const { command } = buildCdCommand('/usr/local/bin/pwsh', '/home/joe');
      expect(command).toBe("Set-Location -LiteralPath '/home/joe'");
    });
  });

  describe('POSIX shells', () => {
    it('single-quotes a plain Unix path with cd', () => {
      const { command, error } = buildCdCommand('/bin/bash', '/home/joe');
      expect(error).toBeUndefined();
      expect(command).toBe("cd '/home/joe'");
    });

    it("escapes an embedded single quote with '\\'' ", () => {
      const { command } = buildCdCommand('/bin/zsh', "/home/o'brien");
      expect(command).toBe("cd '/home/o'\\''brien'");
    });

    it('neutralizes an injection attempt by escaping the quote', () => {
      const malicious = "/tmp'; rm -rf ~ #";
      const { command } = buildCdCommand('/bin/bash', malicious);
      expect(command).toBe("cd '/tmp'\\''; rm -rf ~ #'");
    });

    it('treats fish as a POSIX-style single-quoting shell', () => {
      const { command } = buildCdCommand('/usr/bin/fish', '/home/joe');
      expect(command).toBe("cd '/home/joe'");
    });

    it('falls back to POSIX quoting for an unknown/empty shell', () => {
      expect(buildCdCommand('', '/home/joe').command).toBe("cd '/home/joe'");
      expect(buildCdCommand(undefined, '/home/joe').command).toBe("cd '/home/joe'");
    });

    it('leaves $, &, and spaces literal inside single quotes', () => {
      const { command } = buildCdCommand('/bin/bash', '/home/joe/$PATH & co');
      expect(command).toBe("cd '/home/joe/$PATH & co'");
    });
  });

  describe('cmd.exe', () => {
    it('allows a plain path with cd /d and double quotes', () => {
      const { command, error } = buildCdCommand('cmd.exe', 'C:\\Users\\Joe');
      expect(error).toBeUndefined();
      expect(command).toBe('cd /d "C:\\Users\\Joe"');
    });

    it('allows characters that are literal inside double quotes (e.g. Program Files (x86))', () => {
      // ( ) & $ ^ ; ' are command metacharacters only OUTSIDE quotes; inside cd /d "..." they are
      // literal and appear in real Windows paths, so they must not be rejected.
      for (const dir of [
        'C:\\Program Files (x86)\\App',
        'C:\\Rock & Roll',
        'C:\\$Recycle.Bin',
        'C:\\a^b',
        "C:\\a'b",
      ]) {
        const { command, error } = buildCdCommand('cmd.exe', dir);
        expect(error).toBeUndefined();
        expect(command).toBe(`cd /d "${dir}"`);
      }
    });

    it('rejects characters that stay dangerous inside double quotes', () => {
      // % (env expansion), ! (delayed expansion), a literal quote (breaks out), CR/LF (ends the line).
      for (const dir of ['C:\\a%TEMP%b', 'C:\\a!b!', 'C:\\a"b', 'C:\\a\r\nb']) {
        const { command, error } = buildCdCommand('cmd.exe', dir);
        expect(command).toBeUndefined();
        expect(error).toMatch(/unsupported by cmd\.exe/);
      }
    });
  });
});

describe('getDefaultShell', () => {
  const originalPlatform = process.platform;
  const originalShell = process.env.SHELL;

  const setPlatform = (value: string) => {
    Object.defineProperty(process, 'platform', { value, configurable: true });
  };

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    if (originalShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = originalShell;
  });

  it('returns powershell.exe on Windows', () => {
    setPlatform('win32');
    expect(getDefaultShell()).toBe('powershell.exe');
  });

  it('honors $SHELL on macOS/Linux', () => {
    setPlatform('darwin');
    process.env.SHELL = '/bin/zsh';
    expect(getDefaultShell()).toBe('/bin/zsh');
  });

  it('falls back to bash when $SHELL is unset on POSIX', () => {
    setPlatform('linux');
    delete process.env.SHELL;
    expect(getDefaultShell()).toBe('bash');
  });
});
