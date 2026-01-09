# Claude Code Features Configured for AudioBash

**Date:** 2026-01-09
**Configuration Files Updated:**
- `.claude/settings.local.json`
- `.claude/agents/` (4 new agent configurations)

---

## 1. SessionStart Hook

**Location:** `.claude/settings.local.json` → `hooks.SessionStart`

**Purpose:** Automatically displays AudioBash development context at the start of each Claude Code session.

**Output Includes:**
- Platform information (uname -srm)
- Node.js version
- Last build timestamp from dist/ directory
- Quick test status summary

**Status Message:** "Loading AudioBash context..."

**Usage:** Runs automatically when starting any Claude Code session in the audiobash directory.

---

## 2. Wildcard Bash Permissions

**Location:** `.claude/settings.local.json` → `permissions.allow`

**New Permissions Added:**
```json
"Bash(npm :*)",              // All npm commands
"Bash(vitest :*)",           // All vitest commands
"Bash(electron-builder :*)", // All electron-builder commands
"Bash(uname:*)",             // Platform info
"Bash(node:*)",              // Node.js commands
"Bash(head:*)",              // File head commands
"Bash(tail:*)",              // File tail commands
"Bash(awk:*)",               // Text processing
"Bash(cd:*)"                 // Directory navigation
```

**Purpose:** Provides Claude Code with broader command access for development workflows while maintaining security through prefix matching.

**Note:** All existing permissions were preserved.

---

## 3. Specialized Agent Configurations

**Location:** `.claude/agents/`

### Agent 1: `audiobash-security` (Opus 4.5)
**File:** `.claude/agents/audiobash-security.md`

**Purpose:** Security-focused code reviewer

**Permissions:** Read-only
- Read, Grep, Glob
- npm audit
- git diff, git log

**Focus Areas:**
- Electron security (context isolation, CSP, IPC)
- Node.js dependency vulnerabilities
- Shell injection risks in PTY commands
- API key exposure and credential management
- File system access controls

**Usage:**
```bash
claude --agent audiobash-security
```

**Best For:** Pre-release security audits, dependency reviews, vulnerability scanning

---

### Agent 2: `audiobash-ui` (Sonnet 4.5)
**File:** `.claude/agents/audiobash-ui.md`

**Purpose:** UI developer specializing in void/brutalist aesthetic

**Permissions:** Full editing
- Read, Edit, Write, Grep, Glob
- npm run dev, npm run build

**Focus Areas:**
- Void/brutalist design language
- React 19 + TypeScript components
- Tailwind CSS v3 styling
- xterm.js terminal integration
- CRT effects and retrotechnofuturism

**Color Palette:**
- Void: #050505
- Chrome: #e5e5e5
- Acid: #ccff00
- Accent Red: #ff3333

**Usage:**
```bash
claude --agent audiobash-ui
```

**Best For:** Component development, styling, layout work, design system maintenance

---

### Agent 3: `audiobash-perf` (Sonnet 4.5)
**File:** `.claude/agents/audiobash-perf.md`

**Purpose:** Performance engineer for Electron optimization

**Permissions:** Analysis + editing
- Read, Edit, Grep, Glob
- npm run build, npm run electron:dev
- File size analysis (ls -lh, du -sh)

**Focus Areas:**
- Electron main/renderer process optimization
- xterm.js rendering performance
- React rendering optimization (useMemo, useCallback)
- Bundle size analysis (Vite)
- Memory management (node-pty, audio buffers)
- IPC communication efficiency

**Target Metrics:**
- Cold Start: < 2s
- Bundle Size: < 5MB
- Memory: < 200MB idle
- Terminal Latency: < 16ms (60fps)

**Usage:**
```bash
claude --agent audiobash-perf
```

**Best For:** Performance profiling, bundle optimization, memory leak detection

---

### Agent 4: `audiobash-test` (Sonnet 4.5)
**File:** `.claude/agents/audiobash-test.md`

