// Figure-eight street circuit: centreline sampling, spatial lookup and road meshes.
import * as THREE from 'three';
import { roadTex, walkTex, checkerTex, bannerTex } from './textures.js';

export const ROAD_HALF = 13;   // half width of the asphalt
export const WALK = 7;         // sidewalk width
export const WALL = ROAD_HALF + WALK - 1.6; // where the car hits the kerb line of buildings

const S = 1.35;
// Two rounded lobes that cross at the origin (a flat four-way intersection).
const CTRL = [
  [230, -210], [390, -215], [480, -130], [490, 40], [430, 170], [300, 215], [190, 170], [110, 110],
  [-110, -110], [-210, -210], [-380, -220], [-480, -120], [-490, 60], [-420, 180], [-280, 215],
  [-180, 170], [-110, 110], [110, -110],
];

export class Track {
  constructor() {
    const ctrl = CTRL.map(([x, z]) => new THREE.Vector3(x * S, 0, z * S));
    this.curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
    this.length = this.curve.getLength();
    const M = (this.M = Math.round(this.length / 2));
    this.step = this.length / M;
    const pts = this.curve.getSpacedPoints(M);
    pts.pop();
    this.pts = pts;

    this.tan = [];
    this.right = [];
    for (let i = 0; i < M; i++) {
      const a = pts[(i - 1 + M) % M], b = pts[(i + 1) % M];
      const t = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
      this.tan.push(t);
      this.right.push(new THREE.Vector3(-t.z, 0, t.x));
    }

    this.curv = new Float32Array(M);
    for (let i = 0; i < M; i++) {
      const a = this.tan[(i - 8 + M) % M], b = this.tan[(i + 8) % M];
      this.curv[i] = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) / (16 * this.step);
    }

    this.cell = 20;
    this.grid = new Map();
    pts.forEach((p, i) => {
      const k = this.key(Math.floor(p.x / this.cell), Math.floor(p.z / this.cell));
      let arr = this.grid.get(k);
      if (!arr) this.grid.set(k, (arr = []));
      arr.push(i);
    });

    // The second pass through the crossing sits a hair higher so the two road
    // surfaces never z-fight.
    let i1 = 0;
    for (let i = 0; i < M; i++) if (pts[i].lengthSq() < pts[i1].lengthSq()) i1 = i;
    let i2 = -1;
    for (let i = 0; i < M; i++) {
      if (this.cyc(i, i1) < M / 4) continue;
      if (i2 < 0 || pts[i].lengthSq() < pts[i2].lengthSq()) i2 = i;
    }
    this.y = new Float32Array(M);
    for (let i = 0; i < M; i++) {
      const d = this.cyc(i, i2);
      if (d < 60) this.y[i] = 0.08 * THREE.MathUtils.smoothstep(1 - d / 60, 0, 0.5);
    }

