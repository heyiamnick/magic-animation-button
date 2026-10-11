/* =====================================================================
   SCENE — the timeline. Every value below is a closed-form function of t.
   Beat n is at n * 0.5 s. 16th notes at 0.125 s.
   ===================================================================== */
const TEX = {};                 // textures (filled in init)
const FIELDS = {};              // CPU fields (filled in init)

const beat = (n) => n * BEAT;
const famDefaults = () => ({ c: [0, 0], ang: 0, W: 0, m: 0, mode: 0, sp: 1, invS: 1, v0: 0, hw: 0.5, hwW: 0, col: ORANGE, alpha: 1, gap: 0, boost: 1, every: 5 });
const fam = (o) => Object.assign(famDefaults(), o);

/* ----------------------------------------------------------------- interface layout (plan view)
   12-col grid on 1920x1080, 72px margins, 24px gutters. 1 world unit = UI_S px. */
const UI_S = 1176 / (2 * MW);
const UI_CX = -MW + (960 - 72) / UI_S, UI_CZ = -1 + (540 - 120) / UI_S;
const UI_DIST = (540 / UI_S) / Math.tan(15 * DEG);
const UI_GUT = 24 / UI_S;
const UI_BOT = UI_CZ + (1008 - 540) / UI_S;      // bottom margin line (world z)
const UI_RIGHT = UI_CX + (1848 - 960) / UI_S;    // right margin line (world x)
/* ----------------------------------------------------------------- camera
   One continuous periodic camera curve: [tx, ty, tz, dist, yaw(deg), pitch(deg), fov(deg)] */
const PD = PLAN_DIST;
const CAM_KEYS = [
  [0.0, [0.3, 0, 0.0, 1.45, -78, 11, 44]],
  [0.5, [0.25, 0, 0.0, 1.95, -69, 17, 40]],
  [1.0, [0.08, 0, 0, 2.95, -49, 35, 33]],
  [1.5, [0.02, 0, 0, 3.45, -21, 63, 31]],
  [2.0, [0, 0, 0, PD, 0, 90, 30], { hold: true }],
  [4.0, [0, 0, 0, PD * 0.955, 0, 90, 30]],
  [5.0, [0, 0, 0, PD * 0.945, 0, 90, 30]],
  [6.0, [0, 0, 0, PD * 0.915, 0, 90, 30], { hold: true }],
  [6.5, [-0.2, 0.05, 0.05, 2.7, -26, 52, 32]],
  [7.0, [-0.45, 0.22, 0.02, 1.7, -64, 24, 40]],
  [7.5, [0.35, 0.30, 0.0, 1.5, -86, 17, 42]],
  [8.0, [0.9, 0.32, 0.0, 1.45, -92, 21, 40]],
  [8.5, [0.55, 0.08, 0.2, 3.7, -38, 60, 34]],
  [9.0, [UI_CX, 0, UI_CZ, UI_DIST, 0, 90, 30], { hold: true }],
  [10.0, [UI_CX, 0, UI_CZ, UI_DIST * 0.995, 0, 90, 30]],
  [11.75, [UI_CX, 0, UI_CZ, UI_DIST * 0.98, 0, 90, 30]],
  [12.0, [UI_CX, 0, UI_CZ, UI_DIST * 0.975, 0, 90, 30], { m: [-1.4, 0.35, 0.2, -5.0, -26, -70, 10] }],
  [12.5, [0.05, 0.32, 0.5, 2.55, -26, 29, 38]],
  [13.0, [0.5, 0.36, 0.06, 2.05, 24, 24, 40]],
  [13.5, [0.12, 0.15, 0.0, 2.9, 7, 61, 33]],
  [14.0, [0, 0, 0, PD, 0, 90, 30], { hold: true }],
  [14.5, [0, 0, 0, PD, 0, 90, 30], { hold: true }],
];
let camTrack = Track(CAM_KEYS, DUR);
function camAt(t) {
  const v = window.__camOverride ? window.__camOverride : camTrack(t);
  return camera({ tx: v[0], ty: v[1], tz: v[2], dist: v[3], yaw: v[4] * DEG, pitch: Math.min(90, v[5]) * DEG, fov: v[6] * DEG });
}

/* ----------------------------------------------------------------- bar 1: thread
   `u` may be negative: the end of the film evaluates these same functions at u = t - 15. */
const SPLITS = [0.5, 0.625, 0.75, 0.875, 1.5, 1.625, 1.75, 1.875];
const mOpen = (u) => { let m = 0; for (const s of SPLITS) m += snap(u - s, 0.11, 6); return m; };
const bandW = (u) => 0.42 + 0.68 * E.outExpo(unit(0.5, 1.0, u), 5) + 2.9 * E.inOutCubic(unit(1.5, 1.95, u));
const threadHW = (m) => Math.max(0.65, 3.8 * Math.pow(2, -0.32 * m));

