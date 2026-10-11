// The chrome-gold flying saucer that hunts the player.
import * as THREE from 'three';
import { glowTex } from './textures.js';

export class UFO {
  constructor(scene) {
    this.group = new THREE.Group();
    this.spin = new THREE.Group();
    this.group.add(this.spin);
    const metal = new THREE.MeshStandardMaterial({ color: 0xe0cfa6, metalness: 0.75, roughness: 0.28, emissive: 0x2a2418 });
    const metal2 = new THREE.MeshStandardMaterial({ color: 0xa79a80, metalness: 1, roughness: 0.32 });

    const profile = [[0, -1.7], [2.4, -1.5], [5, -1.0], [8, -0.35], [10, 0], [9.6, 0.35], [7, 0.85], [4, 1.35], [0, 1.5]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    const hull = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), metal);
    hull.castShadow = true;
    this.spin.add(hull);

    const dome = new THREE.Mesh(new THREE.SphereGeometry(3.7, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), metal2);
    dome.position.y = 1.3;
    dome.castShadow = true;
    this.spin.add(dome);

    const portMat = new THREE.MeshStandardMaterial({ color: 0x1a222c, metalness: 0.6, roughness: 0.2, emissive: 0x223344 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 8), portMat);
      p.position.set(Math.cos(a) * 3.15, 3.0, Math.sin(a) * 3.15);
      p.scale.set(1, 0.6, 1);
      this.spin.add(p);
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(8.1, 0.28, 10, 64), metal2);
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.3;
    this.spin.add(band);

    this.rim = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffcc66 }));
      l.position.set(Math.cos(a) * 9.85, 0.12, Math.sin(a) * 9.85);
      this.spin.add(l);
      this.rim.push(l);
    }

    this.core = new THREE.Mesh(new THREE.SphereGeometry(1.5, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffb36b }));
    this.core.position.y = -1.6;
    this.group.add(this.core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex(), color: 0xffa050, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.set(9, 9, 1);
    halo.position.y = -1.8;
    this.halo = halo;
    this.group.add(halo);

    this.light = new THREE.PointLight(0xffa060, 0, 160, 1.4);
    this.light.position.y = -3;
    this.group.add(this.light);

    this.group.scale.setScalar(0.9);
    this.group.position.set(0, 40, 0);
    this.charge = 0;
    this.rage = 0; // 0..2, rises each lap
    scene.add(this.group);
  }

  get emitter() {
    return this.core.getWorldPosition(new THREE.Vector3());
  }

  update(dt, t, target) {
    this.group.position.lerp(target, 1 - Math.exp(-1.3 * dt));
    this.spin.rotation.y += dt * 1.6 * (1 + this.rage * 0.7);
    this.group.rotation.z = Math.sin(t * 0.7) * 0.07;
    this.group.rotation.x = Math.cos(t * 0.53) * 0.05;
    this.rim.forEach((l, i) => {
      const on = (Math.floor(t * 12) + i) % 4 === 0;
      const idle = this.rage >= 2 ? (i % 2 ? 0xff2a1a : 0xff6040) : this.rage >= 1 ? (i % 2 ? 0xff5a2a : 0xffa050) : (i % 2 ? 0xff7a3a : 0xffcc66);
      l.material.color.setHex(on ? 0xffffff : idle);
    });
    const c = this.charge;
    this.core.scale.setScalar(1 + c * 0.5 + Math.sin(t * 30) * 0.05 * c);
    this.core.material.color.setHex(c > 0.05 ? 0xff5533 : [0xffb36b, 0xff8a4a, 0xff4a2a][this.rage]);
    this.halo.material.color.setHex([0xffa050, 0xff7a3a, 0xff3a22][this.rage]);
    this.halo.material.opacity = 0.5 + c * 0.5;
    this.light.intensity *= Math.exp(-8 * dt);
  }
}
