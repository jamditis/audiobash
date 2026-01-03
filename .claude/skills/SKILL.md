# AudioBash End-User Testing Skill

Testing AudioBash from the perspective of non-technical users, with focus on Electron, terminal emulation, and audio recording edge cases.

---

## Quick Test Suite

Run these tests after any significant change:

```bash
# 1. Launch fresh build
pkill AudioBash 2>/dev/null
rm -f ~/Library/Application\ Support/audiobash/Singleton*
open "dist/mac-arm64/AudioBash.app"
sleep 4
pgrep AudioBash && echo "✅ Launch OK"

# 2. Multi-instance prevention
open "dist/mac-arm64/AudioBash.app"
open "dist/mac-arm64/AudioBash.app"
sleep 2
[ $(pgrep AudioBash | wc -l) -eq 5 ] && echo "✅ Single instance OK"

# 3. Tab creation
osascript -e 'tell application "AudioBash" to activate'
osascript -e 'tell application "System Events" to keystroke "t" using command down'
sleep 1
[ $(pgrep zsh | wc -l) -ge 2 ] && echo "✅ Tab creation OK"

# 4. Large paste
python3 -c "print('A' * 50000)" | pbcopy
osascript -e 'tell application "System Events" to keystroke "v" using command down'
sleep 2
pgrep AudioBash && echo "✅ Large paste OK"

# 5. Force quit recovery
pkill -9 AudioBash
sleep 1
open "dist/mac-arm64/AudioBash.app"
sleep 4
pgrep AudioBash && echo "✅ Force quit recovery OK"

# Cleanup
pkill AudioBash 2>/dev/null
echo "Tests complete"
```

---

## Test Categories

### 1. Installation & Launch

| Test | Command | Expected |
|------|---------|----------|
| Run from DMG | `open "/Volumes/AudioBash*/AudioBash.app"` | App runs from read-only volume |
| Run from dist folder | `open "dist/mac-arm64/AudioBash.app"` | App runs normally |
| Gatekeeper bypass | Right-click → Open | Dialog allows opening |
| xattr removal | `xattr -cr /Applications/AudioBash.app` | Removes quarantine |

**spawn-helper Permission Check:**
```bash
# This is the #1 cause of launch failures
ls -la dist/mac-arm64/AudioBash.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper
# Must show: -rwxr-xr-x (755)

# Fix if wrong:
chmod +x dist/mac-arm64/AudioBash.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-*/spawn-helper
```

### 2. Terminal & PTY Tests

| Test | How | Expected |
|------|-----|----------|
| Shell detection | `echo $SHELL` in terminal | Shows /bin/zsh |
| Working directory | `pwd` | Home directory |
| Environment | `env \| grep PATH` | Full PATH available |
| Color support | `ls --color` | Colored output |
| Unicode | `echo "émoji 🔥 中文"` | Renders correctly |

**Stress Tests:**
```bash
# Rapid output
yes | head -10000

# Long-running command
ping localhost

# Interactive command
top

# Full-screen app
vim

# Background process
sleep 100 &
```

### 3. Tab Management

```bash
# Create tabs
osascript -e 'tell application "AudioBash" to activate'
for i in {1..5}; do
    osascript -e 'tell application "System Events" to keystroke "t" using command down'
    sleep 0.3
done

# Count shells
pgrep zsh | wc -l  # Should match tab count + 1 (for Claude Code's shell)

# Switch tabs
osascript -e 'tell application "System Events" to keystroke "1" using option down'
osascript -e 'tell application "System Events" to keystroke "2" using option down'

# Close tab
osascript -e 'tell application "System Events" to keystroke "w" using command down'

# Verify cleanup
sleep 1
pgrep zsh | wc -l  # Should decrease
```

### 4. Keyboard Shortcuts

