"""PWA のアイコンを作る(docs/pwa-icon-generation-pattern.md の手順)。

付箋が3枚重なった絵。画面の付箋ボード(黄・緑・桃)の色に合わせている。
使い方: `python3 frontend/scripts/make-icons.py`(Pillow が要る)。frontend/public/ に書き出す。
背景は、透過ではなく、不透明にする(iOS のホーム画面は、透過を黒で塗るため)。
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public"
BG = (255, 255, 255, 255)
NOTES = [  # (色, 中心のずれ x, y, 角度)
    ((255, 241, 168, 255), (-0.16, -0.12), 8),   # 黄
    ((190, 235, 205, 255), (0.17, -0.02), -6),   # 緑
    ((255, 205, 225, 255), (-0.04, 0.20), 3),    # 桃
]
SHADOW = (0, 0, 0, 38)
INK = (60, 70, 85, 255)


def note(size: int, color, angle: float) -> Image.Image:
    """1枚の付箋(影と、文字の代わりの線つき)"""
    pad = int(size * 0.08)
    layer = Image.new("RGBA", (size + pad * 2, size + pad * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = int(size * 0.07)
    d.rounded_rectangle((pad + 6, pad + 10, pad + size + 6, pad + size + 10), r, fill=SHADOW)
    d.rounded_rectangle((pad, pad, pad + size, pad + size), r, fill=color)
    for i, w in enumerate((0.62, 0.50, 0.36)):
        y = pad + int(size * (0.30 + 0.17 * i))
        x = pad + int(size * 0.16)
        d.rounded_rectangle((x, y, x + int(size * w), y + max(6, int(size * 0.05))), 4, fill=INK)
    return layer.rotate(angle, resample=Image.BICUBIC, expand=True)


def make_icon(size: int, content_ratio: float, filename: str) -> None:
    canvas = Image.new("RGBA", (size, size), BG)
    unit = int(size * content_ratio * 0.56)
    for color, (dx, dy), angle in NOTES:
        layer = note(unit, color, angle)
        x = int(size / 2 + dx * size * content_ratio - layer.width / 2)
        y = int(size / 2 + dy * size * content_ratio - layer.height / 2)
        canvas.alpha_composite(layer, (x, y))
    canvas.convert("RGB").save(OUT / filename, "PNG")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    make_icon(512, 0.85, "icon-512.png")          # 通常(purpose: any)
    make_icon(192, 0.85, "icon-192.png")          # 通常(purpose: any)
    make_icon(180, 0.80, "apple-touch-icon.png")  # iOS Safari
    make_icon(512, 0.65, "icon-maskable-512.png") # maskable(広い安全マージン)
    make_icon(64, 0.95, "favicon.png")            # タブ
    print("done:", sorted(p.name for p in OUT.glob("*.png")))
