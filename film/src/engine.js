'use strict';
/* =====================================================================
   ISOLINE — engine
   Everything is a pure function of absolute time t (seconds, 0..15).
   No timers, no accumulated state: window.seek(t) renders exactly one frame.
   ===================================================================== */

// ---------------------------------------------------------------- config
const Q = new URLSearchParams(location.search);
const W = +(Q.get('w') || 1920), H = +(Q.get('h') || 1080);
const PX = H / 1080;                       // design pixels -> device pixels
const DUR = 75, BPM = 120, BEAT = 60 / BPM, SIX = BEAT / 4;
window.DURATION = DUR;
const MW = 16 / 9;                         // map half-width (world units); map half-height = 1
const PLAN_FOV = 30 * Math.PI / 180;
const PLAN_DIST = 1 / Math.tan(PLAN_FOV / 2);   // camera distance that frames 2u of height
const WPX = 2 / 1080;                      // world units per design pixel in exact plan framing

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const INK = hex('#0A0A0B'), PAPER = hex('#F1EEE6'), ORANGE = hex('#FF4A1C'), COBALT = hex('#2B36FF');

// ---------------------------------------------------------------- math
const PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const unit = (a, b, x) => clamp((x - a) / (b - a));
const sstep = (a, b, x) => { const t = unit(a, b, x); return t * t * (3 - 2 * t); };
const E = {
  outExpo(t, k = 7) { t = clamp(t); return (1 - Math.exp(-k * t)) / (1 - Math.exp(-k)); },
  inExpo(t, k = 7) { t = clamp(t); return (Math.exp(k * t) - 1) / (Math.exp(k) - 1); },
  inOutExpo(t, k = 7) { t = clamp(t); return t < 0.5 ? 0.5 * E.inExpo(2 * t, k) : 0.5 + 0.5 * E.outExpo(2 * t - 1, k); },
  inOutCubic(t) { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  outCubic(t) { t = clamp(t); return 1 - Math.pow(1 - t, 3); },
  inCubic(t) { t = clamp(t); return t * t * t; },
  inOutSine(t) { t = clamp(t); return 0.5 - 0.5 * Math.cos(PI * t); },
  quintic(t) { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); },
};
// critically damped spring step response (starts at rest, no overshoot)
const spring = (tau, w) => (tau <= 0 ? 0 : 1 - (1 + w * tau) * Math.exp(-w * tau));
// finite-duration exponential snap (impact-like attack, lands exactly at `dur`)
const snap = (tau, dur, k = 7) => (tau <= 0 ? 0 : E.outExpo(tau / dur, k));
// one-sided exponential decay envelope for beat hits
const hit = (tau, decay) => (tau < 0 ? 0 : Math.exp(-tau / decay));

function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    x = clamp(x); let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-7 || Math.abs(d) < 1e-7) break; t -= e / d; }
    let lo = 0, hi = 1;
    if (Math.abs(sx(t) - x) > 1e-5) { t = x; for (let i = 0; i < 40; i++) { const v = sx(t); if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return sy(clamp(t));
  };
}

/* Keyframe track with cubic Hermite interpolation (Catmull-Rom tangents).
   keys: [[t, value|array, {m: tangent array, hold: bool}]]  period>0 => cyclic */
function Track(keys, period = 0, drift = null) {
  const K = keys.map(([t, v, o]) => ({ t, v: Array.isArray(v) ? v.slice() : [v], o: o || {} }));
  const n = K.length, dim = K[0].v.length;
  // drift: per-cycle offset (e.g. yaw -360) so a continuous orbit can close the loop without unwinding
  const key = (i) => {
    if (!period) return K[Math.max(0, Math.min(n - 1, i))];
    const w = Math.floor(i / n), k = K[((i % n) + n) % n];
    return { t: k.t + w * period, v: drift && w ? k.v.map((x, d) => x + w * drift[d]) : k.v, o: k.o };
  };
  const tan = (i) => {
    const k = key(i);
    if (k.o.hold) return new Array(dim).fill(0);
    if (k.o.m) return k.o.m;
    if (!period && (i === 0 || i === n - 1)) return new Array(dim).fill(0);
    const a = key(i - 1), b = key(i + 1);
    const out = [];
    for (let d = 0; d < dim; d++) {
      const s0 = (k.v[d] - a.v[d]) / (k.t - a.t), s1 = (b.v[d] - k.v[d]) / (b.t - k.t);
      out.push(0.5 * (s0 + s1));
    }
    return out;
  };
  const M = K.map((_, i) => tan(i));
  const tanAt = (i) => M[((i % n) + n) % n];
  return (t) => {
    if (period) t = ((t % period) + period) % period;
    let i;
    if (!period) {
      if (t <= K[0].t) return K[0].v.slice();
      if (t >= K[n - 1].t) return K[n - 1].v.slice();
    }
    i = n - 1;
    for (let j = 0; j < n; j++) if (K[j].t > t) { i = j - 1; break; }
    const a = key(i), b = key(i + 1);
    if (period && drift) { /* evaluation happens in cycle 0, so keys from cycle 0/1 already carry the drift */ }
    const h = b.t - a.t, s = (t - a.t) / h, s2 = s * s, s3 = s2 * s;
    const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
    const ma = tanAt(i), mb = tanAt(i + 1);
    const out = new Array(dim);
    for (let d = 0; d < dim; d++) out[d] = h00 * a.v[d] + h10 * h * ma[d] + h01 * b.v[d] + h11 * h * mb[d];
    return out;
  };
}

