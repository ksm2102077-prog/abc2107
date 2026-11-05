/*
 * 反射ガイド — 画面と操作
 */
(function () {
  'use strict';

  const RG = window.RG;
  const P = RG.physics;
  const D = RG.detect;
  const S = RG.store;
  const VERSION = '1.0.0';

  const GEOM = D.GEOM;
  const FIELD_H = P.FIELD_H;
  // 表示範囲 = スクショの盤面の絵の範囲（上の壁より少し上〜下の壁より少し下）
  const VIEW_TOP = -(GEOM.imageAbovePanel - GEOM.bottomWallAbovePanel - GEOM.fieldH);
  const VIEW_H = GEOM.imageAbovePanel;
  const VIEW_BOTTOM = VIEW_TOP + VIEW_H;

  const ENEMY_PRESETS = [
    { label: '小', r: 0.05 },
    { label: '中', r: 0.08 },
    { label: '大', r: 0.12 },
    { label: '特大', r: 0.18 },
  ];
  const BLOCK_DEFAULT = 0.13;
  const JOG_DEG_PER_PX = 0.02;
  const MAX_BOUNCES = 60;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  /* ---------- 色（CSS のトークンから読む） ---------- */
  const C = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['ink', 'deck', 'line', 'text', 'muted', 'accent', 'guide', 'guide-hot', 'enemy', 'block', 'ally', 'danger']) {
      C[k] = cs.getPropertyValue('--' + k).trim() || '#fff';
    }
    C.font = cs.getPropertyValue('--font-num').trim() || 'system-ui';
  }
  function hexToRgb(h) {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    if (!m) return [255, 255, 255];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }
  function mix(h1, h2, t) {
    const a = hexToRgb(h1);
    const b = hexToRgb(h2);
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  /* ---------- 状態 ---------- */
  let uid = 1;
  const newId = (p) => p + Date.now().toString(36) + (uid++).toString(36);

  function defaultSettings() {
    return {
      maxBounces: 10,
      control: 'pull',
      showNumbers: true,
      showBand: false,
      showPull: false,
      showVisual: true,
      ballR: P.BALL_R,
    };
  }

  function sampleState() {
    return {
      v: 1,
      sample: true,
      ball: { x: 0.24, y: 1.02, kind: 'reflect', antiBlock: false },
      angle: 58,
      enemies: [
        { id: 'e-boss', x: 0.6, y: 0.4, r: 0.17, mode: 'auto' },
        { id: 'e-a', x: 0.17, y: 0.27, r: 0.07, mode: 'auto' },
        { id: 'e-b', x: 0.86, y: 0.82, r: 0.065, mode: 'auto' },
      ],
      blocks: [{ id: 'b-1', x: 0.38, y: 0.74, w: BLOCK_DEFAULT, h: BLOCK_DEFAULT }],
      allies: [
        { id: 'a-1', x: 0.5, y: 0.99 },
        { id: 'a-2', x: 0.78, y: 1.04 },
      ],
      settings: defaultSettings(),
      image: null,
    };
  }

  let state = sampleState();

  const rt = {
    img: null,
    imgKey: null,
    mode: 'aim',
    sel: null,
    zoom: { z: 1, x0: 0, y0: VIEW_TOP },
    pointers: new Map(),
    gesture: null,
    candidates: [],
    trace: null,
    undo: [],
    redo: [],
    cssW: 0,
    cssH: 0,
    dpr: 1,
    pending: false,
    pull: null,
    toastTimer: 0,
  };

  /* ---------- 盤面の幾何 ---------- */
  function fieldGeom() {
    if (!state.image || !state.image.calib) return null;
    const c = state.image.calib;
    return D.fieldFromPanel(c.panelTop, c.left, c.right);
  }
  function kNow() { return rt.cssW * rt.zoom.z; }
  function toCss(x, y) {
    const k = kNow();
    return { x: (x - rt.zoom.x0) * k, y: (y - rt.zoom.y0) * k };
  }
  function toField(cx, cy) {
    const k = kNow();
    return { x: rt.zoom.x0 + cx / k, y: rt.zoom.y0 + cy / k };
  }
  function clampZoom() {
    const z = Math.max(1, Math.min(6, rt.zoom.z));
    rt.zoom.z = z;
    rt.zoom.x0 = Math.max(0, Math.min(1 - 1 / z, rt.zoom.x0));
    rt.zoom.y0 = Math.max(VIEW_TOP, Math.min(VIEW_BOTTOM - VIEW_H / z, rt.zoom.y0));
    $('#btnZoomReset').hidden = z <= 1.001;
  }
  function resetZoom() {
    rt.zoom = { z: 1, x0: 0, y0: VIEW_TOP };
    clampZoom();
    requestDraw();
  }

  function ballR() { return state.settings.ballR > 0 ? state.settings.ballR : P.BALL_R; }

  function clampBall() {
    const r = ballR();
    state.ball.x = P.clamp(state.ball.x, r, 1 - r);
    state.ball.y = P.clamp(state.ball.y, r, FIELD_H - r);
  }

  /* ---------- 軌道 ---------- */
  function computeTrace() {
    rt.trace = P.trace(
      {
        ball: { x: state.ball.x, y: state.ball.y, r: ballR(), kind: state.ball.kind, antiBlock: state.ball.antiBlock },
        angle: state.angle,
        enemies: state.enemies,
        blocks: state.blocks,
        allies: state.allies.map((a) => ({ id: a.id, x: a.x, y: a.y, r: ballR() })),
      },
      { maxBounces: state.settings.maxBounces }
    );
    return rt.trace;
  }

  /* ---------- 描画 ---------- */
  const cv = $('#board');
  const ctx = cv.getContext('2d');

  function requestDraw() {
    if (rt.pending) return;
    rt.pending = true;
    requestAnimationFrame(() => {
      rt.pending = false;
      draw();
    });
  }

  function layout() {
    const stage = $('#stage');
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    if (!sw || !sh) return;
    let w = sw;
    let h = Math.round(w * VIEW_H);
    if (h > sh) {
      h = sh;
      w = Math.round(h / VIEW_H);
    }
    rt.cssW = w;
    rt.cssH = h;
    rt.dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.style.width = w + 'px';
    cv.style.height = h + 'px';
    cv.width = Math.round(w * rt.dpr);
    cv.height = Math.round(h * rt.dpr);
    $('#boardWrap').style.width = w + 'px';
    requestDraw();
  }

  function drawImageView(g) {
    const img = rt.img;
    const iw = state.image.w;
    const ih = state.image.h;
    const z = rt.zoom.z;
    // 表示窓（盤面座標）→ 元画像の座標
    let sx = g.left + rt.zoom.x0 * g.W;
    let sy = g.top + rt.zoom.y0 * g.W;
    let sw = g.W / z;
    let sh = (VIEW_H * g.W) / z;
    let dx = 0;
    let dy = 0;
    let dw = rt.cssW;
    let dh = rt.cssH;
    const kx = dw / sw;
    const ky = dh / sh;
    if (sx < 0) { dx -= sx * kx; dw += sx * kx; sw += sx; sx = 0; }
    if (sy < 0) { dy -= sy * ky; dh += sy * ky; sh += sy; sy = 0; }
    if (sx + sw > iw) { const over = sx + sw - iw; sw -= over; dw -= over * kx; }
    if (sy + sh > ih) { const over = sy + sh - ih; sh -= over; dh -= over * ky; }
    if (sw > 0 && sh > 0 && dw > 0 && dh > 0) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    }
  }

  function drawBlankBoard() {
    const k = kNow();
    const a = toCss(0, 0);
    const b = toCss(1, FIELD_H);
    const grd = ctx.createLinearGradient(0, a.y, 0, b.y);
    grd.addColorStop(0, '#141a33');
    grd.addColorStop(1, '#0e1326');
    ctx.fillStyle = grd;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    // 8×9 のマス目（1マス = 横幅の1/8）
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(150,165,220,0.10)';
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      const x = toCss(i / 8, 0).x;
      ctx.moveTo(x, a.y);
      ctx.lineTo(x, b.y);
    }
    for (let j = 1; j < 9; j++) {
      const y = toCss(0, j / 8).y;
      ctx.moveTo(a.x, y);
      ctx.lineTo(b.x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150,165,220,0.18)';
    ctx.beginPath();
    const cx = toCss(0.5, 0).x;
    ctx.moveTo(cx, a.y);
    ctx.lineTo(cx, b.y);
    ctx.stroke();
    void k;
  }

  function drawFieldFrame() {
    const a = toCss(0, 0);
    const b = toCss(1, FIELD_H);
    // 盤面の外（上の壁より上・下の壁より下）を暗くする
    ctx.fillStyle = 'rgba(4,6,14,0.48)';
    if (a.y > 0) ctx.fillRect(0, 0, rt.cssW, a.y);
    if (b.y < rt.cssH) ctx.fillRect(0, b.y, rt.cssW, rt.cssH - b.y);
    ctx.strokeStyle = rgba(C.accent, 0.55);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(0, a.y);
    ctx.lineTo(rt.cssW, a.y);
    ctx.moveTo(0, b.y);
    ctx.lineTo(rt.cssW, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
  }

  function badge(x, y, text, bg, fg) {
    ctx.font = `800 11px ${C.font}`;
    const w = Math.max(18, ctx.measureText(text).width + 10);
    const h = 17;
    ctx.fillStyle = bg;
    roundRect(x - w / 2, y - h / 2, w, h, 8.5);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 0.5);
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawObjects(tr) {
    const k = kNow();
    const editing = rt.mode === 'edit';
    // ブロック
    state.blocks.forEach((b, i) => {
      const p = toCss(b.x - b.w / 2, b.y - b.h / 2);
      const w = b.w * k;
      const h = b.h * k;
      ctx.fillStyle = rgba(C.block, state.ball.antiBlock ? 0.08 : 0.2);
      ctx.fillRect(p.x, p.y, w, h);
      ctx.strokeStyle = rgba(C.block, 0.95);
      ctx.lineWidth = 2;
      if (state.ball.antiBlock) ctx.setLineDash([5, 4]);
      ctx.strokeRect(p.x, p.y, w, h);
      ctx.setLineDash([]);
      if (editing) {
        ctx.fillStyle = rgba(C.block, 0.95);
        ctx.font = `800 11px ${C.font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('B' + (i + 1), p.x + w / 2, p.y + h / 2);
      }
    });
    // 敵
    state.enemies.forEach((e, i) => {
      const p = toCss(e.x, e.y);
      const r = e.r * k;
      const solid = e.mode === 'bounce' || (e.mode !== 'pass' && state.ball.kind !== 'pierce');
      circle(p.x, p.y, r);
      ctx.fillStyle = rgba(C.enemy, solid ? 0.16 : 0.07);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(C.enemy, 0.95);
      if (!solid) ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (e.mode === 'bounce' && state.ball.kind === 'pierce') {
        circle(p.x, p.y, Math.max(1, r - 4));
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      if (editing) {
        ctx.fillStyle = rgba(C.enemy, 1);
        ctx.font = `800 12px ${C.font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), p.x, p.y);
      }
      const hits = tr && tr.enemyHits[e.id];
      if (hits) {
        const bx = p.x + r * 0.72;
        const by = p.y - r * 0.72;
        badge(bx, by, '×' + hits, C.enemy, '#1a0508');
      }
    });
    // 味方
    const touched = new Map();
    if (tr) tr.allyTouches.forEach((t, i) => touched.set(t.id, i + 1));
    const rb = ballR() * k;
    state.allies.forEach((a) => {
      const p = toCss(a.x, a.y);
      const on = touched.has(a.id);
      if (state.settings.showVisual) {
        circle(p.x, p.y, P.VISUAL_R * k);
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = rgba(C.ally, 0.6);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      circle(p.x, p.y, rb);
      ctx.fillStyle = rgba(C.ally, on ? 0.42 : 0.16);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(C.ally, 1);
      ctx.stroke();
      if (on) badge(p.x, p.y - Math.max(rb, P.VISUAL_R * k * 0.8) - 4, '友情' + touched.get(a.id), C.ally, '#03160d');
    });
  }

  function drawPath(tr) {
    if (!tr) return;
    const pts = tr.points.map((p) => toCss(p.x, p.y));
    const n = Math.max(1, pts.length - 1);
    const k = kNow();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (state.settings.showBand && pts.length > 1) {
      ctx.strokeStyle = rgba(C.guide, 0.13);
      ctx.lineWidth = 2 * ballR() * k;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (tr.tail) { const t = toCss(tr.tail.bx, tr.tail.by); ctx.lineTo(t.x, t.y); }
      ctx.stroke();
    }
    // 縁取り
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    // 続き（規定回数の先）
    if (tr.tail) {
      const a = toCss(tr.tail.ax, tr.tail.ay);
      const b = toCss(tr.tail.bx, tr.tail.by);
      const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      g.addColorStop(0, rgba(C['guide-hot'], 0.7));
      g.addColorStop(1, rgba(C['guide-hot'], 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 本線（反射ごとに 金 → ピンク）
    for (let i = 0; i + 1 < pts.length; i++) {
      ctx.strokeStyle = mix(C.guide, C['guide-hot'], n > 1 ? i / (n - 1) : 0);
      ctx.lineWidth = i === 0 ? 3.6 : 2.6;
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.stroke();
      const sx = pts[i + 1].x - pts[i].x;
      const sy = pts[i + 1].y - pts[i].y;
      const len = Math.hypot(sx, sy);
      if (len > 46) chevron((pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2, sx / len, sy / len, ctx.strokeStyle);
    }
    // 最初の向きをまっすぐ伸ばした線（最初に当たるのが敵やブロックの時だけ）
    const b0 = tr.bounces[0];
    if (b0 && b0.type !== 'wall' && tr.aim) {
      const a = toCss(b0.x, b0.y);
      const e = toCss(tr.aim.x, tr.aim.y);
      ctx.strokeStyle = rgba(C.guide, 0.45);
      ctx.lineWidth = 1.4;
      ctx.setLineDash([2, 5]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      ctx.setLineDash([]);
      circle(e.x, e.y, 4);
      ctx.fillStyle = rgba(C.guide, 0.7);
      ctx.fill();
    }
    // 反射点（重なった時に若い番号が上に来るよう、後ろから描く）
    const showNum = state.settings.showNumbers;
    for (let i = tr.bounces.length - 1; i >= 0; i--) {
      const b = tr.bounces[i];
      const p = toCss(b.x, b.y);
      const col = mix(C.guide, C['guide-hot'], tr.bounces.length > 1 ? i / (tr.bounces.length - 1) : 0);
      if (i === 0) {
        circle(p.x, p.y, 11);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const rr = showNum && i < 40 ? 8 : 4;
      circle(p.x, p.y, rr);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.stroke();
      if (showNum && i < 40) {
        ctx.fillStyle = '#16110a';
        ctx.font = `800 ${i >= 9 ? 9 : 10.5}px ${C.font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), p.x, p.y + 0.5);
      }
    }
  }

  function chevron(x, y, ux, uy, color) {
    const s = 5.5;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - ux * s - uy * s * 0.8, y - uy * s + ux * s * 0.8);
    ctx.lineTo(x + ux * s * 0.6, y + uy * s * 0.6);
    ctx.lineTo(x - ux * s + uy * s * 0.8, y - uy * s - ux * s * 0.8);
    ctx.stroke();
    ctx.restore();
  }

  function drawBall() {
    const k = kNow();
    const p = toCss(state.ball.x, state.ball.y);
    const r = ballR() * k;
    if (state.settings.showVisual) {
      circle(p.x, p.y, P.VISUAL_R * k);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rgba(C.guide, 0.75);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    circle(p.x, p.y, r);
    ctx.fillStyle = rgba(C.guide, 0.3);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = C.guide;
    ctx.stroke();
    circle(p.x, p.y, 2.5);
    ctx.fillStyle = '#fff';
    ctx.fill();
    // ゲームの矢印のような向き表示
    const d = P.dirFromDeg(state.angle);
    const L = Math.max(r + 16, P.VISUAL_R * k + 10);
    const tip = { x: p.x + d.x * L, y: p.y + d.y * L };
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(p.x + d.x * r, p.y + d.y * r);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(tip.x + d.x * 8, tip.y + d.y * 8);
    ctx.lineTo(tip.x - d.y * 6, tip.y + d.x * 6);
    ctx.lineTo(tip.x + d.y * 6, tip.y - d.x * 6);
    ctx.closePath();
    ctx.fill();
  }

  function drawPull() {
    const g = rt.gesture;
    const showAlways = state.settings.showPull;
    if (g && g.type === 'aim' && g.active && state.settings.control === 'pull') {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(g.sx, g.sy);
      ctx.lineTo(g.cx, g.cy);
      ctx.stroke();
      ctx.setLineDash([]);
      circle(g.sx, g.sy, 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.stroke();
    }
    if (showAlways) {
      const p = toCss(state.ball.x, state.ball.y);
      const d = P.dirFromDeg(state.angle);
      const L = 0.32 * kNow();
      ctx.strokeStyle = rgba(C.accent, 0.8);
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - d.x * L, p.y - d.y * L);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = rgba(C.accent, 0.9);
      ctx.font = `700 11px ${C.font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('引く', p.x - d.x * (L + 12), p.y - d.y * (L + 12));
    }
  }

  function drawCandidates() {
    if (!rt.candidates.length) return;
    const k = kNow();
    rt.candidates.forEach((c, i) => {
      const p = toCss(c.x, c.y);
      circle(p.x, p.y, P.VISUAL_R * k);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(C.accent, 0.95);
      ctx.stroke();
      ctx.setLineDash([]);
      badge(p.x, p.y, String(i + 1), C.accent, '#04121e');
    });
  }

  function selectedObj() {
    const s = rt.sel;
    if (!s) return null;
    if (s.type === 'ball') return state.ball;
    const list = s.type === 'enemy' ? state.enemies : s.type === 'block' ? state.blocks : state.allies;
    return list.find((o) => o.id === s.id) || null;
  }

  function handlePos() {
    const s = rt.sel;
    const o = selectedObj();
    if (!o) return null;
    if (s.type === 'enemy') return { x: o.x + o.r, y: o.y };
    if (s.type === 'block') return { x: o.x + o.w / 2, y: o.y + o.h / 2 };
    return null;
  }

  function drawSelection() {
    const s = rt.sel;
    const o = selectedObj();
    if (!s || !o || rt.mode !== 'edit') return;
    const k = kNow();
    const p = toCss(o.x, o.y);
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    if (s.type === 'block') {
      const a = toCss(o.x - o.w / 2, o.y - o.h / 2);
      ctx.strokeRect(a.x - 4, a.y - 4, o.w * k + 8, o.h * k + 8);
    } else {
      const r = (s.type === 'enemy' ? o.r : Math.max(ballR(), P.VISUAL_R)) * k + 5;
      circle(p.x, p.y, r);
      ctx.stroke();
    }
    const h = handlePos();
    if (h) {
      const hp = toCss(h.x, h.y);
      circle(hp.x, hp.y, 10);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.accent;
      ctx.stroke();
      // 拡大縮小の記号
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(hp.x - 4, hp.y);
      ctx.lineTo(hp.x + 4, hp.y);
      ctx.moveTo(hp.x, hp.y - 4);
      ctx.lineTo(hp.x, hp.y + 4);
      ctx.stroke();
    }
  }

  function draw() {
    if (!rt.cssW) return;
    ctx.setTransform(rt.dpr, 0, 0, rt.dpr, 0, 0);
    ctx.clearRect(0, 0, rt.cssW, rt.cssH);
    ctx.fillStyle = '#070912';
    ctx.fillRect(0, 0, rt.cssW, rt.cssH);
    const g = fieldGeom();
    if (rt.img && g) drawImageView(g);
    else drawBlankBoard();
    drawFieldFrame();
    const tr = computeTrace();
    drawObjects(tr);
    drawPath(tr);
    drawCandidates();
    drawBall();
    drawPull();
    drawSelection();
    updateAimPanel(tr);
  }

  /* ---------- 照準パネル ---------- */
  function enemyName(id) {
    const i = state.enemies.findIndex((e) => e.id === id);
    return i >= 0 ? '敵' + (i + 1) : '敵';
  }
  function blockName(id) {
    const i = state.blocks.findIndex((b) => b.id === id);
    return i >= 0 ? 'ブロック' + (i + 1) : 'ブロック';
  }
  function allyName(id) {
    const i = state.allies.findIndex((a) => a.id === id);
    return i >= 0 ? '味方' + (i + 1) : '味方';
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let lastPanelKey = '';
  function updateAimPanel(tr) {
    const a = P.normDeg(state.angle);
    $('#angleOut').textContent = a.toFixed(1) + '°';
    $('#dialNeedle').style.transform = `rotate(${a}deg)`;
    $('#jog').setAttribute('aria-valuenow', a.toFixed(1));
    $('#bounceOut').textContent = String(state.settings.maxBounces);
    if (!tr) return;
    const b0 = tr.bounces[0];
    let html = '—';
    if (b0) {
      if (b0.type === 'wall') {
        const d = P.describeWallPoint(b0.side, b0.x, b0.y);
        html = `最初に当たる <b>${d.wall}</b> <span class="hl">${d.where}</span>`;
      } else {
        const who = b0.type === 'enemy' ? enemyName(b0.id) : blockName(b0.id);
        html = `最初に当たる <b>${who}</b>`;
        if (tr.aim) {
          const d = P.describeWallPoint(tr.aim.side, tr.aim.x, tr.aim.y);
          html += `<br>まっすぐ先は ${d.wall} <span class="hl">${d.where}</span>`;
        }
      }
    }
    const parts = [];
    state.enemies.forEach((e) => {
      const h = tr.enemyHits[e.id];
      if (h) parts.push(`<span class="tag enemy"><span class="dot"></span>${enemyName(e.id)} ×${h}</span>`);
    });
    tr.allyTouches.forEach((t) => parts.push(`<span class="tag ally"><span class="dot"></span>${allyName(t.id)} 友情</span>`));
    if (!parts.length) parts.push('<span class="tag muted">この軌道では敵にも味方にも当たりません</span>');
    if (tr.stopReason === 'stuck') parts.push('<span class="tag muted">挟まって動けない位置です</span>');
    const key = html + '|' + parts.join('');
    if (key !== lastPanelKey) {
      lastPanelKey = key;
      $('#firstHit').innerHTML = html;
      $('#summary').innerHTML = parts.join('');
    }
  }

  function setAngle(a, commit) {
    state.angle = P.normDeg(a);
    requestDraw();
    if (commit) scheduleSave();
  }

  /* ---------- 配置パネル ---------- */
  function renderProps() {
    const box = $('#props');
    const s = rt.sel;
    const o = selectedObj();
    $('#selBall').classList.toggle('is-on', !!(s && s.type === 'ball'));
    if (!s || !o) {
      box.innerHTML = `<div class="props-hint">盤面の物をタップで選び、ドラッグで動かします。敵とブロックは白い丸をドラッグすると大きさが変わります。2本指で拡大・移動。</div>`;
      return;
    }
    if (s.type === 'ball') {
      box.innerHTML = `
        <div class="props-head"><div class="props-title"><span class="swatch sw-ball"></span>自キャラ</div></div>
        <div class="prop-row"><span class="prop-label">タイプ</span>
          <div class="chips">
            <button type="button" class="chip-opt ${state.ball.kind === 'reflect' ? 'is-on' : ''}" data-prop="kind" data-val="reflect">反射</button>
            <button type="button" class="chip-opt ${state.ball.kind === 'pierce' ? 'is-on' : ''}" data-prop="kind" data-val="pierce">貫通</button>
            <button type="button" class="chip-opt ${state.ball.antiBlock ? 'is-on' : ''}" data-prop="antiBlock">アンチブロック</button>
          </div>
        </div>
        <div class="props-hint">スクショのキャラに点線の円を合わせてください。実線の円が当たり判定です。</div>`;
      return;
    }
    if (s.type === 'enemy') {
      const idx = state.enemies.indexOf(o) + 1;
      box.innerHTML = `
        <div class="props-head"><div class="props-title"><span class="swatch sw-enemy"></span>敵${idx}</div>
          <div class="props-actions"><button type="button" class="chip-opt" data-act="dup">複製</button><button type="button" class="chip-opt danger" data-act="del">削除</button></div></div>
        <div class="prop-row"><span class="prop-label">大きさ</span><input type="range" id="propR" min="0.015" max="0.45" step="0.001" value="${o.r}" aria-label="敵の大きさ"><output class="prop-val" id="propROut">${(o.r * 100).toFixed(1)}</output></div>
        <div class="prop-row"><span class="prop-label"></span><div class="chips">${ENEMY_PRESETS.map((p) => `<button type="button" class="chip-opt" data-preset="${p.r}">${p.label}</button>`).join('')}</div></div>
        <div class="prop-row"><span class="prop-label">跳ね方</span><div class="chips">
          <button type="button" class="chip-opt ${o.mode === 'auto' ? 'is-on' : ''}" data-prop="mode" data-val="auto">タイプどおり</button>
          <button type="button" class="chip-opt ${o.mode === 'bounce' ? 'is-on' : ''}" data-prop="mode" data-val="bounce">跳ね返る</button>
          <button type="button" class="chip-opt ${o.mode === 'pass' ? 'is-on' : ''}" data-prop="mode" data-val="pass">すり抜け</button>
        </div></div>`;
      return;
    }
    if (s.type === 'block') {
      const idx = state.blocks.indexOf(o) + 1;
      box.innerHTML = `
        <div class="props-head"><div class="props-title"><span class="swatch sw-block"></span>ブロック${idx}</div>
          <div class="props-actions"><button type="button" class="chip-opt" data-act="square">正方形に</button><button type="button" class="chip-opt" data-act="dup">複製</button><button type="button" class="chip-opt danger" data-act="del">削除</button></div></div>
        <div class="prop-row"><span class="prop-label">横</span><input type="range" id="propW" min="0.03" max="1" step="0.001" value="${o.w}" aria-label="ブロックの横幅"><output class="prop-val" id="propWOut">${(o.w * 100).toFixed(1)}</output></div>
        <div class="prop-row"><span class="prop-label">縦</span><input type="range" id="propH" min="0.03" max="1.125" step="0.001" value="${o.h}" aria-label="ブロックの縦幅"><output class="prop-val" id="propHOut">${(o.h * 100).toFixed(1)}</output></div>`;
      return;
    }
    if (s.type === 'ally') {
      const idx = state.allies.indexOf(o) + 1;
      box.innerHTML = `
        <div class="props-head"><div class="props-title"><span class="swatch sw-ally"></span>味方${idx}</div>
          <div class="props-actions"><button type="button" class="chip-opt danger" data-act="del">削除</button></div></div>
        <div class="props-hint">味方は線を曲げません。触れると「友情」と表示されます。</div>`;
    }
  }

  function bindProps() {
    const box = $('#props');
    box.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const o = selectedObj();
      const s = rt.sel;
      if (!o || !s) return;
      const pre = snapshot();
      if (btn.dataset.prop === 'kind') {
        state.ball.kind = btn.dataset.val;
        syncKindButtons();
      } else if (btn.dataset.prop === 'antiBlock') {
        state.ball.antiBlock = !state.ball.antiBlock;
      } else if (btn.dataset.prop === 'mode') {
        o.mode = btn.dataset.val;
      } else if (btn.dataset.preset) {
        o.r = parseFloat(btn.dataset.preset);
      } else if (btn.dataset.act === 'del') {
        deleteSelected();
      } else if (btn.dataset.act === 'dup') {
        duplicateSelected();
      } else if (btn.dataset.act === 'square') {
        const m = Math.max(o.w, o.h);
        o.w = m;
        o.h = m;
      } else return;
      pushUndo(pre);
      state.sample = false;
      renderProps();
      requestDraw();
      scheduleSave();
    });
    let rangePre = null;
    box.addEventListener('pointerdown', (e) => {
      if (e.target.matches('input[type="range"]')) rangePre = snapshot();
    });
    box.addEventListener('input', (e) => {
      const o = selectedObj();
      if (!o) return;
      const v = parseFloat(e.target.value);
      if (e.target.id === 'propR') { o.r = v; $('#propROut').textContent = (v * 100).toFixed(1); }
      if (e.target.id === 'propW') { o.w = v; $('#propWOut').textContent = (v * 100).toFixed(1); }
      if (e.target.id === 'propH') { o.h = v; $('#propHOut').textContent = (v * 100).toFixed(1); }
      state.sample = false;
      requestDraw();
    });
    box.addEventListener('change', () => {
      if (rangePre) { pushUndo(rangePre); rangePre = null; }
      scheduleSave();
    });
  }

  function deleteSelected() {
    const s = rt.sel;
    if (!s || s.type === 'ball') return;
    const key = s.type === 'enemy' ? 'enemies' : s.type === 'block' ? 'blocks' : 'allies';
    state[key] = state[key].filter((o) => o.id !== s.id);
    rt.sel = null;
  }

  function duplicateSelected() {
    const s = rt.sel;
    const o = selectedObj();
    if (!s || !o || s.type === 'ball') return;
    const key = s.type === 'enemy' ? 'enemies' : s.type === 'block' ? 'blocks' : 'allies';
    const c = JSON.parse(JSON.stringify(o));
    c.id = newId(s.type[0]);
    c.x = P.clamp(o.x + 0.06, 0.02, 0.98);
    c.y = P.clamp(o.y + 0.06, 0.02, FIELD_H - 0.02);
    state[key].push(c);
    rt.sel = { type: s.type, id: c.id };
  }

  function viewCenter() {
    const k = kNow();
    const c = toField(rt.cssW / 2, rt.cssH / 2);
    void k;
    return { x: P.clamp(c.x, 0.05, 0.95), y: P.clamp(c.y, 0.05, FIELD_H - 0.05) };
  }

  function addObject(type) {
    const pre = snapshot();
    const c = viewCenter();
    const jitter = (state.enemies.length + state.blocks.length + state.allies.length) % 5;
    const off = (jitter - 2) * 0.03;
    let o;
    if (type === 'enemy') {
      o = { id: newId('e'), x: c.x + off, y: c.y, r: 0.08, mode: 'auto' };
      state.enemies.push(o);
    } else if (type === 'block') {
      o = { id: newId('b'), x: c.x + off, y: c.y, w: BLOCK_DEFAULT, h: BLOCK_DEFAULT };
      state.blocks.push(o);
    } else {
      if (state.allies.length >= 3) { toast('味方は3体までです'); return; }
      o = { id: newId('a'), x: c.x + off, y: c.y + 0.1 };
      state.allies.push(o);
    }
    rt.sel = { type, id: o.id };
    state.sample = false;
    pushUndo(pre);
    setMode('edit');
    renderProps();
    requestDraw();
    scheduleSave();
  }

  /* ---------- 元に戻す ---------- */
  function snapshot() {
    return JSON.stringify({ ball: state.ball, enemies: state.enemies, blocks: state.blocks, allies: state.allies });
  }
  function applySnapshot(s) {
    const o = JSON.parse(s);
    state.ball = o.ball;
    state.enemies = o.enemies;
    state.blocks = o.blocks;
    state.allies = o.allies;
    if (!selectedObj()) rt.sel = null;
    syncKindButtons();
    renderProps();
    requestDraw();
    scheduleSave();
  }
  function pushUndo(pre) {
    if (pre === snapshot()) return;
    rt.undo.push(pre);
    if (rt.undo.length > 80) rt.undo.shift();
    rt.redo.length = 0;
    syncUndo();
  }
  function undo() {
    if (!rt.undo.length) return;
    rt.redo.push(snapshot());
    applySnapshot(rt.undo.pop());
    syncUndo();
  }
  function redo() {
    if (!rt.redo.length) return;
    rt.undo.push(snapshot());
    applySnapshot(rt.redo.pop());
    syncUndo();
  }
  function syncUndo() {
    $('#btnUndo').disabled = !rt.undo.length;
    $('#btnRedo').disabled = !rt.redo.length;
  }

  /* ---------- 盤面のタッチ操作 ---------- */
  function localPoint(e) {
    const r = cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hitTest(cx, cy) {
    const k = kNow();
    const f = toField(cx, cy);
    const tol = 14 / k;
    const h = handlePos();
    if (h && Math.hypot(h.x - f.x, h.y - f.y) < 24 / k) return { kind: 'handle', type: rt.sel.type, id: rt.sel.id };
    for (let i = 0; i < rt.candidates.length; i++) {
      const c = rt.candidates[i];
      if (Math.hypot(c.x - f.x, c.y - f.y) < P.VISUAL_R) return { kind: 'cand', index: i };
    }
    const hits = [];
    const rb = Math.max(ballR() * 1.5, 22 / k);
    const db = Math.hypot(state.ball.x - f.x, state.ball.y - f.y);
    if (db < rb) hits.push({ type: 'ball', id: 'ball', area: 0, d: db });
    state.allies.forEach((a) => {
      const d = Math.hypot(a.x - f.x, a.y - f.y);
      if (d < Math.max(ballR() * 1.5, 22 / k)) hits.push({ type: 'ally', id: a.id, area: 0.001, d });
    });
    state.enemies.forEach((e) => {
      const d = Math.hypot(e.x - f.x, e.y - f.y);
      if (d < Math.max(e.r, 18 / k) + tol * 0.4) hits.push({ type: 'enemy', id: e.id, area: e.r * e.r, d });
    });
    state.blocks.forEach((b) => {
      if (Math.abs(f.x - b.x) <= b.w / 2 + tol * 0.5 && Math.abs(f.y - b.y) <= b.h / 2 + tol * 0.5) hits.push({ type: 'block', id: b.id, area: b.w * b.h, d: 0 });
    });
    if (!hits.length) return null;
    hits.sort((a, b) => a.area - b.area || a.d - b.d);
    return { kind: 'obj', type: hits[0].type, id: hits[0].id };
  }

  function objById(type, id) {
    if (type === 'ball') return state.ball;
    const list = type === 'enemy' ? state.enemies : type === 'block' ? state.blocks : state.allies;
    return list.find((o) => o.id === id);
  }

  function aimFromGesture(g) {
    if (state.settings.control === 'point') {
      const b = toCss(state.ball.x, state.ball.y);
      const vx = g.cx - b.x;
      const vy = g.cy - b.y;
      if (Math.hypot(vx, vy) < 6) return;
      g.active = true;
      setAngle(P.degFromVec(vx, vy));
      return;
    }
    const vx = g.cx - g.sx;
    const vy = g.cy - g.sy;
    if (!g.active && Math.hypot(vx, vy) < 8) return;
    g.active = true;
    setAngle(P.degFromVec(-vx, -vy));
  }

  function onDown(e) {
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
    const p = localPoint(e);
    rt.pointers.set(e.pointerId, p);
    if (rt.pointers.size === 2) {
      // 1本指の操作を取り消して、拡大縮小へ
      const g = rt.gesture;
      if (g && g.type === 'aim') setAngle(g.startAngle);
      if (g && (g.type === 'move' || g.type === 'resize') && g.pre) applySnapshot(g.pre);
      const [a, b] = Array.from(rt.pointers.values());
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      rt.gesture = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: rt.zoom.z, f0: toField(mid.x, mid.y) };
      return;
    }
    if (rt.pointers.size > 2) return;
    if (rt.mode === 'aim') {
      rt.gesture = { type: 'aim', sx: p.x, sy: p.y, cx: p.x, cy: p.y, startAngle: state.angle, active: false };
      if (state.settings.control === 'point') aimFromGesture(rt.gesture);
      return;
    }
    const hit = hitTest(p.x, p.y);
    if (hit && hit.kind === 'cand') {
      rt.gesture = { type: 'cand', index: hit.index, sx: p.x, sy: p.y };
      return;
    }
    if (hit && (hit.kind === 'obj' || hit.kind === 'handle')) {
      rt.sel = { type: hit.type, id: hit.id };
      const o = objById(hit.type, hit.id);
      const f = toField(p.x, p.y);
      rt.gesture = {
        type: hit.kind === 'handle' ? 'resize' : 'move',
        target: { type: hit.type, id: hit.id },
        offX: o.x - f.x,
        offY: o.y - f.y,
        pre: snapshot(),
        moved: false,
      };
      renderProps();
      requestDraw();
      return;
    }
    rt.gesture = { type: 'pan', sx: p.x, sy: p.y, x0: rt.zoom.x0, y0: rt.zoom.y0, moved: false };
  }

  function onMove(e) {
    if (!rt.pointers.has(e.pointerId)) return;
    const p = localPoint(e);
    rt.pointers.set(e.pointerId, p);
    const g = rt.gesture;
    if (!g) return;
    if (g.type === 'pinch') {
      if (rt.pointers.size < 2) return;
      const [a, b] = Array.from(rt.pointers.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      rt.zoom.z = Math.max(1, Math.min(6, g.z0 * (d / g.d0)));
      const k = kNow();
      rt.zoom.x0 = g.f0.x - mid.x / k;
      rt.zoom.y0 = g.f0.y - mid.y / k;
      clampZoom();
      requestDraw();
      return;
    }
    if (g.type === 'aim') {
      g.cx = p.x;
      g.cy = p.y;
      aimFromGesture(g);
      return;
    }
    if (g.type === 'move' || g.type === 'resize') {
      const o = objById(g.target.type, g.target.id);
      if (!o) return;
      const f = toField(p.x, p.y);
      if (g.type === 'move') {
        let nx = f.x + g.offX;
        let ny = f.y + g.offY;
        if (g.target.type === 'ball') {
          const r = ballR();
          nx = P.clamp(nx, r, 1 - r);
          ny = P.clamp(ny, r, FIELD_H - r);
        } else {
          nx = P.clamp(nx, 0, 1);
          ny = P.clamp(ny, 0, FIELD_H);
        }
        o.x = nx;
        o.y = ny;
      } else if (g.target.type === 'enemy') {
        o.r = P.clamp(Math.hypot(f.x - o.x, f.y - o.y), 0.015, 0.45);
        const rr = $('#propR');
        if (rr) { rr.value = o.r; $('#propROut').textContent = (o.r * 100).toFixed(1); }
      } else if (g.target.type === 'block') {
        o.w = P.clamp(Math.abs(f.x - o.x) * 2, 0.03, 1);
        o.h = P.clamp(Math.abs(f.y - o.y) * 2, 0.03, FIELD_H);
        const rw = $('#propW');
        const rh = $('#propH');
        if (rw) { rw.value = o.w; $('#propWOut').textContent = (o.w * 100).toFixed(1); }
        if (rh) { rh.value = o.h; $('#propHOut').textContent = (o.h * 100).toFixed(1); }
      }
      g.moved = true;
      state.sample = false;
      requestDraw();
      return;
    }
    if (g.type === 'pan') {
      const dx = p.x - g.sx;
      const dy = p.y - g.sy;
      if (Math.hypot(dx, dy) > 6) g.moved = true;
      if (rt.zoom.z > 1.001) {
        const k = kNow();
        rt.zoom.x0 = g.x0 - dx / k;
        rt.zoom.y0 = g.y0 - dy / k;
        clampZoom();
        requestDraw();
      }
    }
  }

  function onUp(e) {
    if (!rt.pointers.has(e.pointerId)) return;
    rt.pointers.delete(e.pointerId);
    const g = rt.gesture;
    if (!g) return;
    if (g.type === 'pinch') {
      if (rt.pointers.size === 0) rt.gesture = null;
      return;
    }
    if (rt.pointers.size > 0) return;
    rt.gesture = null;
    if (g.type === 'aim') {
      requestDraw();
      scheduleSave();
      return;
    }
    if (g.type === 'move' || g.type === 'resize') {
      if (g.moved) {
        pushUndo(g.pre);
        scheduleSave();
      }
      renderProps();
      requestDraw();
      return;
    }
    if (g.type === 'cand') {
      applyCandidate(g.index);
      return;
    }
    if (g.type === 'pan' && !g.moved) {
      rt.sel = null;
      renderProps();
      requestDraw();
    }
  }

  function bindBoard() {
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('lostpointercapture', (e) => { if (rt.pointers.has(e.pointerId)) onUp(e); });
    // iOS のダブルタップ拡大・長押しメニューを止める
    cv.addEventListener('touchstart', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = localPoint(e);
      const f = toField(p.x, p.y);
      rt.zoom.z = Math.max(1, Math.min(6, rt.zoom.z * Math.exp(-e.deltaY * 0.0015)));
      const k = kNow();
      rt.zoom.x0 = f.x - p.x / k;
      rt.zoom.y0 = f.y - p.y / k;
      clampZoom();
      requestDraw();
    }, { passive: false });
  }

  /* ---------- 候補（スクショから見つけたキャラ） ---------- */
  function renderCandidates() {
    const box = $('#cands');
    if (!rt.candidates.length) { box.hidden = true; return; }
    box.hidden = false;
    $('#candsRow').innerHTML = rt.candidates.map((c, i) => `<button type="button" class="cand-btn" data-cand="${i}">${i + 1}</button>`).join('') +
      '<button type="button" class="cand-btn skip" data-cand="skip">使わない</button>';
  }
  function applyCandidate(i) {
    const pre = snapshot();
    const c = rt.candidates[i];
    if (!c) return;
    state.ball.x = c.x;
    state.ball.y = c.y;
    clampBall();
    state.allies = rt.candidates.filter((_, j) => j !== i).slice(0, 3).map((o) => ({ id: newId('a'), x: o.x, y: o.y }));
    rt.candidates = [];
    rt.sel = { type: 'ball', id: 'ball' };
    pushUndo(pre);
    renderCandidates();
    renderProps();
    requestDraw();
    scheduleSave();
    toast('自キャラと味方を置きました');
  }

  /* ---------- モード ---------- */
  function setMode(m) {
    rt.mode = m;
    $('#tabAim').classList.toggle('is-on', m === 'aim');
    $('#tabEdit').classList.toggle('is-on', m === 'edit');
    $('#tabAim').setAttribute('aria-selected', String(m === 'aim'));
    $('#tabEdit').setAttribute('aria-selected', String(m === 'edit'));
    $('#panelAim').hidden = m !== 'aim';
    $('#panelEdit').hidden = m !== 'edit';
    if (m === 'edit') { renderProps(); renderCandidates(); }
    requestDraw();
  }

  function syncKindButtons() {
    $$('.seg-btn[data-kind]').forEach((b) => {
      const on = b.dataset.kind === state.ball.kind;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  /* ---------- 押しっぱなしで連続入力できるボタン ---------- */
  function repeatButton(el, fn) {
    let t1 = 0;
    let t2 = 0;
    const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = 0; t2 = 0; };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
      stop();
      t1 = setTimeout(() => { t2 = setInterval(fn, 55); }, 380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => el.addEventListener(ev, () => { if (t1 || t2) { stop(); scheduleSave(); } }));
    el.addEventListener('click', (e) => { if (e.detail === 0) { fn(); scheduleSave(); } });
  }

  function bindAimPanel() {
    $$('.fine[data-step]').forEach((b) => {
      const step = parseFloat(b.dataset.step);
      repeatButton(b, () => setAngle(state.angle + step));
    });
    repeatButton($('#bounceMinus'), () => { state.settings.maxBounces = Math.max(1, state.settings.maxBounces - 1); requestDraw(); });
    repeatButton($('#bouncePlus'), () => { state.settings.maxBounces = Math.min(MAX_BOUNCES, state.settings.maxBounces + 1); requestDraw(); });
    $$('.seg-btn[data-kind]').forEach((b) => b.addEventListener('click', () => {
      state.ball.kind = b.dataset.kind;
      syncKindButtons();
      renderProps();
      requestDraw();
      scheduleSave();
    }));
    // 角度を数字で入力
    const out = $('#angleOut');
    const edit = $('#angleEdit');
    out.addEventListener('click', () => {
      edit.value = P.normDeg(state.angle).toFixed(1);
      out.hidden = true;
      edit.hidden = false;
      edit.focus();
      try { edit.select(); } catch (e) { /* noop */ }
    });
    const finishEdit = (apply) => {
      if (edit.hidden) return;
      const v = parseFloat(edit.value);
      if (apply && isFinite(v)) setAngle(v, true);
      edit.hidden = true;
      out.hidden = false;
    };
    edit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finishEdit(true); }
      if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
    });
    edit.addEventListener('blur', () => finishEdit(true));
    // なぞって微調整
    const jog = $('#jog');
    const ticks = $('#jogTicks');
    let last = null;
    let shift = 0;
    jog.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { jog.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      last = e.clientX;
      jog.classList.add('is-active');
    });
    jog.addEventListener('pointermove', (e) => {
      if (last == null) return;
      const dx = e.clientX - last;
      last = e.clientX;
      shift += dx;
      ticks.style.backgroundPosition = `${shift}px 0`;
      setAngle(state.angle + dx * JOG_DEG_PER_PX);
    });
    const end = () => { if (last != null) { last = null; jog.classList.remove('is-active'); scheduleSave(); } };
    jog.addEventListener('pointerup', end);
    jog.addEventListener('pointercancel', end);
    jog.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 1 : 0.1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setAngle(state.angle - step, true); e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setAngle(state.angle + step, true); e.preventDefault(); }
    });
  }

  function bindEditPanel() {
    $('#addEnemy').addEventListener('click', () => addObject('enemy'));
    $('#addBlock').addEventListener('click', () => addObject('block'));
    $('#addAlly').addEventListener('click', () => addObject('ally'));
    $('#selBall').addEventListener('click', () => { rt.sel = { type: 'ball', id: 'ball' }; renderProps(); requestDraw(); });
    $('#candsRow').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cand]');
      if (!b) return;
      if (b.dataset.cand === 'skip') { rt.candidates = []; renderCandidates(); requestDraw(); return; }
      applyCandidate(parseInt(b.dataset.cand, 10));
    });
    bindProps();
  }

  /* ---------- トースト・読み込み中 ---------- */
  function toast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(rt.toastTimer);
    rt.toastTimer = setTimeout(() => { t.hidden = true; }, ms || 2200);
  }
  function busy(on, text) {
    $('#busy').hidden = !on;
    if (text) $('#busyText').textContent = text;
  }

  /* ---------- シート ---------- */
  let openSheetEl = null;
  function openSheet(id) {
    closeSheet();
    const el = $(id);
    el.hidden = false;
    $('#scrim').hidden = false;
    openSheetEl = el;
  }
  function closeSheet() {
    if (openSheetEl) openSheetEl.hidden = true;
    openSheetEl = null;
    $('#scrim').hidden = true;
    $('#wipeConfirm').hidden = true;
  }

  function bindSheets() {
    $('#btnMenu').addEventListener('click', () => openSheet('#sheetMenu'));
    $('#scrim').addEventListener('click', closeSheet);
    $$('[data-close]').forEach((b) => b.addEventListener('click', closeSheet));
    $('#sheetMenu').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'save') openSaveSheet();
      else if (act === 'layouts') openLayouts();
      else if (act === 'calib') { closeSheet(); if (rt.img) openCalib(); else toast('先にスクショを読み込んでください'); }
      else if (act === 'clearImage') { closeSheet(); clearImage(); }
      else if (act === 'clearObjects') { closeSheet(); clearObjects(); }
      else if (act === 'settings') openSettings();
      else if (act === 'help') { $('#versionText').textContent = 'バージョン ' + VERSION; openSheet('#sheetHelp'); }
    });
    $('#saveForm').addEventListener('submit', (e) => {
      e.preventDefault();
      saveLayout($('#saveName').value.trim());
    });
    bindSettings();
  }

  function clearObjects() {
    const pre = snapshot();
    state.enemies = [];
    state.blocks = [];
    state.allies = [];
    rt.sel = null;
    state.sample = false;
    pushUndo(pre);
    renderProps();
    requestDraw();
    scheduleSave();
    toast('敵・ブロック・味方を消しました（元に戻せます）');
  }

  function clearImage() {
    state.image = null;
    releaseImage();
    rt.imgKey = null;
    rt.candidates = [];
    renderCandidates();
    resetZoom();
    requestDraw();
    scheduleSave();
    gcImages();
  }

  /* ---------- 設定 ---------- */
  function openSettings() {
    const s = state.settings;
    $$('.seg-btn[data-control]').forEach((b) => {
      const on = b.dataset.control === s.control;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });
    $('#optNumbers').checked = s.showNumbers;
    $('#optBand').checked = s.showBand;
    $('#optPull').checked = s.showPull;
    $('#optVisual').checked = s.showVisual;
    $('#ballR').value = s.ballR;
    $('#ballROut').textContent = (s.ballR * 100).toFixed(2) + '%';
    openSheet('#sheetSettings');
  }
  function bindSettings() {
    $$('.seg-btn[data-control]').forEach((b) => b.addEventListener('click', () => {
      state.settings.control = b.dataset.control;
      S.local.set('control', state.settings.control);
      openSettings();
      scheduleSave();
    }));
    const opt = (id, key) => $(id).addEventListener('change', (e) => { state.settings[key] = e.target.checked; requestDraw(); scheduleSave(); });
    opt('#optNumbers', 'showNumbers');
    opt('#optBand', 'showBand');
    opt('#optPull', 'showPull');
    opt('#optVisual', 'showVisual');
    $('#ballR').addEventListener('input', (e) => {
      state.settings.ballR = parseFloat(e.target.value);
      $('#ballROut').textContent = (state.settings.ballR * 100).toFixed(2) + '%';
      clampBall();
      requestDraw();
    });
    $('#ballR').addEventListener('change', scheduleSave);
    $('#ballRReset').addEventListener('click', () => {
      state.settings.ballR = P.BALL_R;
      openSettings();
      requestDraw();
      scheduleSave();
    });
    $('#wipeAll').addEventListener('click', () => { $('#wipeConfirm').hidden = false; });
    $('#wipeNo').addEventListener('click', () => { $('#wipeConfirm').hidden = true; });
    $('#wipeYes').addEventListener('click', async () => {
      await S.clearAll();
      state = sampleState();
      rt.img = null;
      rt.imgKey = null;
      rt.undo = [];
      rt.redo = [];
      rt.sel = null;
      rt.candidates = [];
      syncUndo();
      syncKindButtons();
      closeSheet();
      resetZoom();
      renderProps();
      renderCandidates();
      requestDraw();
      toast('保存データを消しました');
    });
  }

  /* ---------- 保存（自動保存と、名前を付けた保存） ---------- */
  let saveTimer = 0;
  function persistable() {
    return JSON.parse(JSON.stringify({
      v: 1,
      sample: state.sample,
      ball: state.ball,
      angle: state.angle,
      enemies: state.enemies,
      blocks: state.blocks,
      allies: state.allies,
      settings: state.settings,
      image: state.image,
    }));
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { S.set('kv', 'current', persistable()); }, 350);
    $('#chipSample').hidden = !state.sample;
  }

  function nowLabel() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function openSaveSheet() {
    $('#saveName').value = '配置 ' + nowLabel();
    openSheet('#sheetSave');
    setTimeout(() => { try { $('#saveName').select(); } catch (e) { /* noop */ } }, 50);
  }

  function makeThumb() {
    try {
      const t = document.createElement('canvas');
      t.width = 112;
      t.height = Math.round(112 * VIEW_H);
      t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height);
      return t.toDataURL('image/jpeg', 0.7);
    } catch (e) { return ''; }
  }

  async function saveLayout(name) {
    const id = newId('L');
    const rec = { id, name: name || '配置 ' + nowLabel(), savedAt: Date.now(), state: persistable(), thumb: makeThumb() };
    await S.set('layouts', id, rec);
    closeSheet();
    toast('「' + rec.name + '」を保存しました');
  }

  async function openLayouts() {
    openSheet('#sheetLayouts');
    const list = $('#layoutList');
    list.innerHTML = '<div class="empty">読み込み中…</div>';
    const rows = (await S.all('layouts')).map((r) => r.value).filter(Boolean).sort((a, b) => b.savedAt - a.savedAt);
    if (!rows.length) {
      list.innerHTML = '<div class="empty">まだ保存した配置はありません。メニューの「今の配置を保存」から保存できます。</div>';
      return;
    }
    list.innerHTML = rows.map((r) => {
      const d = new Date(r.savedAt);
      const date = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      const n = r.state ? (r.state.enemies || []).length : 0;
      return `<div class="layout-item" data-id="${escapeHtml(r.id)}">
        <div class="layout-thumb" style="background-image:url('${r.thumb || ''}')"></div>
        <div class="layout-meta"><div class="layout-name">${escapeHtml(r.name)}</div><div class="layout-date">${date}・敵${n}体${r.state && r.state.image ? '・スクショあり' : ''}</div></div>
        <div class="layout-btns"><button type="button" class="chip-opt" data-l="open">開く</button><button type="button" class="chip-opt danger" data-l="del">削除</button></div>
      </div>`;
    }).join('');
  }

  function bindLayouts() {
    $('#layoutList').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-l]');
      if (!b) return;
      const item = b.closest('.layout-item');
      const id = item.dataset.id;
      if (b.dataset.l === 'del') {
        if (b.dataset.armed !== '1') {
          b.dataset.armed = '1';
          b.textContent = '本当に消す';
          setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = '削除'; } }, 3000);
          return;
        }
        await S.del('layouts', id);
        item.remove();
        gcImages();
        if (!$('#layoutList').children.length) openLayouts();
        return;
      }
      const rec = await S.get('layouts', id);
      if (!rec) return;
      await loadState(rec.state);
      closeSheet();
      toast('「' + rec.name + '」を開きました');
    });
  }

  async function gcImages() {
    try {
      const used = new Set();
      if (state.image && state.image.key) used.add(state.image.key);
      for (const r of await S.all('layouts')) if (r.value && r.value.state && r.value.state.image) used.add(r.value.state.image.key);
      for (const r of await S.all('images')) if (!used.has(r.key)) await S.del('images', r.key);
    } catch (e) { /* noop */ }
  }

  function migrate(s) {
    const base = sampleState();
    const out = Object.assign({}, base, s || {});
    out.settings = Object.assign(defaultSettings(), (s && s.settings) || {});
    out.ball = Object.assign({}, base.ball, (s && s.ball) || {});
    out.enemies = Array.isArray(out.enemies) ? out.enemies : [];
    out.blocks = Array.isArray(out.blocks) ? out.blocks : [];
    out.allies = Array.isArray(out.allies) ? out.allies : [];
    return out;
  }

  async function loadState(s) {
    state = migrate(s);
    rt.sel = null;
    rt.candidates = [];
    rt.undo = [];
    rt.redo = [];
    syncUndo();
    releaseImage();
    rt.imgKey = null;
    if (state.image && state.image.key) {
      const blob = await S.get('images', state.image.key);
      if (blob) {
        try {
          rt.img = await decodeImage(blob);
          rt.imgKey = state.image.key;
        } catch (e) { state.image = null; }
      } else {
        state.image = null;
      }
    }
    syncKindButtons();
    resetZoom();
    renderProps();
    renderCandidates();
    requestDraw();
    scheduleSave();
  }

  /* ---------- スクショの読み込み ---------- */
  async function decodeImage(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob); } catch (e) { /* 下へ */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      im.src = url;
    });
  }
  function releaseImage() {
    try { if (rt.img && typeof rt.img.close === 'function') rt.img.close(); } catch (e) { /* noop */ }
    rt.img = null;
  }
  function imgSize(img) { return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height }; }

  function pixelsOf(img) {
    const { w, h } = imgSize(img);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    return { canvas: c, data: g.getImageData(0, 0, w, h) };
  }

  async function importFile(file) {
    if (!file) return;
    busy(true, 'スクショを読み込み中…');
    try {
      const img = await decodeImage(file);
      const { w, h } = imgSize(img);
      const px = pixelsOf(img);
      const res = D.analyze(px.data);
      let calib = { panelTop: res.field.panelTop, left: res.field.left, right: res.field.right };
      if (!res.found) {
        const def = S.local.get('calibDefault', null);
        if (def && def.w === w && def.h === h) calib = { panelTop: def.panelTop, left: def.left, right: def.right };
      }
      const blob = await new Promise((resolve) => px.canvas.toBlob(resolve, 'image/jpeg', 0.92));
      const key = 'img-' + Date.now().toString(36);
      if (blob) await S.set('images', key, blob);
      const wasSample = state.sample || isSampleObjects();
      releaseImage();
      rt.img = img;
      rt.imgKey = key;
      state.image = { key, w, h, calib };
      state.sample = false;
      const g = D.fieldFromPanel(calib.panelTop, calib.left, calib.right);
      rt.candidates = res.labels
        .map((l) => ({ x: (l.x - g.left) / g.W, y: (l.y - g.top) / g.W }))
        .filter((c) => c.x > 0 && c.x < 1 && c.y > 0 && c.y < FIELD_H);
      if (wasSample) {
        // サンプルの敵などは消して、自分の盤面から始める（自分で足した物は残す）
        state.enemies = state.enemies.filter((e) => !SAMPLE_IDS.has(e.id));
        state.blocks = state.blocks.filter((b) => !SAMPLE_IDS.has(b.id));
        state.allies = state.allies.filter((a) => !SAMPLE_IDS.has(a.id));
        rt.sel = null;
        rt.undo = [];
        rt.redo = [];
        syncUndo();
        renderProps();
      }
      resetZoom();
      renderCandidates();
      requestDraw();
      scheduleSave();
      gcImages();
      busy(false);
      if (!res.found) {
        openCalib();
        toast('盤面の位置を自動で見つけられませんでした。枠を合わせてください', 3800);
      } else if (rt.candidates.length) {
        setMode('edit');
        toast('盤面を合わせました。自キャラをタップしてください', 3200);
      } else {
        toast('盤面を合わせました。ずれていたらメニューの「位置合わせ」で調整できます', 3400);
      }
    } catch (err) {
      busy(false);
      toast('画像を読み込めませんでした。別のスクショで試してください', 3600);
    }
  }

  const SAMPLE_IDS = new Set(['e-boss', 'e-a', 'e-b', 'b-1', 'a-1', 'a-2']);
  function isSampleObjects() {
    return state.enemies.some((e) => SAMPLE_IDS.has(e.id)) || state.blocks.some((b) => SAMPLE_IDS.has(b.id));
  }

  /* ---------- 位置合わせ ---------- */
  const cc = $('#calibCanvas');
  const cctx = cc.getContext('2d');
  const calibRt = { scale: 1, cssW: 0, cssH: 0, drag: null };

  function openCalib() {
    $('#calib').hidden = false;
    layoutCalib();
  }
  function layoutCalib() {
    const body = $('#calibBody');
    const bw = body.clientWidth;
    const bh = body.clientHeight;
    const { w, h } = state.image;
    const s = Math.min(bw / w, bh / h);
    calibRt.scale = s;
    calibRt.cssW = Math.round(w * s);
    calibRt.cssH = Math.round(h * s);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    cc.style.width = calibRt.cssW + 'px';
    cc.style.height = calibRt.cssH + 'px';
    cc.width = Math.round(calibRt.cssW * dpr);
    cc.height = Math.round(calibRt.cssH * dpr);
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCalib();
  }
  function drawCalib() {
    if (!rt.img || !state.image) return;
    const s = calibRt.scale;
    const W = calibRt.cssW;
    const H = calibRt.cssH;
    cctx.clearRect(0, 0, W, H);
    cctx.drawImage(rt.img, 0, 0, W, H);
    const g = fieldGeom();
    const yImg = g.imageTop * s;
    const yTop = g.top * s;
    const yBot = g.bottom * s;
    const yPanel = g.panelTop * s;
    cctx.fillStyle = 'rgba(0,0,0,0.55)';
    cctx.fillRect(0, 0, W, Math.max(0, yImg));
    cctx.fillRect(0, yPanel, W, H - yPanel);
    cctx.strokeStyle = C.accent;
    cctx.lineWidth = 2;
    cctx.strokeRect(g.left * s + 1, yTop, (g.right - g.left) * s - 2, yBot - yTop);
    cctx.strokeStyle = C.guide;
    cctx.lineWidth = 2.5;
    cctx.beginPath();
    cctx.moveTo(0, yPanel);
    cctx.lineTo(W, yPanel);
    cctx.stroke();
    plateText(cctx, '↓ 黄色いパネルの上端', 6, yPanel - 22, C.guide);
    plateText(cctx, '壁（跳ね返る範囲）', 6, yTop + 4, C.accent);
    $('#calibOut').textContent = `パネル上端 ${Math.round(state.image.calib.panelTop)}px`;
  }
  function plateText(g, text, x, y, color) {
    g.font = `800 12px ${C.font}`;
    g.textAlign = 'left';
    g.textBaseline = 'top';
    const w = g.measureText(text).width + 12;
    g.fillStyle = 'rgba(5,7,15,0.78)';
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, 18, 6); else g.rect(x, y, w, 18);
    g.fill();
    g.fillStyle = color;
    g.fillText(text, x + 6, y + 3);
  }
  function nudgeCalib(dy) {
    const c = state.image.calib;
    c.panelTop = P.clamp(c.panelTop + dy, 0, state.image.h);
    drawCalib();
    requestDraw();
  }
  function bindCalib() {
    $$('[data-nudge]').forEach((b) => {
      const d = parseInt(b.dataset.nudge, 10);
      repeatButton(b, () => nudgeCalib(d));
    });
    cc.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { cc.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      calibRt.drag = { y: e.clientY, start: state.image.calib.panelTop };
    });
    cc.addEventListener('pointermove', (e) => {
      if (!calibRt.drag) return;
      const dy = (e.clientY - calibRt.drag.y) / calibRt.scale;
      state.image.calib.panelTop = P.clamp(calibRt.drag.start + dy, 0, state.image.h);
      drawCalib();
    });
    const end = () => { calibRt.drag = null; requestDraw(); };
    cc.addEventListener('pointerup', end);
    cc.addEventListener('pointercancel', end);
    $('#calibAuto').addEventListener('click', () => {
      if (!rt.img) return;
      const px = pixelsOf(rt.img);
      const res = D.analyze(px.data);
      if (res.found) {
        state.image.calib = { panelTop: res.field.panelTop, left: res.field.left, right: res.field.right };
        drawCalib();
        toast('自動で合わせました');
      } else {
        toast('自動では見つかりませんでした。手で合わせてください');
      }
    });
    $('#calibDone').addEventListener('click', () => {
      $('#calib').hidden = true;
      const c = state.image.calib;
      S.local.set('calibDefault', { w: state.image.w, h: state.image.h, panelTop: c.panelTop, left: c.left, right: c.right });
      resetZoom();
      requestDraw();
      scheduleSave();
    });
  }

  /* ---------- 起動 ---------- */
  async function init() {
    if (!document.documentElement.lang) document.documentElement.lang = 'ja';
    readColors();
    bindBoard();
    bindAimPanel();
    bindEditPanel();
    bindSheets();
    bindLayouts();
    bindCalib();
    $('#tabAim').addEventListener('click', () => { rt.sel = null; setMode('aim'); });
    $('#tabEdit').addEventListener('click', () => setMode('edit'));
    $('#btnUndo').addEventListener('click', undo);
    $('#btnRedo').addEventListener('click', redo);
    $('#btnZoomReset').addEventListener('click', resetZoom);
    $('#btnImage').addEventListener('click', () => $('#fileInput').click());
    $('#fileInput').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      importFile(f);
    });
    // 他のアプリから画像を貼り付けた場合（パソコンなど）
    document.addEventListener('paste', (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for (const it of items) {
        if (it.type && it.type.startsWith('image/')) { importFile(it.getAsFile()); e.preventDefault(); return; }
      }
    });
    const ro = window.ResizeObserver ? new ResizeObserver(() => { layout(); if (!$('#calib').hidden) layoutCalib(); }) : null;
    if (ro) ro.observe($('#stage'));
    window.addEventListener('resize', () => { layout(); if (!$('#calib').hidden) layoutCalib(); });
    window.addEventListener('orientationchange', () => setTimeout(layout, 250));
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* noop */ }

    layout();
    const saved = await S.get('kv', 'current');
    if (saved && typeof saved === 'object') {
      await loadState(saved);
    } else {
      state = sampleState();
      const ctrl = S.local.get('control', null);
      if (ctrl) state.settings.control = ctrl;
      syncKindButtons();
      renderProps();
    }
    $('#chipSample').hidden = !state.sample;
    setMode('aim');
    layout();
    window.__rg = { get state() { return state; }, rt, computeTrace, setAngle, importFile, toField, toCss };
  }

  init();
})();
