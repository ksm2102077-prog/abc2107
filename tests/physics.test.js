'use strict';
// 実行: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/physics.js');

const R = P.BALL_R;
const H = P.FIELD_H;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

function scene(extra) {
  return Object.assign(
    { ball: { x: 0.5, y: 0.9, kind: 'reflect' }, angle: 0, enemies: [], blocks: [], allies: [] },
    extra
  );
}

test('真上に打つと上の壁で跳ね返り、真下へ戻る', () => {
  const res = P.trace(scene({ ball: { x: 0.5, y: 0.9 }, angle: 0 }), { maxBounces: 2 });
  assert.equal(res.bounces.length, 2);
  const b1 = res.bounces[0];
  assert.equal(b1.type, 'wall');
  assert.equal(b1.side, 'top');
  assert.ok(near(b1.x, 0.5));
  assert.ok(near(b1.y, R));
  const b2 = res.bounces[1];
  assert.equal(b2.side, 'bottom');
  assert.ok(near(b2.y, H - R));
});

test('壁では入射角と反射角が等しい', () => {
  const res = P.trace(scene({ ball: { x: 0.3, y: 0.8 }, angle: 30 }), { maxBounces: 3 });
  // 30°で右上へ → 右の壁に先に当たるか上の壁に先に当たるかを確認し、反射後の向きを検算
  const [p0, p1, p2] = res.points;
  const v1 = { x: p1.x - p0.x, y: p1.y - p0.y };
  const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
  const b = res.bounces[0];
  const a1 = P.degFromVec(v1.x, v1.y);
  const a2 = P.degFromVec(v2.x, v2.y);
  assert.ok(near(a1, 30, 1e-7));
  if (b.side === 'right' || b.side === 'left') assert.ok(near(a2, 330, 1e-7), `a2=${a2}`);
  else assert.ok(near(a2, 150, 1e-7), `a2=${a2}`);
});

test('ちょうど角に当たると来た方向へ戻る', () => {
  // 中心から45°：x方向とy方向の残り距離が同じになる位置から打つ
  const x = 0.5;
  const y = R + (1 - R - x);
  const res = P.trace(scene({ ball: { x, y }, angle: 45 }), { maxBounces: 1 });
  const b = res.bounces[0];
  assert.equal(b.side, 'corner');
  const tail = res.tail;
  const back = P.degFromVec(tail.bx - tail.ax, tail.by - tail.ay);
  assert.ok(near(back, 225, 1e-6), `back=${back}`);
});

test('反射タイプは敵の正面に当たると真っ直ぐ跳ね返る', () => {
  const s = scene({ ball: { x: 0.5, y: 1.0 }, angle: 0, enemies: [{ id: 'e1', x: 0.5, y: 0.5, r: 0.1, mode: 'auto' }] });
  const res = P.trace(s, { maxBounces: 2 });
  const b1 = res.bounces[0];
  assert.equal(b1.type, 'enemy');
  assert.ok(near(b1.y, 0.5 + 0.1 + R));
  assert.equal(res.bounces[1].side, 'bottom');
  assert.equal(res.enemyHits.e1, 1);
});

test('敵の端に当たると接点の法線で反射する（入射角=反射角）', () => {
  const e = { id: 'e1', x: 0.56, y: 0.5, r: 0.1, mode: 'auto' };
  const s = scene({ ball: { x: 0.5, y: 1.0 }, angle: 0, enemies: [e] });
  const res = P.trace(s, { maxBounces: 1 });
  const b = res.bounces[0];
  assert.equal(b.type, 'enemy');
  // 接触時の中心間距離 = 敵半径 + 自キャラ半径
  assert.ok(near(Math.hypot(b.x - e.x, b.y - e.y), e.r + R, 1e-9));
  const n = { x: (b.x - e.x) / (e.r + R), y: (b.y - e.y) / (e.r + R) };
  const din = { x: 0, y: -1 };
  const t = res.tail;
  const len = Math.hypot(t.bx - t.ax, t.by - t.ay);
  const dout = { x: (t.bx - t.ax) / len, y: (t.by - t.ay) / len };
  // 法線方向の成分は符号が反転、接線方向の成分は保存
  const dinN = din.x * n.x + din.y * n.y;
  const doutN = dout.x * n.x + dout.y * n.y;
  assert.ok(near(doutN, -dinN, 1e-9));
  const tan = { x: -n.y, y: n.x };
  assert.ok(near(din.x * tan.x + din.y * tan.y, dout.x * tan.x + dout.y * tan.y, 1e-9));
});