function whipPulses(u) {
  if (u < 0 || u > 0.9) return [];
  const env = (1 - Math.exp(-u / 0.022)) * Math.exp(-u / 0.36);
  const envY = (1 - Math.exp(-u / 0.03)) * Math.exp(-u / 0.30);
  const c = 4.4, sig = 0.22 + 0.55 * u;
  return [[c * u, 0.15 * env, 0.1 * envY, sig], [-c * u, 0.15 * env, 0.1 * envY, sig]];
}
function sagAt(u) {        // slack before the snap (only exists in the last 0.3 s of the loop)
  if (u >= 0 || u < -0.3) return [0, 4];
  const k = 1 - E.inExpo(unit(-0.3, 0, u), 4);
  return [0.075 * k * sstep(-0.3, -0.22, u), 2.6];
}
function sheetWave(u) {
  let a = 0, ph = 0;
  for (const [tk, amp] of [[0.5, 0.045], [1.0, 0.035], [1.5, 0.02]]) {
    const tau = u - tk; if (tau < 0) continue;
    const e = (1 - Math.exp(-tau / 0.04)) * Math.exp(-tau / 0.22);
    a += amp * e; ph = TAU * tau / 0.42;
  }
  return [a, 1.3, ph, 0.25];
}

function fieldOpening(u) {
  const m = mOpen(u), Wd = bandW(u), hw = threadHW(m);
  const spacePx = (Wd / Math.pow(2, Math.floor(m) + 1)) / WPX;
  const gap = clamp(0.12 * spacePx, 0, 2.6);
  const A = fam({ ang: 0, W: Wd, m, mode: 0, hw: 0.5, hwW: hw * WPX, col: ORANGE, gap });
  const B = fam({ ang: 90 * DEG * E.outExpo(unit(1.0, 1.42, u), 6), W: Wd, m, mode: 0, hw: 0.5, hwW: hw * WPX, col: PAPER, gap });
  let front = -4;
  for (let i = 0; i < 6; i++) front += 1.45 * snap(u - (1.0 + i * 0.1), 0.08, 6);
  return { A, B, pulses: whipPulses(u), sag: sagAt(u), sheet: sheetWave(u),
           weave: [Math.SQRT1_2, Math.SQRT1_2, front, u >= 1.0 ? 1 : 0] };
}

/* ----------------------------------------------------------------- bars 2-3: signal -> terrain */
const SP = 4 / 256;   // grating spacing after full subdivision
function fieldSignal(t) {
  // white family ratchets toward the orange: angle halves on every 16th
  let K = 0; for (let k = 0; k < 12; k++) K += snap(t - (2.0 + k * 0.125), 0.09, 6);
  const angB = 90 * DEG * Math.pow(2, -K) * (1 - sstep(3.4, 3.7, t));
  const gap = 0.84 * (1 - E.outExpo(unit(2.0, 2.3, t), 4));
  // bar 3: exponential stretch of both gratings (lambda -> infinity)
  const SA = Math.exp(9.5 * Math.pow(unit(4.0, 5.0, t), 1.6));
  const SB = t >= 5.35 ? Infinity : Math.exp(9.5 * Math.pow(unit(4.45, 5.35, t), 1.5));
  const hwA = mix(0.65, 1.5, E.inOutCubic(unit(4.6, 5.1, t)));
  const A = fam({ ang: 0, mode: 1, sp: SP, invS: 1 / SA, v0: SP / 2, hw: hwA, col: ORANGE, gap });
  const B = fam({ ang: angB, mode: 1, sp: SP, invS: 1 / SB, v0: SP / 2, hw: mix(0.65, 0.6, unit(4.5, 5.5, t)), col: PAPER, gap, boost: 1.9, every: 5 });
  // SIGNAL: emerges at beat 5, stretches (6), splits (6.5), reconstructs (7), melts (7.5)
  const amount = t >= 2.5 ? 1 : 0;
  const wipeY = mix(1.15, -1.15, E.outExpo(unit(2.5, 2.62, t), 4));
  const stretch = 1 + 1.45 * E.inExpo(unit(3.0, 3.22, t), 5) - 1.45 * E.outExpo(unit(3.5, 3.7, t), 6);
  const split = 0.42 * (E.outExpo(unit(3.25, 3.36, t), 6) - spring(t - 3.5, 30) * (t >= 3.5 ? 1 : 0));
  const melt = E.inOutCubic(unit(3.72, 4.25, t));
  const blur = 0.16 * melt;
  const phase = 0.5 + 2.6 * melt;
  const duty = 0.42 * (1 - melt);
  const morph = E.inOutCubic(unit(3.95, 4.55, t));
  const Kt = LEVELS * E.inOutCubic(unit(3.85, 4.5, t));
  // bar 3 beat 11: index-contour sweep, and the weave resolves to "thread on top"
  const sw = E.inOutCubic(unit(5.5, 5.92, t));
  const sweep = mix(-2.2, 2.2, sw);
  const front = t < 5.5 ? 4 : mix(3, -3, sw);
  return {
    A, B, pulses: [], sag: [0, 4], sheet: [0, 1, 0, 0],
    weave: [-1, 0, front, t < 5.95 ? 1 : 0],
    inside: t >= 5.0 ? 1 : 0,
    K: Kt, kOff: 0.5 * E.inOutCubic(unit(4.0, 5.0, t)) + 10 * E.inOutCubic(unit(5.0, 6.0, t)), sigP: [amount, stretch, split, blur], sigQ: [phase, duty, morph, wipeY], sweep,
  };
}