    let si = 0, bd = Infinity;
    for (let i = 0; i < M; i++) {
      const d = (pts[i].x - 300 * S) ** 2 + (pts[i].z + 213 * S) ** 2;
      if (d < bd) { bd = d; si = i; }
    }
    this.startIdx = si;
    this.startDist = si * this.step;
  }

  key(cx, cz) { return (cx + 5000) * 10000 + (cz + 5000); }

  cyc(a, b) {
    const d = Math.abs(a - b) % this.M;
    return Math.min(d, this.M - d);
  }

  // Nearest centreline sample within maxR. Optionally ignore samples within
  // `gap` indices of exclI (used to ask "is a *different* stretch of road here?").
  nearest(x, z, maxR = 60, exclI = -1, gap = 0) {
    const c = this.cell, r = Math.ceil(maxR / c);
    const cx = Math.floor(x / c), cz = Math.floor(z / c);
    let best = -1, bd = maxR * maxR;
    for (let i = cx - r; i <= cx + r; i++) {
      for (let j = cz - r; j <= cz + r; j++) {
        const arr = this.grid.get(this.key(i, j));
        if (!arr) continue;
        for (const k of arr) {
          if (exclI >= 0 && this.cyc(k, exclI) <= gap) continue;
          const p = this.pts[k];
          const dx = p.x - x, dz = p.z - z, d = dx * dx + dz * dz;
          if (d < bd) { bd = d; best = k; }
        }
      }
    }
    return { i: best, d: best >= 0 ? Math.sqrt(bd) : Infinity };
  }

  // Nearest sample in a window around a hint; keeps progress on the right
  // branch when driving through the crossing.
  nearestLocal(x, z, hint, win = 40) {
    let best = hint, bd = Infinity;
    for (let o = -win; o <= win; o++) {
      const k = (hint + o + this.M) % this.M;
      const p = this.pts[k];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }

  sampleAt(dist) {
    const L = this.length;
    const d = ((dist % L) + L) % L;
    const f = d / this.step;
    const i = Math.floor(f) % this.M, j = (i + 1) % this.M, t = f - Math.floor(f);
    const pos = new THREE.Vector3().lerpVectors(this.pts[i], this.pts[j], t);
    pos.y = this.y[i];
    const tan = new THREE.Vector3().lerpVectors(this.tan[i], this.tan[j], t).normalize();
    const right = new THREE.Vector3(-tan.z, 0, tan.x);
    return { pos, tan, right, i };
  }

  addToScene(scene) {
    const M = this.M, pts = this.pts;

    // --- asphalt ribbon
    const dashLen = this.length / Math.round(this.length / 26);
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= M; i++) {
      const k = i % M, p = pts[k], r = this.right[k], y = this.y[k] + 0.02;
      pos.push(p.x - r.x * ROAD_HALF, y, p.z - r.z * ROAD_HALF, p.x + r.x * ROAD_HALF, y, p.z + r.z * ROAD_HALF);
      const v = (i * this.step) / dashLen;
      uv.push(0, v, 1, v);
      if (i < M) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    rg.setIndex(idx);
    rg.computeVertexNormals();
    const road = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: roadTex(), roughness: 0.92, metalness: 0, envMapIntensity: 0.4 }));
    road.receiveShadow = true;
    scene.add(road);

    // --- raised sidewalks + kerb faces, cut away where they'd cover the other road
    const wp = [], wu = [];
    const H = 0.22;
    const pushQuad = (a, b, c, d, ua, ub, uc, ud) => {
      wp.push(...a, ...b, ...c, ...b, ...d, ...c);
      wu.push(...ua, ...ub, ...uc, ...ub, ...ud, ...uc);
    };
    const at = (k, off, y) => {
      const p = pts[k], r = this.right[k];
      return [p.x + r.x * off, y, p.z + r.z * off];
    };
    const blocked = (k, off) => {
      const [x, , z] = at(k, off, 0);
      return this.nearest(x, z, ROAD_HALF + 0.5, k, 40).i >= 0;
    };
    for (const side of [-1, 1]) {
      const o1 = side > 0 ? ROAD_HALF : -ROAD_HALF - WALK;
      const o2 = side > 0 ? ROAD_HALF + WALK : -ROAD_HALF;
      const kerb = side * ROAD_HALF;
      for (let i = 0; i < M; i++) {
        const k = i, k2 = (i + 1) % M;
        if (blocked(k, o1) || blocked(k, o2) || blocked(k2, o1) || blocked(k2, o2)) continue;
        const y1 = this.y[k] + H, y2 = this.y[k2] + H;
        const v1 = (i * this.step) / 8, v2 = ((i + 1) * this.step) / 8;
        pushQuad(at(k, o1, y1), at(k, o2, y1), at(k2, o1, y2), at(k2, o2, y2),
          [o1 / 8, v1], [o2 / 8, v1], [o1 / 8, v2], [o2 / 8, v2]);
        pushQuad(at(k, kerb, this.y[k]), at(k, kerb, y1), at(k2, kerb, this.y[k2]), at(k2, kerb, y2),
          [0, v1], [0.03, v1], [0, v2], [0.03, v2]);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(wu, 2));
    wg.computeVertexNormals();
    const walk = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: walkTex(), roughness: 0.95, side: THREE.DoubleSide, envMapIntensity: 0.4 }));
    walk.receiveShadow = true;
    scene.add(walk);

    // --- start/finish line + gantry
    const s = this.startIdx, p = pts[s], r = this.right[s], t = this.tan[s];
    const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 3), new THREE.MeshStandardMaterial({ map: checkerTex(), roughness: 0.8 }));
    line.material.map.repeat.set(2, 1);
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = Math.atan2(-r.z, r.x);
    line.position.set(p.x, this.y[s] + 0.04, p.z);
    line.receiveShadow = true;
    scene.add(line);

    const gantry = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.9, roughness: 0.25 });
    for (const sd of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 13, 12), metal);
      pole.position.set(sd * (ROAD_HALF + 2), 6.5, 0);
      pole.castShadow = true;
      gantry.add(pole);
    }
    const signMat = new THREE.MeshStandardMaterial({ map: bannerTex('ATOMIC GUMSHOE GRAND PRIX'), roughness: 0.6 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2 + 6, 3.6, 0.6),
      [metal, metal, metal, metal, signMat, signMat]);
    sign.position.y = 11.5;
    sign.castShadow = true;
    gantry.add(sign);
    // checker flags on top
    const flagMat = new THREE.MeshStandardMaterial({ map: checkerTex(), side: THREE.DoubleSide });
    for (const sd of [-1, 1]) {
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.6), flagMat);
      flag.position.set(sd * (ROAD_HALF + 2), 14.2, 0);
      gantry.add(flag);
    }
    gantry.position.set(p.x, this.y[s], p.z);
    gantry.rotation.y = Math.atan2(t.x, t.z);
    scene.add(gantry);
  }
}
