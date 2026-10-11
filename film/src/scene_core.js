/* =====================================================================
   SCENE (75 s) — core: camera, Movement I, title/loop, captions, dispatcher.
   Every value is a closed-form function of absolute time t (beat n = n * 0.5 s).
   ===================================================================== */
const TEX = {};
const FIELDS = {};
const famDefaults = () => ({ c: [0, 0], ang: 0, W: 0, m: 0, mode: 0, sp: 1, invS: 1, v0: 0, hw: 0.5, hwW: 0, col: ORANGE, alpha: 1, gap: 0, boost: 1, every: 5 });
const fam = (o) => Object.assign(famDefaults(), o);
const C4 = (c, a = 1) => [c[0], c[1], c[2], a];

/* movement boundaries (s) */
const MV = { I: 0, II: 16, III: 32, IV: 48, V: 62, END: 75 };

/* interface layout (plan view) — 12-col grid on 1920x1080, 72px margins, 24px gutters */
const UI_S = 1176 / (2 * MW);
const UI_CX = -MW + (960 - 72) / UI_S, UI_CZ = -1 + (540 - 120) / UI_S;
const UI_DIST = (540 / UI_S) / Math.tan(15 * DEG);
const UI_GUT = 24 / UI_S;
const UI_BOT = UI_CZ + (1008 - 540) / UI_S;
const UI_RIGHT = UI_CX + (1848 - 960) / UI_S;
const PD = PLAN_DIST;

/* ----------------------------------------------------------------- camera
   One periodic curve over 75 s: [tx, ty, tz, dist, yaw°, pitch°, fov°]. Yaw drifts -360° per cycle:
   the camera circles the landscape once per loop and never unwinds. */