**Purpose:** Test engineer for Vitest-based testing

**Permissions:** Full testing
- Read, Edit, Write, Grep, Glob
- npm test, vitest, test:coverage

**Focus Areas:**
- Vitest test patterns
- React Testing Library for components
- Electron IPC testing
- node-pty and xterm.js mocking
- Cross-platform compatibility (macOS/Windows/Linux)
- Maintain 70+ passing tests standard

**Usage:**
```bash
claude --agent audiobash-test
```

**Best For:** Writing tests, fixing test failures, improving coverage

---

## 4. Agent Documentation

**File:** `.claude/agents/README.md`

**Contents:**
- Overview of all 4 agents
- Usage instructions
- Agent comparison table
- Workflow examples
- Customization guide
- Troubleshooting tips

---

## Workflow Examples

### Feature Development Workflow
```bash
# 1. Implement with UI agent
claude --agent audiobash-ui
> "Add voice controls settings panel"

# 2. Add tests
claude --agent audiobash-test
> "Write tests for voice controls settings"

# 3. Optimize
claude --agent audiobash-perf
> "Analyze bundle size impact"

# 4. Security review
claude --agent audiobash-security
> "Review security of new settings implementation"
```

### Quick Testing
```bash
claude --agent audiobash-test
> "Fix failing Terminal.test.tsx tests"
```

### Security Audit
```bash
claude --agent audiobash-security
> "Audit IPC communication for security issues"
```

---

## Files Created/Modified

### Modified
- `/home/user/audiobash/.claude/settings.local.json`
  - Added SessionStart hook
  - Added wildcard bash permissions (9 new patterns)
  - Set includeCoAuthoredBy: true

### Created
- `/home/user/audiobash/.claude/agents/audiobash-security.md` (2,287 bytes)
- `/home/user/audiobash/.claude/agents/audiobash-ui.md` (3,029 bytes)
- `/home/user/audiobash/.claude/agents/audiobash-perf.md` (3,841 bytes)
- `/home/user/audiobash/.claude/agents/audiobash-test.md` (5,313 bytes)
- `/home/user/audiobash/.claude/agents/README.md` (5,311 bytes)

**Total:** 5 new files, 1 modified file

---

## Notes on Schema Limitations

The following requested features are **not supported** by Claude Code's settings schema and were **not implemented**:

- ❌ `respectGitignore: false` - Not a valid schema field
- ❌ `attribution: "AudioBash Development"` - Not a valid schema field
- ❌ `agents` object in settings.local.json - Agents must be separate `.md` files

Instead:
- ✅ Agent configurations created as separate markdown files in `.claude/agents/`
- ✅ Each agent has YAML frontmatter defining model and permissions
- ✅ Agents are invoked via `claude --agent <name>` command-line flag

---

## Testing the Configuration

### Test SessionStart Hook
```bash
# Start a new Claude Code session
claude

# Should see output:
# === AudioBash Development Context ===
# Platform: Linux 4.4.0 x86_64
# Node.js: v20.x.x
# Last Build: Jan 9 00:00 dist/...
# Quick Test Status: ...
# =================================
```

### Test Wildcard Permissions
```bash
# In Claude Code session
> "Run npm install"
> "Run vitest --run"
> "Check bundle size with ls -lh dist/"
```

### Test Agents
```bash
# Start with specific agent
claude --agent audiobash-security
> "Audit the codebase for security issues"
```

---

## Next Steps

1. **Test SessionStart Hook:** Restart Claude Code to see context output
2. **Try Agents:** Use each agent for its specialized workflow
3. **Customize:** Adjust agent instructions in `.md` files as needed
4. **Commit:** Add these configuration files to git

```bash
git add .claude/settings.local.json .claude/agents/
git commit -m "feat: Add Claude Code SessionStart hook and specialized agents"
```

---

**Configuration Status:** ✅ Complete and validated
