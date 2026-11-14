// 外部弾道の計算（質点モデル＋G7標準抗力曲線）
// 座標系: x = 東, y = 上, z = 南（three.js と同じ右手系。北は -z）
// 単位: m, s, kg, Pa, ℃。角度の MIL は 1/1000 rad。
(function (root) {
  'use strict';

  // G7 標準弾の抗力係数（マッハ数 → Cd）。JBM などで使われている標準表。
  const G7 = [
    [0.00, 0.1198], [0.05, 0.1197], [0.10, 0.1196], [0.15, 0.1194], [0.20, 0.1193],
    [0.25, 0.1194], [0.30, 0.1194], [0.35, 0.1194], [0.40, 0.1193], [0.45, 0.1193],
    [0.50, 0.1194], [0.55, 0.1193], [0.60, 0.1194], [0.65, 0.1197], [0.70, 0.1202],
    [0.725, 0.1207], [0.75, 0.1215], [0.775, 0.1226], [0.80, 0.1242], [0.825, 0.1266],
    [0.85, 0.1306], [0.875, 0.1368], [0.90, 0.1464], [0.925, 0.1660], [0.95, 0.2054],
    [0.975, 0.2993], [1.00, 0.3803], [1.025, 0.4015], [1.05, 0.4043], [1.075, 0.4034],
    [1.10, 0.4014], [1.125, 0.3987], [1.15, 0.3955], [1.20, 0.3884], [1.25, 0.3810],
    [1.30, 0.3732], [1.35, 0.3657], [1.40, 0.3580], [1.50, 0.3440], [1.55, 0.3376],
    [1.60, 0.3315], [1.65, 0.3260], [1.70, 0.3209], [1.75, 0.3160], [1.80, 0.3117],
    [1.85, 0.3078], [1.90, 0.3042], [1.95, 0.3010], [2.00, 0.2980], [2.05, 0.2951],
    [2.10, 0.2922], [2.15, 0.2892], [2.20, 0.2864], [2.25, 0.2835], [2.30, 0.2807],
    [2.35, 0.2779], [2.40, 0.2752], [2.45, 0.2725], [2.50, 0.2697], [2.55, 0.2670],
    [2.60, 0.2643], [2.65, 0.2615], [2.70, 0.2588], [2.75, 0.2561], [2.80, 0.2533],
    [2.85, 0.2506], [2.90, 0.2479], [2.95, 0.2451], [3.00, 0.2424], [3.10, 0.2368],
    [3.20, 0.2313], [3.30, 0.2258], [3.40, 0.2205], [3.50, 0.2154], [3.60, 0.2106],
    [3.70, 0.2060], [3.80, 0.2017], [3.90, 0.1975], [4.00, 0.1935]
  ];

  function cdG7(mach) {
    if (mach <= 0) return G7[0][1];
    const n = G7.length;
    if (mach >= G7[n - 1][0]) return G7[n - 1][1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (G7[mid][0] <= mach) lo = mid; else hi = mid;
    }
    const [m0, c0] = G7[lo], [m1, c1] = G7[hi];
    return c0 + (c1 - c0) * (mach - m0) / (m1 - m0);
  }

  // ---- 大気 ----
  const R_D = 287.058, R_V = 461.495, RHO0 = 1.225;
  const GRAV = 9.80665;
  const OMEGA_EARTH = 7.292115e-5;

  function satVaporPa(tc) { return 610.78 * Math.pow(10, 7.5 * tc / (tc + 237.3)); }
  function stdPressurePa(alt) { return 101325 * Math.pow(1 - 2.25577e-5 * alt, 5.25588); }
  function stdTempC(alt) { return 15 - 0.0065 * alt; }

  // tempC: 気温, pressurePa: 現地気圧, humidity: 0..1
  function atmosphere(tempC, pressurePa, humidity) {
    const T = tempC + 273.15;
    const pv = Math.max(0, Math.min(1, humidity || 0)) * satVaporPa(tempC);
    const pd = pressurePa - pv;
    const rho = pd / (R_D * T) + pv / (R_V * T);
    const c = 331.3 * Math.sqrt(1 + tempC / 273.15);
    return { tempC, pressurePa, humidity: humidity || 0, rho, c, da: densityAltitude(rho) };
  }
  function densityAltitude(rho) { return (1 - Math.pow(rho / RHO0, 1 / 4.25588)) / 2.25577e-5; }
  function stdAtmosphere(alt) { return atmosphere(stdTempC(alt), stdPressurePa(alt), 0); }

  // ---- 弾の安定係数（Miller の式）とスピンドリフト（Litz の近似式） ----
  // load: {massGr, diaIn, lenIn, twistIn, mv}
  function millerSg(load, mv, atm) {
    const t = load.twistIn / load.diaIn;   // ツイスト（口径数）
    const l = load.lenIn / load.diaIn;     // 弾長（口径数）
    const vfps = mv / 0.3048;
    const tf = atm.tempC * 9 / 5 + 32;
    const pin = atm.pressurePa / 3386.389;
    let sg = 30 * load.massGr / (t * t * Math.pow(load.diaIn, 3) * l * (1 + l * l));
    sg *= Math.pow(vfps / 2800, 1 / 3);
    sg *= ((tf + 460) / (59 + 460)) * (29.92 / pin);
    return sg;
  }
  // 飛行時間 tof 秒での横ずれ量（m、右ツイストなら右へ）
  function spinDrift(sg, tof) {
    if (tof <= 0) return 0;
    return 1.25 * (sg + 1.2) * Math.pow(tof, 1.83) * 0.0254;
  }

  // ---- 1発の弾の状態を進める ----
  // b: {p:[x,y,z], v:[x,y,z], t}
  // env: {rho, c, bcSI, windAt(p,t)->[wx,wy,wz] or null, omega:[ox,oy,oz] or null}
  function accel(p, v, t, env, out) {
    let wx = 0, wy = 0, wz = 0;
    if (env.windAt) { const w = env.windAt(p, t); wx = w[0]; wy = w[1]; wz = w[2]; }
    const rx = v[0] - wx, ry = v[1] - wy, rz = v[2] - wz;
    const vr = Math.sqrt(rx * rx + ry * ry + rz * rz);
    const k = env.rho * cdG7(vr / env.c) * Math.PI / (8 * env.bcSI) * vr;
    let ax = -k * rx, ay = -k * ry - GRAV, az = -k * rz;
    if (env.omega) {
      const o = env.omega; // a = -2 Ω × v
      ax += -2 * (o[1] * v[2] - o[2] * v[1]);
      ay += -2 * (o[2] * v[0] - o[0] * v[2]);
      az += -2 * (o[0] * v[1] - o[1] * v[0]);
    }
    out[0] = ax; out[1] = ay; out[2] = az;
    return out;
  }

  const _a1 = [0, 0, 0], _a2 = [0, 0, 0], _pm = [0, 0, 0], _vm = [0, 0, 0];
  // 中点法（RK2）で dt 秒進める
  function step(b, dt, env) {
    const p = b.p, v = b.v;
    accel(p, v, b.t, env, _a1);
    const h = dt * 0.5;
    _pm[0] = p[0] + v[0] * h; _pm[1] = p[1] + v[1] * h; _pm[2] = p[2] + v[2] * h;
    _vm[0] = v[0] + _a1[0] * h; _vm[1] = v[1] + _a1[1] * h; _vm[2] = v[2] + _a1[2] * h;
    accel(_pm, _vm, b.t + h, env, _a2);
    p[0] += _vm[0] * dt; p[1] += _vm[1] * dt; p[2] += _vm[2] * dt;
    v[0] += _a2[0] * dt; v[1] += _a2[1] * dt; v[2] += _a2[2] * dt;
    b.t += dt;
  }

  function bcToSI(bcG7) { return bcG7 * 703.0696; } // lb/in² → kg/m²

  // 地球自転ベクトル（x=東, y=上, z=南）
  function earthOmega(latDeg) {
    const la = latDeg * Math.PI / 180;
    return [0, OMEGA_EARTH * Math.sin(la), -OMEGA_EARTH * Math.cos(la)];
  }

  // ---- 平らな射場での 2D 解（DOPE カード・ゼロイン用） ----
  // 射手は原点、照準線は +x 方向に水平。銃口は照準線の sightH 下。
  // angle: 照準線に対する銃身の上向き角（rad）
  // 戻り値: 各距離での {y (照準線からの高さ m), tof, v, drift (横風1m/sでの横ずれ m)}
  function flatShoot(opts, angle, ranges, crossWind) {
    const env = { rho: opts.atm.rho, c: opts.atm.c, bcSI: bcToSI(opts.bc), windAt: null, omega: null };
    if (crossWind) { const w = [0, 0, crossWind]; env.windAt = () => w; }
    const b = { p: [0, -opts.sightH, 0], v: [opts.mv * Math.cos(angle), opts.mv * Math.sin(angle), 0], t: 0 };
    const out = [];
    let i = 0, prevX = 0, prevY = b.p[1], prevZ = 0, prevT = 0;
    const dt = opts.dt || 0.0005;
    while (i < ranges.length && b.t < 8) {
      prevX = b.p[0]; prevY = b.p[1]; prevZ = b.p[2]; prevT = b.t;
      step(b, dt, env);
      while (i < ranges.length && b.p[0] >= ranges[i]) {
        const f = (ranges[i] - prevX) / (b.p[0] - prevX);
        out.push({
          range: ranges[i],
          y: prevY + (b.p[1] - prevY) * f,
          z: prevZ + (b.p[2] - prevZ) * f,
          tof: prevT + (b.t - prevT) * f,
          v: Math.hypot(b.v[0], b.v[1])
        });
        i++;
      }
    }
    return out;
  }

  // ゼロイン: zeroRange で照準線と交わる銃身角を求める
  function zeroAngle(opts, zeroRange) {
    let a = (opts.sightH / zeroRange);
    for (let k = 0; k < 8; k++) {
      const r = flatShoot(opts, a, [zeroRange])[0];
      a -= r.y / zeroRange;
      if (Math.abs(r.y) < 1e-5) break;
    }
    return a;
  }

  // 距離 range で照準線中心に当てるのに必要な上方修正（MIL）
  function elevationMil(opts, zeroA, range) {
    let add = 0;
    for (let k = 0; k < 6; k++) {
      const r = flatShoot(opts, zeroA + add, [range])[0];
      if (!r) return NaN;
      const err = r.y / range;
      add -= err;
      if (Math.abs(err) < 2e-6) break;
    }
    return add * 1000;
  }

  // DOPE 表を作る（1本の弾道で目安を出し、距離ごとに1回だけ撃ち直して正確にする）
  // rifle: {mv(15℃), mvTempCoef(m/s/℃), bc, sightH, zeroRange, load}
  // atm: atmosphere()
  function dopeTable(rifle, atm, ranges) {
    const zeroAtm = stdAtmosphere(0);
    const zOpts = { atm: zeroAtm, mv: rifle.mv, bc: rifle.bc, sightH: rifle.sightH, dt: 0.0005 };
    const zA = zeroAngle(zOpts, rifle.zeroRange);
    const mv = rifle.mv + rifle.mvTempCoef * (atm.tempC - 15);
    const opts = { atm, mv, bc: rifle.bc, sightH: rifle.sightH, dt: 0.001 };
    const sg = millerSg(rifle.load, mv, atm);
    const base = flatShoot(opts, zA, ranges);
    const windy = flatShoot(opts, zA, ranges, 1);
    const rows = [];
    for (let i = 0; i < base.length && i < windy.length; i++) {
      const r = base[i].range;
      let add = -Math.atan2(base[i].y, r);
      // 1回撃ち直して誤差を詰める
      const chk = flatShoot(opts, zA + add, [r])[0];
      if (chk) add -= chk.y / r;
      const fin = flatShoot(opts, zA + add, [r])[0] || base[i];
      rows.push({
        range: r,
        elev: add * 1000,
        wind1: (windy[i].z / r) * 1000,            // 1 m/s 直角横風での横ずれ（MIL）
        spin: spinDrift(sg, fin.tof) / r * 1000,   // スピンドリフト（MIL、右）
        tof: fin.tof,
        vel: fin.v,
        mach: fin.v / atm.c
      });
    }
    return { rows, zeroAngle: zA, sg, mv };
  }

  // 密度高度 da(m) で気温 tempC のときの大気（乾燥空気）
  function atmosphereForDA(da, tempC) {
    const rho = RHO0 * Math.pow(1 - 2.25577e-5 * da, 4.25588);
    const p = rho * R_D * (tempC + 273.15);
    return atmosphere(tempC, p, 0);
  }

  const api = {
    G7, cdG7, GRAV, atmosphere, stdAtmosphere, stdPressurePa, stdTempC, densityAltitude,
    satVaporPa, millerSg, spinDrift, step, accel, bcToSI, earthOmega,
    flatShoot, zeroAngle, elevationMil, dopeTable, atmosphereForDA
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SN = root.SN || {};
  root.SN.Ballistics = api;
})(typeof window !== 'undefined' ? window : globalThis);