const Y0 = -360;
const CAM_KEYS = [
  // I · thread -> signal
  [0.0, [0.3, 0, 0.0, 1.45, -78, 11, 44]],
  [1.0, [0.45, 0, 0.0, 1.75, -74, 13, 42]],
  [2.0, [0.4, 0, 0.0, 2.1, -68, 17, 40]],
  [3.0, [0.3, 0, 0.0, 2.45, -60, 24, 38]],
  [4.0, [0.2, 0, 0.0, 2.8, -48, 32, 36]],
  [5.0, [0.1, 0, 0.0, 3.05, -34, 42, 34]],
  [6.0, [0.05, 0, 0.0, 3.3, -20, 56, 32]],
  [7.0, [0.0, 0, 0.0, 3.55, -7, 74, 30]],
  [8.0, [0, 0, 0, PD, 0, 90, 30], { hold: true }],
  [10.0, [0, 0, 0, PD * 0.965, 0, 90, 30]],
  [12.0, [0, 0, 0, PD * 0.95, 0, 90, 30], { hold: true }],
  [13.0, [0.15, 0.05, 0.12, 3.0, -16, 50, 32]],
  [14.0, [0, 0, 0, PD * 0.95, 0, 90, 30], { hold: true }],
  // II · terrain
  [16.0, [0, 0, 0, PD * 0.945, 0, 90, 30]],
  [20.0, [0, 0, 0, PD * 0.9, 0, 90, 30], { hold: true }],
  [20.75, [-0.2, 0.05, 0.05, 2.7, -26, 52, 32]],
  [22.0, [-0.45, 0.22, 0.02, 1.7, -64, 24, 40]],
  [23.0, [0.35, 0.30, 0.0, 1.5, -86, 17, 42]],
  [24.5, [0.95, 0.30, 0.02, 1.5, -100, 21, 40]],
  [26.0, [0.55, 0.32, -0.15, 1.75, -138, 26, 40]],
  [27.0, [0.05, 0.30, -0.2, 2.0, -182, 29, 38]],
  [28.0, [-0.2, 0.22, 0.0, 2.6, -228, 33, 36]],
  [29.0, [0.1, 0.05, 0.2, 4.4, -282, 40, 34]],
  [30.0, [0.3, 0.0, 0.25, 4.9, -322, 52, 33]],
  [31.0, [UI_CX, 0, UI_CZ, UI_DIST, Y0, 90, 30], { hold: true }],
  // III · system (3D)
  [34.0, [UI_CX, 0, UI_CZ, UI_DIST, Y0, 90, 30], { hold: true }],
  [35.2, [1.0, 0.3, 0.3, 6.9, Y0 + 26, 40, 32]],
  [37.0, [1.05, 0.3, 0.25, 6.4, Y0 + 38, 34, 32]],
  // fly-through: down onto the drum counter, then skimming west along the thread on the map
  [38.2, [2.45, 0.5, -0.5, 1.6, Y0 + 30, 27, 40]],
  [39.1, [0.2, 0.64, 0.36, 1.15, Y0 + 75, 13, 46]],
  [40.0, [-1.4, 0.64, 0.36, 1.25, Y0 + 95, 18, 44]],
  [41.0, [0.7, 0.3, 0.45, 6.2, Y0 + 40, 32, 34]],
  [42.5, [0.85, 0.25, 0.35, 6.5, Y0 + 30, 42, 32]],
  [44.0, [0.6, 0.2, 0.2, 6.2, Y0 + 26, 54, 32]],
  [46.0, [0.25, 0.1, 0.1, 6.0, Y0 + 20, 58, 32]],
  // IV · network
  [48.0, [0.2, 0.15, 0.1, 6.0, Y0 + 26, 46, 32]],
  [50.0, [0.5, 0.25, 0.2, 4.6, Y0 + 50, 30, 36]],
  // street level: down the avenue the subdivision opened under the thread, east -> west
  [51.3, [2.6, 0.16, 0.0, 1.0, Y0 + 90, 6, 46]],
  [52.6, [0.9, 0.15, 0.0, 1.0, Y0 + 90, 4, 48]],
  [53.8, [-0.8, 0.15, 0.0, 1.0, Y0 + 90, 5, 48]],
  [54.5, [-1.8, 0.3, 0.0, 1.6, Y0 + 90, 40, 44]],      // crane straight up out of the avenue
  [55.4, [-1.3, 0.3, -0.1, 3.7, Y0 + 145, 42, 36]],
  [56.3, [0.0, 0.15, 0.0, 4.6, Y0 + 205, 50, 34]],
  [57.6, [0.1, 0.1, 0.0, 5.6, Y0 + 255, 60, 32]],
  [59.0, [0, 0, 0, PD * 1.05, Y0 + 336, 86, 30]],
  [60.5, [0, 0, 0, PD, Y0 + 360, 90, 30], { hold: true }],
  [61.95, [0, 0, 0, PD * 0.99, Y0 + 360, 90, 30], { hold: true }],
  // V · monument + identity
  [62.0, [0, 0, 0, PD * 0.99, Y0 + 360, 90, 30], { m: [-0.6, 0.2, 0.3, -2.2, -26, -70, 8] }],
  [62.7, [0.05, 0.32, 0.5, 2.55, Y0 + 334, 29, 38]],
  [63.8, [0.5, 0.36, 0.1, 2.35, Y0 + 376, 23, 40]],
  [65.2, [0.3, 0.32, 0.0, 2.65, Y0 + 402, 27, 38]],
  [66.6, [-0.5, 0.3, 0.0, 2.55, Y0 + 386, 21, 40]],
  [68.0, [-0.3, 0.25, 0.0, 2.9, Y0 + 350, 34, 36]],
  [69.2, [0.0, 0.08, 0.0, 3.3, Y0 + 356, 70, 32]],
  [70.0, [0, 0, 0, PD, Y0 + 360, 90, 30], { hold: true }],
  [74.5, [0, 0, 0, PD * 0.955, Y0 + 360, 90, 30], { hold: true }],
];
const camTrack = Track(CAM_KEYS, DUR, [0, 0, 0, 0, Y0, 0, 0]);
function camAt(t) {
  const v = window.__camOverride ? window.__camOverride : camTrack(t);
  return camera({ tx: v[0], ty: v[1], tz: v[2], dist: v[3], yaw: v[4] * DEG, pitch: Math.min(90, v[5]) * DEG, fov: v[6] * DEG });
}

