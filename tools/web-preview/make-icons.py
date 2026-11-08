"""
Draws the PWA app icons (Khoi the lantern on the cave background).

Usage:  python tools/web-preview/make-icons.py
Output: tools/web-preview/www/icons/icon-{192,512}.png and maskable-512.png
"""
import os

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'www', 'icons')
BG = (11, 15, 31)
WALL_EDGE = (54, 224, 200)
BODY = (229, 72, 77)
GLOW = (255, 179, 138)
DARK = (26, 16, 32)


def draw_icon(size: int, maskable: bool) -> Image.Image:
    s = size / 512
    img = Image.new('RGB', (size, size), BG)
    # Maskable icons must keep the art inside the central 80% safe zone.
    k = 0.72 if maskable else 1.0
    cx = cy = size / 2

    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([cx - 210 * s * k, cy - 210 * s * k, cx + 210 * s * k, cy + 210 * s * k],
                                 fill=GLOW + (110,))
    img.paste(glow.filter(ImageFilter.GaussianBlur(40 * s)), (0, 0), glow.filter(ImageFilter.GaussianBlur(40 * s)))

    d = ImageDraw.Draw(img)
    if not maskable:
        d.rounded_rectangle([12 * s, 12 * s, size - 12 * s, size - 12 * s], radius=90 * s, outline=WALL_EDGE,
                            width=int(14 * s))

    def box(x0, y0, x1, y1, r, fill):
        d.rounded_rectangle([cx + x0 * s * k, cy + y0 * s * k, cx + x1 * s * k, cy + y1 * s * k], radius=r * s * k,
                            fill=fill)

    box(-70, -165, 70, -125, 16, DARK)   # top cap
    box(-70, 125, 70, 165, 16, DARK)     # bottom cap
    box(-120, -135, 120, 135, 60, BODY)  # lantern body
    box(-38, -115, 38, 115, 34, GLOW)    # glowing rib
    box(-78, -20, -44, 40, 14, DARK)     # eyes
    box(44, -20, 78, 40, 14, DARK)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    draw_icon(192, False).save(os.path.join(OUT, 'icon-192.png'))
    draw_icon(512, False).save(os.path.join(OUT, 'icon-512.png'))
    draw_icon(512, True).save(os.path.join(OUT, 'maskable-512.png'))
    print('icons written to', OUT)


if __name__ == '__main__':
    main()
