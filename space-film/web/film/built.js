// What people have built, each made of many small parts, never a picture:
// satellites (points on orbits), a lunar base and a city on Mars (clusters of
// small lights), a railway round the Moon (a band of small segments with a few
// bright cars) and mirrors round Mars (small flat quads on tilted orbits).
// Every part has a year it is built in; it appears when the film's year
// passes that year. All randomness comes from seeded generators.
import * as THREE from 'three';
import { SEED } from './config.js';
import { CENTERS, RADII } from './path.js';
import { rng } from './rng.js';
import { SUN, geo, bodyQuat, TILT } from './scene.js';

const DEG = Math.PI / 180;

// ---- Satellites round Earth ---------------------------------------------------------
// Shells modelled on filed constellations (inclination in degrees, altitude
// in km, count). Altitudes are drawn 1.6x higher than real so the shells read
// at this scale (not to scale; see README).
const SHELLS = [
  // Starlink-like
  { inc: 53.0, alt: 550, n: 9000, live: 5200 },
  { inc: 53.2, alt: 540, n: 5000, live: 2900 },
  { inc: 70.0, alt: 570, n: 2000, live: 700 },
  { inc: 97.6, alt: 560, n: 2500, live: 900 },
  { inc: 43.0, alt: 530, n: 4000, live: 1200 },
  { inc: 33.0, alt: 525, n: 2500, live: 0 },
  // Amazon Leo (Kuiper) filing
  { inc: 51.9, alt: 630, n: 1300, live: 160 },
  { inc: 42.0, alt: 610, n: 1150, live: 120 },
  { inc: 33.0, alt: 590, n: 800, live: 40 },
  // Guowang-like
  { inc: 50.0, alt: 1145, n: 3000, live: 120 },
  { inc: 85.0, alt: 1100, n: 2000, live: 60 },
  { inc: 60.0, alt: 590, n: 1500, live: 40 },
  // Qianfan-like
  { inc: 89.0, alt: 1160, n: 3000, live: 200 },
  { inc: 50.0, alt: 1150, n: 1200, live: 30 },
  // OneWeb-like
  { inc: 87.9, alt: 1200, n: 650, live: 650 },
];
const EXAG = 1.6;

