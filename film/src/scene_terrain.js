/* =====================================================================
   SCENE (75 s) — terrain: Movement II (extrusion, flight, tectonic shift)
   and Movement V (the landscape becomes the word).
   ===================================================================== */
const TERR = {};
const LIGHT = (() => { const a = [-0.95, 0.3], l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; })();
const WALL_DARK = [0.085, 0.105, 0.56];
const SHEET = [-24, -24, 24, 24];         // the paper is the ground: no visible edge from any camera
const M_PER_LEVEL = 30;

const tectAt = (t) => E.inOutCubic(unit(26.0, 27.6, t));        // landform A -> B
const morphAt = (t) => E.outCubic(unit(62.0, 62.8, t));         // landform B -> letter field
function fieldAt(x, y, t) {
  let g = mix(gridSample(FIELDS.G, x, y), gridSample(FIELDS.G2, x, y), tectAt(t));
  const m = morphAt(t);
  return m <= 0 ? g : mix(g, gridSample(FIELDS.GL, x, y), m);
}

function sceneInit() {
  const toLevels = (h) => { const G = new Float32Array(GX * GY); for (let k = 0; k < G.length; k++) G[k] = LEVELS * h[k] + 0.5; return G; };
  FIELDS.G = toLevels(FIELDS.terr); FIELDS.G2 = toLevels(FIELDS.terr2);
  const iso = Isobands(); TERR.iso = iso;
  const keep = (m) => ({ verts: m.verts.slice(), segs: m.segs.slice(), nv: m.nv, ns: m.ns, nTri: m.nTri });
  TERR.mesh1 = keep(iso.build(FIELDS.G, LEVELS));
  TERR.mesh2 = keep(iso.build(FIELDS.G2, LEVELS));
  const GL = new Float32Array(GX * GY), sd = FIELDS.tit.G;
  for (let k = 0; k < GL.length; k++) GL[k] = clamp(LT - sd[k] / RSP, 0, LT + 0.5);
  FIELDS.GL = GL;
  TERR.letters = keep(iso.build(GL, LT));
  TERR.mix = new Float32Array(GX * GY);
  buildHypso();
  if (typeof systemInit === 'function') systemInit();
}
function mixedMesh(A, B, s, L, key) {
  const M = TERR.mix;
  for (let k = 0; k < M.length; k++) M[k] = A[k] + (B[k] - A[k]) * s;
  return [TERR.iso.build(M, L), key];
}

/* ----------------------------------------------------------------- II · terraces */
function terrainLift(t) {
  const L = LEVELS;
  const gamma = 1 + 0.32 * E.inOutCubic(unit(22.0, 23.0, t));
  let pulse = 0; for (let b = 48; b < 60; b++) pulse += hit(t - b * 0.5, 0.14) * (b % 2 ? 0.025 : 0.045);
  const Htop = 0.5 * (1 + pulse);
  return (n) => {
    if (n <= 0) return 0;
    const nn = Math.min(n, L);
    const up = E.outCubic((t - 20.0 - 0.013 * nn) / 0.42);
    const down = E.inOutCubic((t - 30.0 - 0.011 * (L - nn)) / 0.42);
    return Htop * Math.pow(nn / L, gamma) * up * (1 - down);
  };
}
function terraceState(t) {
  const tint = E.inOutCubic(unit(20.05, 20.7, t)) * (1 - E.inOutCubic(unit(30.0, 30.5, t)));
  return {
    L: LEVELS, lift: terrainLift(t), xf: [0, 0, 1, 0],
    capLo: INK, capHi: PAPER, tint: [tint, 2.4, LEVELS, 0.0],
    light: LIGHT, wallLit: [0.93, 0.915, 0.885], wallDark: WALL_DARK,
    strata: [0.5 / LEVELS / 3, 1.0, 0.55],
    lineW: 1.2, lineWIdx: 2.28, every: 5, lineCol: PAPER, lineColIdx: PAPER, lineAlpha: 1,
  };
}
function deblip(lvs, w) {
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < lvs.length - 1; i++) if (lvs[i] !== lvs[i - 1]) {
    let j = i; while (j < lvs.length - 1 && lvs[j] === lvs[i]) j++;
    if (j - i < w && lvs[j] === lvs[i - 1]) for (let k = i; k < j; k++) lvs[k] = lvs[i - 1];
  }
  return lvs;
}
// the thread draped over the terraces: a stepped profile along the section line
function threadProfile(T, y, t, x0 = -MW - 0.4, x1 = MW + 0.4, n = 900) {
  const pts = [], lvs = [];
  for (let i = 0; i <= n; i++) { const x = mix(x0, x1, i / n), inMap = x > -MW && x < MW; lvs.push(inMap ? clamp(Math.floor(fieldAt(x, y, t)), 0, T.L) : -1); }
  deblip(lvs, 60);
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const x = mix(x0, x1, i / n), h = lvs[i] >= 0 ? T.lift(lvs[i]) : -0.003;
    if (prev !== null && Math.abs(prev - h) > 1e-6) pts.push([x, prev, -y]);
    pts.push([x, h, -y]); prev = h;
  }
  return pts;
}
function terrainMesh(t) {
  const s = tectAt(t);
  if (s <= 0) return [TERR.mesh1, 'm1'];
  if (s >= 1) return [TERR.mesh2, 'm2'];
  return mixedMesh(FIELDS.G, FIELDS.G2, s, LEVELS, 'tect' + t);
}
function renderTerrain(t, cam) {
  Fills.rectXZ(SHEET[0], SHEET[1], SHEET[2], SHEET[3], -0.004, C4(PAPER));
  Fills.rectXZ(-MW, -1, MW, 1, -0.0015, C4(INK));
  Fills.flush(cam);
  const T = terraceState(t);
  const [mesh, key] = terrainMesh(t);
  Terraces.upload(mesh, key);
  Terraces.draw(cam, T);
  Lines.begin();
  if (t < 30.0) Lines.poly(threadProfile(T, SP / 2, t), C4(ORANGE), 3.0);
  else drawSheet(t, cam, T);
  Fills.flush(cam);
  Solids.flush(cam);
  Glyph3D.flush(cam);
  Lines.flush(cam, true, 0.0012);
}