/* ----------------------------------------------------------------- I · the thread (u may be negative at the loop end) */
const SPLITS = [2.0, 2.125, 2.25, 2.375, 6.0, 6.125, 6.25, 6.375];
const mOpen = (u) => { let m = 0; for (const s of SPLITS) m += snap(u - s, 0.11, 6); return m; };
const bandW = (u) => 0.42 + 0.68 * E.outExpo(unit(2.0, 2.6, u), 5) + 2.9 * E.inOutCubic(unit(6.0, 6.45, u));
const threadHW = (m) => Math.max(0.65, 3.8 * Math.pow(2, -0.32 * m));
// a whip on every kick of bar 1: outward, from the left, from the right, inward (they meet at the split)
const WHIPS = [[0.0, [0, 0], [1, -1], 0.15], [0.5, [-3.2], [1], 0.11], [1.0, [3.2], [-1], 0.11], [1.5, [-3.0, 3.0], [1, -1], 0.09]];
function whipPulses(u) {
  const out = [];
  for (const [t0, s0, dir, A] of WHIPS) {
    const tau = u - t0; if (tau < 0 || tau > 1.2) continue;
    const env = (1 - Math.exp(-tau / 0.022)) * Math.exp(-tau / 0.36), envY = (1 - Math.exp(-tau / 0.03)) * Math.exp(-tau / 0.3);
    const c = 4.4, sig = 0.22 + 0.55 * tau;
    for (let k = 0; k < s0.length; k++) out.push([s0[k] + dir[k] * c * tau, A * env, (A / 1.5) * envY, sig]);
  }
  return out.slice(0, 6);
}
function sagAt(u) {
  if (u >= 0 || u < -0.3) return [0, 4];
  const k = 1 - E.inExpo(unit(-0.3, 0, u), 4);
  return [0.075 * k * sstep(-0.3, -0.22, u), 2.6];
}
// fabric billows: phasor sum of one wavelength, so several waves fold into the shader's single sheet term
function sheetWave(u) {
  let re = 0, im = 0;
  for (const [tk, amp] of [[2.5, 0.04], [3.0, 0.05], [3.5, 0.06], [4.5, 0.08], [5.0, 0.09], [5.5, 0.07], [6.5, 0.04], [7.0, 0.02]]) {
    const tau = u - tk; if (tau < 0) continue;
    const e = (1 - Math.exp(-tau / 0.05)) * Math.exp(-tau / 0.45) * amp, ph = TAU * tau / 0.6;
    re += e * Math.cos(ph); im += e * Math.sin(ph);
  }
  const fade = 1 - sstep(7.0, 7.8, u);
  return [Math.hypot(re, im) * fade, 1.5, Math.atan2(im, re), 0.18];
}
function fieldOpening(u) {
  const m = mOpen(u), Wd = bandW(u), hw = threadHW(m);
  const spacePx = (Wd / Math.pow(2, Math.floor(m) + 1)) / WPX;
  const gap = clamp(0.12 * spacePx, 0, 2.6);
  const A = fam({ ang: 0, W: Wd, m, mode: 0, hw: 0.5, hwW: hw * WPX, col: ORANGE, gap });
  const B = fam({ ang: 90 * DEG * E.outExpo(unit(4.0, 4.42, u), 6), W: Wd, m, mode: 0, hw: 0.5, hwW: hw * WPX, col: PAPER, gap });
  let front = -4;
  for (let i = 0; i < 6; i++) front += 1.45 * snap(u - (4.25 + i * 0.1), 0.08, 6);
  return { A, B, pulses: whipPulses(u), sag: sagAt(u), sheet: sheetWave(u), weave: [Math.SQRT1_2, Math.SQRT1_2, front, u >= 4.0 ? 1 : 0] };
}

