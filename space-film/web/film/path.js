// The one camera path. Everything here is a pure function of time t (seconds),
// so any frame can be computed on its own.
//
// Geometry: a centripetal Catmull-Rom curve through key points placed around
// each body (a slow arc while we hold on a stop) and one far point per long
// leg (where the body behind is a dot and the one ahead is a dot).
// Timing: the curve is re-measured in "perceived distance" (world distance
// divided by the distance to the nearest body), so a zoom from a third of
// the frame down to a dot runs at an even pace instead of all at once.
// Speed is constant and slow while holding on a stop and swells smoothly
// between stops.

import * as THREE from 'three';
import { BODIES, STOPS, OPENING, FILL_THIRD, DURATION } from './config.js';

const DEG = Math.PI / 180;

// Direction from (lat, lon) in degrees. lon is measured in the ecliptic (XZ)
// plane from the Sun direction (+X) towards +Z. For a camera at body + d*dir,
// lon is roughly the phase angle, and lon in (0,180) puts the Sun on the right.
export function dir(lat, lon) {
  const la = lat * DEG, lo = lon * DEG;
  return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo));
}

// ---- Where the bodies are -------------------------------------------------
const E = new THREE.Vector3(...BODIES.earth.center);
const R = { earth: BODIES.earth.radius, moon: BODIES.moon.radius, mars: BODIES.mars.radius };
const D = FILL_THIRD; // ~10.8 radii: the body fills about a third of the frame height

// A long leg: pull straight back from body A along dirA to distance dA (body A
// shrinks to a dot), bend round while both bodies are dots, then come straight
// in to body B along dirB from distance dB (body B grows from a dot).
function placeLeg(centerA, dirA, dA, dirB, dB, bend) {
  const Fa = centerA.clone().add(dirA.clone().multiplyScalar(dA));
  const n = dirA.clone().sub(dirB).normalize();
  const Fb = Fa.clone().add(n.multiplyScalar(bend));
  const centerB = Fb.clone().sub(dirB.clone().multiplyScalar(dB));
  return { Fa, Fb, centerB };
}

const LEG1 = { dirA: dir(2, 118), dA: 200, dirB: dir(-40, 104), dB: 200, bend: 70, turn: 7.5 };
const leg1 = placeLeg(E, LEG1.dirA, LEG1.dA, LEG1.dirB, LEG1.dB, LEG1.bend);
const M = leg1.centerB;

const LEG2 = { dirA: dir(-24, 106), dA: 160, dirB: dir(16, 104), dB: 2600, bend: 60, turn: 6.5 };
const leg2 = placeLeg(M, LEG2.dirA, LEG2.dA, LEG2.dirB, LEG2.dB, LEG2.bend);
const MA = leg2.centerB;

export const CENTERS = { earth: E, moon: M, mars: MA };
export const RADII = R;

// ---- Key points -------------------------------------------------------------
const at = (body, lat, lon, k) => CENTERS[body].clone().add(dir(lat, lon).multiplyScalar(k * R[body]));
const onRay = (center, d, dist) => center.clone().add(d.clone().multiplyScalar(dist));

const keys = [];
const mark = {}; // named key indices
function key(name, p) { if (name) mark[name] = keys.length; keys.push(p); }

// Opening: close over the night side of Earth.
key('open0', at('earth', 30, 136, 2.05));
key('open1', at('earth', 28, 133, 2.3));
key(null, at('earth', 20, 122, 5.2));
// Stop 1: satellites. Slow arc while holding.
key('s0in', at('earth', 10, 110, D * 1.04));
key(null, at('earth', 7, 113, D * 1.0));
key('s0out', at('earth', 4, 116, D * 1.0));
// Leg 1: straight back from Earth, bend, straight in to the Moon.
for (const r of [24, 50, 100]) key(null, onRay(E, LEG1.dirA, r));
key('leg1a', leg1.Fa);
key('leg1b', leg1.Fb);
for (const r of [100, 45, 18, 7]) key(null, onRay(M, LEG1.dirB, r));
// Stop 2: the base, seen from below the Moon's south pole.
key('s1in', at('moon', -44, 104, D * 1.04));
key(null, at('moon', -50, 106, D * 1.0));
key('s1out', at('moon', -56, 108, D * 1.0));
// Rise towards the equator to see the railway ring as an ellipse.
key(null, at('moon', -45, 104, D * 1.03));
key('s2in', at('moon', -33, 100, D * 1.02));
key(null, at('moon', -30, 102, D * 1.0));
key('s2out', at('moon', -27, 104, D * 1.0));
// Leg 2: straight back from the Moon, bend, straight in to Mars.
for (const r of [8, 25, 70]) key(null, onRay(M, LEG2.dirA, r));
key('leg2a', leg2.Fa);
key('leg2b', leg2.Fb);
for (const r of [1000, 380, 140, 50, 16]) key(null, onRay(MA, LEG2.dirB, r));
// Stop 4: the city on the night side.
key('s3in', at('mars', 17, 106, D * 1.04));
key(null, at('mars', 19, 109, D * 1.0));
key('s3out', at('mars', 21, 112, D * 1.0));
// Swing round to see the mirrors catch the Sun.
key(null, at('mars', 28, 100, D * 1.06));
key('s4in', at('mars', 34, 86, D * 1.1));
key(null, at('mars', 36, 80, D * 1.12));
key('s4out', at('mars', 38, 74, D * 1.14));

