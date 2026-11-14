// ゲーム本体：描画・入力・射撃・弾道・警戒・観測手
(function (root) {
  'use strict';
  const SN = root.SN;
  const B = SN.Ballistics;
  const DEG = Math.PI / 180;
  const $ = (id) => document.getElementById(id);
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const fmt1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

  // ---- 保存（端末内のみ） ----
  const store = {
    get(k, d) { try { const v = localStorage.getItem('sn_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('sn_' + k, JSON.stringify(v)); } catch (e) { /* 保存できない環境 */ } }
  };
  SN.store = store;
  SN.settings = Object.assign({ quality: 'high', gyro: false, gyroSens: 0.3, dragSens: 0.7, volume: 0.8, illum: true, hints: true, difficulty: 'assist', guide: true }, store.get('settings', {}));
  SN.progress = Object.assign({ cleared: {}, best: {}, unlocked: ['r308'] }, store.get('progress', {}));
  SN.saveSettings = () => store.set('settings', SN.settings);
  SN.saveProgress = () => store.set('progress', SN.progress);

  // ---- 描画の共通部分（一度だけ作る） ----
  let R = null;
  function initRenderer() {
    if (R) return R;
    const canvas = $('view');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const postScene = new THREE.Scene();
    const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const postMat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uScope: { value: 1 }, uRadius: { value: 300 },
        uTime: { value: 0 }, uMirage: { value: 0 }, uFlow: { value: new THREE.Vector2() }, uDpr: { value: 1 }, uTint: { value: 0 }
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uScope; uniform float uRadius; uniform float uTime; uniform float uMirage; uniform vec2 uFlow; uniform float uDpr; uniform float uTint;',
        'varying vec2 vUv;',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
        'float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x), mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x), u.y); }',
        'void main(){',
        '  vec2 px = vUv * uRes; vec2 d = px - uRes*0.5; float r = length(d);',
        '  vec2 uv = vUv;',
        '  if (uMirage > 0.001) {',
        '    vec2 q = vec2(px.x / (30.0*uDpr), px.y / (5.5*uDpr));',
        '    q.x -= uFlow.x * uTime; q.y -= uFlow.y * uTime;',
        '    float n1 = noise(q) - 0.5; float n2 = noise(q*vec2(1.7,2.1) + 13.0) - 0.5;',
        '    uv += vec2(n1*0.7, n2) * uMirage * uDpr / uRes;',
        '  }',
        '  vec3 col = texture2D(tDiffuse, uv).rgb;',
        '  col = mix(col*12.92, 1.055*pow(col, vec3(1.0/2.4)) - 0.055, step(0.0031308, col));',
        '  if (uScope > 0.5) {',
        '    float edge = smoothstep(uRadius, uRadius - 2.5*uDpr, r);',
        '    col *= 1.0 - smoothstep(uRadius*0.6, uRadius, r) * 0.38;',
        '    col *= edge;',
        '  }',
        '  col = mix(col, col*vec3(1.05,0.98,0.9), uTint);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n'),
      depthTest: false, depthWrite: false
    });
    postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
    R = { renderer, canvas, postScene, postCam, postMat, rt: null, w: 0, h: 0, dpr: 1 };
    return R;
  }

  function resize() {
    const r = initRenderer();
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, SN.settings.quality === 'low' ? 1 : 1.75);
    if (w === r.w && h === r.h && dpr === r.dpr && r.rt) return r;
    r.w = w; r.h = h; r.dpr = dpr;
    r.renderer.setPixelRatio(dpr); r.renderer.setSize(w, h, false);
    if (r.rt) r.rt.dispose();
    r.rt = new THREE.WebGLRenderTarget(Math.floor(w * dpr), Math.floor(h * dpr), { samples: SN.settings.quality === 'low' ? 0 : 4 });
    r.rt.texture.colorSpace = THREE.SRGBColorSpace;
    r.postMat.uniforms.tDiffuse.value = r.rt.texture;
    r.postMat.uniforms.uRes.value.set(w * dpr, h * dpr);
    r.postMat.uniforms.uDpr.value = dpr;
    const rc = $('reticle'); rc.width = Math.floor(w * dpr); rc.height = Math.floor(h * dpr);
    if (SN.game) SN.game.reticleDirty = true;
    return r;
  }
  window.addEventListener('resize', () => { if (SN.game) resize(); });

  // ---- 1回の任務 ----
  class Game {
    constructor(mission, posIdx, rifleId) {
      this.m = mission;
      this.rifle = SN.rifleById(rifleId);
      this.audio = SN.audio;
      const r = resize();
      this.R = r;
      this.world = SN.buildWorld(mission, SN.settings.quality);
      this.fx = new SN.FX(this.world, this.audio);
      this.camera = new THREE.PerspectiveCamera(50, r.w / r.h, 0.3, 80000);
      this.posIdx = posIdx;
      this.pos = this.world.positions[posIdx];
      // 実際の気象（予報から少しずれる）
      const wx = mission.wx;
      this.tempC = wx.tempC + (Math.random() - 0.5) * 3;
      this.pressurePa = B.stdPressurePa(wx.alt) + (Math.random() - 0.5) * 600;
      this.atm = B.atmosphere(this.tempC, this.pressurePa, wx.hum);
      this.mvNow = this.rifle.mv + this.rifle.mvTempCoef * (this.tempC - 15);
      this.zeroA = B.zeroAngle({ atm: B.stdAtmosphere(0), mv: this.rifle.mv, bc: this.rifle.bc, sightH: this.rifle.sightH }, this.rifle.zeroRange);
      this.sg = B.millerSg(this.rifle.load, this.mvNow, this.atm);
      this.omega = B.earthOmega(mission.lat);
      this.bcSI = B.bcToSI(this.rifle.bc);
      this.massKg = this.rifle.load.massGr * 6.479891e-5;
      // 状態
      this.gt = 0; this.paused = false; this.ended = false;
      this.mode = 'rifle'; this.mag = { rifle: 12, spot: 30, eye: 1 };
      this.elev = 0; this.wclk = 0; // 0.1 MIL クリック
      this.breath = { holding: false, held: 0, phase: Math.random() * 6, recover: 0, gasp: 0, amp: 1 };
      this.hr = 72; this.beatT = 0; this.beatPulse = 0;
      this.sway = { x: 0, y: 0 }; this.recoil = { x: 0, y: 0, vx: 0, vy: 0 };
      this.boltT = 0; this.chambered = true; this.reloadT = 0;
      this.magCap = this.rifle.mag; this.inMag = Math.min(this.magCap, mission.maxShots); this.reserve = mission.maxShots - this.inMag;
      this.squeeze = -1; this.breakAt = 0;
      this.bullets = []; this.shots = []; this.shotCount = 0; this.coldBore = true;
      this.alertLv = 0; this.detect = 0; this.posShots = 0; this.discoveredT = -1; this.incomingT = 0;
      this.identified = {}; this.check = { pos: true, look: false, pid: false, rng: false, solve: false, dial: false, aim: false, shot: false, spot: false, exfil: false, range: false, wx: false, wind: false };
      this.lase = null; this.solution = null; this.pendingCorr = null; this.calcIn = null;
      this.rangeCard = {}; this.spotLog = []; this.events = [];
      this.dragVel = 0; this.lastDragT = 0;
      this.reticleDirty = true;
      this.fail = null;
      this.relocations = 0;
      this.kills = { civ: 0 };
      this.dustVeil = 0;
      // 人物
      this.actors = mission.actors.map(def => new SN.Actor(def, this.world, this.actorCtx()));
      // 初期の照準：基地の方向
      this.aimAt(this.world.base.x, this.world.base.y + 1.2, this.world.base.z);
      this.applyHud();
      this.say(SN.settings.difficulty === 'manual'
        ? (mission.kind === 'training' ? '準備はいいか。まず観測スコープで鉄板の大きさを測ろう。距離が分かったらDOPEだ。' : '位置についた。焦るな。まずはレンジカードと気象からだ。')
        : '位置についた。左上に今やることが出る。まずは観測スコープで標的を探そう。', 7);
      this.lastFrame = performance.now();
      this.raf = 0;
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
    }

    actorCtx() {
      const g = this;
      return {
        get fx() { return g.fx; },
        findCover: (a) => g.findCover(a),
        onDown: (a) => {
          g.fx.pool(a, 0.5 + Math.random() * 0.5, 18 + Math.random() * 20);
          // 近くの者は気づく
          for (const o of g.actors) if (o !== a && o.alive) {
            const d = o.root.position.distanceTo(a.root.position);
            if (d < 45) o.alert(0.4 + Math.random() * 0.8, g.gt);
          }
        },
        onDead: (a) => { g.checkObjective(); },
        onGone: (a) => {
          if (g.m.objective.ids.includes(a.id) && !a.neutralized()) {
            g.say('くそっ、標的が車に乗った。…逃げられた。', 6);
            g.endMission(false, '標的を取り逃がした');
          }
        }
      };
    }

    aimAt(x, y, z) {
      const e = this.eye();
      const dx = x - e.x, dy = y - e.y, dz = z - e.z;
      this.yaw = Math.atan2(dx, -dz);
      this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    }
    eye() { return new THREE.Vector3(this.pos.x, this.pos.eye, this.pos.z); }

    // ---- 照準方向（揺れ・反動を含む） ----
    viewAngles() {
      let sx = 0, sy = 0;
      if (this.mode === 'rifle') { sx = this.sway.x + this.recoil.x; sy = this.sway.y + this.recoil.y; }
      else if (this.mode === 'spot') { sx = this.sway.sx || 0; sy = this.sway.sy || 0; }
      const pitch = this.pitch + sy * 0.001;
      const yaw = this.yaw + sx * 0.001 / Math.max(0.2, Math.cos(this.pitch));
      return { yaw, pitch };
    }
    dirFrom(yaw, pitch) { return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); }

    fovMil() {
      if (this.mode === 'rifle') return 375 / this.mag.rifle;
      if (this.mode === 'spot') return 420 / this.mag.spot;
      return 0;
    }
    circleDiam() { return Math.min(this.R.w, this.R.h) * 0.94; }
    ppm() { return this.circleDiam() / this.fovMil(); } // 1 MIL あたりの CSS px

    updateCamera() {
      const cam = this.camera, r = this.R;
      cam.aspect = r.w / r.h;
      if (this.mode === 'eye') { cam.fov = 62; cam.near = 0.3; }
      else {
        const halfH = (r.h / 2) / this.ppm() * 0.001; // rad
        cam.fov = 2 * Math.atan(halfH) / DEG; cam.near = 12;
      }
      cam.far = 80000;
      cam.updateProjectionMatrix();
      const { yaw, pitch } = this.viewAngles();
      const e = this.eye();
      cam.position.copy(e);
      cam.up.set(0, 1, 0);
      cam.lookAt(e.clone().add(this.dirFrom(yaw, pitch)));
      this.world.sky.position.copy(e);
    }

    // ---- メインループ ----
    loop(now) {
      if (this.ended && this.endShown) return;
      this.raf = requestAnimationFrame(this.loop);
      let dt = (now - this.lastFrame) / 1000; this.lastFrame = now;
      if (dt > 0.1) dt = 0.1;
      if (!this.paused) this.step(dt);
      this.render();
    }

    step(dt) {
      this.gt += dt;
      const t = this.gt;
      this.world.update(t, dt);
      for (const a of this.actors) a.update(dt, t);
      this.updateBody(dt);
      this.updateBullets(dt);
      this.fx.update(dt, t);
      this.updateAlert(dt);
      this.updateSpotter(dt);
      this.audio.setWind(Math.hypot(...this.world.wind.at(this.pos, t).filter((_, i) => i !== 1)));
      // 発見されたあとの反撃
      if (this.alertLv >= 3 && !this.ended) {
        this.incomingT -= dt;
        if (this.incomingT < 0 && t - this.discoveredT > 3) {
          this.incomingT = 1.2 + Math.random() * 2;
          this.audio.crack(); this.audio.distantShot(this.world.D / 343 * 0.3);
          this.flash(0.5);
          this.recoil.vx += (Math.random() - 0.5) * 6; this.recoil.vy += (Math.random() - 0.5) * 6;
          if (Math.random() < 0.3) this.say('撃たれてる！ 頭を下げろ、移動するぞ！', 3);
        }
        if (t - this.discoveredT > 22) { this.say('被弾した…！', 4); this.endMission(false, '位置を特定され、反撃で被弾した'); }
      }
      this.applyHudLive();
    }

    // ---- 呼吸・心拍・揺れ ----
    updateBody(dt) {
      const br = this.breath, rf = this.rifle;
      const steady = rf.sway * (1 - (this.pos.cover || 0) * 0.15);
      // 心拍
      this.hr += (72 - this.hr) * dt * 0.025;
      if (br.holding) this.hr += dt * 1.2;
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT = 60 / this.hr; this.beatPulse = 1;
        if ((br.holding && br.held > 4) || this.hr > 105) this.audio.heart(Math.min(1, (br.held - 3) / 6 + (this.hr - 90) / 60));
      }
      this.beatPulse *= Math.exp(-dt * 9);
      // 呼吸
      if (br.recover > 0) br.recover -= dt;
      if (br.holding) {
        br.held += dt;
        if (br.held > 13) { this.releaseBreath(true); }
      } else {
        br.held = Math.max(0, br.held - dt * 2);
        br.phase += dt * 2 * Math.PI / (br.gasp > 0 ? 2.2 : 4.4);
      }
      if (br.gasp > 0) br.gasp -= dt;
      // 揺れの大きさ（MIL）
      let ampY, ampX, trem;
      if (br.holding) {
        br.amp += (0 - br.amp) * dt * 4;
        trem = 0.025 + (br.held < 7 ? 0.004 * br.held : 0.028 + 0.06 * (br.held - 7));
      } else {
        br.amp += (1 - br.amp) * dt * 2;
        trem = 0.04;
      }
      const hrK = this.hr / 72;
      ampY = (0.5 * br.amp + (br.gasp > 0 ? 0.8 : 0)) * steady;
      ampX = 0.12 * br.amp * steady;
      const n = SN.noise.vnoise;
      const tt = this.gt;
      const tremK = trem * steady * hrK * (1 + Math.min(1, this.gt / 600) * 0.3);
      this.sway.x = Math.sin(br.phase * 2) * ampX + (n(tt * 1.3, 1.7, 5) * 1.0 + n(tt * 7, 3.1, 6) * 0.45) * tremK * 2.2;
      this.sway.y = -Math.cos(br.phase) * ampY + (n(tt * 1.1, 8.3, 7) + n(tt * 6.5, 2.2, 8) * 0.45) * tremK * 2.2 + this.beatPulse * 0.05 * hrK * steady;
      // 観測スコープ（三脚）: 風でわずかに揺れる
      const w = this.world.wind.at(this.pos, tt);
      const ws = Math.hypot(w[0], w[2]);
      this.sway.sx = n(tt * 5, 1, 9) * 0.008 * ws; this.sway.sy = n(tt * 5, 4, 9) * 0.008 * ws;
      // 反動（ばねで戻る）
      const rc = this.recoil;
      rc.vx += (-rc.x * 60 - rc.vx * 11) * dt; rc.vy += (-rc.y * 60 - rc.vy * 11) * dt;
      rc.x += rc.vx * dt; rc.y += rc.vy * dt;
      // ボルト操作・弾倉交換
      if (this.boltT > 0) {
        this.boltT -= dt;
        rc.x += (Math.random() - 0.5) * 0.4; rc.y += (Math.random() - 0.5) * 0.4;
        if (this.boltT <= 0) {
          this.boltT = 0;
          if (this.inMag > 0) this.chambered = true;
          // 構え直しでずれる
          this.yaw += gauss() * 0.0006; this.pitch += gauss() * 0.0005;
        }
      }
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) {
          const n2 = Math.min(this.magCap, this.reserve); this.inMag = n2; this.reserve -= n2;
          this.chambered = this.inMag > 0;
          this.yaw += gauss() * 0.0015; this.pitch += gauss() * 0.001;
        }
      }
      // 引き金
      if (this.squeeze >= 0) {
        this.squeeze += dt;
        const k = clamp(this.squeeze / this.breakAt, 0, 1);
        $('squeeze').style.height = (k * 100) + '%';
        if (this.squeeze >= this.breakAt) { this.squeeze = -1; $('squeeze').style.height = '0'; this.fire(); }
      }
      this.dragVel *= Math.exp(-dt * 10);
      // 自分の砂ぼこり
      if (this.dustVeil > 0) { this.dustVeil = Math.max(0, this.dustVeil - dt * 1.1); }
      $('dust-veil').style.opacity = this.mode === 'eye' ? 0 : Math.min(0.85, this.dustVeil);
      // ジャイロ
      if (this.gyro) this.applyGyro(dt);
    }

    holdBreath(on) {
      const br = this.breath;
      if (on) {
        if (br.recover > 0) { this.hint('息が整っていない'); return; }
        if (!br.holding) { br.holding = true; br.held = 0; this.audio.breathIn(); }
      } else this.releaseBreath(false);
      $('btn-breath').classList.toggle('on', br.holding);
    }
    releaseBreath(forced) {
      const br = this.breath;
      if (!br.holding) return;
      br.holding = false; this.audio.breathOut();
      if (forced || br.held > 9) { br.gasp = 2.5; br.recover = 3; this.hr += 8; if (forced) this.hint('息が続かない'); }
      br.phase = Math.PI; // 吐いたところから
      $('btn-breath').classList.remove('on');
    }

    // ---- 射撃 ----
    pullTrigger(on) {
      if (!on) { if (this.squeeze >= 0) { this.squeeze = -1; $('squeeze').style.height = '0'; } return; }
      if (this.ended || this.paused) return;
      if (this.mode !== 'rifle') { this.hint('撃つには照準スコープに切り替える'); return; }
      if (this.boltT > 0 || this.reloadT > 0) return;
      if (!this.chambered) { this.hint(this.inMag > 0 ? 'ボルトを操作して次弾を装填' : (this.reserve > 0 ? 'ボルトで弾倉を交換' : '弾がない')); $('btn-bolt').classList.add('need'); return; }
      this.squeeze = 0; this.breakAt = 0.32 + Math.random() * 0.4; // 「いつ落ちるか分からない」引き方
    }

    fire() {
      if (!this.chambered) return;
      this.chambered = false; this.inMag--; this.shotCount++;
      const { yaw, pitch } = this.viewAngles();
      // 引き金を引く間に指が動いていたらガク引き
      const jerk = clamp(this.dragVel, 0, 3);
      const los = this.dirFrom(yaw + gauss() * jerk * 0.0002, pitch + gauss() * jerk * 0.0002 - jerk * 0.0001);
      const up0 = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(los, up0).normalize();
      const upv = new THREE.Vector3().crossVectors(right, los).normalize();
      const rf = this.rifle;
      let eMil = this.elev * 0.1 + gauss() * rf.disp, wMil = this.wclk * 0.1 + gauss() * rf.disp;
      if (this.coldBore) { eMil += rf.coldBore[0]; wMil += rf.coldBore[1]; this.coldBore = false; }
      const eRad = this.zeroA + eMil * 0.001, wRad = wMil * 0.001;
      const bore = los.clone().addScaledVector(upv, Math.tan(eRad)).addScaledVector(right, Math.tan(wRad)).normalize();
      const e = this.eye();
      const muzzle = e.clone().addScaledVector(upv, -rf.sightH);
      const mv = this.mvNow + gauss() * rf.mvSd;
      const t0 = this.gt;
      const world = this.world;
      const hr = new THREE.Vector3(right.x, 0, right.z).normalize();
      const intended = this.pickIntended(e, los);
      const b = {
        p: [muzzle.x, muzzle.y, muzzle.z], v: [bore.x * mv, bore.y * mv, bore.z * mv], t: 0, t0,
        right: hr, prev: muzzle.clone(), disp: muzzle.clone(), trail: [[0, muzzle.x, muzzle.y, muzzle.z]], trailT: 0,
        env: { rho: this.atm.rho, c: this.atm.c, bcSI: this.bcSI, windAt: (p, tt) => world.wind.at(p, t0 + tt), omega: this.omega },
        idx: this.shotCount, crackDone: {}, done: false
      };
      this.bullets.push(b);
      const rec = {
        n: this.shotCount, t: t0, pos: this.pos.name, posIdx: this.posIdx, elev: this.elev * 0.1, wind: this.wclk * 0.1, mv,
        held: this.breath.holding, heldFor: this.breath.held, hr: this.hr, jerk, intended: intended ? intended.label : null, intendedRef: intended,
        result: null, trail: b.trail, losYaw: yaw, losPitch: pitch,
        incl: pitch / DEG, windAtShot: this.windSummary(t0)
      };
      if (intended) {
        const r0 = intended.ref;
        if (r0.root) rec.intendedPos = this.actorCenter(r0);
        else if (r0.mesh) { rec.intendedPos = new THREE.Vector3(); r0.mesh.getWorldPosition(rec.intendedPos); }
        else if (r0.engineLocal) rec.intendedPos = r0.engineLocal.clone().applyMatrix4(r0.group.matrixWorld);
      }
      b.rec = rec; this.shots.push(rec);
      this.check.shot = true;
      // 反動
      const rk = rf.recoil * (0.8 + Math.random() * 0.4);
      this.recoil.vy += rk * 28; this.recoil.vx += (Math.random() - 0.5) * rk * 10;
      this.pitch += (0.1 + Math.random() * 0.25) * rk * 0.0001; this.yaw += gauss() * rk * 0.00006;
      this.audio.shot(rf.loud);
      this.hr += 5;
      if (this.breath.holding) this.releaseBreath(false);
      // 自分の砂ぼこり（見えなくなる）
      this.dustVeil = Math.max(this.dustVeil, (this.pos.dust || 0) * (0.5 + rf.loud * 0.25));
      if (this.dustVeil > 0.5) setTimeout(() => this.hint('発射の砂ぼこりで視界がふさがった'), 150);
      // 発射音が届いた者は警戒する
      if (!this.m.noAlert) {
        for (const a of this.actors) {
          const d = a.root.position.distanceTo(e);
          a.alert(d / 343 + 0.8 + Math.random() * 1.2, t0);
        }
        this.addNoise();
      }
      this.applyHud();
    }

    // 狙っていた相手（照準線に一番近いもの）
    pickIntended(e, los) {
      let best = null, bd = 3.5;
      const consider = (label, p, ref) => {
        const d = p.clone().sub(e); const dist = d.length(); d.normalize();
        const ang = Math.acos(clamp(d.dot(los), -1, 1)) * 1000;
        if (ang < bd) { bd = ang; best = { label, ref, dist }; }
      };
      for (const a of this.actors) if (a.vis && !a.gone) consider(this.describeActorShort(a), this.actorCenter(a), a);
      for (const p of this.world.plates) { const w = new THREE.Vector3(); p.mesh.getWorldPosition(w); consider(p.label, w, p); }
      for (const s of this.world.structures) if (s.s.t === 'generator') { const w = s.engineLocal.clone().applyMatrix4(s.group.matrixWorld); consider('発電機', w, s); }
      return best;
    }
    actorCenter(a) {
      const th = a.parts.find(p => p.userData.part === 'thorax');
      const w = new THREE.Vector3(); (th || a.root).getWorldPosition(w); return w;
    }

    windSummary(t) {
      const w = this.world.wind;
      const out = [];
      for (const f of [0.15, 0.5, 0.85]) {
        const p = { x: this.pos.x + (this.world.base.x - this.pos.x) * f, z: this.pos.z + (this.world.base.z - this.pos.z) * f };
        const v = w.at(p, t);
        const c = this.crossHead(v);
        out.push({ f, cross: c.cross, head: c.head, speed: Math.hypot(v[0], v[2]) });
      }
      return out;
    }
    crossHead(v) {
      const dx = this.world.base.x - this.pos.x, dz = this.world.base.z - this.pos.z, L = Math.hypot(dx, dz);
      const ux = dx / L, uz = dz / L; // 射線方向
      return { cross: v[0] * (-uz) + v[2] * ux, head: -(v[0] * ux + v[2] * uz) };
    }

    // ---- 弾の飛行と当たり判定 ----
    updateBullets(dt) {
      const sub = 0.001;
      for (const b of this.bullets) {
        if (b.done) continue;
        let remain = dt;
        while (remain > 1e-6 && !b.done) {
          const h = Math.min(sub, remain); remain -= h;
          B.step(b, h, b.env);
          const sd = B.spinDrift(this.sg, b.t);
          const cur = new THREE.Vector3(b.p[0] + b.right.x * sd, b.p[1], b.p[2] + b.right.z * sd);
          const hit = this.collide(b, b.prev, cur);
          if (hit) { this.onImpact(b, hit); b.done = true; break; }
          // 近くを通った者は衝撃波（クラック）を聞く
          if (!this.m.noAlert && ((b.t * 1000) | 0) % 10 === 0) {
            for (const a of this.actors) {
              if (b.crackDone[a.id] || !a.vis) continue;
              if (a.root.position.distanceTo(cur) < 15) { b.crackDone[a.id] = true; a.alert(0.25 + Math.random() * 0.4, this.gt); }
            }
          }
          b.prev.copy(cur);
          b.trailT += h;
          if (b.trailT >= 0.01) { b.trailT = 0; b.trail.push([b.t, cur.x, cur.y, cur.z]); }
          if (b.t > 9) { b.done = true; b.rec.result = { kind: 'lost', text: '着弾を確認できなかった' }; this.spotterCall(b, null); }
        }
        if (!b.done) {
          const sp = Math.hypot(b.v[0], b.v[1], b.v[2]);
          this.fx.trace(b.prev, sp, this.atm.c);
        }
      }
      this.bullets = this.bullets.filter(b => !b.done);
    }

    collide(b, a, c) {
      const seg = c.clone().sub(a); const L = seg.length(); if (L < 1e-9) return null;
      let best = null;
      // 地面
      const gy = this.world.groundAt(c.x, c.z);
      if (c.y < gy) {
        let lo = 0, hi = 1;
        for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; const p = a.clone().addScaledVector(seg, m); if (p.y < this.world.groundAt(p.x, p.z)) hi = m; else lo = m; }
        best = { s: hi, kind: 'ground', point: a.clone().addScaledVector(seg, hi) };
      }
      // 構造物
      const mid = a.clone().addScaledVector(seg, 0.5);
      for (const col of this.world.colliders) {
        if (col.center.distanceTo(mid) > col.r + L) continue;
        const s = segBox(a, c, col.inv, col.half);
        if (s !== null && (!best || s < best.s)) best = { s, kind: col.tag, col, point: a.clone().addScaledVector(seg, s) };
      }
      // 人物
      const tmp = new THREE.Vector3();
      for (const ac of this.actors) {
        if (!ac.vis || ac.gone) continue;
        const r = ac.bounds(tmp);
        if (distPointSeg(tmp, a, c) > r) continue;
        ac.root.updateMatrixWorld(true);
        for (const part of ac.parts) {
          if (!part.visible || !part.parent || !isVisible(part)) continue;
          const sz = part.userData.size;
          const inv = new THREE.Matrix4().copy(part.matrixWorld).invert();
          const s = segBox(a, c, inv, new THREE.Vector3(sz[0] / 2, sz[1] / 2, sz[2] / 2));
          if (s !== null && (!best || s < best.s)) best = { s, kind: 'actor', actor: ac, part, point: a.clone().addScaledVector(seg, s) };
        }
      }
      if (best) best.dir = seg.normalize();
      return best;
    }

    onImpact(b, hit) {
      const p = hit.point, dir = hit.dir;
      const v = Math.hypot(b.v[0], b.v[1], b.v[2]);
      const energy = 0.5 * this.massKg * v * v;
      const e = this.eye();
      const dist = p.distanceTo(e);
      const back = dist / 343;
      const rec = b.rec;
      rec.tof = b.t; rec.vImpact = v; rec.energy = energy; rec.range = dist; rec.point = p.clone();
      rec.mach = v / this.atm.c;
      let res = { kind: hit.kind, text: '' };
      switch (hit.kind) {
        case 'actor': {
          const a = hit.actor, part = hit.part.userData.part;
          const local = p.clone().applyMatrix4(new THREE.Matrix4().copy(hit.part.matrixWorld).invert());
          const wasAlive = a.alive && !a.down;
          this.fx.bloodHit(p, dir, this.rifle.id, part);
          if ((part === 'head' || part === 'neck') && this.rifle.id === 'r50') this.fx.headDestroy(a, { dir });
          const r = a.takeHit({ part, localPoint: local, dir: dir.clone(), mesh: hit.part, rifleId: this.rifle.id }, this.gt);
          this.audio.hitBody(back);
          res = { kind: 'actor', actor: a.id, role: a.role, part, partName: (SN.PART_INFO[part] || {}).name, text: r.outcome, lethal: r.lethal, who: this.describeActorShort(a) };
          if (a.role === 'civ' && !this.m.noAlert) {
            this.kills.civ++;
            setTimeout(() => { this.say('…民間人だ。撃つべきじゃなかった。', 5); this.endMission(false, '交戦規定違反（民間人を撃った）'); }, 1500);
          }
          for (const o of this.actors) if (o !== a && o.alive) { const d = o.root.position.distanceTo(p); if (d < 30) o.alert(0.3 + Math.random() * 0.6, this.gt); }
          if (!wasAlive) res.text = '倒れている相手に命中。' + r.outcome;
          break;
        }
        case 'plate': {
          const pl = hit.col.data;
          pl.hits++; pl.swingV += (0.6 + energy / 4000) * (dir.dot(new THREE.Vector3(0, 0, 1)) >= 0 ? 1 : -1) * 3;
          this.fx.impactSteel(p, dir);
          this.audio.hitSteel(back);
          const c = new THREE.Vector3(); pl.mesh.getWorldPosition(c);
          const loc = p.clone().applyMatrix4(new THREE.Matrix4().copy(pl.mesh.matrixWorld).invert());
          // 鉄板に鉛の跡
          const mark = new THREE.Mesh(new THREE.CircleGeometry(0.025, 8), new THREE.MeshBasicMaterial({ color: 0x555555 }));
          mark.position.set(loc.x, loc.y, -0.014); mark.rotation.y = Math.PI; pl.mesh.add(mark);
          res = { kind: 'plate', id: pl.id, text: pl.label + 'に命中（中心から' + (loc.x >= 0 ? '左' : '右') + Math.abs(loc.x * 100).toFixed(0) + 'cm・' + (loc.y >= 0 ? '上' : '下') + Math.abs(loc.y * 100).toFixed(0) + 'cm）' };
          this.checkObjective();
          break;
        }
        case 'engine': {
          const info = hit.col.data;
          this.fx.sparks(p, dir);
          if (this.rifle.id === 'r50' && info.running) {
            info.running = false; info.destroyed = true; this.fx.smoke(p);
            this.audio.hitMetal(back);
            res = { kind: 'engine', text: '発電機のエンジンブロックを貫通。発電機は停止した。' };
            for (const a of this.actors) if (a.def.beh.responder && a.state === 'normal') { a.def.beh = { type: 'patrol', path: [[a.localPos()[0], a.localPos()[1]], [-5, -6]], speed: 1.3, pause: 999 }; a.wayIdx = 0; }
            this.checkObjective();
          } else {
            this.audio.hitMetal(back);
            res = { kind: 'engine', text: info.destroyed ? '止まった発電機に命中。' : '発電機に命中したが、エンジンは止まらない（口径が足りない）。' };
          }
          break;
        }
        case 'ground':
          this.fx.impactGround(p, dir, energy); this.audio.hitDirt(back);
          res = { kind: 'ground', text: '地面に着弾' };
          break;
        default:
          this.fx.impactHard(p, dir, 0xb8a37e); this.audio.hitDirt(back);
          res = { kind: 'struct', text: '構造物に着弾' };
      }
      // 着弾の近くの者
      if (!this.m.noAlert) for (const o of this.actors) if (o.alive && o.state === 'normal') { const d = o.root.position.distanceTo(p); if (d < 20) o.alert(0.3 + Math.random() * 0.5, this.gt); }
      rec.result = res;
      this.spotterCall(b, hit);
    }

    // ---- 警戒と発見 ----
    addNoise() {
      const rf = this.rifle, pos = this.pos;
      const dist = Math.hypot(this.world.base.x - pos.x, this.world.base.z - pos.z);
      const k = 20 * rf.loud * clamp(1150 / dist, 0.45, 1.8) * (1 + (pos.dust || 0) * 0.6) * (1 - (pos.cover || 0) * 0.45) * (1 + 0.5 * this.posShots) * (this.alertLv >= 1 ? 1.25 : 1);
      this.detect = Math.min(110, this.detect + k);
      this.posShots++;
      if (this.alertLv < 1) this.alertLv = 1;
    }
    updateAlert(dt) {
      if (this.m.noAlert) return;
      const anyAlert = this.actors.some(a => a.state === 'alerted' || a.down);
      if (anyAlert && this.alertLv < 1) this.alertLv = 1;
      if (this.detect >= 45 && this.alertLv < 2) { this.alertLv = 2; this.say('連中、こっちの方角を探してる。撃つたびに見つかりやすくなるぞ。', 5); }
      if (this.alertLv >= 2 && this.alertLv < 3) {
        const dist = Math.hypot(this.world.base.x - this.pos.x, this.world.base.z - this.pos.z);
        this.detect += dt * 0.7 * clamp(1150 / dist, 0.5, 1.6) * (1 - (this.pos.cover || 0) * 0.5);
      } else if (this.alertLv < 2) this.detect = Math.max(0, this.detect - dt * 0.3);
      if (this.detect >= 100 && this.alertLv < 3) {
        this.alertLv = 3; this.discoveredT = this.gt; this.incomingT = 3;
        this.say('見つかった！ 位置を変えるか離脱しないと撃たれる！', 6);
      }
    }

    findCover(a) {
      const e = this.eye();
      const ap = a.root.position;
      let best = null, bd = 40;
      for (const s of this.world.structures) {
        const h = s.h || 0;
        if (h < 1.1 || ['flag', 'rag', 'stake', 'mast', 'plate', 'net'].includes(s.s.t)) continue;
        // 射手から見て構造物の向こう側
        const away = new THREE.Vector3(s.x - e.x, 0, s.z - e.z).normalize();
        const depth = s.s.t === 'house' ? 3.5 : (s.s.t === 'truck' ? 2.2 : (s.s.t === 'tent' ? 2.6 : 1.4));
        const px = s.x + away.x * (depth + 0.6), pz = s.z + away.z * (depth + 0.6);
        const d = Math.hypot(px - ap.x, pz - ap.z);
        if (d < bd) { bd = d; const l = this.world.toLocal(px, pz); best = { pt: [l.u - this.world.D, l.v], face: Math.atan2(-away.x, -away.z), low: h < 2 }; }
      }
      return best;
    }

    checkObjective() {
      const o = this.m.objective;
      if (this.ended) return;
      let done = false;
      if (o.type === 'plates') done = o.ids.every(id => (this.world.plates.find(p => p.id === id) || {}).hits > 0);
      else if (o.type === 'eliminate') done = o.ids.every(id => { const a = this.actors.find(x => x.id === id); return a && a.neutralized(); });
      else if (o.type === 'materiel') done = o.ids.every(id => { const s = this.world.structures.find(x => x.id === id); return s && s.destroyed; });
      if (done && !this.objDone) {
        this.objDone = true; this.objT = this.gt;
        setTimeout(() => {
          if (this.ended) return;
          this.say(o.type === 'plates' ? '全部当たった。いい射撃だ。「任務」から離脱しよう。' : '目標達成を確認。「任務」から離脱するぞ。', 7);
          this.hint('「任務」→「離脱する」で任務を終える');
        }, 2200);
      }
      this.applyHud();
    }

    // ---- 観測手 ----
    say(text, dur) {
      this.spotLog.push({ t: this.gt, text });
      const el = $('spotter-line');
      el.innerHTML = '<b>観測手</b>' + escapeHtml(text);
      el.classList.add('show');
      this.audio.radio();
      clearTimeout(this._sayT);
      this._sayT = setTimeout(() => el.classList.remove('show'), (dur || 5) * 1000);
    }
    hint(text) {
      if (!SN.settings.hints && !/弾|ボルト|息/.test(text)) return;
      const el = $('hud-hint'); el.textContent = text; el.classList.add('show');
      clearTimeout(this._hintT); this._hintT = setTimeout(() => el.classList.remove('show'), 2600);
    }
    updateSpotter(dt) { }

    spotterCall(b, hit) {
      const rec = b.rec;
      setTimeout(() => {
        if (this.ended) return;
        this.check.spot = true;
        const res = rec.result;
        if (!res || res.kind === 'lost' || !hit) { this.say('着弾が見えなかった。かなり外れてる。', 4); return; }
        this.pendingCorr = null; $('btn-corr').hidden = true;
        if ((res.kind === 'plate' || res.kind === 'actor' || res.kind === 'engine') && !this.objDone) {
          this.check.rng = false; this.check.solve = false; this.check.dial = false; this.check.aim = false;
          this.holdNote = 0;
        }
        if (res.kind === 'plate') { this.say('命中！ ' + res.text.replace(/（.*/, '') + '。鉄板が揺れてる。' + (this.objDone ? '' : '次の鉄板だ。また測距からやり直そう。'), 6); return; }
        if (res.kind === 'actor') {
          const a = this.actors.find(x => x.id === res.actor);
          const what = a.role === 'civ' ? '民間人' : res.who;
          const st = !a.alive ? '倒れた。動かない。' : (a.down ? '倒れたが、まだ動いてる。' : '当たったが倒れてない。遮蔽物へ逃げた。');
          this.say('命中、' + what + '。' + res.partName + 'だ。' + st + (this.objDone || this.m.objective.ids.length < 2 ? '' : ' 次の標的を測り直せ。'), 7);
          return;
        }
        if (res.kind === 'engine') { this.say(res.text, 5); return; }
        // 外れ：狙っていたものに対する着弾位置
        const ref = rec.intendedRef;
        const e = this.eye();
        let tgt = null;
        if (ref) {
          if (ref.ref && ref.ref.root) tgt = this.actorCenter(ref.ref);
          else if (ref.ref && ref.ref.mesh) { tgt = new THREE.Vector3(); ref.ref.mesh.getWorldPosition(tgt); }
          else if (ref.ref && ref.ref.engineLocal) tgt = ref.ref.engineLocal.clone().applyMatrix4(ref.ref.group.matrixWorld);
        }
        if (!tgt) { this.say('外れ。着弾は見えたが、何を狙ってたか分からない。', 4); return; }
        // 弾の軌跡（トレース）が標的の距離を通った点で読む。標的より奥に落ちた土煙だけで読むと下に見えてしまうため。
        let pt = rec.point;
        const td = tgt.distanceTo(e);
        if (rec.point.distanceTo(e) > td + 1 && rec.trail && rec.trail.length > 1) {
          for (let i = 1; i < rec.trail.length; i++) {
            const q0 = new THREE.Vector3(rec.trail[i - 1][1], rec.trail[i - 1][2], rec.trail[i - 1][3]);
            const q1 = new THREE.Vector3(rec.trail[i][1], rec.trail[i][2], rec.trail[i][3]);
            const d0 = q0.distanceTo(e), d1 = q1.distanceTo(e);
            if (d0 <= td && d1 >= td) { pt = q0.lerp(q1, (td - d0) / Math.max(1e-6, d1 - d0)); break; }
          }
        }
        const a1 = angles(e, pt), a0 = angles(e, tgt);
        let dx = (a1.yaw - a0.yaw); while (dx > Math.PI) dx -= 2 * Math.PI; while (dx < -Math.PI) dx += 2 * Math.PI;
        dx = dx * Math.cos(a0.pitch) * 1000 + gauss() * 0.04;
        const dy = (a1.pitch - a0.pitch) * 1000 + gauss() * 0.04;
        rec.missMil = { dx, dy };
        if (Math.abs(dx) > 12 || Math.abs(dy) > 12) { this.say('外れ。着弾は大きく外れてる。距離と風を見直せ。', 5); return; }
        const lr = dx >= 0 ? '右' : '左', ud = dy >= 0 ? '上' : '下';
        const cLR = dx >= 0 ? '左' : '右', cUD = dy >= 0 ? '下' : '上';
        this.pendingCorr = { e: -dy, w: -dx, t: this.gt };
        const bc = $('btn-corr');
        bc.textContent = '修正を反映（' + cUD + fmt1(Math.abs(dy)) + '・' + cLR + fmt1(Math.abs(dx)) + '）';
        bc.hidden = false;
        this.say('外れ。着弾は' + ref.label + 'の' + lr + fmt1(Math.abs(dx)) + '・' + ud + fmt1(Math.abs(dy)) + 'MIL。修正、' + cUD + fmt1(Math.abs(dy)) + '、' + cLR + fmt1(Math.abs(dx)) + '。', 8);
      }, 350 + Math.random() * 300);
    }

    askWind(silentEst) {
      this.check.wind = true;
      const ws = this.windSummary(this.gt);
      const est = silentEst !== undefined ? silentEst : this.spotterWindEstimate();
      const dist = Math.hypot(this.world.base.x - this.pos.x, this.world.base.z - this.pos.z) * (1 + gauss() * 0.03);
      const table = this.dopeAt(this.atm, [Math.round(dist / 50) * 50]);
      const w1 = table.rows[0] ? table.rows[0].wind1 : 0.5;
      const hold = Math.abs(est) * w1;
      const from = est >= 0 ? '左' : '右', toward = est >= 0 ? '左' : '右';
      const gusty = Math.abs(ws[0].cross - ws[2].cross) > 1.5 || this.m.wx.gust > 1.5;
      if (Math.abs(est) < 0.4) this.say('横風はほぼない。陽炎はまっすぐ立ちのぼってる。' + (gusty ? 'ただ、向こうで風が回ってる。' : ''), 6);
      else this.say('風は' + from + 'から、横風にして約' + fmt1(Math.abs(est)) + 'm/s。この距離なら' + toward + 'へ' + fmt1(hold) + 'MIL。' + (gusty ? '突風に注意。' : ''), 8);
    }

    // ---- レーザー測距 ----
    laser() {
      if (this.ended) return;
      if (this.mode === 'eye') { this.hint('測距は観測スコープか照準スコープで行う'); return; }
      const { yaw, pitch } = this.viewAngles();
      const e = this.eye(), dir = this.dirFrom(yaw, pitch);
      let tHit = null, prev = 1;
      for (let t = 4; t <= 3600; t += 3) {
        const p = e.clone().addScaledVector(dir, t);
        if (p.y < this.world.groundAt(p.x, p.z)) {
          let lo = prev, hi = t;
          for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; const q = e.clone().addScaledVector(dir, m); if (q.y < this.world.groundAt(q.x, q.z)) hi = m; else lo = m; }
          tHit = hi; break;
        }
        prev = t;
      }
      const L = tHit || 3600;
      const hit = this.collide(null, e, e.clone().addScaledVector(dir, L));
      this.audio.click(); setTimeout(() => this.audio.click(), 90);
      const el = $('hud-lrf');
      if (!hit && !tHit) { this.lase = null; el.textContent = '測距 −−− m（測定できない）'; el.hidden = false; this.hint('空や遠すぎる所は測れない'); return; }
      const dist = (hit ? hit.s * L : L) + gauss() * 0.5;
      let az = (yaw / DEG) % 360; if (az < 0) az += 360;
      this.lase = { dist, incl: pitch / DEG, az, t: this.gt, kind: hit ? hit.kind : 'ground' };
      this.check.rng = true;
      el.textContent = '測距 ' + Math.round(dist) + 'm ∠' + (pitch >= 0 ? '+' : '−') + Math.abs(pitch / DEG).toFixed(1) + '° 方位' + String(Math.round(az) % 360).padStart(3, '0') + '°';
      el.hidden = false;
      clearTimeout(this._lrfT); this._lrfT = setTimeout(() => { el.hidden = true; }, 15000);
      this.applyHud();
    }

    // ---- 弾道計算（照準点 tgt に当てるダイヤル値を求める） ----
    // opt: {windAt(p,t) | null, cor, spin, t0}
    simAim(eye, tgt, eMil, wMil, opt) {
      const d = tgt.clone().sub(eye), dist = d.length();
      const yaw = Math.atan2(d.x, -d.z), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      const los = this.dirFrom(yaw, pitch);
      const right = new THREE.Vector3().crossVectors(los, new THREE.Vector3(0, 1, 0)).normalize();
      const upv = new THREE.Vector3().crossVectors(right, los).normalize();
      const bore = los.clone().addScaledVector(upv, Math.tan(this.zeroA + eMil * 0.001)).addScaledVector(right, Math.tan(wMil * 0.001)).normalize();
      const mz = eye.clone().addScaledVector(upv, -this.rifle.sightH);
      const b = { p: [mz.x, mz.y, mz.z], v: [bore.x * this.mvNow, bore.y * this.mvNow, bore.z * this.mvNow], t: 0 };
      const t0 = opt.t0 || 0;
      const env = { rho: this.atm.rho, c: this.atm.c, bcSI: this.bcSI, windAt: opt.windAt ? (p, tt) => opt.windAt(p, t0 + tt) : null, omega: opt.cor ? this.omega : null };
      while (b.t < 12) {
        B.step(b, 0.001, env);
        const along = (b.p[0] - eye.x) * los.x + (b.p[1] - eye.y) * los.y + (b.p[2] - eye.z) * los.z;
        if (along >= dist) break;
      }
      const sd = opt.spin ? B.spinDrift(this.sg, b.t) : 0;
      const hr = new THREE.Vector3(right.x, 0, right.z).normalize();
      const p = new THREE.Vector3(b.p[0] + hr.x * sd, b.p[1], b.p[2] + hr.z * sd).sub(eye);
      return { x: p.dot(right) / dist * 1000, y: p.dot(upv) / dist * 1000, tof: b.t, v: Math.hypot(b.v[0], b.v[1], b.v[2]) };
    }
    solveAim(eye, tgt, opt) {
      let e = 0, w = 0, r = null;
      for (let k = 0; k < 7; k++) { r = this.simAim(eye, tgt, e, w, opt); e -= r.y; w -= r.x; if (Math.abs(r.x) + Math.abs(r.y) < 0.004) break; }
      return { e, w, tof: r.tof, v: r.v };
    }
    // 弾道計算機：距離・傾斜・方位・風（速さと時計の向き）・標的の動きから修正量を出す
    solveFiring(inp) {
      const e = this.eye();
      const los = this.dirFrom(inp.az * DEG, inp.incl * DEG);
      const tgt = e.clone().addScaledVector(los, inp.range);
      const to = (inp.az + inp.clock * 30) * DEG + Math.PI;
      const wv = [Math.sin(to) * inp.ws, 0, -Math.cos(to) * inp.ws];
      const windAt = inp.ws > 0 ? () => wv : null;
      const full = this.solveAim(e, tgt, { windAt, cor: true, spin: true });
      const noWind = this.solveAim(e, tgt, { windAt: null, cor: true, spin: true });
      const noSpin = this.solveAim(e, tgt, { windAt: null, cor: true, spin: false });
      const bare = this.solveAim(e, tgt, { windAt: null, cor: false, spin: false });
      const lead = inp.move ? inp.move * full.tof / inp.range * 1000 : 0;
      const res = {
        elev: full.e, windage: full.w, wind: full.w - noWind.w, spin: noWind.w - noSpin.w, corH: noSpin.w - bare.w, corV: noSpin.e - bare.e,
        lead, tof: full.tof, v: full.v, mach: full.v / this.atm.c, inp: Object.assign({}, inp)
      };
      this.solution = res; this.check.solve = true;
      return res;
    }
    applySolution(withLead) {
      const s = this.solution; if (!s) return;
      const e = Math.round(s.elev * 10), w = Math.round((s.windage + (withLead ? s.lead : 0)) * 10);
      this.elev = clamp(e, 0, this.rifle.maxElev * 10); this.wclk = clamp(w, -80, 80);
      this.check.dial = true; this.check.wind = true;
      this.audio.click(); setTimeout(() => this.audio.click(), 60); setTimeout(() => this.audio.click(), 120);
      const over = e - this.elev;
      this.holdNote = over > 0 ? over / 10 : 0;
      if (this.holdNote > 0) this.say('エレベーションが足りない。残り' + fmt1(this.holdNote) + 'MILは、レティクルの中心より' + fmt1(this.holdNote) + 'MIL下の目盛りを標的に合わせて撃て。', 9);
      this.applyHud();
    }
    applyCorrection() {
      const c = this.pendingCorr; if (!c) return;
      this.elev = clamp(this.elev + Math.round(c.e * 10), 0, this.rifle.maxElev * 10);
      this.wclk = clamp(this.wclk + Math.round(c.w * 10), -80, 80);
      this.pendingCorr = null; this.audio.click(); setTimeout(() => this.audio.click(), 70);
      $('btn-corr').hidden = true;
      this.applyHud();
    }
    spotterWindEstimate() {
      const ws = this.windSummary(this.gt);
      const eff = ws[0].cross * 0.45 + ws[1].cross * 0.35 + ws[2].cross * 0.2;
      return eff * (1 + gauss() * 0.15) + gauss() * 0.4;
    }

    // ---- 手順ガイド ----
    guideStep() {
      const c = this.check, manual = SN.settings.difficulty === 'manual', train = this.m.kind === 'training';
      if (this.ended) return null;
      if (this.alertLv >= 3) return { n: '!', title: '見つかった', text: '右上の「任務」を開き、別の射撃位置へ移動するか離脱する。', el: ['tool-task'] };
      if (this.objDone) return { n: '✓', title: '目標達成', text: '右上の「任務」を開いて「離脱する」を押す。', el: ['tool-task'] };
      if (this.bullets.length) return { n: '…', title: '着弾を待つ', text: '弾が飛んでいる。着弾と観測手の報告を待つ。', el: [] };
      if (this.shots.length && !this.chambered && (this.inMag > 0 || this.reserve > 0)) {
        if (this.boltT > 0 || this.reloadT > 0) return { n: '…', title: '装填中', text: '構えが少しずれるので、終わったら狙い直す。', el: [] };
        return { n: '→', title: '次の弾を込める', text: '右下の「ボルト」を押す。', el: ['btn-bolt'] };
      }
      if (this.pendingCorr) return { n: '→', title: '修正を入れる', text: '観測手の修正を「修正を反映」で入れる（右のダイヤルで自分で回してもいい）。そのあと同じように狙って撃つ。', el: ['btn-corr'] };
      const steps = [];
      steps.push({ k: 'look', title: '標的を探す', text: '左の「観測」に切り替え、ドラッグで拠点を見回す。2本指か＋で拡大。', el: ['mode-spot'] });
      if (this.m.objective.type === 'eliminate') steps.push({ k: 'pid', title: '標的を識別する', text: '観測スコープで人物をタップし、特徴が標的と一致したら「標的と識別」を押す。', el: [] });
      if (manual) {
        steps.push({ k: 'rng', title: '距離を測る', text: (train ? '鉄板' : '標的') + 'の高さが何MILか目盛りで測り、右上の「レンジカード」に入力する。', el: ['tool-range'] });
        steps.push({ k: 'solve', title: 'DOPEを読む', text: '右上の「DOPE」で、距離と気象計の密度高度の列から上の修正量を読む。風は「横風1m/s」×横風の速さ。', el: ['tool-dope'] });
        steps.push({ k: 'dial', title: 'ダイヤルを回す', text: '右のエレベーション（上下）とウィンデージ（左右）を、読んだ値に合わせる。', el: ['tur-elev', 'tur-wind'] });
      } else {
        steps.push({ k: 'rng', title: '距離を測る', text: (train ? '鉄板' : '標的') + 'に十字の中心を合わせ、左の「測距」を押す。', el: ['btn-lrf'] });
        steps.push({ k: 'solve', title: '照準を計算する', text: '右上の「弾道計算」を開く。測った距離は自動で入る。風を入れ、標的が歩いていれば動きも選ぶ。', el: ['tool-calc'] });
        steps.push({ k: 'dial', title: 'ダイヤルを合わせる', text: '弾道計算の「ダイヤルに反映」を押す（右のダイヤルを手で回してもいい）。', el: ['tool-calc'] });
      }
      steps.push({ k: 'aim', title: '照準スコープで狙う', text: '左の「照準」に切り替え、十字の中心を' + (train ? '鉄板の中心' : '標的の胸') + 'に合わせる。' + (this.holdNote ? '（' + fmt1(this.holdNote) + 'MIL下の目盛りで狙う）' : ''), el: ['mode-rifle'] });
      steps.push({ k: 'shot', title: '撃つ', text: '「息止め」を押したまま、「引き金」を長押し。ゆっくり絞ると弾が出る。', el: ['btn-breath', 'btn-trigger'] });
      const i = steps.findIndex(st => !c[st.k]);
      const st = steps[i < 0 ? steps.length - 1 : i];
      return { n: (i < 0 ? steps.length : i + 1) + '/' + steps.length, title: st.title, text: st.text, el: st.el };
    }
    updateGuide() {
      const box = $('guide');
      if (this.check.dial && this.mode === 'rifle') this.check.aim = true;
      if (!SN.settings.guide) { box.hidden = true; this.setPulse([]); return; }
      const g = this.guideStep();
      if (!g) { box.hidden = true; this.setPulse([]); return; }
      box.hidden = false;
      $('g-n').textContent = g.n; $('g-title').textContent = g.title; $('g-text').textContent = g.text;
      this.setPulse(g.el);
    }
    setPulse(ids) {
      const key = ids.join(',');
      if (key === this._pulseKey) return;
      this._pulseKey = key;
      for (const el of document.querySelectorAll('.pulse')) el.classList.remove('pulse');
      for (const id of ids) { const el = $(id); if (el) el.classList.add('pulse'); }
    }

    dopeAt(atm, ranges) {
      return B.dopeTable(this.rifle, atm, ranges);
    }

    // ---- 識別（観測スコープでタップ） ----
    tapIdentify(cx, cy) {
      if (this.mode === 'eye') return;
      const cam = this.camera;
      let best = null, bd = 44;
      for (const a of this.actors) {
        if (!a.vis || a.gone) continue;
        const c = this.actorCenter(a).project(cam);
        if (c.z > 1) continue;
        const sx = (c.x + 1) / 2 * this.R.w, sy = (1 - c.y) / 2 * this.R.h;
        const d = Math.hypot(sx - cx, sy - cy);
        if (d < bd) { bd = d; best = a; }
      }
      if (best) SN.UI.idCard(this, best); else $('idcard').hidden = true;
    }
    describeActorShort(a) {
      const L = a.look;
      const head = { turban: 'ターバン', helmet: 'ヘルメット', cap: '帽子', scarf: 'スカーフ', none: '無帽' }[L.head] || '';
      return colorName(L.headColor || L.top) + (L.head === 'none' ? '無帽' : 'の' + head) + 'の男';
    }

    // ---- 入力 ----
    setMode(m) {
      if (this.squeeze >= 0) this.pullTrigger(false);
      this.mode = m;
      for (const b of document.querySelectorAll('#mode-seg button')) b.classList.toggle('on', b.dataset.mode === m);
      if (m === 'spot') { $('idcard').hidden = true; this.check.look = true; }
      if (m === 'rifle' && this.check.dial) this.check.aim = true;
      this.reticleDirty = true; this.applyHud();
    }
    zoom(dir) {
      if (this.mode === 'rifle') this.mag.rifle = clamp(this.mag.rifle + dir * (this.mag.rifle >= 10 ? 2.5 : 1), this.rifle.scope.min, this.rifle.scope.max);
      else if (this.mode === 'spot') this.mag.spot = clamp(this.mag.spot + dir * 5, 20, 60);
      this.reticleDirty = true; this.applyHud();
    }
    pinch(scale) {
      if (this.mode === 'rifle') this.mag.rifle = clamp(this.mag.rifle * scale, this.rifle.scope.min, this.rifle.scope.max);
      else if (this.mode === 'spot') this.mag.spot = clamp(this.mag.spot * scale, 20, 60);
      this.reticleDirty = true; this.applyHud();
    }
    drag(dxPx, dyPx) {
      const sens = SN.settings.dragSens;
      if (this.mode === 'eye') { this.yaw += dxPx * 0.0022 * sens * 1.6; this.pitch -= dyPx * 0.0022 * sens * 1.6; }
      else {
        const ppm = this.ppm();
        this.yaw += dxPx / ppm * 0.001 * sens / Math.max(0.2, Math.cos(this.pitch));
        this.pitch -= dyPx / ppm * 0.001 * sens;
        if (this.squeeze >= 0) this.dragVel += Math.hypot(dxPx, dyPx) / ppm;
      }
      this.pitch = clamp(this.pitch, -1.2, 1.2);
    }
    turret(which, d) {
      if (which === 'e') this.elev = clamp(this.elev + d, 0, this.rifle.maxElev * 10);
      else this.wclk = clamp(this.wclk + d, -80, 80);
      if (which === 'e' && this.elev !== 0) { this.check.dial = true; this.holdNote = 0; }
      if (which === 'w' && this.wclk !== 0) this.check.wind = true;
      this.audio.click();
      if (navigator.vibrate) { try { navigator.vibrate(4); } catch (e) { /* */ } }
      this.applyHud();
    }
    bolt() {
      if (this.boltT > 0 || this.reloadT > 0 || this.ended) return;
      $('btn-bolt').classList.remove('need');
      if (this.chambered) { this.hint('もう装填されている'); return; }
      if (this.inMag > 0) { this.boltT = 1.0; this.audio.bolt(); }
      else if (this.reserve > 0) { this.reloadT = 3.2; this.audio.bolt(); this.hint('弾倉を交換中'); }
      else this.hint('弾がない');
      this.applyHud();
    }

    // ジャイロ（端末の回転速度で照準を微調整）
    enableGyro(on) {
      this.gyro = on; this._gyroRate = null;
      if (this._gyroHandler) window.removeEventListener('devicemotion', this._gyroHandler);
      if (!on) return;
      this._gyroHandler = (ev) => { if (ev.rotationRate) this._gyroRate = ev.rotationRate; };
      window.addEventListener('devicemotion', this._gyroHandler);
    }
    applyGyro(dt) {
      const r = this._gyroRate; if (!r) return;
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      const a = r.beta || 0, g = r.gamma || 0;
      let yawRate, pitchRate;
      if (ang === 90) { yawRate = -a; pitchRate = -g; }
      else if (ang === -90 || ang === 270) { yawRate = a; pitchRate = g; }
      else { yawRate = -g; pitchRate = a; }
      const k = SN.settings.gyroSens * (this.mode === 'eye' ? 1 : 0.35);
      this.yaw += yawRate * DEG * dt * k; this.pitch += pitchRate * DEG * dt * k;
    }

    // ---- 移動・離脱 ----
    relocate(idx) {
      if (idx === this.posIdx || this.ended) return;
      const travel = 45 + Math.random() * 30;
      // 移動中も世界は進む
      const steps = Math.ceil(travel / 0.1);
      for (let i = 0; i < steps && !this.ended; i++) {
        this.gt += 0.1; this.world.update(this.gt, 0.1);
        for (const a of this.actors) a.update(0.1, this.gt);
        this.fx.update(0.1, this.gt);
      }
      this.posIdx = idx; this.pos = this.world.positions[idx];
      this.detect = Math.max(0, this.detect * 0.2); this.posShots = 0;
      if (this.alertLv >= 3) { this.alertLv = 2; this.discoveredT = -1; }
      if (this.alertLv >= 2 && this.detect < 45) this.alertLv = 1;
      this.hr = 128; this.relocations++;
      this.aimAt(this.world.base.x, this.world.base.y + 1.2, this.world.base.z);
      this.check.range = false;
      this.say('「' + this.pos.name + '」に着いた（' + Math.round(travel) + '秒）。息を整えろ。距離が変わったから測り直しだ。', 7);
      this.applyHud();
    }
    exfil() {
      this.check.exfil = true;
      if (this.objDone) this.endMission(true, null);
      else this.endMission(false, '目標未達成のまま離脱');
    }
    endMission(success, reason) {
      if (this.ended) return;
      this.ended = true;
      this.success = success; this.failReason = reason;
      setTimeout(() => {
        this.endShown = true;
        cancelAnimationFrame(this.raf);
        this.enableGyro(false);
        this.audio.setWind(0);
        this.setPulse([]); $('btn-corr').hidden = true; $('hud-lrf').hidden = true;
        SN.UI.debrief(this);
      }, success ? 600 : 2200);
    }
    destroy() {
      cancelAnimationFrame(this.raf); this.endShown = true; this.ended = true;
      this.setPulse([]); $('btn-corr').hidden = true; $('hud-lrf').hidden = true;
      this.enableGyro(false);
      this.world.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
    }

    flash(k) { const f = $('hit-flash'); f.style.transition = 'none'; f.style.opacity = k; requestAnimationFrame(() => { f.style.transition = 'opacity 0.5s'; f.style.opacity = 0; }); }

    // ---- HUD ----
    applyHud() {
      $('elev-val').textContent = fmt1(this.elev * 0.1);
      $('elev-rev').textContent = Math.floor(this.elev / 100) + '回転目';
      $('wind-val').textContent = this.wclk === 0 ? '0.0' : (this.wclk < 0 ? 'L ' : 'R ') + fmt1(Math.abs(this.wclk) * 0.1);
      $('hud-ammo').textContent = (this.chambered ? '薬室●' : '薬室○') + ' 弾倉' + this.inMag + ' 予備' + this.reserve;
      $('zoom-val').textContent = this.mode === 'eye' ? '1×' : (Math.round((this.mode === 'rifle' ? this.mag.rifle : this.mag.spot) * 10) / 10) + '×';
      const o = this.m.objective;
      $('hud-obj').innerHTML = '目標: ' + escapeHtml(o.text) + (this.objDone ? ' <b style="color:var(--ok)">達成</b>' : '');
      $('btn-lrf').hidden = SN.settings.difficulty === 'manual';
      $('tool-calc').innerHTML = SN.settings.difficulty === 'manual' ? '気象計' : '弾道<br>計算';
      const trig = $('btn-trigger');
      trig.classList.toggle('blocked', this.mode !== 'rifle' || !this.chambered || this.boltT > 0 || this.reloadT > 0);
      this.updateGuide();
      $('btn-bolt').textContent = this.reloadT > 0 ? '交換中' : (this.boltT > 0 ? '操作中' : (!this.chambered && this.inMag === 0 && this.reserve > 0 ? '弾倉交換' : 'ボルト'));
    }
    applyHudLive() {
      const { yaw, pitch } = this.viewAngles();
      let az = (yaw / DEG) % 360; if (az < 0) az += 360;
      $('hud-az').textContent = '方位 ' + String(Math.round(az)).padStart(3, '0') + '°';
      $('hud-inc').textContent = '傾斜 ' + (pitch >= 0 ? '+' : '−') + Math.abs(pitch / DEG).toFixed(1) + '°';
      const s = Math.floor(this.gt), mm = Math.floor(s / 60), ss = s % 60;
      $('hud-time').textContent = String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
      const names = ['平常', '警戒', '捜索', '発見'];
      const ch = $('hud-alert');
      if (ch.dataset.lv !== String(this.alertLv)) { ch.dataset.lv = String(this.alertLv); ch.textContent = this.m.noAlert ? '訓練' : names[this.alertLv]; ch.className = 'alert-chip a' + (this.m.noAlert ? 0 : this.alertLv); }
      $('hud-detect').style.width = (this.m.noAlert ? 0 : Math.min(100, this.detect)) + '%';
      if (this._lastHud === undefined || this.gt - this._lastHud > 0.25) { this._lastHud = this.gt; this.applyHud(); this.updateGuide(); }
      if (this.pendingCorr && this.gt - this.pendingCorr.t > 40) { this.pendingCorr = null; $('btn-corr').hidden = true; }
    }

    // ---- 描画 ----
    render() {
      const r = this.R;
      this.updateCamera();
      this.fx.setView(this.camera, r.h * r.dpr);
      r.renderer.setRenderTarget(r.rt);
      r.renderer.render(this.world.scene, this.camera);
      r.renderer.setRenderTarget(null);
      const u = r.postMat.uniforms;
      u.uScope.value = this.mode === 'eye' ? 0 : 1;
      u.uRadius.value = this.circleDiam() / 2 * r.dpr;
      u.uTime.value = this.gt;
      // 陽炎：標的付近の横風で流れ、無風だと立ちのぼる
      if (this.mode !== 'eye') {
        const w = this.world.wind.at(this.world.base, this.gt);
        const ch = this.crossHead(w);
        const sunK = Math.max(0.2, Math.sin(this.m.sun.el * DEG));
        const mg = this.mode === 'rifle' ? this.mag.rifle : this.mag.spot;
        const strength = this.m.wx.mirage * sunK * clamp((mg - 6) / 20, 0, 1.6) * 2.4;
        u.uMirage.value = strength * (1 - clamp((Math.abs(ch.cross) - 7) / 5, 0, 0.8));
        u.uFlow.value.set(ch.cross * 0.55, 0.9 * Math.exp(-Math.abs(ch.cross) * 0.9) + 0.05);
      } else u.uMirage.value = 0;
      r.renderer.render(r.postScene, r.postCam);
      if (this.reticleDirty) { this.drawReticle(); this.reticleDirty = false; }
    }

    drawReticle() {
      const c = $('reticle'), g = c.getContext('2d'), r = this.R, dpr = r.dpr;
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
      if (this.mode === 'eye') return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cx = r.w / 2, cy = r.h / 2, R0 = this.circleDiam() / 2, ppm = this.ppm();
      g.save(); g.beginPath(); g.arc(cx, cy, R0, 0, Math.PI * 2); g.clip();
      g.strokeStyle = '#0b0b0b'; g.fillStyle = '#0b0b0b'; g.lineWidth = 1.1;
      const line = (x1, y1, x2, y2, w) => { g.lineWidth = w || 1.1; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
      const fine = 0.2 * ppm >= 4;
      if (this.mode === 'rifle') {
        const span = 10;
        // 太い外側の線
        line(cx - R0, cy, cx - span * ppm, cy, 3.2); line(cx + span * ppm, cy, cx + R0, cy, 3.2);
        line(cx, cy + span * ppm, cx, cy + R0, 3.2); line(cx, cy - R0, cx, cy - span * ppm, 3.2);
        // 細い十字
        line(cx - span * ppm, cy, cx - 0.08 * ppm, cy, 0.9); line(cx + 0.08 * ppm, cy, cx + span * ppm, cy, 0.9);
        line(cx, cy - span * ppm, cx, cy - 0.08 * ppm, 0.9); line(cx, cy + 0.08 * ppm, cx, cy + span * ppm, 0.9);
        g.font = '10px "Share Tech Mono", monospace'; g.textAlign = 'center';
        for (let k = 1; k <= span * 5; k++) {
          const m = k * 0.2, major = k % 5 === 0, half = k % 5 === 0 ? 0 : (k % 5 === 0);
          if (!fine && !major) continue;
          const L = major ? 0.35 : 0.15;
          for (const s of [-1, 1]) {
            line(cx + s * m * ppm, cy - L * ppm, cx + s * m * ppm, cy + L * ppm, 0.9);
            line(cx - L * ppm, cy + s * m * ppm, cx + L * ppm, cy + s * m * ppm, 0.9);
          }
          if (major && (m % 2 === 0) && ppm > 8) { g.fillText(String(m), cx + m * ppm, cy + 0.9 * ppm + 4); g.fillText(String(m), cx - m * ppm, cy + 0.9 * ppm + 4); }
        }
        // ホールドオーバー用の点（ツリー）
        for (let row = 1; row <= 10; row++) {
          const y = cy + row * ppm;
          const w = Math.min(10, 1 + row * 0.6);
          for (let x = -Math.floor(w); x <= Math.floor(w); x++) {
            if (x === 0) continue;
            g.beginPath(); g.arc(cx + x * ppm, y, Math.max(0.8, 0.04 * ppm), 0, Math.PI * 2); g.fill();
          }
          if (row % 2 === 0 && ppm > 8) { g.textAlign = 'right'; g.fillText(String(row), cx - (Math.floor(w) + 0.6) * ppm, y + 3); g.textAlign = 'center'; }
        }
        // 照明つきの中心点
        if (SN.settings.illum) { g.fillStyle = '#ff3b1f'; g.beginPath(); g.arc(cx, cy, Math.max(1.3, 0.035 * ppm), 0, Math.PI * 2); g.fill(); }
      } else {
        // 観測スコープ：MIL 目盛りの十字
        const span = Math.min(12, R0 / ppm);
        line(cx - span * ppm, cy, cx + span * ppm, cy, 0.8); line(cx, cy - span * ppm, cx, cy + span * ppm, 0.8);
        g.font = '10px "Share Tech Mono", monospace'; g.textAlign = 'center';
        for (let k = 1; k <= span * 10; k++) {
          const m = k * 0.1; const major = k % 10 === 0, mid = k % 5 === 0;
          if (!major && !mid && 0.1 * ppm < 4) continue;
          const L = major ? 0.3 : (mid ? 0.18 : 0.09);
          for (const s of [-1, 1]) {
            line(cx + s * m * ppm, cy - L * ppm, cx + s * m * ppm, cy + L * ppm, 0.8);
            line(cx - L * ppm, cy + s * m * ppm, cx + L * ppm, cy + s * m * ppm, 0.8);
          }
          if (major) { g.fillText(String(Math.round(m)), cx + m * ppm, cy + 0.55 * ppm + 6); g.fillText(String(Math.round(m)), cx - (m + 0.25) * ppm, cy - m * 0 + 0.55 * ppm + 6); }
        }
      }
      g.restore();
      // 鏡筒の縁
      g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, R0 + 2, 0, Math.PI * 2); g.stroke();
    }
  }

  // ---- 幾何の補助 ----
  function segBox(a, c, inv, half) {
    const o = a.clone().applyMatrix4(inv), e = c.clone().applyMatrix4(inv);
    const d = e.clone().sub(o);
    let t0 = 0, t1 = 1;
    for (let k = 0; k < 3; k++) {
      const oa = o.getComponent(k), da = d.getComponent(k), h = half.getComponent(k);
      if (Math.abs(da) < 1e-12) { if (oa < -h || oa > h) return null; continue; }
      let ta = (-h - oa) / da, tb = (h - oa) / da;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    return t0;
  }
  function distPointSeg(p, a, b) {
    const ab = b.clone().sub(a), ap = p.clone().sub(a);
    const t = clamp(ap.dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1);
    return a.clone().addScaledVector(ab, t).distanceTo(p);
  }
  function isVisible(o) { while (o) { if (!o.visible) return false; o = o.parent; } return true; }
  function angles(e, p) { const d = p.clone().sub(e); return { yaw: Math.atan2(d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) }; }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function colorName(hex) {
    if (hex === undefined) return '';
    const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl, THREE.SRGBColorSpace);
    if (hsl.l < 0.13) return '黒';
    if (hsl.l > 0.8) return '白';
    if (hsl.s < 0.12) return hsl.l < 0.3 ? '濃い灰色' : '灰色';
    const h = hsl.h * 360;
    if (h < 15 || h > 340) return hsl.l < 0.3 ? '暗い赤' : '赤';
    if (h < 45) return hsl.l < 0.35 ? '茶色' : 'ベージュ';
    if (h < 75) return 'カーキ';
    if (h < 160) return 'オリーブ';
    return '青';
  }
  SN.colorName = colorName; SN.escapeHtml = escapeHtml;
  SN.Game = Game;
  SN.resize = resize;
  SN.initRenderer = initRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
