"""
Process manually captured screenshots:
1. Rename to meaningful names
2. Create web-optimized versions (800px max width)
"""

from pathlib import Path
from PIL import Image
import shutil

SCREENSHOTS_DIR = Path(__file__).parent.parent / "docs" / "screenshots"

# Mapping of original filenames to new names and descriptions
RENAME_MAP = {
    "2026-01-02 15_06_05-AudioBash.png": ("quick-nav", "Quick navigation panel"),
    "2026-01-02 15_06_41-Telegram.png": ("voice-recording", "Voice input listening"),
    "2026-01-02 15_07_02-Telegram.png": ("settings-themes", "Settings with theme selector"),
    "2026-01-02 15_07_21-AudioBash.png": ("settings-providers", "Transcription provider selection"),
    "2026-01-02 15_07_38-Telegram.png": ("settings-remote", "Mobile remote control settings"),
    "2026-01-02 15_07_49-Telegram.png": ("settings-custom", "Custom instructions and vocabulary"),
    "2026-01-02 15_08_07-AudioBash.png": ("settings-shortcuts", "Keyboard shortcuts reference"),
    "2026-01-02 15_08_34-Telegram.png": ("voice-and-nav", "Voice input with quick nav open"),
}

def create_web_optimized(source_path: Path, max_width: int = 800) -> Path:
    """Create web-optimized version of image."""
    img = Image.open(source_path)

    if img.width > max_width:
        ratio = max_width / img.width
        new_size = (max_width, int(img.height * ratio))
        img = img.resize(new_size, Image.Resampling.LANCZOS)

    web_path = source_path.with_name(source_path.stem + "-web" + source_path.suffix)
    img.save(web_path, optimize=True)

    return web_path

def main():
    print("Processing screenshots...")
    print("=" * 50)

    for old_name, (new_name, description) in RENAME_MAP.items():
        old_path = SCREENSHOTS_DIR / old_name
        new_path = SCREENSHOTS_DIR / f"{new_name}.png"

        if not old_path.exists():
            print(f"[SKIP] {old_name} - not found")
            continue

        # Rename
        shutil.move(old_path, new_path)
        print(f"[RENAME] {old_name}")
        print(f"      -> {new_name}.png ({description})")

        # Create web version
        web_path = create_web_optimized(new_path)

        # Get sizes
        full_size = new_path.stat().st_size / 1024
        web_size = web_path.stat().st_size / 1024

        print(f"      -> {new_name}-web.png ({web_size:.1f}KB from {full_size:.1f}KB)")
        print()

    print("=" * 50)
    print("Done! New screenshots:")
    for f in sorted(SCREENSHOTS_DIR.glob("*.png")):
        if not f.stem.startswith("0"):  # Skip old numbered ones
            print(f"  {f.name}")

if __name__ == "__main__":
    main()
