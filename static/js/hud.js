// DOM + canvas HUD: chrome speedometer, rotating minimap, health, shield, messages.

const $ = (id) => document.getElementById(id);

function hiDPI(canvas, size) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = size * dpr;
  return dpr;
}

function chromeRing(x, cx, cy, r, w) {
  const g = x.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#8b9299'); g.addColorStop(0.55, '#f4f6f8'); g.addColorStop(1, '#565c63');
  x.fillStyle = g;
  x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.arc(cx, cy, r - w, 0, Math.PI * 2, true); x.fill();
}

class Speedo {
  constructor(canvas) {
    this.c = canvas;
    this.S = 220;
    this.dpr = hiDPI(canvas, this.S);
    this.x = canvas.getContext('2d');
    this.face = document.createElement('canvas');
    hiDPI(this.face, this.S);
    const f = this.face.getContext('2d');
    f.scale(this.dpr, this.dpr);
    this.drawFace(f);
  }

  ang(v) { return ((135 + (Math.min(Math.max(v, 0), 160) / 160) * 270) * Math.PI) / 180; }

  drawFace(x) {
    const S = this.S, c = S / 2;
    chromeRing(x, c, c, c - 2, 13);
    x.fillStyle = '#1b2228';
    x.beginPath(); x.arc(c, c, c - 15, 0, Math.PI * 2); x.fill();
    const g = x.createRadialGradient(c, c - 25, 10, c, c, c - 18);
    g.addColorStop(0, '#fdfcf6'); g.addColorStop(1, '#cbc6b9');
    x.fillStyle = g;
    x.beginPath(); x.arc(c, c, c - 19, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#c8322a'; x.lineWidth = 7;
    x.beginPath(); x.arc(c, c, c - 27, this.ang(130), this.ang(160)); x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let v = 0; v <= 160; v += 5) {
      const a = this.ang(v), big = v % 20 === 0, mid = v % 10 === 0;
      const r1 = c - 22, r2 = r1 - (big ? 14 : mid ? 9 : 5);
      x.strokeStyle = '#1b2228'; x.lineWidth = big ? 3 : 1.4;
      x.beginPath(); x.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); x.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2); x.stroke();
      if (big) {
        x.fillStyle = '#1b2228'; x.font = 'bold 15px "Share Tech Mono", monospace';
        const r3 = r2 - 13;
        x.fillText(String(v), c + Math.cos(a) * r3, c + Math.sin(a) * r3);
      }
    }
    x.fillStyle = '#5a544c'; x.font = '11px Bungee, sans-serif';
    x.fillText('MPH', c, c - 36);
    x.fillStyle = '#0c1411';
    x.beginPath(); x.roundRect(c - 36, c + 36, 72, 36, 6); x.fill();
    x.strokeStyle = '#8d949b'; x.lineWidth = 2; x.stroke();
  }

  draw(mph, boost, locked = false) {
    const x = this.x, S = this.S, c = S / 2;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.clearRect(0, 0, S, S);
    x.drawImage(this.face, 0, 0, S, S);
    // boost meter across the bottom gap
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(30,40,46,0.6)'; x.lineWidth = 6;
    x.beginPath(); x.arc(c, c, c - 30, (125 * Math.PI) / 180, (55 * Math.PI) / 180, true); x.stroke();
    if (boost > 0.5) {
      const col = locked ? '#7d8a92' : '#54dcff'; // grey while an emptied tank refills
      x.strokeStyle = col; x.shadowColor = col; x.shadowBlur = locked ? 0 : 8;
      x.beginPath(); x.arc(c, c, c - 30, (125 * Math.PI) / 180, ((125 - 70 * boost / 100) * Math.PI) / 180, true); x.stroke();
      x.shadowBlur = 0;
    }
    x.lineCap = 'butt';
    // digital readout
    x.fillStyle = '#5dffb0'; x.shadowColor = '#22ff99'; x.shadowBlur = 10;
    x.font = 'bold 28px "Share Tech Mono", monospace';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(Math.round(Math.abs(mph))), c, c + 55);
    x.shadowBlur = 0;
    // needle
    x.save();
    x.translate(c, c);
    x.rotate(this.ang(Math.abs(mph)));
    x.shadowColor = 'rgba(0,0,0,0.4)'; x.shadowBlur = 4; x.shadowOffsetY = 2;
    x.fillStyle = '#d2261c';
    x.beginPath(); x.moveTo(-16, -3.5); x.lineTo(c - 30, 0); x.lineTo(-16, 3.5); x.closePath(); x.fill();
    x.restore();
    const g = x.createRadialGradient(c - 3, c - 3, 1, c, c, 11);
    g.addColorStop(0, '#fff'); g.addColorStop(1, '#5d636a');
    x.fillStyle = g;
    x.beginPath(); x.arc(c, c, 10, 0, Math.PI * 2); x.fill();
  }
}