function makeSatellites() {
  const R = rng(SEED ^ 0x5a7e11);
  const orbit = [], extra = [];
  for (const sh of SHELLS) {
    const planes = Math.max(6, Math.round(Math.sqrt(sh.n) * 0.9));
    const per = Math.ceil(sh.n / planes);
    const r = 1 + (EXAG * sh.alt) / 6371;
    const raanJ = R() * Math.PI * 2;
    const order = [];
    for (let i = 0; i < sh.n; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (let k = 0; k < sh.n; k++) {
      const p = k % planes, s = Math.floor(k / planes);
      const raan = raanJ + (p / planes) * Math.PI * 2 + R.normal() * 0.004;
      const ph = (s / per) * Math.PI * 2 + (p * 0.37) + R.normal() * 0.01;
      const inc = (sh.inc + R.normal() * 0.05) * DEG;
      const built = order[k] < sh.live ? 2019 + R() * 6.8 : 2026.05 + R() * 3.9;
      orbit.push(r * (1 + R.normal() * 0.002), inc, raan, ph);
      extra.push(built, 0.55 + R() * 0.45);
    }
  }
  // a few hundred other objects on scattered orbits
  for (let i = 0; i < 400; i++) {
    orbit.push(1 + (EXAG * R.range(400, 1300)) / 6371, R.range(0, 100) * DEG, R() * Math.PI * 2, R() * Math.PI * 2);
    extra.push(2010 + R() * 16, 0.4 + R() * 0.4);
  }
  // geostationary ring (real radius 6.62 Earth radii, not exaggerated)
  for (let i = 0; i < 560; i++) {
    orbit.push(6.62, R() * 0.6 * DEG, R() * Math.PI * 2, R() * Math.PI * 2);
    extra.push(i < 520 ? 2000 + R() * 26 : 2026.2 + R() * 3.5, 0.22 + R() * 0.18);
  }
  const N = orbit.length / 4;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
  g.setAttribute('orbit', new THREE.Float32BufferAttribute(orbit, 4));
  g.setAttribute('extra', new THREE.Float32BufferAttribute(extra, 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, year: { value: 2026 }, px: { value: 1 }, sunDir: { value: SUN },
      tilt: { value: new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(TILT.earth)) },
      k: { value: (2 * Math.PI / 46) * Math.pow(1.14, 1.5) }, gain: { value: 0.62 }, refDist: { value: 12.0 } },
    vertexShader: /* glsl */ `
      attribute vec4 orbit; attribute vec2 extra;
      uniform float time, year, px, k, gain, refDist; uniform vec3 sunDir; uniform mat3 tilt;
      varying float vA;
      void main() {
        float r = orbit.x, inc = orbit.y, raan = orbit.z;
        float u = orbit.w + k * pow(r, -1.5) * time;
        vec3 p = vec3(r * cos(u), r * sin(u) * sin(inc), r * sin(u) * cos(inc));
        float c = cos(raan), s = sin(raan);
        p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
        p = tilt * p;
        float along = dot(p, sunDir);
        float perp = length(p - along * sunDir);
        float lit = max(step(0.0, along), smoothstep(0.985, 1.03, perp));
        float built = smoothstep(extra.x, extra.x + 0.12, year);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        // each point is a fixed size on screen, so dim it with distance squared
        // (light from a far satellite falls off; the shell's glow per area stays the same)
        float fall = min(1.0, pow(refDist / length(mv.xyz), 2.0));
        vA = built * mix(0.06, 1.0, lit) * extra.y * gain * fall;
        gl_PointSize = px * 1.9;
        gl_Position = projectionMatrix * mv;
        if (built <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float a = exp(-dot(c, c) * 2.6) * vA;
        gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * a * 1.4, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(g, mat);
  pts.position.copy(CENTERS.earth);
  pts.frustumCulled = false;
  pts.renderOrder = 7;
  return pts;
}

// ---- Surface lights (Moon base, Mars city) -------------------------------------------
// Lights are points on a body's surface, given in the body's own frame. They
// dim on the day side (lights are invisible in sunshine) and hide behind the body.
function lightMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { year: { value: 2026 }, px: { value: 1 }, sunDir: { value: SUN }, gain: { value: 1.0 }, refDist: { value: 3.0 } },
    vertexShader: /* glsl */ `
      attribute vec3 lcolor; attribute vec2 lmeta; // built year, size
      uniform float year, px, gain, refDist; uniform vec3 sunDir;
      varying vec3 vC;
      void main() {
        vec3 nW = normalize(mat3(modelMatrix) * normalize(position));
        float day = smoothstep(-0.06, 0.12, dot(nW, sunDir));
        float built = smoothstep(lmeta.x, lmeta.x + 0.25, year);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float fall = min(1.0, pow(refDist / length(mv.xyz), 2.0)); // see satellites
        vC = lcolor * built * mix(1.0, 0.12, day) * gain * fall;
        gl_PointSize = px * lmeta.y;
        gl_Position = projectionMatrix * mv;
        if (built <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vC;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float a = exp(-dot(c, c) * 2.4);
        gl_FragColor = vec4(vC * a, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
}

// Local tangent frame at (lat, lon) so places can be laid out in "degrees of
// arc" east and north of a centre and then wrapped back onto the sphere.
function tangentFrame(lat, lon) {
  const n = geo(lat, lon);
  let east = new THREE.Vector3(n.z, 0, -n.x);
  if (east.lengthSq() < 1e-8) east = new THREE.Vector3(1, 0, 0);
  east.normalize();
  const north = new THREE.Vector3().crossVectors(n, east);
  return { n, east, north };
}
function placeOn(frame, eDeg, nDeg) {
  const a = Math.hypot(eDeg, nDeg) * DEG;
  if (a < 1e-9) return frame.n.clone();
  const d = frame.east.clone().multiplyScalar(eDeg).add(frame.north.clone().multiplyScalar(nDeg)).normalize();
  return frame.n.clone().multiplyScalar(Math.cos(a)).add(d.multiplyScalar(Math.sin(a)));
}

class LightSet {
  constructor() { this.pos = []; this.col = []; this.meta = []; }
  add(v, color, year, size) { this.pos.push(v.x, v.y, v.z); this.col.push(...color); this.meta.push(year, size); }
  build(body, lift) {
    const g = new THREE.BufferGeometry();
    const pos = this.pos.map((x) => x * lift);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('lcolor', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('lmeta', new THREE.Float32BufferAttribute(this.meta, 2));
    const p = new THREE.Points(g, lightMaterial());
    p.scale.setScalar(RADII[body]);
    p.position.copy(CENTERS[body]);
    p.frustumCulled = false;
    p.renderOrder = 8;
    p.material.uniforms.refDist.value = RADII[body] * 11.5;
    return p;
  }
}

const WARM = [1.0, 0.78, 0.5];
const WHITE = [0.95, 0.97, 1.0];
const RED = [1.0, 0.25, 0.18];

// The base sits on the rim of Shackleton crater by the lunar south pole.
// Its spread is drawn about 10x larger than a real base would be (not to scale).
export const BASE = { lat: -88.6, lon: 140 };
// The railway's spur leaves the base along this meridian to the equator.
export const SPUR_LON = 104;

function makeMoonBase() {
  const R = rng(SEED ^ 0xba5e);
  const L = new LightSet();
  const f = tangentFrame(BASE.lat, BASE.lon);
  const yr = (a, b) => R.range(a, b);
  // habitat cluster
  for (let i = 0; i < 260; i++) {
    const r = Math.abs(R.normal()) * 0.9, a = R() * Math.PI * 2;
    L.add(placeOn(f, r * Math.cos(a), r * Math.sin(a)), R() < 0.85 ? WARM : WHITE, yr(2029.5, 2034.5), R.range(1.7, 2.5));
  }
  // landing pads: rings of lights
  const pads = [[3.6, 1.2], [3.0, -2.4], [-1.8, 3.4]];
  for (const [e, n] of pads) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      L.add(placeOn(f, e + 0.45 * Math.cos(a), n + 0.45 * Math.sin(a)), WHITE, yr(2029, 2031), 1.8);
    }
    L.add(placeOn(f, e, n), RED, 2029.5, 2.6);
  }
  // roads to outposts on crater rims and ridges, each a dotted line of lights
  const outposts = [[10.5, 4.5], [-8.5, -6.5], [4.5, -11.0], [-11.5, 5.5], [12.5, -4.5], [1.5, 12.0]];
  for (const [oe, on] of outposts) {
    const steps = Math.round(Math.hypot(oe, on) / 0.22);
    const bend = R.normal() * 0.6;
    const built = yr(2031, 2035.5);
    for (let s = 1; s < steps; s++) {
      const x = s / steps;
      const e = oe * x - on * bend * Math.sin(Math.PI * x) / Math.hypot(oe, on);
      const n = on * x + oe * bend * Math.sin(Math.PI * x) / Math.hypot(oe, on);
      L.add(placeOn(f, e, n), WARM, built + 0.4 * x, 1.6);
    }
    for (let i = 0; i < 45; i++) {
      const r = Math.abs(R.normal()) * 0.45, a = R() * Math.PI * 2;
      L.add(placeOn(f, oe + r * Math.cos(a), on + r * Math.sin(a)), R() < 0.7 ? WARM : WHITE, built + 0.4, R.range(1.7, 2.4));
    }
  }
  // the railway spur north towards the equator (built as the railway is built)
  for (let lat = BASE.lat + 1.0; lat <= -1.2; lat += 0.55) {
    const x = (lat - BASE.lat) / (0 - BASE.lat);
    L.add(geo(lat, SPUR_LON), WARM, 2036.4 + 2.2 * x, 1.7);
  }
  const base = L.build('moon', 1.002);
  base.material.uniforms.gain.value = 0.55;
  return base;
}

// ---- Railway round the Moon's equator ---------------------------------------------------
// A thin band of 1440 short segments, lifted a little off the ground, built
// outwards both ways from where the spur meets it. A few bright cars run on it.
const RAIL = { segments: 1440, halfWidthDeg: 1.25, lift: 1.006, start: 2036.6, end: 2042.4 };

function railBuiltYear(lonDeg) {
  let d = Math.abs(((lonDeg - SPUR_LON + 540) % 360) - 180); // 0..180 from the spur
  return RAIL.start + (RAIL.end - RAIL.start) * (d / 180);
}

function makeRailBand() {
  const pos = [], built = [];
  const n = RAIL.segments, gap = 0.12;
  for (let i = 0; i < n; i++) {
    const l0 = (i / n) * 360 - 180, l1 = ((i + 1 - gap) / n) * 360 - 180;
    const y = railBuiltYear((l0 + l1) / 2);
    const a = geo(-RAIL.halfWidthDeg, l0), b = geo(-RAIL.halfWidthDeg, l1);
    const c = geo(RAIL.halfWidthDeg, l1), d = geo(RAIL.halfWidthDeg, l0);
    for (const v of [a, b, c, a, c, d]) { pos.push(v.x * RAIL.lift, v.y * RAIL.lift, v.z * RAIL.lift); built.push(y); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('built', new THREE.Float32BufferAttribute(built, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { year: { value: 2026 }, sunDir: { value: SUN }, sunI: { value: 2.3 } },
    vertexShader: /* glsl */ `
      attribute float built; uniform float year;
      varying vec3 vN; varying vec3 vP; varying float vB;
      void main() {
        vN = normalize(mat3(modelMatrix) * normalize(position));
        vP = (modelMatrix * vec4(position, 1.0)).xyz;
        vB = built;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float year, sunI; uniform vec3 sunDir;
      varying vec3 vN; varying vec3 vP; varying float vB;
      void main() {
        if (year < vB) discard;
        vec3 n = normalize(vN), v = normalize(cameraPosition - vP);
        float mu0 = max(dot(n, sunDir), 0.0);
        vec3 h = normalize(sunDir + v);
        // brushed metal and glass: a pale band in sunlight with a soft sheen
        vec3 c = vec3(0.8, 0.82, 0.86) * mu0 * sunI * 0.85 + vec3(1.0) * pow(max(dot(n, h), 0.0), 30.0) * mu0 * 1.2 + vec3(0.02);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  const m = new THREE.Mesh(g, mat);
  m.scale.setScalar(RADII.moon);
  m.position.copy(CENTERS.moon);
  m.renderOrder = 2;
  return m;
}

function makeRailLights() {
  const L = new LightSet();
  for (let lon = -180; lon < 180; lon += 1.5) {
    const side = Math.round((lon + 180) / 1.5) % 2 ? 1 : -1;
    L.add(geo(side * RAIL.halfWidthDeg, lon), [1.0, 0.7, 0.35], railBuiltYear(lon) + 0.05, 2.2);
  }
  const l = L.build('moon', RAIL.lift + 0.001);
  l.material.uniforms.gain.value = 1.3;
  return l;
}

// Cars: each is a short train of bright points; a pure function of time.
const CARS = [
  { lon0: 20, speed: 6.5 }, { lon0: 140, speed: 5.2 }, { lon0: -100, speed: 7.4 },
  { lon0: 75, speed: -5.8 }, { lon0: -30, speed: -6.9 }, { lon0: 190, speed: -4.6 },
];
const CAR_PTS = 10;
function makeCars() {
  const g = new THREE.BufferGeometry();
  const n = CARS.length * CAR_PTS;
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('lcolor', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('lmeta', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  const p = new THREE.Points(g, lightMaterial());
  p.scale.setScalar(RADII.moon);
  p.position.copy(CENTERS.moon);
  p.frustumCulled = false;
  p.renderOrder = 9;
  p.material.uniforms.refDist.value = RADII.moon * 11.5;
  return p;
}
function updateCars(cars, t) {
  const pos = cars.geometry.attributes.position, col = cars.geometry.attributes.lcolor, meta = cars.geometry.attributes.lmeta;
  let i = 0;
  for (const [ci, c] of CARS.entries()) {
    const head = c.lon0 + c.speed * t;
    for (let k = 0; k < CAR_PTS; k++) {
      const lon = head - Math.sign(c.speed) * k * 0.17;
      const v = geo(0, lon).multiplyScalar(RAIL.lift + 0.002);
      pos.setXYZ(i, v.x, v.y, v.z);
      const front = k === 0;
      const b = front ? 7.0 : 3.2 * (1.0 - k / (CAR_PTS * 1.4));
      col.setXYZ(i, b * 0.9, b * 0.97, b * 1.0);
      meta.setXY(i, 2042.3 + ci * 0.1, front ? 3.6 : 2.8);
      i++;
    }
  }
  pos.needsUpdate = true; col.needsUpdate = true; meta.needsUpdate = true;
}

// ---- City on Mars ---------------------------------------------------------------------
// In Arcadia Planitia, one of the mid-latitude ice-rich plains studied as a
// landing region. Drawn about 10x larger than a real first city (not to scale).
export const CITY = { lat: 40.0, lon: -170.0 };

function makeMarsCity() {
  const R = rng(SEED ^ 0xc17e);
  const L = new LightSet();
  const f = tangentFrame(CITY.lat, CITY.lon);
  const SODIUM = [1.0, 0.72, 0.42];
  // core: a street grid with a denser, brighter centre
  for (let gx = -14; gx <= 14; gx++) {
    for (let gy = -14; gy <= 14; gy++) {
      const r = Math.hypot(gx, gy) / 14;
      if (r > 1) continue;
      const dens = 0.95 - 0.55 * r;
      const along = R() < 0.5;
      for (let k = 0; k < 3; k++) {
        if (R() > dens) continue;
        const e = (gx + (along ? k / 3 : 0)) * 0.17 + R.normal() * 0.015;
        const n = (gy + (along ? 0 : k / 3)) * 0.17 + R.normal() * 0.015;
        L.add(placeOn(f, e, n), R() < 0.8 ? SODIUM : WHITE, 2044.2 + 4.5 * r + R() * 0.8, R.range(1.6, 2.4));
      }
    }
  }
  // towns round it, linked by lit roads
  const towns = [[9.0, 3.8], [-7.5, 6.0], [3.8, -9.8], [-11.2, -4.5], [14.2, -6.8], [-3.0, 13.5], [18.8, 6.0]];
  for (const [te, tn] of towns) {
    const built = R.range(2045.5, 2049.3);
    const steps = Math.round(Math.hypot(te, tn) / 0.19);
    for (let s = 2; s < steps - 1; s++) {
      const x = s / steps;
      L.add(placeOn(f, te * x + R.normal() * 0.012, tn * x + R.normal() * 0.012), SODIUM, built - 0.3 + 0.3 * x, 1.5);
    }
    for (let i = 0; i < 110; i++) {
      const r = Math.abs(R.normal()) * 0.6, a = R() * Math.PI * 2;
      L.add(placeOn(f, te + r * Math.cos(a), tn + r * Math.sin(a)), R() < 0.75 ? SODIUM : WHITE, built + R() * 0.6, R.range(1.5, 2.2));
    }
  }
  // spaceport: rows of pads east of the city
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 7; k++) {
      const ce = 4.8 + k * 0.62, cn = -3.6 - row * 0.7;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        L.add(placeOn(f, ce + 0.17 * Math.cos(a), cn + 0.17 * Math.sin(a)), WHITE, 2044.0 + row * 1.2 + k * 0.15, 1.5);
      }
    }
  }
  // a few small outposts elsewhere
  for (const [lat, lon] of [[18.4, 77.5], [-42, 70], [22, -48], [-5, 135]]) {
    const g = tangentFrame(lat, lon);
    const built = R.range(2046, 2050);
    for (let i = 0; i < 35; i++) {
      const r = Math.abs(R.normal()) * 0.35, a = R() * Math.PI * 2;
      L.add(placeOn(g, r * Math.cos(a), r * Math.sin(a)), SODIUM, built, 1.6);
    }
  }
  const city = L.build('mars', 1.002);
  city.material.uniforms.gain.value = 0.42;
  return city;
}

// ---- Mirrors round Mars ----------------------------------------------------------------
// Thin flat squares on tilted circular orbits, each turned to throw sunlight
// down onto the inhabited region below (as in proposals to warm Mars with
// orbiting reflectors). They catch the Sun when their face is lit and turned
// towards the camera, and go dark in Mars's shadow.
// Each family is one thin ring: a radius (Mars radii), tilt and node.
const FAMILIES = [
  { a: 1.6, inc: 28, raan: 10 }, { a: 1.85, inc: 62, raan: 140 }, { a: 2.1, inc: 44, raan: 75 },
  { a: 2.35, inc: 76, raan: 250 }, { a: 2.6, inc: 35, raan: 205 }, { a: 2.85, inc: 55, raan: 320 },
];
function makeMirrors() {
  const R = rng(SEED ^ 0x3133);
  const N = 6000;
  const orb = new Float32Array(N * 4), meta = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const fi = i % FAMILIES.length, fam = FAMILIES[fi];
    const a = fam.a + R.normal() * 0.018;
    orb.set([a, (fam.inc + R.normal() * 0.25) * DEG, (fam.raan + R.normal() * 0.4) * DEG, R() * Math.PI * 2], i * 4);
    // built year (inner rings first), size, two wobble phases
    const built = 2050.3 + fi * 0.75 + R() * 1.4;
    meta.set([built, R.range(0.013, 0.019), R() * 6.283, R() * 6.283], i * 4);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('morb', new THREE.InstancedBufferAttribute(orb, 4));
  g.setAttribute('mmeta', new THREE.InstancedBufferAttribute(meta, 4));
  g.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, year: { value: 2026 }, sunDir: { value: SUN },
      camLocal: { value: new THREE.Vector3() }, target: { value: new THREE.Vector3() },
      tilt: { value: new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(TILT.mars)) },
      k: { value: 2 * Math.PI / 70 * Math.pow(2.0, 1.5) }, gain: { value: 1.0 } },
    vertexShader: /* glsl */ `
      attribute vec4 morb; attribute vec4 mmeta;
      uniform float time, year, k; uniform vec3 sunDir, camLocal, target; uniform mat3 tilt;
      varying vec3 vN; varying vec3 vP; varying float vLit; varying vec2 vUv;
      void main() {
        float built = smoothstep(mmeta.x, mmeta.x + 0.2, year);
        float a = morb.x, inc = morb.y, raan = morb.z;
        float u = morb.w + k * pow(a, -1.5) * time;
        vec3 p = vec3(a * cos(u), a * sin(u) * sin(inc), a * sin(u) * cos(inc));
        float c = cos(raan), s = sin(raan);
        p = tilt * vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
        // turn the face to bounce sunlight onto the target, with a slow wobble
        vec3 toT = normalize(target - p);
        vec3 n = normalize(sunDir + toT);
        vec3 w = vec3(sin(mmeta.z + time * 0.7), cos(mmeta.w + time * 0.55), sin(mmeta.z + mmeta.w + time * 0.6));
        n = normalize(n + w * 0.07);
        vec3 t1 = normalize(cross(n, abs(n.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
        vec3 t2 = cross(n, t1);
        float size = mmeta.y * built;
        vec3 q = p + (t1 * position.x + t2 * position.y) * size;
        // in Mars's shadow? (Mars radius is 1 in this frame)
        float along = dot(p, sunDir);
        float perp = length(p - along * sunDir);
        vLit = max(step(0.0, along), smoothstep(0.98, 1.04, perp));
        vN = n; vP = q; vUv = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(q, 1.0);
        if (built <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, camLocal; uniform float gain;
      varying vec3 vN; varying vec3 vP; varying float vLit; varying vec2 vUv;
      void main() {
        vec3 v = normalize(camLocal - vP);
        vec3 n = normalize(vN);
        float facing = dot(n, v);
        vec3 r = reflect(-sunDir, n);
        float rv = max(dot(r, v), 0.0);
        // a polished film is not perfect: a sharp glint plus a broad sheen
        float glint = pow(rv, 400.0) * 9.0 + pow(rv, 40.0) * 0.7 + pow(rv, 6.0) * 0.12;
        vec3 front = vec3(0.85, 0.9, 1.0) * (glint + 0.05) * vLit;
        vec3 back = vec3(0.025, 0.022, 0.02) * vLit + vec3(0.004);
        vec3 col = facing > 0.0 ? front : back;
        // thin bright frame round each sail so it reads as a flat square
        float edge = smoothstep(0.78, 0.95, max(abs(vUv.x), abs(vUv.y)));
        col += vec3(0.25, 0.24, 0.22) * edge * vLit * 0.25;
        gl_FragColor = vec4(col * gain, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.scale.setScalar(RADII.mars);
  m.position.copy(CENTERS.mars);
  m.frustumCulled = false;
  m.renderOrder = 3;
  return m;
}

export function buildWorks(scene) {
  const w = {
    sats: makeSatellites(), base: makeMoonBase(), rail: makeRailBand(), railLights: makeRailLights(),
    cars: makeCars(), city: makeMarsCity(), mirrors: makeMirrors(),
  };
  scene.add(...Object.values(w));
  return w;
}

export function updateWorks(w, t, year, camera, res) {
  const px = res.y / 1080;
  w.sats.material.uniforms.time.value = t;
  w.sats.material.uniforms.year.value = year;
  w.sats.material.uniforms.px.value = px;
  for (const k of ['base', 'railLights', 'cars', 'city']) {
    w[k].material.uniforms.year.value = year;
    w[k].material.uniforms.px.value = px;
  }
  w.rail.material.uniforms.year.value = year;
  w.base.quaternion.copy(bodyQuat('moon', t));
  w.rail.quaternion.copy(bodyQuat('moon', t));
  w.railLights.quaternion.copy(bodyQuat('moon', t));
  w.cars.quaternion.copy(bodyQuat('moon', t));
  updateCars(w.cars, t);
  const mq = bodyQuat('mars', t);
  w.city.quaternion.copy(mq);
  // mirrors live in a frame centred on Mars, aligned with world axes
  const mu = w.mirrors.material.uniforms;
  mu.time.value = t; mu.year.value = year;
  mu.camLocal.value.copy(camera.position).sub(CENTERS.mars).divideScalar(RADII.mars);
  mu.target.value.copy(geo(CITY.lat, CITY.lon)).applyQuaternion(mq);
}