| Shortcut | Action | Test |
|----------|--------|------|
| Alt+S | Toggle recording | Should show/hide overlay |
| Alt+A | Cancel recording | Should cancel active recording |
| Alt+H | Toggle window | Window hides/shows |
| Alt+M | Toggle mode | Switches voice/text mode |
| Alt+C | Clear terminal | Terminal clears |
| Alt+L | Cycle layout | Changes split layout |
| Alt+1/2/3 | Switch tabs | Switches to tab N |
| Cmd+T | New tab | Creates new terminal tab |
| Cmd+W | Close tab | Closes current tab |

**Test all shortcuts:**
```bash
osascript -e 'tell application "AudioBash" to activate'

# Test each shortcut
shortcuts=("h" "m" "c" "l" "1" "2" "3")
for key in "${shortcuts[@]}"; do
    osascript -e "tell application \"System Events\" to keystroke \"$key\" using option down"
    sleep 0.5
done
```

### 5. Voice Recording (Manual)

These require manual verification:

- [ ] **Microphone permission**: First Alt+S triggers permission dialog
- [ ] **Recording indicator**: Overlay appears with waveform
- [ ] **Audio feedback**: Start/stop sounds play
- [ ] **Transcription**: Speech converted to text
- [ ] **Cancel recording**: Alt+A cancels without sending
- [ ] **No mic available**: Graceful error message

### 6. Window Behavior

```bash
# Extreme resize
osascript -e 'tell application "System Events" to tell process "AudioBash" to set size of window 1 to {200, 150}'
sleep 1
osascript -e 'tell application "System Events" to tell process "AudioBash" to set size of window 1 to {2500, 1600}'

# Hide/show
osascript -e 'tell application "System Events" to keystroke "h" using option down'
sleep 1
osascript -e 'tell application "System Events" to keystroke "h" using option down'

# Minimize
osascript -e 'tell application "System Events" to keystroke "m" using command down'
sleep 1
osascript -e 'tell application "AudioBash" to activate'
```

### 7. Resource & Stability

```bash
# File descriptor monitoring
lsof -p $(pgrep -x AudioBash | head -1) 2>/dev/null | wc -l

# Memory check
ps -p $(pgrep -x AudioBash | head -1) -o rss= | awk '{print $1/1024 " MB"}'

# Create/close many tabs (FD leak test)
initial_fds=$(lsof -p $(pgrep -x AudioBash | head -1) 2>/dev/null | wc -l)
for i in {1..10}; do
    osascript -e 'tell application "System Events" to keystroke "t" using command down'
    sleep 0.2
    osascript -e 'tell application "System Events" to keystroke "w" using command down'
    sleep 0.2
done
sleep 2
final_fds=$(lsof -p $(pgrep -x AudioBash | head -1) 2>/dev/null | wc -l)
echo "FD change: $((final_fds - initial_fds))"
# Should be < 50 difference
```

### 8. Singleton & Recovery

```bash
# Check singleton files
ls -la ~/Library/Application\ Support/audiobash/Singleton*

# Test stale singleton recovery
pkill -9 AudioBash
ls ~/Library/Application\ Support/audiobash/Singleton*  # Files remain
open "dist/mac-arm64/AudioBash.app"
sleep 4
pgrep AudioBash && echo "Recovered from stale singleton"

# Clean singleton manually (if needed)
rm -f ~/Library/Application\ Support/audiobash/Singleton*
```

### 9. Log Analysis

```bash
# View recent logs
tail -50 ~/Library/Application\ Support/audiobash/logs/audiobash.log | jq -r '.message'

# Check for errors
grep -i error ~/Library/Application\ Support/audiobash/logs/audiobash.log | tail -10

# Check PTY spawns
grep "Shell spawned\|Shell exited" ~/Library/Application\ Support/audiobash/logs/audiobash.log | tail -10

# Watch logs live
tail -f ~/Library/Application\ Support/audiobash/logs/audiobash.log | jq -r '[.timestamp, .level, .message] | join(" | ")'
```

---

## Common Issues & Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| App won't launch (no error) | Stale singleton files | `rm ~/Library/Application\ Support/audiobash/Singleton*` |
| Terminal shows error | spawn-helper not executable | `chmod +x .../spawn-helper` |
| No window appears | Window hidden | Alt+H to toggle |
| Shortcuts don't work | Wrong app focused | Click on AudioBash window |
| Recording fails | No mic permission | System Preferences → Privacy |