/* ----------------------------------------------------------------- V · the monument */
function climaxLift(t) {
  const H = 0.07, comp = 1 - E.inOutCubic(unit(68.6, 70.0, t));
  const slam = 0.17 * E.outExpo(unit(62.5, 62.62, t), 6);
  let pulse = 0; for (let b = 126; b < 136; b++) pulse += hit(t - b * 0.5, 0.12) * 0.02;
  return (n) => {
    if (n <= 0) return 0;
    const ne = Math.min(n, LT + 1);
    const rise = E.outExpo(unit(62.0 + 0.011 * ne, 62.4 + 0.011 * ne, t), 5);
    return (ne * H * (1 + pulse) * rise + (n >= LT ? slam : 0)) * comp;
  };
}
function climaxState(t) {
  return {
    L: LT, lift: climaxLift(t), xf: [0, 0, 1, 0],
    capLo: INK, capHi: PAPER,
    tint: [0.16 * E.inOutCubic(unit(62.0, 62.4, t)) * (1 - E.inOutCubic(unit(68.6, 70.0, t))), 1.0, LT, E.inOutCubic(unit(62.12, 62.5, t))],
    light: LIGHT, wallLit: [0.93, 0.915, 0.885], wallDark: WALL_DARK,
    strata: [0.07 / 4, 1.0, 0.6],
    lineW: 1.2, lineWIdx: mix(2.28, 1.2, E.inOutCubic(unit(62.0, 62.35, t))), every: 5, lineCol: PAPER, lineColIdx: PAPER, lineAlpha: 1,
    skipLevel: LT, skipAmt: E.inOutCubic(unit(62.15, 62.55, t)),
  };
}
const threadY = (t) => 0.5 * climaxLift(t)(LT);
function climaxMesh(t) {
  const m = morphAt(t);
  if (m >= 1) return [TERR.letters, 'letters'];
  if (m <= 0) return [TERR.mesh2, 'm2'];
  return mixedMesh(FIELDS.G2, FIELDS.GL, m, LEVELS, 'morph' + t);
}
function renderMonument(t, cam) {
  Fills.rectXZ(SHEET[0], SHEET[1], SHEET[2], SHEET[3], -0.004, C4(PAPER));
  Fills.rectXZ(-MW, -1, MW, 1, -0.0015, C4(INK));
  Fills.flush(cam);
  const T = climaxState(t);
  const [mesh, key] = climaxMesh(t);
  Terraces.upload(mesh, key);
  Terraces.draw(cam, T);
  Lines.begin();
  // the thread runs through the letters: draw only the spans outside them
  const yT = 0.002 + threadY(t), m = morphAt(t), n = 600;
  let run = null;
  for (let i = 0; i <= n; i++) {
    const x = mix(-MW, MW, i / n);
    const inside = m > 0.5 && gridSample(FIELDS.tit.G, x, 0) < 0;
    const p = [x, yT, 0];
    if (!inside) { if (!run) run = p; if (i === n) Lines.seg(run, p, C4(ORANGE), 3.0); }
    else if (run) { Lines.seg(run, p, C4(ORANGE), 3.0); run = null; }
  }
  Lines.flush(cam, true, 0.0012);
}