class Minimap {
  constructor(canvas, track) {
    this.c = canvas;
    this.S = 220;
    this.dpr = hiDPI(canvas, this.S);
    this.x = canvas.getContext('2d');
    this.track = track;
    this.range = 430;
    this.path = new Path2D();
    track.pts.forEach((p, i) => (i ? this.path.lineTo(p.x, p.z) : this.path.moveTo(p.x, p.z)));
    this.path.closePath();
  }

  draw(px, pz, heading, racers, ufo, target, t) {
    const x = this.x, S = this.S, c = S / 2, R = c - 12, dpr = this.dpr;
    const sc = R / this.range, A = heading + Math.PI;
    const ca = Math.cos(A) * sc, sa = Math.sin(A) * sc;
    const tx = c - (ca * px - sa * pz), ty = c - (sa * px + ca * pz);
    const toS = (wx, wz) => [ca * wx - sa * wz + tx, sa * wx + ca * wz + ty];

    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, S, S);
    x.save();
    x.beginPath(); x.arc(c, c, R, 0, Math.PI * 2); x.clip();
    const bg = x.createRadialGradient(c, c, 10, c, c, R);
    bg.addColorStop(0, '#4a5960'); bg.addColorStop(1, '#222c31');
    x.fillStyle = bg;
    x.fillRect(0, 0, S, S);

    x.setTransform(dpr * ca, dpr * sa, -dpr * sa, dpr * ca, dpr * tx, dpr * ty);
    // city block grid
    x.strokeStyle = 'rgba(255,255,255,0.07)';
    x.lineWidth = 1 / sc;
    const g0x = Math.floor((px - 500) / 40) * 40, g0z = Math.floor((pz - 500) / 40) * 40;
    x.beginPath();
    for (let gx = g0x; gx < px + 500; gx += 40) { x.moveTo(gx, pz - 500); x.lineTo(gx, pz + 500); }
    for (let gz = g0z; gz < pz + 500; gz += 40) { x.moveTo(px - 500, gz); x.lineTo(px + 500, gz); }
    x.stroke();
    // track
    x.lineJoin = 'round';
    x.strokeStyle = '#8e897e'; x.lineWidth = 38; x.stroke(this.path);
    x.strokeStyle = '#d9d3c4'; x.lineWidth = 28; x.stroke(this.path);
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 2 / sc;
    x.setLineDash([10, 10]); x.stroke(this.path); x.setLineDash([]);
    // start line
    const sp = this.track.pts[this.track.startIdx], sr = this.track.right[this.track.startIdx];
    x.strokeStyle = '#111'; x.lineWidth = 6;
    x.beginPath(); x.moveTo(sp.x - sr.x * 15, sp.z - sr.z * 15); x.lineTo(sp.x + sr.x * 15, sp.z + sr.z * 15); x.stroke();
    // laser target
    if (target) {
      x.strokeStyle = `rgba(255,40,30,${0.6 + 0.4 * Math.sin(t * 25)})`; x.lineWidth = 4 / sc;
      x.beginPath(); x.arc(target.x, target.z, 10, 0, Math.PI * 2); x.stroke();
    }
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    // crosshair lines like an old radar scope
    x.strokeStyle = 'rgba(230,200,80,0.45)'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(c, c - R); x.lineTo(c, c + R); x.moveTo(c - R, c); x.lineTo(c + R, c); x.stroke();

