#!/usr/bin/env python3
"""
Generate the 1200x630 Open Graph / Twitter Card share image for audiobash.app.

Produces docs/og-image.png in the app's void/brutalist aesthetic: deep-black
background, faint grid, acid + signal-red accents, the AudioBash wordmark, a
tagline, and a framed product screenshot.

Usage:  python3 scripts/generate-og-image.py
Deps:   pip install pillow
"""

import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
OUT = os.path.join(DOCS, "og-image.png")
SCREENSHOT = os.path.join(DOCS, "screenshots", "voice-recording-web.png")

W, H = 1200, 630

# Palette (mirrors docs/index.html tailwind config)
VOID = (5, 5, 5)
PANEL = (10, 10, 10)
GRID = (26, 26, 26)
CHROME = (229, 229, 229)
ACID = (204, 255, 0)
SIGNAL = (255, 42, 42)
MUTED = (140, 140, 140)

MONO_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/System/Library/Fonts/SFNSMono.ttf",
    "C:/Windows/Fonts/consola.ttf",
)
MONO_BOLD_CANDIDATES = (
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "/System/Library/Fonts/SFNSMono.ttf",
    "C:/Windows/Fonts/consolab.ttf",
)


def font(candidates, size):
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    raise FileNotFoundError(f"No supported monospace font found in: {candidates}")


def main():
    img = Image.new("RGB", (W, H), VOID)
    draw = ImageDraw.Draw(img)

    # Faint grid pattern
    step = 40
    for x in range(0, W, step):
        draw.line([(x, 0), (x, H)], fill=GRID, width=1)
    for y in range(0, H, step):
        draw.line([(0, y), (W, y)], fill=GRID, width=1)

    # Left text column
    pad = 64
    f_kicker = font(MONO_BOLD_CANDIDATES, 22)
    f_word = font(MONO_BOLD_CANDIDATES, 88)
    f_tag = font(MONO_CANDIDATES, 25)
    f_sub = font(MONO_CANDIDATES, 22)
    f_url = font(MONO_BOLD_CANDIDATES, 26)

    # Top kicker with signal-red marker block
    ky = 70
    draw.rectangle([pad, ky, pad + 16, ky + 26], fill=SIGNAL)
    draw.text((pad + 30, ky), "VOICE-CONTROLLED TERMINAL", font=f_kicker, fill=MUTED)

    # Wordmark
    draw.text((pad, 150), "AUDIO", font=f_word, fill=CHROME)
    # second line "BASH" with acid accent
    draw.text((pad, 248), "BASH", font=f_word, fill=ACID)
    # underscore cursor block after BASH
    bbox = draw.textbbox((pad, 248), "BASH", font=f_word)
    draw.rectangle([bbox[2] + 14, bbox[3] - 18, bbox[2] + 58, bbox[3] - 2], fill=SIGNAL)

    # Tagline
    draw.text((pad, 380), "Speak commands. Execute instantly.", font=f_tag, fill=CHROME)
    draw.text(
        (pad, 424),
        "Gemini, ElevenLabs, or local Whisper.",
        font=f_sub,
        fill=MUTED,
    )
    draw.text((pad, 452), "Windows, macOS, and Linux.", font=f_sub, fill=MUTED)

    # URL pinned bottom-left
    draw.text((pad, 530), "audiobash.app", font=f_url, fill=ACID)

    # Right: framed screenshot
    if os.path.exists(SCREENSHOT):
        shot = Image.open(SCREENSHOT).convert("RGB")
        target_w = 520
        ratio = target_w / shot.width
        target_h = int(shot.height * ratio)
        shot = shot.resize((target_w, target_h), Image.LANCZOS)
        sx = W - target_w - 56
        sy = (H - target_h) // 2
        # chrome border frame (sharp, brutalist)
        draw.rectangle(
            [sx - 4, sy - 4, sx + target_w + 3, sy + target_h + 3],
            outline=CHROME,
            width=2,
        )
        img.paste(shot, (sx, sy))

    # Outer acid hairline frame
    draw.rectangle([6, 6, W - 7, H - 7], outline=(40, 40, 40), width=2)

    img.save(OUT, "PNG")
    print(f"Wrote {OUT} ({img.size[0]}x{img.size[1]})")


if __name__ == "__main__":
    main()
