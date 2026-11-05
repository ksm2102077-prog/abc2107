"""E2E テスト用の合成スクショ（1290×2796 = iPhone 15 Pro Max と同じ大きさ）を作る。

実機と同じ位置関係（盤面の絵 = パネル上端から横幅の1.254倍、ラベル → キャラ中心のずれ）で描くので、
自動検出とキャラ検出の結果を数値で確かめられる。ゲームの画像は使っていない。

使い方: python3 tools/make_fixture.py
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'tests', 'fixtures', 'synthetic-1290x2796.png')

W, H = 1290, 2796
PANEL_TOP = 1900
LABEL_DY = 0.0565  # ラベル中心 → キャラ中心（横幅基準）

def main():
    img = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(img)
    img_top = round(PANEL_TOP - 1.254 * W)
    bottom = PANEL_TOP - 0.0102 * W
    top = bottom - 1.125 * W
    # 盤面の絵：縞模様の床
    for y in range(img_top, PANEL_TOP - 14):
        s = 120 + ((y // 40) % 2) * 18
        d.line([(0, y), (W, y)], fill=(s + 45, s, s - 45))
    d.rectangle([0, PANEL_TOP - 14, W, PANEL_TOP - 1], fill=(18, 22, 30))
    # 敵っぽい円
    for (fx, fy, fr, col) in [(0.6, 0.38, 0.17, (90, 150, 230)), (0.2, 0.3, 0.07, (120, 200, 255)), (0.85, 0.8, 0.065, (120, 200, 255))]:
        cx, cy, r = fx * W, top + fy * W, fr * W
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)
    # キャラ4体（ラベルは赤い文字の代わりに縦棒の列）
    for i, fx in enumerate([0.2, 0.4, 0.6, 0.8]):
        fy = 0.95 if i % 2 == 0 else 1.0
        cx, cy = fx * W, top + fy * W
        r = 0.082 * W
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(230, 220, 120), width=6, fill=(200, 180, 150))
        ly = cy - LABEL_DY * W
        hw, hh = 0.0425 * W, 0.017 * W
        x = cx - hw
        while x < cx + hw:
            d.rectangle([x, ly - hh, x + 6, ly + hh], fill=(205, 8, 8))
            x += 9
    # 黄色いパネルと中身
    d.rectangle([0, PANEL_TOP, W, PANEL_TOP + 560], fill=(255, 200, 18))
    d.rectangle([40, PANEL_TOP + 40, 900, PANEL_TOP + 90], fill=(40, 40, 40))
    d.rectangle([48, PANEL_TOP + 48, 700, PANEL_TOP + 82], fill=(90, 210, 70))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, optimize=True)
    print('wrote', OUT, img.size, 'top', round(top, 1), 'bottom', round(bottom, 1))

if __name__ == '__main__':
    main()
