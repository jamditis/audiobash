"""Generate NSIS installer images with void aesthetic."""
from PIL import Image, ImageDraw, ImageFont
import os

# Void color palette
VOID = (5, 5, 5)
VOID_100 = (10, 10, 10)
VOID_200 = (17, 17, 17)
VOID_300 = (26, 26, 26)
ACCENT = (255, 51, 51)
CRT_WHITE = (240, 240, 240)

BUILD_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH = os.path.join(os.path.dirname(BUILD_DIR), "audiobash-logo.png")

def create_header_image():
    """Create 150x57 header image for installer pages."""
    img = Image.new('RGB', (150, 57), VOID)
    draw = ImageDraw.Draw(img)

    # Add subtle gradient effect
    for y in range(57):
        intensity = int(5 + (y / 57) * 10)
        draw.line([(0, y), (150, y)], fill=(intensity, intensity, intensity))

    # Load and resize logo
    try:
        logo = Image.open(LOGO_PATH).convert('RGBA')
        logo_size = 45
        logo = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)

        # Position logo on the left
        logo_x = 6
        logo_y = (57 - logo_size) // 2

        # Paste with alpha
        img.paste(logo, (logo_x, logo_y), logo)
    except Exception as e:
        print(f"Could not load logo: {e}")

    # Add "AUDIOBASH" text
    try:
        # Try to use a monospace font
        font = ImageFont.truetype("consola.ttf", 14)
    except:
        font = ImageFont.load_default()

    draw.text((58, 20), "AUDIOBASH", fill=CRT_WHITE, font=font)

    # Add accent line at bottom
    draw.line([(0, 55), (150, 55)], fill=ACCENT, width=2)

    # Save as BMP
    output_path = os.path.join(BUILD_DIR, "installerHeader.bmp")
    img.save(output_path, "BMP")
    print(f"Created: {output_path}")

def create_sidebar_image():
    """Create 164x314 sidebar image for welcome/finish pages."""
    img = Image.new('RGB', (164, 314), VOID)
    draw = ImageDraw.Draw(img)

    # Create gradient background
    for y in range(314):
        # Subtle vertical gradient
        intensity = int(5 + (y / 314) * 15)
        draw.line([(0, y), (164, y)], fill=(intensity, intensity, intensity))

    # Add scan line effect
    for y in range(0, 314, 3):
        draw.line([(0, y), (164, y)], fill=(0, 0, 0))

    # Load and position logo
    try:
        logo = Image.open(LOGO_PATH).convert('RGBA')
        logo_size = 120
        logo = logo.resize((logo_size, logo_size), Image.Resampling.LANCZOS)

        # Center logo horizontally, position in upper third
        logo_x = (164 - logo_size) // 2
        logo_y = 40

        # Paste with alpha
        img.paste(logo, (logo_x, logo_y), logo)
    except Exception as e:
        print(f"Could not load logo: {e}")

    # Add vertical accent line on right edge
    draw.line([(162, 0), (162, 314)], fill=ACCENT, width=2)

    # Add "VOICE TERMINAL" text vertically at bottom
    try:
        font = ImageFont.truetype("consola.ttf", 11)
    except:
        font = ImageFont.load_default()

    # Draw text
    text_y = 180
    for i, char in enumerate("VOICE"):
        draw.text((72, text_y + i * 14), char, fill=ACCENT, font=font)

    text_y = 260
    for i, char in enumerate("TERM"):
        draw.text((72, text_y + i * 14), char, fill=CRT_WHITE, font=font)

    # Save as BMP
    output_path = os.path.join(BUILD_DIR, "installerSidebar.bmp")
    img.save(output_path, "BMP")
    print(f"Created: {output_path}")

if __name__ == "__main__":
    create_header_image()
    create_sidebar_image()
    print("Done! Installer images created.")
