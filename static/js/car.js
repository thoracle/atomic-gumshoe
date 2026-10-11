// The atomic hover car: rounded red body, glass bubble dome, helmeted driver,
// twin chrome jet thrusters and glowing hover pads. Built from primitives.
import * as THREE from 'three';
import { glowTex } from './textures.js';

const chrome = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, metalness: 1, roughness: 0.1 });
const darkChrome = new THREE.MeshStandardMaterial({ color: 0x4e545b, metalness: 0.9, roughness: 0.3 });
const glass = new THREE.MeshPhysicalMaterial({
  color: 0xeaf6ff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.2,
  envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide,
});
const seatMat = new THREE.MeshStandardMaterial({ color: 0x6b1d1a, roughness: 0.6 });
const coatMat = new THREE.MeshStandardMaterial({ color: 0x6e6648, roughness: 0.85 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0xc9946c, roughness: 0.7 });
const helmetMat = new THREE.MeshStandardMaterial({ color: 0x2b2a2c, roughness: 0.45, metalness: 0.2 });
const lensMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff1c0, emissiveIntensity: 0.7, roughness: 0.1 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
const padGlowMat = new THREE.MeshBasicMaterial({ color: 0x8eeeff });
const nozzleGlowMat = new THREE.MeshBasicMaterial({ color: 0x7fdcff });
let groundGlowTex;

export function buildCar(color) {
  groundGlowTex ||= glowTex();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const paint = new THREE.MeshPhysicalMaterial({
    color, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06,
  });
  const add = (geo, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // hull
  const hull = add(new THREE.CapsuleGeometry(1, 3.6, 10, 28), paint, 0, 0.78, 0);
  hull.rotation.x = Math.PI / 2;
  hull.scale.set(1.22, 1, 0.52);
  // bulging fenders
  const fender = new THREE.SphereGeometry(1, 24, 16);
  for (const sx of [-1, 1]) {
    for (const [fz, len] of [[1.75, 1.15], [-1.6, 1.3]]) {
      const f = add(fender, paint, sx * 0.98, 0.66, fz);
      f.scale.set(0.55, 0.52, len);
    }
  }
  // big round headlights in the front fenders (like the key art)
  for (const sx of [-1, 1]) {
    const rim = add(new THREE.TorusGeometry(0.34, 0.07, 10, 24), chrome, sx * 0.98, 0.78, 2.78);
    rim.rotation.y = sx * 0.15;
    add(new THREE.SphereGeometry(0.31, 16, 12), lensMat, sx * 0.98, 0.78, 2.72).scale.set(1, 1, 0.5);
  }
  // bumpers
  for (const z of [2.98, -2.95]) {
    const b = add(new THREE.CapsuleGeometry(0.13, 2.1, 6, 12), chrome, 0, 0.45, z);
    b.rotation.z = Math.PI / 2;
  }
  // tail fins + lights
  const fin = new THREE.BoxGeometry(0.08, 0.42, 1.1);
  for (const sx of [-1, 1]) {
    const f = add(fin, paint, sx * 0.85, 1.22, -2.2);
    f.rotation.x = 0.28;
    add(new THREE.SphereGeometry(0.13, 10, 8), tailMat, sx * 1.05, 0.85, -2.62);
  }
  // antenna balls on the dome sides
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), chrome, sx * 1.3, 1.35, 0.6);
    add(new THREE.SphereGeometry(0.13, 12, 10), chrome, sx * 1.3, 1.58, 0.6);
  }

  // cockpit
  add(new THREE.BoxGeometry(1.7, 0.75, 0.28), seatMat, 0, 1.45, -1.05);
  add(new THREE.BoxGeometry(1.7, 0.2, 1.0), seatMat, 0, 1.1, -0.6);
  add(new THREE.BoxGeometry(0.66, 0.62, 0.45), coatMat, 0, 1.45, -0.6);
  add(new THREE.SphereGeometry(0.25, 16, 12), skinMat, 0, 1.92, -0.58);
  const helmet = add(new THREE.SphereGeometry(0.28, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), helmetMat, 0, 1.95, -0.62);
  helmet.rotation.x = -0.2;
  const strap = add(new THREE.TorusGeometry(0.27, 0.03, 6, 20), helmetMat, 0, 1.98, -0.58);
  strap.rotation.x = -0.25;
  const wheel = add(new THREE.TorusGeometry(0.24, 0.035, 8, 20), new THREE.MeshStandardMaterial({ color: 0xc8a060, roughness: 0.4 }), 0, 1.55, -0.05);
  wheel.rotation.x = -0.9;

  // bubble dome
  const dome = add(new THREE.SphereGeometry(1, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 1.15, -0.25);
  dome.scale.set(1.05, 1.08, 1.6);
  dome.castShadow = false;
  dome.renderOrder = 2;
  const ring = add(new THREE.TorusGeometry(1, 0.06, 8, 40), chrome, 0, 1.16, -0.25);
  ring.rotation.x = Math.PI / 2;
  ring.scale.set(1.05, 1.6, 1);

  // twin jet thrusters
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x9fe6ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flameGeo = new THREE.ConeGeometry(0.3, 2.2, 16, 1, true).translate(0, 1.1, 0).rotateX(-Math.PI / 2);
  const housing = new THREE.CylinderGeometry(0.4, 0.32, 1.4, 24).rotateX(Math.PI / 2);
  for (const sx of [-0.6, 0.6]) {
    add(housing, chrome, sx, 0.8, -3.0);
    add(new THREE.TorusGeometry(0.4, 0.08, 10, 24), chrome, sx, 0.8, -3.7);
    add(new THREE.CylinderGeometry(0.31, 0.31, 0.1, 20).rotateX(Math.PI / 2), darkChrome, sx, 0.8, -3.72);
    const disc = add(new THREE.CircleGeometry(0.27, 20), nozzleGlowMat, sx, 0.8, -3.78);
    disc.rotation.y = Math.PI;
    disc.castShadow = false;
    const fl = add(flameGeo, flameMat, sx, 0.8, -3.78);
    fl.castShadow = false;
    flames.push(fl);
  }

  // hover pads
  const padGeo = new THREE.CylinderGeometry(0.48, 0.55, 0.16, 20);
  const padGlowGeo = new THREE.CircleGeometry(0.42, 20);
  for (const sx of [-1, 1]) for (const fz of [1.75, -1.6]) {
    add(padGeo, darkChrome, sx * 0.98, 0.16, fz);
    const g = add(padGlowGeo, padGlowMat, sx * 0.98, 0.07, fz);
    g.rotation.x = Math.PI / 2;
    g.castShadow = false;
  }

  // soft cyan glow on the road below
  const glowMat = new THREE.MeshBasicMaterial({
    map: groundGlowTex, color: 0x6fdcff, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 8), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.08;
  root.add(glow);

  return { root, body, flames, flameMat, paint, glowMat };
}

// Fresnel bubble used for the force shield.
export function buildShield() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(0x7fe3ff) }, uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
      varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main() {
        float f = pow(1.0 - abs(dot(vN, vV)), 2.2);
        float bands = 0.5 + 0.5 * sin(vP.y * 6.0 - uTime * 8.0);
        vec3 c = uColor * (f * 1.8 + 0.06 + bands * 0.12);
        gl_FragColor = vec4(c * uOpacity, 1.0);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), mat);
  m.scale.set(2.6, 1.9, 4.4);
  m.position.y = 1.1;
  m.visible = false;
  return m;
}