function fogAt(t) {                 // depth fade, only meaningful while the camera is low
  const u = t > 7.5 ? t - DUR : t;
  if (u < -0.45 || u > 2) return [30, 31];
  const k = u < 0 ? sstep(-0.45, -0.05, u) : 1 - sstep(0.9, 1.8, u);
  return [mix(30, 4.2, k), mix(31, 7.2, k)];
}
function fieldState(t) {
  let S;
  if (t < 2.0) S = fieldOpening(t);
  else if (t < 6.0 + 1e-9) S = fieldSignal(t);
  else S = fieldEnd(t);
  return Object.assign({
    bg: INK, K: 0, sigP: [0, 1, 0, 0], sigQ: [0.5, 0, 0, 2], sweep: -9,
    titP: [0, 0, 1, 0], titQ: [0, 0.03, 0, 0], ringW: 1.2, ringCol: PAPER, fog: fogAt(t),
  }, S);
}

/* ----------------------------------------------------------------- final half bar: title -> thread
   u = t - 15 (negative). From u = -0.25 the families are the opening's own functions. */
const LT = 12, RSP = 0.026;          // title field: plateau level and ring spacing (world units)
const MERGES = [-0.25, -0.1875, -0.125, -0.0625];
function fieldEnd(t) {
  const u = t - DUR;
  const capU = FIELDS.tit.ascU;
  const spT = capU / 16;
  const open = E.inOutCubic(unit(-0.47, -0.36, u));
  const smear = 2.4 * E.inExpo(unit(-0.42, -0.26, u), 4);
  const dil = 0.06 * E.inExpo(unit(-0.38, -0.26, u), 3);
  let ripple = 0;
  for (const uk of [-0.75, -0.625]) { const tau = u - uk; if (tau > 0) ripple += (1 - Math.exp(-tau / 0.012)) * Math.exp(-tau / 0.07); }
  const delta = RSP * 0.28 * ripple - LT * RSP * E.inExpo(unit(-0.5, -0.3, u), 3.5);
  const ringA = u < -0.3 ? 1 : 0;
  const O = fieldOpening(u);            // whip/sag/sheet + family A (single thread) from the opening
  let B;
  if (u < -0.25) {
    // solid letters made of 16 horizontal B lines, masked by the title; thinning into stripes
    B = fam({ ang: 0, mode: 1, sp: spT, invS: 1, v0: spT / 2, W: 16 * spT, hw: mix(0.5, 1.0, open), col: PAPER });
  } else {
    let m = 4; for (const tm of MERGES) m -= snap(u - tm, 0.055, 6);
    B = fam({ ang: 0, mode: 0, W: 16 * spT, m, hw: 0.5, hwW: threadHW(m) * WPX, col: PAPER, gap: O.B.gap });
  }
  const A = fam(Object.assign({}, O.A, { W: 16 * spT, m: 0, hwW: mix(1.5, threadHW(0), E.inOutCubic(unit(-0.25, 0, u))) * WPX, gap: u < -0.25 ? 0 : O.A.gap }));
  return {
    A, B, pulses: O.pulses, sag: O.sag, sheet: O.sheet,
    weave: [0, 0, 0, u < -0.25 ? 2 : 0],
    titP: [u < -0.25 ? 1 : 0, smear, open, dil], titQ: [ringA, RSP, delta, LT - 1], ringW: 1.2, inside: 1,
  };
}

/* ----------------------------------------------------------------- captions */
const CAPTIONS = [
  { t0: -0.25, t1: 2.0, n: '01', w: 'THREAD' },
  { t0: 2.0, t1: 4.0, n: '02', w: 'SIGNAL' },
  { t0: 4.0, t1: 8.0, n: '03', w: 'TERRAIN' },
  { t0: 8.75, t1: 12.0, n: '04', w: 'SYSTEM', ink: true },
];
function drawCaptions(t, col) {
  const x = 72, y = 76, size = 14, lh = 20;
  for (const tt of [t, t - DUR]) for (const C of CAPTIONS) {
    if (tt < C.t0 - 0.01 || tt > C.t1 + 0.4) continue;
    const str = C.n + '  ' + C.w;
    const glyph = (i, n) => {
      const din = spring(tt - C.t0 - i * 0.022, 34), dout = spring(tt - C.t1 - i * 0.018, 34);
      return { dy: (1 - din) * 1.35 - dout * 1.35, a: 1 };
    };
    const cc = C.ink ? INK : col;
    Text.screen('text', str, x, y, size, [cc[0], cc[1], cc[2], 0.92], { track: 0.16, glyph, clip: [-50, -lh * 0.78 / size * size, 4000, lh * 0.3] });
  }
}