function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function perlin2(seed) {
  const r = mulberry32(seed), p = new Uint16Array(512), a = [];
  for (let i = 0; i < 256; i++) a.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const tmp = a[i]; a[i] = a[j]; a[j] = tmp; }
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const an = r() * TAU; gx[i] = Math.cos(an); gy[i] = Math.sin(an); }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const g = (ix, iy, dx, dy) => { const h = p[p[ix] + iy]; return gx[h] * dx + gy[h] * dy; };
    const n00 = g(X, Y, xf, yf), n10 = g(X + 1, Y, xf - 1, yf), n01 = g(X, Y + 1, xf, yf - 1), n11 = g(X + 1, Y + 1, xf - 1, yf - 1);
    const u = fade(xf), v = fade(yf), a0 = n00 + (n10 - n00) * u, a1 = n01 + (n11 - n01) * u;
    return a0 + (a1 - a0) * v;
  };
}

// vec / mat (column-major, WebGL convention)
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a) => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function perspective(fovy, aspect, n, f) {
  const t = 1 / Math.tan(fovy / 2);
  return new Float32Array([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]);
}
function lookAt(e, c, u) {
  const f = norm3(sub3(c, e)), s = norm3(cross3(f, u)), v = cross3(s, f);
  return new Float32Array([s[0], v[0], -f[0], 0, s[1], v[1], -f[1], 0, s[2], v[2], -f[2], 0, -dot3(s, e), -dot3(v, e), dot3(f, e), 1]);
}
function mul4(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s;
  }
  return o;
}
function xform(m, p) {
  const x = p[0], y = p[1], z = p[2];
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
}

/* Camera: orbit around a target. yaw rotates around +Y, pitch is elevation above the ground plane
   (90deg = plan view, screen-up = world -Z = "north"). */
function camera(c) {
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  const dir = [cp * sy, sp, cp * cy];
  const tgt = [c.tx, c.ty, c.tz];
  const eye = add3(tgt, scl3(dir, c.dist));
  const up = [-sp * sy, cp, -sp * cy];
  const roll = c.roll || 0;
  let upv = up;
  if (roll) { const side = cross3(scl3(dir, -1), up); upv = add3(scl3(up, Math.cos(roll)), scl3(side, Math.sin(roll))); }
  const view = lookAt(eye, tgt, upv);
  const near = c.near || Math.max(0.004, c.dist * 0.01), far = c.far || 60;
  const proj = perspective(c.fov, W / H, near, far);
  return { view, proj, vp: mul4(proj, view), eye, dir, near, far, fov: c.fov };
}
function project(cam, p) {
  const c = xform(cam.vp, p);
  return [(c[0] / c[3] * 0.5 + 0.5) * W, (0.5 - c[1] / c[3] * 0.5) * H, c[3]];
}

// ---------------------------------------------------------------- distance transform (Felzenszwalb; tiny-sdf style)
const INF = 1e20;
function edt1d(grid, offset, stride, length, f, v, z) {
  v[0] = 0; z[0] = -INF; z[1] = INF; f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do { const r = v[k]; s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2; } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k], qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}
function edt2d(grid, w, h) {
  const n = Math.max(w, h), f = new Float64Array(n), v = new Uint16Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) edt1d(grid, x, w, h, f, v, z);
  for (let y = 0; y < h; y++) edt1d(grid, y * w, 1, w, f, v, z);
}
// alpha (0..255, row-major, top row first) -> signed distance in pixels (negative inside)
function sdfFromAlpha(alpha, w, h) {
  const N = w * h, outer = new Float64Array(N), inner = new Float64Array(N), out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = alpha[i] / 255;
    if (a >= 1) { outer[i] = 0; inner[i] = INF; }
    else if (a <= 0) { outer[i] = INF; inner[i] = 0; }
    else { const d = 0.5 - a; outer[i] = d > 0 ? d * d : 0; inner[i] = d < 0 ? d * d : 0; }
  }
  edt2d(outer, w, h); edt2d(inner, w, h);
  for (let i = 0; i < N; i++) out[i] = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);
  return out;
}

// ---------------------------------------------------------------- WebGL
const canvas = document.getElementById('film');
canvas.width = W; canvas.height = H;
canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, stencil: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
if (!gl) throw new Error('WebGL2 unavailable');
const FLOAT_LINEAR = !!gl.getExtension('OES_texture_float_linear');

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n');
    throw new Error('shader: ' + log + '\n' + lines);
  }
  return s;
}
function Program(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const cache = {};
  return {
    p,
    u: (n) => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n))),
    a: (n) => gl.getAttribLocation(p, n),
    use() { gl.useProgram(p); return this; },
  };
}
function fieldTexture(data, w, h) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, FLOAT_LINEAR ? gl.R32F : gl.R16F, w, h, 0, gl.RED, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function byteTexture(data, w, h) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, data);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
// growable float buffer for per-frame geometry
class FBuf {
  constructor(n = 1 << 16) { this.a = new Float32Array(n); this.n = 0; }
  reset() { this.n = 0; return this; }
  need(k) { if (this.n + k > this.a.length) { let m = this.a.length * 2; while (m < this.n + k) m *= 2; const b = new Float32Array(m); b.set(this.a.subarray(0, this.n)); this.a = b; } }
  push(...v) { this.need(v.length); for (let i = 0; i < v.length; i++) this.a[this.n++] = v[i]; }
  view() { return this.a.subarray(0, this.n); }
}
