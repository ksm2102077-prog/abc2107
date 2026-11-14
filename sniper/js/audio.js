// 効果音（WebAudio で合成。音声ファイルは使わない）
(function (root) {
  'use strict';
  const SN = root.SN = root.SN || {};

  class Audio {
    constructor() { this.ctx = null; this.vol = 0.8; this.windGain = null; this.noiseBuf = null; }
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // 残響（山や砂漠での反響）
      this.verb = this.ctx.createConvolver();
      const ir = this.ctx.createBuffer(2, this.ctx.sampleRate * 3, this.ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c);
        for (let i = 0; i < ch.length; i++) { const t = i / this.ctx.sampleRate; ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / 3, 3) * (t < 0.04 ? 0 : 1) * 0.5; }
      }
      this.verb.buffer = ir;
      this.verbGain = this.ctx.createGain(); this.verbGain.gain.value = 0.35;
      this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
      // 風の音
      const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.6;
      this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0;
      this.windFilter = f;
      src.connect(f); f.connect(this.windGain); this.windGain.connect(this.master); src.start();
    }
    setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
    now() { return this.ctx ? this.ctx.currentTime : 0; }

    noise(t0, dur, freq, q, gain, type, toVerb, decay) {
      const c = this.ctx; if (!c) return;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq; f.Q.value = q || 0.7;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * (decay || 1));
      s.connect(f); f.connect(g); g.connect(this.master); if (toVerb) g.connect(this.verb);
      s.start(t0, Math.random() * 1.5, dur + 0.1);
    }
    tone(t0, freq, dur, gain, type, slide) {
      const c = this.ctx; if (!c) return;
      const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
    }

    shot(loud) {
      if (!this.ctx) return; const t = this.now(); const L = Math.min(1.6, 0.7 + loud * 0.35);
      this.noise(t, 0.35, 2500, 0.5, 1.0 * L, 'lowpass', true);
      this.noise(t, 0.9, 400, 0.8, 0.9 * L, 'lowpass', true);
      this.tone(t, 70, 0.4, 0.8 * L, 'sine', 35);
      // 遠くの斜面からの反響
      this.noise(t + 0.9 + Math.random() * 0.6, 0.9, 600, 0.6, 0.12 * L, 'lowpass', false, 1);
      this.noise(t + 2.1 + Math.random(), 1.2, 400, 0.6, 0.07 * L, 'lowpass', false, 1);
    }
    bolt() {
      if (!this.ctx) return; const t = this.now();
      this.noise(t, 0.05, 3000, 2, 0.3, 'bandpass'); this.noise(t + 0.18, 0.06, 2200, 2, 0.35, 'bandpass');
      this.noise(t + 0.42, 0.05, 2600, 2, 0.3, 'bandpass'); this.noise(t + 0.55, 0.07, 1800, 2, 0.4, 'bandpass');
    }
    click() { if (!this.ctx) return; this.noise(this.now(), 0.015, 4000, 3, 0.18, 'bandpass'); }
    // 着弾音（遅れて届く）
    hitSteel(delay) { if (!this.ctx) return; const t = this.now() + delay; this.tone(t, 1850, 0.5, 0.18, 'triangle'); this.tone(t, 2620, 0.35, 0.08, 'sine'); }
    hitBody(delay) { if (!this.ctx) return; const t = this.now() + delay; this.noise(t, 0.12, 300, 1, 0.22, 'lowpass'); this.tone(t, 90, 0.12, 0.15); }
    hitDirt(delay) { if (!this.ctx) return; const t = this.now() + delay; this.noise(t, 0.15, 500, 0.8, 0.07, 'lowpass'); }
    hitMetal(delay) { if (!this.ctx) return; const t = this.now() + delay; this.tone(t, 900, 0.25, 0.1, 'square', 600); this.noise(t, 0.1, 2000, 1, 0.08, 'bandpass'); }
    // 超音速の弾が近くを通る音
    crack() { if (!this.ctx) return; const t = this.now(); this.noise(t, 0.05, 3500, 0.8, 0.6, 'highpass'); }
    distantShot(delay) { if (!this.ctx) return; const t = this.now() + delay; this.noise(t, 0.4, 500, 0.7, 0.12, 'lowpass', true); }
    heart(strength) { if (!this.ctx) return; const t = this.now(); this.tone(t, 52, 0.11, 0.25 * strength); this.tone(t + 0.16, 48, 0.1, 0.17 * strength); }
    breathIn() { if (!this.ctx) return; this.noise(this.now(), 0.6, 900, 0.8, 0.05, 'bandpass', false, 1); }
    breathOut() { if (!this.ctx) return; this.noise(this.now(), 0.9, 700, 0.8, 0.07, 'bandpass', false, 1); }
    radio() { if (!this.ctx) return; const t = this.now(); this.noise(t, 0.08, 2500, 1, 0.06, 'bandpass'); this.tone(t + 0.02, 1200, 0.05, 0.03, 'square'); }
    setWind(speed) {
      if (!this.windGain) return;
      const g = Math.min(0.22, 0.012 * speed * speed / 2);
      this.windGain.gain.setTargetAtTime(g, this.now(), 0.3);
      this.windFilter.frequency.setTargetAtTime(250 + speed * 60, this.now(), 0.3);
    }
  }
  SN.audio = new Audio();
})(typeof window !== 'undefined' ? window : globalThis);