/* ----------------------------------------------------------------- bar 4: terraces */
const TERR = {};
function sceneInit() {
  const G = new Float32Array(GX * GY);
  for (let k = 0; k < G.length; k++) G[k] = LEVELS * FIELDS.terr[k] + 0.5;
  FIELDS.G = G;
  const iso = Isobands();
  const m = iso.build(G, LEVELS);
  TERR.mesh = { verts: m.verts.slice(), segs: m.segs.slice(), nv: m.nv, ns: m.ns, nTri: m.nTri };
  TERR.iso = iso;
  buildHypso();
  // title letter field: plateau LT inside the letters, a contour every RSP outward
  const GL = new Float32Array(GX * GY), sd = FIELDS.tit.G;
  for (let k = 0; k < GL.length; k++) GL[k] = clamp(LT - sd[k] / RSP, 0, LT + 0.5);
  FIELDS.GL = GL;
  const ml = iso.build(GL, LT);
  TERR.letters = { verts: ml.verts.slice(), segs: ml.segs.slice(), nv: ml.nv, ns: ml.ns, nTri: ml.nTri };
  TERR.mix = new Float32Array(GX * GY);
}
function climaxMesh(t) {
  const m = morphAt(t);
  if (m >= 1) return [TERR.letters, 'letters'];
  const G = FIELDS.G, GL = FIELDS.GL, M = TERR.mix;
  for (let k = 0; k < M.length; k++) M[k] = G[k] + (GL[k] - G[k]) * m;
  return [TERR.iso.build(M, LEVELS), 'morph' + t];
}
const LIGHT = (() => { const a = [-0.95, 0.3], l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; })();
const WALL_DARK = [0.085, 0.105, 0.56];
function tintOf(n, T) { return Math.pow(n / T.L, T.tint[1]) * T.tint[0]; }
function terrainLift(t) {
  const L = LEVELS;
  const gamma = 1 + 0.32 * E.inOutCubic(unit(6.5, 7.05, t));
  const Htop = 0.5 * (1 + 0.05 * hit(t - 7.0, 0.14) + 0.04 * hit(t - 7.5, 0.14));
  return (n) => {
    if (n <= 0) return 0;
    const nn = Math.min(n, L);
    const up = E.outCubic((t - 6.0 - 0.013 * nn) / 0.42);
    const down = E.inOutCubic((t - 8.0 - 0.011 * (L - nn)) / 0.42);
    return Htop * Math.pow(nn / L, gamma) * up * (1 - down);
  };
}
function terraceState(t) {
  const tint = E.inOutCubic(unit(6.05, 6.7, t)) * (1 - E.inOutCubic(unit(8.0, 8.5, t)));
  return {
    L: LEVELS, lift: terrainLift(t), xf: (() => { const Lo = layoutAt(t); return [Lo.ox, Lo.oz, Lo.ms, 0]; })(),
    capLo: INK, capHi: PAPER, tint: [tint, 2.4, LEVELS, 0.0],
    light: LIGHT, wallLit: [0.93, 0.915, 0.885], wallDark: WALL_DARK,
    strata: [0.5 / LEVELS / 3, 1.0, 0.55],
    lineW: 1.2, lineWIdx: 2.28, every: 5, lineCol: PAPER, lineColIdx: PAPER, lineAlpha: 1,
  };
}
window.__camCheck = (t0, t1, dt) => {
  const out = [];
  for (let t = t0; t <= t1 + 1e-9; t += dt) {
    const c = camAt(t), e = c.eye, q = [e[0], -e[2]];
    let h = 0;
    if (Math.abs(q[0]) < MW && Math.abs(q[1]) < 1) { const T = terraceState(t); h = T.lift(clamp(Math.floor(gridSample(FIELDS.G, q[0], q[1])), 0, LEVELS)); }
    out.push([+t.toFixed(3), +e[1].toFixed(3), +h.toFixed(3), +(e[1] - h).toFixed(3)]);
  }
  return out;
};
// remove there-and-back level excursions shorter than `w` samples (a section running along a contour)
function deblip(lvs, w) {
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < lvs.length - 1; i++) if (lvs[i] !== lvs[i - 1]) {
    let j = i; while (j < lvs.length - 1 && lvs[j] === lvs[i]) j++;
    if (j - i < w && lvs[j] === lvs[i - 1]) for (let k = i; k < j; k++) lvs[k] = lvs[i - 1];
  }
  return lvs;
}
// the thread draped over the terraces: a stepped profile along the section line
function threadProfile(T, y, x0 = -MW - 0.4, x1 = MW + 0.4, n = 900) {
  const pts = [], lvs = [];
  for (let i = 0; i <= n; i++) {
    const x = mix(x0, x1, i / n), inMap = x > -MW && x < MW;
    lvs.push(inMap ? clamp(Math.floor(gridSample(FIELDS.G, x, y)), 0, T.L) : -1);
  }
  // where the thread runs along a contour it would flicker between two levels: hold the previous level through short blips
  deblip(lvs, 60);
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const x = mix(x0, x1, i / n);
    const lv = lvs[i];
    const h = lv >= 0 ? T.lift(lv) : -0.003;
    if (prev !== null && Math.abs(prev - h) > 1e-6) pts.push([x, prev, -y]);
    pts.push([x, h, -y]); prev = h;
  }
  return pts;
}
const SHEET = [-2.6, -1.7, 4.4, 2.3];   // paper sheet extent (x0, z0, x1, z1)

/* ----------------------------------------------------------------- bar 7: the landscape becomes the word */
const morphAt = (t) => E.outCubic(unit(12.0, 12.8, t));
function fieldAt(x, y, t) {
  const a = gridSample(FIELDS.G, x, y), m = morphAt(t);
  return m <= 0 ? a : mix(a, gridSample(FIELDS.GL, x, y), m);
}
function climaxLift(t) {
  const H = 0.07, comp = 1 - E.inOutCubic(unit(13.42, 14.0, t));
  const slam = 0.17 * E.outExpo(unit(12.5, 12.62, t), 6);
  return (n) => {
    if (n <= 0) return 0;
    const ne = Math.min(n, LT + 1);
    const rise = E.outExpo(unit(12.0 + 0.011 * ne, 12.4 + 0.011 * ne, t), 5);
    return (ne * H * rise + (n >= LT ? slam : 0)) * comp;
  };
}
function climaxState(t) {
  return {
    L: LT, lift: climaxLift(t), xf: (() => { const Lo = layoutAt(t); return [Lo.ox, Lo.oz, Lo.ms, 0]; })(),
    capLo: INK, capHi: PAPER, tint: [0.16 * E.inOutCubic(unit(12.0, 12.4, t)) * (1 - E.inOutCubic(unit(13.42, 14.0, t))), 1.0, LT, E.inOutCubic(unit(12.12, 12.5, t))],
    light: LIGHT, wallLit: [0.93, 0.915, 0.885], wallDark: WALL_DARK,
    strata: [0.07 / 4, 1.0, 0.6],
    lineW: 1.2, lineWIdx: mix(2.28, 1.2, E.inOutCubic(unit(12.0, 12.35, t))), every: 5, lineCol: PAPER, lineColIdx: PAPER, lineAlpha: 1,
    skipLevel: LT, skipAmt: E.inOutCubic(unit(12.15, 12.55, t)),
  };
}
const threadY = (t) => (t < 12 ? 0 : 0.5 * climaxLift(t)(LT));
const M_PER_LEVEL = 30;

