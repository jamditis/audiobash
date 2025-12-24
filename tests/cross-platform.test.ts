/**
 * Tests for cross-platform compatibility in the main process code
 * Verifies the electron main process handles macOS correctly
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const rootDir = join(__dirname, '..');
const mainProcessCode = readFileSync(join(rootDir, 'electron', 'main.cjs'), 'utf8');

describe('shell detection', () => {
  it('uses platform-appropriate shell', () => {
    // Check that the code handles both Windows and Unix shells
    expect(mainProcessCode).toContain("process.platform === 'win32'");
    expect(mainProcessCode).toContain("'powershell.exe'");
    expect(mainProcessCode).toContain("process.env.SHELL || 'bash'");
  });

  it('selects correct shell per platform', () => {
    // The ternary should select PowerShell for Windows, $SHELL for others
    const shellLine = mainProcessCode.match(/const shell = .+/);
    expect(shellLine).toBeTruthy();
    expect(shellLine![0]).toContain("win32");
    expect(shellLine![0]).toContain("powershell");
    expect(shellLine![0]).toContain("SHELL");
  });
});

describe('icon handling', () => {
  it('uses ICO for Windows tray, PNG for other platforms', () => {
    // Should have platform-specific icon selection for tray
    expect(mainProcessCode).toContain("process.platform === 'win32'");
    expect(mainProcessCode).toContain("audiobash-logo.ico");
    expect(mainProcessCode).toContain("audiobash-logo.png");
  });

  it('has fallback icon paths', () => {
    // Should try multiple paths if icon fails to load
    expect(mainProcessCode).toContain("fallbackPaths");
    expect(mainProcessCode).toContain("process.resourcesPath");
    expect(mainProcessCode).toContain("app.getAppPath()");
  });
});

describe('macOS app lifecycle', () => {
  it('does not quit on window close for macOS', () => {
    // macOS apps typically stay running when all windows close
    expect(mainProcessCode).toContain("process.platform !== 'darwin'");
    expect(mainProcessCode).toContain("window-all-closed");
  });

  it('handles activate event for macOS dock click', () => {
    // Clicking dock icon should reopen window on macOS
    expect(mainProcessCode).toContain("'activate'");
    expect(mainProcessCode).toContain("BrowserWindow.getAllWindows()");
  });
});

describe('terminal context detection', () => {
  it('detects OS type for agent prompts', () => {
    // Agent needs to know the OS to generate correct commands
    expect(mainProcessCode).toContain("platform === 'win32'");
    expect(mainProcessCode).toContain("platform === 'darwin'");
    expect(mainProcessCode).toContain("'windows'");
    expect(mainProcessCode).toContain("'mac'");
    expect(mainProcessCode).toContain("'linux'");
  });

  it('returns shell type in context', () => {
    // Agent needs to know shell type (bash, zsh, powershell)
    expect(mainProcessCode).toContain("path.basename(shell)");
  });
});

describe('PTY configuration', () => {
  it('uses xterm-256color terminal type', () => {
    // Ensures color support works on all platforms
    expect(mainProcessCode).toContain("'xterm-256color'");
    expect(mainProcessCode).toContain("TERM: 'xterm-256color'");
  });

  it('starts in home directory', () => {
    expect(mainProcessCode).toContain("os.homedir()");
  });

  it('passes environment variables to shell', () => {
    expect(mainProcessCode).toContain("...process.env");
  });
});

describe('path handling', () => {
  it('uses path.join for cross-platform paths', () => {
    // path.join handles / vs \ automatically
    expect(mainProcessCode).toContain("path.join(");
    // Should not have hardcoded Windows paths
    expect(mainProcessCode).not.toMatch(/['"]\w:\\\\[^'"]+['"]/);
  });

  it('handles absolute path validation', () => {
    expect(mainProcessCode).toContain("path.isAbsolute");
  });
});

describe('working directory detection', () => {
  it('detects PowerShell prompts', () => {
    // PowerShell prompt format: PS C:\path>
    expect(mainProcessCode).toContain("PS");
  });

  it('detects Unix shell prompts', () => {
    // Bash/zsh prompts typically end with $ or #
    expect(mainProcessCode).toMatch(/\[\$#\]/);
  });
});

describe('preload script', () => {
  const preloadCode = readFileSync(join(rootDir, 'electron', 'preload.cjs'), 'utf8');

  it('uses contextBridge for secure IPC', () => {
    expect(preloadCode).toContain('contextBridge');
    expect(preloadCode).toContain('exposeInMainWorld');
  });

  it('exposes electron API to renderer', () => {
    // The API is exposed as 'electron' in this codebase
    expect(preloadCode).toMatch(/exposeInMainWorld\(['"]electron['"]/);
  });
});
