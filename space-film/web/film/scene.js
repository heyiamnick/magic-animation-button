// Bodies, atmospheres, stars and the dots that keep far bodies visible.
// The Sun is the only light: every surface shader below is lit by SUN alone.
import * as THREE from 'three';
import { SUN_DIR, SEED } from './config.js';
import { CENTERS, RADII } from './path.js';
import { rng } from './rng.js';

export const SUN = new THREE.Vector3(...SUN_DIR).normalize();
const DEG = Math.PI / 180;

// Geographic (lat, lon in degrees) to a unit vector in a body's own frame,
// matching how three.js wraps an equirectangular map round SphereGeometry.
export function geo(lat, lon) {
  const la = lat * DEG, ph = (lon + 180) * DEG;
  return new THREE.Vector3(-Math.cos(ph) * Math.cos(la), Math.sin(la), Math.sin(ph) * Math.cos(la));
}

// ---- Body orientation ---------------------------------------------------------
// tilt: the pole leans away from the Sun (-X) by this many degrees.
// spin: degrees per second of film time about the body's own pole.
const ORIENT = {
  earth: { tilt: 23.44, spin: 1.1, face: { lat: 45, lon: 14, dir: [-0.7453, 0.4213, 0.5167], t: 0 } },
  moon: { tilt: 1.5, spin: 0.0, face: { lat: 0, lon: 0, dir: null, t: 30 } },
  mars: { tilt: 25.19, spin: 0.55, face: { lat: 40, lon: -170, dir: [-0.7819, 0.4527, 0.4286], t: 66 } },
};
// The Moon keeps its near side towards Earth.
ORIENT.moon.face.dir = CENTERS.earth.clone().sub(CENTERS.moon).normalize().toArray();

const tiltQ = {}, spin0 = {};
for (const [name, o] of Object.entries(ORIENT)) {
  tiltQ[name] = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), o.tilt * DEG);
  // Find the spin angle that turns the chosen place towards the chosen direction.
  const want = new THREE.Vector3(...o.face.dir).normalize();
  const g = geo(o.face.lat, o.face.lon);
  let best = 0, bestDot = -2;
  for (let i = 0; i < 3600; i++) {
    const a = (i / 10) * DEG;
    const v = g.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a).applyQuaternion(tiltQ[name]);
    if (v.dot(want) > bestDot) { bestDot = v.dot(want); best = a; }
  }
  spin0[name] = best - o.spin * DEG * o.face.t;
}
export function bodyQuat(name, t) {
  const s = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spin0[name] + ORIENT[name].spin * DEG * t);
  return tiltQ[name].clone().multiply(s);
}
export const TILT = tiltQ;

// ---- Shared shader bits ----------------------------------------------------------
const commonVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vObjN;
  varying vec3 vPosW;
  varying vec3 vEastW;
  varying vec3 vNorthW;
  void main() {
    vUv = uv;
    vObjN = normal;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    // east / north on the sphere (body frame), carried to world space
    vec3 east = normalize(vec3(normal.z, 0.0, -normal.x) + vec3(1e-6, 0.0, 0.0));
    vEastW = normalize(mat3(modelMatrix) * east);
    vNorthW = normalize(mat3(modelMatrix) * cross(normal, east));
    vec4 pw = modelMatrix * vec4(position, 1.0);
    vPosW = pw.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function sphere(segW, segH) {
  return new THREE.SphereGeometry(1, segW, segH);
}

// ---- Earth -----------------------------------------------------------------------
function makeEarth(tex) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: tex.earthDay }, nightMap: { value: tex.earthNight },
      sunDir: { value: SUN }, sunI: { value: 2.4 }, lightsI: { value: 1.6 },
    },
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D dayMap, nightMap;
      uniform vec3 sunDir; uniform float sunI, lightsI;
      varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW;
      void main() {
        vec3 n = normalize(vNormalW);
        float mu = dot(n, sunDir);
        vec3 day = texture2D(dayMap, vUv).rgb;
        // Lambert, with a short soft band at the terminator for the atmosphere.
        float lit = max(mu, 0.0) + 0.06 * (1.0 - smoothstep(-0.1, 0.12, abs(mu)));
        vec3 col = day * lit * sunI;
        // twilight: redden the light that grazes in near the terminator
        col *= mix(vec3(1.0, 0.78, 0.62), vec3(1.0), smoothstep(-0.02, 0.2, mu));
        // City lights from the Black Marble map, on the dark side only.
        vec3 night = texture2D(nightMap, vUv).rgb;
        float l = dot(night, vec3(0.2126, 0.7152, 0.0722));
        vec3 lights = night * smoothstep(0.035, 0.3, l) * vec3(1.0, 0.8, 0.52);
        float dark = 1.0 - smoothstep(-0.12, 0.04, mu);
        col += lights * lightsI * dark;
        // the faint land the Black Marble map shows under moonlight, kept very dim
        col += night * 0.035 * dark;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(sphere(256, 128), mat);
  mesh.scale.setScalar(RADII.earth);
  mesh.position.copy(CENTERS.earth);
  return mesh;
}