/* ----------------------------------------------------------------- bars 5-6: interface */
function layoutAt(t) {
  const k = spring(t - 10.5, 16) - spring(t - 12.0, 13);
  const ms = 1 - 0.17 * k;                          // map compresses...
  const ox = -MW * (1 - ms), oz = -(1 - ms);        // ...anchored at its top-left corner
  const mx1 = -MW + 2 * MW * ms, mz1 = -1 + 2 * ms;
  const chartTop = mz1 + UI_GUT, chartBot = UI_BOT; // ...and the section chart takes the room (vertical exaggeration)
  const colX = mx1 + UI_GUT;
  return { ms, ox, oz, mx0: -MW, mx1, mz0: -1, mz1, chartTop, chartBot, chartH: chartBot - chartTop, colX, colX1: UI_RIGHT,
           m2w: (x, z) => [x * ms + ox, z * ms + oz], lz: (n) => chartBot - (n / LEVELS) * (chartBot - chartTop) };
}
// section line position (map-local z) and the scan choreography of bar 6
function sectionZ(t) {
  let z = -SP / 2;
  const jumps = [[10.0, -0.44], [11.0, 0.36], [11.5, -0.52], [11.625, -0.18], [11.75, 0.18], [11.875, 0.5], [12.0, 0.0]];
  let prev = z;
  for (const [tj, zj] of jumps) { z += (zj - prev) * spring(t - tj, tj >= 11.5 ? 46 : 20); prev = zj; }
  return z;
}
function crossings(z, t, n = 700) {
  const y = -z, out = [], gs = [], ls = [];
  for (let i = 0; i <= n; i++) { const x = clamp(-MW + (2 * MW * i) / n, -MW + 1e-4, MW - 1e-4), g = fieldAt(x, y, t); gs.push(g); ls.push(clamp(Math.floor(g), 0, LEVELS)); }
  deblip(ls, 46);
  for (let i = 1; i <= n; i++) {
    if (ls[i] === ls[i - 1]) continue;
    const pl = ls[i - 1], l = ls[i], lev = Math.max(l, pl), gp = gs[i - 1], g = gs[i];
    const x0 = -MW + (2 * MW * (i - 1)) / n, x1 = -MW + (2 * MW * i) / n;
    const f = (lev - gp) / (g - gp || 1);
    out.push({ x: x0 + (x1 - x0) * clamp(f), from: pl, to: l, lev });
  }
  return out;
}
function profilePts(cr) {      // stepped profile in (x, level) pairs
  const pts = [[-MW, 0]];
  for (const c of cr) { pts.push([c.x, c.from]); pts.push([c.x, c.to]); }
  pts.push([MW, 0]);
  return pts;
}
function straightPts(cr) {     // data-point polyline, same vertex count as the stepped one
  const pts = [[-MW, 0]];
  for (const c of cr) { pts.push([c.x, c.lev]); pts.push([c.x, c.lev]); }
  pts.push([MW, 0]);
  return pts;
}
const HYPSO = [];
function buildHypso() {
  const cnt = new Float64Array(LEVELS + 2);
  for (let k = 0; k < FIELDS.G.length; k++) cnt[clamp(Math.floor(FIELDS.G[k]), 0, LEVELS)]++;
  let acc = 0; const cum = new Array(LEVELS + 1);
  for (let n = LEVELS; n >= 0; n--) { acc += cnt[n]; cum[n] = acc; }
  for (let n = 0; n <= LEVELS; n++) HYPSO[n] = cum[n] / cum[1];
}
const C4 = (c, a = 1) => [c[0], c[1], c[2], a];
function digitsRoll(value, nd) {          // odometer wheel positions, most significant first
  const out = [];
  for (let i = nd - 1; i >= 0; i--) {
    const p = value / Math.pow(10, i);
    if (i === 0) { out.push(p); continue; }
    const lower = (value % Math.pow(10, i)) / Math.pow(10, i);
    out.push(Math.floor(p) + E.inOutCubic(unit(0.9, 1.0, lower)));
  }
  return out;
}
function drawInterface(t, cam) {
  if (t < 8.0 || t > 14.3) return;
  const Lo = layoutAt(t), L = LEVELS;
  const zs = sectionZ(t);
  const [, zsw] = Lo.m2w(0, zs);
  const ink = (a) => C4(INK, a), paper = (a) => C4(PAPER, a), orange = (a) => C4(ORANGE, a), cobalt = (a) => C4(COBALT, a);
  const cr = crossings(zs, t);
  const Y = 0.002;
  // climax: the chart hinges up about its bottom edge, the right column about its left edge
  const fold = E.outExpo(unit(12.0, 12.42, t), 6) * PI / 2;
  const cF = Math.cos(fold), sF = Math.sin(fold);
  const CH = (p) => { const w = p[2] - Lo.chartBot; return [p[0], p[1] * cF - w * sF, Lo.chartBot + w * cF + p[1] * sF]; };
  const CHd = [0, -sF, cF];                     // chart "down" vector
  const RC = (p) => { const e = p[0] - Lo.colX; return [Lo.colX + e * cF - p[1] * sF, p[1] * cF + e * sF, p[2]]; };
  const RCr = [cF, sF, 0];                      // column "right" vector
  const quadC = (a, b, c, d, col) => Fills.quad(CH(a), CH(b), CH(c), CH(d), col);
  const yT = threadY(t);
  // -------- the thread on the map (section line); in the climax it rises to run through the letters
  const trim = E.inOutCubic(unit(8.1, 8.7, t));
  const ext = mix(MW + 0.6, MW, trim);
  const xa = Lo.m2w(-ext, zs)[0], xb = Lo.m2w(ext, zs)[0];
  if (t < 12.0) Lines.seg([xa, Y + yT, zsw], [xb, Y + yT, zsw], orange(1), 3.0);
  else {
    // the thread runs through the letters: draw only the spans where it is outside them
    const m = morphAt(t), n = 600; let run = null;
    for (let i = 0; i <= n; i++) {
      const x = mix(-MW, MW, i / n);
      const inside = m > 0.5 && gridSample(FIELDS.tit.G, x, -zs) < 0;
      const p = [Lo.m2w(x, 0)[0], Y + yT, zsw];
      if (!inside) { if (!run) run = p; if (i === n) Lines.seg(run, p, orange(1), 3.0); }
      else if (run) { Lines.seg(run, p, orange(1), 3.0); run = null; }
    }
  }
  if (t > 13.9) return;
  // -------- ghost profile: stands where the terrain was, folds flat, slides into the chart, straightens
  const fl = E.inOutCubic(unit(8.42, 8.78, t));
  const slide = E.inOutExpo(unit(8.72, 9.12, t), 6);
  const straight = E.inOutCubic(unit(9.25, 9.6, t));
  const chartScale = E.inOutCubic(unit(8.4, 8.8, t));
  const st = profilePts(cr), sp = straightPts(cr);
  const h3 = (n) => 0.5 * Math.pow(n / L, 1.32);
  const hc = (n) => (n / L) * Lo.chartH;
  const prof = st.map((p, i) => {
    const lev = mix(p[1], sp[i][1], straight);
    const h = mix(h3(lev), hc(lev), chartScale);
    const [x] = Lo.m2w(p[0], 0);
    const phi = fl * PI / 2;
    const base = mix(zsw, Lo.chartBot, slide);
    const q = [x, h * Math.cos(phi) + Y * 2, base - h * Math.sin(phi)];
    return slide >= 1 ? CH(q) : q;
  });
  // black section fill (the cut face of the block) sweeps in left to right
  const reveal = E.inOutCubic(unit(9.25, 9.7, t));
  if (reveal > 0) {
    const xr = mix(-MW, MW, reveal);
    for (let i = 0; i + 1 < st.length; i++) {
      const la = st[i][0], lb = st[i + 1][0];
      if (la > xr) break;
      const lva = mix(st[i][1], sp[i][1], straight), lvb = mix(st[i + 1][1], sp[i + 1][1], straight);
      const f = lb > xr ? (xr - la) / (lb - la || 1) : 1;
      const ax = Lo.m2w(la, 0)[0], bx = Lo.m2w(mix(la, lb, f), 0)[0];
      const az = Lo.lz(lva), bz = Lo.lz(mix(lva, lvb, f));
      quadC([ax, Y, az], [bx, Y, bz], [bx, Y, Lo.chartBot], [ax, Y, Lo.chartBot], ink(1));
    }
  }
  // chart gridlines = contour levels; index levels labelled in metres
  const grid = E.outCubic(unit(8.9, 9.35, t));
  if (grid > 0) {
    const x0 = Lo.m2w(-MW, 0)[0], x1 = Lo.m2w(MW, 0)[0];
    for (let n = 0; n <= L; n++) {
      const z = Lo.lz(n), idx = n % 5 === 0;
      const g = clamp(grid * 1.6 - n / L * 0.6);
      Lines.seg(CH([x0, Y, z]), CH([mix(x0, x1, g), Y, z]), ink(idx ? 0.42 : 0.14), idx ? 1.0 : 0.8);
      if (idx && g > 0.05) {
        const sz = 11 / UI_S;
        Text.world('text', String(n * M_PER_LEVEL), CH([x0 - 8 / UI_S, 0.003, z + sz * 0.36]), [1, 0, 0], CHd, sz, ink(0.75 * g), { align: 'right', track: 0.04 });
      }
    }
  }
  // projection lines: contour x thread intersections drop to their level -> data points
  const drop0 = 8.95;
  cr.forEach((c) => {
    const [x] = Lo.m2w(c.x, 0);
    const z1 = Lo.lz(c.lev);
    const tk = drop0 + Math.floor((c.x + MW) / (2 * MW) * 8) * 0.0625;
    const d = snap(t - tk, 0.16, 6);
    if (d <= 0) return;
    const zEnd = mix(zsw, z1, d);
    const zMapEdge = Lo.m2w(0, 1)[1];
    if (fold <= 0) {
      Lines.seg([x, Y, zsw], [x, Y, Math.min(zEnd, zMapEdge)], paper(0.55), 1.0);       // over the black map
      if (zEnd > zMapEdge) Lines.seg([x, Y, zMapEdge], [x, Y, zEnd], ink(0.5), 1.0);   // over the paper
    } else {
      Lines.seg([x, Y + yT, zsw], CH([x, Y, z1]), ink(0.5 * cF + 0.25), 1.0);           // strings to the standing wall
    }
    if (d > 0.98) { const s = 2.6 / UI_S; quadC([x - s, Y * 1.5, z1 - s], [x + s, Y * 1.5, z1 - s], [x + s, Y * 1.5, z1 + s], [x - s, Y * 1.5, z1 + s], c.lev % 5 === 0 ? orange(1) : ink(1)); }
  });
  Lines.poly(prof, orange(1), mix(3.0, 2.4, straight));
  // -------- probe: races along the thread on every beat (ping-pong), cursor into the chart
  const pr = E.outCubic(unit(9.45, 9.75, t)) * (1 - E.inOutCubic(unit(11.9, 12.1, t)));
  let xp = -MW;
  // the probe sweeps the island between its coastline crossings on the current section
  const xl = cr.length ? cr[0].x + 0.03 : -1.2, xr = cr.length ? cr[cr.length - 1].x - 0.03 : 1.2;
  if (t > 9.5) { const ph = (t - 9.5) / 0.5, k = Math.floor(ph), f = E.inOutCubic(ph - k); const a = k % 2 === 0 ? f : 1 - f; xp = mix(xl, xr, a); }
  else xp = xl;
  const xpe = xp;
  const gp = fieldAt(xpe, -zs, t), lvp = clamp(Math.floor(gp), 0, L);
  const elev = Math.max(0, (gp - 0.5)) * M_PER_LEVEL;
  if (pr > 0) {
    const [x] = Lo.m2w(xpe, 0);
    const zc = Lo.lz(Math.max(0, gp - 0.5));
    const s = 5 / UI_S;
    Lines.seg([x, Y, zsw], [x, Y, zc], cobalt(pr), 1.5);
    Fills.rectXZ(x - s, zsw - s, x + s, zsw + s, Y * 2, cobalt(pr));
    Fills.rectXZ(x - s, zc - s, x + s, zc + s, Y * 2, cobalt(pr));
  }
  // -------- right column: elevation numerals, probe coordinates, hypsometry
  const col = E.outCubic(unit(9.05, 9.35, t));
  if (col > 0) {
    const cx = Lo.colX, capU = 0.47, size = capU / Text.capHeight('display');
    const top = -1 + 18 / UI_S;
    const TW = (fk, str, x, z, sz, c, o) => Text.world(fk, str, RC([x, 0.003, z]), RCr, [0, 0, 1], sz, c, o);
    TW('text', 'ELEVATION', cx, top + 11 / UI_S, 12 / UI_S, ink(col), { track: 0.14 });
    TW('text', 'M', UI_RIGHT, top + 11 / UI_S, 12 / UI_S, ink(col), { track: 0.14, align: 'right' });
    Lines.seg(RC([cx, Y, top + 22 / UI_S]), RC([mix(cx, UI_RIGHT, col), Y, top + 22 / UI_S]), ink(1), 1.0);
    const val = mix(0, elev, E.outCubic(unit(9.2, 9.7, t)));
    const wheels = digitsRoll(val, 3);
    const cell = Text.width('display', '0', size) * 1.02;
    const base = top + 40 / UI_S + capU;
    const roll = 1.3 * capU / size;               // wheel pitch in em
    const capEm = capU / size;
    wheels.forEach((w, i) => {
      const x = cx + i * cell;
      const d0 = Math.floor(w), f = w - d0;
      for (const [dg, off] of [[d0, -f], [d0 + 1, 1 - f]]) {
        const ch = String(((dg % 10) + 10) % 10);
        const gw = Text.width('display', ch, size);
        // entry from below on first appearance
        const enter = 1 - E.outExpo(unit(9.05 + i * 0.04, 9.27 + i * 0.04, t), 5);
        TW('display', ch, x + (cell - gw) / 2, base, size, ink(1), {
          glyph: () => ({ dy: (off + enter) * roll }), clip: [-1, -capU * 1.06, 99, capU * 0.1] });
      }
    });
    const small = 12 / UI_S;
    const fmt = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
    const yl = base + 34 / UI_S;
    TW('text', 'PROBE', cx, yl, small, ink(col * 0.6), { track: 0.14 });
    TW('text', 'X ' + fmt(xpe / MW), cx + 84 / UI_S, yl, small, ink(col), { track: 0.1 });
    TW('text', 'Y ' + fmt(zs), cx + 190 / UI_S, yl, small, ink(col), { track: 0.1 });
    TW('text', 'L ' + String(lvp).padStart(2, '0'), cx + 296 / UI_S, yl, small, orange(col), { track: 0.1 });
  }
  // the section's name, set large: rolls A>B>C on the jumps and races through D..H during the scan
  if (col > 0) {
    const secW = (t >= 10 ? spring(t - 10.0, 26) : 0) + (t >= 11 ? spring(t - 11.0, 26) : 0) + [11.5, 11.625, 11.75, 11.875].reduce((a, tk) => a + spring(t - tk, 40), 0);
    const capL = 0.3, sizeL = capL / Text.capHeight('display'), pitch = 1.3 * capL / sizeL;
    const xL = UI_RIGHT - Text.width('display', 'W', sizeL), zL = -1 + 40 / UI_S + 0.47 + 34 / UI_S + 26 / UI_S + capL;
    const k0 = Math.floor(secW), f = secW - k0;
    for (const [k, off] of [[k0, -f], [k0 + 1, 1 - f]]) {
      const ch = 'ABCDEFGH'[Math.min(7, k)];
      const gw = Text.width('display', ch, sizeL);
      Text.world('display', ch, RC([UI_RIGHT - gw, 0.003, zL]), RCr, [0, 0, 1], sizeL, orange(1), {
        glyph: () => ({ dy: (off + (1 - E.outExpo(unit(9.15, 9.4, t), 5))) * pitch }), clip: [-1, -capL * 1.06, 99, capL * 0.1] });
    }
    Text.world('text', 'SECTION', RC([xL - 0.02, 0.003, zL - capL + 11 / UI_S]), RCr, [0, 0, 1], 12 / UI_S, ink(col), { track: 0.14, align: 'right' });
  }
  // hypsometric bars continue the chart's level lines into the right column
  const hy = t - 9.5;
  if (hy > 0) {
    const cx = Lo.colX, wcol = UI_RIGHT - cx;
    for (let n = 1; n <= L; n++) {
      const g = snap(hy - (L - n) * 0.009, 0.22, 6);
      if (g <= 0) continue;
      const z = Lo.lz(n), th = Math.min(0.42 * (Lo.chartH / L), 5 / UI_S);
      const len = HYPSO[n] * wcol * g;
      const c = n === lvp && pr > 0.5 ? orange(1) : ink(n % 5 === 0 ? 1 : 0.8);
      Fills.quad(RC([cx, Y, z - th]), RC([cx + len, Y, z - th]), RC([cx + len, Y, z + th]), RC([cx, Y, z + th]), c);
    }
    Text.world('text', 'HYPSOMETRY', RC([cx, 0.003, Lo.chartTop - 10 / UI_S]), RCr, [0, 0, 1], 12 / UI_S, ink(clamp(hy * 4)), { track: 0.14 });
  }
  // module labels (they roll out as the climax takes the sheet)
  const lab = E.outCubic(unit(9.0, 9.3, t));
  if (lab > 0) {
    const sz = 12 / UI_S;
    const secName = 'ABCDEFGH'[Math.min(7, (t >= 10 ? 1 : 0) + (t >= 11 ? 1 : 0) + (t >= 11.5 ? Math.floor((t - 11.5) / 0.125) + 1 : 0))];
    const out = (i) => ({ dy: -1.4 * spring(t - 12.0 - i * 0.012, 30) });
    const clipL = [-99, -sz * 1.0, 99, sz * 0.3];
    Text.world('text', 'SECTION ' + secName + '—' + secName + '′', CH([Lo.m2w(-MW, 0)[0], 0.003, Lo.chartTop - 10 / UI_S]), [1, 0, 0], CHd, sz, ink(lab), { track: 0.14 });
    Text.world('text', 'PLAN', [Lo.m2w(-MW, 0)[0] + 14 / UI_S, 0.003, Lo.m2w(0, -1)[1] + 26 / UI_S], [1, 0, 0], [0, 0, 1], sz, paper(lab), { track: 0.14, glyph: out, clip: clipL });
    const [ax] = Lo.m2w(-MW, 0), [bx] = Lo.m2w(MW, 0);
    Text.world('text', secName, [ax + 14 / UI_S, 0.003, zsw - 8 / UI_S], [1, 0, 0], [0, 0, 1], sz, paper(lab), { glyph: out, clip: clipL });
    Text.world('text', secName + '′', [bx - 14 / UI_S, 0.003, zsw - 8 / UI_S], [1, 0, 0], [0, 0, 1], sz, paper(lab), { align: 'right', glyph: out, clip: clipL });
  }
}

