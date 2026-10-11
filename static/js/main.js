// Atomic Gumshoe: main game loop, player physics, rivals, saucer attacks, race flow.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Track, ROAD_HALF, WALL } from './track.js';
import { buildCity } from './city.js';
import { buildCar, buildShield } from './car.js';
import { UFO } from './ufo.js';
import { Sparks, Beam, Marker, Shockwaves } from './effects.js';
import { HUD } from './hud.js';
import { Sfx } from './audio.js';
import { glowTex } from './textures.js';

const V3 = THREE.Vector3;
const LAPS = 3;
const DRIFT_T1 = 0.7, DRIFT_T2 = 1.6; // seconds of sliding for a blue / orange mini-boost
const SHIELD_TIME = 3.5;
const SHIELD_CD = 14;
const MPH = 1.15; // world units/s -> displayed mph
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + (b - a) * Math.random();
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

await Promise.race([
  Promise.all([document.fonts.load('40px Bungee'), document.fonts.load('20px "Share Tech Mono"')]),
  new Promise((r) => setTimeout(r, 2500)),
]);

const TOUCH = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
if (TOUCH) document.body.classList.add('touch');
// iPhone Safari's toolbars eat a third of a landscape screen; a home-screen web app gets it all back
if (navigator.standalone === false && /iPhone|iPod/.test(navigator.userAgent)) document.body.classList.add('ios-browser');

// ---------------------------------------------------------------- renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const HAZE = 0xd8cfbf;
scene.fog = new THREE.Fog(HAZE, 220, 1500);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 6000);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

