// 人物モデル・行動・被弾
(function (root) {
  'use strict';
  const SN = root.SN = root.SN || {};
  const DEG = Math.PI / 180;
  const SKIN = [0xb58a67, 0x9c7354, 0xc69a74, 0x8a634a];

  const PART_INFO = {
    head: { name: '頭部', vital: 'instant' },
    neck: { name: '頸部', vital: 'instant' },
    thorax: { name: '胸部', vital: 'chest' },
    abdomen: { name: '腹部', vital: 'gut' },
    pelvis: { name: '骨盤', vital: 'pelvis' },
    uarmL: { name: '左上腕', vital: 'arm', limb: true }, uarmR: { name: '右上腕', vital: 'arm', limb: true },
    farmL: { name: '左前腕', vital: 'arm', limb: true }, farmR: { name: '右前腕', vital: 'arm', limb: true },
    thighL: { name: '左大腿部', vital: 'thigh', limb: true }, thighR: { name: '右大腿部', vital: 'thigh', limb: true },
    shinL: { name: '左下腿', vital: 'shin', limb: true }, shinR: { name: '右下腿', vital: 'shin', limb: true },
    gear: { name: '装備', vital: 'none' }
  };
  SN.PART_INFO = PART_INFO;

  function makeMat(c) { return new THREE.MeshLambertMaterial({ color: c }); }

  class Actor {
    constructor(def, world, ctx) {
      const THREE = root.THREE;
      this.def = def; this.world = world; this.ctx = ctx;
      this.id = def.id; this.role = def.role;
      const look = typeof def.look === 'string' ? SN.LOOKS[def.look] : def.look;
      this.look = look;
      const rnd = world.rnd;
      this.skin = SKIN[Math.floor(rnd() * SKIN.length)];
      this.root = new THREE.Group();
      this.parts = [];
      this.joints = {};
      this.build(look);
      world.scene.add(this.root);
      // 状態
      this.state = 'normal';
      this.alive = true; this.down = false; this.gone = false;
      this.heading = 0; this.speed = 0;
      this.wayIdx = 0; this.pauseT = 0; this.phase = rnd() * 10;
      this.t = 0; this.reactAt = -1; this.coverPt = null; this.peekT = 0; this.peeking = false;
      this.bleed = -1; this.wounds = [];
      this.fall = null; this.pose = 'stand';
      this.vis = true;
      this.hp = 1;
      const b = def.beh;
      const start = b.at || b.path[0];
      this.setLocal(start[0], start[1]);
      this.heading = this.faceToHeading(b.face !== undefined ? b.face : 0);
      if (b.type === 'emerge') { this.root.visible = false; this.vis = false; this.state = 'hidden'; }
      this.lastDrop = 0;
    }

    faceToHeading(faceDeg) {
      // face: 基地の局所座標での向き。0 = 射手の方、90 = 射手から見て右（+v）
      const az = this.world.mission.azimuth * DEG;
      const ang = az + Math.PI - faceDeg * DEG; // 方位（北=0, 時計回り）… 0 → 射手方向（az+180）
      const dx = Math.sin(ang), dz = -Math.cos(ang);
      return Math.atan2(dx, dz);
    }

    setLocal(du, dv) {
      const w = this.world.toWorld(this.world.D + du, dv);
      this.root.position.set(w.x, this.world.groundAt(w.x, w.z), w.z);
    }

    build(look) {
      const THREE = root.THREE;
      const J = (name, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); this.joints[name] = g; return g; };
      const P = (part, parent, w, h, d, x, y, z, color) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeMat(color));
        m.position.set(x, y, z); m.userData.part = part; m.userData.size = [w, h, d];
        parent.add(m); this.parts.push(m); return m;
      };
      const top = look.top, pants = look.pants, skin = this.skin;
      const hips = J('hips', this.root, 0, 0.95, 0);
      P('pelvis', hips, 0.34, 0.18, 0.21, 0, -0.03, 0, pants);
      const spine = J('spine', hips, 0, 0.06, 0);
      P('abdomen', spine, 0.32, 0.2, 0.2, 0, 0.09, 0, top);
      const chest = J('chest', spine, 0, 0.2, 0);
      P('thorax', chest, 0.4, 0.33, 0.24, 0, 0.16, 0, top);
      if (look.vest) P('thorax', chest, 0.42, 0.26, 0.26, 0, 0.15, 0, look.vest);
      const neck = J('neck', chest, 0, 0.33, 0);
      P('neck', neck, 0.11, 0.08, 0.11, 0, 0.03, 0, skin);
      const head = J('head', neck, 0, 0.07, 0);
      P('head', head, 0.19, 0.23, 0.21, 0, 0.115, 0.005, skin);
      if (look.beard) P('head', head, 0.17, 0.09, 0.03, 0, 0.04, 0.105, 0x24201c);
      // かぶりもの
      const hg = look.head, hc = look.headColor;
      if (hg === 'turban') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.115, 0.13, 10), makeMat(hc)); m.position.set(0, 0.235, 0); m.userData.part = 'head'; m.userData.size = [0.25, 0.13, 0.25]; head.add(m); this.parts.push(m); }
      else if (hg === 'helmet') { const m = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), makeMat(hc)); m.position.set(0, 0.17, 0); m.userData.part = 'head'; m.userData.size = [0.27, 0.14, 0.27]; head.add(m); this.parts.push(m); }
      else if (hg === 'cap') P('head', head, 0.2, 0.07, 0.22, 0, 0.225, 0.01, hc);
      else if (hg === 'scarf') { P('head', head, 0.21, 0.08, 0.23, 0, 0.215, 0, hc); P('neck', neck, 0.16, 0.08, 0.16, 0, 0.02, 0, hc); }
      // 腕
      for (const s of ['L', 'R']) {
        const sx = s === 'L' ? 0.25 : -0.25; // 前が +z なので、本人の左は +x
        const sh = J('sh' + s, chest, sx, 0.3, 0);
        P('uarm' + s, sh, 0.1, 0.3, 0.11, 0, -0.15, 0, top);
        const el = J('el' + s, sh, 0, -0.3, 0);
        P('farm' + s, el, 0.09, 0.27, 0.1, 0, -0.135, 0, top);
        P('farm' + s, el, 0.08, 0.08, 0.09, 0, -0.3, 0, skin);
        const hp = J('hip' + s, hips, s === 'L' ? 0.1 : -0.1, -0.07, 0);
        P('thigh' + s, hp, 0.14, 0.44, 0.15, 0, -0.22, 0, pants);
        const kn = J('kn' + s, hp, 0, -0.44, 0);
        P('shin' + s, kn, 0.11, 0.42, 0.12, 0, -0.21, 0, pants);
        P('shin' + s, kn, 0.11, 0.07, 0.24, 0, -0.42, 0.05, 0x2b2620);
      }
      // 持ち物
      if (look.item === 'rifle') {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.95), makeMat(0x1d1c1a));
        r.position.set(0.0, -0.1, 0.12); r.rotation.x = -0.4; r.userData.part = 'gear'; r.userData.size = [0.05, 0.08, 0.95];
        this.joints.elR.add(r); this.parts.push(r); this.rifle = r;
      } else if (look.item === 'radio') {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.05), makeMat(0x151515));
        r.position.set(0, -0.32, 0.03); r.userData.part = 'gear'; r.userData.size = [0.07, 0.2, 0.05];
        this.joints.elL.add(r); this.parts.push(r);
        const ant = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.18, 0.01), makeMat(0x111111)); ant.position.set(0, -0.14, 0.03); this.joints.elL.add(ant);
      }
    }

    // 局所位置（基地中心から）
    localPos() { const l = this.world.toLocal(this.root.position.x, this.root.position.z); return [l.u - this.world.D, l.v]; }

    worldOf(du, dv) { return this.world.toWorld(this.world.D + du, dv); }

    walkTo(target, dt, speed) {
      const p = this.root.position;
      const w = this.worldOf(target[0], target[1]);
      const dx = w.x - p.x, dz = w.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) { this.speed = 0; return true; }
      const want = Math.atan2(dx, dz);
      let dh = want - this.heading; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      this.heading += Math.max(-dt * 4, Math.min(dt * 4, dh));
      const s = Math.min(speed, d / Math.max(dt, 1e-3));
      p.x += Math.sin(this.heading) * s * dt; p.z += Math.cos(this.heading) * s * dt;
      p.y = this.world.groundAt(p.x, p.z);
      this.speed = s;
      return false;
    }

    // ---- 毎フレーム ----
    update(dt, gt) {
      this.t += dt; this.phase += dt;
      if (this.gone) return;
      const b = this.def.beh;
      if (this.state === 'hidden') {
        if (gt >= b.startAt) { this.state = 'normal'; this.root.visible = true; this.vis = true; this.wayIdx = 0; this.setLocal(b.path[0][0], b.path[0][1]); }
        else return;
      }
      if (this.state === 'dying' || this.state === 'dead') { this.updateFall(dt); this.updatePose(dt, gt); return; }
      if (this.state === 'wounded') { this.updateWounded(dt, gt); this.updatePose(dt, gt); return; }
      if (this.reactAt >= 0 && gt >= this.reactAt && this.state === 'normal') this.becomeAlerted();
      if (this.state === 'normal') this.updateNormal(dt, gt, b);
      else if (this.state === 'alerted') this.updateAlerted(dt, gt);
      this.updatePose(dt, gt);
    }

    updateNormal(dt, gt, b) {
      this.speed = 0; this.pose = 'stand';
      switch (b.type) {
        case 'idle': this.pose = 'stand'; this.heading += Math.sin(this.phase * 0.2) * dt * 0.15; break;
        case 'sentry': this.pose = b.binos ? 'binos' : 'stand';
          this.heading = this.faceToHeading(b.face) + Math.sin(this.phase * 0.12) * 0.6; break;
        case 'talk': this.pose = 'talk'; break;
        case 'work': this.pose = 'work'; break;
        case 'patrol': case 'emerge': case 'meeting': {
          if (b.type === 'meeting' && gt < b.leaveAt) { this.pose = 'talk'; this.heading = this.faceToHeading(b.face); break; }
          if (this.pauseT > 0) { this.pauseT -= dt; this.pose = 'stand'; if (b.type === 'patrol') this.heading += Math.sin(this.phase * 0.5) * dt * 0.4; break; }
          const path = b.path;
          if (this.wayIdx >= path.length) {
            if (b.type === 'patrol') this.wayIdx = 0;
            else { if (b.vanish) this.vanish(); else { this.def.beh = { type: 'idle', at: this.localPos(), face: 0 }; } break; }
          }
          const arrived = this.walkTo(path[this.wayIdx], dt, b.speed || 1.1);
          this.pose = 'walk';
          if (arrived) {
            const stop = b.type === 'patrol' ? (b.pause || 0) * (0.6 + Math.random() * 0.8) : ((b.stops && b.stops[this.wayIdx]) || 0);
            this.pauseT = stop;
            this.wayIdx++;
          }
          break;
        }
      }
    }

    vanish() {
      this.gone = true; this.root.visible = false; this.vis = false;
      if (this.ctx.onGone) this.ctx.onGone(this);
    }

    // 警戒（射撃に気づいた）
    alert(delay, gt) {
      if (!this.alive || this.state !== 'normal') return;
      const at = gt + delay;
      if (this.reactAt < 0 || at < this.reactAt) this.reactAt = at;
    }
    becomeAlerted() {
      this.state = 'alerted';
      this.coverPt = this.ctx.findCover(this);
      this.peekT = 6 + Math.random() * 8;
    }
    updateAlerted(dt, gt) {
      const b = this.def.beh;
      // 退出予定の標的は、警戒しても急いで車へ向かう
      if ((b.type === 'meeting' || b.type === 'emerge') && b.vanish) {
        const dest = b.vanish;
        const arrived = this.walkTo(dest, dt, 3.2);
        this.pose = 'run';
        if (arrived) this.vanish();
        return;
      }
      if (this.coverPt) {
        const arrived = this.walkTo(this.coverPt.pt, dt, 3.4);
        this.pose = 'run';
        if (arrived) {
          this.heading = this.coverPt.face;
          this.peekT -= dt;
          if (this.peeking) { this.pose = this.coverPt.low ? 'stand' : 'stand'; if (this.peekT < 0) { this.peeking = false; this.peekT = 7 + Math.random() * 10; } }
          else { this.pose = this.coverPt.low ? 'crouch' : 'stand'; if (this.peekT < 0) { this.peeking = true; this.peekT = 2 + Math.random() * 2.5; } }
          if (!this.coverPt.low && !this.peeking) this.pose = 'crouch';
        }
      } else {
        this.pose = 'prone';
      }
    }

    // ---- 被弾 ----
    // hit: {part, localPoint, dir(Vector3), energyJ, caliber, rifleId}
    takeHit(hit, gt) {
      const info = PART_INFO[hit.part] || PART_INFO.gear;
      const big = hit.rifleId === 'r50';
      const heavy = hit.rifleId === 'r338' || big;
      let outcome = '', lethal = false, kind = 'none', delay = 0;
      const lx = hit.localPoint ? hit.localPoint.x : 0;
      switch (info.vital) {
        case 'instant':
          lethal = true; kind = 'collapse';
          outcome = hit.part === 'head'
            ? (big ? '頭部に命中。12.7mm弾で頭部が大きく破壊された。即死。' : '頭部に命中。脳幹を含む損傷で、その場に崩れ落ちた。即死。')
            : '頸部に命中。頸椎と大血管の損傷で、その場に崩れ落ちた。即死。';
          break;
        case 'chest':
          lethal = true;
          if (Math.abs(lx) < 0.1 || heavy) { kind = 'drop'; delay = big ? 0 : 0.4 + Math.random() * 1.2; outcome = big ? '胸部に命中。12.7mm弾が胸郭を貫通し、体が後ろへ弾き飛ばされた。即死。' : '胸部中央に命中。心臓と大血管を損傷。数秒で意識を失い死亡。'; }
          else { kind = 'stagger'; delay = 1.5 + Math.random() * 2; outcome = '胸部（' + (lx > 0 ? '左' : '右') + '肺）に命中。数歩よろめいて倒れ、大量出血で死亡。'; this.bleed = 12 + Math.random() * 10; lethal = false; }
          break;
        case 'gut':
          if (big) { lethal = true; kind = 'drop'; outcome = '腹部に命中。12.7mm弾で胴体が大きく損傷。即死。'; }
          else { kind = 'wounded'; this.bleed = 45 + Math.random() * 30; outcome = '腹部に命中。致命傷だが即座には動きを止めず、這って逃げようとした。'; }
          break;
        case 'pelvis':
          if (big) { lethal = true; kind = 'drop'; outcome = '骨盤に命中。12.7mm弾で下半身が砕けた。ショックと失血で死亡。'; }
          else { kind = 'wounded'; this.bleed = 60 + Math.random() * 40; outcome = '骨盤に命中。骨盤が砕けて立てなくなった。腹腔内の出血が続いている。'; }
          break;
        case 'thigh':
          if (big) { kind = 'sever'; this.bleed = 8 + Math.random() * 6; outcome = info.name + 'に命中。12.7mm弾で脚がちぎれ、数秒で失血死。'; }
          else if (Math.random() < 0.35) { kind = 'wounded'; this.bleed = 25 + Math.random() * 25; outcome = info.name + 'に命中。大腿動脈を損傷し、短時間で失血死。'; }
          else { kind = 'wounded'; this.bleed = -1; outcome = info.name + 'に命中。大腿骨が折れて倒れた。生存。'; }
          break;
        case 'shin':
          if (big) { kind = 'sever'; this.bleed = 20 + Math.random() * 10; outcome = info.name + 'に命中。12.7mm弾で下腿が切断された。失血で死亡。'; }
          else { kind = 'wounded'; this.bleed = -1; outcome = info.name + 'に命中。歩けなくなったが、生存。'; }
          break;
        case 'arm':
          if (big) { kind = 'sever'; this.bleed = 15 + Math.random() * 10; outcome = info.name + 'に命中。12.7mm弾で腕がちぎれた。失血で死亡。'; }
          else { kind = 'arm'; outcome = info.name + 'に命中。武器を取り落とし、遮蔽物へ逃げた。生存。'; }
          break;
        default:
          outcome = '装備に命中。本人は無傷。'; kind = 'none';
      }
      this.wounds.push({ part: hit.part, outcome });
      if (hit.part !== 'gear') this.ctx.fx.woundStain(this, hit);
      if (kind === 'sever') {
        // 部位を切り離す
        this.ctx.fx.sever(this, hit);
        kind = 'wounded';
      }
      const already = this.state === 'dying' || this.state === 'dead';
      if (lethal) {
        this.alive = false;
        this.startFall(hit, kind, delay);
      } else if (kind === 'stagger') {
        this.startFall(hit, 'stagger', delay); // 倒れたあと出血で死亡
      } else if (kind === 'wounded') {
        if (!already) { this.state = 'wounded'; this.down = true; this.startFall(hit, 'wounded', 0.2); }
      } else if (kind === 'arm') {
        if (this.rifle) { this.ctx.fx.dropItem(this, this.rifle); this.rifle = null; }
        if (this.state === 'normal') this.becomeAlerted();
      }
      return { outcome, lethal, kind };
    }

    startFall(hit, kind, delay) {
      if (this.fall && this.fall.started && kind !== 'collapse' && kind !== 'drop') return;
      const dir = hit.dir.clone(); dir.y = 0; dir.normalize();
      // 撃たれた方向（弾の進む向き）へ倒れやすい。頭部は真下に崩れる。
      const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
      const along = dir.dot(fwd); // 正なら背中から前へ
      this.fall = {
        kind, t: -delay, started: false, dur: kind === 'collapse' ? 0.75 : (kind === 'wounded' ? 0.9 : 1.1),
        pitchSign: along > 0 ? 1 : -1, side: (Math.random() - 0.5) * 0.6,
        push: kind === 'drop' && hit.rifleId === 'r50' ? 1.4 : (kind === 'drop' ? 0.25 : 0)
      };
      this.fallDir = dir;
      if (this.state !== 'wounded') this.state = 'dying';
      this.down = true;
    }

    updateFall(dt) {
      const f = this.fall; if (!f) return;
      f.t += dt;
      if (f.t < 0) {
        // よろめき
        this.pose = f.kind === 'stagger' ? 'stagger' : 'stand';
        if (f.kind === 'stagger') { const p = this.root.position; p.x += this.fallDir.x * 0.5 * dt; p.z += this.fallDir.z * 0.5 * dt; p.y = this.world.groundAt(p.x, p.z); }
        return;
      }
      if (!f.started) { f.started = true; if (this.ctx.onDown) this.ctx.onDown(this); }
      if (this.pose !== 'crawl') this.pose = 'fallen';
      const k = Math.min(1, f.t / f.dur);
      const e = k * k; // 重力で加速する
      this.fallK = e;
      if (f.push && k < 1) { const p = this.root.position; p.x += this.fallDir.x * f.push * dt / f.dur; p.z += this.fallDir.z * f.push * dt / f.dur; }
      if (k >= 1 && this.state === 'dying' && !this.alive) {
        this.state = 'dead';
        if (this.ctx.onDead) this.ctx.onDead(this);
      }
      if (this.bleed > 0) {
        this.bleed -= dt;
        if (this.bleed <= 0 && this.alive) { this.alive = false; this.state = 'dead'; if (this.ctx.onDead) this.ctx.onDead(this); }
      }
    }

    updateWounded(dt, gt) {
      this.updateFall(dt);
      if (!this.fall || this.fall.t < this.fall.dur) { this.pose = 'fallen'; return; }
      // 這って遮蔽物へ
      if (!this.coverPt) this.coverPt = this.ctx.findCover(this);
      this.pose = 'crawl';
      if (this.coverPt) {
        const arrived = this.walkTo(this.coverPt.pt, dt, 0.35);
        if (arrived) this.pose = 'fallen';
      }
      // 血の跡
      this.lastDrop -= dt;
      if (this.speed > 0.05 && this.lastDrop < 0) { this.ctx.fx.trail(this); this.lastDrop = 0.6; }
      if (this.bleed > 0) {
        this.bleed -= dt;
        if (this.bleed <= 0) { this.alive = false; this.state = 'dead'; this.pose = 'fallen'; if (this.ctx.onDead) this.ctx.onDead(this); }
      }
    }

    // ---- ポーズ（関節の角度） ----
    updatePose(dt, gt) {
      const J = this.joints, ph = this.phase;
      const set = (n, x, y, z) => { const j = J[n]; if (j) { j.rotation.set(x || 0, y || 0, z || 0); } };
      // 初期化
      for (const n in J) J[n].rotation.set(0, 0, 0);
      J.hips.position.y = 0.95;
      this.root.rotation.set(0, this.heading, 0);
      const breath = Math.sin(ph * 1.6) * 0.015;
      switch (this.pose) {
        case 'stand':
          set('chest', breath); set('shL', 0.05, 0, 0.08); set('shR', 0.05, 0, -0.08);
          if (this.rifle) { set('shR', -0.5, 0, -0.1); set('elR', -0.9); }
          break;
        case 'binos':
          set('shL', -2.2, 0, 0.3); set('shR', -2.2, 0, -0.3); set('elL', -1.6); set('elR', -1.6); set('neck', -0.05);
          break;
        case 'talk': {
          const g = Math.sin(ph * 2.3) * 0.3;
          set('shR', -0.6 + g, 0, -0.15); set('elR', -1.1); set('shL', 0.05, 0, 0.08); set('head', Math.sin(ph * 1.3) * 0.08, Math.sin(ph * 0.7) * 0.2);
          break;
        }
        case 'work':
          J.hips.position.y = 0.55; set('hipL', -1.4); set('knL', 2.2); set('hipR', -0.4); set('knR', 1.9);
          set('spine', 0.4); set('shL', -0.9 + Math.sin(ph * 3) * 0.2); set('shR', -0.9 - Math.sin(ph * 3) * 0.2); set('elL', -0.5); set('elR', -0.5);
          break;
        case 'walk': case 'run': {
          const run = this.pose === 'run';
          const f = run ? 9 : 5.5, a = run ? 0.9 : 0.45;
          const s = Math.sin(ph * f);
          set('hipL', s * a); set('hipR', -s * a);
          set('knL', Math.max(0, -Math.cos(ph * f)) * a * 1.4); set('knR', Math.max(0, Math.cos(ph * f)) * a * 1.4);
          set('shL', -s * a * 0.8, 0, 0.08); set('shR', s * a * 0.8, 0, -0.08);
          set('elL', -0.3 - (run ? 0.9 : 0)); set('elR', -0.3 - (run ? 0.9 : 0));
          if (run) set('spine', 0.25);
          if (this.rifle && !run) { set('shR', -0.5, 0, -0.1); set('elR', -0.9); }
          J.hips.position.y = 0.95 + Math.abs(Math.cos(ph * f)) * 0.03;
          break;
        }
        case 'crouch':
          J.hips.position.y = 0.5; set('hipL', -1.5); set('knL', 2.3); set('hipR', -1.2); set('knR', 2.4); set('spine', 0.5); set('neck', -0.3);
          set('shL', -0.6); set('shR', -0.6); set('elL', -1.2); set('elR', -1.2);
          break;
        case 'prone':
          this.root.rotation.set(Math.PI / 2 * 0.97, this.heading, 0, 'YXZ');
          this.root.position.y = this.world.groundAt(this.root.position.x, this.root.position.z) + 0.12;
          J.hips.position.y = 0.95; set('neck', -0.9); set('shL', -2.6); set('shR', -2.6); set('elL', 0.6); set('elR', 0.6);
          break;
        case 'stagger':
          set('spine', 0.3 + Math.sin(ph * 6) * 0.1); set('knL', 0.5); set('knR', 0.3); set('shL', 0.4, 0, 0.5); set('shR', 0.2, 0, -0.5);
          break;
      }
      // 倒れる・倒れた
      if (this.fall && this.fall.started) {
        const f = this.fall, e = this.fallK !== undefined ? this.fallK : 1;
        const pitch = f.pitchSign * Math.PI / 2 * 0.98 * e;
        if (f.kind === 'collapse') {
          // 膝から崩れ落ちてから横たわる
          const k1 = Math.min(1, e * 2.2);
          J.hips.position.y = 0.95 - 0.55 * k1;
          set('hipL', -1.2 * k1); set('knL', 2.0 * k1); set('hipR', -0.9 * k1); set('knR', 1.8 * k1);
          set('spine', 0.5 * k1); set('neck', 0.6 * k1); set('shL', 0.3, 0, 0.6 * k1); set('shR', 0.2, 0, -0.5 * k1);
        } else {
          set('shL', -0.3 * e, 0, 0.9 * e + f.side); set('shR', 0.4 * e, 0, -1.1 * e); set('elL', -0.4 * e); set('elR', -0.8 * e);
          set('hipL', -0.2 * e); set('hipR', 0.15 * e); set('knL', 0.4 * e); set('knR', 0.1 * e); set('neck', -0.4 * e);
        }
        const k2 = f.kind === 'collapse' ? Math.max(0, (e - 0.35) / 0.65) : e;
        this.root.rotation.set(pitch * (f.kind === 'collapse' ? k2 : 1), this.heading, f.side * k2, 'YXZ');
        if (this.pose === 'crawl') {
          const c = Math.sin(ph * 2.5);
          set('shL', -2.4 + c * 0.4); set('shR', -2.4 - c * 0.4); set('elL', 0.5); set('elR', 0.5);
          set('hipL', c * 0.3); set('hipR', -c * 0.3); set('knL', 0.8); set('knR', 0.8);
          this.root.rotation.set(Math.PI / 2 * 0.98, this.heading, 0, 'YXZ');
        }
        // 地面に沿うよう少し持ち上げる
        this.root.position.y = this.world.groundAt(this.root.position.x, this.root.position.z) + (f.kind === 'collapse' ? 0.12 * k2 : 0.12 * e);
      }
    }

    // 無力化（死亡、または致命傷で倒れている）
    neutralized() { return !this.alive || (this.down && this.bleed > 0); }

    // 体の大きさのおおよその球（当たり判定の前段）
    bounds(out) {
      const p = this.root.position;
      out.set(p.x, p.y + (this.down ? 0.3 : 0.9), p.z);
      return this.down ? 1.3 : 1.1;
    }
  }
  SN.Actor = Actor;
})(typeof window !== 'undefined' ? window : globalThis);
