// Procedural canvas textures: no image assets needed for the 3D world.
import * as THREE from 'three';

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(x, w, h, n, a) {
  for (let i = 0; i < n; i++) {
    const v = (Math.random() * 255) | 0;
    x.fillStyle = `rgba(${v},${v},${v},${a})`;
    x.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

// Road tile: 26 units wide x 26 units long. Three lanes, white edge lines.
export function roadTex() {
  const [c, x] = mk(256, 512);
  x.fillStyle = '#626264';
  x.fillRect(0, 0, 256, 512);
  speckle(x, 256, 512, 16000, 0.07);
  // worn tyre lanes
  x.fillStyle = 'rgba(30,30,34,0.10)';
  for (const u of [30, 62, 115, 147, 200, 230]) x.fillRect(u - 9, 0, 18, 512);
  // asphalt patches
  for (let i = 0; i < 5; i++) {
    x.fillStyle = `rgba(45,45,50,${0.08 + Math.random() * 0.1})`;
    x.fillRect(40 + Math.random() * 150, 60 + Math.random() * 380, 20 + Math.random() * 40, 20 + Math.random() * 50);
  }
  x.fillStyle = '#ebe6d8';
  x.fillRect(10, 0, 5, 512);
  x.fillRect(241, 0, 5, 512);
  for (const u of [86, 170]) x.fillRect(u - 2, 0, 4, 220);
  return toTex(c);
}

export function walkTex() {
  const [c, x] = mk(256, 256);
  x.fillStyle = '#bdb5a6';
  x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, 7000, 0.1);
  x.strokeStyle = 'rgba(85,76,66,0.55)';
  x.lineWidth = 3;
  x.strokeRect(0, 0, 256, 256);
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(128, 0); x.lineTo(128, 256);
  x.moveTo(0, 128); x.lineTo(256, 128);
  x.stroke();
  return toTex(c);
}

export function groundTex() {
  const [c, x] = mk(256, 256);
  x.fillStyle = '#7e7a72';
  x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, 9000, 0.08);
  x.strokeStyle = 'rgba(60,56,50,0.4)';
  x.lineWidth = 2;
  x.strokeRect(0, 0, 256, 256);
  return toTex(c);
}

const FACADES = [
  { wall: '#a65a3e', frame: '#efe3cc', ledge: '#7b3f2b', brick: true },
  { wall: '#d9b48c', frame: '#f6ecda', ledge: '#b08a62' },
  { glass: true, base: '#36598c', mull: '#c9d3de', span: '#1d2e48' },
  { wall: '#e7ddc8', frame: '#6b6156', ledge: '#c4b79d' },
  { wall: '#908b85', frame: '#dcd8d0', ledge: '#6d6964' },
  { wall: '#e2a57c', frame: '#fff3e2', ledge: '#bd815c' },
  { wall: '#b9693f', frame: '#f2e6d0', ledge: '#8b4a2a', brick: true, arch: true },
];

// One tile = 16x16 world units = 4 columns x 4 floors. The bottom-left pixel is
// always plain wall so building roofs (UV 0.02,0.02) pick up a flat colour.
function facade(d) {
  const [c, x] = mk(256, 256);
  if (d.glass) {
    for (let f = 0; f < 4; f++) {
      const y0 = f * 64;
      const g = x.createLinearGradient(0, y0, 0, y0 + 56);
      g.addColorStop(0, '#a9c8ec');
      g.addColorStop(0.45, d.base);
      g.addColorStop(1, '#203556');
      x.fillStyle = g;
      x.fillRect(0, y0, 256, 56);
      x.fillStyle = d.span;
      x.fillRect(0, y0 + 56, 256, 8);
      x.fillStyle = d.mull;
      for (let m = 0; m < 256; m += 32) x.fillRect(m, y0, 2, 56);
    }
    x.fillStyle = 'rgba(255,255,255,0.07)';
    x.beginPath(); x.moveTo(40, 0); x.lineTo(120, 0); x.lineTo(30, 256); x.lineTo(-50, 256); x.fill();
    return toTex(c);
  }
  x.fillStyle = d.wall;
  x.fillRect(0, 0, 256, 256);
  speckle(x, 256, 256, 5000, 0.07);
  if (d.brick) {
    x.strokeStyle = 'rgba(60,25,15,0.22)';
    x.lineWidth = 1;
    for (let yy = 0; yy < 256; yy += 5) {
      x.beginPath(); x.moveTo(0, yy + 0.5); x.lineTo(256, yy + 0.5); x.stroke();
    }
  }
  for (let f = 0; f < 4; f++) {
    for (let col = 0; col < 4; col++) {
      const cx = col * 64, cy = f * 64;
      x.fillStyle = d.frame;
      if (d.arch) {
        x.beginPath();
        x.moveTo(cx + 12, cy + 54); x.lineTo(cx + 12, cy + 30);
        x.arc(cx + 32, cy + 30, 20, Math.PI, 0); x.lineTo(cx + 52, cy + 54); x.fill();
      } else {
        x.fillRect(cx + 12, cy + 12, 40, 42);
      }
      const lit = Math.random();
      const g = x.createLinearGradient(0, cy + 14, 0, cy + 52);
      if (lit < 0.12) { g.addColorStop(0, '#ffe7b0'); g.addColorStop(1, '#d9a35a'); }
      else if (lit < 0.25) { g.addColorStop(0, '#6d7f92'); g.addColorStop(1, '#2a3440'); }
      else { g.addColorStop(0, '#9dbbdc'); g.addColorStop(0.45, '#40597b'); g.addColorStop(1, '#1d2a3c'); }
      x.fillStyle = g;
      if (d.arch) {
        x.beginPath();
        x.moveTo(cx + 15, cy + 52); x.lineTo(cx + 15, cy + 31);
        x.arc(cx + 32, cy + 31, 17, Math.PI, 0); x.lineTo(cx + 49, cy + 52); x.fill();
      } else {
        x.fillRect(cx + 15, cy + 15, 34, 37);
      }
      x.fillStyle = d.frame;
      x.fillRect(cx + 31, cy + 15, 2, 37);
      x.fillRect(cx + 15, cy + 32, 34, 2);
      x.fillStyle = d.ledge;
      x.fillRect(cx + 10, cy + 54, 44, 3);
    }
    x.fillStyle = d.ledge;
    x.fillRect(0, f * 64, 256, 4);
  }
  return toTex(c);
}

