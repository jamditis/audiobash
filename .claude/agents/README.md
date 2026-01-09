# AudioBash Specialized Agents

This directory contains specialized Claude Code agent configurations for different AudioBash development workflows.

## Available Agents

### 1. `audiobash-security` (Opus 4.5)
Security-focused code reviewer for Electron and Node.js security.

**Usage:**
```bash
claude --agent audiobash-security
```

**Focus:**
- Electron security (context isolation, IPC, CSP)
- Dependency vulnerabilities
- Shell injection risks
- Credential exposure
- File system security

**Tools:** Read-only (Read, Grep, Glob, npm audit, git diff)

---

### 2. `audiobash-ui` (Sonnet 4.5)
UI developer specialized in void/brutalist aesthetic.

**Usage:**
```bash
claude --agent audiobash-ui
```

**Focus:**
- Void/brutalist design language
- React 19 + TypeScript components
- Tailwind CSS styling
- xterm.js integration
- CRT effects and retrotechnofuturism

**Tools:** Full editing (Read, Edit, Write, Grep, Glob, npm commands)

---

### 3. `audiobash-perf` (Sonnet 4.5)
Performance engineer for Electron optimization.

**Usage:**
```bash
claude --agent audiobash-perf
```

**Focus:**
- Electron process optimization
- xterm.js rendering performance
- React rendering optimization
- Bundle size analysis
- Memory management
- IPC efficiency

**Tools:** Analysis + editing (Read, Edit, Grep, Glob, npm build, file size analysis)

---

### 4. `audiobash-test` (Sonnet 4.5)
Test engineer for Vitest-based testing.

**Usage:**
```bash
claude --agent audiobash-test
```

**Focus:**
- Vitest test patterns
- React Testing Library
- Electron IPC testing
- Cross-platform compatibility
- 70+ test suite maintenance

**Tools:** Full testing (Read, Edit, Write, Grep, Glob, npm test, vitest)

---

## How to Use

### Start a Session with an Agent
```bash
# From the audiobash directory
claude --agent audiobash-security    # Security review
claude --agent audiobash-ui          # UI development
claude --agent audiobash-perf        # Performance optimization
claude --agent audiobash-test        # Test writing
```

### Switching Agents Mid-Session
Currently not supported - restart Claude Code with the desired agent.

### Agent Combinations
Use different agents for different phases:
1. **Feature Development**: `audiobash-ui` for implementation
2. **Testing**: `audiobash-test` for test coverage
3. **Performance**: `audiobash-perf` for optimization
4. **Security**: `audiobash-security` for final review

---

## Agent Capabilities

| Agent | Model | Write Access | Focus Area | Best For |
|-------|-------|--------------|------------|----------|
| security | Opus 4.5 | Read-only | Security review | Code audits, vulnerability scanning |
| ui | Sonnet 4.5 | Full | UI/UX development | Component building, styling, layout |
| perf | Sonnet 4.5 | Limited | Performance | Optimization, profiling, bundle analysis |
| test | Sonnet 4.5 | Full | Testing | Test writing, coverage, debugging tests |

---

## Customizing Agents

Each agent is defined in a markdown file with YAML frontmatter:

```markdown
---
model: claude-sonnet-4-5
permissions:
  allow:
    - "Read(*)"
    - "Edit(*)"
---

# Agent Instructions
Your specialized instructions here...
```

To modify an agent:
1. Edit the corresponding `.md` file
2. Adjust `model`, `permissions`, or instructions
3. Save and restart Claude Code

---

## Best Practices

### When to Use Which Agent

**Security Reviews:**
- Pre-release code audits
- Dependency updates
- IPC communication changes
- New feature security assessment

**UI Development:**
- New components
- Styling updates
- Layout changes
- Design system maintenance

**Performance Work:**
- Bundle size spikes
- Slow startup times
- High memory usage
- Terminal lag issues

**Testing:**
- New feature test coverage
- Test failures
- Coverage gaps
- Cross-platform testing

### Workflow Example

```bash
# 1. Implement feature with UI agent
claude --agent audiobash-ui
> "Add a new settings panel for voice controls"

# 2. Add tests with test agent
claude --agent audiobash-test
> "Write tests for the new voice controls settings"

# 3. Optimize with perf agent
claude --agent audiobash-perf
> "Analyze bundle size impact of new settings panel"

# 4. Security review before merge
claude --agent audiobash-security
> "Review security of voice controls settings implementation"
```

---

## SessionStart Hook

All agents benefit from the SessionStart hook configured in `settings.local.json`, which displays:
- Platform info
- Node.js version
- Last build timestamp
- Quick test status

This context helps agents understand the current development environment.

---

## Troubleshooting

### Agent Not Found
Ensure you're in the audiobash directory:
```bash
cd /home/user/audiobash
claude --agent audiobash-ui
```

### Permission Denied
Check that agent permissions in frontmatter match required operations.

### Agent Behavior Issues
Review agent instructions in the `.md` file and adjust as needed.

---

## Contributing

When creating new specialized agents:
1. Create a new `.md` file in this directory
2. Define frontmatter with model and permissions
3. Write clear, focused instructions
4. Update this README with the new agent
5. Test the agent workflow thoroughly

---

*For more information on Claude Code agents, see the [Claude Code documentation](https://docs.anthropic.com/claude-code).*
