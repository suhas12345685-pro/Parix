"""Generate Parix icon set from a single source render.

Produces:
  parix-1024.png  ← master, used to generate the rest
  parix.png       ← 512x512 RGBA (Linux + tray fallback)
  parix.ico       ← multi-res Windows icon (16/32/48/64/128/256)

For macOS .icns, run on a Mac after this script:
  python aegis/electron/icons/generate.py
  mkdir parix.iconset
  for size in 16 32 64 128 256 512 1024; do
    cp parix-$size.png parix.iconset/icon_${size}x${size}.png
  done
  iconutil -c icns parix.iconset -o parix.icns

The aesthetic is a pink-to-fuchsia gradient disc with a soft inner glow on
a deep-purple background, matching the Aegis UI palette in `aegis/src/`.
The center mark is a stylized "P" with an inset eye-dot — Parix is an
accessibility agent, so the eye is the moat.
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).parent
MASTER = 1024


def _radial_gradient(size: int, inner_rgba, outer_rgba):
    img = Image.new("RGBA", (size, size), outer_rgba)
    px = img.load()
    cx = cy = size / 2
    max_r = size / 2
    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            r = (dx * dx + dy * dy) ** 0.5
            t = min(1.0, r / max_r)
            px[x, y] = tuple(
                int(inner_rgba[i] * (1 - t) + outer_rgba[i] * t) for i in range(4)
            )
    return img


def _draw_master() -> Image.Image:
    bg = Image.new("RGBA", (MASTER, MASTER), (11, 11, 12, 255))

    disc = _radial_gradient(
        MASTER,
        inner_rgba=(244, 114, 182, 255),  # pink-400 ish
        outer_rgba=(126, 34, 206, 255),  # fuchsia-700 ish
    )

    mask = Image.new("L", (MASTER, MASTER), 0)
    ImageDraw.Draw(mask).ellipse((40, 40, MASTER - 40, MASTER - 40), fill=255)
    bg.paste(disc, (0, 0), mask)

    glow = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse(
        (160, 160, MASTER - 160, MASTER - 160),
        fill=(255, 255, 255, 60),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(80))
    bg = Image.alpha_composite(bg, glow)

    overlay = Image.new("RGBA", (MASTER, MASTER), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    font = None
    for candidate in (
        "C:/Windows/Fonts/segoeuib.ttf",
        "/System/Library/Fonts/SFNSDisplay-Bold.otf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ):
        if os.path.exists(candidate):
            try:
                font = ImageFont.truetype(candidate, 620)
                break
            except OSError:
                continue
    if font is None:
        font = ImageFont.load_default()

    text = "P"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (MASTER - tw) / 2 - bbox[0]
    ty = (MASTER - th) / 2 - bbox[1] - 30
    draw.text((tx, ty), text, fill=(255, 255, 255, 245), font=font)

    eye_cx = MASTER * 0.62
    eye_cy = MASTER * 0.43
    eye_r = 58
    draw.ellipse(
        (eye_cx - eye_r, eye_cy - eye_r, eye_cx + eye_r, eye_cy + eye_r),
        fill=(11, 11, 12, 255),
    )
    pupil_r = 22
    draw.ellipse(
        (eye_cx - pupil_r, eye_cy - pupil_r, eye_cx + pupil_r, eye_cy + pupil_r),
        fill=(244, 114, 182, 255),
    )

    return Image.alpha_composite(bg, overlay)


def main() -> int:
    master = _draw_master()
    master.save(HERE / "parix-1024.png", "PNG")

    sizes = [16, 32, 48, 64, 128, 256, 512, 1024]
    images = {}
    for s in sizes:
        img = master.resize((s, s), Image.LANCZOS)
        img.save(HERE / f"parix-{s}.png", "PNG")
        images[s] = img

    # Linux: a single 512 PNG works fine as a desktop icon.
    images[512].save(HERE / "parix.png", "PNG")

    # Windows .ico: bundle 16/32/48/64/128/256.
    ico_sizes = [16, 32, 48, 64, 128, 256]
    images[ico_sizes[-1]].save(
        HERE / "parix.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
    )

    print(f"Wrote: {sorted(os.listdir(HERE))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