    // racers
    for (const r of racers) {
      if (r.isPlayer) continue;
      let [sx, sy] = toS(r.pos.x, r.pos.z);
      const dx = sx - c, dy = sy - c, d = Math.hypot(dx, dy);
      if (d > R - 7) { sx = c + (dx / d) * (R - 7); sy = c + (dy / d) * (R - 7); }
      x.fillStyle = r.css; x.strokeStyle = '#fff'; x.lineWidth = 2;
      x.beginPath(); x.arc(sx, sy, 5.5, 0, Math.PI * 2); x.fill(); x.stroke();
    }
    // saucer
    if (ufo) {
      let [sx, sy] = toS(ufo.x, ufo.z);
      const dx = sx - c, dy = sy - c, d = Math.hypot(dx, dy);
      if (d > R - 9) { sx = c + (dx / d) * (R - 9); sy = c + (dy / d) * (R - 9); }
      x.fillStyle = '#e6c779'; x.strokeStyle = '#3b2f15'; x.lineWidth = 1.5;
      x.beginPath(); x.ellipse(sx, sy, 9, 4, 0, 0, Math.PI * 2); x.fill(); x.stroke();
      x.beginPath(); x.ellipse(sx, sy - 3, 4, 3, 0, Math.PI, 0); x.fill(); x.stroke();
    }
    // player arrow
    x.fillStyle = '#e8402c'; x.strokeStyle = '#fff'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(c, c - 10); x.lineTo(c + 7, c + 7); x.lineTo(c, c + 3); x.lineTo(c - 7, c + 7); x.closePath(); x.fill(); x.stroke();
    x.restore();

    // inner shadow + chrome bezel
    const sh = x.createRadialGradient(c, c, R - 18, c, c, R);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = sh;
    x.beginPath(); x.arc(c, c, R, 0, Math.PI * 2); x.fill();
    chromeRing(x, c, c, c - 1, 12);
    // north-ish compass pip (points the way the track runs from the start)
    x.fillStyle = '#e8402c';
    x.beginPath(); x.moveTo(c, 2); x.lineTo(c + 6, 12); x.lineTo(c - 6, 12); x.closePath(); x.fill();
  }
}

export class HUD {
  constructor(track) {
    this.speedo = new Speedo($('speedo'));
    this.mph = $('mph');
    this.boostFill = $('boost-fill');
    // short phone screens swap the dial for a compact digital readout
    this.compact = matchMedia('(max-height: 500px)');
    this.map = new Minimap($('minimap'), track);
    this.healthFill = $('health-fill');
    this.lap = $('lap');
    this.pos = $('pos');
    this.time = $('time');
    this.msg = $('msg');
    this.sub = $('sub-msg');
    this.shieldBtn = $('shield-btn');
    this.shieldCd = $('shield-cd');
    this.vignette = $('vignette');
    this.shieldTint = $('shield-tint');
    this.msgTimer = 0;
    this.subTimer = 0;
    this.flash = 0;
  }

  show(on) { $('hud').classList.toggle('hidden', !on); }

  message(text, dur = 1.2, sub = '') {
    this.msg.textContent = text;
    this.msg.classList.remove('pop');
    void this.msg.offsetWidth;
    this.msg.classList.add('pop');
    this.msgTimer = dur;
    if (sub) this.subMessage(sub, dur);
  }

  subMessage(text, dur = 1.5) {
    this.sub.textContent = text;
    this.subTimer = dur;
  }

  damageFlash(k = 1) { this.flash = Math.min(1, this.flash + k); }

  static fmt(t) {
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }

  update(dt, s) {
    this.healthFill.style.width = `${Math.max(0, s.health)}%`;
    this.healthFill.classList.toggle('low', s.health < 30);
    this.lap.textContent = `${Math.min(s.lap, s.laps)}/${s.laps}`;
    this.pos.textContent = `${s.place}/${s.total}`;
    this.time.textContent = HUD.fmt(s.time);
    if (this.compact.matches && document.body.classList.contains('touch')) {
      this.mph.textContent = Math.round(Math.abs(s.mph));
      this.boostFill.style.width = `${s.boost.toFixed(0)}%`;
      this.boostFill.classList.toggle('locked', !!s.boostLock);
    } else {
      this.speedo.draw(s.mph, s.boost, s.boostLock);
    }
    this.map.draw(s.px, s.pz, s.heading, s.racers, s.ufo, s.target, s.t);

    this.shieldBtn.classList.toggle('active', s.shield > 0);
    const frac = s.shield > 0 ? 0 : s.shieldCd / s.shieldCdMax;
    this.shieldCd.style.background = frac > 0
      ? `conic-gradient(rgba(5,10,14,0.72) ${frac * 360}deg, transparent 0)`
      : 'none';
    this.shieldTint.style.opacity = s.shield > 0 ? 1 : 0;

    this.flash = Math.max(0, this.flash - dt * 1.8);
    this.vignette.style.opacity = Math.max(this.flash, s.health < 25 ? 0.25 + 0.15 * Math.sin(s.t * 6) : 0);

    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.textContent = '';
    }
    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) this.sub.textContent = '';
    }
  }
}