export function facadeTextures() {
  return FACADES.map((d) => ({ tex: facade(d), glass: !!d.glass }));
}

export function shopTex() {
  const [c, x] = mk(512, 128);
  x.fillStyle = '#3b2f29';
  x.fillRect(0, 0, 512, 128);
  const signs = ['#1f5f8b', '#8b2a1f', '#2f6b45', '#c9a23c'];
  x.fillStyle = signs[(Math.random() * signs.length) | 0];
  x.fillRect(0, 0, 512, 22);
  x.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 18; i++) x.fillRect(150 + i * 12, 8, 7, 6);
  for (let k = 0; k < 4; k++) {
    const x0 = 12 + k * 125, w = 112;
    const g = x.createLinearGradient(0, 28, 0, 124);
    if (k === 2) { g.addColorStop(0, '#5a4636'); g.addColorStop(1, '#2a1f18'); }
    else { g.addColorStop(0, '#ffe2ae'); g.addColorStop(0.6, '#d49a5c'); g.addColorStop(1, '#7c5234'); }
    x.fillStyle = g;
    x.fillRect(x0, 30, w, 92);
    x.fillStyle = 'rgba(255,255,255,0.16)';
    x.beginPath(); x.moveTo(x0 + 20, 30); x.lineTo(x0 + 50, 30); x.lineTo(x0 + 20, 122); x.lineTo(x0 - 10, 122); x.fill();
    x.fillStyle = '#e8dfcc';
    x.fillRect(x0 + w / 2 - 1, 30, 2, 92);
  }
  return toTex(c);
}

export function awningTex(c1, c2) {
  const [c, x] = mk(128, 64);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? c2 : c1;
    x.fillRect(i * 16, 0, 16, 64);
  }
  x.fillStyle = 'rgba(0,0,0,0.18)';
  x.fillRect(0, 56, 128, 8);
  return toTex(c);
}

export function checkerTex() {
  const [c, x] = mk(256, 32);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) {
    x.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4';
    x.fillRect(i * 16, j * 16, 16, 16);
  }
  return toTex(c);
}

export function bannerTex(text) {
  const [c, x] = mk(1024, 128);
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#34434e'); g.addColorStop(1, '#1b242b');
  x.fillStyle = g;
  x.fillRect(0, 0, 1024, 128);
  x.fillStyle = '#ff9a3c';
  x.fillRect(0, 0, 1024, 8); x.fillRect(0, 120, 1024, 8);
  let size = 64;
  x.font = `${size}px Bungee, "Arial Black", sans-serif`;
  while (x.measureText(text).width > 960 && size > 20) {
    size -= 2;
    x.font = `${size}px Bungee, "Arial Black", sans-serif`;
  }
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#000'; x.fillText(text, 514, 70);
  x.fillStyle = '#fff'; x.fillText(text, 512, 66);
  const t = toTex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function dotTex() {
  const [c, x] = mk(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function glowTex() {
  const [c, x] = mk(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
