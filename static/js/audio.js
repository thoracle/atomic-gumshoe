// Tiny synthesized sound kit (WebAudio) plus streamed race music.
const MUSIC_VOL = 0.38;
export class Sfx {
  constructor(musicUrls) {
    this.ctx = null;
    this.muted = false;
    // race music streams from <audio> elements (no big decode in memory) routed through
    // WebAudio so the mute key and volume work on iOS, where element.volume is read-only.
    // One track per lap, each a faster take of the same tune.
    this.tracks = musicUrls.map((url) => {
      const el = new Audio(url);
      el.loop = true;
      el.preload = 'auto';
      const t = { el, ok: true, g: null };
      el.addEventListener('error', () => { t.ok = false; }); // missing file: skip it
      return t;
    });
    this.cur = null;
    this.musicWanted = false;
    // don't keep playing behind another app or tab; pick up again on return
    document.addEventListener('visibilitychange', () => {
      if (!this.cur) return;
      if (document.hidden) this.cur.el.pause();
      else if (this.musicWanted) this.cur.el.play().catch(() => {});
    });
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain();
    this.master.gain.value = 0.45;
    // gentle limiter so the louder laser stacked on the boom doesn't clip
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp).connect(c.destination);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // engine: two detuned oscillators through a lowpass
    this.engF = c.createBiquadFilter();
    this.engF.type = 'lowpass';
    this.engF.frequency.value = 400;
    this.engG = c.createGain();
    this.engG.gain.value = 0;
    this.eng1 = c.createOscillator(); this.eng1.type = 'sawtooth';
    this.eng2 = c.createOscillator(); this.eng2.type = 'square';
    this.eng1.connect(this.engF); this.eng2.connect(this.engF);
    this.engF.connect(this.engG).connect(this.master);
    this.eng1.start(); this.eng2.start();

    // jet hiss
    this.hiss = c.createBufferSource();
    this.hiss.buffer = this.noiseBuf; this.hiss.loop = true;
    this.hissF = c.createBiquadFilter(); this.hissF.type = 'bandpass'; this.hissF.frequency.value = 1800; this.hissF.Q.value = 0.7;
    this.hissG = c.createGain(); this.hissG.gain.value = 0;
    this.hiss.connect(this.hissF).connect(this.hissG).connect(this.master);
    this.hiss.start();

    // saucer theremin-ish hum
    this.hum = c.createOscillator(); this.hum.type = 'sine'; this.hum.frequency.value = 220;
    this.lfo = c.createOscillator(); this.lfo.frequency.value = 5.5;
    const lfoG = c.createGain(); lfoG.gain.value = 14;
    this.lfo.connect(lfoG).connect(this.hum.frequency);
    this.humG = c.createGain(); this.humG.gain.value = 0;
    this.hum.connect(this.humG).connect(this.master);
    this.hum.start(); this.lfo.start();

    for (const t of this.tracks) {
      t.g = c.createGain();
      t.g.gain.value = 0;
      c.createMediaElementSource(t.el).connect(t.g).connect(this.master);
    }

