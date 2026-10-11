// Procedural 1950s downtown: buildings hug the circuit, a block grid fills the
// rest, and a skyline ring sits in the haze. Geometry is merged per material so
// the whole city is a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ROAD_HALF, WALK } from './track.js';
import * as T from './textures.js';

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TILE = 16;

function boxGeo(w, h, d, x, z, ang, y0 = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const faceW = [d, d, w, w, w, w];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (f === 2 || f === 3) uv.setXY(i, 0.02, 0.02);
      else uv.setXY(i, (uv.getX(i) * faceW[f]) / TILE, (uv.getY(i) * h) / TILE);
    }
  }
  g.translate(0, y0 + h / 2, 0);
  g.rotateY(ang);
  g.translate(x, 0, z);
  return g;
}

function place(g, lx, ly, lz, ang, x, z) {
  g.translate(lx, ly, lz);
  g.rotateY(ang);
  g.translate(x, 0, z);
  return g;
}

export function buildCity(scene, track) {
  const rnd = rng(1958);
  const R = (a, b) => a + (b - a) * rnd();

  const facades = T.facadeTextures();
  const geos = facades.map(() => []);
  const shopGeos = [], trimGeos = [], roofGeos = [];
  const awnColors = [['#2c5aa0', '#f2f2f2'], ['#3f8a5a', '#f4efe2'], ['#c0392b', '#f4efe2']];
  const awnGeos = awnColors.map(() => []);

  const CLEAR = ROAD_HALF + WALK + 0.6;
  const centers = new Map();
  const ck = (x, z) => `${Math.floor(x / 30)},${Math.floor(z / 30)}`;
  const tooClose = (x, z, r) => {
    const cx = Math.floor(x / 30), cz = Math.floor(z / 30);
    for (let i = cx - 1; i <= cx + 1; i++) for (let j = cz - 1; j <= cz + 1; j++) {
      const arr = centers.get(`${i},${j}`);
      if (arr) for (const [px, pz] of arr) if ((px - x) ** 2 + (pz - z) ** 2 < r * r) return true;
    }
    return false;
  };
  const remember = (x, z) => {
    const k = ck(x, z);
    if (!centers.has(k)) centers.set(k, []);
    centers.get(k).push([x, z]);
  };
  const okBox = (x, z, w, d, ang, clear) => {
    const c = Math.cos(ang), s = Math.sin(ang);
    const probes = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, -d / 2], [0, d / 2], [-w / 2, 0], [w / 2, 0], [0, 0]];
    for (const [lx, lz] of probes) {
      if (track.nearest(x + lx * c + lz * s, z - lx * s + lz * c, clear).i >= 0) return false;
    }
    return true;
  };

  const addBuilding = (x, z, w, d, h, ang, style, streetSide) => {
    geos[style].push(boxGeo(w, h, d, x, z, ang));
    // cornice
    trimGeos.push(boxGeo(w + 0.8, 0.9, d + 0.8, x, z, ang, h - 0.3));
    // rooftop clutter
    if (rnd() < 0.6) {
      const bw = R(2.5, 5), bd = R(2.5, 5), bh = R(1.5, 4);
      roofGeos.push(place(new THREE.BoxGeometry(bw, bh, bd), R(-w / 4, w / 4), h + bh / 2, R(-d / 4, d / 4), ang, x, z));
    }
    if (rnd() < 0.25) {
      // water tower
      const tx = R(-w / 4, w / 4), tz = R(-d / 4, d / 4);
      roofGeos.push(place(new THREE.BoxGeometry(2.4, 1.9, 2.4), tx, h + 0.95, tz, ang, x, z));
      roofGeos.push(place(new THREE.CylinderGeometry(1.6, 1.6, 3, 10), tx, h + 3.4, tz, ang, x, z));
      roofGeos.push(place(new THREE.ConeGeometry(1.8, 1.2, 10), tx, h + 5.5, tz, ang, x, z));
    }
    if (streetSide) {
      // ground-floor shopfront and awning on the face that looks at the road
      const zf = -streetSide * (d / 2 + 0.25);
      shopGeos.push(place(new THREE.BoxGeometry(w * 0.88, 4.4, 0.5), 0, 2.4, zf, ang, x, z));
      if (rnd() < 0.75) {
        const a = new THREE.BoxGeometry(w * 0.8, 0.14, 2.8);
        a.rotateX(-streetSide * 0.38);
        awnGeos[(rnd() * awnGeos.length) | 0].push(place(a, 0, 5.1, -streetSide * (d / 2 + 1.5), ang, x, z));
      }
    }
  };

  // --- buildings lining both sides of the circuit
  for (let s = 0; s < track.length; s += R(15, 21)) {
    for (const side of [-1, 1]) {
      const smp = track.sampleAt(s);
      const w = R(14, 22), d = R(16, 30);
      let h = R(16, 52);
      if (rnd() < 0.18) h = R(60, 115);
      const off = CLEAR + d / 2 + R(0, 1.2);
      const x = smp.pos.x + smp.right.x * side * off;
      const z = smp.pos.z + smp.right.z * side * off;
      const ang = Math.atan2(smp.right.x, smp.right.z);
      if (!okBox(x, z, w, d, ang, CLEAR)) continue;
      if (tooClose(x, z, Math.min(w, d) * 0.55)) continue;
      remember(x, z);
      const style = (rnd() * facades.length) | 0;
      addBuilding(x, z, w, d, h, ang, style, side);
    }
  }

  // --- block-grid infill
  for (let gx = -1100; gx <= 1100; gx += 40) {
    for (let gz = -760; gz <= 760; gz += 40) {
      const x = gx + R(-5, 5), z = gz + R(-5, 5);
      const w = R(20, 32), d = R(20, 32);
      const dist = Math.hypot(x, z);
      const h = R(18, 70) * (1 + dist / 900) + (rnd() < 0.08 ? 60 : 0);
      if (!okBox(x, z, w, d, 0, CLEAR + 16)) continue;
      if (tooClose(x, z, 14)) continue;
      remember(x, z);
      addBuilding(x, z, w, d, h, 0, (rnd() * facades.length) | 0, 0);
    }
  }

  // --- skyline ring in the haze
  for (let i = 0; i < 150; i++) {
    const a = (i / 150) * Math.PI * 2 + R(-0.02, 0.02);
    const rad = R(1350, 1750);
    const style = rnd() < 0.5 ? 2 : (rnd() * facades.length) | 0;
    geos[style].push(boxGeo(R(40, 80), R(80, 260), R(40, 80), Math.cos(a) * rad, Math.sin(a) * rad * 0.8, a));
  }

  // --- meshes
  facades.forEach((f, i) => {
    if (!geos[i].length) return;
    const mat = new THREE.MeshStandardMaterial({
      map: f.tex,
      roughness: f.glass ? 0.25 : 0.88,
      metalness: f.glass ? 0.55 : 0.0,
      envMapIntensity: f.glass ? 1.0 : 0.35,
    });
    const m = new THREE.Mesh(mergeGeometries(geos[i]), mat);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  });
  const simple = (list, mat, shadow = true) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))), mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
  };
  simple(trimGeos, new THREE.MeshStandardMaterial({ color: 0xd8cfbd, roughness: 0.8, envMapIntensity: 0.35 }));
  simple(roofGeos, new THREE.MeshStandardMaterial({ color: 0x6f6a64, roughness: 0.9, envMapIntensity: 0.3 }));
  simple(shopGeos, new THREE.MeshStandardMaterial({ map: T.shopTex(), roughness: 0.4, envMapIntensity: 0.6, emissive: 0x2a1a08 }), false);
  awnColors.forEach(([a, b], i) => simple(awnGeos[i], new THREE.MeshStandardMaterial({ map: T.awningTex(a, b), roughness: 0.75, envMapIntensity: 0.35 })));

  // --- street lamps
  const lampPos = [];
  for (let s = 0; s < track.length; s += 46) {
    for (const side of [-1, 1]) {
      const smp = track.sampleAt(s + side * 11);
      const off = side * (ROAD_HALF + 1.4);
      const x = smp.pos.x + smp.right.x * off, z = smp.pos.z + smp.right.z * off;
      if (track.nearest(x, z, ROAD_HALF + 3, smp.i, 30).i >= 0) continue;
      lampPos.push({ x, z, ang: Math.atan2(smp.right.x, smp.right.z), side });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.22, 8, 8).translate(0, 4, 0);
  const headGeo = new THREE.BoxGeometry(0.5, 0.35, 2.6);
  const bulbGeo = new THREE.SphereGeometry(0.28, 10, 8);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x3d4a52, metalness: 0.7, roughness: 0.4 });
  const poles = new THREE.InstancedMesh(poleGeo, lampMat, lampPos.length);
  const heads = new THREE.InstancedMesh(headGeo, lampMat, lampPos.length);
  const bulbs = new THREE.InstancedMesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0xfff1c8 }), lampPos.length);
  const dummy = new THREE.Object3D();
  lampPos.forEach((l, i) => {
    dummy.position.set(l.x, 0, l.z); dummy.rotation.set(0, l.ang, 0); dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    const inward = -l.side * 1.2;
    dummy.position.set(l.x + Math.sin(l.ang) * inward, 8, l.z + Math.cos(l.ang) * inward); dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 7.75;
    dummy.position.x = l.x + Math.sin(l.ang) * inward * 1.6;
    dummy.position.z = l.z + Math.cos(l.ang) * inward * 1.6;
    dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
  });
  poles.castShadow = heads.castShadow = true;
  scene.add(poles, heads, bulbs);

  // --- ground
  const gt = T.groundTex();
  gt.repeat.set(300, 300);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ map: gt, roughness: 1, envMapIntensity: 0.3 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  scene.add(ground);
}
