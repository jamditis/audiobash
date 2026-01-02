"""
AudioBash Screenshot Capture Script

This script launches AudioBash in dev mode and captures screenshots
of different UI states for documentation purposes.

Requirements:
- pip install playwright pyautogui pillow
- playwright install chromium

Usage:
- Run AudioBash manually first: npm run electron:dev
- Then run this script: python scripts/capture-screenshots.py
"""

import subprocess
import time
import os
import sys
from pathlib import Path

try:
    import pyautogui
    from PIL import Image
except ImportError:
    print("Installing required packages...")
    subprocess.run([sys.executable, "-m", "pip", "install", "pyautogui", "pillow", "-q"])
    import pyautogui
    from PIL import Image

# Configuration
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
SCREENSHOTS_DIR = PROJECT_DIR / "docs" / "screenshots"
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

def capture_window(title_contains: str, output_name: str, delay: float = 0.5) -> bool:
    """Capture a screenshot of a window containing the given title."""
    time.sleep(delay)

    try:
        # Get all windows
        windows = pyautogui.getWindowsWithTitle(title_contains)
        if not windows:
            print(f"  Window '{title_contains}' not found")
            return False

        window = windows[0]

        # Activate and focus the window
        window.activate()
        time.sleep(0.3)

        # Get window bounds
        left, top, width, height = window.left, window.top, window.width, window.height

        # Capture the region
        screenshot = pyautogui.screenshot(region=(left, top, width, height))

        # Save
        output_path = SCREENSHOTS_DIR / f"{output_name}.png"
        screenshot.save(output_path)
        print(f"  Saved: {output_path}")
        return True

    except Exception as e:
        print(f"  Error capturing '{title_contains}': {e}")
        return False

def capture_full_screen(output_name: str) -> bool:
    """Capture full screen screenshot."""
    try:
        screenshot = pyautogui.screenshot()
        output_path = SCREENSHOTS_DIR / f"{output_name}.png"
        screenshot.save(output_path)
        print(f"  Saved: {output_path}")
        return True
    except Exception as e:
        print(f"  Error: {e}")
        return False

def simulate_keypress(key: str, delay: float = 0.5):
    """Simulate a keypress."""
    time.sleep(delay)
    pyautogui.hotkey(*key.split('+'))
    time.sleep(0.3)

def main():
    print("=" * 60)
    print("AudioBash Screenshot Capture")
    print("=" * 60)
    print()
    print("INSTRUCTIONS:")
    print("1. Make sure AudioBash is running (npm run electron:dev)")
    print("2. This script will capture screenshots of different states")
    print("3. You may need to manually trigger some UI states")
    print()

    input("Press Enter when AudioBash is running and ready...")
    print()

    # Capture main window
    print("[1/6] Capturing main window...")
    capture_window("AudioBash", "main-window")

    # Try to capture with settings open
    print("[2/6] Opening settings (click gear icon manually)...")
    input("  Press Enter after opening Settings panel...")
    capture_window("AudioBash", "settings-panel")

    # Voice recording state
    print("[3/6] Capturing voice recording state...")
    print("  Press Alt+S to start recording, then press Enter here")
    input("  Press Enter when recording indicator is visible...")
    capture_window("AudioBash", "voice-recording")

    # Stop recording
    print("  Press Alt+S again to stop recording")
    input("  Press Enter to continue...")

    # Split view
    print("[4/6] Capturing split view...")
    print("  Open a second tab and enable split view (Alt+L)")
    input("  Press Enter when split view is visible...")
    capture_window("AudioBash", "split-view")

    # Quick navigation
    print("[5/6] Capturing quick navigation panel...")
    print("  Click the folder icon in the status bar")
    input("  Press Enter when navigation panel is visible...")
    capture_window("AudioBash", "quick-nav")

    # Voice overlay
    print("[6/6] Capturing voice overlay...")
    print("  If you have a floating voice overlay, make it visible")
    input("  Press Enter when ready (or skip by pressing Enter)...")
    capture_window("AudioBash", "voice-overlay")

    print()
    print("=" * 60)
    print("Screenshot capture complete!")
    print(f"Screenshots saved to: {SCREENSHOTS_DIR}")
    print("=" * 60)

    # List captured files
    print("\nCaptured files:")
    for f in SCREENSHOTS_DIR.glob("*.png"):
        size = f.stat().st_size / 1024
        print(f"  - {f.name} ({size:.1f} KB)")

if __name__ == "__main__":
    main()
