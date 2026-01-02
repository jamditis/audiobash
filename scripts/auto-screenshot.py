"""
Automated screenshot capture for AudioBash documentation.
Captures the main window and various UI states.
"""

import time
import ctypes
import ctypes.wintypes
import sys
from pathlib import Path

import pyautogui
from PIL import Image

# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
SCREENSHOTS_DIR = PROJECT_DIR / "docs" / "screenshots"
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

# Disable pyautogui failsafe for automation
pyautogui.FAILSAFE = False

# Windows API
user32 = ctypes.windll.user32

# Callback type for EnumWindows
EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)

# Store found windows globally (ctypes callback limitation)
_found_windows = []

def _enum_callback(hwnd, lParam):
    """Callback for EnumWindows."""
    if user32.IsWindowVisible(hwnd):
        length = user32.GetWindowTextLengthW(hwnd)
        if length > 0:
            buffer = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buffer, length + 1)
            _found_windows.append((hwnd, buffer.value))
    return True

def find_window_by_title(title_part: str):
    """Find window handle by partial title match."""
    global _found_windows
    _found_windows = []

    # Enumerate all windows
    user32.EnumWindows(EnumWindowsProc(_enum_callback), 0)

    # Filter by title
    matches = [(h, t) for h, t in _found_windows if title_part.lower() in t.lower()]
    return matches

def get_window_rect(hwnd):
    """Get window rectangle."""
    rect = ctypes.wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    return rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top

def bring_to_front(hwnd):
    """Bring window to front."""
    # Show window if minimized
    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
    user32.SetForegroundWindow(hwnd)
    time.sleep(0.3)

def capture_window_by_hwnd(hwnd, name: str, description: str = ""):
    """Capture a window screenshot by handle."""
    try:
        # Bring to front
        bring_to_front(hwnd)
        time.sleep(0.3)

        # Get window bounds
        left, top, width, height = get_window_rect(hwnd)

        # Ensure positive values and valid size
        left = max(0, left)
        top = max(0, top)

        if width <= 0 or height <= 0:
            print(f"[ERROR] {name}: Invalid window size {width}x{height}")
            return False

        # Capture
        screenshot = pyautogui.screenshot(region=(left, top, width, height))

        # Save full size
        output_path = SCREENSHOTS_DIR / f"{name}.png"
        screenshot.save(output_path, optimize=True)

        # Create web-optimized version (max 800px width)
        web_path = SCREENSHOTS_DIR / f"{name}-web.png"
        web_img = screenshot.copy()
        if web_img.width > 800:
            ratio = 800 / web_img.width
            new_size = (800, int(web_img.height * ratio))
            web_img = web_img.resize(new_size, Image.Resampling.LANCZOS)
        web_img.save(web_path, optimize=True)

        print(f"[OK] {name}: {description}")
        print(f"     Full: {output_path.name} ({output_path.stat().st_size // 1024}KB)")
        print(f"     Web:  {web_path.name} ({web_path.stat().st_size // 1024}KB)")
        return True

    except Exception as e:
        print(f"[ERROR] {name}: {e}")
        import traceback
        traceback.print_exc()
        return False

def send_hotkey(*keys, delay=0.3):
    """Send a hotkey combination."""
    time.sleep(delay)
    pyautogui.hotkey(*keys)
    time.sleep(0.5)

def click_at(x, y, delay=0.3):
    """Click at absolute position."""
    time.sleep(delay)
    pyautogui.click(x, y)
    time.sleep(0.3)

def click_window_relative(hwnd, x_ratio, y_ratio, delay=0.3):
    """Click at a position relative to window (0-1 ratios)."""
    left, top, width, height = get_window_rect(hwnd)
    x = left + int(width * x_ratio)
    y = top + int(height * y_ratio)
    click_at(x, y, delay)

