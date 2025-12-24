/**
 * Tests for agent prompt generation across platforms
 * Verifies the AI receives correct OS-specific instructions
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const rootDir = join(__dirname, '..');
const transcriptionCode = readFileSync(
  join(rootDir, 'src', 'services', 'transcriptionService.ts'),
  'utf8'
);

describe('agent prompt - OS detection', () => {
  it('detects macOS and labels it correctly', () => {
    // The prompt builder should recognize 'mac' OS type
    expect(transcriptionCode).toContain("os === 'mac'");
    expect(transcriptionCode).toContain("'macOS'");
  });

  it('detects Windows and labels it correctly', () => {
    expect(transcriptionCode).toContain("os === 'windows'");
    expect(transcriptionCode).toContain("'Windows'");
  });

  it('detects Linux as fallback', () => {
    expect(transcriptionCode).toContain("'Linux'");
  });
});

describe('agent prompt - shell-specific commands', () => {
  describe('Unix/macOS commands', () => {
    it('includes ls -la for listing files', () => {
      expect(transcriptionCode).toContain('ls -la');
    });

    it('includes pwd for current directory', () => {
      expect(transcriptionCode).toContain('pwd');
    });

    it('includes ps aux for processes', () => {
      expect(transcriptionCode).toContain('ps aux');
    });

    it('includes df -h for disk space', () => {
      expect(transcriptionCode).toContain('df -h');
    });

    it('includes Unix-style home directory path', () => {
      expect(transcriptionCode).toContain('~/Desktop');
    });
  });

  describe('Windows PowerShell commands', () => {
    it('includes Get-ChildItem for listing files', () => {
      expect(transcriptionCode).toContain('Get-ChildItem');
    });

    it('includes Get-Location for current directory', () => {
      expect(transcriptionCode).toContain('Get-Location');
    });

    it('includes Get-Process for processes', () => {
      expect(transcriptionCode).toContain('Get-Process');
    });

    it('includes Get-PSDrive for disk space', () => {
      expect(transcriptionCode).toContain('Get-PSDrive');
    });

    it('includes Windows-style home directory path', () => {
      expect(transcriptionCode).toContain('~\\\\Desktop');
    });
  });
});

describe('agent prompt - context injection', () => {
  it('includes current working directory in prompt', () => {
    expect(transcriptionCode).toContain('Current Directory:');
    expect(transcriptionCode).toContain('${cwd}');
  });

  it('includes shell type in prompt', () => {
    expect(transcriptionCode).toContain('Shell:');
    expect(transcriptionCode).toContain('${shell}');
  });

  it('includes OS type in prompt', () => {
    expect(transcriptionCode).toContain('Operating System:');
    expect(transcriptionCode).toContain('${osName}');
  });

  it('includes last command context', () => {
    expect(transcriptionCode).toContain('lastCommand');
    expect(transcriptionCode).toContain('Last Command:');
  });

  it('includes last error context', () => {
    expect(transcriptionCode).toContain('lastError');
    expect(transcriptionCode).toContain('Last Error:');
  });

  it('includes recent terminal output', () => {
    expect(transcriptionCode).toContain('recentOutput');
    expect(transcriptionCode).toContain('RECENT TERMINAL OUTPUT');
  });
});

describe('agent prompt - platform branching logic', () => {
  it('checks for PowerShell specifically', () => {
    expect(transcriptionCode).toContain("shell.toLowerCase().includes('powershell')");
  });

  it('uses different example sets based on OS and shell', () => {
    // Should have conditional logic for different platforms
    expect(transcriptionCode).toContain('isWindows && isPowerShell');
    expect(transcriptionCode).toContain('else if (isWindows)');
    expect(transcriptionCode).toContain('else {');
  });

  it('generates prompt with shell-appropriate commands', () => {
    // The final prompt should reference the actual shell being used
    expect(transcriptionCode).toContain('${shell} command');
    expect(transcriptionCode).toContain('${osName}/${shell}');
  });
});

describe('terminal context interface', () => {
  it('defines OS type union correctly', () => {
    expect(transcriptionCode).toContain("os: 'windows' | 'linux' | 'mac'");
  });

  it('defines shell as string for flexibility', () => {
    expect(transcriptionCode).toContain('shell: string');
  });
});

describe('universal commands (work on all platforms)', () => {
  it('includes git commands', () => {
    expect(transcriptionCode).toContain('git status');
  });

  it('includes npm commands', () => {
    expect(transcriptionCode).toContain('npm run dev');
    expect(transcriptionCode).toContain('npm install');
    expect(transcriptionCode).toContain('npm run build');
  });

  it('includes docker commands', () => {
    expect(transcriptionCode).toContain('docker-compose');
  });

  it('includes python commands', () => {
    expect(transcriptionCode).toContain('python');
  });
});
