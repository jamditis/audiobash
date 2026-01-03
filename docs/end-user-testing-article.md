# How I Learned to Break My Own App (And Why You Should Too)

*A practical guide to end-user testing with Claude Code*

---

So you've built something. It works on your machine. Tests pass. CI is green. Ship it, right?

Not so fast.

I just finished stress-testing [AudioBash](https://github.com/jamditis/audiobash), an Electron app for voice-controlled terminal sessions. Everything looked solid until I started pretending to be my least tech-savvy family member. That's when things got interesting.

## The Philosophy: Think Like Someone Who Doesn't Think Like You

Here's the thing about developers: we use software *correctly*. We click buttons once. We wait for things to load. We read error messages.

Regular users? They'll double-click everything, paste 50KB of text into a single field, resize your window to 100x100 pixels, and then force-quit when it doesn't respond instantly. And honestly? That's valuable data.

The goal isn't to blame users - it's to build software that survives contact with reality.

## What I Actually Tested

For AudioBash, I ran through scenarios that seem absurd until you realize someone *will* do them:

### The Impatient Double-Click
```bash
# User opens app, nothing happens (they think), clicks again... and again
open "App.app"
open "App.app"
open "App.app"
```
Does your app handle this? AudioBash uses Electron's `app.requestSingleInstanceLock()` to ensure only one instance runs. The second/third launches just focus the existing window.

### The Giant Paste
```bash
# User copies their entire server log and pastes it
python3 -c "print('X' * 50000)" | pbcopy
# Then Cmd+V
```
50,000 characters. Does your input field survive? Does the UI freeze? Does the app crash? AudioBash handled this fine, but I've seen apps completely lock up.

### The Window Torturer
```bash
# Resize to something ridiculous
osascript -e 'tell application "System Events" to tell process "MyApp" to set size of window 1 to {100, 100}'
# Then blow it up
osascript -e 'tell application "System Events" to tell process "MyApp" to set size of window 1 to {2500, 1600}'
```
Responsive design doesn't mean "pretty at 1920x1080". It means "doesn't explode at any size."

### The Force Quit Recovery
This one caught me. After force-quitting AudioBash (`pkill -9`), the app wouldn't relaunch. Silent failure. No error. Just... nothing.

Turns out Electron's singleton lock files were left behind in `~/Library/Application Support/audiobash/`. The app saw the lock, assumed another instance was running, and exited quietly.

The fix? Electron actually handles this automatically by detecting stale locks. But knowing *why* it happens is crucial for debugging.

## The Testing Checklist I Now Use

After this experience, I formalized my approach. Here's the framework:

### 1. Installation & First Run
- Can it run from a DMG without installing?
- What happens with Gatekeeper/quarantine?
- Does it need special permissions? Does it ask nicely?

### 2. Concurrency Chaos
- Multi-instance prevention
- Tab spam (Cmd+T × 20)
- Rapid open/close cycles

### 3. Input Abuse
- Huge pastes (10KB, 50KB, 200KB)
- Special characters (emoji, unicode, RTL text)
- Rapid keypress spam

### 4. Window Manipulation
- Extreme resize (tiny and huge)
- Minimize/restore cycles
- Multi-monitor edge cases

### 5. Recovery
- Force quit and relaunch
- Network disconnect/reconnect
- Sleep/wake cycles

### 6. Resource Exhaustion
- Memory usage over time
- File descriptor leaks (for apps with sockets/streams)
- CPU when idle

## Automating the Boring Parts

I wrote a test script that runs through the basics automatically:

```bash
#!/bin/bash
# Quick sanity check

APP_PATH="${1:-dist/mac-arm64/MyApp.app}"
PASSED=0
FAILED=0

test_result() {
    if [ $1 -eq 0 ]; then
        echo "✅ $2"
        ((PASSED++))
    else
        echo "❌ $2"
        ((FAILED++))
    fi
}

# Test 1: Does it launch?
open "$APP_PATH"
sleep 4
pgrep MyApp > /dev/null
test_result $? "Basic launch"

# Test 2: Single instance?
open "$APP_PATH"
open "$APP_PATH"
sleep 2
COUNT=$(pgrep MyApp | wc -l | tr -d ' ')
[ "$COUNT" -le 5 ]  # Adjust for your process count
test_result $? "Single instance enforced"

# Test 3: Survives large paste?
python3 -c "print('X' * 50000)" | pbcopy
osascript -e 'tell application "System Events" to keystroke "v" using command down'
sleep 2
pgrep MyApp > /dev/null
test_result $? "Survives large paste"

# Cleanup
pkill MyApp 2>/dev/null

echo ""
echo "Passed: $PASSED"
echo "Failed: $FAILED"
```

Not comprehensive, but catches the obvious stuff before you embarrass yourself.

## For Claude Code Users: The Skills I Made

If you're using Claude Code and want to adopt this testing approach, I've created skill files you can use:

### General End-User Testing Skill

Drop this in `~/.claude/skills/end-user-testing.md` to have Claude Code help you stress-test any app:

```markdown
# End-User Testing Skill

Invoke with: "Run end-user tests on [app]" or "Stress test [app] like a non-technical user"

## Test Categories

### 1. Installation & First Run
- Run from DMG/installer without full installation
- Handle Gatekeeper/SmartScreen prompts
- Missing dependency behavior

### 2. Concurrency & Multi-Instance
- Double-click/triple-click launch
- Multiple windows/tabs rapidly
- Singleton enforcement

### 3. Input Stress
- 50KB+ paste operations
- Unicode/emoji/special characters
- Rapid keystroke spam

### 4. Window Torture
- Extreme resize (100x100 to 2500x1600)
- Rapid minimize/restore
- Hide/show cycling

### 5. Quit & Recovery
- Force quit (kill -9)
- Stale lock file recovery
- Crash log detection

### 6. Resource Monitoring
- Memory growth over time
- File descriptor leaks
- CPU usage when idle

## Automated Test Template
[Include your test script here]
```

### App-Specific Skills

For individual apps, create `.claude/skills/user-testing.md` in your project with app-specific tests:

```markdown
# [AppName] End-User Testing

## Quick Test Suite
[App-specific commands]

## Known Edge Cases
[Document what you've found]

## Pre-Release Checklist
[ ] Launch test
[ ] Single instance
[ ] Input stress
[ ] Window resize
[ ] Force quit recovery
[ ] No crash logs
```

## The Insight

`★ Insight ─────────────────────────────────────`
The best bugs are found by the people least qualified to find them. Your QA team thinks like developers. Your beta testers try to be helpful. But Aunt Martha? She'll resize your window while pasting her entire email inbox and wonder why it's slow.

Build for Aunt Martha.
`─────────────────────────────────────────────────`

## Resources

- **AudioBash test script**: [scripts/user-test.sh](https://github.com/jamditis/audiobash/blob/master/scripts/user-test.sh)
- **AudioBash testing skill**: [.claude/skills/user-testing.md](https://github.com/jamditis/audiobash/blob/master/.claude/skills/user-testing.md)
- **General testing framework**: See above or ask Claude Code to help you create one

---

*Built with Claude Code. Tested by simulating chaos.*