/* ----------------------------------------------------------------- I/II · interference -> SIGNAL -> relief -> contours */
const SP = 4 / 256;
function fieldSignal(t) {
  let K = 0; for (let k = 0; k < 12; k++) K += snap(t - (8.0 + k * 0.125), 0.09, 6);
  const angB = 90 * DEG * Math.pow(2, -K) * (1 - sstep(9.4, 9.7, t));
  const gap = 0.84 * (1 - E.outExpo(unit(8.0, 8.3, t), 4));
  const SA = Math.exp(9.5 * Math.pow(unit(16.0, 17.6, t), 1.6));
  const SB = t >= 18.0 ? Infinity : Math.exp(9.5 * Math.pow(unit(16.6, 18.0, t), 1.5));
  const hwA = mix(0.65, 1.5, E.inOutCubic(unit(17.0, 17.6, t)));
  const A = fam({ ang: 0, mode: 1, sp: SP, invS: 1 / SA, v0: SP / 2, hw: hwA, col: ORANGE, gap });
  const B = fam({ ang: angB, mode: 1, sp: SP, invS: 1 / SB, v0: SP / 2, hw: mix(0.65, 0.6, unit(17.0, 18.0, t)), col: PAPER, gap, boost: 1.9, every: 5 });
  const amount = t >= 10.5 ? 1 : 0;
  const wipeY = mix(1.15, -1.15, E.outExpo(unit(10.5, 10.62, t), 4));
  const stretch = 1 + 1.45 * E.inExpo(unit(11.0, 11.22, t), 5) - 1.45 * E.outExpo(unit(11.5, 11.7, t), 6);
  const split = 0.42 * (E.outExpo(unit(11.25, 11.36, t), 6) - spring(t - 11.5, 30) * (t >= 11.5 ? 1 : 0));
  // bar 7: the phase becomes height — SIGNAL rises into relief, letter by letter (left to right), then sinks
  const relH = 0.16 * (E.outCubic(unit(12.0, 12.15, t)) - E.inOutCubic(unit(13.45, 14.0, t)));
  const relief = relH > 1e-4 ? [relH, mix(-1.7, 1.75, E.inOutCubic(unit(12.0, 12.75, t))), 0.35, 0] : [0, 0, 1, 0];
  const melt = E.inOutCubic(unit(14.0, 14.8, t));
  const blur = 0.16 * melt, phase = 0.5 + 2.6 * melt, duty = 0.42 * (1 - melt);
  const morph = E.inOutCubic(unit(14.6, 15.4, t));
  const Kt = LEVELS * E.inOutCubic(unit(14.5, 15.4, t));
  const sw = E.inOutCubic(unit(19.0, 19.6, t));
  const front = t < 19.0 ? 4 : mix(3, -3, sw);
  return {
    A, B, pulses: [], sag: [0, 4], sheet: [0, 1, 0, 0], relief,
    weave: [-1, 0, front, t < 19.95 ? 1 : 0], inside: t >= 18.0 ? 1 : 0,
    K: Kt, kOff: 0.5 * E.inOutCubic(unit(16.0, 17.6, t)) + 10 * E.inOutCubic(unit(18.0, 20.0, t)),
    sigP: [amount, stretch, split, blur], sigQ: [phase, duty, morph, wipeY], sweep: mix(-2.2, 2.2, sw),
  };
}
function fogAt(t) {
  const u = t > 37.5 ? t - DUR : t;
  if (u < -0.45 || u > 8) return [30, 31];
  const k = u < 0 ? sstep(-0.45, -0.05, u) : 1 - sstep(4.5, 7.0, u);
  return [mix(30, 4.2, k), mix(31, 7.2, k)];
}

