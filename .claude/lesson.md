# Lessons Learned

Technical lessons from AudioBash development sessions.

---

## 2026-01-02: CLI Notification Detection

### Problem
Audio notification chimes were triggering when Claude Code or CLI tools were NOT requesting input - just mentioning words like "approve", "confirm", or "reject" in explanatory text.

### Root Cause
1. **Overly broad regex patterns** - `/approve|reject|confirm/i` matched ANY mention of these words
2. **Buffer accumulation** - 2000-char buffer kept old text, so stale matches kept triggering
3. **No positional awareness** - Real prompts appear at END of output; pattern matched anywhere

### Solution
```typescript
// Before: Too broad
/approve|reject|confirm/i

// After: End-anchored, specific format
/\[Y\/n\]\s*$/i  // Only match [Y/n] at END of output
```

Key changes in `src/utils/notificationSound.ts`:
1. **End-anchor patterns** with `\s*$/i` - prompts wait at end of output
2. **Clear buffer after match** - prevents re-triggering on same prompt
3. **Only check tail** - last 500 chars, not entire 2000-char buffer
4. **Strip ANSI codes** - clean pattern matching without terminal escape sequences

### Takeaway
When detecting interactive prompts in terminal output:
- Real prompts have specific formats (`[Y/n]`, `(yes/no)`)
- Real prompts appear at the END without trailing newline
- Buffer-based detection needs aggressive cleanup to avoid false positives

---

## 2026-01-02: electron-builder Auto-Publish Conflict

### Problem
GitHub Actions builds failed with:
```
GitHub Personal Access Token is not set, neither programmatically, nor using env "GH_TOKEN"
```

### Root Cause
When `electron-builder` detects a git tag (like `v2.0.1`), it automatically tries to publish to GitHub Releases. This conflicts with the workflow's own release step that uses `softprops/action-gh-release`.

### Solution
Add `--publish never` to all electron-builder commands in the workflow:

```yaml
# Before
run: npm run electron:build:win

# After
run: npm run electron:build:win -- --publish never
```

### Takeaway
When using GitHub Actions for releases:
- Disable electron-builder's auto-publish with `--publish never`
- Let the workflow handle artifact upload via dedicated release actions
- The `--` before `--publish` passes the flag through npm to electron-builder

---

## 2026-01-02: Cross-Platform Electron Builds

### Problem
Need to build Windows installer from macOS development machine.

### Options Considered
1. **Wine + mono** - Complex setup, fragile
2. **Docker** - Possible but tricky for GUI apps with native modules
3. **GitHub Actions** - Clean, uses native Windows runner

### Solution
Use GitHub Actions with `workflow_dispatch` for manual triggering:

```bash
gh workflow run build.yml --ref master \
  -f build_mac=false \
  -f build_windows=true
```

Then download artifact and upload to release:
```bash
gh run download [RUN_ID] -n windows-builds -D /tmp/
gh release upload vX.X.X "/tmp/windows-builds/AudioBash Setup X.X.X.exe"
```

### Takeaway
For cross-platform Electron apps:
- Build each platform on its native CI runner
- node-pty (native module) especially needs native compilation
- GitHub Actions workflow_dispatch allows on-demand builds without pushing a tag

---

## 2026-01-02: node-pty spawn-helper Permission Issue

### Problem
macOS packaged app would launch (processes visible in Activity Monitor) but window wouldn't appear. Terminal showed:
```
[PTY] Failed to spawn shell { tabId: 'tab-1', shell: '/bin/zsh' } Error: posix_spawnp failed.
```

### Root Cause
The `spawn-helper` binary in `node-pty/prebuilds/darwin-arm64/` was missing execute permissions (`-rw-r--r--` instead of `-rwxr-xr-x`).

This happens because:
1. **npm doesn't preserve executable bits** from prebuilt binaries
2. The `afterPack.cjs` script fixes this during electron-builder packaging
3. But local development and fresh `npm install` don't run afterPack

### Solution
1. **For local development**, manually fix permissions:
```bash
find node_modules/node-pty -name "spawn-helper" -exec chmod +x {} \;
```

2. **For packaged builds**, the `afterPack.cjs` script handles it:
```javascript
// scripts/afterPack.cjs
fs.chmodSync(spawnHelperPath, 0o755);
```

