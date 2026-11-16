"""Draw the CHASE app icons: a lime zone ring with a player dot on the dark background."""
import sys
from PIL import Image, ImageDraw

BG = (11, 15, 20)
LIME = (198, 255, 61)


def icon(size: int, ring_ratio: float) -> Image.Image:
    scale = 4  # draw large, then shrink, for smooth edges
    s = size * scale
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    r = s * ring_ratio
    c = s / 2
    d.ellipse([c - r, c - r, c + r, c + r], outline=LIME, width=int(s * 0.075))
    dot = s * 0.075
    dx, dy = c + r * 0.3, c - r * 0.2
    d.ellipse([dx - dot, dy - dot, dx + dot, dy + dot], fill=LIME)
    return img.resize((size, size), Image.LANCZOS)


out = sys.argv[1]
icon(192, 0.30).save(f"{out}/icon-192.png")
icon(512, 0.30).save(f"{out}/icon-512.png")
icon(512, 0.24).save(f"{out}/icon-maskable-512.png")  # smaller ring: phones crop the edges
icon(180, 0.30).save(f"{out}/apple-touch-icon.png")