export const KEYS = keys;
export const KEY_MARKS = mark;

const curve = new THREE.CatmullRomCurve3(keys, false, 'centripetal');

// ---- Perceived-distance table ----------------------------------------------
const bodyList = ['earth', 'moon', 'mars'];
// Soft minimum of the distances to the bodies, so the measure has no kinks.
function scale(p) {
  let inv = 0;
  for (const b of bodyList) inv += 1 / Math.max(p.distanceTo(CENTERS[b]) - 0.6 * R[b], 0.05);
  return 1 / inv;
}

const N = 120000;
const tableU = new Float64Array(N + 1);
const tableS = new Float64Array(N + 1);
{
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  curve.getPoint(0, p);
  let S = 0;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    curve.getPoint(u, q);
    if (i > 0) {
      const mid = p.clone().add(q).multiplyScalar(0.5);
      S += p.distanceTo(q) / scale(mid);
    }
    tableU[i] = u; tableS[i] = S;
    p.copy(q);
  }
}
const keyS = (idx) => tableS[Math.round((idx / (keys.length - 1)) * N)];

function uFromS(S) {
  let lo = 0, hi = N;
  if (S <= tableS[0]) return 0;
  if (S >= tableS[N]) return 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tableS[m] < S) lo = m; else hi = m; }
  const f = (S - tableS[lo]) / (tableS[hi] - tableS[lo]);
  return tableU[lo] + f * (tableU[hi] - tableU[lo]);
}

// ---- Time -> perceived distance -----------------------------------------------
// Holds: constant slow speed. Moves: speed blends from one hold speed to the
// next with a sin^2 swell, so acceleration is continuous everywhere.
const holds = [
  { t0: 0, t1: OPENING.hold, k0: mark.open0, k1: mark.open1, body: 'earth' },
  ...STOPS.map((s, i) => ({ t0: s.t, t1: s.t + s.hold, k0: mark[`s${i}in`], k1: mark[`s${i}out`], body: s.body })),
];
const segs = [];
for (let i = 0; i < holds.length; i++) {
  const h = holds[i];
  const S0 = keyS(h.k0), S1 = keyS(h.k1);
  h.S0 = S0; h.S1 = S1; h.v = (S1 - S0) / (h.t1 - h.t0);
  segs.push({ type: 'hold', t0: h.t0, t1: h.t1, S0, S1, v: h.v });
}
const allSegs = [];
for (let i = 0; i < holds.length; i++) {
  allSegs.push(segs[i]);
  if (i + 1 < holds.length) {
    const a = holds[i], b = holds[i + 1];
    const T = b.t0 - a.t1, dS = b.S0 - a.S1;
    const A = (2 * dS) / T - a.v - b.v;
    allSegs.push({ type: 'move', t0: a.t1, t1: b.t0, S0: a.S1, S1: b.S0, va: a.v, vb: b.v, A, from: a.body, to: b.body });
  }
}
export const SEGMENTS = allSegs;
export const HOLDS = holds;

const smooth = (x) => x * x * (3 - 2 * x);
const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);

function perceivedAt(t) {
  t = Math.min(Math.max(t, 0), DURATION);
  for (const s of allSegs) {
    if (t <= s.t1 || s === allSegs[allSegs.length - 1]) {
      if (s.type === 'hold') return s.S0 + s.v * (t - s.t0);
      const T = s.t1 - s.t0, x = (t - s.t0) / T;
      const Ism = x * x * x - (x * x * x * x) / 2;
      const Isin = x / 2 - Math.sin(2 * Math.PI * x) / (4 * Math.PI);
      return s.S0 + T * (s.va * x + (s.vb - s.va) * Ism + s.A * Isin);
    }
  }
  return 0;
}

// ---- Where the camera looks ----------------------------------------------------
// On a long leg the camera keeps the body behind in frame while it shrinks
// (moving straight away from it, so the view does not turn), then turns at an
// even rate to the body ahead while going round the bend, where both are dots
// and the stars, which are infinitely far, are the only thing that moves.
function lookQuat(eye, target, out) {
  const m = new THREE.Matrix4().lookAt(eye, target, new THREE.Vector3(0, 1, 0));
  return out.setFromRotationMatrix(m);
}

