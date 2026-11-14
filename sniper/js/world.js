// 地形・空・植生・建物・旗・風の場
(function (root) {
  'use strict';
  const SN = root.SN = root.SN || {};
  const T = () => root.THREE;
  const DEG = Math.PI / 180;

  // ---- 乱数とノイズ ----
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  function fbm(x, y, s, oct) {
    let sum = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { sum += vnoise(x * f, y * f, s + i * 17) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  }
  function ridged(x, y, s, oct) {
    let sum = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(vnoise(x * f, y * f, s + i * 31)); sum += n * n * amp; norm += amp; amp *= 0.5; f *= 2.1; }
    return sum / norm;
  }
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  SN.rand = mulberry; SN.noise = { vnoise, fbm, ridged, smooth };

  // ---- ジオメトリ合成（頂点カラー付きの箱などを1メッシュにまとめる） ----
  class Builder {
    constructor() { this.pos = []; this.nor = []; this.col = []; }
    addGeo(geo, matrix, color) {
      const THREE = T();
      const g = geo.index ? geo.toNonIndexed() : geo;
      g.applyMatrix4(matrix);
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      const c = new THREE.Color(color);
      for (let i = 0; i < p.length; i += 3) {
        this.pos.push(p[i], p[i + 1], p[i + 2]);
        this.nor.push(n[i], n[i + 1], n[i + 2]);
        this.col.push(c.r, c.g, c.b);
      }
      geo.dispose(); if (g !== geo) g.dispose();
      return this;
    }
    mat(x, y, z, ry, rx, rz) {
      const THREE = T();
      const m = new THREE.Matrix4();
      m.makeRotationFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ'));
      m.setPosition(x, y, z);
      return m;
    }
    box(w, h, d, x, y, z, color, ry, rx, rz) { return this.addGeo(new (T().BoxGeometry)(w, h, d), this.mat(x, y, z, ry, rx, rz), color); }
    cyl(r1, r2, h, seg, x, y, z, color, ry, rx, rz) { return this.addGeo(new (T().CylinderGeometry)(r1, r2, h, seg), this.mat(x, y, z, ry, rx, rz), color); }
    sphere(r, x, y, z, color, sx, sy, sz) {
      const THREE = T();
      const m = this.mat(x, y, z); m.scale(new THREE.Vector3(sx || 1, sy || 1, sz || 1));
      return this.addGeo(new THREE.IcosahedronGeometry(r, 1), m, color);
    }
    prism(w, h, d, x, y, z, color, ry) { // 三角屋根（テント）
      const THREE = T();
      const shape = new THREE.Shape(); shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0); shape.lineTo(0, h); shape.lineTo(-w / 2, 0);
      const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
      g.translate(0, 0, -d / 2); g.computeVertexNormals();
      return this.addGeo(g, this.mat(x, y, z, ry), color);
    }
    geometry() {
      const THREE = T();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
      g.computeBoundingSphere();
      return g;
    }
  }
  SN.Builder = Builder;

  // 繰り返し使える地面テクスチャ（周期的なノイズ＋小石）
  function groundTexture(desert, seed) {
    const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
    const per = (x, y, f, s2) => { // 周期 N の値ノイズ
      const P = f; const fx = x / N * P, fy = y / N * P;
      const xi = Math.floor(fx), yi = Math.floor(fy), xf = fx - xi, yf = fy - yi;
      const h = (i, j) => hash2(((i % P) + P) % P, ((j % P) + P) % P, s2);
      const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      return h(xi, yi) * (1 - u) * (1 - v) + h(xi + 1, yi) * u * (1 - v) + h(xi, yi + 1) * (1 - u) * v + h(xi + 1, yi + 1) * u * v;
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let n = per(x, y, 4, seed) * 0.45 + per(x, y, 16, seed + 1) * 0.3 + per(x, y, 64, seed + 2) * 0.25;
      let v = 0.72 + (n - 0.5) * (desert ? 0.38 : 0.5);
      const grain = hash2(x, y, seed + 9);
      if (grain > 0.985) v -= 0.25; else if (grain < 0.01) v += 0.12;
      const i = (y * N + x) * 4;
      const r = desert ? 1.0 : 0.97, gg = desert ? 0.97 : 1.0, b = desert ? 0.92 : 0.95;
      d[i] = Math.min(255, v * 255 * r); d[i + 1] = Math.min(255, v * 255 * gg); d[i + 2] = Math.min(255, v * 255 * b); d[i + 3] = 255;
    }
    // 小石
    const rr = mulberry(seed + 3);
    g.putImageData(img, 0, 0);
    for (let k = 0; k < 260; k++) {
      const x = rr() * N, y = rr() * N, r = 0.6 + rr() * 2.2, l = 90 + rr() * 90;
      g.fillStyle = 'rgba(' + (l | 0) + ',' + ((l * 0.95) | 0) + ',' + ((l * 0.88) | 0) + ',0.55)';
      g.beginPath(); g.ellipse(x, y, r, r * 0.7, rr() * 3, 0, Math.PI * 2); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }

  // ---- 風の場 ----
  // 風向（どこから吹くか、方位°）と風速。射線に沿って3つの区間で強さと向きが変わり、突風は風下へ流れる。
  class Wind {
    constructor(wx, seed, lineStart, lineEnd) {
      this.wx = wx; this.seed = seed;
      this.a = lineStart; this.b = lineEnd;
      const dx = lineEnd.x - lineStart.x, dz = lineEnd.z - lineStart.z;
      this.len = Math.hypot(dx, dz) || 1; this.ux = dx / this.len; this.uz = dz / this.len;
      const r = mulberry(seed);
      this.ph = []; for (let i = 0; i < 12; i++) this.ph.push(r() * 1000);
      this._v = [0, 0, 0];
    }
    // 位置 p（[x,y,z] または {x,z}）と時刻 t の風ベクトル（風の流れる向き）
    at(p, t, out) {
      const px = p.x !== undefined ? p.x : p[0], pz = p.z !== undefined ? p.z : p[2];
      const f = Math.max(0, Math.min(1, ((px - this.a.x) * this.ux + (pz - this.a.z) * this.uz) / this.len));
      const z = this.wx.zones;
      // 区間の中心 1/6, 1/2, 5/6 を滑らかに補間
      let m, dOff;
      if (f < 1 / 6) { m = z[0][0]; dOff = z[0][1]; }
      else if (f < 0.5) { const k = smooth(1 / 6, 0.5, f); m = z[0][0] + (z[1][0] - z[0][0]) * k; dOff = z[0][1] + (z[1][1] - z[0][1]) * k; }
      else if (f < 5 / 6) { const k = smooth(0.5, 5 / 6, f); m = z[1][0] + (z[2][0] - z[1][0]) * k; dOff = z[1][1] + (z[2][1] - z[1][1]) * k; }
      else { m = z[2][0]; dOff = z[2][1]; }
      // 突風は風下に約 (風速) m/s で流れる → 位置で時間をずらす
      const lag = (f * this.len) / Math.max(2, this.wx.wind * 1.2);
      const tt = t - lag;
      const ph = this.ph;
      const g = Math.sin(tt * 0.21 + ph[0]) * 0.45 + Math.sin(tt * 0.53 + ph[1]) * 0.3 + Math.sin(tt * 1.37 + ph[2]) * 0.15 + vnoise(tt * 0.35, f * 3, this.seed) * 0.5;
      const speed = Math.max(0, this.wx.wind * m + this.wx.gust * g);
      const dirWander = (Math.sin(tt * 0.17 + ph[3]) * 7 + Math.sin(tt * 0.61 + ph[4]) * 4) * (1 + 1.5 / (0.5 + this.wx.wind));
      const from = (this.wx.windFrom + dOff + dirWander) * DEG;
      const to = from + Math.PI;
      const o = out || this._v;
      o[0] = Math.sin(to) * speed; o[1] = 0; o[2] = -Math.cos(to) * speed;
      return o;
    }
    // 射線に対する横風成分（右へ流れる向きが正, m/s）と向かい風成分
    components(w) {
      const rx = this.uz * -1, rz = this.ux; // 右方向 (cos az, sin az) = (−uz, ux)
      return { cross: w[0] * (-this.uz) + w[2] * this.ux, head: -(w[0] * this.ux + w[2] * this.uz), rx, rz };
    }
  }
  SN.Wind = Wind;

  // ---- ワールド構築 ----
  SN.buildWorld = function (mission, quality) {
    const THREE = T();
    const hi = quality !== 'low';
    const seed = mission.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
    const rnd = mulberry(seed);
    const desert = mission.region === 'desert';
    const az = mission.azimuth * DEG;
    const sinA = Math.sin(az), cosA = Math.cos(az);
    const D = mission.D, hT = mission.elevDiff;
    const toWorld = (u, v) => ({ x: u * sinA + v * cosA, z: -u * cosA + v * sinA });
    const toLocal = (x, z) => ({ u: x * sinA - z * cosA, v: x * cosA + z * sinA });

    const scene = new THREE.Scene();

    // 地形の高さ（局所座標 u: 射線方向, v: 右）
    const positions = mission.positions;
    const valleyDepth = desert ? 4 + 0.008 * D : Math.min(0.14 * D, 260);
    const noiseAmp = desert ? 7 : 55;
    function rawHeight(u, v) {
      // 射手から基地へ直線的に変わる基準面
      let g;
      if (u <= 0) g = (desert ? 0.02 : 0.12) * (-u) * smooth(0, 300, -u) + 0;
      else if (u >= D) g = hT;
      else g = hT * (u / D);
      // 谷（射線の下を掘る）
      if (u > 0 && u < D) g -= valleyDepth * Math.pow(Math.sin(Math.PI * u / D), 0.8) * Math.exp(-Math.pow(v / 900, 2));
      // 谷の両側の斜面
      const av = Math.abs(v);
      g += (desert ? 25 : 320) * smooth(350, 1700, av) * (0.6 + 0.4 * fbm(u / 900, v / 900, seed + 5, 3));
      // ノイズ（射手と基地の近くは弱める）
      let mask = 1;
      for (const p of positions) { const d = Math.hypot(u - p.u, v - p.v); mask = Math.min(mask, smooth(12, 140, d)); }
      const db = Math.hypot(u - D, v); mask = Math.min(mask, smooth(70, 220, db));
      if (desert) {
        // 砂丘: 風向きに沿った筋状の起伏
        const wd = (mission.wx.windFrom - mission.azimuth) * DEG;
        const along = u * Math.cos(wd) + v * Math.sin(wd), across = -u * Math.sin(wd) + v * Math.cos(wd);
        const dune = Math.pow(Math.abs(Math.sin(across / 70 + fbm(along / 300, across / 300, seed, 2) * 2)), 1.6);
        g += mask * (dune * 6 + fbm(u / 400, v / 400, seed + 2, 3) * noiseAmp);
      } else {
        g += mask * (fbm(u / 700, v / 700, seed + 3, 4) * noiseAmp + ridged(u / 260, v / 260, seed + 9, 3) * 18 - 9 + fbm(u / 60, v / 60, seed + 4, 2) * 3);
      }
      // 崖（最終任務：基地の奥が切り立つ）
      if (mission.base === 'cliff') g += 70 * smooth(D + 22, D + 55, u) * Math.exp(-Math.pow(v / 260, 2));
      if (mission.base === 'hangar') g += 12 * smooth(D + 40, D + 90, u) * Math.exp(-Math.pow(v / 400, 2));
      // 射撃位置は平らに
      for (const p of positions) {
        const d = Math.hypot(u - p.u, v - p.v);
        const k = 1 - smooth(6, 16, d);
        if (k > 0) { const gp = rawHeightCore(p.u, p.v); g = g * (1 - k) + gp * k; }
      }
      // 基地は平らに
      const kb = 1 - smooth(55, 120, db);
      if (kb > 0) g = g * (1 - kb) + (hT + fbm(u / 30, v / 30, seed + 7, 2) * 0.15) * kb;
      return g;
    }
    function rawHeightCore(u, v) {
      // 射撃位置の高さ（平らにする前の基準面＋少しのノイズ）
      let g = u <= 0 ? (desert ? 0.02 : 0.12) * (-u) * smooth(0, 300, -u) : (u >= D ? hT : hT * (u / D));
      if (u > 0 && u < D) g -= valleyDepth * Math.pow(Math.sin(Math.PI * u / D), 0.8) * Math.exp(-Math.pow(v / 900, 2));
      g += (desert ? 25 : 320) * smooth(350, 1700, Math.abs(v)) * (0.6 + 0.4 * fbm(u / 900, v / 900, seed + 5, 3));
      return g + (desert ? 1.5 : 4);
    }

    // グリッド
    const cell = hi ? 20 : 28;
    const u0 = -1200, u1 = D + 1600, v0 = -2200, v1 = 2200;
    const nu = Math.ceil((u1 - u0) / cell), nv = Math.ceil((v1 - v0) / cell);
    const H = new Float32Array((nu + 1) * (nv + 1));
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) H[i * (nv + 1) + j] = rawHeight(u0 + i * cell, v0 + j * cell);

    // 三角形補間（メッシュと完全に一致）
    function gridHeight(u, v) {
      const fu = (u - u0) / cell, fv = (v - v0) / cell;
      let i = Math.floor(fu), j = Math.floor(fv);
      if (i < 0) i = 0; if (j < 0) j = 0; if (i >= nu) i = nu - 1; if (j >= nv) j = nv - 1;
      const a = fu - i, b = fv - j;
      const h00 = H[i * (nv + 1) + j], h10 = H[(i + 1) * (nv + 1) + j], h01 = H[i * (nv + 1) + j + 1], h11 = H[(i + 1) * (nv + 1) + j + 1];
      if (a + b <= 1) return h00 + (h10 - h00) * a + (h01 - h00) * b;
      return h11 + (h01 - h11) * (1 - a) + (h10 - h11) * (1 - b);
    }
    const groundAt = (x, z) => { const l = toLocal(x, z); return gridHeight(l.u, l.v); };

    // 射線をふさぐ地形を掘り下げる（何度か確認）
    const EYE = 0.32;
    const posWorld = positions.map(p => { const w = toWorld(p.u, p.v); return { ...p, x: w.x, z: w.z }; });
    const baseW = toWorld(D, 0);
    for (let iter = 0; iter < 4; iter++) {
      let changed = false;
      for (const p of posWorld) {
        const gy = gridHeight(p.u, p.v);
        const ey = gy + EYE, ty = hT + 1.2;
        const du = D - p.u, dv = -p.v;
        const len = Math.hypot(du, dv);
        // 必要な掘り下げ量
        let need = 0;
        for (let s = 0.02; s <= 0.97; s += 0.005) {
          const u = p.u + du * s, v = p.v + dv * s;
          const line = ey + (ty - ey) * s;
          const clear = s < 0.06 ? 0.15 : (s > 0.9 ? 0.8 : 2.5);
          const over = gridHeight(u, v) - (line - clear);
          if (over > 0) need = Math.max(need, over / Math.pow(Math.sin(Math.PI * s), 0.6));
        }
        if (need > 0) {
          changed = true;
          need += 0.5;
          for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
            const u = u0 + i * cell, v = v0 + j * cell;
            // 線分への射影
            const s = ((u - p.u) * du + (v - p.v) * dv) / (len * len);
            if (s <= 0 || s >= 1) continue;
            const pu = p.u + du * s, pv = p.v + dv * s;
            const d = Math.hypot(u - pu, v - pv);
            const w = Math.exp(-Math.pow(d / (60 + 0.25 * len * Math.sin(Math.PI * s)), 2));
            if (w < 0.01) continue;
            H[i * (nv + 1) + j] -= need * Math.pow(Math.sin(Math.PI * s), 0.6) * w;
          }
        }
      }
      if (!changed) break;
    }
    for (const p of posWorld) { p.y = gridHeight(p.u, p.v); p.eye = p.y + EYE; }
    const baseY = gridHeight(D, 0);

    // ---- 地形メッシュ ----
    const snowLine = desert ? 99999 : (mission.wx.tempC < -2 ? 2900 : 3500) - mission.wx.alt;
    const tg = new THREE.BufferGeometry();
    const vp = new Float32Array((nu + 1) * (nv + 1) * 3), vc = new Float32Array((nu + 1) * (nv + 1) * 3);
    const cSand = new THREE.Color(0xb8956a), cSand2 = new THREE.Color(0xcfb186), cRockD = new THREE.Color(0x8a6c4a);
    const cGrass = new THREE.Color(0x968b60), cRock = new THREE.Color(0x77716a), cRock2 = new THREE.Color(0x5e5a55), cSnow = new THREE.Color(0xeef1f5), cDirt = new THREE.Color(0x8c7a5c);
    const tmp = new THREE.Color();
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const k = i * (nv + 1) + j, u = u0 + i * cell, v = v0 + j * cell;
      const w = toWorld(u, v), h = H[k];
      vp[k * 3] = w.x; vp[k * 3 + 1] = h; vp[k * 3 + 2] = w.z;
      // 傾斜
      const hu = H[Math.min(i + 1, nu) * (nv + 1) + j] - H[Math.max(i - 1, 0) * (nv + 1) + j];
      const hv = H[i * (nv + 1) + Math.min(j + 1, nv)] - H[i * (nv + 1) + Math.max(j - 1, 0)];
      const slope = Math.hypot(hu, hv) / (2 * cell);
      const n1 = fbm(u / 80, v / 80, seed + 11, 3) * 0.5 + 0.5;
      if (desert) {
        tmp.copy(cSand).lerp(cSand2, n1);
        tmp.lerp(cRockD, smooth(0.25, 0.6, slope));
      } else {
        tmp.copy(cGrass).lerp(cDirt, n1 * 0.6);
        tmp.lerp(n1 > 0.5 ? cRock : cRock2, smooth(0.3, 0.7, slope));
        const sn = smooth(snowLine - 60, snowLine + 60, h + n1 * 80) * (1 - smooth(0.6, 1.0, slope));
        tmp.lerp(cSnow, sn);
      }
      // 基地の地面は踏み固められて少し暗い
      const db = Math.hypot(u - D, v);
      if (db < 90) tmp.lerp(desert ? cRockD : cDirt, (1 - smooth(30, 90, db)) * 0.35);
      vc[k * 3] = tmp.r; vc[k * 3 + 1] = tmp.g; vc[k * 3 + 2] = tmp.b;
    }
    const idx = [];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j, b = (i + 1) * (nv + 1) + j, c = i * (nv + 1) + j + 1, d = (i + 1) * (nv + 1) + j + 1;
      // gridHeight と同じ分割: (a,b,c) と (d,c,b)
      idx.push(a, c, b, d, b, c);
    }
    tg.setAttribute('position', new THREE.BufferAttribute(vp, 3));
    tg.setAttribute('color', new THREE.BufferAttribute(vc, 3));
    tg.setIndex(idx);
    tg.computeVertexNormals();
    // 向きの確認（法線が上向きになるように）
    const nrm = tg.attributes.normal.array;
    if (nrm[1] < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } tg.setIndex(idx); tg.computeVertexNormals(); }
    // 地面の細かい模様（スコープで見たときの小石・土のむら）
    const uvs = new Float32Array((nu + 1) * (nv + 1) * 2);
    for (let k = 0; k < (nu + 1) * (nv + 1); k++) { uvs[k * 2] = vp[k * 3] / 6; uvs[k * 2 + 1] = vp[k * 3 + 2] / 6; }
    tg.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: groundTexture(desert, seed) });
    const terrain = new THREE.Mesh(tg, terrainMat);
    scene.add(terrain);

    // ---- 遠景の山 ----
    {
      const ring = new THREE.BufferGeometry();
      const segA = 120, segR = 16, rp = [], rc = [], ri = [];
      const cx = toWorld(D / 2, 0);
      const farCol = desert ? new THREE.Color(0xb08f68) : new THREE.Color(0x6f6a66);
      const farSnow = new THREE.Color(0xe9edf2);
      for (let r = 0; r <= segR; r++) {
        const rad = 1400 + Math.pow(r / segR, 1.6) * 44000;
        for (let a = 0; a <= segA; a++) {
          const ang = a / segA * Math.PI * 2;
          const x = cx.x + Math.cos(ang) * rad, z = cx.z + Math.sin(ang) * rad;
          const rise = smooth(2600, 7000, rad);
          let h;
          if (desert) h = 60 + ridged(Math.cos(ang) * 3 + r * 0.3, Math.sin(ang) * 3, seed + 21, 3) * 520;
          else h = 200 + ridged(Math.cos(ang) * 4 + r * 0.25, Math.sin(ang) * 4, seed + 23, 4) * 2600;
          h = h * rise + (-600 + Math.min(0, hT)) * (1 - rise);
          rp.push(x, h + hT * 0.5 * rise, z);
          const c = farCol.clone();
          if (!desert && h > 1500 - mission.wx.alt * 0.3) c.lerp(farSnow, 0.85);
          rc.push(c.r, c.g, c.b);
        }
      }
      for (let r = 0; r < segR; r++) for (let a = 0; a < segA; a++) {
        const i0 = r * (segA + 1) + a, i1 = i0 + 1, i2 = i0 + segA + 1, i3 = i2 + 1;
        ri.push(i0, i2, i1, i1, i2, i3);
      }
      ring.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      ring.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
      ring.setIndex(ri); ring.computeVertexNormals();
      if (ring.attributes.normal.array[1] < 0) { for (let i = 0; i < ri.length; i += 3) { const t = ri[i + 1]; ri[i + 1] = ri[i + 2]; ri[i + 2] = t; } ring.setIndex(ri); ring.computeVertexNormals(); }
      scene.add(new THREE.Mesh(ring, new THREE.MeshLambertMaterial({ vertexColors: true })));
    }

    // ---- 空・光・霞 ----
    const sunEl = mission.sun.el * DEG, sunAz = mission.sun.az * DEG;
    const sunDir = new THREE.Vector3(Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), -Math.cos(sunAz) * Math.cos(sunEl));
    const haze = desert ? new THREE.Color(0xd9cdb5) : new THREE.Color(0xc4cfdb);
    const zenith = desert ? new THREE.Color(0x5b88b8) : new THREE.Color(0x3f6fa8);
    if (mission.sun.el < 25) haze.lerp(new THREE.Color(0xe8c9a0), 0.35);
    scene.fog = new THREE.Fog(haze, 600, mission.wx.haze);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: { uZen: { value: zenith }, uHor: { value: haze }, uSun: { value: sunDir }, uSunCol: { value: new THREE.Color(0xfff2d8) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
      fragmentShader: 'uniform vec3 uZen; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunCol; varying vec3 vDir; void main(){ vec3 d = normalize(vDir); float h = clamp(d.y,0.0,1.0); vec3 c = mix(uHor, uZen, pow(h,0.45)); float s = max(dot(d,uSun),0.0); c += uSunCol*(pow(s,800.0)*4.0 + pow(s,12.0)*0.18); if(d.y<0.0) c = uHor; gl_FragColor = vec4(c,1.0); }',
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat);
    sky.renderOrder = -10; sky.frustumCulled = false;
    scene.add(sky);
    const sun = new THREE.DirectionalLight(mission.sun.el < 25 ? 0xffe2bf : 0xfff6e8, desert ? 1.4 : 1.75);
    sun.position.copy(sunDir).multiplyScalar(1000);
    scene.add(sun); scene.add(sun.target);
    scene.add(new THREE.HemisphereLight(zenith.clone().lerp(new THREE.Color(0xffffff), 0.5), desert ? 0x8a7050 : 0x5a554c, desert ? 0.85 : 0.9));

    // ---- 衝突判定用の箱 ----
    const colliders = []; // {kind, obj, center:Vector3, half:Vector3, rotY, inv:Matrix4, r, tag}
    function addCollider(cx, cy, cz, w, h, d, rotY, tag, data) {
      const m = new THREE.Matrix4().makeRotationY(rotY || 0).setPosition(cx, cy, cz);
      const inv = m.clone().invert();
      colliders.push({ center: new THREE.Vector3(cx, cy, cz), half: new THREE.Vector3(w / 2, h / 2, d / 2), rotY: rotY || 0, m, inv, r: Math.hypot(w, h, d) / 2, tag: tag || 'hard', data });
    }

    // ---- 構造物 ----
    const structures = [];
    const flags = [];
    const plates = [];
    const structMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (const s of mission.structures) {
      const lu = D + s.du, lv = s.dv;
      const w = toWorld(lu, lv);
      const gy = gridHeight(lu, lv);
      const rot = Math.PI - (mission.azimuth + (s.rot || 0)) * DEG; // 正面（-z）が射手の方を向く
      const b = new Builder();
      const g = new THREE.Group();
      g.position.set(w.x, gy, w.z); g.rotation.y = rot;
      const info = { s, x: w.x, y: gy, z: w.z, rot, group: g, label: s.label, id: s.id };
      const C = (lx, ly, lz, wd, ht, dp, tag, data) => {
        // 局所 → ワールド
        const cx = w.x + lx * Math.cos(rot) + lz * Math.sin(rot);
        const cz = w.z - lx * Math.sin(rot) + lz * Math.cos(rot);
        addCollider(cx, gy + ly, cz, wd, ht, dp, rot, tag, data);
      };
      switch (s.t) {
        case 'plate': {
          b.box(0.06, 1.5, 0.06, -0.45, 0.75, 0, 0x6b5a45).box(0.06, 1.5, 0.06, 0.45, 0.75, 0, 0x6b5a45).box(1.0, 0.06, 0.06, 0, 1.47, 0, 0x6b5a45);
          // 吊り下げる鉄板は別メッシュ（揺れる）
          const plateG = new THREE.Group(); plateG.position.set(0, 1.42, 0);
          const pm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.025), new THREE.MeshLambertMaterial({ color: 0xe6e3da }));
          pm.position.set(0, -0.08 - 0.35, 0);
          plateG.add(pm);
          // 鎖
          const chain = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.08, 0.015), new THREE.MeshLambertMaterial({ color: 0x333333 }));
          chain.position.set(0, -0.04, 0); plateG.add(chain);
          g.add(plateG);
          const plate = { id: s.id, label: s.label, group: plateG, mesh: pm, swing: 0, swingV: 0, hits: 0, info };
          plates.push(plate);
          C(0, 1.42 - 0.08 - 0.35, 0, 0.5, 0.7, 0.04, 'plate', plate);
          info.h = 0.7; info.topY = 0.99 + 0.35; info.centerY = 0.99;
          break;
        }
        case 'hut2':
          b.box(3, 2.2, 2.5, 0, 1.1, 0, 0x8d7b62).box(3.3, 0.2, 2.8, 0, 2.3, 0, 0x5f5348).box(0.9, 1.8, 0.05, 0.6, 0.9, -1.27, 0x2c2620);
          C(0, 1.2, 0, 3.3, 2.4, 2.8); info.h = 2.4; break;
        case 'drum': {
          const cols = [0x3c5a7a, 0x5b6a3a, 0x8a4a2a];
          b.cyl(0.29, 0.29, 0.88, 12, 0, 0.44, 0, cols[Math.floor(rnd() * 3)]);
          C(0, 0.44, 0, 0.58, 0.88, 0.58); info.h = 0.88; break;
        }
        case 'stake':
          b.box(0.08, 1.0, 0.08, 0, 0.5, 0, 0xf2f2ee).box(0.085, 0.15, 0.085, 0, 0.92, 0, 0xc23a2a);
          C(0, 0.5, 0, 0.08, 1, 0.08); info.h = 1.0; break;
        case 'hut':
          b.box(4, 2.5, 3.5, 0, 1.25, 0, 0x7d776d).box(4.3, 0.15, 3.8, 0, 2.55, 0, 0x5a5650).box(0.9, 1.7, 0.05, -0.8, 0.85, -1.76, 0x1f1c18).box(0.6, 0.4, 0.05, 1.0, 1.6, -1.76, 0x1f1c18);
          C(0, 1.3, 0, 4.3, 2.6, 3.8); info.h = 2.5; break;
        case 'house':
          b.box(6, 3, 5, 0, 1.5, 0, 0xb39a74).box(6.4, 0.2, 5.4, 0, 3.05, 0, 0x9c8565).box(1.1, 2.0, 0.05, -1.2, 1.0, -2.51, 0x2a2219).box(0.8, 0.6, 0.05, 1.6, 1.8, -2.51, 0x2a2219);
          C(0, 1.55, 0, 6.4, 3.1, 5.4); info.h = 3.0; break;
        case 'wall': {
          const len = s.len || 10;
          b.box(0.5, 1.4, len, 0, 0.7, 0, 0xa88f6a);
          C(0, 0.7, 0, 0.5, 1.4, len); info.h = 1.4; break;
        }
        case 'sandbags': {
          const len = s.len || 5;
          for (let row = 0; row < 4; row++) for (let k = 0; k < Math.floor(len / 0.6); k++) {
            const off = (row % 2) * 0.3;
            b.box(0.58, 0.28, 0.6, 0, 0.15 + row * 0.29, -len / 2 + 0.3 + k * 0.6 + off - 0.15, (row + k) % 3 ? 0x9b8a62 : 0x8c7c58, 0, 0, 0);
          }
          C(0, 0.6, 0, 0.6, 1.2, len); info.h = 1.2; break;
        }
        case 'truck': {
          const body = 0x5a5d45, dark = 0x1d1d1b;
          b.box(2.4, 2.3, 2.0, 0, 1.55, -2.6, body).box(2.2, 0.8, 0.05, 0, 2.0, -3.61, 0x2c3236);
          b.box(2.4, 0.3, 5.2, 0, 1.0, 0.95, body).box(2.4, 1.6, 5.2, 0, 2.1, 0.95, 0x6b6448);
          for (const zz of [-2.6, 0.2, 1.6]) for (const xx of [-1.05, 1.05]) b.cyl(0.5, 0.5, 0.4, 10, xx, 0.5, zz, dark, 0, 0, Math.PI / 2);
          C(0, 1.45, -2.6, 2.4, 2.3, 2.0); C(0, 1.75, 0.95, 2.4, 2.3, 5.2); info.h = 2.9; break;
        }
        case 'pickup': {
          const body = 0xd8d4c8;
          b.box(1.9, 0.75, 5.3, 0, 0.85, 0, body).box(1.8, 0.75, 2.0, 0, 1.45, -0.6, body).box(1.7, 0.5, 0.05, 0, 1.5, -1.61, 0x2c3236);
          for (const zz of [-1.7, 1.6]) for (const xx of [-0.9, 0.9]) b.cyl(0.38, 0.38, 0.3, 10, xx, 0.38, zz, 0x1d1d1b, 0, 0, Math.PI / 2);
          C(0, 0.85, 0, 1.9, 1.0, 5.3); C(0, 1.45, -0.6, 1.8, 0.75, 2.0); info.h = 1.8; break;
        }
        case 'tank':
          for (const [xx, zz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) b.box(0.1, 1.4, 0.1, xx, 0.7, zz, 0x4a4a48);
          b.cyl(1.0, 1.0, 1.8, 16, 0, 2.3, 0, 0x8a8f8c);
          C(0, 2.3, 0, 2, 1.8, 2); C(0, 0.7, 0, 1.5, 1.4, 1.5, 'soft'); info.h = 3.2; break;
        case 'mast':
          b.box(0.35, 12, 0.35, 0, 6, 0, 0x8b8f92).box(1.2, 0.08, 0.08, 0, 11.5, 0, 0x8b8f92).box(0.06, 1.5, 0.06, 0.5, 12.4, 0, 0x2a2a2a).box(0.06, 1.5, 0.06, -0.5, 12.4, 0, 0x2a2a2a);
          C(0, 6, 0, 0.35, 12, 0.35); info.h = 12; break;
        case 'generator':
          b.box(1.8, 0.25, 0.9, 0, 0.125, 0, 0x2e2e2c).box(0.6, 0.6, 0.6, -0.5, 0.55, 0, 0x5a6646).box(0.8, 0.5, 0.6, 0.35, 0.5, 0, 0x5a6646).box(0.1, 0.8, 0.5, 0.82, 0.65, 0, 0x2e2e2c).cyl(0.04, 0.04, 0.6, 6, -0.6, 1.05, 0.15, 0x222222);
          C(-0.5, 0.55, 0, 0.6, 0.6, 0.6, 'engine', info); C(0.35, 0.5, 0, 0.8, 0.5, 0.6); info.h = 1.1;
          info.running = true; info.engineLocal = new THREE.Vector3(-0.5, 0.55, 0);
          break;
        case 'tent':
          b.prism(4, 2.4, 5, 0, 0, 0, desert ? 0xbfae86 : 0x6b6c4f).box(1.0, 1.4, 0.03, 0, 0.7, -2.51, 0x1e1d18);
          C(0, 0.8, 0, 3.0, 1.6, 5, 'soft'); info.h = 2.4; break;
        case 'net': {
          const W = s.big ? 16 : 8, Dd = s.big ? 12 : 6;
          for (const [xx, zz] of [[-W / 2, -Dd / 2], [W / 2, -Dd / 2], [-W / 2, Dd / 2], [W / 2, Dd / 2]]) b.box(0.1, 2.6, 0.1, xx, 1.3, zz, 0x4a3f30);
          for (let k = 0; k < 14; k++) b.box(W * (0.3 + rnd() * 0.4), 0.05, Dd * (0.3 + rnd() * 0.4), (rnd() - 0.5) * W * 0.6, 2.55 - rnd() * 0.25, (rnd() - 0.5) * Dd * 0.6, rnd() > 0.5 ? 0x6a6a46 : 0x837a58, rnd() * 3);
          info.h = 2.6;
          if (s.big) { b.box(5, 1.2, 2.2, 1, 0.6, 0, 0x7a7d80).box(6, 0.15, 1, 1, 1.0, 0, 0x7a7d80); C(1, 0.6, 0, 5, 1.2, 2.2); }
          break;
        }
        case 'rocks':
          for (let k = 0; k < 6; k++) b.sphere(0.6 + rnd() * 1.2, (rnd() - 0.5) * 5, 0.3, (rnd() - 0.5) * 5, desert ? 0x9b7f5f : 0x6c6862, 1, 0.6, 1);
          C(0, 0.6, 0, 5, 1.2, 5); info.h = 1.5; break;
        case 'cave':
          b.box(11, 6, 3, 0, 3, 1.8, 0x6b655c).box(6, 3, 2.5, -3.5, 7, 2.6, 0x5f5a52).box(4, 2.5, 2, 3.8, 6.5, 2.4, 0x736c62);
          b.box(3.2, 2.6, 0.1, 0, 1.3, 0.27, 0x0b0a09);
          C(0, 3, 1.8, 11, 6, 3); info.h = 2.6; break;
        case 'flag': case 'rag': {
          const poleH = s.t === 'rag' ? 1.4 : (s.small ? 3 : 5);
          b.cyl(0.03, 0.04, poleH, 6, 0, poleH / 2, 0, s.t === 'rag' ? 0x5a4a36 : 0x7a7a78);
          if (s.t === 'rag') b.sphere(0.5, 0.2, 0.3, 0.1, desert ? 0x7e7a4e : 0x5e6a3e, 1.2, 0.6, 1.2);
          const fw = s.t === 'rag' ? 0.45 : (s.small ? 0.7 : 1.2), fh = s.t === 'rag' ? 0.12 : (s.small ? 0.45 : 0.8);
          const fg = new THREE.PlaneGeometry(fw, fh, 8, 4); fg.translate(fw / 2, 0, 0);
          const color = s.t === 'rag' ? 0xd9d2c0 : (mission.kind === 'training' ? 0xd12a1f : 0x1c1c1c);
          const fm = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
          const holder = new THREE.Group();
          holder.position.set(w.x, gy + poleH - fh / 2 - 0.02, w.z);
          holder.add(fm); scene.add(holder);
          flags.push({ holder, mesh: fm, base: fg.attributes.position.array.slice(), fw, fh, x: w.x, z: w.z, ph: rnd() * 10 });
          info.h = poleH;
          break;
        }
      }
      if (b.pos.length) {
        const mesh = new THREE.Mesh(b.geometry(), structMat);
        g.add(mesh);
      }
      scene.add(g);
      structures.push(info);
    }

    // ---- 植生（インスタンス） ----
    const veg = [];
    const lines = posWorld.map(p => ({ ax: p.x, az: p.z, bx: baseW.x, bz: baseW.z }));
    function nearLine(x, z, margin) {
      for (const l of lines) {
        const dx = l.bx - l.ax, dz = l.bz - l.az, L2 = dx * dx + dz * dz;
        const s = ((x - l.ax) * dx + (z - l.az) * dz) / L2;
        if (s < -0.02 || s > 1.05) continue;
        const px = l.ax + dx * s, pz = l.az + dz * s;
        if (Math.hypot(x - px, z - pz) < margin + s * 6) return true;
      }
      return false;
    }
    function scatter(geo, color, count, region, scaleFn, yOff, exclude) {
      const mat = new THREE.MeshLambertMaterial({ color });
      const im = new THREE.InstancedMesh(geo, mat, count);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
      let n = 0, tries = 0;
      while (n < count && tries < count * 6) {
        tries++;
        const [lu, lv] = region();
        const w = toWorld(lu, lv);
        if (exclude && nearLine(w.x, w.z, exclude)) continue;
        if (Math.hypot(lu - D, lv) < 30) continue;
        let tooClose = false; for (const pp of posWorld) if (Math.hypot(w.x - pp.x, w.z - pp.z) < 8) tooClose = true;
        if (tooClose) continue;
        const y = gridHeight(lu, lv);
        if (!desert && y + mission.wx.alt > (mission.wx.tempC < -2 ? 2950 : 3400) && color === 0x2f3b26) continue;
        const s = scaleFn();
        q.setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0));
        sc.set(s[0], s[1], s[2]); p.set(w.x, y + yOff * s[1], w.z);
        m.compose(p, q, sc); im.setMatrixAt(n++, m);
      }
      im.count = n; im.instanceMatrix.needsUpdate = true;
      scene.add(im); veg.push(im);
      return im;
    }
    const wide = () => [u0 + 200 + rnd() * (u1 - u0 - 400), (rnd() - 0.5) * 3600];
    const nearBase = () => [D + (rnd() - 0.5) * 500, (rnd() - 0.5) * 500];
    const nearShooter = () => [(rnd() - 0.6) * 300, (rnd() - 0.5) * 500];
    const bushGeo = new THREE.IcosahedronGeometry(1, 0);
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    if (desert) {
      scatter(bushGeo, 0x6f6a44, hi ? 1600 : 700, wide, () => { const s = 0.4 + rnd() * 0.8; return [s, s * 0.6, s]; }, 0.3, 6);
      scatter(bushGeo, 0x7d7650, hi ? 500 : 200, nearBase, () => { const s = 0.3 + rnd() * 0.5; return [s, s * 0.55, s]; }, 0.3, 6);
      scatter(rockGeo, 0x9a7d5c, hi ? 600 : 250, wide, () => { const s = 0.4 + rnd() * 1.6; return [s, s * 0.6, s * 1.2]; }, 0.2, 6);
    } else {
      const treeGeo = new THREE.ConeGeometry(1, 3.2, 6); treeGeo.translate(0, 1.6, 0);
      scatter(treeGeo, 0x2f3b26, hi ? 1400 : 600, wide, () => { const s = 1.4 + rnd() * 1.8; return [s, s * (0.9 + rnd() * 0.5), s]; }, 0, 10);
      scatter(bushGeo, 0x4c5534, hi ? 2200 : 900, wide, () => { const s = 0.5 + rnd() * 1.0; return [s, s * 0.6, s]; }, 0.3, 6);
      scatter(rockGeo, 0x76716a, hi ? 1400 : 500, wide, () => { const s = 0.5 + rnd() * 2.5; return [s, s * 0.7, s * 1.1]; }, 0.25, 6);
      scatter(bushGeo, 0x56603a, hi ? 400 : 150, nearBase, () => { const s = 0.3 + rnd() * 0.6; return [s, s * 0.6, s]; }, 0.3, 6);
    }
    scatter(rockGeo, desert ? 0xa08463 : 0x6e6a63, hi ? 260 : 120, nearShooter, () => { const s = 0.15 + rnd() * 0.6; return [s, s * 0.6, s]; }, 0.2, 3);

    // ---- 風に揺れる草（標的付近と射手付近） ----
    const windUniform = { value: new THREE.Vector2(0, 0) };
    const timeUniform = { value: 0 };
    {
      const gg = new THREE.ConeGeometry(0.06, 0.55, 3); gg.translate(0, 0.27, 0);
      const gm = new THREE.MeshLambertMaterial({ color: desert ? 0xa89a63 : 0x7a7c48 });
      gm.onBeforeCompile = (sh) => {
        sh.uniforms.uWind = windUniform; sh.uniforms.uTime = timeUniform;
        sh.vertexShader = 'uniform vec2 uWind; uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n float hgt = max(position.y, 0.0) / 0.55;\n vec2 ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);\n float flick = 0.65 + 0.35 * sin(uTime * 4.0 + ip.x * 0.7 + ip.y * 0.5);\n transformed.x += uWind.x * 0.05 * hgt * hgt * flick;\n transformed.z += uWind.y * 0.05 * hgt * hgt * flick;\n transformed.y -= length(uWind) * 0.004 * hgt;');
      };
      const count = hi ? 3500 : 1200;
      const im = new THREE.InstancedMesh(gg, gm, count);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
      let n = 0;
      for (let k = 0; k < count * 3 && n < count; k++) {
        const nearB = k % 6 !== 0;
        const lu = nearB ? D + (rnd() - 0.5) * 260 : -5 - rnd() * 120;
        const lv = nearB ? (rnd() - 0.5) * 260 : (rnd() - 0.5) * 360;
        if (nearB && Math.hypot(lu - D, lv) < 26) continue;
        const w = toWorld(lu, lv);
        if (!nearB && nearLine(w.x, w.z, 4)) continue;
        let close = false; for (const pp of posWorld) if (Math.hypot(w.x - pp.x, w.z - pp.z) < 5) close = true;
        if (close) continue;
        const s = 0.7 + rnd() * 0.9;
        q.setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0)); sc.set(s, s, s); p.set(w.x, gridHeight(lu, lv), w.z);
        m.compose(p, q, sc); im.setMatrixAt(n++, m);
      }
      im.count = n; im.frustumCulled = false;
      scene.add(im);
    }

    // ---- 砂ぼこり（砂漠のみ：風に流れる粒） ----
    let dust = null;
    if (desert) {
      const N = hi ? 700 : 300;
      const geo = new THREE.BufferGeometry();
      const arr = new Float32Array(N * 3), seedA = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const lu = D * (0.1 + rnd() * 1.0), lv = (rnd() - 0.5) * 400;
        const w = toWorld(lu, lv);
        arr[i * 3] = w.x; arr[i * 3 + 1] = gridHeight(lu, lv) + rnd() * 1.5; arr[i * 3 + 2] = w.z; seedA[i] = rnd();
      }
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const mat = new THREE.PointsMaterial({ color: 0xd8c4a0, size: 0.35, transparent: true, opacity: 0.35, depthWrite: false });
      dust = new THREE.Points(geo, mat); dust.frustumCulled = false;
      dust.userData = { seed: seedA, N };
      scene.add(dust);
    }

    // ---- 風の場 ----
    const wind = new Wind(mission.wx, seed, { x: 0, z: 0 }, baseW);

    function update(t, dt) {
      timeUniform.value = t;
      // 草は標的付近の風で揺らす
      const wb = wind.at(baseW, t);
      windUniform.value.set(wb[0], wb[2]);
      // 旗
      for (const f of flags) {
        const w = wind.at(f, t);
        const sp = Math.hypot(w[0], w[2]);
        if (sp > 0.05) f.holder.rotation.y = Math.atan2(-w[2], w[0]); // 旗の先が風下を向く
        // 垂れ下がり: 0 m/s で真下、約 8 m/s でほぼ水平
        const lift = Math.min(1, sp / 8.5);
        const droop = (1 - lift) * (Math.PI / 2) * 0.92;
        const pos = f.mesh.geometry.attributes.position, a = pos.array, base = f.base;
        for (let i = 0; i < a.length; i += 3) {
          const x = base[i], y = base[i + 1];
          const along = x / f.fw;
          const wave = Math.sin(t * (3 + sp * 0.9) - along * 7 + f.ph) * (0.06 + 0.08 * lift) * along * f.fw;
          // 垂れ: x 方向の長さを下へ回す
          const ca = Math.cos(droop), sa = Math.sin(droop);
          a[i] = x * ca; a[i + 1] = y - x * sa; a[i + 2] = wave;
        }
        pos.needsUpdate = true; f.mesh.geometry.computeVertexNormals();
      }
      // 鉄板の揺れ
      for (const p of plates) {
        p.swingV += (-p.swing * 18 - p.swingV * 1.2) * dt;
        p.swing += p.swingV * dt;
        p.group.rotation.x = p.swing;
      }
      // 砂ぼこり
      if (dust) {
        const a = dust.geometry.attributes.position.array, sd = dust.userData.seed;
        for (let i = 0; i < dust.userData.N; i++) {
          const p = [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
          const w = wind.at(p, t);
          a[i * 3] += w[0] * dt * (0.8 + sd[i] * 0.4); a[i * 3 + 2] += w[2] * dt * (0.8 + sd[i] * 0.4);
          const g = groundAt(a[i * 3], a[i * 3 + 2]);
          a[i * 3 + 1] = g + 0.2 + (Math.sin(t * 2 + sd[i] * 20) * 0.5 + 0.5) * 1.3 * sd[i];
          const l = toLocal(a[i * 3], a[i * 3 + 2]);
          if (Math.abs(l.v) > 220 || l.u < D * 0.05 || l.u > D * 1.15) {
            const nu2 = D * (0.1 + Math.random() * 1.0), nv2 = (Math.random() - 0.5) * 400;
            const nw = toWorld(nu2, nv2); a[i * 3] = nw.x; a[i * 3 + 2] = nw.z;
          }
        }
        dust.geometry.attributes.position.needsUpdate = true;
      }
    }

    return {
      scene, mission, groundAt, toWorld, toLocal, positions: posWorld, base: { x: baseW.x, y: baseY, z: baseW.z },
      structures, plates, flags, colliders, wind, update, sunDir, haze, D, seed, desert, terrain, sky, rnd
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
