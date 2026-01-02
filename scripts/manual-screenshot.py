"""
Manual screenshot capture for AudioBash documentation.
Captures the AudioBash window when you press Enter.
Does NOT send any hotkeys - safe to use while AudioBash is active.
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

# Disable pyautogui failsafe
pyautogui.FAILSAFE = False

# Windows API
user32 = ctypes.windll.user32
EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM)
_found_windows = []

def _enum_callback(hwnd, lParam):
    if user32.IsWindowVisible(hwnd):
        length = user32.GetWindowTextLengthW(hwnd)
        if length > 0:
            buffer = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buffer, length + 1)
            _found_windows.append((hwnd, buffer.value))
    return True

def find_audiobash_window():
    """Find the AudioBash Electron window."""
    global _found_windows
    _found_windows = []
    user32.EnumWindows(EnumWindowsProc(_enum_callback), 0)

    for hwnd, title in _found_windows:
        title_lower = title.lower()
        # Skip browsers
        if any(x in title_lower for x in ["edge", "chrome", "firefox", "- personal"]):
            continue
        # Match audiobash
        if title_lower == "audiobash" or "audiobash" in title_lower:
            # Verify it's not a browser by checking window class
            return hwnd, title
    return None, None

def get_window_rect(hwnd):
    rect = ctypes.wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(rect))
    return rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top

def capture_window(hwnd, name: str):
    """Capture window screenshot without bringing to front or sending keys."""
    try:
        left, top, width, height = get_window_rect(hwnd)
        left = max(0, left)
        top = max(0, top)

        if width <= 0 or height <= 0:
            print(f"[ERROR] Invalid window size")
            return False

        # Small delay for any UI to settle
        time.sleep(0.2)

        # Capture
        screenshot = pyautogui.screenshot(region=(left, top, width, height))

        # Save full size
        output_path = SCREENSHOTS_DIR / f"{name}.png"
        screenshot.save(output_path, optimize=True)

        # Web optimized
        web_path = SCREENSHOTS_DIR / f"{name}-web.png"
        web_img = screenshot.copy()
        if web_img.width > 800:
            ratio = 800 / web_img.width
            new_size = (800, int(web_img.height * ratio))
            web_img = web_img.resize(new_size, Image.Resampling.LANCZOS)
        web_img.save(web_path, optimize=True)

        print(f"[OK] Saved: {name}.png ({output_path.stat().st_size // 1024}KB)")
        return True

    except Exception as e:
        print(f"[ERROR] {e}")
        return False

def main():
    print("=" * 60)
    print("AudioBash Manual Screenshot Capture")
    print("=" * 60)
    print()
    print("This script captures AudioBash WITHOUT sending any hotkeys.")
    print("You manually set up each UI state, then press Enter to capture.")
    print()

    hwnd, title = find_audiobash_window()
    if not hwnd:
        print("ERROR: AudioBash window not found!")
        print("\nAvailable windows with 'audio' in title:")
        for h, t in _found_windows:
            if "audio" in t.lower():
                print(f"  - {t[:70]}")
        sys.exit(1)

    clean_title = title.encode('ascii', 'ignore').decode('ascii')
    print(f"Found: {clean_title}")
    left, top, width, height = get_window_rect(hwnd)
    print(f"Size: {width}x{height}")
    print()

    screenshots = [
        ("01-main-window", "Show the main terminal window (default state)"),
        ("02-settings-open", "Open the Settings panel (click gear icon)"),
        ("03-voice-recording", "Start voice recording (press Alt+S)"),
        ("04-split-horizontal", "Show horizontal split view (Alt+L)"),
        ("05-split-vertical", "Show vertical split view (Alt+L again)"),
        ("06-quick-nav", "Open quick navigation (click folder icon)"),
        ("07-themes", "Show theme selector in settings"),
    ]

    print("Ready to capture screenshots.")
    print("-" * 40)

    for name, instruction in screenshots:
        print(f"\n[{name}]")
        print(f"  Setup: {instruction}")
        response = input("  Press Enter to capture (or 's' to skip): ")

        if response.lower() == 's':
            print("  Skipped.")
            continue

        capture_window(hwnd, name)

    print()
    print("=" * 60)
    print("Done! Screenshots saved to:")
    print(f"  {SCREENSHOTS_DIR}")
    print("=" * 60)

    print("\nCaptured files:")
    for f in sorted(SCREENSHOTS_DIR.glob("*.png")):
        print(f"  {f.name}")

if __name__ == "__main__":
    main()