function makeAtmosphere(body, radiusScale, color, twilight, strength, nightGlow) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: SUN }, color: { value: new THREE.Color(...color) },
      twi: { value: new THREE.Color(...twilight) }, k: { value: strength }, glow: { value: nightGlow } },
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform vec3 sunDir, color, twi; uniform float k, glow;
      varying vec3 vNormalW; varying vec3 vPosW;
      void main() {
        vec3 n = normalize(vNormalW);
        vec3 v = normalize(cameraPosition - vPosW);
        float ndv = clamp(dot(n, v), 0.0, 1.0);
        float rim = pow(1.0 - ndv, 5.0);
        float mu = dot(n, sunDir);
        float day = smoothstep(-0.3, 0.3, mu);
        float dusk = smoothstep(-0.3, -0.02, mu) * (1.0 - smoothstep(0.0, 0.3, mu));
        vec3 c = (color * day + twi * dusk) * rim * k + color * glow * rim;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(sphere(192, 96), mat);
  mesh.scale.setScalar(RADII[body] * radiusScale);
  mesh.position.copy(CENTERS[body]);
  mesh.renderOrder = 5;
  return mesh;
}

// ---- Moon --------------------------------------------------------------------------
function makeMoon(tex) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { colorMap: { value: tex.moonColor }, normalMap: { value: tex.moonNormal },
      sunDir: { value: SUN }, sunI: { value: 1.75 } },
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D colorMap, normalMap;
      uniform vec3 sunDir; uniform float sunI;
      varying vec2 vUv; varying vec3 vNormalW; varying vec3 vObjN; varying vec3 vPosW;
      varying vec3 vEastW; varying vec3 vNorthW;
      void main() {
        vec3 on = normalize(vObjN);
        vec3 nE = normalize(vEastW), nN = normalize(vNorthW), nG = normalize(vNormalW);
        vec3 tn = texture2D(normalMap, vUv).xyz * 2.0 - 1.0;
        // the LOLA-derived normal map is noisy at the poles: fade it out there
        float polar = 1.0 - smoothstep(0.93, 0.995, abs(on.y));
        tn.xy *= polar;
        vec3 n = normalize(nE * tn.x + nN * tn.y + nG * tn.z);
        vec3 v = normalize(cameraPosition - vPosW);
        float mu0 = max(dot(n, sunDir), 0.0);
        float mu0g = dot(nG, sunDir);
        float mu = max(dot(nG, v), 0.0);
        // Lommel-Seeliger: the flat, limb-bright look of airless dusty surfaces
        float ls = mu0 / (mu0 + mu + 1e-4) * 2.0;
        ls *= smoothstep(-0.02, 0.03, mu0g);
        vec3 albedo = texture2D(colorMap, vUv).rgb;
        gl_FragColor = vec4(albedo * ls * sunI * 0.6, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(sphere(192, 96), mat);
  mesh.scale.setScalar(RADII.moon);
  mesh.position.copy(CENTERS.moon);
  return mesh;
}

// ---- Mars ----------------------------------------------------------------------------
function makeMars(tex) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { colorMap: { value: tex.marsColor }, sunDir: { value: SUN }, sunI: { value: 2.0 } },
    vertexShader: commonVert,
    fragmentShader: /* glsl */ `
      uniform sampler2D colorMap; uniform vec3 sunDir; uniform float sunI;
      varying vec2 vUv; varying vec3 vNormalW; varying vec3 vPosW;
      void main() {
        vec3 n = normalize(vNormalW);
        vec3 v = normalize(cameraPosition - vPosW);
        float mu0 = dot(n, sunDir), mu = max(dot(n, v), 0.0);
        // Minnaert-style darkening towards the limb, Lambert otherwise
        float k = 0.85;
        float shade = pow(max(mu0, 0.0), k) * pow(max(mu, 1e-3), k - 1.0);
        shade = min(shade, 1.6) + 0.03 * (1.0 - smoothstep(-0.08, 0.1, abs(mu0)));
        vec3 albedo = texture2D(colorMap, vUv).rgb;
        gl_FragColor = vec4(albedo * shade * sunI * 0.85, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(sphere(192, 96), mat);
  mesh.scale.setScalar(RADII.mars);
  mesh.position.copy(CENTERS.mars);
  return mesh;
}

// ---- Stars ---------------------------------------------------------------------------
// A fixed field from SEED: uniform plus a band (a "galactic plane"), magnitudes
// weighted towards faint, colours from blue-white to orange. Drawn as tiny
// streaks between where each star was half a frame ago and where it is now,
// so turning the camera does not make them strobe.
function makeStars() {
  const R = rng(SEED ^ 0x5157a2);
  const N = 9000;
  const dirs = new Float32Array(N * 3), bright = new Float32Array(N), cols = new Float32Array(N * 3);
  const gal = new THREE.Vector3(0.35, 0.86, -0.37).normalize();
  const a = new THREE.Vector3().crossVectors(gal, new THREE.Vector3(1, 0, 0)).normalize();
  const b = new THREE.Vector3().crossVectors(gal, a);
  for (let i = 0; i < N; i++) {
    let d;
    if (R() < 0.38) {
      const th = R() * Math.PI * 2, off = R.normal() * 0.12;
      d = a.clone().multiplyScalar(Math.cos(th)).add(b.clone().multiplyScalar(Math.sin(th))).add(gal.clone().multiplyScalar(off)).normalize();
    } else {
      const z = R() * 2 - 1, th = R() * Math.PI * 2, r = Math.sqrt(1 - z * z);
      d = new THREE.Vector3(r * Math.cos(th), z, r * Math.sin(th));
    }
    d.toArray(dirs, i * 3);
    // magnitude from a steep power law: most stars faint, a few bright
    const m = 6.8 - 7.6 * Math.pow(R(), 3.2);
    bright[i] = Math.pow(10, -0.4 * (m - 1.0));
    const bv = Math.min(Math.max(0.55 + R.normal() * 0.42, -0.3), 1.7);
    const c = new THREE.Color().setRGB(
      Math.min(1, 0.72 + 0.3 * bv), Math.min(1, 0.82 + 0.06 * bv), Math.min(1, 1.08 - 0.42 * Math.max(bv, 0)));
    c.toArray(cols, i * 3);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.setAttribute('sdir', new THREE.InstancedBufferAttribute(dirs, 3));
  g.setAttribute('sbright', new THREE.InstancedBufferAttribute(bright, 1));
  g.setAttribute('scolor', new THREE.InstancedBufferAttribute(cols, 3));
  g.instanceCount = N;
  const mat = new THREE.ShaderMaterial({
    uniforms: { viewRot: { value: new THREE.Matrix3() }, prevViewRot: { value: new THREE.Matrix3() },
      proj: { value: new THREE.Matrix4() }, res: { value: new THREE.Vector2(1920, 1080) },
      px: { value: 1 }, gain: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 sdir; attribute float sbright; attribute vec3 scolor;
      uniform mat3 viewRot, prevViewRot; uniform mat4 proj; uniform vec2 res; uniform float px, gain;
      varying vec2 vLocal; varying float vHalf, vSig; varying vec3 vCol;
      vec2 screen(vec3 v, out float ok) {
        vec4 c = proj * vec4(v, 0.0);
        ok = c.w > 1e-4 ? 1.0 : 0.0;
        return c.xy / max(c.w, 1e-4) * 0.5 * res;
      }
      void main() {
        float ok1, ok0;
        vec2 s1 = screen(viewRot * sdir, ok1);
        vec2 s0 = screen(prevViewRot * sdir, ok0);
        if (ok1 * ok0 < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec2 d = s1 - s0; float len = length(d);
        vec2 dir = len > 1e-3 ? d / len : vec2(1.0, 0.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        float sig = px * (0.55 + 0.22 * sqrt(min(sbright, 9.0)));
        float r = sig * 3.0;
        float halfLen = len * 0.5 + r;
        vec2 center = 0.5 * (s0 + s1);
        vec2 p = center + dir * position.x * halfLen + nrm * position.y * r;
        vLocal = vec2(position.x * halfLen, position.y * r);
        vHalf = len * 0.5; vSig = sig;
        // keep the light of a star the same whether it is a dot or a streak
        float spread = (sig * 2.5066) / (sig * 2.5066 + len);
        vCol = scolor * min(sbright, 6.0) * gain * spread;
        gl_Position = vec4(p / (0.5 * res), 0.99999, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vLocal; varying float vHalf, vSig; varying vec3 vCol;
      void main() {
        float dx = max(abs(vLocal.x) - vHalf, 0.0);
        float d2 = dx * dx + vLocal.y * vLocal.y;
        float a = exp(-d2 / (2.0 * vSig * vSig));
        gl_FragColor = vec4(vCol * a, 1.0);
      }
    `,
    // Drawn at the far plane with the depth test on, so bodies hide the stars behind them.
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: true,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// ---- Dots ------------------------------------------------------------------------------
// When a body is smaller than a few pixels it would vanish; draw it as a
// small point of its own colour, lit by the fraction of it facing the Sun.
function makeDot(body, color) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(...color) }, radius: { value: RADII[body] },
      px: { value: 1 }, tanHalf: { value: 1 }, halfH: { value: 540 }, sunDir: { value: SUN } },
    vertexShader: /* glsl */ `
      uniform float radius, px, tanHalf, halfH; uniform vec3 sunDir;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float d = length(mv.xyz);
        float rPx = radius / d / tanHalf * halfH;
        vec3 toCam = normalize(cameraPosition - (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz);
        float phase = 0.5 * (1.0 + dot(toCam, sunDir));
        vA = (1.0 - smoothstep(1.0, 2.2, rPx)) * (0.25 + 0.75 * phase);
        gl_PointSize = 3.2 * px;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color; varying float vA;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float a = exp(-dot(c, c) * 3.0) * vA;
        gl_FragColor = vec4(color * a, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const p = new THREE.Points(g, mat);
  p.position.copy(CENTERS[body]);
  p.frustumCulled = false;
  p.renderOrder = 6;
  return p;
}

export function buildBodies(scene, tex) {
  const earth = makeEarth(tex), moon = makeMoon(tex), mars = makeMars(tex);
  const earthAir = makeAtmosphere('earth', 1.022, [0.28, 0.55, 1.0], [1.0, 0.45, 0.2], 1.0, 0.035);
  const marsAir = makeAtmosphere('mars', 1.012, [0.85, 0.62, 0.48], [0.45, 0.6, 0.9], 0.55, 0.035);
  const stars = makeStars();
  const dots = [makeDot('earth', [0.55, 0.75, 1.6]), makeDot('moon', [1.1, 1.05, 1.0]), makeDot('mars', [1.6, 0.8, 0.5])];
  scene.add(stars, earth, moon, mars, earthAir, marsAir, ...dots);
  return { earth, moon, mars, earthAir, marsAir, stars, dots };
}

export function updateBodies(b, t, camera, prevCamera, res) {
  b.earth.quaternion.copy(bodyQuat('earth', t));
  b.moon.quaternion.copy(bodyQuat('moon', t));
  b.mars.quaternion.copy(bodyQuat('mars', t));
  const px = res.y / 1080;
  const su = b.stars.material.uniforms;
  su.viewRot.value.setFromMatrix4(camera.matrixWorldInverse);
  su.prevViewRot.value.setFromMatrix4(prevCamera.matrixWorldInverse);
  su.proj.value.copy(camera.projectionMatrix);
  su.res.value.copy(res);
  su.px.value = px;
  for (const d of b.dots) {
    d.material.uniforms.px.value = px;
    d.material.uniforms.tanHalf.value = Math.tan((camera.fov / 2) * DEG);
    d.material.uniforms.halfH.value = res.y / 2;
  }
}
