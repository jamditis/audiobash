// Shell selection and safe "change directory" command construction.
//
// Extracted from main.cjs so the security-critical quoting logic can be unit-tested in isolation:
// a regression here is a command-injection hole. These functions are pure (only `path` and
// `process` are used) and have no Electron dependencies.

const path = require('path');

// Single source of truth for which shell a PTY runs. spawnShell() and the cd-to-directory handler
// both use this, so the quoting strategy can never drift from the shell that was actually spawned.
function getDefaultShell() {
  return process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';
}

// Build a safe "change directory" command line for a specific shell. The path is quoted so its
// contents can never be parsed as shell syntax; quoting rules differ per shell, so the caller
// passes the shell the PTY was actually spawned with rather than inferring it from process.platform.
// Returns { command } on success or { error } when the shell has no safe quoting for the path.
function buildCdCommand(shell, dir) {
  const name = path.basename(String(shell || '')).toLowerCase();

  // PowerShell / PowerShell Core: single-quoted strings are literal; an embedded quote is doubled.
  // -LiteralPath disables wildcard expansion so [], *, ? in the path stay literal.
  if (name.includes('powershell') || name === 'pwsh' || name === 'pwsh.exe') {
    return { command: `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'` };
  }

  // cmd.exe: wrap the path in double quotes (cd /d "..."). Inside double quotes, command
  // metacharacters (& | < > ^ ; ( ) $ `) are literal, so paths like "C:\Program Files (x86)\App"
  // are safe. The characters that remain dangerous inside quotes are: % (environment expansion),
  // ! (delayed expansion), a literal double quote (breaks out of the quoting), and CR/LF (would
  // terminate the command line). Reject only those.
  if (name === 'cmd' || name === 'cmd.exe') {
    if (/["%!\r\n]/.test(dir)) {
      return { error: 'Directory path contains characters unsupported by cmd.exe' };
    }
    return { command: `cd /d "${dir}"` };
  }

  // POSIX shells (bash, zsh, sh, dash, ksh, fish, ...): single-quoted strings are literal; an
  // embedded quote is closed, escaped, and reopened ('\'').
  return { command: `cd '${dir.replace(/'/g, "'\\''")}'` };
}

module.exports = { getDefaultShell, buildCdCommand };