// sky dome: blue overhead fading to warm haze at the horizon
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(4000, 32, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x5f8fcf) }, mid: { value: new THREE.Color(0xaecbe8) }, bot: { value: new THREE.Color(HAZE) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
      void main(){ float h = vP.y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.6, h)) : mix(bot, mid, smoothstep(0.0, 0.12, h));
      gl_FragColor = vec4(c, 1.0); }`,
  }),
);
scene.add(sky);

scene.add(new THREE.HemisphereLight(0xd6e6ff, 0x6b5f52, 0.55));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 700 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
const SUN_DIR = new V3(-0.5, 0.72, 0.48).normalize();

// ---------------------------------------------------------------- world
const track = new Track();
track.addToScene(scene);
buildCity(scene, track);
const M = track.M, L = track.length;

const sparks = new Sparks(scene);
const beam = new Beam(scene);
const aimBeam = new Beam(scene, 0xff2a1a, 0xff8a7a);
const marker = new Marker(scene);
const shock = new Shockwaves(scene);
const ufo = new UFO(scene);
const hud = new HUD(track);
const sfx = new Sfx(['static/audio/thechase.mp3', 'static/audio/thechase2.mp3', 'static/audio/thechase3.mp3']);

// ---------------------------------------------------------------- racers
function makeRacer(name, color, css, isPlayer) {
  const model = buildCar(color);
  scene.add(model.root);
  return {
    name, css, isPlayer, model,
    pos: new V3(), vel: new V3(), heading: 0, steer: 0, spinVel: 0,
    idx: 0, rel: 0, lap: -1, s: 0, finished: false, finishTime: 0,
    // rival-only
    speed: 0, base: 0, lat: 0, latT: 0, latTimer: 0, slow: 0,
  };
}

const player = makeRacer('You', 0xb52b22, '#e8402c', true);
Object.assign(player, { health: 100, boost: 100, shield: 0, shieldCd: 0, boosting: false, throttle: 0, driftT: 0, driftTier: 0, driftSnd: 0, miniT: 0, wrongWay: 0, bestLap: 0, lapStart: 0, scrapeT: 0 });
const shieldMesh = buildShield();
player.model.root.add(shieldMesh);

const rivals = [
  makeRacer('Big Sal', 0x2c5fae, '#3f7be0', false),
  makeRacer('The Dame', 0x3f9a70, '#4fcf8f', false),
  makeRacer('Lefty', 0xe0b84a, '#f2cf5a', false),
];
const racers = [player, ...rivals];

// ---------------------------------------------------------------- pickups
const pickups = [];
{
  const glow = glowTex();
  const repairMat = new THREE.MeshStandardMaterial({ color: 0x33ff88, emissive: 0x22cc66, emissiveIntensity: 1.2, roughness: 0.3 });
  const atomCore = new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff7a20, emissiveIntensity: 1.5 });
  const orbitMat = new THREE.MeshBasicMaterial({ color: 0x8ff0ff });
  for (let k = 0; k < 12; k++) {
    const type = k % 2 ? 'boost' : 'repair';
    const smp = track.sampleAt(track.startDist + ((k + 0.5) / 12) * L);
    const lat = [-7, 0, 7][k % 3];
    const g = new THREE.Group();
    if (type === 'repair') {
      g.add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 0.7), repairMat));
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.2, 0.7), repairMat));
    } else {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), atomCore));
      for (let o = 0; o < 3; o++) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.06, 6, 32), orbitMat);
        ring.rotation.set(o * 1.05, o * 0.6, 0);
        g.add(ring);
      }
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: type === 'repair' ? 0x44ff99 : 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.set(5, 5, 1);
    g.add(halo);
    const pos = smp.pos.clone().addScaledVector(smp.right, lat);
    pos.y = 1.8;
    g.position.copy(pos);
    scene.add(g);
    pickups.push({ type, g, pos, active: true, timer: 0 });
  }
}

// ---------------------------------------------------------------- input
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) onPress(e.code);
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const down = (...codes) => codes.some((c) => keys.has(c));

function onPress(code) {
  sfx.init();
  if (code === 'KeyE' && state === 'race') activateShield();
  if (code === 'KeyR' && state === 'race') resetToTrack();
  if (code === 'KeyM') hud.subMessage(sfx.toggleMute() ? 'SOUND OFF' : 'SOUND ON', 1);
  if ((code === 'Enter' || code === 'Space') && state === 'menu') startRace();
}
// on-screen buttons: each one holds down one or more virtual keys while touched
document.querySelectorAll('[data-key]').forEach((btn) => {
  const codes = btn.dataset.key.split(' ');
  const release = () => {
    btn.classList.remove('on');
    codes.forEach((c) => keys.delete(c));
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('on');
    codes.forEach((c) => { if (!keys.has(c)) onPress(c); keys.add(c); });
  });
  btn.addEventListener('pointerup', release);
  btn.addEventListener('pointercancel', release);
  btn.addEventListener('lostpointercapture', release);
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
});
document.addEventListener('touchmove', (e) => { if (e.target.tagName !== 'INPUT' && !e.target.closest('.panel')) e.preventDefault(); }, { passive: false });

// floating joystick: wherever the left thumb lands becomes the centre; sideways push = analog steer
const stick = { id: null, ox: 0, value: 0 };
const STICK_R = 70, STICK_DEAD = 0.14, STICK_EXPO = 0.7; // expo: soft near centre, full lock at the edge
{
  const zone = $('stick-zone'), base = $('stick-base'), knob = $('stick-knob');
  const move = (e) => {
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    knob.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    const v = dx / STICK_R;
    const a = Math.max(0, (Math.abs(v) - STICK_DEAD) / (1 - STICK_DEAD));
    stick.value = Math.sign(v) * ((1 - STICK_EXPO) * a + STICK_EXPO * a * a * a);
  };
  const end = (e) => {
    if (e.pointerId !== stick.id) return;
    stick.id = null;
    stick.value = 0;
    knob.style.transform = '';
    base.classList.remove('on');
    base.style.left = base.style.top = '';
  };
  zone.addEventListener('pointerdown', (e) => {
    if (stick.id !== null) return;
    e.preventDefault();
    sfx.init();
    zone.setPointerCapture(e.pointerId);
    const zr = zone.getBoundingClientRect();
    stick.id = e.pointerId;
    stick.ox = e.clientX;
    stick.oy = e.clientY;
    base.style.left = `${e.clientX - zr.left}px`;
    base.style.top = `${e.clientY - zr.top}px`;
    base.classList.add('on');
    move(e);
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === stick.id) move(e); });
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  zone.addEventListener('lostpointercapture', end);
}

// full screen where the browser allows it (iPad, desktop, Android); iPhone Safari can't, so the button stays hidden
{
  const root = document.documentElement, btn = $('fs-btn');
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  if (document.fullscreenEnabled || document.webkitFullscreenEnabled) {
    document.body.classList.add('can-fs');
    const sync = () => document.body.classList.toggle('is-fs', !!fsEl());
    const after = (p) => {
      if (p && p.then) p.then(sync, sync);
      else setTimeout(sync, 300); // older prefixed WebKit returns nothing
    };
    const toggle = () => {
      if (fsEl()) after((document.exitFullscreen || document.webkitExitFullscreen).call(document));
      else {
        const p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
        after(p);
        if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
      }
    };
    btn.addEventListener('click', () => { sfx.init(); toggle(); btn.blur(); });
    addEventListener('keydown', (e) => { if (e.code === 'KeyF' && e.target.tagName !== 'INPUT') toggle(); });
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
  }
}

$('shield-btn').addEventListener('click', () => { sfx.init(); if (state === 'race') activateShield(); });
$('start-btn').addEventListener('click', () => { sfx.init(); startRace(); });
$('again-btn').addEventListener('click', () => { $('results').classList.add('hidden'); startRace(); });

// ---------------------------------------------------------------- state
let state = 'menu';
let raceTime = 0, countdown = 0, lastBeep = 0, endTimer = 0, time = 0;
let shake = 0;
const camPos = new V3(), camLook = new V3(), camOffset = new V3();
let camHeading = 0;
// the saucer gets meaner every lap: quicker aim, shorter breaks, tracks you while
// charging, bigger blast, and on the final lap it fires double shots
const SAUCER = [
  { aim: 1.15, cool: 1.0, focus: 0.68, track: 0, radius: 7.5, dmg: 1.0, burst: 1 },
  { aim: 0.95, cool: 0.72, focus: 0.8, track: 0.45, radius: 8.5, dmg: 1.15, burst: 1 },
  { aim: 0.8, cool: 0.55, focus: 0.9, track: 0.65, radius: 9.5, dmg: 1.3, burst: 2 },
];
const saucerLevel = () => THREE.MathUtils.clamp(player.lap, 0, SAUCER.length - 1);
const atk = { state: 'idle', timer: 4, point: new V3(), target: null, lv: SAUCER[0], shots: 0 };

function placeOnGrid() {
  const slots = [[-10, -6], [-10, 6], [-24, -6], [-24, 6]];
  const order = [rivals[0], rivals[1], rivals[2], player];
  order.forEach((r, k) => {
    const [s, lat] = slots[k];
    const smp = track.sampleAt(track.startDist + s);
    r.pos.copy(smp.pos).addScaledVector(smp.right, lat);
    r.heading = Math.atan2(smp.tan.x, smp.tan.z);
    r.vel.set(0, 0, 0);
    r.idx = smp.i;
    r.rel = (smp.i - track.startIdx + M) % M;
    r.lap = -1;
    r.s = s;
    r.lat = r.latT = lat;
    r.speed = 0;
    r.slow = 0;
    r.finished = false;
    r.steer = 0;
    r.spinVel = 0;
    r.baseHeading = undefined;
  });
  rivals.forEach((r, i) => { r.base = [80, 77, 74][i] + rand(-1.5, 1.5); });
  player.model.paint.color.setHex(0xb52b22);
}

function resetRace() {
  placeOnGrid();
  Object.assign(player, { health: 100, boost: 100, boostLock: false, shield: 0, shieldCd: 0, wrongWay: 0, bestLap: 0, lapStart: 0, driftT: 0, driftTier: 0, driftSnd: 0, miniT: 0 });
  pickups.forEach((p) => { p.active = true; p.g.visible = true; });
  raceTime = 0;
  atk.state = 'idle';
  atk.timer = 5;
  atk.lv = SAUCER[0];
  atk.shots = 0;
  marker.hide();
  ufo.charge = 0;
  ufo.rage = 0;
  const smp = track.sampleAt(track.startDist + 40);
  ufo.group.position.set(smp.pos.x, 60, smp.pos.z);
  camHeading = player.heading;
  syncModels(0);
  snapCamera();
}

function startRace() {
  if (state !== 'menu' && state !== 'over') return;
  document.body.classList.remove('on-menu');
  $('menu').classList.add('hidden');
  resetRace();
  sfx.init();
  sfx.primeMusic();
  sfx.music(false);
  hud.show(true);
  state = 'countdown';
  countdown = 3.5;
  lastBeep = 4;
}

function showMenu() {
  state = 'menu';
  sfx.music(false);
  document.body.classList.add('on-menu');
  $('menu').classList.remove('hidden');
  hud.show(false);
  loadBoard($('board-list'));
}

// ---------------------------------------------------------------- player
function activateShield() {
  if (player.shield > 0 || player.shieldCd > 0) return;
  player.shield = SHIELD_TIME;
  player.shieldCd = SHIELD_CD;
  sfx.shield();
}

function damage(amount, cause) {
  if (state !== 'race') return;
  if (player.shield > 0) {
    sfx.deflect();
    sparks.emit(player.pos.clone().setY(1.5), 50, { color: [0.4, 0.9, 1], speed: 20, life: 0.6 });
    return;
  }
  player.health -= amount;
  hud.damageFlash(Math.min(1, amount / 25));
  shake = Math.min(1.5, shake + amount / 18);
  if (player.health <= 0) wreck(cause);
}

function wreck() {
  sfx.music(false);
  player.health = 0;
  state = 'wrecked';
  endTimer = 2.5;
  const p = player.pos.clone().setY(1);
  sparks.emit(p, 400, { speed: 35, up: 14, life: 1.6, color: [1, 0.6, 0.25] });
  shock.spawn(p, 0xff7030, 24);
  sfx.boom();
  shake = 2;
  player.model.paint.color.setHex(0x2a1612);
  hud.message('WRECKED!', 3, 'The saucer got you.');
  marker.hide();
}

function resetToTrack() {
  const smp = track.sampleAt(player.idx * track.step);
  player.pos.copy(smp.pos);
  player.heading = Math.atan2(smp.tan.x, smp.tan.z);
  player.vel.set(0, 0, 0);
  player.spinVel = 0;
}

function updatePlayer(dt, controls) {
  const p = player;
  const thr = controls && down('KeyW', 'ArrowUp') ? 1 : 0;
  const brk = controls ? (down('KeyS', 'ArrowDown') ? 1 : 0) : (state === 'finished' ? 0.5 : 0);
  let steerIn = controls ? (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0) : 0;
  if (controls && stick.value && !down('KeyD', 'ArrowRight', 'KeyA', 'ArrowLeft')) steerIn = stick.value;
  const hb = controls && down('Space');
  // an empty tank locks boost until it refills to 25%, otherwise holding BOOST at 0 flickers it on forever
  if (p.boost <= 0) p.boostLock = true;
  else if (p.boost >= 25) p.boostLock = false;
  p.boosting = controls && thr > 0 && down('ShiftLeft', 'ShiftRight') && p.boost > 0 && !p.boostLock;
  p.boost = p.boosting ? Math.max(0, p.boost - 28 * dt) : Math.min(100, p.boost + 5 * dt);
  p.throttle += (thr - p.throttle) * Math.min(1, dt * 6);

  const h = p.heading;
  const f = new V3(Math.sin(h), 0, Math.cos(h));
  const r = new V3(-Math.cos(h), 0, Math.sin(h));
  let vF = p.vel.dot(f), vR = p.vel.dot(r);

  if (thr) vF += (p.boosting ? 66 : 42) * dt;
  if (p.miniT > 0) { p.miniT -= dt; vF += 34 * dt; }
  if (brk) vF -= (vF > 1 ? 75 : 24) * dt;
  vF -= vF * 0.52 * dt;
  if (hb) vF -= vF * 0.5 * dt;
  vF = Math.max(vF, -24);

  const sp = Math.abs(vF);
  const want = steerIn * 2.15 * Math.min(1, sp / 12) * (1 - (Math.min(sp, 130) / 130) * 0.42) * (hb ? 1.55 : 1) * (vF < -0.5 ? -1 : 1);
  p.steer += (want - p.steer) * Math.min(1, dt * 8);
  p.heading -= p.steer * dt;
  p.heading += p.spinVel * dt;
  p.spinVel *= Math.exp(-3 * dt);

  vR *= Math.exp(-(hb ? 1.1 : 7.5) * dt);

  // drift charge: a held slide builds a mini-boost that fires when DRIFT is released
  const slip = Math.atan2(Math.abs(vR), Math.max(sp, 1));
  const sliding = hb && sp > 25 && slip > 0.15;
  if (hb && sp < 15) p.driftT = 0;
  if (sliding) p.driftT += dt;
  const tier = p.driftT >= DRIFT_T2 ? 2 : p.driftT >= DRIFT_T1 ? 1 : 0;
  if (tier > p.driftTier) sfx.driftTier(tier);
  p.driftTier = tier;
  if (!hb && p.driftT > 0) {
    if (tier) {
      vF += tier === 2 ? 16 : 9;
      p.miniT = tier === 2 ? 1.0 : 0.6;
      sfx.miniBoost(tier);
      hud.subMessage(tier === 2 ? 'SUPER MINI-BOOST!' : 'MINI-BOOST!', 0.9);
      sparks.emit(p.pos.clone().addScaledVector(f, -3).setY(0.6), 40, { speed: 14, up: 4, life: 0.5, color: tier === 2 ? [1, 0.6, 0.2] : [0.4, 0.8, 1] });
    }
    p.driftT = 0;
    p.driftTier = 0;
  }
  p.driftSnd = sliding ? Math.min(1, slip / 0.6) * Math.min(1, sp / 50) : 0;
  // rebuild velocity in the *old* frame so heading changes produce a slide that grip then removes
  p.vel.copy(f).multiplyScalar(vF).addScaledVector(r, vR);
  p.pos.addScaledVector(p.vel, dt);

  // tail sparks show the charge: faint white, then blue, then orange
  if (sliding && Math.random() < 0.7) {
    const rear = p.pos.clone().addScaledVector(f, -2.5).setY(0.2);
    const col = [[0.75, 0.75, 0.8], [0.4, 0.8, 1], [1, 0.6, 0.2]][p.driftTier];
    sparks.emit(rear, 1 + p.driftTier * 2, { speed: 4 + p.driftTier * 2, up: 2, color: col, life: 0.4 });
  }

  // kerbs and building line
  const n = track.nearest(p.pos.x, p.pos.z, 80);
  if (n.i < 0) { resetToTrack(); return; }
  const c = track.pts[n.i];
  let dx = p.pos.x - c.x, dz = p.pos.z - c.z;
  const d = Math.hypot(dx, dz);
  if (d > ROAD_HALF) p.vel.multiplyScalar(1 - 0.6 * dt);
  if (d > WALL) {
    dx /= d; dz /= d;
    p.pos.x = c.x + dx * WALL;
    p.pos.z = c.z + dz * WALL;
    const vn = p.vel.x * dx + p.vel.z * dz;
    if (vn > 0) {
      p.vel.x -= dx * vn * 1.35;
      p.vel.z -= dz * vn * 1.35;
      p.vel.multiplyScalar(0.94);
      const hit = p.pos.clone().add(new V3(dx * 1.4, 0.8, dz * 1.4));
      if (vn > 6) {
        sparks.emit(hit, Math.min(60, vn * 2), { speed: 14, up: 5, life: 0.5 });
        sfx.thud();
        shake = Math.min(1.2, shake + vn / 50);
      }
      if (vn > 24) damage((vn - 24) * 0.5, 'wall');
    } else if (p.vel.length() > 20) {
      p.scrapeT -= dt;
      if (p.scrapeT <= 0) {
        p.scrapeT = 0.12;
        sfx.scrape();
        sparks.emit(p.pos.clone().add(new V3(dx * 1.4, 0.6, dz * 1.4)), 6, { speed: 8, up: 3, life: 0.35 });
      }
    }
  }

  // lap progress (windowed so the crossing doesn't confuse it)
  const li = track.nearestLocal(p.pos.x, p.pos.z, p.idx, 40);
  p.idx = li;
  const rel = (li - track.startIdx + M) % M;
  if (p.rel > M * 0.8 && rel < M * 0.2) onPlayerLap();
  else if (p.rel < M * 0.2 && rel > M * 0.8) p.lap--;
  p.rel = rel;
  p.s = p.lap * L + rel * track.step;

  // wrong way
  if (state === 'race') {
    const goingBack = f.dot(track.tan[li]) < -0.3 && p.vel.length() > 8;
    p.wrongWay = goingBack ? p.wrongWay + dt : 0;
    if (p.wrongWay > 1.2 && hud.subTimer <= 0) hud.subMessage('WRONG WAY!', 1);
  }
}

function onPlayerLap() {
  player.lap++;
  if (player.lap < 1 || state !== 'race') return;
  const lapTime = raceTime - player.lapStart;
  player.lapStart = raceTime;
  if (!player.bestLap || lapTime < player.bestLap) player.bestLap = lapTime;
  if (player.lap >= LAPS) {
    finishPlayer();
  } else {
    sfx.lap();
    ufo.rage = saucerLevel();
    sfx.musicLevel(saucerLevel());
    const warn = player.lap === LAPS - 1 ? 'THE SAUCER IS FURIOUS!' : 'THE SAUCER IS GETTING ANGRY!';
    hud.message(player.lap === LAPS - 1 ? 'FINAL LAP' : `LAP ${player.lap + 1}`, 2, `Lap time ${HUD.fmt(lapTime)} · ${warn}`);
  }
}

function finishPlayer() {
  sfx.music(false);
  player.finished = true;
  player.finishTime = raceTime;
  player.place = 1 + rivals.filter((r) => r.finished).length;
  state = 'finished';
  endTimer = 3;
  marker.hide();
  sfx.lap();
  const ord = ['1ST', '2ND', '3RD', '4TH'][player.place - 1];
  hud.message(player.place === 1 ? 'YOU WIN!' : `${ord} PLACE`, 3, `Finished in ${HUD.fmt(raceTime)}`);
}

// ---------------------------------------------------------------- rivals
function updateRivals(dt, racing) {
  for (const r of rivals) {
    const smp = track.sampleAt(track.startDist + r.s);
    if (racing) {
      let maxC = 0;
      for (let k = 0; k < 45; k += 3) maxC = Math.max(maxC, track.curv[(smp.i + k) % M]);
      let target = Math.min(r.base, Math.sqrt(46 / Math.max(maxC, 1e-4)));
      const gap = r.s - player.s;
      if (!r.finished && state === 'race') {
        if (gap > 140) target *= 0.86;
        else if (gap < -140) target *= 1.14;
      }
      if (r.slow > 0) { target *= 0.4; r.slow -= dt; }
      if (r.finished) target *= 0.6;
      r.speed += THREE.MathUtils.clamp(target - r.speed, -50 * dt, 26 * dt);
    } else {
      r.speed = Math.max(0, r.speed - 30 * dt);
    }
    r.s += r.speed * dt;
    if (!r.finished && r.s >= LAPS * L && racing) {
      r.finished = true;
      r.finishTime = raceTime;
    }
    r.lap = Math.floor(r.s / L);

    // lane wandering + dodge the player
    r.latTimer -= dt;
    if (r.latTimer <= 0) { r.latTimer = rand(2, 5); r.latT = rand(-8, 8); }
    const toP = new V3().subVectors(player.pos, r.pos);
    const along = toP.dot(smp.tan), side = toP.dot(smp.right);
    if (along > 0 && along < 16 && Math.abs(side) < 4.5) r.latT = THREE.MathUtils.clamp(r.lat + (side > 0 ? -6 : 6), -9, 9);
    r.lat += (r.latT - r.lat) * Math.min(1, dt * 1.3);

    const next = track.sampleAt(track.startDist + r.s);
    r.pos.copy(next.pos).addScaledVector(next.right, r.lat);
    const hd = Math.atan2(next.tan.x, next.tan.z);
    const rate = r.baseHeading === undefined ? 0 : angDiff(hd, r.baseHeading) / Math.max(dt, 1e-3);
    r.steer += (-rate * 1.5 - r.steer) * Math.min(1, dt * 4);
    r.baseHeading = hd;
    r.heading = hd + (r.slow > 0 ? Math.sin(time * 14) * 0.25 : 0);
    r.vel.copy(next.tan).multiplyScalar(r.speed);
    r.idx = next.i;
  }

  // car-to-car bumps with the player
  for (const r of rivals) {
    const dx = player.pos.x - r.pos.x, dz = player.pos.z - r.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 3.9 && d > 0.01) {
      const nx = dx / d, nz = dz / d;
      player.pos.x = r.pos.x + nx * 3.9;
      player.pos.z = r.pos.z + nz * 3.9;
      const vn = (player.vel.x - r.vel.x) * nx + (player.vel.z - r.vel.z) * nz;
      if (vn < 0) {
        player.vel.x -= nx * vn * 1.3;
        player.vel.z -= nz * vn * 1.3;
        r.lat -= (player.pos.clone().sub(r.pos).dot(track.right[r.idx]) > 0 ? 1 : -1) * Math.min(3, -vn * 0.15);
        if (vn < -5) {
          sfx.thud();
          sparks.emit(new V3((player.pos.x + r.pos.x) / 2, 1, (player.pos.z + r.pos.z) / 2), 25, { speed: 12, life: 0.4 });
          shake = Math.min(1, shake + 0.3);
        }
        if (vn < -10) r.speed *= 0.85;
      }
    }
  }
}

// ---------------------------------------------------------------- saucer
function updateSaucer(dt) {
  const f = new V3(Math.sin(player.heading), 0, Math.cos(player.heading));
  const r = new V3(-Math.cos(player.heading), 0, Math.sin(player.heading));
  const target = player.pos.clone()
    .addScaledVector(f, 55 + Math.min(30, player.vel.length() * 0.25))
    .addScaledVector(r, Math.sin(time * 0.45) * 16);
  target.y = 21 + Math.sin(time * 0.9) * 2.5;
  if (state === 'menu') {
    const smp = track.sampleAt(track.startDist + 30);
    target.set(smp.pos.x + Math.sin(time * 0.3) * 20, 30, smp.pos.z + Math.cos(time * 0.3) * 20);
  }
  ufo.update(dt, time, target);

  if (state !== 'race') {
    ufo.charge = Math.max(0, ufo.charge - dt);
    aimBeam.group.visible = false;
    return;
  }

  atk.timer -= dt;
  if (atk.state === 'idle' && atk.timer <= 0) {
    if (atk.shots <= 0) {
      // new volley: difficulty follows the player's current lap
      atk.lv = SAUCER[saucerLevel()];
      atk.shots = atk.lv.burst;
      const pool = rivals.filter((x) => !x.finished);
      atk.target = Math.random() < atk.lv.focus || !pool.length ? player : pool[(Math.random() * pool.length) | 0];
    }
    atk.state = 'aim';
    atk.timer = atk.lv.aim;
    aimAt(atk.target, atk.lv.aim);
    marker.show(atk.point);
    sfx.charge();
  } else if (atk.state === 'aim') {
    const k = 1 - atk.timer / atk.lv.aim;
    // later laps: the ring keeps following the target for the first part of the charge
    if (k < atk.lv.track) {
      aimAt(atk.target, atk.timer);
      marker.show(atk.point);
    }
    ufo.charge = k;
    marker.update(time, k);
    aimBeam.set(ufo.emitter, atk.point.clone().setY(0.2), 0.08 + k * 0.12);
    aimBeam.outer.scale.set(aimBeam.width * 2, aimBeam.len, aimBeam.width * 2);
    aimBeam.inner.scale.set(aimBeam.width * 0.6, aimBeam.len, aimBeam.width * 0.6);
    aimBeam.outer.material.opacity = 0.25 + 0.25 * Math.sin(time * 40);
    aimBeam.inner.material.opacity = 0.5;
    if (atk.timer <= 0) fireLaser();
  } else if (atk.state === 'cool' && atk.timer <= 0) {
    atk.state = 'idle';
    atk.timer = --atk.shots > 0 ? 0.25 : rand(2.0, 4.2) * atk.lv.cool;
  }
  sfx.ufo(ufo.group.position.distanceTo(player.pos), ufo.charge);
}

function aimAt(t, lead) {
  atk.point.copy(t.pos).addScaledVector(t.vel, lead);
  // keep the strike on the street
  const n = track.nearest(atk.point.x, atk.point.z, 80);
  if (n.i >= 0) {
    const c = track.pts[n.i];
    const off = new V3(atk.point.x - c.x, 0, atk.point.z - c.z);
    if (off.length() > ROAD_HALF) off.setLength(ROAD_HALF);
    atk.point.set(c.x + off.x, 0, c.z + off.z);
  }
}

function fireLaser() {
  const R = atk.lv.radius;
  const pt = atk.point.clone().setY(0.2);
  aimBeam.group.visible = false;
  marker.hide();
  beam.fire(ufo.emitter, pt, 0.4, 1.1);
  ufo.charge = 0;
  ufo.light.intensity = 4000;
  sparks.emit(pt.clone().setY(0.5), 160, { speed: 30, up: 12, life: 1.0 });
  sparks.emit(pt.clone().setY(0.5), 60, { speed: 12, up: 20, life: 1.3, color: [1, 0.95, 0.7] });
  shock.spawn(pt);
  sfx.laser();
  sfx.boom();
  const dist = player.pos.distanceTo(pt);
  shake = Math.min(1.5, shake + Math.max(0, 1 - dist / 60) * 0.8);
  if (dist < R && state === 'race') {
    const shielded = player.shield > 0;
    damage((30 - dist * 12 / R) * atk.lv.dmg, 'laser');
    if (!shielded) {
      player.vel.multiplyScalar(0.5);
      player.spinVel += (Math.random() < 0.5 ? -1 : 1) * rand(1.5, 3);
      player.vel.y = 0;
    }
  }
  for (const r of rivals) {
    if (r.pos.distanceTo(pt) < R) r.slow = 1.6;
  }
  atk.state = 'cool';
  atk.timer = 0.5;
}

// ---------------------------------------------------------------- pickups
function updatePickups(dt) {
  for (const p of pickups) {
    if (!p.active) {
      p.timer -= dt;
      if (p.timer <= 0) { p.active = true; p.g.visible = true; }
      continue;
    }
    p.g.rotation.y += dt * 2;
    p.g.position.y = p.pos.y + Math.sin(time * 3 + p.pos.x) * 0.35;
    if (state !== 'race') continue;
    const dx = player.pos.x - p.pos.x, dz = player.pos.z - p.pos.z;
    if (dx * dx + dz * dz < 22) {
      p.active = false;
      p.g.visible = false;
      p.timer = 12;
      sfx.pickup();
      if (p.type === 'repair') {
        player.health = Math.min(100, player.health + 30);
        hud.subMessage('+30 REPAIR', 1.2);
        sparks.emit(p.pos, 50, { color: [0.3, 1, 0.5], speed: 10, life: 0.7 });
      } else {
        player.boost = Math.min(100, player.boost + 45);
        hud.subMessage('ATOMIC BOOST +45', 1.2);
        sparks.emit(p.pos, 50, { color: [1, 0.6, 0.2], speed: 10, life: 0.7 });
      }
    }
  }
}

// ---------------------------------------------------------------- visuals
function syncModels(dt) {
  for (const r of racers) {
    const m = r.model;
    m.root.position.set(r.pos.x, track.y[r.idx] || 0, r.pos.z);
    m.root.rotation.y = r.heading;
    const wrecked = r.isPlayer && state === 'wrecked';
    m.body.position.y = wrecked ? 0.1 : 0.45 + Math.sin(time * 3 + r.pos.x * 0.1) * 0.07;
    const sp = r.isPlayer ? r.vel.length() : r.speed;
    const bank = THREE.MathUtils.clamp(r.steer * 0.12, -0.25, 0.25) * Math.min(1, sp / 30);
    m.body.rotation.z += ((wrecked ? 0.3 : bank) - m.body.rotation.z) * Math.min(1, dt * 6);
    const pitch = r.isPlayer ? -r.throttle * 0.035 + (down('KeyS', 'ArrowDown') ? 0.03 : 0) : -0.02;
    m.body.rotation.x += (pitch - m.body.rotation.x) * Math.min(1, dt * 5);

    const thr = r.isPlayer ? r.throttle : Math.min(1, r.speed / 60);
    const boost = r.isPlayer && (r.boosting || r.miniT > 0);
    const len = wrecked ? 0 : 0.2 + thr * 0.4 + (boost ? 0.9 : 0) + Math.random() * 0.12;
    for (const fl of m.flames) fl.scale.set(boost ? 1.3 : 0.9, boost ? 1.3 : 0.9, len);
    m.flameMat.color.setHex(boost ? 0xffb070 : 0x9fe6ff);
    m.glowMat.opacity = wrecked ? 0 : 0.45 + Math.sin(time * 9) * 0.08;
  }
  // shield bubble
  shieldMesh.visible = player.shield > 0;
  if (shieldMesh.visible) {
    const u = shieldMesh.material.uniforms;
    u.uTime.value = time;
    u.uOpacity.value = Math.min(1, player.shield * 2) * (player.shield < 1 ? 0.5 + 0.5 * Math.sin(time * 30) : 1);
  }
}

function snapCamera() {
  const f = new V3(Math.sin(player.heading), 0, Math.cos(player.heading));
  camOffset.copy(f).multiplyScalar(-11.5).setY(4.4);
  camPos.copy(player.pos).add(camOffset);
  camLook.copy(player.pos).addScaledVector(f, 8).setY(1.6);
}

function updateCamera(dt) {
  if (state === 'menu') {
    const smp = track.sampleAt(track.startDist - 10);
    const a = time * 0.15;
    camera.position.set(smp.pos.x + Math.sin(a) * 34, 9 + Math.sin(time * 0.3) * 2, smp.pos.z + Math.cos(a) * 34);
    camera.lookAt(smp.pos.x, 3, smp.pos.z);
    return;
  }
  const sp = player.vel.length();
  camHeading += angDiff(player.heading, camHeading) * Math.min(1, dt * 5);
  const f = new V3(Math.sin(camHeading), 0, Math.cos(camHeading));
  const dist = 11.5 + sp * 0.025;
  // smooth the offset from the car, not the absolute position, so the camera never falls behind at speed
  const want = f.clone().multiplyScalar(-dist);
  want.y = 4.4 + sp * 0.012;
  camOffset.lerp(want, 1 - Math.exp(-6 * dt));
  camPos.copy(player.pos).add(camOffset);
  camLook.copy(player.pos).addScaledVector(f, 8);
  camLook.y = 1.7;
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake * 0.6;
    camera.position.z += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 2.5);
  }
  camera.lookAt(camLook);
  const fov = 60 + Math.min(sp, 130) * 0.13 + (player.boosting || player.miniT > 0 ? 7 : 0);
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

function placeOf(r) {
  const finished = racers.filter((x) => x.finished).sort((a, b) => a.finishTime - b.finishTime);
  if (r.finished) return finished.indexOf(r) + 1;
  const ahead = racers.filter((x) => x !== r && !x.finished && x.s > r.s).length;
  return finished.length + ahead + 1;
}

// ---------------------------------------------------------------- results + leaderboard
// Served by app.py there is a shared leaderboard API. On a static host (GitHub Pages) there is
// no server, so best times are kept on this device instead.
const LOCAL_SCORES = 'gumshoe-scores';
let boardMode = location.hostname.endsWith('github.io') ? 'local' : null; // else decided by the first request
const topScores = (list, n = 10) => list.slice().sort((a, b) => a.position - b.position || a.time - b.time).slice(0, n);
function localScores() {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_SCORES) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
async function fetchScores() {
  if (boardMode !== 'local') {
    try {
      const res = await fetch('api/scores');
      if (res.ok && (res.headers.get('content-type') || '').includes('json')) {
        boardMode = 'server';
        return await res.json();
      }
    } catch { /* no server */ }
    boardMode = 'local';
  }
  document.querySelector('.board h3').textContent = 'YOUR BEST TIMES';
  return topScores(localScores());
}
async function saveScore(entry) {
  if (boardMode === 'server') {
    const res = await fetch('api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    return res.json();
  }
  const all = topScores([...localScores(), entry], 100);
  try { localStorage.setItem(LOCAL_SCORES, JSON.stringify(all)); } catch { /* storage unavailable */ }
  const scores = topScores(all);
  return { scores, rank: scores.indexOf(entry) + 1 || null };
}

async function loadBoard(el, highlight) {
  try {
    renderBoard(el, await fetchScores(), highlight);
  } catch {
    el.innerHTML = '<li class="empty">Leaderboard offline.</li>';
  }
}

function renderBoard(el, scores, highlight) {
  if (!scores.length) { el.innerHTML = '<li class="empty">No times yet. Be the first.</li>'; return; }
  el.innerHTML = '';
  scores.forEach((s, i) => {
    const li = document.createElement('li');
    const ord = ['1st', '2nd', '3rd', '4th'][s.position - 1];
    li.textContent = `${s.name} (${ord}) `;
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = HUD.fmt(s.time);
    li.appendChild(t);
    if (highlight && highlight === i + 1) li.className = 'me';
    el.appendChild(li);
  });
}

function showResults() {
  state = 'over';
  sfx.music(false);
  const won = player.finished;
  $('res-title').textContent = won ? (player.place === 1 ? 'CASE CLOSED!' : 'FINISHED') : 'WRECKED';
  const stats = $('res-stats');
  stats.innerHTML = '';
  const line = (k, v) => { const d = document.createElement('div'); d.innerHTML = `<b>${k}</b> `; d.append(v); stats.appendChild(d); };
  if (won) {
    line('PLACE', ['1st', '2nd', '3rd', '4th'][player.place - 1]);
    line('TIME', HUD.fmt(player.finishTime));
    line('BEST LAP', HUD.fmt(player.bestLap));
  } else {
    line('LAP', `${Math.max(1, player.lap + 1)} of ${LAPS}`);
    line('', 'Use the shield (E) when you see a red ring under you.');
  }
  $('score-form').classList.toggle('hidden', !won);
  $('score-form').querySelector('button').disabled = false;
  $('results').classList.remove('hidden');
  loadBoard($('res-board'));
  if (won) setTimeout(() => $('name-input').focus(), 50);
}

$('score-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  const name = $('name-input').value.trim() || 'Gumshoe';
  try {
    localStorage.setItem('gumshoe-name', name);
  } catch { /* storage unavailable */ }
  try {
    const data = await saveScore({
      name, time: +player.finishTime.toFixed(2), position: player.place, bestLap: +player.bestLap.toFixed(2),
      date: new Date().toISOString().slice(0, 10),
    });
    if (data.scores) renderBoard($('res-board'), data.scores, data.rank);
    $('score-form').classList.add('hidden');
  } catch {
    btn.disabled = false;
  }
});
try { $('name-input').value = localStorage.getItem('gumshoe-name') || ''; } catch { /* storage unavailable */ }

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
const DEBUG = new URLSearchParams(location.search).has('debug');
const DT_MAX = DEBUG ? 0.1 : 0.05;
if (DEBUG) {
  window.gumshoe = { player, rivals, atk, track, ufo, fireLaser, keys, stick, sfx, get state() { return state; }, get raceTime() { return raceTime; } };
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), DT_MAX);
  time += dt;

  if (state === 'countdown') {
    countdown -= dt;
    const n = Math.ceil(countdown - 0.5);
    if (n !== lastBeep && countdown < 3.5) {
      lastBeep = n;
      if (n > 0) { hud.message(String(n), 0.9); sfx.beep(false); }
    }
    if (countdown <= 0.5) {
      state = 'race';
      hud.message('GO!', 1, 'Outrun the saucer!');
      sfx.music(true);
      sfx.beep(true);
    }
  }

  const racing = state === 'race' || state === 'finished' || state === 'wrecked';
  if (state === 'race') raceTime += dt;
  if (state === 'race' || state === 'finished') updatePlayer(dt, state === 'race');
  if (state === 'wrecked') {
    player.vel.multiplyScalar(Math.exp(-2 * dt));
    player.pos.addScaledVector(player.vel, dt);
  }
  updateRivals(dt, racing);

  if (player.shield > 0) player.shield = Math.max(0, player.shield - dt);
  if (player.shieldCd > 0) player.shieldCd = Math.max(0, player.shieldCd - dt);

  if ((state === 'finished' || state === 'wrecked') && (endTimer -= dt) <= 0) showResults();

  updateSaucer(dt);
  updatePickups(dt);
  syncModels(dt);
  sparks.update(dt);
  beam.update(dt);
  shock.update(dt);
  updateCamera(dt);

  sun.position.copy(player.pos).addScaledVector(SUN_DIR, 320);
  sun.target.position.copy(player.pos);

  if (state !== 'menu') {
    sfx.engine(player.vel.length(), player.throttle, player.boosting || player.miniT > 0, state !== 'wrecked');
    sfx.drift(state === 'race' ? player.driftSnd : 0, player.driftTier);
    hud.update(dt, {
      health: player.health, lap: Math.max(1, player.lap + 1), laps: LAPS,
      place: player.finished ? player.place : placeOf(player), total: racers.length,
      time: player.finished ? player.finishTime : raceTime,
      mph: player.vel.length() * MPH, boost: player.boost, boostLock: player.boostLock,
      px: player.pos.x, pz: player.pos.z, heading: camHeading,
      racers, ufo: ufo.group.position, target: atk.state === 'aim' ? atk.point : null, t: time,
      shield: player.shield, shieldCd: player.shieldCd, shieldCdMax: SHIELD_CD,
    });
  } else {
    sfx.engine(0, 0, false, false);
    sfx.drift(0, 0);
    sfx.ufo(1e9, 0);
  }

  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

placeOnGrid();
syncModels(0);
$('loading').classList.add('hidden');
showMenu();
frame();
