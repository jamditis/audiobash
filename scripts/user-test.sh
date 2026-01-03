#!/bin/bash
# AudioBash End-User Test Suite
# Simulates non-technical user behaviors to find edge cases

set -e

APP_PATH="${1:-dist/mac-arm64/AudioBash.app}"
PASSED=0
FAILED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ $2${NC}"
        ((FAILED++))
    fi
}

echo -e "${YELLOW}=== AudioBash End-User Test Suite ===${NC}"
echo "Testing: $APP_PATH"
echo ""

# Pre-test cleanup
echo "Cleaning up previous state..."
pkill AudioBash 2>/dev/null || true
rm -f ~/Library/Application\ Support/audiobash/Singleton* 2>/dev/null || true
sleep 1

# Test 1: Basic launch
echo ""
echo "Test 1: Basic launch..."
open "$APP_PATH"
sleep 4
pgrep AudioBash > /dev/null
test_result $? "App launches successfully"

# Test 2: Single instance enforcement
echo ""
echo "Test 2: Single instance (impatient double-click)..."
open "$APP_PATH"
open "$APP_PATH"
open "$APP_PATH"
sleep 2
COUNT=$(pgrep AudioBash | wc -l | tr -d ' ')
[ "$COUNT" -eq 5 ]  # 1 main + 4 helpers
test_result $? "Single instance enforced (5 procs)"

# Test 3: Terminal shell spawned
echo ""
echo "Test 3: Terminal shell..."
INITIAL_SHELLS=$(pgrep zsh 2>/dev/null | wc -l | tr -d ' ')
[ "$INITIAL_SHELLS" -ge 1 ]
test_result $? "Shell spawned ($INITIAL_SHELLS zsh processes)"

# Test 4: Tab creation
echo ""
echo "Test 4: Create new tab (Cmd+T)..."
osascript -e 'tell application "AudioBash" to activate' 2>/dev/null
sleep 0.5
osascript -e 'tell application "System Events" to tell process "AudioBash" to keystroke "t" using command down' 2>/dev/null
sleep 1
NEW_SHELLS=$(pgrep zsh 2>/dev/null | wc -l | tr -d ' ')
[ "$NEW_SHELLS" -gt "$INITIAL_SHELLS" ]
test_result $? "New tab creates shell ($NEW_SHELLS zsh processes)"

# Test 5: Large paste (50KB)
echo ""
echo "Test 5: Paste 50KB of text..."
python3 -c "print('X' * 50000)" | pbcopy
osascript -e 'tell application "System Events" to tell process "AudioBash" to keystroke "v" using command down' 2>/dev/null
sleep 2
pgrep AudioBash > /dev/null
test_result $? "Survives 50KB paste"

# Test 6: Extreme window resize
echo ""
echo "Test 6: Extreme window resize..."
osascript -e 'tell application "System Events" to tell process "AudioBash" to set size of window 1 to {100, 100}' 2>/dev/null
sleep 0.3
osascript -e 'tell application "System Events" to tell process "AudioBash" to set size of window 1 to {2000, 1500}' 2>/dev/null
sleep 0.3
osascript -e 'tell application "System Events" to tell process "AudioBash" to set size of window 1 to {800, 600}' 2>/dev/null
pgrep AudioBash > /dev/null
test_result $? "Survives extreme resize (100x100 to 2000x1500)"

# Test 7: Window hide/show
echo ""
echo "Test 7: Window hide/show (Alt+H)..."
osascript -e 'tell application "System Events" to tell process "AudioBash" to keystroke "h" using option down' 2>/dev/null
sleep 0.5
osascript -e 'tell application "System Events" to tell process "AudioBash" to keystroke "h" using option down' 2>/dev/null
sleep 0.5
WINDOWS=$(osascript -e 'tell application "System Events" to tell process "AudioBash" to count windows' 2>/dev/null)
[ "$WINDOWS" -ge 1 ]
test_result $? "Window toggle works ($WINDOWS windows)"

# Test 8: Force quit recovery
echo ""
echo "Test 8: Force quit and recovery..."
pkill -9 AudioBash
sleep 1
# Check singleton files exist (stale)
if [ -f ~/Library/Application\ Support/audiobash/SingletonLock ]; then
    echo "  (Singleton files remain after force quit - testing recovery)"
fi
open "$APP_PATH"
sleep 4
pgrep AudioBash > /dev/null
test_result $? "Recovers from force quit with stale singleton"

# Test 9: spawn-helper permissions
echo ""
echo "Test 9: spawn-helper permissions..."
SPAWN_HELPER="$APP_PATH/Contents/Resources/app.asar.unpacked/node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper"
if [ -f "$SPAWN_HELPER" ]; then
    PERMS=$(stat -f "%Sp" "$SPAWN_HELPER")
    [[ "$PERMS" == *"x"* ]]
    test_result $? "spawn-helper is executable ($PERMS)"
else
    echo -e "${YELLOW}⚠️  spawn-helper not found (might be different path)${NC}"
fi

# Test 10: Check for crash logs
echo ""
echo "Test 10: No crash logs..."
CRASHES=$(find ~/Library/Logs/DiagnosticReports -name "*AudioBash*" -mmin -5 2>/dev/null | wc -l | tr -d ' ')
[ "$CRASHES" -eq 0 ]
test_result $? "No crash logs in last 5 minutes ($CRASHES found)"

# Cleanup
echo ""
echo "Cleaning up..."
pkill AudioBash 2>/dev/null || true

# Summary
echo ""
echo -e "${YELLOW}=== Test Results ===${NC}"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed. Check output above.${NC}"
    exit 1
fi