/* ----------------------------------------------------------------- frame */
function renderFrame(t) {
  const cam = camAt(t);
  gl.viewport(0, 0, W, H);
  gl.clearColor(INK[0], INK[1], INK[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  const useField = t < 6.0 || t >= 14.25;
  if (useField) {
    FieldPlane.draw(cam, fieldState(t), TEX);
  } else {
    const Lo = layoutAt(t);
    const p0 = Lo.m2w(-MW, -1), p1 = Lo.m2w(MW, 1);
    Fills.rectXZ(SHEET[0], SHEET[1], SHEET[2], SHEET[3], -0.004, C4(PAPER));
    Fills.rectXZ(p0[0], p0[1], p1[0], p1[1], -0.0015, C4(INK));
    Fills.flush(cam);
    const climax = t >= 12.0;
    const T = climax ? climaxState(t) : terraceState(t);
    if (climax) { const [mesh, key] = climaxMesh(t); Terraces.upload(mesh, key); }
    else Terraces.upload(TERR.mesh, 'terrain');
    Terraces.draw(cam, T);
    Lines.begin();
    if (t < 8.0) Lines.poly(threadProfile(T, SP / 2), C4(ORANGE), 3.0);
    drawInterface(t, cam);
    Fills.flush(cam);
    Lines.flush(cam, true, 0.0012);
  }
  drawCaptions(t, PAPER);
  Text.flush(cam);
}