/* ----------------------------------------------------------------- V · title -> thread (u = t - 75) */
const LT = 12, RSP = 0.026;
const MERGES = [-0.25, -0.1875, -0.125, -0.0625];
function fieldEnd(t) {
  const u = t - DUR;
  const capU = FIELDS.tit.ascU, spT = capU / 16;
  const open = E.inOutCubic(unit(-0.47, -0.36, u));
  const smear = 2.4 * E.inExpo(unit(-0.42, -0.26, u), 4);
  const dil = 0.06 * E.inExpo(unit(-0.38, -0.26, u), 3);
  // the rings breathe outward on every beat of the title hold
  let ripple = 0;
  // (from beat 141 = 70.5 s: the monument hands over at 70.25 with the rings at rest)
  for (let b = 1; b < 9; b++) { const uk = -5.0 + b * 0.5, tau = u - uk; if (tau > 0) ripple += (1 - Math.exp(-tau / 0.012)) * Math.exp(-tau / 0.09) * (b === 1 ? 1.4 : 0.8); }
  const delta = RSP * 0.3 * ripple - LT * RSP * E.inExpo(unit(-0.5, -0.3, u), 3.5);
  const O = fieldOpening(u);
  let B;
  if (u < -0.25) B = fam({ ang: 0, mode: 1, sp: spT, invS: 1, v0: spT / 2, W: 16 * spT, hw: mix(0.5, 1.0, open), col: PAPER });
  else { let m = 4; for (const tm of MERGES) m -= snap(u - tm, 0.055, 6); B = fam({ ang: 0, mode: 0, W: 16 * spT, m, hw: 0.5, hwW: threadHW(m) * WPX, col: PAPER, gap: O.B.gap }); }
  const A = fam(Object.assign({}, O.A, { W: 16 * spT, m: 0, hwW: mix(1.5, threadHW(0), E.inOutCubic(unit(-0.25, 0, u))) * WPX, gap: u < -0.25 ? 0 : O.A.gap }));
  return { A, B, pulses: O.pulses, sag: O.sag, sheet: O.sheet, weave: [0, 0, 0, u < -0.25 ? 2 : 0],
    titP: [u < -0.25 ? 1 : 0, smear, open, dil], titQ: [u < -0.3 ? 1 : 0, RSP, delta, LT - 1], ringW: 1.2, inside: 1 };
}
function fieldState(t) {
  let S;
  if (t < 8.0) S = fieldOpening(t);
  else if (t < 20.0 + 1e-9) S = fieldSignal(t);
  else S = fieldEnd(t);
  return Object.assign({ bg: INK, K: 0, sigP: [0, 1, 0, 0], sigQ: [0.5, 0, 0, 2], sweep: -9, titP: [0, 0, 1, 0], titQ: [0, 0.03, 0, 0], ringW: 1.2, ringCol: PAPER, fog: fogAt(t) }, S);
}

/* ----------------------------------------------------------------- captions */
const CAPTIONS = [
  { t0: -0.25, t1: 8.0, n: '01', w: 'THREAD' },
  { t0: 8.0, t1: 16.0, n: '02', w: 'SIGNAL' },
  { t0: 16.0, t1: 30.0, n: '03', w: 'TERRAIN' },
  { t0: 32.75, t1: 46.0, n: '04', w: 'SYSTEM', ink: true },
  { t0: 48.0, t1: 60.0, n: '05', w: 'NETWORK', ink: true },
];
function drawCaptions(t) {
  const x = 72, y = 76, size = 14, lh = 20;
  for (const tt of [t, t - DUR]) for (const C of CAPTIONS) {
    if (tt < C.t0 - 0.01 || tt > C.t1 + 0.4) continue;
    const glyph = (i) => { const din = spring(tt - C.t0 - i * 0.022, 34), dout = spring(tt - C.t1 - i * 0.018, 34); return { dy: (1 - din) * 1.35 - dout * 1.35 }; };
    const cc = C.ink ? INK : PAPER;
    Text.screen('text', C.n + '  ' + C.w, x, y, size, C4(cc, 0.92), { track: 0.16, glyph, clip: [-50, -lh * 0.78, 4000, lh * 0.3] });
  }
  // title subtitle (bar 36-37)
  if (t > 70.3 && t < 73.6) {
    const str = 'THREAD · SIGNAL · TERRAIN · SYSTEM · NETWORK';
    const glyph = (i, n) => { const din = spring(t - 70.5 - i * 0.012, 30), dout = spring(t - 73.0 - (n - i) * 0.008, 30); return { dy: (1 - din) * 1.4 - dout * 1.4 }; };
    Text.screen('text', str, 960, 912, 15, C4(PAPER, 0.9), { track: 0.3, align: 'center', glyph, clip: [-2000, -21, 2000, 6] });
  }
}

/* ----------------------------------------------------------------- frame dispatcher */
function renderFrame(t) {
  const cam = camAt(t);
  gl.viewport(0, 0, W, H);
  gl.clearColor(INK[0], INK[1], INK[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  if (t < 20.0 || t >= 70.25) FieldPlane.draw(cam, fieldState(t), TEX);
  else if (t < 31.0) renderTerrain(t, cam);
  else if (t < 62.0) renderSystem(t, cam);
  else renderMonument(t, cam);
  drawCaptions(t);
  Text.flush(cam);
}
