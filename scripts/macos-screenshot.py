#!/usr/bin/env python3
"""
macOS screenshot capture for AudioBash using Quartz/CoreGraphics.
Captures specific windows without user interaction.
"""

import Quartz
from Quartz import (
    CGWindowListCopyWindowInfo,
    kCGWindowListOptionOnScreenOnly,
    kCGNullWindowID,
    CGWindowListCreateImage,
    CGRectNull,
    kCGWindowImageDefault,
    kCGWindowListOptionIncludingWindow,
)
from CoreFoundation import CFDataGetBytes, CFDataGetLength
import subprocess
import time
import sys
from pathlib import Path

# Output directory
SCREENSHOTS_DIR = Path(__file__).parent.parent / "docs" / "screenshots"
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

def get_electron_window():
    """Find the main Electron window."""
    window_list = CGWindowListCopyWindowInfo(
        kCGWindowListOptionOnScreenOnly,
        kCGNullWindowID
    )

    for window in window_list:
        owner = window.get('kCGWindowOwnerName', '')
        name = window.get('kCGWindowName', '')
        layer = window.get('kCGWindowLayer', 0)

        # Look for Electron windows at layer 0 (normal windows)
        if owner == 'Electron' and layer == 0:
            bounds = window.get('kCGWindowBounds', {})
            if bounds.get('Width', 0) > 400:  # Skip small utility windows
                return window

    return None

def capture_window(window_id, output_name, description=""):
    """Capture a specific window by its ID."""
    try:
        # Capture the window
        image = CGWindowListCreateImage(
            CGRectNull,
            kCGWindowListOptionIncludingWindow,
            window_id,
            kCGWindowImageDefault
        )

        if image is None:
            print(f"[ERROR] Failed to capture {output_name}")
            return False

        # Save using screencapture with the window ID (more reliable)
        output_path = SCREENSHOTS_DIR / f"{output_name}.png"
        web_path = SCREENSHOTS_DIR / f"{output_name}-web.png"

        # Use screencapture -l with window ID
        result = subprocess.run(
            ['screencapture', '-x', '-o', f'-l{window_id}', str(output_path)],
            capture_output=True
        )

        if result.returncode != 0:
            print(f"[ERROR] screencapture failed: {result.stderr.decode()}")
            return False

        # Create web-optimized version using sips
        subprocess.run([
            'sips', '--resampleWidth', '800',
            str(output_path),
            '--out', str(web_path)
        ], capture_output=True)

        size_kb = output_path.stat().st_size / 1024
        web_kb = web_path.stat().st_size / 1024 if web_path.exists() else 0

        print(f"[OK] {output_name}: {description}")
        print(f"     Full: {output_path.name} ({size_kb:.1f}KB)")
        print(f"     Web:  {web_path.name} ({web_kb:.1f}KB)")
        return True

    except Exception as e:
        print(f"[ERROR] {output_name}: {e}")
        import traceback
        traceback.print_exc()
        return False

def send_keystroke(key, modifiers=None):
    """Send a keystroke using osascript."""
    if modifiers:
        mod_str = ', '.join(modifiers)
        script = f'tell application "System Events" to keystroke "{key}" using {{{mod_str}}}'
    else:
        script = f'tell application "System Events" to keystroke "{key}"'

    subprocess.run(['osascript', '-e', script], capture_output=True)
    time.sleep(0.3)

def send_key_code(code, modifiers=None):
    """Send a key code using osascript."""
    if modifiers:
        mod_str = ', '.join(modifiers)
        script = f'tell application "System Events" to key code {code} using {{{mod_str}}}'
    else:
        script = f'tell application "System Events" to key code {code}'

    subprocess.run(['osascript', '-e', script], capture_output=True)
    time.sleep(0.3)

def activate_electron():
    """Bring Electron to front."""
    subprocess.run([
        'osascript', '-e',
        'tell application "Electron" to activate'
    ], capture_output=True)
    time.sleep(0.5)

def click_relative(window, x_ratio, y_ratio):
    """Click at position relative to window bounds."""
    bounds = window.get('kCGWindowBounds', {})
    x = int(bounds.get('X', 0) + bounds.get('Width', 0) * x_ratio)
    y = int(bounds.get('Y', 0) + bounds.get('Height', 0) * y_ratio)

    script = f'''
    tell application "System Events"
        click at {{{x}, {y}}}
    end tell
    '''
    # Use cliclick if available, otherwise AppleScript
    result = subprocess.run(['which', 'cliclick'], capture_output=True)
    if result.returncode == 0:
        subprocess.run(['cliclick', f'c:{x},{y}'], capture_output=True)
    else:
        # Fallback: use mouse position setting
        subprocess.run([
            'osascript', '-e',
            f'do shell script "printf \'\\x1b[3;{y};{x}t\'"'
        ], capture_output=True)
    time.sleep(0.3)

