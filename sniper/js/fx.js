// 着弾・流血・弾の軌跡などの効果
(function (root) {
  'use strict';
  const SN = root.SN = root.SN || {};

  function softTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); return t;
  }

  // 粒子（大きさ・透明度を粒ごとに持つ）
  class Particles {
    constructor(scene, max, tex, blending) {
      this.max = max; this.n = 0;
      const g = new THREE.BufferGeometry();
      this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.alpha = new Float32Array(max); this.size = new Float32Array(max);
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
      g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
      g.setAttribute('psize', new THREE.BufferAttribute(this.size, 1));
      this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
      this.grow = new Float32Array(max); this.a0 = new Float32Array(max); this.drag = new Float32Array(max); this.grav = new Float32Array(max);
      this.stick = new Uint8Array(max);
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 400 }, uTex: { value: tex } },
        vertexShader: 'attribute float alpha; attribute float psize; attribute vec3 color; varying float vA; varying vec3 vC; uniform float uScale; void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.5, psize * uScale / -mv.z); }',
        fragmentShader: 'uniform sampler2D uTex; varying float vA; varying vec3 vC; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); float a = t.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(vC, a); }',
        transparent: true, depthWrite: false, blending: blending || THREE.NormalBlending
      });
      this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
      scene.add(this.points);
      this.geo = g;
    }
    emit(p, v, color, size, life, alpha, opts) {
      let i;
      if (this.n < this.max) i = this.n++;
      else { i = Math.floor(Math.random() * this.max); }
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
      this.col[i * 3] = color.r; this.col[i * 3 + 1] = color.g; this.col[i * 3 + 2] = color.b;
      this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.alpha[i] = alpha; this.a0[i] = alpha;
      this.grow[i] = (opts && opts.grow) || 0; this.drag[i] = (opts && opts.drag) || 0.5; this.grav[i] = (opts && opts.grav !== undefined) ? opts.grav : 9.8;
      this.stick[i] = (opts && opts.stick) ? 1 : 0;
      return i;
    }
    update(dt, groundAt, onLand) {
      for (let i = 0; i < this.n; i++) {
        if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
        this.life[i] -= dt;
        const k = Math.max(0, this.life[i] / this.maxLife[i]);
        const dr = Math.exp(-this.drag[i] * dt);
        this.vel[i * 3] *= dr; this.vel[i * 3 + 2] *= dr; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
        this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        this.size[i] += this.grow[i] * dt;
        this.alpha[i] = this.a0[i] * Math.min(1, k * 2.5);
        if (this.grav[i] > 0) {
          const g = groundAt(this.pos[i * 3], this.pos[i * 3 + 2]);
          if (this.pos[i * 3 + 1] < g) {
            if (this.stick[i] && onLand) onLand(this.pos[i * 3], g, this.pos[i * 3 + 2]);
            this.pos[i * 3 + 1] = g + 0.01; this.vel[i * 3] = this.vel[i * 3 + 1] = this.vel[i * 3 + 2] = 0; this.grav[i] = 0;
            if (this.stick[i]) this.life[i] = Math.min(this.life[i], 0.2);
          }
        }
      }
      while (this.n > 0 && this.life[this.n - 1] <= 0) this.n--;
      this.geo.setDrawRange(0, this.n);
      for (const k of ['position', 'color', 'alpha', 'psize']) this.geo.attributes[k].needsUpdate = true;
    }
  }

  SN.FX = class FX {
    constructor(world, audio) {
      this.world = world; this.scene = world.scene; this.audio = audio;
      const tex = softTexture();
      this.drops = new Particles(this.scene, 2500, tex);
      this.puffs = new Particles(this.scene, 900, tex);
      this.decals = [];
      this.pools = [];
      this.loose = []; // 切り離された部位・落とした物
      this.smokers = [];
      this.v = new THREE.Vector3(); this.p = new THREE.Vector3();
      this.blood = new THREE.Color(0x6e0b0b); this.bloodLight = new THREE.Color(0x9e1a16); this.mist = new THREE.Color(0xb2453f);
      this.decalMat = new THREE.MeshLambertMaterial({ color: 0x4a0606, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, transparent: true, opacity: 0.92 });
      this.poolMat = new THREE.MeshLambertMaterial({ color: 0x3d0505, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      this.decalCount = 0;
    }

    setView(camera, height) {
      const s = (height / 2) / Math.tan(camera.fov * Math.PI / 360);
      this.drops.mat.uniforms.uScale.value = s; this.puffs.mat.uniforms.uScale.value = s;
    }

    groundColor(x, z) {
      const w = this.world;
      const y = w.groundAt(x, z);
      if (!w.desert && y + w.mission.wx.alt > (w.mission.wx.tempC < -2 ? 2900 : 3500)) return new THREE.Color(0xf4f6f8);
      return w.desert ? new THREE.Color(0xd2b88c) : new THREE.Color(0x9a8a6c);
    }

    // 地面への着弾
    impactGround(p, dir, energy) {
      const col = this.groundColor(p.x, p.z);
      const k = Math.min(2.2, 0.6 + energy / 4000);
      for (let i = 0; i < 14; i++) {
        this.v.set((Math.random() - 0.5) * 2, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2).multiplyScalar(k);
        this.v.addScaledVector(dir, 1.2 * k);
        this.puffs.emit(p, this.v, col, 0.35 * k + Math.random() * 0.4, 1.2 + Math.random() * 1.2, 0.75, { grow: 0.9 * k, drag: 2.2, grav: 1.5 });
      }
      for (let i = 0; i < 18; i++) {
        this.v.set((Math.random() - 0.5) * 3, 2 + Math.random() * 5, (Math.random() - 0.5) * 3).multiplyScalar(k);
        this.drops.emit(p, this.v, col, 0.06, 1.0, 0.9, { drag: 0.6 });
      }
    }
    impactHard(p, dir, color) {
      const c = new THREE.Color(color || 0xb8a888);
      for (let i = 0; i < 9; i++) {
        this.v.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2).addScaledVector(dir, -1.5);
        this.puffs.emit(p, this.v, c, 0.25 + Math.random() * 0.3, 0.9 + Math.random() * 0.6, 0.6, { grow: 0.6, drag: 2.5, grav: 0.8 });
      }
    }
    impactSteel(p, dir) {
      const c = new THREE.Color(0xfff1c8);
      for (let i = 0; i < 16; i++) {
        this.v.set((Math.random() - 0.5) * 7, Math.random() * 4, (Math.random() - 0.5) * 7).addScaledVector(dir, -2);
        this.drops.emit(p, this.v, c, 0.05, 0.25 + Math.random() * 0.25, 1, { drag: 0.5 });
      }
      this.puffs.emit(p, this.v.set(0, 0.3, 0), new THREE.Color(0x9a9a92), 0.4, 0.8, 0.5, { grow: 0.5, grav: 0 });
    }
    sparks(p, dir) {
      const c = new THREE.Color(0xffd27a);
      for (let i = 0; i < 24; i++) {
        this.v.set((Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9).addScaledVector(dir, -1);
        this.drops.emit(p, this.v, c, 0.05, 0.3 + Math.random() * 0.3, 1, { drag: 0.4 });
      }
    }
    smoke(p) { this.smokers.push({ p: p.clone(), t: 0 }); }

    // 弾の軌跡（衝撃波で空気が揺らいで見える）
    trace(p, speedMs, c) {
      if (speedMs < c * 0.98) return;
      this.puffs.emit(p, this.v.set(0, 0, 0), new THREE.Color(0xdcdcd4), 0.22, 0.12, 0.13, { grow: 0.6, grav: 0, drag: 0 });
    }

    // ---- 流血 ----
    bloodHit(p, dir, rifleId, part) {
      const big = rifleId === 'r50' ? 3 : (rifleId === 'r338' ? 1.6 : (rifleId === 'r300' ? 1.25 : 1));
      const head = part === 'head' || part === 'neck';
      // 射出側の霧（ピンクの霧）
      const mistN = Math.round((head ? 40 : 22) * big);
      for (let i = 0; i < mistN; i++) {
        this.v.copy(dir).multiplyScalar(2 + Math.random() * 6 * big);
        this.v.x += (Math.random() - 0.5) * 3 * big; this.v.y += (Math.random() - 0.2) * 2.5 * big; this.v.z += (Math.random() - 0.5) * 3 * big;
        this.puffs.emit(p, this.v, Math.random() < 0.5 ? this.mist : this.bloodLight, (head ? 0.24 : 0.18) * Math.sqrt(big) + Math.random() * 0.12, 0.6 + Math.random() * 0.7, 0.8, { grow: 0.9 * big, drag: 3.5, grav: 0.6 });
      }
      // 飛び散る血の滴
      const dropN = Math.round((head ? 140 : 80) * big);
      for (let i = 0; i < dropN; i++) {
        const back = Math.random() < 0.18;
        this.v.copy(dir).multiplyScalar((back ? -1.5 : 3) + Math.random() * (back ? 2 : 9) * Math.sqrt(big));
        this.v.x += (Math.random() - 0.5) * 3.5; this.v.y += Math.random() * 3; this.v.z += (Math.random() - 0.5) * 3.5;
        this.drops.emit(p, this.v, Math.random() < 0.5 ? this.blood : this.bloodLight, 0.05 + Math.random() * 0.06 * big, 2.5, 1, { drag: 0.9, stick: true });
      }
      // 飛沫が地面や後ろの壁に付く
      const nSpl = Math.round((head ? 9 : 6) * big);
      for (let i = 0; i < nSpl; i++) {
        const d = 0.6 + Math.random() * 3.2 * Math.sqrt(big);
        const x = p.x + dir.x * d + (Math.random() - 0.5) * 1.4, z = p.z + dir.z * d + (Math.random() - 0.5) * 1.4;
        setTimeout(() => this.decal(x, z, 0.08 + Math.random() * 0.22 * Math.sqrt(big), 0.9), 200 + Math.random() * 500);
      }
      this.wallSpatter(p, dir, big);
    }
    wallSpatter(p, dir, big) {
      // 後ろ 4m 以内の構造物の面に血痕
      for (const c of this.world.colliders) {
        if (c.center.distanceTo(p) > 7) continue;
        // 弾の延長線と箱
        const o = p.clone().applyMatrix4(c.inv), d = dir.clone().transformDirection(c.inv);
        let t0 = 0, t1 = 4, ok = true, nAxis = -1, nSign = 0;
        for (let a = 0; a < 3; a++) {
          const oa = o.getComponent(a), da = d.getComponent(a), h = c.half.getComponent(a);
          if (Math.abs(da) < 1e-6) { if (Math.abs(oa) > h) { ok = false; break; } continue; }
          let ta = (-h - oa) / da, tb = (h - oa) / da, s = -1;
          if (ta > tb) { const tt = ta; ta = tb; tb = tt; s = 1; }
          if (ta > t0) { t0 = ta; nAxis = a; nSign = s; }
          if (tb < t1) t1 = tb;
          if (t0 > t1) { ok = false; break; }
        }
        if (!ok || nAxis < 0) continue;
        const hitL = o.clone().addScaledVector(d, t0);
        const n = new THREE.Vector3(); n.setComponent(nAxis, nSign);
        const hw = hitL.clone().applyMatrix4(c.m);
        const nw = n.transformDirection(c.m);
        const r = (0.25 + Math.random() * 0.35) * Math.sqrt(big);
        const g = this.splatGeo(r, 12);
        const m = new THREE.Mesh(g, this.decalMat);
        m.position.copy(hw).addScaledVector(nw, 0.01);
        m.lookAt(hw.clone().add(nw));
        this.scene.add(m); this.decals.push(m);
        // 垂れ
        const drip = new THREE.Mesh(new THREE.PlaneGeometry(0.03 * Math.sqrt(big), 0.4), this.decalMat);
        drip.position.copy(hw).addScaledVector(nw, 0.012); drip.position.y -= 0.22; drip.lookAt(drip.position.clone().add(nw));
        this.scene.add(drip); this.decals.push(drip);
        return;
      }
    }
    splatGeo(r, seg) {
      const shape = new THREE.Shape();
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2, rr = r * (0.6 + Math.random() * 0.7);
        if (i === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      return new THREE.ShapeGeometry(shape);
    }
    decal(x, z, r, op) {
      if (this.decals.length > 400) { const d = this.decals.shift(); this.scene.remove(d); d.geometry.dispose(); }
      const y = this.world.groundAt(x, z);
      const m = new THREE.Mesh(this.splatGeo(r, 9), this.decalMat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.03, z);
      // 地面の傾きに合わせる
      const nx = this.world.groundAt(x + 0.5, z) - this.world.groundAt(x - 0.5, z), nz = this.world.groundAt(x, z + 0.5) - this.world.groundAt(x, z - 0.5);
      m.rotation.set(-Math.PI / 2 + Math.atan(nz), 0, -Math.atan(nx), 'XYZ');
      this.scene.add(m); this.decals.push(m);
    }
    landed(x, y, z) { if (Math.random() < 0.08) this.decal(x, z, 0.03 + Math.random() * 0.05, 1); }

    // 倒れた体の下に広がる血だまり
    pool(actor, maxR, time) {
      const g = this.splatGeo(1, 18);
      const m = new THREE.Mesh(g, this.poolMat);
      m.rotation.x = -Math.PI / 2;
      m.scale.set(0.01, 0.01, 0.01);
      this.scene.add(m);
      this.pools.push({ m, actor, maxR, time, t: 0 });
    }
    trail(actor) {
      const p = actor.root.position;
      this.decal(p.x + (Math.random() - 0.5) * 0.3, p.z + (Math.random() - 0.5) * 0.3, 0.12 + Math.random() * 0.1, 0.9);
    }
    // 服に広がる血のしみ
    woundStain(actor, hit) {
      const part = hit.mesh;
      if (!part) return;
      const s = part.userData.size;
      const lp = hit.localPoint.clone();
      // 表面に貼る
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshLambertMaterial({ color: 0x4a0707 }));
      st.position.set(THREE.MathUtils.clamp(lp.x, -s[0] / 2, s[0] / 2), THREE.MathUtils.clamp(lp.y, -s[1] / 2, s[1] / 2), THREE.MathUtils.clamp(lp.z, -s[2] / 2, s[2] / 2));
      part.add(st);
      this.loose.push({ stain: st, t: 0, max: hit.part === 'head' ? 2.6 : 3.4 });
      // 射出口側
      const ex = st.clone(); ex.position.z = -st.position.z; ex.position.x = -st.position.x * 0.5; part.add(ex);
      this.loose.push({ stain: ex, t: 0, max: 4.2 });
    }
    // 12.7mm弾で部位が切断される
    sever(actor, hit) {
      const part = hit.mesh; if (!part) return;
      const joint = part.parent; // 肩・股関節などの関節グループ
      if (!joint || joint === actor.root) return;
      if (hit.part === 'head' || hit.part === 'neck') return;
      this.scene.attach(joint);
      const v = hit.dir.clone().multiplyScalar(4 + Math.random() * 3); v.y += 2 + Math.random() * 2;
      this.loose.push({ obj: joint, v, av: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), rest: false });
      // 切断面から噴き出す
      const wp = new THREE.Vector3(); joint.getWorldPosition(wp);
      this.spurt(actor, wp, 2.5);
    }
    spurt(actor, at, dur) { this.loose.push({ spurt: true, actor, at: at.clone(), t: 0, dur }); }
    headDestroy(actor, hit) {
      const head = actor.joints.head; if (!head) return;
      const wp = new THREE.Vector3(); head.getWorldPosition(wp);
      head.visible = false;
      const skin = new THREE.Color(actor.skin);
      for (let i = 0; i < 40; i++) {
        this.v.copy(hit.dir).multiplyScalar(3 + Math.random() * 9); this.v.x += (Math.random() - 0.5) * 4; this.v.y += Math.random() * 4; this.v.z += (Math.random() - 0.5) * 4;
        this.drops.emit(wp, this.v, i % 3 ? this.blood : skin, 0.05 + Math.random() * 0.06, 2.5, 1, { drag: 0.5, stick: true });
      }
      this.spurt(actor, wp, 3);
    }
    dropItem(actor, mesh) {
      this.scene.attach(mesh);
      this.loose.push({ obj: mesh, v: new THREE.Vector3((Math.random() - 0.5), 0.5, (Math.random() - 0.5)), av: new THREE.Vector3(Math.random() * 3, 0, Math.random() * 3), rest: false });
    }

    update(dt, t) {
      const ga = this.world.groundAt;
      this.drops.update(dt, ga, (x, y, z) => this.landed(x, y, z));
      this.puffs.update(dt, ga, null);
      for (const p of this.pools) {
        if (p.t > p.time) continue;
        p.t += dt;
        const pos = p.actor.root.position;
        const k = Math.min(1, p.t / p.time);
        const r = p.maxR * Math.sqrt(k);
        p.m.position.set(pos.x, this.world.groundAt(pos.x, pos.z) + 0.035, pos.z);
        p.m.scale.set(Math.max(0.01, r), Math.max(0.01, r * 1.2), 1);
        p.m.rotation.z = p.actor.heading;
      }
      for (const l of this.loose) {
        if (l.stain) { l.t += dt; const s = Math.min(l.max, 1 + l.t * 0.6); l.stain.scale.set(s, s, 0.3); continue; }
        if (l.spurt) {
          l.t += dt; if (l.t > l.dur) continue;
          const pulse = Math.max(0, Math.sin(l.t * 8)) * (1 - l.t / l.dur);
          if (pulse > 0.2) for (let i = 0; i < 2; i++) {
            this.v.set((Math.random() - 0.5) * 1.5, 1 + Math.random() * 2 * pulse, (Math.random() - 0.5) * 1.5);
            this.drops.emit(l.at, this.v, this.blood, 0.04, 1.5, 1, { drag: 0.5, stick: true });
          }
          continue;
        }
        if (l.rest) continue;
        l.v.y -= 9.8 * dt;
        l.obj.position.addScaledVector(l.v, dt);
        l.obj.rotation.x += l.av.x * dt; l.obj.rotation.y += l.av.y * dt; l.obj.rotation.z += l.av.z * dt;
        const g = ga(l.obj.position.x, l.obj.position.z);
        if (l.obj.position.y < g + 0.06) {
          l.obj.position.y = g + 0.06;
          if (Math.abs(l.v.y) < 1.2) { l.rest = true; l.obj.rotation.x = Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1); }
          l.v.multiplyScalar(0.3); l.v.y = Math.abs(l.v.y) * 0.3; l.av.multiplyScalar(0.4);
        }
      }
      for (const s of this.smokers) {
        s.t += dt;
        if (Math.random() < dt * 14) {
          const w = this.world.wind.at(s.p, t);
          this.v.set(w[0] * 0.6, 1.2 + Math.random(), w[2] * 0.6);
          this.puffs.emit(s.p, this.v, new THREE.Color(0x2a2a2a), 0.5, 4, 0.55, { grow: 0.9, drag: 0.4, grav: -0.1 });
        }
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
