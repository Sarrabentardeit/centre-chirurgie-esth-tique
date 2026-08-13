"""Build transparent sidebar brand mark from brand-logo-teal.png."""
from pathlib import Path

import numpy as np
from PIL import Image

PUBLIC = Path(__file__).resolve().parents[1] / "public"
SRC = PUBLIC / "brand-logo-teal.png"


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    arr = np.array(im)
    opaque = arr[:, :, 3] > 40
    ys, xs = np.where(opaque)
    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())

    # Bust only (exclude wordmark + style-guide footer)
    bust_y1 = y0 + int((y1 - y0) * 0.52)
    bust = im.crop((x0, y0, x1 + 1, bust_y1))
    ba = np.array(bust).astype(np.float32)
    cream = (
        (ba[:, :, 0] > 180)
        & (ba[:, :, 1] > 150)
        & (ba[:, :, 2] > 140)
        & (ba[:, :, 3] > 40)
        & (np.abs(ba[:, :, 0] - ba[:, :, 1]) > 8)
    )
    ba[cream, 0], ba[cream, 1], ba[cream, 2] = 129, 87, 45
    bust_img = Image.fromarray(ba.astype(np.uint8), "RGBA")

    a = np.array(bust_img)[:, :, 3]
    ys, xs = np.where(a > 40)
    bust_img = bust_img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))

    w, h = bust_img.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(bust_img, ((side - w) // 2, (side - h) // 2), bust_img)
    canvas = canvas.resize((180, 180), Image.Resampling.LANCZOS)

    mark_path = PUBLIC / "brand-mark-sidebar.png"
    canvas.save(mark_path, optimize=True)
    print("saved", mark_path, canvas.size)


if __name__ == "__main__":
    main()