3. **Added stress tests** to catch this in CI:
```typescript
it('should have spawn-helper with execute permissions', () => {
  const stats = fs.statSync(spawnHelperPath);
  const isExecutable = (stats.mode & 0o111) !== 0;
  expect(isExecutable).toBe(true);
});
```

### Takeaway
- Native modules with helper binaries need permission fixes after npm install
- Always test the PACKAGED app, not just dev mode
- Add automated tests for native binary permissions
- The error `posix_spawnp failed` almost always means missing execute permission

---

## 2026-01-02: macOS Stress Testing

### Problem
Need comprehensive testing for macOS-specific functionality that automated unit tests can't cover.

### Solution
Created two-tier testing approach:

**1. Automated tests** (`tests/macos-stress.test.ts`):
- spawn-helper permission checks
- Rapid PTY spawn/destroy cycles (10 shells)
- Concurrent I/O stress
- Terminal resize during active sessions
- File descriptor leak detection
- Package structure validation
- afterPack hook verification

**2. Manual checklist** (`docs/MACOS_TESTING_CHECKLIST.md`):
- DMG installation flow
- Gatekeeper bypass workflow
- Microphone permission handling
- Global shortcuts
- Tray icon behavior
- Resource usage monitoring

### Key Tests Added
```typescript
// Rapid spawn/destroy
for (let i = 0; i < 10; i++) {
  const shell = pty.spawn('/bin/zsh', [], {...});
  shells.push(shell);
}
shells.forEach(shell => shell.kill());

// FD leak detection
const initialFDs = getOpenFDs();
// ... create/destroy shells ...
const leaked = finalFDs - initialFDs;
expect(leaked).toBeLessThan(50);
```

### Takeaway
- Electron apps need platform-specific stress tests
- Native modules (node-pty) are the most fragile part
- Test both dev mode AND packaged builds
- Create manual checklists for OS-level interactions (permissions, Gatekeeper)

---

## 2026-01-02: Cross-Platform Release Workflow

### Problem
Need to release AudioBash for Windows, macOS ARM64, and macOS Intel from a single Mac development machine.

### Challenge
- node-pty is a native module that must be compiled on each platform
- Can't cross-compile Windows binaries on macOS
- GitHub Actions tag-triggered builds conflict with manual release creation

### Solution
Use a hybrid local + CI approach:

1. **Build macOS locally** (native compilation works)
2. **Create GitHub release first** with macOS DMGs only
3. **Trigger Windows-only CI build** via `workflow_dispatch`
4. **Download artifact and upload** to existing release

```bash
# Create release with macOS builds first
gh release create v2.0.2 --title "v2.0.2" --notes "..." \
  "dist/AudioBash-2.0.2-arm64.dmg" \
  "dist/AudioBash-2.0.2.dmg"

# Trigger Windows-only build (skip mac/linux)
gh workflow run build.yml --ref master -f build_mac=false -f build_windows=true

# Wait, download, upload
gh run download [RUN_ID] -n windows-builds -D /tmp/
gh release upload v2.0.2 "/tmp/windows-builds/AudioBash Setup 2.0.2.exe"
```

### Key Commands
| Task | Command |
|------|---------|
| Check CI status | `gh run list --workflow=build.yml --limit 3` |
| Get run details | `gh run view [ID] --json status,conclusion` |
| Download artifact | `gh run download [ID] -n [NAME] -D /path` |
| Upload to release | `gh release upload vX.X.X "path/to/file"` |
| Update release notes | `gh release edit vX.X.X --notes "..."` |

### Takeaway
For native-module Electron apps:
- Build each platform where native compilation works (macOS on Mac, Windows on Windows runner)
- Use `workflow_dispatch` with platform flags for on-demand builds without tag conflicts
- Create release incrementally: macOS first, then add Windows after CI completes
- The `gh` CLI is essential for scripting this workflow

---

## Template for Future Lessons

```markdown
## YYYY-MM-DD: Brief Title

### Problem
What went wrong or what challenge was faced.

### Root Cause
Why it happened - the underlying issue.

### Solution
What was done to fix it, with code examples.

### Takeaway
The generalizable lesson for future situations.
```
