/*
 * 反射ガイド — 軌道計算エンジン（DOM に依存しない純粋な計算部分）
 *
 * 座標系: 盤面の横幅（左の壁〜右の壁）を 1 とする。
 *   x: 左の壁 = 0 / 右の壁 = 1
 *   y: 上の壁 = 0 / 下の壁 = FIELD_H（縦横比 8:9 なので 1.125）
 * 角度: 0° = 真上、時計回りに増える（90° = 右、180° = 真下、270° = 左）
 *
 * 当たり判定のモデル
 *   自キャラ … 半径 r の円（中心の軌跡を計算する）
 *   壁       … 中心が r だけ内側の線に達したら反射（入射角 = 反射角）
 *   敵       … 円。反射タイプは跳ね返る（接点の法線で反射）、貫通タイプはすり抜ける。
 *              敵ごとに「自動 / 跳ね返る / すり抜け」を指定できる。
 *   ブロック … 長方形。自キャラが円なので、判定は「長方形を r だけ太らせた角丸長方形」。
 *              アンチブロック時はすり抜け。
 *   味方     … 軌道には影響しない。触れたか（友情が出るか）だけを判定する。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.RG = root.RG || {};
    root.RG.physics = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FIELD_W = 1;
  const FIELD_H = 1.125;   // 盤面の縦横比 8:9
  const BALL_R = 0.0455;   // 自キャラの当たり判定の半径（実測値：横幅1080pxで約49px）
  const VISUAL_R = 0.082;  // 自キャラの見た目の円の半径（スクショ合わせ用）

  const TINY = 1e-12;
  const SAME_OBJECT_GUARD = 1e-7; // 直前に跳ね返った物体に、ほぼ距離0で再衝突するのを防ぐ

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function dirFromDeg(deg) {
    const a = (deg * Math.PI) / 180;
    return { x: Math.sin(a), y: -Math.cos(a) };
  }

  function degFromVec(dx, dy) {
    let a = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (a < 0) a += 360;
    if (a >= 360) a -= 360;
    return a;
  }

  function normDeg(deg) {
    let a = deg % 360;
    if (a < 0) a += 360;
    return a;
  }

  /*
   * 半直線 p + t·d（|d| = 1）と、中心 c・半径 R の円の最初の交点。
   * 外側から近づいている場合だけ t を返す。円の内側から始まる場合は inside = true。
   */
  function rayCircle(px, py, dx, dy, cx, cy, R) {
    const mx = px - cx;
    const my = py - cy;
    const c = mx * mx + my * my - R * R;
    if (c < -1e-12) return { t: Infinity, inside: true };
    const b = mx * dx + my * dy;
    if (b >= 0) return { t: Infinity, inside: false };
    const disc = b * b - c;
    if (disc < 0) return { t: Infinity, inside: false };
    const t = -b - Math.sqrt(disc);
    return { t: t < 0 ? 0 : t, inside: false };
  }

  function blockBounds(b) {
    return { x0: b.x - b.w / 2, x1: b.x + b.w / 2, y0: b.y - b.h / 2, y1: b.y + b.h / 2 };
  }

  /* 点がブロックの判定（角丸長方形）の内側にあるか */
  function insideRoundRect(px, py, bb, r) {
    const qx = Math.max(bb.x0 - px, 0, px - bb.x1);
    const qy = Math.max(bb.y0 - py, 0, py - bb.y1);
    return qx * qx + qy * qy < r * r - 1e-12;
  }

  /* 半直線と、長方形を r だけ太らせた角丸長方形との最初の交点 */
  function rayRoundRect(px, py, dx, dy, bb, r) {
    if (insideRoundRect(px, py, bb, r)) return { t: Infinity, inside: true };
    let best = { t: Infinity, nx: 0, ny: 0, part: '' };
    const { x0, x1, y0, y1 } = bb;
    if (dx > TINY) {
      const X = x0 - r;
      if (px <= X + 1e-12) {
        const t = Math.max(0, (X - px) / dx);
        const y = py + t * dy;
        if (y >= y0 && y <= y1 && t < best.t) best = { t, nx: -1, ny: 0, part: 'left' };
      }
    } else if (dx < -TINY) {
      const X = x1 + r;
      if (px >= X - 1e-12) {
        const t = Math.max(0, (X - px) / dx);
        const y = py + t * dy;
        if (y >= y0 && y <= y1 && t < best.t) best = { t, nx: 1, ny: 0, part: 'right' };
      }
    }
    if (dy > TINY) {
      const Y = y0 - r;
      if (py <= Y + 1e-12) {
        const t = Math.max(0, (Y - py) / dy);
        const x = px + t * dx;
        if (x >= x0 && x <= x1 && t < best.t) best = { t, nx: 0, ny: -1, part: 'top' };
      }
    } else if (dy < -TINY) {
      const Y = y1 + r;
      if (py >= Y - 1e-12) {
        const t = Math.max(0, (Y - py) / dy);
        const x = px + t * dx;
        if (x >= x0 && x <= x1 && t < best.t) best = { t, nx: 0, ny: 1, part: 'bottom' };
      }
    }
    const corners = [
      [x0, y0, -1, -1],
      [x1, y0, 1, -1],
      [x0, y1, -1, 1],
      [x1, y1, 1, 1],
    ];
    for (let i = 0; i < 4; i++) {
      const cx = corners[i][0];
      const cy = corners[i][1];
      const h = rayCircle(px, py, dx, dy, cx, cy, r);
      if (h.t < best.t) {
        const hx = px + h.t * dx;
        const hy = py + h.t * dy;
        const okX = corners[i][2] < 0 ? hx <= x0 + 1e-12 : hx >= x1 - 1e-12;
        const okY = corners[i][3] < 0 ? hy <= y0 + 1e-12 : hy >= y1 - 1e-12;
        if (okX && okY) {
          const len = Math.hypot(hx - cx, hy - cy) || 1;
          best = { t: h.t, nx: (hx - cx) / len, ny: (hy - cy) / len, part: 'corner' };
        }
      }
    }
    return best;
  }

  /* 盤面の外周（壁そのもの）と半直線の交点。ゲーム内で狙いを合わせる目印に使う。 */
  function rayToFieldEdge(px, py, dx, dy, W, H) {
    let t = Infinity;
    let side = '';
    if (dx > TINY) { const tt = (W - px) / dx; if (tt < t) { t = tt; side = 'right'; } }
    if (dx < -TINY) { const tt = (0 - px) / dx; if (tt < t) { t = tt; side = 'left'; } }
    if (dy > TINY) { const tt = (H - py) / dy; if (tt < t) { t = tt; side = 'bottom'; } }
    if (dy < -TINY) { const tt = (0 - py) / dy; if (tt < t) { t = tt; side = 'top'; } }
    if (!isFinite(t)) return null;
    return { x: px + t * dx, y: py + t * dy, side, t };
  }

  function resolveEnemySolid(e, kind) {
    if (e.mode === 'bounce') return true;
    if (e.mode === 'pass') return false;
    return kind !== 'pierce';
  }

  /*
   * 軌道を計算する。
   * scene = {
   *   fieldW?, fieldH?,
   *   ball: { x, y, r?, kind: 'reflect' | 'pierce', antiBlock? },
   *   angle: 度,
   *   enemies: [{ id, x, y, r, mode: 'auto' | 'bounce' | 'pass' }],
   *   blocks:  [{ id, x, y, w, h }],   // x, y は中心
   *   allies:  [{ id, x, y, r? }],
   * }
   * opts = { maxBounces, maxLength }
   */
  function trace(scene, opts) {
    const o = Object.assign({ maxBounces: 12, maxLength: 300 }, opts || {});
    const W = scene.fieldW || FIELD_W;
    const H = scene.fieldH || FIELD_H;
    const ball = scene.ball || {};
    const r = ball.r > 0 ? ball.r : BALL_R;
    const kind = ball.kind === 'pierce' ? 'pierce' : 'reflect';

    let px = clamp(Number(ball.x) || 0, r, W - r);
    let py = clamp(Number(ball.y) || 0, r, H - r);
    const d0 = dirFromDeg(Number(scene.angle) || 0);
    let dx = d0.x;
    let dy = d0.y;

    const enemies = (scene.enemies || []).map((e) => ({
      id: e.id,
      x: e.x,
      y: e.y,
      R: Math.max(0, e.r) + r,
      solid: resolveEnemySolid(e, kind),
    }));
    const blocks = ball.antiBlock
      ? []
      : (scene.blocks || []).map((b) => ({ id: b.id, bb: blockBounds(b) }));
    const allies = (scene.allies || []).map((a) => ({
      id: a.id,
      x: a.x,
      y: a.y,
      R: (a.r > 0 ? a.r : r) + r,
    }));

    const start = { x: px, y: py };
    const points = [{ x: px, y: py }];
    const bounces = [];
    const enemyHits = {};
    const allyTouches = [];
    const touchedAlly = {};
    let length = 0;
    let last = null; // { type, id }
    let stopReason = 'maxBounces';
    let zeroRun = 0;
    let tail = null;

    // 味方：最初から重なっているなら発射直後に触れている扱い
    for (const a of allies) {
      const m = Math.hypot(px - a.x, py - a.y);
      if (m < a.R) {
        touchedAlly[a.id] = true;
        allyTouches.push({ id: a.id, x: px, y: py, seg: 0, bounceIndex: 0 });
      }
    }

    function nextHit() {
      let best = { t: Infinity, type: 'none' };
      // 壁
      let tx = Infinity;
      let ty = Infinity;
      if (dx > TINY) tx = (W - r - px) / dx;
      else if (dx < -TINY) tx = (r - px) / dx;
      if (dy > TINY) ty = (H - r - py) / dy;
      else if (dy < -TINY) ty = (r - py) / dy;
      if (tx < 0) tx = 0;
      if (ty < 0) ty = 0;
      const wt = Math.min(tx, ty);
      if (isFinite(wt)) {
        const flipX = tx <= ty + 1e-10;
        const flipY = ty <= tx + 1e-10;
        let side;
        if (flipX && flipY) side = 'corner';
        else if (flipX) side = dx > 0 ? 'right' : 'left';
        else side = dy > 0 ? 'bottom' : 'top';
        best = { t: wt, type: 'wall', flipX, flipY, side };
      }
      // 敵（跳ね返るものだけ）
      for (const e of enemies) {
        if (!e.solid) continue;
        const h = rayCircle(px, py, dx, dy, e.x, e.y, e.R);
        if (h.inside) continue;
        if (last && last.type === 'enemy' && last.id === e.id && h.t < SAME_OBJECT_GUARD) continue;
        if (h.t < best.t) {
          const hx = px + h.t * dx;
          const hy = py + h.t * dy;
          const len = Math.hypot(hx - e.x, hy - e.y) || 1;
          best = { t: h.t, type: 'enemy', id: e.id, nx: (hx - e.x) / len, ny: (hy - e.y) / len };
        }
      }
      // ブロック
      for (const b of blocks) {
        const h = rayRoundRect(px, py, dx, dy, b.bb, r);
        if (h.inside) continue;
        if (last && last.type === 'block' && last.id === b.id && h.t < SAME_OBJECT_GUARD) continue;
        if (h.t < best.t) best = { t: h.t, type: 'block', id: b.id, nx: h.nx, ny: h.ny, part: h.part };
      }
      return best;
    }

    function scanPassThrough(tEnd, seg) {
      for (const e of enemies) {
        if (e.solid) continue;
        const h = rayCircle(px, py, dx, dy, e.x, e.y, e.R);
        if (!h.inside && h.t <= tEnd) enemyHits[e.id] = (enemyHits[e.id] || 0) + 1;
      }
      for (const a of allies) {
        if (touchedAlly[a.id]) continue;
        const h = rayCircle(px, py, dx, dy, a.x, a.y, a.R);
        if (!h.inside && h.t <= tEnd) {
          touchedAlly[a.id] = true;
          allyTouches.push({ id: a.id, x: px + h.t * dx, y: py + h.t * dy, seg, bounceIndex: bounces.length });
        }
      }
    }

    for (let seg = 0; ; seg++) {
      const hit = nextHit();
      if (!isFinite(hit.t)) { stopReason = 'free'; break; }

      if (bounces.length >= o.maxBounces) {
        // 規定回数に達した：次に当たるところまでを「続き」として返す（ヒット数には含めない）
        tail = { ax: px, ay: py, bx: px + hit.t * dx, by: py + hit.t * dy, hitType: hit.type };
        break;
      }

      scanPassThrough(hit.t, seg);
      px += hit.t * dx;
      py += hit.t * dy;
      length += hit.t;

      if (hit.t < 1e-9) zeroRun++;
      else zeroRun = 0;

      if (hit.type === 'wall') {
        if (hit.flipX) dx = -dx;
        if (hit.flipY) dy = -dy;
        px = clamp(px, r, W - r);
        py = clamp(py, r, H - r);
        bounces.push({ x: px, y: py, type: 'wall', side: hit.side });
        last = { type: 'wall', id: hit.side };
      } else {
        const dot = dx * hit.nx + dy * hit.ny;
        dx -= 2 * dot * hit.nx;
        dy -= 2 * dot * hit.ny;
        const n = Math.hypot(dx, dy) || 1;
        dx /= n;
        dy /= n;
        bounces.push({ x: px, y: py, type: hit.type, id: hit.id, part: hit.part, nx: hit.nx, ny: hit.ny });
        if (hit.type === 'enemy') enemyHits[hit.id] = (enemyHits[hit.id] || 0) + 1;
        last = { type: hit.type, id: hit.id };
      }
      points.push({ x: px, y: py });

      if (zeroRun > 12) { stopReason = 'stuck'; break; }
      if (length > o.maxLength) { stopReason = 'maxLength'; break; }
    }

    const aim = rayToFieldEdge(start.x, start.y, d0.x, d0.y, W, H);
    return {
      start,
      angle: normDeg(Number(scene.angle) || 0),
      points,
      bounces,
      tail,
      enemyHits,
      allyTouches,
      aim,
      length,
      stopReason,
      ballR: r,
      fieldW: W,
      fieldH: H,
    };
  }

  /* 壁のどのあたりか（上から何%・左から何%）を日本語で */
  function describeWallPoint(side, x, y, W, H) {
    W = W || FIELD_W;
    H = H || FIELD_H;
    const pct = (v) => Math.round(v * 100);
    switch (side) {
      case 'right': return { wall: '右の壁', where: `上から${pct(y / H)}%` };
      case 'left': return { wall: '左の壁', where: `上から${pct(y / H)}%` };
      case 'top': return { wall: '上の壁', where: `左から${pct(x / W)}%` };
      case 'bottom': return { wall: '下の壁', where: `左から${pct(x / W)}%` };
      case 'corner': return { wall: '角', where: '' };
      default: return { wall: '', where: '' };
    }
  }

  return {
    FIELD_W,
    FIELD_H,
    BALL_R,
    VISUAL_R,
    clamp,
    dirFromDeg,
    degFromVec,
    normDeg,
    rayCircle,
    rayRoundRect,
    rayToFieldEdge,
    blockBounds,
    insideRoundRect,
    trace,
    describeWallPoint,
  };
});
