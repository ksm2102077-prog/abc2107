// 画面の切り替え・ブリーフィング・各パネル・結果
(function (root) {
  'use strict';
  const SN = root.SN;
  const B = SN.Ballistics;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const DIRS = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
  const dirName = (deg) => DIRS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
  const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

  const UI = SN.UI = {};
  let sel = { mission: null, pos: 0, rifle: null };

  UI.show = function (name) {
    for (const s of ['title', 'campaign', 'brief', 'game', 'debrief']) $('scr-' + s).hidden = s !== name;
    if (name !== 'game') { $('panel').hidden = true; $('idcard').hidden = true; }
  };

  // ---- キャンペーン ----
  UI.renderCampaign = function () {
    const list = $('mission-list');
    list.innerHTML = '';
    SN.MISSIONS.forEach((m, i) => {
      const unlocked = i === 0 || SN.progress.cleared[SN.MISSIONS[i - 1].id];
      const best = SN.progress.best[m.id];
      const b = document.createElement('button');
      b.className = 'm-card'; b.disabled = !unlocked;
      const lo = Math.max(100, Math.floor((m.D - 90) / 50) * 50);
      b.innerHTML = '<div class="m-top"><span class="m-no">任務 ' + (i + 1) + (m.kind === 'training' ? '・訓練' : '') + '</span>' + (best ? '<span class="tag ok">評価 ' + esc(best) + '</span>' : (unlocked ? '' : '<span class="tag">未解放</span>')) + '</div>' +
        '<h3>' + esc(m.name) + '</h3><p>' + esc(m.summary) + '</p>' +
        '<div class="m-meta"><span class="tag">' + (m.region === 'desert' ? '砂漠' : '山岳') + '</span><span class="tag">約' + lo + '〜' + (lo + 200) + 'm</span><span class="tag">標高' + m.wx.alt + 'm</span><span class="tag acc">推奨 ' + esc(SN.rifleById(m.rec).short) + '</span></div>';
      b.addEventListener('click', () => { if (unlocked) UI.openBrief(m); });
      list.appendChild(b);
    });
  };

  // ---- ブリーフィング ----
  UI.openBrief = function (m) {
    sel.mission = m; sel.pos = 0;
    const avail = m.rifles.filter(id => SN.progress.unlocked.includes(id));
    sel.rifle = avail.includes(m.rec) ? m.rec : avail[avail.length - 1];
    $('brief-title').textContent = m.name;
    $('brief-place').textContent = m.place;
    const lo = Math.max(100, Math.floor((m.D - 90) / 50) * 50);
    const wx = m.wx;
    const refs = [];
    const seen = {};
    for (const s of m.structures) {
      const sz = SN.SIZES[s.t]; if (!sz) continue;
      const key = s.trp ? s.trp : s.t;
      if (seen[key]) continue; seen[key] = 1;
      refs.push('<li>' + (s.trp ? '<b class="mono">' + s.trp + '</b> ' : '') + esc(sz.label) + '：' + esc(sz.text) + '</li>');
    }
    refs.push('<li>' + esc(SN.SIZES.person.label) + '：' + esc(SN.SIZES.person.text) + '</li>');
    const posHtml = m.positions.map((p, i) => '<label class="opt"><input type="radio" name="pos" value="' + i + '"' + (i === 0 ? ' checked' : '') + '><b>' + esc(p.name) + '</b><small>' + esc(p.desc) + '　隠れやすさ ' + '★'.repeat(Math.round(p.cover * 5)) + '☆'.repeat(5 - Math.round(p.cover * 5)) + '・砂ぼこり ' + (p.dust > 0.6 ? '多い' : p.dust > 0.3 ? 'ふつう' : '少ない') + '</small></label>').join('');
    const rifleHtml = SN.RIFLES.filter(r => m.rifles.includes(r.id)).map(r => {
      const ok = SN.progress.unlocked.includes(r.id);
      return '<label class="opt' + (ok ? '' : ' locked') + '"><input type="radio" name="rifle" value="' + r.id + '"' + (r.id === sel.rifle ? ' checked' : '') + (ok ? '' : ' disabled') + '><b>' + esc(r.name) + (r.id === m.rec ? ' <span class="tag acc">推奨</span>' : '') + (ok ? '' : ' <span class="tag">未解放</span>') + '</b><small>' + esc(r.ammo) + '・初速' + Math.round(r.mv) + 'm/s・G7 BC ' + r.bc.toFixed(3) + '・' + esc(r.barrel) + '<br>' + esc(r.note) + '</small></label>';
    }).join('');
    $('brief-body').innerHTML =
      '<div class="cols"><div><h4>状況</h4>' + m.brief.map(p => '<p>' + esc(p) + '</p>').join('') + '</div>' +
      '<div><h4>任務データ</h4><dl class="kv">' +
      '<dt>目標</dt><dd>' + esc(m.objective.text) + '</dd>' +
      '<dt>位置</dt><dd>北緯' + m.lat.toFixed(1) + '°</dd>' +
      '<dt>射撃方向</dt><dd>方位' + String(m.azimuth).padStart(3, '0') + '°（' + dirName(m.azimuth) + '）</dd>' +
      '<dt>推定距離</dt><dd>' + lo + '〜' + (lo + 200) + 'm（情報。要測距）</dd>' +
      '<dt>高低差</dt><dd>' + (m.elevDiff >= 0 ? '標的が約' + Math.round(m.elevDiff / 10) * 10 + 'm高い' : '標的が約' + Math.round(-m.elevDiff / 10) * 10 + 'm低い') + '</dd>' +
      '<dt>携行弾数</dt><dd>' + m.maxShots + '発</dd>' +
      '</dl><h4 style="margin-top:12px">気象予報</h4><dl class="kv">' +
      '<dt>標高</dt><dd>' + wx.alt + 'm</dd><dt>気温</dt><dd>' + wx.tempC + '℃前後</dd><dt>湿度</dt><dd>' + Math.round(wx.hum * 100) + '%</dd>' +
      '<dt>風</dt><dd>' + dirName(wx.windFrom) + 'の風 ' + Math.max(0.5, wx.wind - wx.gust).toFixed(0) + '〜' + (wx.wind + wx.gust).toFixed(0) + 'm/s</dd>' +
      '<dt>陽炎</dt><dd>' + (wx.mirage > 0.8 ? '強い' : wx.mirage > 0.4 ? 'ふつう' : '弱い') + '</dd></dl></div></div>' +
      '<div class="cols"><div><h4>既知の大きさ（ミル測距の参照）</h4><ul class="refs">' + refs.join('') + '</ul><p class="note">距離(m) ＝ 大きさ(m) × 1000 ÷ 見えたミル数</p></div>' +
      '<div><h4>射撃位置</h4><div class="choice" id="pos-choice">' + posHtml + '</div><div class="map-wrap" style="margin-top:8px"><canvas id="brief-map" width="640" height="360"></canvas></div></div></div>' +
      '<div><h4>銃</h4><div class="choice" id="rifle-choice">' + rifleHtml + '</div></div>';
    $('pos-choice').addEventListener('change', (e) => { sel.pos = +e.target.value; drawMap(m); updSel(); });
    $('rifle-choice').addEventListener('change', (e) => { sel.rifle = e.target.value; updSel(); });
    const updSel = () => { $('brief-sel').textContent = m.positions[sel.pos].name + '・' + SN.rifleById(sel.rifle).short; };
    updSel(); drawMap(m);
    UI.show('brief');
    $('scr-brief').scrollTop = 0;
  };

  // 射撃位置の見取り図（距離は書かない）
  function drawMap(m) {
    const c = $('brief-map'); if (!c) return;
    const g = c.getContext('2d'), W = c.width, H = c.height;
    g.fillStyle = m.region === 'desert' ? '#2a261c' : '#1d221a'; g.fillRect(0, 0, W, H);
    // 等高線風の模様
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 9; i++) { g.beginPath(); for (let x = 0; x <= W; x += 8) { const y = H * (i + 0.5) / 9 + Math.sin(x / 70 + i) * 14; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    const us = m.positions.map(p => p.u).concat([m.D]), vs = m.positions.map(p => p.v).concat([0]);
    const umin = Math.min(...us) - 120, umax = Math.max(...us) + 120, vmin = Math.min(...vs, -200) - 60, vmax = Math.max(...vs, 200) + 60;
    const sx = (W - 40) / (umax - umin), sy = (H - 40) / (vmax - vmin), s = Math.min(sx, sy);
    const X = (u) => 20 + (u - umin) * s, Y = (v) => H / 2 + v * s;
    m.positions.forEach((p, i) => {
      g.strokeStyle = i === sel.pos ? 'rgba(227,162,59,0.9)' : 'rgba(255,255,255,0.25)';
      g.setLineDash(i === sel.pos ? [] : [5, 5]); g.lineWidth = i === sel.pos ? 2 : 1;
      g.beginPath(); g.moveTo(X(p.u), Y(p.v)); g.lineTo(X(m.D), Y(0)); g.stroke();
    });
    g.setLineDash([]);
    m.positions.forEach((p, i) => {
      g.fillStyle = i === sel.pos ? '#e3a23b' : '#bdb9a8';
      g.beginPath(); g.moveTo(X(p.u) + 9, Y(p.v)); g.lineTo(X(p.u) - 6, Y(p.v) - 7); g.lineTo(X(p.u) - 6, Y(p.v) + 7); g.fill();
      g.font = '15px "Zen Kaku Gothic New", sans-serif'; g.fillText(p.name, X(p.u) - 8, Y(p.v) + (p.v >= 0 ? 24 : -14));
    });
    g.fillStyle = '#d9473b'; g.fillRect(X(m.D) - 8, Y(0) - 8, 16, 16);
    g.fillStyle = '#e7e4d8'; g.fillText('標的の拠点', X(m.D) - 30, Y(0) - 16);
    // 方位
    g.save(); g.translate(W - 34, 34);
    g.rotate(-m.azimuth * Math.PI / 180 + Math.PI / 2);
    g.strokeStyle = '#e7e4d8'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 14); g.lineTo(0, -14); g.stroke();
    g.fillStyle = '#e7e4d8'; g.beginPath(); g.moveTo(0, -18); g.lineTo(-5, -9); g.lineTo(5, -9); g.fill();
    g.restore(); g.fillStyle = '#e7e4d8'; g.font = '12px sans-serif'; g.fillText('北', W - 40, 66);
  }

  // ---- 出撃 ----
  UI.deploy = function () {
    const m = sel.mission;
    SN.audio.init(); SN.audio.setVolume(SN.settings.volume);
    $('loading').hidden = false;
    setTimeout(() => {
      try {
        if (SN.game) { SN.game.destroy(); SN.game = null; }
        UI.show('game');
        SN.initRenderer();
        SN.game = new SN.Game(m, sel.pos, sel.rifle);
        SN.game.lastBrief = { pos: sel.pos, rifle: sel.rifle };
        if (SN.settings.gyro) SN.game.enableGyro(true);
        SN.game.setMode('rifle');
      } catch (e) {
        console.error(e);
        UI.show('brief');
        alertBox('起動できませんでした', '<p>' + esc(e.message || e) + '</p><p class="note">WebGL が使えるブラウザで開いてください。</p>');
      } finally { $('loading').hidden = true; }
    }, 30);
  };

  // ---- ゲーム中の操作 ----
  function bindGameControls() {
    const view = $('view');
    const pts = new Map();
    let pinchD = 0, tapStart = null;
    view.addEventListener('pointerdown', (e) => {
      view.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); tapStart = null; }
    });
    view.addEventListener('pointermove', (e) => {
      const g = SN.game; if (!g || !pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      const cur = { x: e.clientX, y: e.clientY };
      pts.set(e.pointerId, cur);
      if (pts.size === 1) g.drag(cur.x - prev.x, cur.y - prev.y);
      else if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD > 0) g.pinch(d / pinchD); pinchD = d;
      }
    });
    const up = (e) => {
      const g = SN.game;
      if (tapStart && g && pts.size === 1) {
        const d = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
        if (d < 8 && performance.now() - tapStart.t < 350) g.tapIdentify(e.clientX, e.clientY);
      }
      pts.delete(e.pointerId); tapStart = null; pinchD = 0;
    };
    view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
    view.addEventListener('wheel', (e) => { if (SN.game) { e.preventDefault(); SN.game.pinch(e.deltaY < 0 ? 1.08 : 1 / 1.08); } }, { passive: false });

    for (const b of document.querySelectorAll('#mode-seg button')) b.addEventListener('click', () => SN.game && SN.game.setMode(b.dataset.mode));
    $('zoom-in').addEventListener('click', () => SN.game && SN.game.zoom(1));
    $('zoom-out').addEventListener('click', () => SN.game && SN.game.zoom(-1));
    $('btn-wind').addEventListener('click', () => SN.game && SN.game.askWind());
    // ターレット（押し続けると連続）
    for (const b of document.querySelectorAll('.t-btn')) {
      let timer = 0, rep = 0;
      const stop = () => { clearTimeout(timer); clearInterval(rep); };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); if (!SN.game) return;
        const t = b.dataset.t, d = +b.dataset.d;
        SN.game.turret(t, d);
        timer = setTimeout(() => { rep = setInterval(() => SN.game && SN.game.turret(t, d), 70); }, 380);
      });
      b.addEventListener('pointerup', stop); b.addEventListener('pointerleave', stop); b.addEventListener('pointercancel', stop);
    }
    // 数字をなぞってもダイヤルを回せる
    for (const [id, t, axis] of [['elev-val', 'e', 'y'], ['wind-val', 'w', 'x']]) {
      const el = $(id); let last = null, acc = 0;
      el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); last = e; acc = 0; });
      el.addEventListener('pointermove', (e) => {
        if (!last || !SN.game) return;
        acc += axis === 'y' ? (last.clientY - e.clientY) : (e.clientX - last.clientX); last = e;
        while (acc > 12) { SN.game.turret(t, 1); acc -= 12; }
        while (acc < -12) { SN.game.turret(t, -1); acc += 12; }
      });
      el.addEventListener('pointerup', () => { last = null; }); el.addEventListener('pointercancel', () => { last = null; });
    }
    const br = $('btn-breath');
    br.addEventListener('pointerdown', (e) => { e.preventDefault(); SN.game && SN.game.holdBreath(true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) br.addEventListener(ev, () => SN.game && SN.game.holdBreath(false));
    const tr = $('btn-trigger');
    tr.addEventListener('pointerdown', (e) => { e.preventDefault(); SN.audio.init(); SN.game && SN.game.pullTrigger(true); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) tr.addEventListener(ev, () => SN.game && SN.game.pullTrigger(false));
    $('btn-bolt').addEventListener('click', () => SN.game && SN.game.bolt());
    for (const b of document.querySelectorAll('.tool')) b.addEventListener('click', () => SN.game && UI.openPanel(b.dataset.panel));
    $('panel-close').addEventListener('click', UI.closePanel);
    $('panel').addEventListener('click', (e) => { if (e.target === $('panel')) UI.closePanel(); });
    // キーボード（パソコン用）
    const keys = {};
    window.addEventListener('keydown', (e) => {
      const g = SN.game; if (!g || $('scr-game').hidden || !$('panel').hidden) return;
      if (keys[e.code]) return; keys[e.code] = true;
      switch (e.code) {
        case 'Space': e.preventDefault(); g.pullTrigger(true); break;
        case 'ShiftLeft': case 'ShiftRight': g.holdBreath(true); break;
        case 'KeyW': g.turret('e', 1); break; case 'KeyS': g.turret('e', -1); break;
        case 'KeyA': g.turret('w', -1); break; case 'KeyD': g.turret('w', 1); break;
        case 'KeyR': g.bolt(); break;
        case 'Digit1': g.setMode('eye'); break; case 'Digit2': g.setMode('spot'); break; case 'Digit3': g.setMode('rifle'); break;
        case 'Equal': case 'NumpadAdd': g.zoom(1); break; case 'Minus': case 'NumpadSubtract': g.zoom(-1); break;
      }
    });
    window.addEventListener('keyup', (e) => {
      keys[e.code] = false; const g = SN.game; if (!g) return;
      if (e.code === 'Space') g.pullTrigger(false);
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') g.holdBreath(false);
    });
    setInterval(() => {
      const g = SN.game; if (!g || $('scr-game').hidden) return;
      const step = g.mode === 'eye' ? 6 : 1.5;
      if (keys.ArrowLeft) g.drag(-step, 0); if (keys.ArrowRight) g.drag(step, 0);
      if (keys.ArrowUp) g.drag(0, -step); if (keys.ArrowDown) g.drag(0, step);
    }, 16);
  }

  // ---- パネル ----
  let panelTimer = 0;
  UI.closePanel = function () {
    $('panel').hidden = true; clearInterval(panelTimer);
    if (SN.game && SN.game._pausedByPanel) { SN.game.paused = false; SN.game._pausedByPanel = false; SN.game.lastFrame = performance.now(); }
  };
  UI.openPanel = function (name) {
    const g = SN.game; if (!g) return;
    clearInterval(panelTimer);
    const body = $('panel-body');
    $('panel').hidden = false;
    if (name === 'dope') { $('panel-title').textContent = 'DOPEカード'; body.innerHTML = dopeHtml(g); }
    else if (name === 'range') { $('panel-title').textContent = 'レンジカード'; rangeCard(g, body); }
    else if (name === 'kestrel') {
      $('panel-title').textContent = '気象計'; g.check.wx = true;
      const upd = () => { body.innerHTML = kestrelHtml(g); };
      upd(); panelTimer = setInterval(upd, 600);
    } else if (name === 'task') { $('panel-title').textContent = '任務'; taskPanel(g, body); }
    else if (name === 'pause') {
      $('panel-title').textContent = '一時停止'; g.paused = true; g._pausedByPanel = true;
      body.innerHTML = '<p>時間は止まっています。DOPEカード・レンジカード・気象計を開いている間は時間が進みます（実戦と同じ）。</p><div class="panel-actions"><button class="btn primary" id="p-resume">再開</button><button class="btn" id="p-settings">設定</button><button class="btn" id="p-howto">遊び方</button><button class="btn" id="p-abort">任務をやめる</button></div>';
      $('p-resume').onclick = UI.closePanel;
      $('p-settings').onclick = () => UI.settings();
      $('p-howto').onclick = () => UI.howto();
      $('p-abort').onclick = () => { UI.closePanel(); g.destroy(); SN.game = null; UI.renderCampaign(); UI.show('campaign'); };
    }
  };

  function dopeHtml(g) {
    if (!g._dope) {
      const rf = g.rifle;
      const maxR = { r308: 1300, r300: 1700, r338: 2000, r50: 2400 }[rf.id];
      const ranges = []; for (let r = 100; r <= maxR; r += 50) ranges.push(r);
      const T = Math.round(g.m.wx.tempC / 5) * 5;
      const das = [0, 1000, 2000, 3000, 4000];
      const cols = das.map(da => B.dopeTable(rf, B.atmosphereForDA(da, T), ranges));
      g._dope = { T, das, cols, ranges };
    }
    const d = g._dope, rf = g.rifle;
    let rows = '';
    const ref = d.cols[2];
    for (let i = 0; i < d.ranges.length; i++) {
      const r0 = ref.rows[i]; if (!r0) break;
      const cls = r0.mach < 1.0 ? 'sub' : (r0.mach < 1.2 ? 'trans' : '');
      rows += '<tr class="' + cls + '"><td class="r">' + d.ranges[i] + '</td>' + d.cols.map(c => '<td>' + (c.rows[i] ? f1(c.rows[i].elev) : '—') + '</td>').join('') +
        '<td>' + r0.wind1.toFixed(2) + '</td><td>' + r0.spin.toFixed(2) + '</td><td>' + r0.tof.toFixed(2) + '</td></tr>';
    }
    return '<p class="note">' + esc(rf.name) + '・' + esc(rf.ammo) + '・初速 ' + Math.round(rf.mv) + 'm/s（15℃）・G7 BC ' + rf.bc.toFixed(3) + '・照準高 ' + (rf.sightH * 100).toFixed(1) + 'cm・' + rf.zeroRange + 'mゼロイン<br>' +
      'この表は装薬温度 ' + d.T + '℃ で作成。値はエレベーションの上方修正（MIL）。DA＝密度高度。</p>' +
      '<div class="tbl-wrap"><table class="dope"><thead><tr><th>距離<br>m</th>' + d.das.map(x => '<th>DA<br>' + x + '</th>').join('') + '<th>横風<br>1m/s</th><th>回転<br>右</th><th>飛行<br>秒</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<h4>読み方</h4><p class="note">気象計の密度高度に近い2列のあいだを読む。横風1m/sの列は、射線に直角な風1m/sで流される量。実際の横風の速さを掛けて、風上へ修正する。回転＝スピンドリフト（右へずれる量、DA2000基準）。黄色い行は音速に近く、赤い行は音速以下（弾道が不安定になりやすい）。</p>' +
      '<h4>傾斜の補正</h4><p class="note">撃ち上げ・撃ち下ろしでは「距離×cos(傾斜角)」の距離の値を読む。cos5°＝0.996・10°＝0.985・15°＝0.966・20°＝0.940・25°＝0.906・30°＝0.866</p>' +
      '<h4>この銃のメモ</h4><p class="note">冷えた銃身の初弾は 上' + rf.coldBore[0].toFixed(2) + '・' + (rf.coldBore[1] >= 0 ? '右' : '左') + Math.abs(rf.coldBore[1]).toFixed(2) + ' MIL ずれる。集弾性 約' + (rf.disp * 3 * 3.44).toFixed(1) + 'MOA。初速は気温1℃で約' + rf.mvTempCoef + 'm/s変わる。エレベーションの上限 ' + rf.maxElev + 'MIL（超える分はレティクルの目盛りでホールドする）。</p>';
  }

  function rangeCard(g, body) {
    const trps = g.m.structures.filter(s => s.trp && SN.SIZES[s.t]).map(s => ({ key: s.trp, label: s.trp + ' ' + SN.SIZES[s.t].label, size: SN.SIZES[s.t].h, sizeText: SN.SIZES[s.t].text }));
    trps.push({ key: 'T1', label: '標的（人）', size: SN.SIZES.person.h, sizeText: '身長 約1.7m' });
    trps.push({ key: 'T2', label: '標的（人・頭〜腰）', size: 0.85, sizeText: '頭から腰まで 約0.85m' });
    const rows = trps.map(t => {
      const v = g.rangeCard[t.key] || '';
      const r = v ? Math.round(t.size * 1000 / parseFloat(v)) : '';
      return '<div class="rc-row"><div><b>' + esc(t.label) + '</b><br><small class="dim">' + esc(t.sizeText) + '</small></div>' +
        '<input id="rc-' + t.key + '" type="number" inputmode="decimal" step="0.1" min="0.1" placeholder="MIL" value="' + esc(v) + '" data-k="' + t.key + '" data-s="' + t.size + '">' +
        '<div class="out" id="rco-' + t.key + '">' + (r ? r + 'm' : '—') + '</div><div class="dim" style="font-size:12px">' + (t.size + 'm') + '</div></div>';
    }).join('');
    body.innerHTML = '<p class="note">射撃位置「' + esc(g.pos.name) + '」から。観測スコープで参照物の高さが何MILに見えるか測り、入力する。距離 ＝ 大きさ(m) × 1000 ÷ MIL。</p>' +
      '<div class="rc-row rc-head"><div>参照物</div><div>測ったMIL</div><div style="text-align:right">距離</div><div>大きさ</div></div>' + rows;
    for (const inp of body.querySelectorAll('input')) {
      inp.addEventListener('input', () => {
        const k = inp.dataset.k, s = +inp.dataset.s, v = parseFloat(inp.value);
        g.rangeCard[k] = inp.value;
        $('rco-' + k).textContent = v > 0 ? Math.round(s * 1000 / v) + 'm' : '—';
        const filled = Object.keys(g.rangeCard).filter(x => parseFloat(g.rangeCard[x]) > 0);
        if (filled.filter(x => x[0] !== 'T').length >= 2) g.check.range = true;
        if (filled.some(x => x[0] === 'T') || filled.length >= 1) g.check.rng = true;
      });
    }
  }

  function kestrelHtml(g) {
    const w = g.world.wind.at(g.pos, g.gt);
    const sp = Math.hypot(w[0], w[2]) * (1 + (Math.random() - 0.5) * 0.06);
    let from = Math.atan2(-w[0], w[2]) * 180 / Math.PI; // 風が来る方位
    from = (from + 360) % 360;
    const da = g.atm.da;
    return '<div class="kest">' +
      '<div><small>気温</small><b>' + g.tempC.toFixed(1) + '℃</b></div>' +
      '<div><small>湿度</small><b>' + Math.round(g.m.wx.hum * 100) + '%</b></div>' +
      '<div><small>現地気圧</small><b>' + (g.pressurePa / 100).toFixed(1) + '</b><small>hPa</small></div>' +
      '<div><small>密度高度（DA）</small><b>' + Math.round(da) + 'm</b></div>' +
      '<div><small>風速（この場所）</small><b>' + sp.toFixed(1) + 'm/s</b></div>' +
      '<div><small>風向（風が来る方位）</small><b>' + String(Math.round(from)).padStart(3, '0') + '°</b><small>' + dirName(from) + '</small></div>' +
      '<div><small>射撃方向</small><b>' + String(g.m.azimuth).padStart(3, '0') + '°</b><small>' + dirName(g.m.azimuth) + '</small></div>' +
      '<div><small>銃身の傾き</small><b>' + (g.pitch * 180 / Math.PI).toFixed(1) + '°</b><small>傾斜計</small></div>' +
      '</div><p class="note" style="margin-top:10px">気象計で測れる風は、自分のいる場所の風だけ。途中と標的付近の風は、旗・草・砂ぼこり・陽炎を見て読む。射線に対して風が何度から吹いているかで、横風の割合が変わる（90°で100%、60°で約87%、45°で約71%、30°で50%）。</p>';
  }

  function taskPanel(g, body) {
    const c = g.check;
    const items = [['pos', '射撃位置につく'], ['range', 'レンジカードを作る（参照物2つ以上）'], ['wx', '気象を確認する'], ['pid', '標的を識別する（観測スコープでタップ）'], ['rng', '標的までの距離を測る'], ['dial', 'エレベーションを回す'], ['wind', '風を読む（ウィンデージ・観測手）'], ['shot', '射撃'], ['spot', '着弾を観測して修正'], ['exfil', '離脱']];
    const others = g.world.positions.map((p, i) => i === g.posIdx ? '' : '<button class="btn" data-mv="' + i + '">「' + esc(p.name) + '」へ移動</button>').join('');
    body.innerHTML = '<p><b>目標:</b> ' + esc(g.m.objective.text) + (g.objDone ? ' <span class="tag ok">達成</span>' : '') + '</p>' +
      '<p class="note">' + esc(g.m.brief[g.m.brief.length - 1]) + '</p>' +
      '<h4>手順</h4><ul class="check">' + items.map(([k, t]) => '<li class="' + (c[k] ? 'done' : '') + '">' + esc(t) + '</li>').join('') + '</ul>' +
      '<h4>行動</h4><div class="panel-actions">' + others + '<button class="btn ' + (g.objDone ? 'primary' : '') + '" id="t-exfil">' + (g.objDone ? '離脱する（任務完了）' : '離脱する（任務放棄）') + '</button></div>' +
      '<p class="note">移動には45〜75秒かかり、その間も敵は動く。移動すると発見度は下がる。</p>' +
      '<h4>観測手の記録</h4><div class="log">' + g.spotLog.slice().reverse().map(l => '<div><span class="mono">' + fmtT(l.t) + '</span> ' + esc(l.text) + '</div>').join('') + '</div>';
    for (const b of body.querySelectorAll('[data-mv]')) b.onclick = () => { UI.closePanel(); g.relocate(+b.dataset.mv); };
    $('t-exfil').onclick = () => { UI.closePanel(); g.exfil(); };
  }
  const fmtT = (t) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(Math.floor(t % 60)).padStart(2, '0');

  // ---- 人物の識別 ----
  UI.idCard = function (g, a) {
    const L = a.look;
    const head = { turban: 'ターバン', helmet: 'ヘルメット', cap: '帽子（ヘッドセット）', scarf: 'スカーフ', none: 'かぶりものなし' }[L.head];
    const item = { rifle: '小銃', radio: '無線機', none: '手ぶら' }[a.rifle === null && L.item === 'rifle' ? 'none' : L.item];
    const state = a.gone ? '見えない' : (!a.alive ? '倒れて動かない' : (a.down ? '倒れている（動いている）' : (a.pose === 'walk' ? '歩いている' : a.pose === 'run' ? '走っている' : a.pose === 'crouch' || a.pose === 'work' ? 'しゃがんでいる' : '立っている')));
    const cur = g.identified[a.id];
    const el = $('idcard');
    el.innerHTML = '<h5>観察した人物</h5><div>' + esc(SN.colorName(L.headColor || L.top)) + 'の' + esc(head) + '・' + esc(SN.colorName(L.top)) + 'の上着' + (L.vest ? '・' + esc(SN.colorName(L.vest)) + 'のベスト' : '') + (L.beard ? '・ひげ' : '') + '</div>' +
      '<div>持ち物: ' + esc(item) + '　状態: ' + esc(state) + '</div>' +
      '<div class="row"><button class="btn' + (cur === 'hvt' ? ' primary' : '') + '" data-id="hvt">標的と識別</button><button class="btn' + (cur === 'armed' ? ' primary' : '') + '" data-id="armed">武装した敵</button><button class="btn' + (cur === 'civ' ? ' primary' : '') + '" data-id="civ">民間人</button><button class="btn ghost" data-id="x">閉じる</button></div>';
    el.hidden = false;
    for (const b of el.querySelectorAll('button')) b.onclick = () => {
      if (b.dataset.id !== 'x') { g.identified[a.id] = b.dataset.id; if (b.dataset.id === 'hvt' || g.m.objective.ids.includes(a.id)) g.check.pid = true; }
      el.hidden = true;
    };
  };

  // ---- 結果 ----
  UI.debrief = function (g) {
    const m = g.m;
    const shots = g.shots;
    const hits = shots.filter(s => s.result && (s.result.kind === 'actor' || s.result.kind === 'plate' || (s.result.kind === 'engine'))).length;
    const procKeys = Object.keys(g.check), procDone = procKeys.filter(k => g.check[k]).length;
    const proc = procDone / procKeys.length;
    let grade = '—';
    if (g.success) {
      const need = m.objective.ids.length;
      const eff = need / Math.max(need, shots.length);
      const stealth = m.noAlert ? 1 : 1 - Math.min(1, g.detect / 100);
      const score = eff * 50 + stealth * 25 + proc * 25;
      grade = score >= 88 ? 'S' : score >= 74 ? 'A' : score >= 58 ? 'B' : 'C';
      SN.progress.cleared[m.id] = true;
      const prev = SN.progress.best[m.id];
      if (!prev || 'SABC'.indexOf(grade) < 'SABC'.indexOf(prev)) SN.progress.best[m.id] = grade;
      if (m.unlock && !SN.progress.unlocked.includes(m.unlock)) SN.progress.unlocked.push(m.unlock);
      SN.saveProgress();
    }
    $('deb-title').textContent = m.name + '・結果';
    const unlockMsg = g.success && m.unlock ? '<p><span class="tag acc">新しい銃</span> ' + esc(SN.rifleById(m.unlock).name) + ' が使えるようになった。</p>' : '';
    let html = '<div class="verdict"><div class="grade">' + (g.success ? grade : '×') + '</div><div><h3>' + (g.success ? '任務成功' : '任務失敗') + '</h3><p>' + esc(g.success ? m.objective.text + '：達成' : (g.failReason || '目標未達成')) + '</p></div></div>' + unlockMsg +
      '<div class="grid2"><dl class="kv"><dt>射撃</dt><dd>' + shots.length + '発（命中 ' + hits + '）</dd><dt>所要時間</dt><dd>' + fmtT(g.gt) + '</dd><dt>射撃位置の移動</dt><dd>' + g.relocations + '回</dd><dt>発見度</dt><dd>' + (m.noAlert ? '—' : Math.round(Math.min(100, g.detect)) + '%') + '</dd><dt>手順</dt><dd>' + procDone + '/' + procKeys.length + '</dd></dl>' +
      '<dl class="kv"><dt>実際の気温</dt><dd>' + g.tempC.toFixed(1) + '℃</dd><dt>密度高度</dt><dd>' + Math.round(g.atm.da) + 'm</dd><dt>実際の初速</dt><dd>' + g.mvNow.toFixed(1) + 'm/s</dd><dt>安定係数 Sg</dt><dd>' + g.sg.toFixed(2) + '</dd><dt>緯度</dt><dd>' + m.lat.toFixed(1) + '°</dd></dl></div>';
    shots.forEach((s, i) => {
      const r = s.result || { text: '着弾不明' };
      const ideal = idealSolution(g, s);
      html += '<div class="shot"><h4>' + (i + 1) + '発目・' + esc(s.pos) + (s.intended ? '・狙い: ' + esc(s.intended) : '') + '</h4>' +
        '<div class="' + (r.kind === 'actor' ? 'wound' : '') + '">' + esc(r.text || '') + '</div>' +
        '<div class="grid2"><dl class="kv">' +
        (s.range ? '<dt>着弾距離</dt><dd>' + Math.round(s.range) + 'm</dd>' : '') +
        (s.tof ? '<dt>飛行時間</dt><dd>' + s.tof.toFixed(2) + '秒</dd>' : '') +
        (s.vImpact ? '<dt>着弾速度</dt><dd>' + Math.round(s.vImpact) + 'm/s（マッハ' + s.mach.toFixed(2) + '）</dd><dt>残存エネルギー</dt><dd>' + Math.round(s.energy) + 'J</dd>' : '') +
        '<dt>ダイヤル</dt><dd>上' + f1(s.elev) + '・' + (s.wind === 0 ? '0.0' : (s.wind < 0 ? '左' : '右') + f1(Math.abs(s.wind))) + ' MIL</dd>' +
        '<dt>射撃時</dt><dd>' + (s.held ? '息止め' + s.heldFor.toFixed(1) + '秒' : '呼吸中') + '・心拍' + Math.round(s.hr) + (s.jerk > 0.3 ? '・ガク引き' : '') + '</dd>' +
        '<dt>傾斜</dt><dd>' + (s.incl >= 0 ? '+' : '') + s.incl.toFixed(1) + '°</dd>' +
        (s.missMil ? '<dt>外れ</dt><dd>' + (s.missMil.dx >= 0 ? '右' : '左') + f1(Math.abs(s.missMil.dx)) + '・' + (s.missMil.dy >= 0 ? '上' : '下') + f1(Math.abs(s.missMil.dy)) + ' MIL</dd>' : '') +
        '</dl><dl class="kv">' +
        '<dt>横風（手前/中間/奥）</dt><dd>' + s.windAtShot.map(w => (w.cross >= 0 ? '→' : '←') + Math.abs(w.cross).toFixed(1)).join(' / ') + ' m/s</dd>' +
        (ideal ? '<dt>正解のダイヤル</dt><dd>上' + f1(ideal.e) + '・' + (ideal.w < 0 ? '左' : '右') + f1(Math.abs(ideal.w)) + ' MIL</dd><dt>（内訳）風</dt><dd>' + (ideal.windOnly < 0 ? '左' : '右') + f1(Math.abs(ideal.windOnly)) + '</dd><dt>スピンドリフト</dt><dd>左' + f1(ideal.spin) + '</dd><dt>コリオリ</dt><dd>' + (ideal.corH < 0 ? '左' : '右') + Math.abs(ideal.corH).toFixed(2) + '・' + (ideal.corV < 0 ? '下' : '上') + Math.abs(ideal.corV).toFixed(2) + '</dd>' : '') +
        '</dl></div><canvas width="800" height="300" data-shot="' + i + '"></canvas></div>';
    });
    if (!shots.length) html += '<p class="dim">射撃なし。</p>';
    html += '<p class="note">「正解のダイヤル」は、撃った瞬間の実際の風・気温・気圧のもとで、狙っていた場所の中心に当たる修正量を後から計算した値。風は飛んでいる間も変わるので、目安として見ること。</p>';
    $('deb-body').innerHTML = html;
    for (const c of $('deb-body').querySelectorAll('canvas[data-shot]')) drawTrajectory(c, g, shots[+c.dataset.shot]);
    $('btn-retry').onclick = () => { UI.openBrief(m); };
    $('btn-next').onclick = () => { UI.renderCampaign(); UI.show('campaign'); };
    UI.show('debrief');
    $('scr-debrief').scrollTop = 0;
  };

  // 撃った瞬間の条件で、狙った点に当たるダイヤルを逆算する
  function idealSolution(g, s) {
    const ref = s.intendedRef; if (!ref) return null;
    let tgt = null;
    if (s.intendedPos) tgt = s.intendedPos.clone();
    else if (ref.ref && ref.ref.mesh) { tgt = new THREE.Vector3(); ref.ref.mesh.getWorldPosition(tgt); }
    else if (ref.ref && ref.ref.engineLocal) tgt = ref.ref.engineLocal.clone().applyMatrix4(ref.ref.group.matrixWorld);
    if (!tgt) return null;
    const pos = g.world.positions[s.posIdx];
    const eye = new THREE.Vector3(pos.x, pos.eye, pos.z);
    const d = tgt.clone().sub(eye); const yaw = Math.atan2(d.x, -d.z), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    const sim = (eMil, wMil, opt) => {
      const los = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      const right = new THREE.Vector3().crossVectors(los, new THREE.Vector3(0, 1, 0)).normalize();
      const upv = new THREE.Vector3().crossVectors(right, los).normalize();
      const bore = los.clone().addScaledVector(upv, Math.tan(g.zeroA + eMil * 0.001)).addScaledVector(right, Math.tan(wMil * 0.001)).normalize();
      const mz = eye.clone().addScaledVector(upv, -g.rifle.sightH);
      const b = { p: [mz.x, mz.y, mz.z], v: [bore.x * g.mvNow, bore.y * g.mvNow, bore.z * g.mvNow], t: 0 };
      const env = { rho: g.atm.rho, c: g.atm.c, bcSI: g.bcSI, windAt: opt.wind ? (p, tt) => g.world.wind.at(p, s.t + tt) : null, omega: opt.cor ? g.omega : null };
      const dist = d.length();
      let prev = null;
      while (b.t < 10) {
        prev = [b.p[0], b.p[1], b.p[2]];
        B.step(b, 0.001, env);
        const along = (b.p[0] - eye.x) * los.x + (b.p[1] - eye.y) * los.y + (b.p[2] - eye.z) * los.z;
        if (along >= dist) break;
      }
      const sd = opt.spin ? B.spinDrift(g.sg, b.t) : 0;
      const hr = new THREE.Vector3(right.x, 0, right.z).normalize();
      const p = new THREE.Vector3(b.p[0] + hr.x * sd, b.p[1], b.p[2] + hr.z * sd);
      const rel = p.sub(eye);
      return { x: rel.dot(right) / dist * 1000, y: rel.dot(upv) / dist * 1000 };
    };
    const solve = (opt) => {
      let e = 0, w = 0;
      for (let k = 0; k < 6; k++) { const r = sim(e, w, opt); e -= r.y; w -= r.x; if (Math.abs(r.x) + Math.abs(r.y) < 0.005) break; }
      return { e, w };
    };
    try {
      const full = solve({ wind: true, cor: true, spin: true });
      const noWind = solve({ wind: false, cor: true, spin: true });
      const noSpin = solve({ wind: false, cor: true, spin: false });
      const noCor = solve({ wind: false, cor: false, spin: false });
      return { e: full.e, w: full.w, windOnly: full.w - noWind.w, spin: noSpin.w - noWind.w, corH: noSpin.w - noCor.w, corV: noSpin.e - noCor.e };
    } catch (e) { return null; }
  }

  function drawTrajectory(c, g, s) {
    const ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.fillStyle = '#0e100c'; ctx.fillRect(0, 0, W, H);
    const tr = s.trail; if (!tr || tr.length < 2) return;
    const pos = g.world.positions[s.posIdx];
    const eye = new THREE.Vector3(pos.x, pos.eye, pos.z);
    const los = new THREE.Vector3(Math.sin(s.losYaw) * Math.cos(s.losPitch), Math.sin(s.losPitch), -Math.cos(s.losYaw) * Math.cos(s.losPitch));
    const right = new THREE.Vector3().crossVectors(los, new THREE.Vector3(0, 1, 0)).normalize();
    const upv = new THREE.Vector3().crossVectors(right, los).normalize();
    const pts = tr.map(p => { const v = new THREE.Vector3(p[1], p[2], p[3]).sub(eye); return { x: v.dot(los), up: v.dot(upv), side: v.dot(right) }; });
    if (s.point) { const v = s.point.clone().sub(eye); pts.push({ x: v.dot(los), up: v.dot(upv), side: v.dot(right) }); }
    const maxX = Math.max(...pts.map(p => p.x), 100);
    const ups = pts.map(p => p.up), sides = pts.map(p => p.side);
    const pad = 46, h2 = (H - 30) / 2;
    const panel = (y0, vals, label, unitLabel) => {
      const vmin = Math.min(0, ...vals), vmax = Math.max(0.5, ...vals);
      const X = (x) => pad + x / maxX * (W - pad - 14), Y = (v) => y0 + 10 + (vmax - v) / (vmax - vmin || 1) * (h2 - 26);
      ctx.strokeStyle = '#2b2f26'; ctx.lineWidth = 1;
      for (let d = 0; d <= maxX; d += maxX > 1200 ? 500 : 200) { ctx.beginPath(); ctx.moveTo(X(d), y0 + 8); ctx.lineTo(X(d), y0 + h2 - 14); ctx.stroke(); ctx.fillStyle = '#9c9a8c'; ctx.font = '11px "Share Tech Mono", monospace'; ctx.fillText(d + 'm', X(d) - 10, y0 + h2 - 2); }
      ctx.strokeStyle = '#e3a23b55'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(maxX), Y(0)); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = '#e7e4d8'; ctx.lineWidth = 2; ctx.beginPath();
      pts.forEach((p, i) => { const v = vals[i]; i ? ctx.lineTo(X(p.x), Y(v)) : ctx.moveTo(X(p.x), Y(v)); }); ctx.stroke();
      ctx.fillStyle = '#e3a23b'; ctx.font = '12px "Zen Kaku Gothic New", sans-serif'; ctx.fillText(label, pad, y0 + 12);
      ctx.fillStyle = '#9c9a8c'; ctx.font = '11px "Share Tech Mono", monospace';
      ctx.fillText(vmax.toFixed(1) + unitLabel, 2, Y(vmax) + 4); ctx.fillText(vmin.toFixed(1) + unitLabel, 2, Y(vmin) + 4);
    };
    panel(0, ups, '横から見た弾道（照準線＝点線からの高さ）', 'm');
    panel(h2 + 15, sides, '上から見た弾道（照準線からの横ずれ、右が＋）', 'm');
  }

  // ---- 遊び方・設定 ----
  UI.modal = function (title, html) { $('modal-title').textContent = title; $('modal-body').innerHTML = html; $('modal').hidden = false; };
  function alertBox(t, h) { UI.modal(t, h); }
  UI.howto = function () {
    UI.modal('遊び方と手順',
      '<h4>狙撃の手順</h4><ol>' +
      '<li><b>レンジカード</b>：観測スコープ（三脚つき・揺れない）で、参照物（TRP）の高さが何MILに見えるか測る。距離＝大きさ(m)×1000÷MIL。</li>' +
      '<li><b>気象</b>：気象計で気温・気圧・密度高度（DA）・手元の風を見る。</li>' +
      '<li><b>識別</b>：観測スコープで人物をタップして特徴を確かめる。民間人を撃つと任務失敗。</li>' +
      '<li><b>DOPE</b>：DOPEカードで、距離と密度高度からエレベーション（上下の修正）を読む。撃ち上げ・撃ち下ろしは cos で距離を縮める。</li>' +
      '<li><b>風</b>：旗・草・砂ぼこり・陽炎（スコープの中の揺らぎ）の流れる向きと速さで横風を読む。「横風1m/s」の値×風速で修正量を出す。ウィンデージで回すか、レティクルの目盛りでホールドする。</li>' +
      '<li><b>射撃</b>：照準スコープで「息止め」を押したまま、「引き金」を押し続ける。いつ弾が出るか分からないくらいゆっくり絞ると、ブレが出ない。引いている間に指で照準を動かすとガク引きになる。</li>' +
      '<li><b>観測と修正</b>：観測手が着弾を教えてくれる。「修正、上0.3、右0.5」ならその通りダイヤルを回す。</li>' +
      '<li><b>次弾</b>：「ボルト」で次の弾を込める。撃つたびに警戒度と発見度が上がる。発見されたら移動か離脱。</li></ol>' +
      '<h4>操作</h4><p>画面をドラッグで照準、2本指で拡大縮小。左の切り替えで 肉眼／観測スコープ／照準スコープ。右のダイヤルは1回押すと0.1MIL（1クリック）、押し続けると連続、数字をなぞっても回せる。設定でジャイロ（スマホを傾けて照準）をオンにできる。</p>' +
      '<p class="note">パソコン: ドラッグか矢印キーで照準、スペース＝引き金、Shift＝息止め、W/S＝エレベーション、A/D＝ウィンデージ、R＝ボルト、1/2/3＝視点、+/-＝倍率。</p>' +
      '<h4>用語</h4><dl class="kv">' +
      '<dt>MIL</dt><dd>角度の単位。1000m先で1m、500m先で0.5mの大きさ。</dd>' +
      '<dt>DOPE</dt><dd>距離ごとの照準修正量を書いた表。</dd>' +
      '<dt>密度高度</dt><dd>空気の濃さを「標準大気なら何mの高さと同じか」で表した値。高いほど空気が薄く、弾は落ちにくい。</dd>' +
      '<dt>ゼロイン</dt><dd>照準と弾が一致する距離（この銃は100m）。</dd>' +
      '<dt>スピンドリフト</dt><dd>弾の回転のせいで右へずれていく現象。遠いほど大きい。</dd>' +
      '<dt>コリオリ</dt><dd>地球の自転による弾道のずれ。1500mを超えると無視できない。</dd>' +
      '<dt>陽炎</dt><dd>地面の熱で空気が揺らいで見える現象。風下へ流れて見えるので風の目安になる。</dd>' +
      '<dt>リード</dt><dd>動く標的の「弾が届くまでに進む分」だけ先を狙うこと。</dd>' +
      '<dt>遷音速</dt><dd>弾が音速付近まで遅くなる領域。空気抵抗が急に変わり、ばらつきが大きくなる。</dd></dl>');
  };
  UI.settings = function () {
    const s = SN.settings;
    UI.modal('設定',
      '<div class="choice">' +
      '<label class="opt"><input type="checkbox" id="s-gyro"' + (s.gyro ? ' checked' : '') + '><b>ジャイロ照準</b><small>スマホを傾けて照準を微調整する。iPhone では許可を求められる。claude.ai のページ内では使えないことがある。</small></label>' +
      '<label class="opt"><span></span><b>ジャイロの感度 <span class="mono" id="s-gs-v">' + s.gyroSens.toFixed(2) + '</span></b><input type="range" id="s-gs" min="0.05" max="1" step="0.05" value="' + s.gyroSens + '" style="grid-column:2"></label>' +
      '<label class="opt"><span></span><b>ドラッグの感度 <span class="mono" id="s-ds-v">' + s.dragSens.toFixed(2) + '</span></b><input type="range" id="s-ds" min="0.2" max="1.5" step="0.05" value="' + s.dragSens + '" style="grid-column:2"></label>' +
      '<label class="opt"><span></span><b>音量 <span class="mono" id="s-vol-v">' + Math.round(s.volume * 100) + '</span></b><input type="range" id="s-vol" min="0" max="1" step="0.05" value="' + s.volume + '" style="grid-column:2"></label>' +
      '<label class="opt"><input type="checkbox" id="s-illum"' + (s.illum ? ' checked' : '') + '><b>レティクル中心の照明</b><small>中心に赤い点を出す。</small></label>' +
      '<label class="opt"><input type="checkbox" id="s-hints"' + (s.hints ? ' checked' : '') + '><b>操作のヒント</b><small>画面下に短い案内を出す。</small></label>' +
      '<label class="opt"><input type="checkbox" id="s-low"' + (s.quality === 'low' ? ' checked' : '') + '><b>軽量モード</b><small>動きが重いときにオン。次の任務から反映。</small></label>' +
      '</div><p class="note" id="s-msg"></p>');
    const save = () => { SN.saveSettings(); if (SN.game) SN.game.reticleDirty = true; };
    $('s-gyro').onchange = async (e) => {
      const on = e.target.checked;
      if (on && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { const r = await DeviceMotionEvent.requestPermission(); if (r !== 'granted') { e.target.checked = false; $('s-msg').textContent = 'ジャイロの許可が得られなかった。'; return; } }
        catch (err) { e.target.checked = false; $('s-msg').textContent = 'このページではジャイロを使えない。'; return; }
      }
      s.gyro = on; save();
      if (SN.game) SN.game.enableGyro(on);
      if (on) {
        let got = false; const h = () => { got = true; };
        window.addEventListener('devicemotion', h, { once: true });
        setTimeout(() => { if (!got) $('s-msg').textContent = 'ジャイロの値が届いていない。この端末かページでは使えない可能性がある。'; }, 1500);
      }
    };
    $('s-gs').oninput = (e) => { s.gyroSens = +e.target.value; $('s-gs-v').textContent = s.gyroSens.toFixed(2); save(); };
    $('s-ds').oninput = (e) => { s.dragSens = +e.target.value; $('s-ds-v').textContent = s.dragSens.toFixed(2); save(); };
    $('s-vol').oninput = (e) => { s.volume = +e.target.value; $('s-vol-v').textContent = Math.round(s.volume * 100); SN.audio.setVolume(s.volume); save(); };
    $('s-illum').onchange = (e) => { s.illum = e.target.checked; save(); };
    $('s-hints').onchange = (e) => { s.hints = e.target.checked; save(); };
    $('s-low').onchange = (e) => { s.quality = e.target.checked ? 'low' : 'high'; save(); };
  };

  // ---- 起動 ----
  function init() {
    for (const b of document.querySelectorAll('[data-go]')) b.addEventListener('click', () => { if (b.dataset.go === 'campaign') UI.renderCampaign(); UI.show(b.dataset.go); });
    $('btn-campaign').onclick = () => { SN.audio.init(); UI.renderCampaign(); UI.show('campaign'); };
    $('btn-howto').onclick = UI.howto;
    $('btn-settings-t').onclick = UI.settings;
    $('btn-deploy').onclick = UI.deploy;
    $('modal-close').onclick = () => { $('modal').hidden = true; };
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').hidden = true; });
    bindGameControls();
    document.addEventListener('visibilitychange', () => { if (document.hidden && SN.game && !SN.game.ended && !$('scr-game').hidden) UI.openPanel('pause'); });
    UI.show('title');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