function timeAtS(S) {
  let lo = 0, hi = DURATION;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (perceivedAt(m) < S) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// Turn windows: a fixed length of time centred on the bend. Before and after
// it the camera moves straight along a ray from the body it looks at, so that
// body holds still in frame and freezing the start/end orientation is exact.
const TURNS = [
  { a: 'earth', b: 'moon', k0: mark.leg1a, k1: mark.leg1b, len: LEG1.turn },
  { a: 'moon', b: 'mars', k0: mark.leg2a, k1: mark.leg2b, len: LEG2.turn },
].map((w) => {
  const tc = timeAtS((keyS(w.k0) + keyS(w.k1)) / 2);
  const t0 = tc - w.len / 2, t1 = tc + w.len / 2;
  return { ...w, t0, t1, tBendA: timeAtS(keyS(w.k0)), tBendB: timeAtS(keyS(w.k1)) };
});
export const TURN_WINDOWS = TURNS.map(({ a, b, t0, t1 }) => ({ a, b, t0, t1 }));

// Opening: aim left of and below Earth's centre, so the night side fills the
// upper right of the frame and its limb curves across, leaving the lower left
// (where the year sits) on black sky. The offset fades out by stop 1.
const OPEN_AIM = { yaw: 15 * DEG, pitch: 5 * DEG };

function trackQuat(t, body) {
  const pos = curve.getPoint(uFromS(perceivedAt(t)));
  return lookQuat(pos, CENTERS[body], new THREE.Quaternion());
}

function desiredQuat(t) {
  t = Math.min(Math.max(t, 0), DURATION);
  const pos = curve.getPoint(uFromS(perceivedAt(t)));
  const turn = TURNS.find((w) => t > w.t0 && t < w.t1);
  if (turn) {
    // Track each body only while moving straight along its ray; through the
    // bend itself the two orientations are held, so the turn stays even.
    const qa = trackQuat(Math.min(t, turn.tBendA), turn.a);
    const qb = trackQuat(Math.max(t, turn.tBendB), turn.b);
    const x = (t - turn.t0) / (turn.t1 - turn.t0);
    return qa.slerp(qb, smoother(x));
  }
  let body = 'earth';
  if (t >= TURNS[0].t1) body = 'moon';
  if (t >= TURNS[1].t1) body = 'mars';
  const q = lookQuat(pos, CENTERS[body], new THREE.Quaternion());
  if (t < STOPS[0].t) {
    const k = 1 - smooth(Math.min(Math.max((t - 3.0) / (STOPS[0].t - 3.6), 0), 1));
    const off = new THREE.Quaternion().setFromEuler(new THREE.Euler(-OPEN_AIM.pitch * k, OPEN_AIM.yaw * k, 0, 'YXZ'));
    q.multiply(off);
  }
  return q;
}

// The orientation actually used is the desired one averaged over a short
// Gaussian window in time (still a pure function of t), which rounds off any
// remaining corners in how fast the camera turns.
const SMOOTH_SIGMA = 0.45, SMOOTH_TAPS = 25;
const weights = [];
for (let i = 0; i < SMOOTH_TAPS; i++) {
  const x = ((i / (SMOOTH_TAPS - 1)) * 2 - 1) * 2.6 * SMOOTH_SIGMA;
  weights.push({ dt: x, w: Math.exp(-0.5 * (x / SMOOTH_SIGMA) ** 2) });
}

export function cameraAt(t) {
  const S = perceivedAt(t);
  const pos = curve.getPoint(uFromS(S));
  const center = desiredQuat(t);
  let x = 0, y = 0, z = 0, w = 0;
  for (const k of weights) {
    const q = desiredQuat(t + k.dt);
    const sgn = q.dot(center) < 0 ? -1 : 1;
    x += sgn * k.w * q.x; y += sgn * k.w * q.y; z += sgn * k.w * q.z; w += sgn * k.w * q.w;
  }
  const quat = new THREE.Quaternion(x, y, z, w).normalize();
  return { pos, quat, S };
}

// ---- Year and line ----------------------------------------------------------------
// Continuous year (things "built by then" appear as it passes their year) and
// the year on screen, which is its floor: it ticks up while travelling and
// lands on each stop's year exactly when the camera arrives.
export function yearFloatAt(t) {
  const marks = [{ t: OPENING.hold, year: OPENING.year }, ...STOPS.map((s) => ({ t: s.t, year: s.year, end: s.t + s.hold }))];
  let prevYear = OPENING.year, prevEnd = OPENING.hold;
  for (let i = 1; i < marks.length; i++) {
    const m = marks[i];
    if (t < m.t) {
      if (t <= prevEnd) return prevYear;
      const x = (t - prevEnd) / (m.t - prevEnd);
      return prevYear + (m.year - prevYear) * (0.7 * x + 0.3 * smooth(x));
    }
    prevYear = m.year; prevEnd = m.end;
  }
  return prevYear;
}
export function yearAt(t) {
  return Math.floor(yearFloatAt(t) + 1e-9);
}

// Which line is showing, and how opaque it is.
export function lineAt(t) {
  const items = [{ line: OPENING.line, t: -1, end: OPENING.hold }, ...STOPS.map((s) => ({ line: s.line, t: s.t, end: s.t + s.hold }))];
  const last = items.length - 1;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const fadeIn = smooth(Math.min(Math.max((t - (it.t - 0.25)) / 0.6, 0), 1));
    const fadeOut = i === last ? 1 : 1 - smooth(Math.min(Math.max((t - it.end) / 0.6, 0), 1));
    const a = Math.min(fadeIn, fadeOut);
    if (a > 0.001) return { line: it.line, alpha: a };
  }
  return { line: '', alpha: 0 };
}
