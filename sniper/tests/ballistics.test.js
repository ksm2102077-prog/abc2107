// 弾道計算の単体テスト: node --test sniper/tests/ballistics.test.js
const test = require('node:test');
const assert = require('node:assert');
const B = require('../js/ballistics.js');

const M118 = { mv: 792.5, mvTempCoef: 0, bc: 0.243, sightH: 0.0381, zeroRange: 100, load: { massGr: 175, diaIn: 0.308, lenIn: 1.24, twistIn: 11.25 } };

test('公開されている G7 計算表と2〜3%以内で一致する（175gr, 2650fps, 100ydゼロ, 1000yd）', () => {
  const atm = B.stdAtmosphere(0);
  const o = { atm, mv: 2650 * 0.3048, bc: 0.243, sightH: 0.0381 };
  const za = B.zeroAngle(o, 91.44);
  const r = B.flatShoot(o, za, [914.4])[0];
  const dropIn = -r.y / 0.0254, vFps = r.v / 0.3048;
  // 参照: G7 0.243・2650fps で 約404in落下・残速 約1146fps
  assert.ok(Math.abs(dropIn - 404) / 404 < 0.03, 'drop ' + dropIn);
  assert.ok(Math.abs(vFps - 1146) / 1146 < 0.04, 'velocity ' + vFps);
});

test('標準大気の密度と音速', () => {
  const a = B.stdAtmosphere(0);
  assert.ok(Math.abs(a.rho - 1.225) < 0.002);
  assert.ok(Math.abs(a.c - 340.3) < 0.5);
  assert.ok(Math.abs(B.atmosphereForDA(2000, 10).da - 2000) < 1);
});

test('DOPE は距離とともに増え、密度高度が高いほど小さい', () => {
  const ranges = [100, 300, 500, 700, 900];
  const lo = B.dopeTable(M118, B.atmosphereForDA(0, 15), ranges).rows;
  const hi = B.dopeTable(M118, B.atmosphereForDA(3000, 15), ranges).rows;
  assert.ok(Math.abs(lo[0].elev) < 0.02, 'ゼロ距離では修正0');
  for (let i = 1; i < lo.length; i++) {
    assert.ok(lo[i].elev > lo[i - 1].elev);
    assert.ok(hi[i].elev < lo[i].elev);
    assert.ok(lo[i].wind1 > lo[i - 1].wind1);
  }
});

test('DOPE の値どおりに撃つと照準線の中心に当たる', () => {
  const atm = B.atmosphereForDA(1500, 20);
  const t = B.dopeTable(M118, atm, [800]);
  const mv = M118.mv;
  const r = B.flatShoot({ atm, mv, bc: M118.bc, sightH: M118.sightH }, t.zeroAngle + t.rows[0].elev / 1000, [800])[0];
  assert.ok(Math.abs(r.y) < 0.03, 'y=' + r.y);
});

test('スピンドリフトは右へ、飛行時間とともに大きくなる', () => {
  const sg = B.millerSg(M118.load, M118.mv, B.stdAtmosphere(0));
  assert.ok(sg > 1.4 && sg < 2.5, 'Sg ' + sg);
  assert.ok(B.spinDrift(sg, 1.8) > B.spinDrift(sg, 1.0));
  // 1000yd 付近で 10〜25cm 程度
  const sd = B.spinDrift(sg, 1.75);
  assert.ok(sd > 0.08 && sd < 0.3, 'spin ' + sd);
});

test('コリオリ：北半球で東へ撃つと上に、北へ撃つと右にずれる', () => {
  const omega = B.earthOmega(45);
  const shoot = (dir) => {
    const env = { rho: 1.225, c: 340, bcSI: B.bcToSI(0.243), windAt: null, omega };
    const env0 = Object.assign({}, env, { omega: null });
    const mk = () => ({ p: [0, 0, 0], v: [dir[0] * 800, 0.01 * 800, dir[2] * 800], t: 0 });
    const a = mk(), b = mk();
    while (a.t < 1.6) { B.step(a, 0.001, env); B.step(b, 0.001, env0); }
    return [a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]];
  };
  const east = shoot([1, 0, 0]);
  assert.ok(east[1] > 0, 'east shot goes high');
  const north = shoot([0, 0, -1]);
  assert.ok(north[0] > 0, 'north shot drifts east (right)');
  assert.ok(Math.abs(north[0]) < 0.2, 'size is a few cm');
});
