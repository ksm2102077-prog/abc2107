'use strict';
// 実行: node --test tests/
// 実機のスクショは著作物なのでリポジトリに入れず、同じ配置の合成画像で検出ロジックを確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/detect.js');

function makeImage(w, h) {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
}
function fillRect(img, x0, y0, x1, y1, rgb) {
  for (let y = Math.max(0, y0); y < Math.min(img.height, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(img.width, x1); x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = 255;
    }
  }
}

// iPhone 15 Pro Max と同じ 1290×2796 で、実機と同じ比率の画面を作る
function syntheticScreen(panelTop, opts) {
  const o = Object.assign({ w: 1290, h: 2796, pillar: 0 }, opts);
  const img = makeImage(o.w, o.h);
  const L = o.pillar;
  const R = o.w - o.pillar;
  const W = R - L;
  const imgTop = Math.round(panelTop - 1.254 * W);
  // 盤面の絵（木の床っぽい茶色＋縞）
  for (let y = imgTop; y < panelTop - 12; y++) {
    const shade = 120 + ((y >> 4) % 2) * 20;
    fillRect(img, L, y, R, y + 1, [shade + 40, shade, shade - 40]);
  }
  fillRect(img, L, panelTop - 12, R, panelTop, [20, 24, 30]); // 暗い帯
  fillRect(img, L, panelTop, R, panelTop + 500, [255, 205, 20]); // 黄色いパネル
  fillRect(img, L + 40, panelTop + 40, L + 400, panelTop + 80, [60, 200, 60]); // HPゲージ
  return img;
}

test('黄色いパネルの上端を見つける（1290×2796）', () => {
  const img = syntheticScreen(1900);
  assert.equal(D.detectPanelTop(img), 1900);
});

test('盤面が収まらない位置の黄色は採用しない', () => {
  const img = makeImage(1290, 2796);
  fillRect(img, 0, 600, 1290, 700, [255, 205, 20]); // 上の方の黄色（盤面がはみ出す）
  fillRect(img, 0, 2000, 1290, 2400, [255, 205, 20]);
  assert.equal(D.detectPanelTop(img), 2000);
});

test('パネルから壁の位置を出す（縦横比 8:9）', () => {
  const g = D.fieldFromPanel(1900, 0, 1290);
  assert.equal(g.W, 1290);
  assert.ok(Math.abs(g.bottom - g.top - 1.125 * 1290) < 1e-9);
  assert.ok(Math.abs(1900 - g.bottom - 0.0102 * 1290) < 1e-9);
  assert.ok(Math.abs(1900 - g.imageTop - 1.254 * 1290) < 1e-9);
});

test('実機（1080×2340）で測った位置を再現する', () => {
  // 実機のスクショではパネル上端 = 1556 行目、上の壁 ≈ 330、下の壁 ≈ 1545
  const g = D.fieldFromPanel(1556, 0, 1080);
  assert.ok(Math.abs(g.top - 330) < 2, `top=${g.top}`);
  assert.ok(Math.abs(g.bottom - 1545) < 2, `bottom=${g.bottom}`);
});

test('左右の黒い帯を見つける', () => {
  const img = syntheticScreen(1900, { pillar: 60 });
  const a = D.analyze(img);
  assert.equal(a.found, true);
  assert.equal(a.field.left, 60);
  assert.equal(a.field.right, 1230);
});

test('パネルが無い画像は「見つからない」として推定値を返す', () => {
  const img = makeImage(1290, 2796);
  fillRect(img, 0, 0, 1290, 2796, [40, 120, 200]);
  const a = D.analyze(img);
  assert.equal(a.found, false);
  assert.ok(a.field.panelTop > 1290 && a.field.panelTop < 2796);
});

test('「1st」などの赤いラベルからキャラの中心を推定する', () => {
  const img = syntheticScreen(1900);
  const g = D.fieldFromPanel(1900, 0, 1290);
  // ラベル（横 0.085W・縦 0.034W）を2つ描く
  const W = 1290;
  const labels = [[0.3, 0.6], [0.7, 0.9]];
  for (const [fx, fy] of labels) {
    const cx = Math.round(fx * W);
    const cy = Math.round(g.top + fy * W);
    const hw = Math.round(0.0425 * W);
    const hh = Math.round(0.017 * W);
    // 文字のように縦棒を並べる
    for (let x = cx - hw; x < cx + hw; x += 9) fillRect(img, x, cy - hh, x + 6, cy + hh, [210, 10, 10]);
  }
  const found = D.detectLabels(img, g);
  assert.equal(found.length, 2);
  for (let i = 0; i < 2; i++) {
    const [fx, fy] = labels[i];
    const ballX = (found[i].x - g.left) / g.W;
    const ballY = (found[i].y - g.top) / g.W;
    assert.ok(Math.abs(ballX - fx) < 0.01, `x ${ballX} vs ${fx}`);
    assert.ok(Math.abs(ballY - (fy + D.GEOM.labelToBall.dy)) < 0.01, `y ${ballY}`);
  }
});

test('色がプレイヤー色（金・緑・青）でも見つける', () => {
  for (const rgb of [[230, 165, 10], [10, 160, 20], [10, 50, 200]]) {
    const img = syntheticScreen(1900);
    const g = D.fieldFromPanel(1900, 0, 1290);
    const cx = 645;
    const cy = Math.round(g.top + 0.5 * 1290);
    for (let x = cx - 50; x < cx + 50; x += 9) fillRect(img, x, cy - 21, x + 6, cy + 21, rgb);
    assert.equal(D.detectLabels(img, g).length, 1, `color ${rgb}`);
  }
});