def main():
    print("=" * 60)
    print("AudioBash Automated Screenshot Capture")
    print("=" * 60)
    print()

    # Find AudioBash window - look for electron app, not browser tabs
    print("Looking for AudioBash window...")

    # Get all windows and filter
    find_window_by_title("")  # Populate _found_windows

    # Look for the Electron app window (not browser pages about AudioBash)
    # The actual app window title is usually just "audiobash" in dev mode
    windows = []
    for hwnd, title in _found_windows:
        title_lower = title.lower()
        # Skip browser windows
        if "edge" in title_lower or "chrome" in title_lower or "firefox" in title_lower:
            continue
        if "- personal" in title_lower:  # Edge tab indicator
            continue
        # Look for audiobash app
        if title_lower == "audiobash" or title_lower.startswith("audiobash -"):
            windows.append((hwnd, title))
            break

    if not windows:
        print("ERROR: AudioBash window not found!")
        print("Make sure AudioBash is running (npm run electron:dev)")
        print("\nAvailable windows:")
        find_window_by_title("")
        for hwnd, title in _found_windows[:20]:
            print(f"  - {title[:60]}")
        sys.exit(1)

    hwnd, title = windows[0]
    left, top, width, height = get_window_rect(hwnd)
    # Clean title for printing (remove non-ASCII chars)
    clean_title = title.encode('ascii', 'ignore').decode('ascii')
    print(f"Found window: {clean_title}")
    print(f"Handle: {hwnd}")
    print(f"Position: {left}, {top}")
    print(f"Size: {width} x {height}")
    print()

    # Capture sequence
    print("Capturing screenshots...")
    print("-" * 40)

    # 1. Main window - default state
    capture_window_by_hwnd(hwnd, "01-main-window", "Main terminal window")

    # 2. Try opening settings (gear icon is typically top-right)
    print("\nOpening settings panel...")
    click_window_relative(hwnd, 0.97, 0.04)  # Top-right corner for gear icon
    time.sleep(0.8)
    capture_window_by_hwnd(hwnd, "02-settings-panel", "Settings panel open")

    # Close settings by pressing Escape
    send_hotkey('escape')
    time.sleep(0.3)

    # 3. Voice recording - press Alt+S
    print("\nTriggering voice recording (Alt+S)...")
    bring_to_front(hwnd)
    send_hotkey('alt', 's')
    time.sleep(0.5)
    capture_window_by_hwnd(hwnd, "03-voice-recording", "Voice recording active")

    # Stop recording
    send_hotkey('alt', 's')
    time.sleep(0.5)

    # 4. Create a new tab for split view
    print("\nCreating new tab (Ctrl+T)...")
    bring_to_front(hwnd)
    send_hotkey('ctrl', 't')
    time.sleep(0.5)

    # 5. Cycle to split layout (Alt+L)
    print("\nSwitching to split layout (Alt+L)...")
    send_hotkey('alt', 'l')
    time.sleep(0.5)
    capture_window_by_hwnd(hwnd, "04-split-view-horizontal", "Horizontal split view")

    # Try another layout
    send_hotkey('alt', 'l')
    time.sleep(0.5)
    capture_window_by_hwnd(hwnd, "05-split-view-vertical", "Vertical split view")

    # 6. Quick navigation - look for folder icon
    print("\nOpening quick navigation...")
    click_window_relative(hwnd, 0.03, 0.96)  # Bottom-left for folder icon
    time.sleep(0.5)
    capture_window_by_hwnd(hwnd, "06-quick-nav", "Quick navigation panel")

    # Close nav
    send_hotkey('escape')
    time.sleep(0.3)

    # 7. Back to single view
    print("\nReturning to single layout...")
    for _ in range(4):
        send_hotkey('alt', 'l')
        time.sleep(0.2)

    # 8. Clean terminal state
    time.sleep(0.3)
    capture_window_by_hwnd(hwnd, "07-terminal-clean", "Clean terminal view")

    print()
    print("=" * 60)
    print("Screenshot capture complete!")
    print(f"Output directory: {SCREENSHOTS_DIR}")
    print("=" * 60)

    # List all screenshots
    print("\nGenerated files:")
    for f in sorted(SCREENSHOTS_DIR.glob("*.png")):
        size_kb = f.stat().st_size / 1024
        print(f"  {f.name:35} {size_kb:6.1f} KB")

if __name__ == "__main__":
    main()
