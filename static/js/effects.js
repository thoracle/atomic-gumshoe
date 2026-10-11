// Sparks, laser beams, target markers and shockwaves.
import * as THREE from 'three';
import { dotTex } from './textures.js';

export class Sparks {
  constructor(scene, max = 1500) {
    this.max = max;
    this.next = 0;
    this.pos = new Float32Array(max * 3).fill(-9999);
    this.col = new Float32Array(max * 3);
    this.base = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max).fill(1);
    this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = g;
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.55, map: dotTex(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(p, count, { speed = 18, up = 6, color = [1, 0.75, 0.35], life = 0.8, dir = null, spread = 1 } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.next++ % this.max, i3 = i * 3;
      let vx = (Math.random() * 2 - 1), vy = Math.random(), vz = (Math.random() * 2 - 1);
      const s = speed * (0.3 + Math.random() * 0.7);
      if (dir) {
        vx = dir.x + vx * spread; vy = dir.y + vy * spread; vz = dir.z + vz * spread;
      }
      const len = Math.hypot(vx, vy, vz) || 1;
      this.pos[i3] = p.x; this.pos[i3 + 1] = p.y; this.pos[i3 + 2] = p.z;
      this.vel[i3] = (vx / len) * s; this.vel[i3 + 1] = (vy / len) * s + up * Math.random(); this.vel[i3 + 2] = (vz / len) * s;
      const tint = 0.8 + Math.random() * 0.4;
      this.base[i3] = color[0] * tint; this.base[i3 + 1] = color[1] * tint; this.base[i3 + 2] = color[2] * tint;
      this.life[i] = this.maxLife[i] = life * (0.5 + Math.random() * 0.8);
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      const i3 = i * 3;
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i3 + 1] = -9999; this.col[i3] = this.col[i3 + 1] = this.col[i3 + 2] = 0; continue; }
      this.vel[i3 + 1] -= 28 * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.pos[i3 + 1] < 0.1) { this.pos[i3 + 1] = 0.1; this.vel[i3 + 1] *= -0.35; this.vel[i3] *= 0.7; this.vel[i3 + 2] *= 0.7; }
      const k = this.life[i] / this.maxLife[i];
      this.col[i3] = this.base[i3] * k; this.col[i3 + 1] = this.base[i3 + 1] * k * k; this.col[i3 + 2] = this.base[i3 + 2] * k * k;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

export class Beam {
  constructor(scene, outer = 0xff9a3c, inner = 0xfff4d6) {
    this.group = new THREE.Group();
    const geo = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0);
    const mk = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    this.outer = new THREE.Mesh(geo, mk(outer, 0.55));
    this.inner = new THREE.Mesh(geo, mk(inner, 0.95));
    this.group.add(this.outer, this.inner);
    this.group.visible = false;
    this.t = 0;
    this.dur = 1;
    this.width = 1;
    scene.add(this.group);
  }

  set(a, b, width) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    this.group.position.copy(a);
    this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.len = len;
    this.width = width;
    this.group.visible = true;
  }

  fire(a, b, dur = 0.35, width = 0.9) {
    this.set(a, b, width);
    this.t = this.dur = dur;
  }

  update(dt) {
    if (this.t <= 0) return;
    this.t -= dt;
    const k = Math.max(0, this.t / this.dur);
    const w = this.width * (0.6 + 0.4 * Math.random()) * (0.4 + 0.6 * k);
    this.outer.scale.set(w * 1.8, this.len, w * 1.8);
    this.inner.scale.set(w * 0.6, this.len, w * 0.6);
    this.outer.material.opacity = 0.55 * k;
    this.inner.material.opacity = 0.95 * k;
    if (this.t <= 0) this.group.visible = false;
  }
}

export class Marker {
  constructor(scene) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.2, 7.2, 48).rotateX(-Math.PI / 2), mat);
    const inner = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.8, 24).rotateX(-Math.PI / 2), mat);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(7.2, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ring = ring;
    this.fill = fill;
    this.group.add(ring, inner, fill);
    for (let i = 0; i < 4; i++) {
      const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 2.5).rotateX(-Math.PI / 2), mat);
      const a = (i / 4) * Math.PI * 2;
      tick.position.set(Math.cos(a) * 4, 0, Math.sin(a) * 4);
      tick.rotation.y = -a + Math.PI / 2;
      this.group.add(tick);
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  show(p) {
    this.group.position.set(p.x, 0.12, p.z);
    this.group.visible = true;
  }

  hide() { this.group.visible = false; }

  update(t, k) {
    if (!this.group.visible) return;
    const s = 1.3 - 0.3 * k;
    this.ring.scale.setScalar(s);
    this.group.rotation.y = t * 2;
    this.fill.material.opacity = 0.1 + 0.25 * k * (0.5 + 0.5 * Math.sin(t * 30));
  }
}

export class Shockwaves {
  constructor(scene) {
    this.items = [];
    this.scene = scene;
    this.geo = new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2);
  }

  spawn(p, color = 0xffb060, size = 14) {
    const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    m.position.set(p.x, 0.3, p.z);
    this.scene.add(m);
    this.items.push({ m, t: 0, size });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt * 2.2;
      it.m.scale.setScalar(1 + it.t * it.size);
      it.m.material.opacity = Math.max(0, 1 - it.t);
      if (it.t >= 1) {
        this.scene.remove(it.m);
        it.m.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }
}