    // drift: narrow-band hiss plus a warbling squeal whose pitch steps up with the charge
    this.dHiss = c.createBufferSource();
    this.dHiss.buffer = this.noiseBuf; this.dHiss.loop = true;
    const dHF = c.createBiquadFilter(); dHF.type = 'bandpass'; dHF.frequency.value = 2600; dHF.Q.value = 5;
    this.dHissG = c.createGain(); this.dHissG.gain.value = 0;
    this.dHiss.connect(dHF).connect(this.dHissG).connect(this.master);
    this.dHiss.start();
    this.squeal = c.createOscillator(); this.squeal.type = 'triangle'; this.squeal.frequency.value = 1050;
    const sqLfo = c.createOscillator(); sqLfo.frequency.value = 11;
    const sqLfoG = c.createGain(); sqLfoG.gain.value = 30;
    sqLfo.connect(sqLfoG).connect(this.squeal.frequency);
    const sqF = c.createBiquadFilter(); sqF.type = 'bandpass'; sqF.frequency.value = 1400; sqF.Q.value = 2;
    this.squealG = c.createGain(); this.squealG.gain.value = 0;
    this.squeal.connect(sqF).connect(this.squealG).connect(this.master);
    this.squeal.start(); sqLfo.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.45;
    return this.muted;
  }

  engine(speed, throttle, boost, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = Math.abs(speed);
    this.eng1.frequency.setTargetAtTime(38 + s * 1.5, t, 0.06);
    this.eng2.frequency.setTargetAtTime(19 + s * 0.76, t, 0.06);
    this.engF.frequency.setTargetAtTime(260 + s * 10 + throttle * 500, t, 0.08);
    this.engG.gain.setTargetAtTime(on ? 0.05 + throttle * 0.04 : 0, t, 0.1);
    this.hissG.gain.setTargetAtTime(on ? (boost ? 0.18 : 0.015 + s * 0.0006) : 0, t, 0.1);
    this.hissF.frequency.setTargetAtTime(boost ? 2600 : 1600, t, 0.1);
  }

  // call from inside a tap: iOS only lets a media element play later if it was started by a gesture
  primeMusic() {
    for (const t of this.tracks) {
      if (!t.ok || !t.el.paused) continue;
      t.el.play().then(() => { if (t !== this.cur || !this.musicWanted) t.el.pause(); }).catch(() => {});
    }
  }

  fadeTrack(t, to, secs) {
    const now = this.ctx.currentTime;
    t.g.gain.cancelScheduledValues(now);
    t.g.gain.setValueAtTime(t.g.gain.value, now);
    t.g.gain.linearRampToValueAtTime(to, now + secs);
  }

  // switch to the track for `level` (0-based lap), starting `at` seconds in
  playTrack(level, at) {
    let k = Math.min(level, this.tracks.length - 1);
    while (k > 0 && !this.tracks[k].ok) k--;
    const t = this.tracks[k];
    if (!t || !t.ok || !t.g || t === this.cur) return;
    const old = this.cur;
    this.cur = t;
    clearTimeout(t.stopTimer);
    try { t.el.currentTime = at; } catch { /* metadata not loaded yet: start from the top */ }
    t.el.play().catch(() => {});
    this.fadeTrack(t, MUSIC_VOL, old ? 0.5 : 0.6);
    if (old) {
      this.fadeTrack(old, 0, 0.5);
      old.stopTimer = setTimeout(() => { if (old !== this.cur) old.el.pause(); }, 1200);
    }
  }

  music(on) {
    if (!this.ctx) return;
    this.musicWanted = on;
    if (on) {
      if (this.cur) { this.fadeTrack(this.cur, 0, 0.05); this.cur.el.pause(); this.cur = null; }
      this.playTrack(0, 0);
    } else if (this.cur) {
      const t = this.cur;
      this.fadeTrack(t, 0, 1.2);
      t.stopTimer = setTimeout(() => { if (!this.musicWanted) t.el.pause(); }, 2500);
    }
  }

  // new lap: crossfade to the faster take at the same point in the tune
  musicLevel(level) {
    if (!this.ctx || !this.musicWanted || !this.cur) return;
    const a = this.cur.el;
    const frac = a.duration > 0 ? (a.currentTime % a.duration) / a.duration : 0;
    let k = Math.min(level, this.tracks.length - 1);
    while (k > 0 && !this.tracks[k].ok) k--;
    const b = this.tracks[k] && this.tracks[k].el;
    if (!b || this.tracks[k] === this.cur) return;
    this.playTrack(level, b.duration > 0 ? frac * b.duration : 0);
  }

  drift(amount, tier) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.dHissG.gain.setTargetAtTime(amount * 0.06, t, amount ? 0.04 : 0.08);
    this.squealG.gain.setTargetAtTime(amount * 0.016, t, amount ? 0.04 : 0.08);
    this.squeal.frequency.setTargetAtTime([1050, 1250, 1500][tier] + amount * 80, t, 0.05);
  }

  ufo(dist, charge) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = Math.max(0, 1 - dist / 160) * 0.05;
    this.humG.gain.setTargetAtTime(v, t, 0.2);
    this.hum.frequency.setTargetAtTime(220 + charge * 500, t, 0.05);
  }

  tone(type, f0, f1, dur, vol = 0.2, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol, freq, q = 0.8, delay = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(80, t + dur); f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  laser() {
    this.tone('square', 1400, 120, 0.5, 0.26); this.tone('sawtooth', 900, 60, 0.55, 0.18);
    this.tone('sawtooth', 2200, 300, 0.25, 0.08); this.noise(0.35, 0.3, 7000, 2); // bright zap + crackle on top
  }
  boom() { this.noise(1.1, 0.7, 1800); this.tone('sine', 120, 30, 0.8, 0.4); }
  charge() { this.tone('sine', 300, 1200, 1.0, 0.09); }
  thud() { this.noise(0.25, 0.4, 600); }
  scrape() { this.noise(0.18, 0.15, 3000, 4); }
  pickup() { [0, 0.07, 0.14].forEach((d, i) => this.tone('triangle', 520 * (1 + i * 0.26), 540 * (1 + i * 0.26), 0.12, 0.15, d)); }
  shield() { this.tone('sine', 200, 900, 0.35, 0.15); this.tone('triangle', 400, 1800, 0.35, 0.06); }
  deflect() { this.tone('triangle', 1800, 600, 0.3, 0.15); this.noise(0.2, 0.2, 5000, 3); }
  beep(hi) { this.tone('square', hi ? 880 : 440, hi ? 880 : 440, hi ? 0.5 : 0.22, 0.12); }
  driftTier(tier) { this.tone('triangle', tier > 1 ? 1320 : 990, tier > 1 ? 1760 : 1320, 0.12, 0.05); }
  miniBoost(tier) { this.tone('sawtooth', 160, tier > 1 ? 1100 : 760, 0.35, 0.08); this.noise(0.45, tier > 1 ? 0.35 : 0.22, 5000, 1); }
  lap() { [0, 0.1, 0.2, 0.3].forEach((d, i) => this.tone('square', 440 * Math.pow(1.26, i), 440 * Math.pow(1.26, i), 0.1, 0.08, d)); }
}