def main():
    print("=" * 60)
    print("AudioBash macOS Screenshot Capture")
    print("=" * 60)
    print()

    # Find Electron window
    print("Looking for Electron window...")
    activate_electron()
    time.sleep(0.5)

    window = get_electron_window()
    if not window:
        print("ERROR: Electron window not found!")
        print("Make sure AudioBash is running.")

        # List all windows for debugging
        window_list = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly,
            kCGNullWindowID
        )
        print("\nAvailable windows:")
        for w in window_list[:15]:
            owner = w.get('kCGWindowOwnerName', 'Unknown')
            name = w.get('kCGWindowName', '')
            bounds = w.get('kCGWindowBounds', {})
            print(f"  {owner}: {name[:40]} ({bounds.get('Width', 0)}x{bounds.get('Height', 0)})")
        sys.exit(1)

    window_id = window.get('kCGWindowNumber')
    bounds = window.get('kCGWindowBounds', {})
    print(f"Found Electron window: ID={window_id}")
    print(f"Size: {bounds.get('Width')}x{bounds.get('Height')}")
    print()

    # Capture sequence
    print("Capturing screenshots...")
    print("-" * 40)

    # 1. Main window
    capture_window(window_id, "01-main-window", "Main terminal window")

    # 2. Settings panel - click gear icon (top right area)
    print("\nOpening settings...")
    activate_electron()
    # Option+comma often opens settings, or we need to click the gear
    send_keystroke(",", ["option down"])
    time.sleep(0.8)

    # Re-find window (might have changed)
    window = get_electron_window()
    if window:
        window_id = window.get('kCGWindowNumber')
        capture_window(window_id, "02-settings-panel", "Settings panel open")

    # Close settings
    send_key_code(53)  # Escape key
    time.sleep(0.3)

    # 3. Voice recording - Option+S
    print("\nTriggering voice recording (Option+S)...")
    activate_electron()
    send_keystroke("s", ["option down"])
    time.sleep(0.8)

    window = get_electron_window()
    if window:
        window_id = window.get('kCGWindowNumber')
        capture_window(window_id, "03-voice-recording", "Voice recording active")

    # Stop recording
    send_keystroke("s", ["option down"])
    time.sleep(0.5)

    # 4. New tab and split view
    print("\nCreating new tab (Cmd+T)...")
    activate_electron()
    send_keystroke("t", ["command down"])
    time.sleep(0.5)

    # 5. Cycle layout (Option+L)
    print("\nSwitching to split layout (Option+L)...")
    send_keystroke("l", ["option down"])
    time.sleep(0.5)

    window = get_electron_window()
    if window:
        window_id = window.get('kCGWindowNumber')
        capture_window(window_id, "04-split-view-horizontal", "Horizontal split view")

    # Another layout
    send_keystroke("l", ["option down"])
    time.sleep(0.5)

    window = get_electron_window()
    if window:
        window_id = window.get('kCGWindowNumber')
        capture_window(window_id, "05-split-view-vertical", "Vertical split view")

    # 6. Quick nav (Option+G or click folder icon)
    print("\nOpening quick navigation...")
    activate_electron()
    send_keystroke("g", ["option down"])
    time.sleep(0.5)

    window = get_electron_window()
    if window:
        window_id = window.get('kCGWindowNumber')
        capture_window(window_id, "06-quick-nav", "Quick navigation panel")

    # Close nav
    send_key_code(53)  # Escape
    time.sleep(0.3)

    # 7. Back to single view
    print("\nReturning to single layout...")
    for _ in range(4):
        send_keystroke("l", ["option down"])
        time.sleep(0.2)

    # 8. Clean terminal
    time.sleep(0.3)
    window = get_electron_window()
    if window:
        window_id = window.get('kCGWindowNumber')
        capture_window(window_id, "07-terminal-clean", "Clean terminal view")

    print()
    print("=" * 60)
    print("Screenshot capture complete!")
    print(f"Output directory: {SCREENSHOTS_DIR}")
    print("=" * 60)

    # List files
    print("\nGenerated files:")
    for f in sorted(SCREENSHOTS_DIR.glob("*.png")):
        size_kb = f.stat().st_size / 1024
        print(f"  {f.name:35} {size_kb:6.1f} KB")

if __name__ == "__main__":
    main()
