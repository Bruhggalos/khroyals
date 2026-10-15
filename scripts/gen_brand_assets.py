"""Generate app icons, splash and in-app logo images from the school's logo.

Source: assets/brand/kingdom-heights-logo.webp (transparent background,
crest on the left, "KINGDOM HEIGHTS" wordmark on the right).

    python3 scripts/gen_brand_assets.py

Re-run after replacing the source file (e.g. with a higher-resolution export).
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/brand/kingdom-heights-logo.webp"
OUT = ROOT / "assets"

# Brand colors sampled from the logo and khroyals.com.
SITE_RED = (0xFC, 0x17, 0x23)
ICON_BG = (0xFF, 0xFF, 0xFF)

# Pixel boxes inside the 1400x600 source logo.
LOGO_BOX = (8, 72, 1388, 571)    # crest + wordmark
CREST_BOX = (9, 73, 390, 569)    # shield, crown and KH monogram
CROWN_BOX = (125, 65, 275, 200)  # crown above the shield


def fit(img: Image.Image, height: int) -> Image.Image:
    w = round(img.width * height / img.height)
    return img.resize((w, height), Image.LANCZOS)


def place(img: Image.Image, size: int, height: int, bg=None) -> Image.Image:
    """Center `img` scaled to `height` on a size x size canvas."""
    canvas = Image.new("RGBA", (size, size), (*bg, 255) if bg else (0, 0, 0, 0))
    art = fit(img, height)
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def recolor(img: Image.Image, rgb) -> Image.Image:
    solid = Image.new("RGBA", img.size, (*rgb, 255))
    solid.putalpha(img.getchannel("A"))
    return solid


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    logo = src.crop(LOGO_BOX)
    crest = src.crop(CREST_BOX)

    crown = src.crop(CROWN_BOX)
    # Mask out the ends of the shield's top edge that fall inside the crop.
    clear = Image.new("RGBA", (16, 30), (0, 0, 0, 0))
    crown.paste(clear, (0, 75))
    crown.paste(clear, (crown.width - 16, 75))
    crown = crown.crop(crown.getchannel("A").getbbox())

    logo.save(OUT / "logo.png")
    fit(crest, 240).save(OUT / "crest.png")
    fit(recolor(crown, SITE_RED), 120).save(OUT / "crown-red.png")

    # iOS / default icon: full-color crest on white, no transparency allowed.
    place(crest, 1024, 720, ICON_BG).convert("RGB").save(OUT / "icon.png")
    # Android adaptive foreground: crest kept inside the 66% safe circle.
    place(crest, 1024, 520).save(OUT / "adaptive-icon.png")
    place(crest, 1024, 900).save(OUT / "splash-icon.png")
    place(crest, 196, 176, ICON_BG).save(OUT / "favicon.png")


if __name__ == "__main__":
    main()