test('貫通タイプは敵をすり抜け、ヒット数だけ数える', () => {
  const s = scene({ ball: { x: 0.5, y: 1.0, kind: 'pierce' }, angle: 0, enemies: [{ id: 'e1', x: 0.5, y: 0.5, r: 0.1, mode: 'auto' }] });
  const res = P.trace(s, { maxBounces: 1 });
  assert.equal(res.bounces[0].type, 'wall');
  assert.equal(res.bounces[0].side, 'top');
  assert.equal(res.enemyHits.e1, 1);
});

test('敵ごとの指定：貫通でも「跳ね返る」、反射でも「すり抜け」', () => {
  const e = { id: 'e1', x: 0.5, y: 0.5, r: 0.1 };
  const r1 = P.trace(scene({ ball: { x: 0.5, y: 1.0, kind: 'pierce' }, enemies: [{ ...e, mode: 'bounce' }] }), { maxBounces: 1 });
  assert.equal(r1.bounces[0].type, 'enemy');
  const r2 = P.trace(scene({ ball: { x: 0.5, y: 1.0, kind: 'reflect' }, enemies: [{ ...e, mode: 'pass' }] }), { maxBounces: 1 });
  assert.equal(r2.bounces[0].type, 'wall');
});

test('ブロックの面に当たると跳ね返る／アンチブロックならすり抜ける', () => {
  const blk = { id: 'b1', x: 0.5, y: 0.5, w: 0.2, h: 0.1 };
  const r1 = P.trace(scene({ ball: { x: 0.5, y: 1.0 }, blocks: [blk] }), { maxBounces: 1 });
  assert.equal(r1.bounces[0].type, 'block');
  assert.ok(near(r1.bounces[0].y, 0.55 + R));
  const r2 = P.trace(scene({ ball: { x: 0.5, y: 1.0, antiBlock: true }, blocks: [blk] }), { maxBounces: 1 });
  assert.equal(r2.bounces[0].type, 'wall');
});

test('ブロックの角に当たると斜めに跳ね返る', () => {
  const blk = { id: 'b1', x: 0.5, y: 0.5, w: 0.2, h: 0.1 };
  // 右下の角(0.6, 0.55)の円（半径R）に当たる位置を通す
  const x = 0.6 + R * 0.5;
  const res = P.trace(scene({ ball: { x, y: 1.0 }, blocks: [blk] }), { maxBounces: 1 });
  const b = res.bounces[0];
  assert.equal(b.type, 'block');
  assert.equal(b.part, 'corner');
  assert.ok(near(Math.hypot(b.x - 0.6, b.y - 0.55), R, 1e-9));
  const t = res.tail;
  const out = P.degFromVec(t.bx - t.ax, t.by - t.ay);
  assert.ok(out > 90 && out < 180, `out=${out}`); // 右下方向へ
});

test('味方に触れたかを判定する（軌道は変わらない）', () => {
  const s = scene({
    ball: { x: 0.5, y: 1.0 },
    allies: [
      { id: 'a1', x: 0.5 + R * 1.5, y: 0.6 },
      { id: 'a2', x: 0.9, y: 0.6 },
    ],
  });
  const res = P.trace(s, { maxBounces: 1 });
  assert.equal(res.bounces[0].side, 'top');
  const ids = res.allyTouches.map((a) => a.id);
  assert.deepEqual(ids, ['a1']);
});

