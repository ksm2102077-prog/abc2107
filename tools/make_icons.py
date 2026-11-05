"""アプリアイコンを生成する（オリジナルの図柄: 壁で跳ね返る光の線と自キャラの球）。

使い方: python3 tools/make_icons.py
出力: icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-512.png, icons/apple-touch-icon.png
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'icons')
S = 1024

INK_TOP = (24, 31, 62)
INK_BOT = (9, 12, 24)
GOLD = (255, 210, 63)
PINK = (255, 111, 216)
WALL = (92, 200, 255)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def background(size):
    img = Image.new('RGB', (size, size), INK_BOT)
    px = img.load()
    for y in range(size):
        c = lerp(INK_TOP, INK_BOT, y / (size - 1))
        for x in range(size):
            px[x, y] = c
    return img


def draw_art(img, pad):
    """pad: 図柄の外側の余白（0〜1、マスク対応アイコンでは大きめ）"""
    size = img.size[0]
    d = ImageDraw.Draw(img, 'RGBA')
    x0 = size * pad
    x1 = size * (1 - pad)
    y0 = size * pad
    y1 = size * (1 - pad)
    w = x1 - x0
    # 盤面の枠（壁）
    lw = max(4, int(size * 0.018))
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(w * 0.06), outline=WALL + (150,), width=lw)
    # 反射する線（中心が壁から少し内側で跳ね返る）
    m = w * 0.1
    pts = [
        (x0 + w * 0.30, y1 - m * 1.0),
        (x1 - m, y0 + w * 0.52),
        (x0 + w * 0.42, y0 + m),
        (x0 + m, y0 + w * 0.36),
        (x0 + w * 0.70, y1 - m * 1.9),
    ]
    glow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(len(pts) - 1):
        c = lerp(GOLD, PINK, i / (len(pts) - 2))
        gd.line([pts[i], pts[i + 1]], fill=c + (200,), width=int(size * 0.07))
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.03))
    img.paste(glow, (0, 0), glow)
    d = ImageDraw.Draw(img, 'RGBA')
    for i in range(len(pts) - 1):
        c = lerp(GOLD, PINK, i / (len(pts) - 2))
        d.line([pts[i], pts[i + 1]], fill=c + (255,), width=int(size * 0.034))
    for (px, py) in pts[1:-1]:
        r = size * 0.035
        d.ellipse([px - r, py - r, px + r, py + r], fill=(255, 255, 255, 255))
    # 自キャラの球
    bx, by = pts[0]
    r = size * 0.075
    d.ellipse([bx - r, by - r, bx + r, by + r], fill=GOLD + (255,), outline=(255, 245, 200, 255), width=int(size * 0.012))
    rr = r * 0.28
    d.ellipse([bx - rr - r * 0.25, by - rr - r * 0.3, bx + rr - r * 0.25, by + rr - r * 0.3], fill=(255, 255, 255, 220))
    # 矢じり（最後の線の先）
    ax, ay = pts[-1]
    px, py = pts[-2]
    ang = math.atan2(ay - py, ax - px)
    L = size * 0.07
    tip = (ax + math.cos(ang) * L * 0.3, ay + math.sin(ang) * L * 0.3)
    left = (ax + math.cos(ang + 2.5) * L, ay + math.sin(ang + 2.5) * L)
    right = (ax + math.cos(ang - 2.5) * L, ay + math.sin(ang - 2.5) * L)
    d.polygon([tip, left, right], fill=PINK + (255,))
    return img


def make(size, pad, name):
    big = background(S)
    draw_art(big, pad)
    out = big.resize((size, size), Image.LANCZOS)
    out.save(os.path.join(OUT, name), optimize=True)
    print('wrote', name, out.size)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    make(512, 0.14, 'icon-512.png')
    make(192, 0.14, 'icon-192.png')
    make(180, 0.14, 'apple-touch-icon.png')
    make(512, 0.24, 'icon-maskable-512.png')
