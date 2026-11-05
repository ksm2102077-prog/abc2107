/*
 * 反射ガイド — スクショから盤面の位置を見つける
 *
 * 実機のスクショ（1080×2340 / 1080×1920 の Android 端末、計15枚）で測った値:
 *   ・盤面は画面の横幅いっぱい（左右の壁 = 画面の左右端）
 *   ・盤面の絵は、下の黄色いパネル（HP ゲージの枠）の上端から、横幅の 1.254 倍の高さ
 *   ・下の壁はパネル上端の少し上（横幅の 0.0102 倍）
 *   ・上の壁は下の壁から横幅の 1.125 倍上（縦横比 8:9）
 * 端末が違っても、盤面の絵とパネルの位置関係は同じ（横幅基準）だった。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.RG = root.RG || {};
    root.RG.detect = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GEOM = {
    imageAbovePanel: 1.254,
    bottomWallAbovePanel: 0.0102,
    fieldH: 1.125,
    // 「1st」などの赤いラベル中心 → キャラ中心のずれ（横幅基準）
    labelToBall: { dx: 0.002, dy: 0.0565 },
  };

  function isPanelYellow(r, g, b) {
    return r >= 225 && g >= 140 && b <= 135 && r - b >= 120;
  }

  function rowYellowFraction(img, y, step) {
    const { width: w, data } = img;
    let hit = 0;
    let tot = 0;
    const base = y * w * 4;
    for (let x = 0; x < w; x += step) {
      const i = base + x * 4;
      if (isPanelYellow(data[i], data[i + 1], data[i + 2])) hit++;
      tot++;
    }
    return tot ? hit / tot : 0;
  }

  /*
   * 下の黄色いパネルの上端（行番号）を返す。見つからなければ -1。
   * img: { width, height, data: RGBA 配列 }（ImageData と同じ形）
   */
  function detectPanelTop(img) {
    const w = img.width;
    const h = img.height;
    const step = Math.max(1, Math.floor(w / 200));
    const frac = new Float32Array(h);
    for (let y = 0; y < h; y++) frac[y] = rowYellowFraction(img, y, step);
    const run = Math.max(3, Math.round(w * 0.006));
    const gap = Math.max(4, Math.round(w * 0.008));
    const yMin = Math.round(h * 0.25);
    const yMax = h - run - 1;
    for (let y = yMin; y < yMax; y++) {
      if (frac[y] < 0.5) continue;
      let ok = true;
      for (let j = 1; j < run; j++) {
        if (frac[y + j] < 0.5) { ok = false; break; }
      }
      if (!ok) continue;
      let above = 0;
      for (let j = 0; j < gap; j++) above += frac[Math.max(0, y - 3 - j)];
      if (above / gap > 0.2) continue;
      if (y - GEOM.imageAbovePanel * w < -0.04 * w) continue; // 盤面が画面上にはみ出す位置は不採用
      return y;
    }
    return -1;
  }

  /* 左右に黒い帯（ピラーボックス）があるかを調べる */
  function detectSides(img, y0, y1) {
    const w = img.width;
    const { data } = img;
    const ys = [];
    const a = Math.max(0, Math.floor(y0));
    const b = Math.min(img.height - 1, Math.floor(y1));
    const n = 40;
    for (let k = 0; k < n; k++) ys.push(Math.round(a + ((b - a) * (k + 0.5)) / n));
    function colBright(x) {
      let s = 0;
      for (const y of ys) {
        const i = (y * w + x) * 4;
        s += data[i] + data[i + 1] + data[i + 2];
      }
      return s / (ys.length * 3);
    }
    let left = 0;
    while (left < w * 0.2 && colBright(left) < 6) left++;
    let right = w - 1;
    while (right > w * 0.8 && colBright(right) < 6) right--;
    if (left > w * 0.19) left = 0;
    if (right < w * 0.81) right = w - 1;
    return { left, right: right + 1 };
  }

  /* パネル上端と左右の端から、壁の位置（ピクセル）を計算する */
  function fieldFromPanel(panelTop, left, right) {
    const W = right - left;
    const bottom = panelTop - GEOM.bottomWallAbovePanel * W;
    const top = bottom - GEOM.fieldH * W;
    const imageTop = panelTop - GEOM.imageAbovePanel * W;
    return { left, right, W, top, bottom, imageTop, imageBottom: panelTop, panelTop };
  }

  /* 画面の縦横比だけから推定する（パネルが見つからない時の初期値） */
  function guessField(imgW, imgH) {
    // 1080×2340 の実機ではパネル上端が画面の 66.4%、1080×1920 では 74.6% の位置。
    // その間は「下の黒帯の量」に比例するとみなして補間する。
    const ratio = imgH / imgW;
    const t = Math.max(0, Math.min(1, (ratio - 1920 / 1080) / (2340 / 1080 - 1920 / 1080)));
    const pFrac = 0.746 + (0.664 - 0.746) * t;
    return fieldFromPanel(Math.round(imgH * pFrac), 0, imgW);
  }

  /*
   * 自キャラ・味方の「1st」「2nd」「3rd」「4th」の赤い文字を探して、キャラの中心を推定する。
   * 精度より手間の削減が目的（見つかったら候補として出すだけ）。
   */
  function detectLabels(img, field) {
    const w = img.width;
    const h = img.height;
    const { data } = img;
    const Wf = field.W;
    const y0 = Math.max(0, Math.floor(field.top - 0.06 * Wf));
    const y1 = Math.min(h - 1, Math.floor(field.bottom));
    const x0 = Math.max(0, Math.floor(field.left));
    const x1 = Math.min(w - 1, Math.floor(field.right) - 1);
    const mw = x1 - x0 + 1;
    const mh = y1 - y0 + 1;
    if (mw <= 0 || mh <= 0) return [];
    // ラベルの文字色はプレイヤー色（赤・金・緑・青）のどれか。色ごとに分類しておく。
    const cls = new Uint8Array(mw * mh);
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const i = ((y + y0) * w + (x + x0)) * 4;
        cls[y * mw + x] = labelColorClass(data[i], data[i + 1], data[i + 2]);
      }
    }
    const out = [];
    for (let c = 1; c <= 4; c++) collectLabels(cls, c, mw, mh, x0, y0, Wf, out);
    // 左から順に並べ、近すぎる重複や盤面の外になるものを除く
    out.sort((a, b) => a.x - b.x);
    const uniq = [];
    for (const c of out) {
      if (c.y < field.top || c.y > field.bottom + 0.01 * Wf) continue;
      if (!uniq.some((u) => Math.hypot(u.x - c.x, u.y - c.y) < 0.05 * Wf)) uniq.push(c);
    }
    return uniq.slice(0, 4);
  }

  /* 1=赤 2=金 3=緑 4=青 0=その他 */
  function labelColorClass(r, g, b) {
    if (r > 110 && g < 60 && b < 60 && r - Math.max(g, b) > 90) return 1;
    if (r > 130 && g > 80 && b < 40 && r - b > 110 && r > g && g > r * 0.45) return 2;
    if (g > 90 && r < 50 && b < 60 && g - Math.max(r, b) > 70) return 3;
    if (b > 90 && r < 40 && g < 100 && b - r > 80 && b > g) return 4;
    return 0;
  }

  function collectLabels(cls, c, mw, mh, x0, y0, Wf, out) {
    const mask = new Uint8Array(mw * mh);
    for (let k = 0; k < mask.length; k++) if (cls[k] === c) mask[k] = 1;
    // 文字同士をつなげるため横方向に膨らませる
    const dil = Math.max(1, Math.round(Wf * 0.0055));
    const grown = new Uint8Array(mw * mh);
    for (let y = 0; y < mh; y++) {
      let lastOn = -1e9;
      const row = y * mw;
      for (let x = 0; x < mw; x++) {
        if (mask[row + x]) lastOn = x;
        if (x - lastOn <= dil) grown[row + x] = 1;
      }
      lastOn = 1e9;
      for (let x = mw - 1; x >= 0; x--) {
        if (mask[row + x]) lastOn = x;
        if (lastOn - x <= dil) grown[row + x] = 1;
      }
    }
    const seen = new Uint8Array(mw * mh);
    const stack = [];
    for (let s = 0; s < mw * mh; s++) {
      if (!grown[s] || seen[s]) continue;
      let minX = 1e9;
      let maxX = -1;
      let minY = 1e9;
      let maxY = -1;
      let n = 0;
      stack.length = 0;
      stack.push(s);
      seen[s] = 1;
      while (stack.length) {
        const p = stack.pop();
        const py = (p / mw) | 0;
        const px = p - py * mw;
        if (mask[p]) n++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        if (px > 0 && grown[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
        if (px < mw - 1 && grown[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
        if (py > 0 && grown[p - mw] && !seen[p - mw]) { seen[p - mw] = 1; stack.push(p - mw); }
        if (py < mh - 1 && grown[p + mw] && !seen[p + mw]) { seen[p + mw] = 1; stack.push(p + mw); }
      }
      const bw = (maxX - minX + 1) / Wf;
      const bh = (maxY - minY + 1) / Wf;
      const fill = n / (Wf * Wf);
      if (bw >= 0.064 && bw <= 0.1 && bh >= 0.029 && bh <= 0.041 && fill > 0.0004) {
        const cx = x0 + (minX + maxX) / 2;
        const cy = y0 + (minY + maxY) / 2;
        out.push({
          labelX: cx,
          labelY: cy,
          x: cx + GEOM.labelToBall.dx * Wf,
          y: cy + GEOM.labelToBall.dy * Wf,
          w: bw,
          h: bh,
          color: ['', 'red', 'gold', 'green', 'blue'][c],
        });
      }
    }
  }

  /* まとめて実行 */
  function analyze(img) {
    const panelTop = detectPanelTop(img);
    let field;
    let found = false;
    if (panelTop >= 0) {
      const approx = fieldFromPanel(panelTop, 0, img.width);
      const sides = detectSides(img, Math.max(0, approx.top), approx.bottom);
      field = fieldFromPanel(panelTop, sides.left, sides.right);
      found = true;
    } else {
      field = guessField(img.width, img.height);
    }
    let labels = [];
    if (found) {
      try { labels = detectLabels(img, field); } catch (e) { labels = []; }
    }
    return { found, field, labels };
  }

  return { GEOM, isPanelYellow, detectPanelTop, detectSides, fieldFromPanel, guessField, detectLabels, analyze };
});