test('反射回数の上限を守り、その先は tail で返す', () => {
  const res = P.trace(scene({ ball: { x: 0.31, y: 0.77 }, angle: 23.4 }), { maxBounces: 7 });
  assert.equal(res.bounces.length, 7);
  assert.equal(res.points.length, 8);
  assert.ok(res.tail);
});

test('敵に重なった状態から打っても止まらずに計算できる', () => {
  const s = scene({ ball: { x: 0.5, y: 0.52 }, angle: 10, enemies: [{ id: 'e1', x: 0.5, y: 0.5, r: 0.1, mode: 'auto' }] });
  const res = P.trace(s, { maxBounces: 5 });
  assert.equal(res.bounces.length, 5);
});

test('ハマり（敵と壁の間で往復）でも有限回で終わる', () => {
  const s = scene({ ball: { x: 0.5, y: 0.2 }, angle: 0, enemies: [{ id: 'boss', x: 0.5, y: 0.5, r: 0.2, mode: 'auto' }] });
  const res = P.trace(s, { maxBounces: 40 });
  assert.equal(res.bounces.length, 40);
  assert.equal(res.enemyHits.boss, 20);
});

test('aim: 最初の向きを盤面の外周まで延ばした点', () => {
  const res = P.trace(scene({ ball: { x: 0.5, y: 0.9 }, angle: 90 }), { maxBounces: 1 });
  assert.equal(res.aim.side, 'right');
  assert.ok(near(res.aim.x, 1));
  assert.ok(near(res.aim.y, 0.9));
});

// ランダムな盤面で、軌道が物体や壁を突き抜けないことを確認する
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('ランダム検証：軌道は盤面内に収まり、跳ね返る物体の中を通らない', () => {
  const rnd = mulberry32(12345);
  for (let iter = 0; iter < 400; iter++) {
    const enemies = [];
    const blocks = [];
    const ne = Math.floor(rnd() * 6);
    for (let i = 0; i < ne; i++) enemies.push({ id: 'e' + i, x: rnd(), y: rnd() * H, r: 0.03 + rnd() * 0.15, mode: 'auto' });
    const nb = Math.floor(rnd() * 4);
    for (let i = 0; i < nb; i++) blocks.push({ id: 'b' + i, x: rnd(), y: rnd() * H, w: 0.05 + rnd() * 0.2, h: 0.05 + rnd() * 0.2 });
    const s = {
      ball: { x: rnd(), y: rnd() * H, kind: rnd() < 0.5 ? 'reflect' : 'pierce' },
      angle: rnd() * 360,
      enemies,
      blocks,
      allies: [],
    };
    const res = P.trace(s, { maxBounces: 30 });
    assert.ok(res.points.length >= 1);
    // 開始時に重なっていた物体は除外して検査する
    const sx = res.start.x;
    const sy = res.start.y;
    const solidE = enemies.filter((e) => s.ball.kind === 'reflect' && Math.hypot(sx - e.x, sy - e.y) >= e.r + R);
    const solidB = blocks.filter((b) => !P.insideRoundRect(sx, sy, P.blockBounds(b), R));
    const pts = res.points.slice();
    if (res.tail) pts.push({ x: res.tail.bx, y: res.tail.by });
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      for (let k = 1; k < 20; k++) {
        const t = k / 20;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        assert.ok(x >= R - 1e-9 && x <= 1 - R + 1e-9 && y >= R - 1e-9 && y <= H - R + 1e-9, `out of field iter=${iter}`);
        for (const e of solidE) {
          const dist = Math.hypot(x - e.x, y - e.y);
          // 一度でも外に出た後に重なった区間だけを違反とみなす
          if (dist < e.r + R - 1e-6) {
            // 開始点から最初の区間で重なっていた場合などは除外済み。ここに来たら違反。
            assert.fail(`entered enemy iter=${iter} seg=${i} dist=${dist} R=${e.r + R}`);
          }
        }
        for (const bk of solidB) {
          if (P.insideRoundRect(x, y, P.blockBounds(bk), R - 1e-6)) assert.fail(`entered block iter=${iter} seg=${i}`);
        }
      }
    }
  }
});