---

## Pre-Release Checklist

Run before any release:

```bash
echo "=== AudioBash Pre-Release Tests ==="

# Build fresh
npm run electron:build:mac:arm64

# Test ARM64
echo "Testing ARM64..."
hdiutil attach "dist/AudioBash-*.dmg" -nobrowse 2>/dev/null
sleep 2
VOLUME=$(ls -d /Volumes/AudioBash* 2>/dev/null | head -1)

if [ -n "$VOLUME" ]; then
    # Check spawn-helper
    ls -la "$VOLUME/AudioBash.app/Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper" | grep -q "rwx" && echo "✅ spawn-helper permissions OK"

    # Launch test
    open "$VOLUME/AudioBash.app"
    sleep 5
    pgrep AudioBash && echo "✅ App launches from DMG"

    # Cleanup
    pkill AudioBash
    hdiutil detach "$VOLUME" -force
fi

echo "=== Tests Complete ==="
```

---

## Automated Test Script

Save as `scripts/user-test.sh`:

```bash
#!/bin/bash
# AudioBash End-User Test Suite

set -e

APP_PATH="${1:-dist/mac-arm64/AudioBash.app}"
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

# Cleanup
pkill AudioBash 2>/dev/null || true
rm -f ~/Library/Application\ Support/audiobash/Singleton* 2>/dev/null || true
sleep 1

echo "=== AudioBash User Tests ==="
echo "Testing: $APP_PATH"
echo ""

# Test 1: Launch
echo "Test 1: Basic launch..."
open "$APP_PATH"
sleep 4
pgrep AudioBash > /dev/null
test_result $? "Basic launch"

# Test 2: Single instance
echo "Test 2: Single instance..."
open "$APP_PATH"
open "$APP_PATH"
sleep 2
COUNT=$(pgrep AudioBash | wc -l | tr -d ' ')
[ "$COUNT" -eq 5 ]
test_result $? "Single instance (5 procs)"

# Test 3: Terminal shell
echo "Test 3: Terminal shell..."
SHELLS=$(pgrep zsh | wc -l | tr -d ' ')
[ "$SHELLS" -ge 1 ]
test_result $? "Shell spawned"

# Test 4: Tab creation
echo "Test 4: Tab creation..."
osascript -e 'tell application "AudioBash" to activate'
osascript -e 'tell application "System Events" to keystroke "t" using command down'
sleep 1
NEW_SHELLS=$(pgrep zsh | wc -l | tr -d ' ')
[ "$NEW_SHELLS" -gt "$SHELLS" ]
test_result $? "New tab creates shell"

# Test 5: Large paste
echo "Test 5: Large paste..."
python3 -c "print('X' * 50000)" | pbcopy
osascript -e 'tell application "System Events" to keystroke "v" using command down'
sleep 2
pgrep AudioBash > /dev/null
test_result $? "Survives large paste"

# Test 6: Resize
echo "Test 6: Window resize..."
osascript -e 'tell application "System Events" to tell process "AudioBash" to set size of window 1 to {150, 150}'
sleep 0.5
osascript -e 'tell application "System Events" to tell process "AudioBash" to set size of window 1 to {1200, 800}'
pgrep AudioBash > /dev/null
test_result $? "Survives extreme resize"

# Test 7: Force quit recovery
echo "Test 7: Force quit recovery..."
pkill -9 AudioBash
sleep 1
open "$APP_PATH"
sleep 4
pgrep AudioBash > /dev/null
test_result $? "Recovers from force quit"

# Cleanup
pkill AudioBash 2>/dev/null || true

echo ""
echo "=== Results ==="
echo "Passed: $PASSED"
echo "Failed: $FAILED"

[ $FAILED -eq 0 ]
```

Make executable: `chmod +x scripts/user-test.sh`

Run: `./scripts/user-test.sh`
