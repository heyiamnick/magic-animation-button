/* =====================================================================
   SCENE (75 s) — Movement III (the interface as physical slabs, exploded in 3D)
   and Movement IV (the map subdivides into a network of module towers).
   ===================================================================== */
const CT = 1 + UI_GUT, CB = UI_BOT;                       // chart z-range (flat layout)
const COLX = MW + UI_GUT;                                  // right column x
const lz = (n) => CB - (n / LEVELS) * (CB - CT);
const HYPSO = [];
function buildHypso() {
  const cnt = new Float64Array(LEVELS + 2);
  for (let k = 0; k < FIELDS.G2.length; k++) cnt[clamp(Math.floor(FIELDS.G2[k]), 0, LEVELS)]++;
  let acc = 0; const cum = new Array(LEVELS + 1);
  for (let n = LEVELS; n >= 0; n--) { acc += cnt[n]; cum[n] = acc; }
  for (let n = 0; n <= LEVELS; n++) HYPSO[n] = cum[n] / cum[1];
}

/* ----------------------------------------------------------------- section line choreography (map-local z) */
function sectionZ(t) {
  let z = -SP / 2, prev = z;
  const jumps = [[36.0, -0.44], [37.0, 0.36], [42.0, -0.52], [42.125, -0.18], [42.25, 0.18], [42.375, 0.5], [43.0, 0.0],
                 [60.5, -0.55], [60.625, -0.2], [60.75, 0.25], [60.875, 0.55], [61.5, 0.0]];
  for (const [tj, zj] of jumps) { z += (zj - prev) * spring(t - tj, (tj % 1 === 0 || tj === 61.5) ? 20 : 46); prev = zj; }
  return z;
}
const secLetter = (t) => (t >= 36 ? 1 : 0) + (t >= 37 ? 1 : 0) + [42.0, 42.125, 42.25, 42.375].reduce((a, k) => a + (t >= k ? 1 : 0), 0) + (t >= 43 ? 1 : 0);
const secWheel = (t) => spring(t - 36, 26) + spring(t - 37, 26) + [42.0, 42.125, 42.25, 42.375].reduce((a, k) => a + spring(t - k, 40), 0) + spring(t - 43, 26);

function crossings(z, t, n = 700) {
  const y = -z, out = [], gs = [], ls = [];
  for (let i = 0; i <= n; i++) { const x = clamp(-MW + (2 * MW * i) / n, -MW + 1e-4, MW - 1e-4), g = fieldAt(x, y, t); gs.push(g); ls.push(clamp(Math.floor(g), 0, LEVELS)); }
  deblip(ls, 46);
  for (let i = 1; i <= n; i++) {
    if (ls[i] === ls[i - 1]) continue;
    const pl = ls[i - 1], l = ls[i], lev = Math.max(l, pl), gp = gs[i - 1], g = gs[i];
    const x0 = -MW + (2 * MW * (i - 1)) / n, x1 = -MW + (2 * MW * i) / n;
    out.push({ x: x0 + (x1 - x0) * clamp((lev - gp) / (g - gp || 1)), from: pl, to: l, lev });
  }
  return out;
}
const profilePts = (cr) => { const p = [[-MW, 0]]; for (const c of cr) { p.push([c.x, c.from]); p.push([c.x, c.to]); } p.push([MW, 0]); return p; };
const straightPts = (cr) => { const p = [[-MW, 0]]; for (const c of cr) { p.push([c.x, c.lev]); p.push([c.x, c.lev]); } p.push([MW, 0]); return p; };
function digitsRoll(value, nd) {
  const out = [];
  for (let i = nd - 1; i >= 0; i--) {
    const p = value / Math.pow(10, i);
    const lower = i === 0 ? value % 1 : (value % Math.pow(10, i)) / Math.pow(10, i);
    out.push(Math.floor(p) + E.inOutCubic(unit(i === 0 ? 0.75 : 0.9, 1.0, lower)));
  }
  return out;
}

/* ----------------------------------------------------------------- slab state (III) */
function slabs(t) {
  const em = E.inOutCubic(unit(34.0, 34.8, t)), er = E.inOutCubic(unit(34.1, 34.9, t)), ec = E.inOutCubic(unit(34.2, 35.0, t));
  const dock = E.inOutCubic(unit(44.35, 45.0, t));
  const fold = (a, b) => E.inOutCubic(unit(a, b, t)) - E.inOutCubic(unit(44.0, 44.4, t));
  return {
    yM: mix(0.62 * em, 0.25, E.inOutCubic(unit(44.5, 45.2, t))), thM: mix(0.05, 0.25, E.inOutCubic(unit(44.3, 44.9, t))),
    yR: 0.34 * er, yC: 0.14 * ec, E: em,
    hC: fold(40.0, 40.7) * PI / 2, hR: 0,
    dock, fin: 0.075 * ec * (1 - dock),
    rise: E.inOutCubic(unit(34.1, 34.8, t)) * (1 - E.inOutCubic(unit(43.9, 44.35, t))),   // drums out of / back into the column
  };
}
// point mappers: flat layout -> world
function hinge(p, yb, zb, a) {           // rotate about the line (y = yb, z = zb), local y measured from the slab top
  const w = p[2] - zb, c = Math.cos(a), s = Math.sin(a);
  return [p[0], yb + p[1] * c - w * s, zb + w * c + p[1] * s];
}
function chartXf(S) {
  return (p) => {
    let q = hinge(p, S.yC, CB, S.hC);
    if (S.dock > 0) q = [q[0], mix(q[1], q[1] - S.yC + S.yM - 0.16, S.dock), mix(q[2], q[2] - (CT + CB) / 2 + 0.2, S.dock)];
    return q;
  };
}
function colXf(S) {
  return (p) => {
    let q = hinge(p, S.yR, CB, S.hR);
    if (S.dock > 0) { const k = mix(1, 0.62, S.dock); q = [mix(q[0], 0.3 + (q[0] - COLX) * k, S.dock), mix(q[1], q[1] - S.yR + S.yM - 0.2, S.dock), mix(q[2], q[2] * k - 0.05, S.dock)]; }
    return q;
  };
}
const dirXf = (f) => (o, v) => sub3(f(add3(o, v)), f(o));       // linear part of an affine mapper (o is irrelevant)
function frameAt(f, p) {                                         // 4x4 basis of the affine mapper f, origin at local point p
  const o = f(p), d = dirXf(f), ex = d(p, [1, 0, 0]), ey = d(p, [0, 1, 0]), ez = d(p, [0, 0, 1]);
  return new Float32Array([ex[0], ex[1], ex[2], 0, ey[0], ey[1], ey[2], 0, ez[0], ez[1], ez[2], 0, o[0], o[1], o[2], 1]);
}
const WALL_PAPER = [0.93, 0.915, 0.885, 1];

/* ----------------------------------------------------------------- the sheet: chart, wires, probe, column (30–45 s) */
function drawSheet(t, cam, Tterr) {
  const S = slabs(t), L = LEVELS;
  const ink = (a) => C4(INK, a), paper = (a) => C4(PAPER, a), orange = (a) => C4(ORANGE, a), cobalt = (a) => C4(COBALT, a);
  const MX = (p) => [p[0], p[1] + S.yM, p[2]];
  const CX = chartXf(S), RX = colXf(S);
  const Y = 0.002;
  const zs = sectionZ(t), cr = crossings(zs, t);
  const chartVis = 1 - unit(44.7, 45.0, t);
  // ---- the thread on the map (section line)
  const trim = E.inOutCubic(unit(30.1, 30.7, t));
  const ext = mix(MW + 0.6, MW, trim);
  Lines.seg(MX([-ext, Y, zs]), MX([ext, Y, zs]), orange(1), 3.0);
  // ---- ghost profile: stands where the terrain was, folds flat, slides into the chart, straightens; then extrudes as a fin
  const fl = E.inOutCubic(unit(30.42, 30.78, t)), slide = E.inOutExpo(unit(30.72, 31.12, t), 6);
  const straight = E.inOutCubic(unit(31.25, 31.6, t)), chartScale = E.inOutCubic(unit(30.4, 30.8, t));
  const st = profilePts(cr), sp = straightPts(cr);
  const h3 = (n) => 0.5 * Math.pow(n / L, 1.32), hcz = (n) => (n / L) * (CB - CT);
  const levAt = (i) => mix(st[i][1], sp[i][1], straight);
  if (chartVis > 0) {
    const prof = st.map((p, i) => {
      const lev = levAt(i), h = mix(h3(lev), hcz(lev), chartScale), phi = fl * PI / 2, base = mix(zs, CB, slide);
      const q = [p[0], h * Math.cos(phi) + Y * 2 + (slide >= 1 ? S.fin : 0), base - h * Math.sin(phi)];
      return slide >= 1 ? CX(q) : q;
    });
    // black section silhouette = the cut face of the block; extrudes into a solid fin when the system explodes
    const reveal = E.inOutCubic(unit(31.25, 31.7, t));
    if (reveal > 0) {
      const xr = mix(-MW, MW, reveal), fin = S.fin;
      for (let i = 0; i + 1 < st.length; i++) {
        const la = st[i][0], lb = st[i + 1][0]; if (la > xr) break;
        const f = lb > xr ? (xr - la) / (lb - la || 1) : 1;
        const ax = la, bx = mix(la, lb, f), az = lz(levAt(i)), bz = lz(mix(levAt(i), levAt(i + 1), f));
        const top = (x, z) => CX([x, Y + fin, z]), bot = (x, z) => CX([x, Y, z]);
        Fills.quad(top(ax, az), top(bx, bz), top(bx, CB), top(ax, CB), ink(1));
        if (fin > 1e-3) {          // fin walls: profile side and baseline side, sculpted
          const n0 = norm3(cross3(sub3(top(bx, bz), top(ax, az)), sub3(bot(ax, az), top(ax, az))));
          Solids.quad(bot(ax, az), bot(bx, bz), top(bx, bz), top(ax, az), scl3(n0, -1), [0.16, 0.16, 0.18, 1], 1);
        }
      }
      if (S.fin > 1e-3) Solids.quad(CX([-MW, Y, CB]), CX([MW, Y, CB]), CX([MW, Y + S.fin, CB]), CX([-MW, Y + S.fin, CB]), norm3(sub3(CX([0, 0, CB + 1]), CX([0, 0, CB]))), [0.16, 0.16, 0.18, 1], 1);
    }
    // chart gridlines = contour levels, labelled in metres
    const grid = E.outCubic(unit(30.9, 31.35, t));
    if (grid > 0) for (let n = 0; n <= L; n++) {
      const z = lz(n), idx = n % 5 === 0, g = clamp(grid * 1.6 - n / L * 0.6);
      Lines.seg(CX([-MW, Y, z]), CX([mix(-MW, MW, g), Y, z]), ink((idx ? 0.42 : 0.14) * chartVis), idx ? 1.0 : 0.8);
      if (idx && g > 0.05) { const sz = 11 / UI_S, o = CX([-MW - 8 / UI_S, 0.003, z + sz * 0.36]); Text.world('text', String(n * M_PER_LEVEL), o, dirXf(CX)(o, [1, 0, 0]), dirXf(CX)(o, [0, 0, 1]), sz, ink(0.75 * g * chartVis), { align: 'right', track: 0.04 }); }
    }
    // projection lines: contour x thread crossings -> data points. When the slabs separate they become 3D wires.
    cr.forEach((c) => {
      const z1 = lz(c.lev), tk = 30.95 + Math.floor((c.x + MW) / (2 * MW) * 8) * 0.0625, d = snap(t - tk, 0.16, 6);
      if (d <= 0) return;
      const a = MX([c.x, Y, zs]), b = CX([c.x, Y + S.fin, z1]);
      if (S.E <= 0 && S.yC <= 0) {
        const zEnd = mix(zs, z1, d);
        Lines.seg([c.x, Y, zs], [c.x, Y, Math.min(zEnd, 1)], paper(0.55), 1.0);
        if (zEnd > 1) Lines.seg([c.x, Y, 1], [c.x, Y, zEnd], ink(0.5), 1.0);
      } else Lines.seg(a, mix3(a, b, d), C4(mix3(PAPER, INK, 0.25 + 0.5 * S.E), 0.6 * chartVis), 1.0);
      if (d > 0.98) { const s = 2.8 / UI_S, idx = c.lev % 5 === 0; Solids.box(c.x - s, Y + S.fin, z1 - s, c.x + s, Y + S.fin + 2 * s * (0.3 + S.E), z1 + s, idx ? ORANGE : INK, idx ? [0.86, 0.27, 0.1] : [0.2, 0.2, 0.22], CX, null, idx ? 2 : 1); }
    });
    Lines.poly(prof, orange(chartVis), mix(3.0, 2.4, straight));
    // chart labels
    const lab = E.outCubic(unit(31.0, 31.3, t));
    if (lab > 0) { const sz = 12 / UI_S, sn = 'ABCDEFGH'[Math.min(7, secLetter(t))], o = CX([-MW, 0.003, CT - 10 / UI_S]);
      Text.world('text', 'SECTION ' + sn + '—' + sn + '′', o, dirXf(CX)(o, [1, 0, 0]), dirXf(CX)(o, [0, 0, 1]), sz, ink(lab * chartVis), { track: 0.14 }); }
  }
  // ---- probe: races along the thread between coastline crossings; cobalt wire into the chart
  const xl = cr.length ? cr[0].x + 0.03 : -1.2, xr2 = cr.length ? cr[cr.length - 1].x - 0.03 : 1.2;
  let xp = xl;
  if (t > 31.5) { const ph = (t - 31.5) / 0.5, k = Math.floor(ph), f = E.inOutCubic(ph - k); xp = mix(xl, xr2, k % 2 === 0 ? f : 1 - f); }
  const gp = fieldAt(xp, -zs, t), lvp = clamp(Math.floor(gp), 0, L), elev = Math.max(0, gp - 0.5) * M_PER_LEVEL;
  const pr = E.outCubic(unit(31.45, 31.75, t)) * (1 - unit(44.0, 44.3, t));
  if (pr > 0) {
    const s = 5 / UI_S * pr, a = MX([xp, Y, zs]), b = CX([xp, Y + S.fin, lz(Math.max(0, gp - 0.5))]);
    Lines.seg(a, b, cobalt(pr), 1.5);
    Solids.box(xp - s, S.yM + Y, zs - s, xp + s, S.yM + Y + 2 * s * (0.4 + S.E), zs + s, COBALT, COBALT);
    Solids.box(-s, 0, -s, s, 2 * s * (0.4 + S.E), s, COBALT, COBALT, (p) => add3(b, p));
  }
  // ---- right column: elevation drums, probe readout, section-letter drum, hypsometry columns
  const col = E.outCubic(unit(31.05, 31.35, t)) * (1 - unit(44.7, 45.0, t));
  if (col > 0) {
    const RO = (x, z) => RX([x, 0.003, z]), Rr = (o) => dirXf(RX)(o, [1, 0, 0]), Rd = (o) => dirXf(RX)(o, [0, 0, 1]);
    const TW = (fk, str, x, z, sz, c, o) => { const p = RO(x, z); Text.world(fk, str, p, Rr(p), Rd(p), sz, c, o); };
    const top = -1 + 18 / UI_S, capU = 0.47, size = capU / Text.capHeight('display');
    TW('text', 'ELEVATION', COLX, top + 11 / UI_S, 12 / UI_S, ink(col), { track: 0.14 });
    TW('text', 'M', UI_RIGHT, top + 11 / UI_S, 12 / UI_S, ink(col), { track: 0.14, align: 'right' });
    Lines.seg(RX([COLX, Y, top + 22 / UI_S]), RX([mix(COLX, UI_RIGHT, col), Y, top + 22 / UI_S]), ink(1), 1.0);
    const val = mix(0, elev, E.outCubic(unit(31.2, 31.7, t)));
    const wheels = digitsRoll(val, 3), cell = Text.width('display', '0', size) * 1.02, base = top + 40 / UI_S + capU;
    if (S.rise <= 0) {       // flat: printed odometer
      wheels.forEach((w, i) => {
        const x = COLX + i * cell, d0 = Math.floor(w), f = w - d0;
        for (const [dg, off] of [[d0, -f], [d0 + 1, 1 - f]]) {
          const ch = String(((dg % 10) + 10) % 10), gw = Text.width('display', ch, size);
          const enter = 1 - E.outExpo(unit(31.05 + i * 0.04, 31.27 + i * 0.04, t), 5);
          TW('display', ch, x + (cell - gw) / 2, base, size, ink(1), { glyph: () => ({ dy: (off + enter) * 1.3 * capU / size }), clip: [-1, -capU * 1.06, 99, capU * 0.1] });
        }
      });
    } else {                 // exploded: extruded digits on prism drums rising out of the slab (the slab hides the rest)
      const R = 0.5 * capU * 0.94, zc = base - capU / 2, ay = R * (2 * S.rise - 1);
      Solids.cylinderX(COLX - 0.02, COLX + 3 * cell + 0.02, ay, zc, R * 0.98, WALL_PAPER, 28, RX);
      wheels.forEach((w, i) => drum('display', '0123456789', w, { base: frameAt(RX, [COLX + i * cell, ay, zc]), size, cell, radius: R,
        depth: Math.max(0.002, size * 0.1 * S.rise), cap: INK, lit: [0.35, 0.35, 0.38], dark: [0.05, 0.06, 0.25], spread: (capU * 1.25 / R) / (TAU / 10) }));
    }
    const small = 12 / UI_S, fmt = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2), yl = base + 34 / UI_S;
    TW('text', 'PROBE', COLX, yl, small, ink(col * 0.6), { track: 0.14 });
    TW('text', 'X ' + fmt(xp / MW), COLX + 84 / UI_S, yl, small, ink(col), { track: 0.1 });
    TW('text', 'Y ' + fmt(zs), COLX + 190 / UI_S, yl, small, ink(col), { track: 0.1 });
    TW('text', 'L ' + String(lvp).padStart(2, '0'), COLX + 296 / UI_S, yl, small, orange(col), { track: 0.1 });
    // section letter
    const capL = 0.3, sizeL = capL / Text.capHeight('display'), zL = yl + 26 / UI_S + capL, sw = secWheel(t);
    TW('text', 'SECTION', UI_RIGHT - Text.width('display', 'W', sizeL) - 0.02, zL - capL + 11 / UI_S, 12 / UI_S, ink(col), { track: 0.14, align: 'right' });
    if (S.rise <= 0) {
      const k0 = Math.floor(sw), f = sw - k0;
      for (const [k, off] of [[k0, -f], [k0 + 1, 1 - f]]) {
        const ch = 'ABCDEFGH'[Math.min(7, k)], gw = Text.width('display', ch, sizeL);
        TW('display', ch, UI_RIGHT - gw, zL, sizeL, orange(1), { glyph: () => ({ dy: (off + (1 - E.outExpo(unit(31.15, 31.4, t), 5))) * 1.3 * capL / sizeL }), clip: [-1, -capL * 1.06, 99, capL * 0.1] });
      }
    } else {
      const cellL = Text.width('display', 'W', sizeL), R = 0.5 * capL * 0.94, zc = zL - capL / 2, ay = R * (2 * S.rise - 1);
      Solids.cylinderX(UI_RIGHT - cellL - 0.01, UI_RIGHT + 0.01, ay, zc, R * 0.98, WALL_PAPER, 24, RX);
      drum('display', 'ABCDEFGH', sw, { base: frameAt(RX, [UI_RIGHT - cellL, ay, zc]), size: sizeL, cell: cellL, radius: R,
        depth: Math.max(0.002, sizeL * 0.1 * S.rise), cap: ORANGE, lit: [0.95, 0.45, 0.3], dark: [0.35, 0.08, 0.05], spread: (capL * 1.25 / R) / (TAU / 8) });
    }
    // hypsometry: the chart's level lines continue as bars, which become 3D columns (area -> volume)
    const hy = t - 31.5;
    if (hy > 0) {
      const wcol = UI_RIGHT - COLX;
      for (let n = 1; n <= L; n++) {
        const g = snap(hy - (L - n) * 0.009, 0.22, 6); if (g <= 0) continue;
        const z = lz(n), th = Math.min(0.42 * ((CB - CT) / L), 5 / UI_S), len = HYPSO[n] * wcol * g;
        const hh = 0.002 + 0.12 * S.E * HYPSO[n] * (1 + 0.15 * Math.sin(TAU * (t * 2 - n / 7.5)) * unit(36.5, 37.5, t));
        const hl = n === lvp && pr > 0.5;
        Solids.box(COLX, 0.001, z - th, COLX + len, 0.001 + hh, z + th, hl ? ORANGE : INK, hl ? [0.86, 0.27, 0.1] : [0.22, 0.22, 0.25], RX, null, hl ? 2 : 1);
      }
      const o = RO(COLX, CT - 10 / UI_S);
      Text.world('text', 'HYPSOMETRY', o, Rr(o), Rd(o), 12 / UI_S, ink(clamp(hy * 4) * col), { track: 0.14 });
    }
  }
  // ---- map labels
  const lab = E.outCubic(unit(31.0, 31.3, t)) * (1 - unit(44.0, 44.25, t));
  if (lab > 0) {
    const sz = 12 / UI_S, sn = 'ABCDEFGH'[Math.min(7, secLetter(t))];
    Text.world('text', 'PLAN', MX([-MW + 14 / UI_S, 0.003, -1 + 26 / UI_S]), [1, 0, 0], [0, 0, 1], sz, paper(lab), { track: 0.14 });
    Text.world('text', sn, MX([-MW + 14 / UI_S, 0.003, zs - 8 / UI_S]), [1, 0, 0], [0, 0, 1], sz, paper(lab), {});
    Text.world('text', sn + '′', MX([MW - 14 / UI_S, 0.003, zs - 8 / UI_S]), [1, 0, 0], [0, 0, 1], sz, paper(lab), { align: 'right' });
  }
  return S;
}

/* ----------------------------------------------------------------- tiles / towers (44.4–62 s) */
const TILES = [];
const TCOLS = 8, TROWS = 4, TW_ = (2 * MW) / TCOLS, TH_ = 2 / TROWS, STREET = 0.12, AVENUE = 0.6;
function systemInit() {
  let mx = 0;
  for (let r = 0; r < TROWS; r++) for (let c = 0; c < TCOLS; c++) {
    const x0 = -MW + c * TW_, z0 = -1 + r * TH_;
    let s = 0, n = 0;
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) { s += gridSample(FIELDS.terr2, x0 + (i + 0.5) / 12 * TW_, -(z0 + (j + 0.5) / 12 * TH_)); n++; }
    const e = s / n; mx = Math.max(mx, e);
    TILES.push({ c, r, x0, z0, e, id: 'ABCDEFGH'[c] + (r + 1) });
  }
  for (const T of TILES) T.e /= mx;
}
// binary subdivision order: x, z, x, z, x  (1 -> 2 -> 4 -> 8 -> 16 -> 32)
const SPLIT_T = [45.0, 45.125, 45.25, 45.375, 45.5];
const MERGE_T = [59.3, 59.425, 59.55, 59.675, 59.8];
function tileOffset(T, t) {
  const bits = [[0, (T.c >> 2) & 1], [1, (T.r >> 1) & 1], [0, (T.c >> 1) & 1], [1, T.r & 1], [0, T.c & 1]];
  let ox = 0, oz = 0;
  bits.forEach(([axis, b], k) => {
    const open = snap(t - SPLIT_T[k], 0.1, 6) * (1 - snap(t - MERGE_T[4 - k], 0.1, 6));
    const d = (b ? 1 : -1) * 0.018 * open;
    if (axis === 0) ox += d; else oz += d;
  });
  const spread = E.inOutCubic(unit(46.0, 47.6, t)) * (1 - E.inOutCubic(unit(58.6, 59.3, t)));
  ox = mix(ox, (T.c - (TCOLS - 1) / 2) * STREET, spread);
  oz = mix(oz, (T.r - (TROWS - 1) / 2) * STREET + (T.r >= TROWS / 2 ? 0.5 : -0.5) * (AVENUE - STREET), spread);
  return [ox, oz];
}
function tileHeight(T, t) {
  const cx = T.x0 + TW_ / 2, cz = T.z0 + TH_ / 2, d = Math.hypot(cx, cz * 1.4);
  const rise = E.outExpo(unit(48.0 + d * 0.12, 48.55 + d * 0.12, t), 5) * (1 - E.inOutCubic(unit(58.0, 58.6, t)));
  let wave = 0;
  if (t > 54 && t < 56.2) for (let b = 0; b < 4; b++) { const tb = 54 + b * 0.5 + (cx + MW) * 0.06; wave += hit(t - tb, 0.16) * (t >= tb ? 1 : 0) * 0.07; }
  const top0 = mix(0.25, 0.0, E.inOutCubic(unit(60.0, 60.8, t)));   // block sinks flush into the paper before the monument
  return top0 + rise * (0.12 + 0.85 * T.e) + wave;
}
function tileFlip(T, t) {
  if (t < 54 || t > 56.3) return 0;
  const cx = T.x0 + TW_ / 2, ph = (t - 54) * 2 - (cx + MW) / (2 * MW) * 0.9;
  const k = ph - Math.floor(ph);
  return (Math.floor(ph) % 2 === 0 && k < 0.5 && Math.floor(ph) >= 0 && Math.floor(ph) < 4) ? sstep(0, 0.12, k) * (1 - sstep(0.38, 0.5, k)) : 0;
}

/* thread network: the original thread is the main line (z = 0 street); a branch reaches every tower */
function routeFor(T, t) {
  const [ox, oz] = tileOffset(T, t);
  const x0 = T.x0 + ox, z0 = T.z0 + oz, zc = z0 + TH_ / 2;
  const xs = x0 - STREET / 2;                     // street on the tower's west side
  const zMain = 0;
  return [[xs, zMain], [xs, zc], [x0, zc]];
}
function polyLen(P) { let s = 0; for (let i = 1; i < P.length; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return s; }
function polyAt(P, d) {
  for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (d <= l) { const f = l ? d / l : 0; return [mix(P[i - 1][0], P[i][0], f), mix(P[i - 1][1], P[i][1], f)]; } d -= l; }
  return P[P.length - 1];
}
function polyPart(P, d0, d1) {
  const out = [polyAt(P, d0)]; let acc = 0;
  for (let i = 1; i < P.length; i++) { acc += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (acc > d0 && acc < d1) out.push(P[i]); }
  out.push(polyAt(P, d1)); return out;
}

function drawSlabs(S, t) {
  if (t >= 45.05) return;
  if (S.yC > 1e-4 || S.hC > 0) { const f = chartXf(S); Solids.box(-MW, -0.035, CT - 0.05, MW, 0, CB + 0.02, PAPER, WALL_PAPER, f); if (S.hC < 0.05 && S.dock < 0.05) dropShadow(-MW, CT - 0.05, MW, CB, S.yC - 0.035, 0.18); }
  if (S.yR > 1e-4 || S.hR > 0) { const f = colXf(S); Solids.box(COLX - 0.04, -0.035, -1.05, UI_RIGHT + 0.04, 0, CB + 0.02, PAPER, WALL_PAPER, f); if (S.hR < 0.05 && S.dock < 0.05) dropShadow(COLX, -1, UI_RIGHT, CB, S.yR - 0.035, 0.18); }
}
function renderSystem(t, cam) {
  Fills.rectXZ(SHEET[0], SHEET[1], SHEET[2], SHEET[3], -0.004, C4(PAPER));
  Lines.begin();
  const tilesOn = t >= 45.0;
  let mapTop = null;
  const S = t < 45.0 ? drawSheet(t, cam) : slabs(t);
  drawSlabs(S, t);
  if (!tilesOn) {
    // map slab (black, with the contour map printed on top)
    const y = S.yM, th = S.thM;
    if (y > 1e-4) { Solids.box(-MW, y - th, -1, MW, y, 1, INK, WALL_PAPER); dropShadow(-MW, -1, MW, 1, y - th); }
    else Fills.rectXZ(-MW, -1, MW, 1, -0.0015, C4(INK));
    mapTop = y + MAP_LIFT;          // printed by the terrace mesh itself: identical lines to Movement II and to the monument
  } else {
    // ---- the map as 32 tiles: one block -> binary subdivision -> streets -> towers -> reassembly
    const floating = t < 45.2 ? S.yM - S.thM : 0, merged = t >= 59.9;
    if (merged) mapTop = tileHeight(TILES[0], t) + MAP_LIFT;
    if (floating > 1e-4) dropShadow(-MW, -1, MW, 1, floating);
    for (const T of TILES) {
      const [ox, oz] = tileOffset(T, t);
      const x0 = T.x0 + ox, z0 = T.z0 + oz, x1 = x0 + TW_, z1 = z0 + TH_;
      const top = t < 45.2 ? S.yM : tileHeight(T, t);
      const bot = floating;
      if (top > 1e-4) Solids.box(x0, Math.min(bot, top - 1e-4), z0, x1, top, z1, INK, WALL_PAPER);
      const ym = top + MAP_LIFT;
      if (!merged) MapSurf.quad([[x0, ym, z0], [x1, ym, z0], [x1, ym, z1], [x0, ym, z1]], [[T.x0, -T.z0], [T.x0 + TW_, -T.z0], [T.x0 + TW_, -(T.z0 + TH_)], [T.x0, -(T.z0 + TH_)]], 1, tileFlip(T, t));
      // kinetic labels on the south face of each tower
      const lab = E.outCubic(unit(52.0 + T.c * 0.03, 52.3 + T.c * 0.03, t)) * (1 - unit(57.6, 58.0, t));
      if (lab > 0 && top > 0.3) {
        const north = T.r < TROWS / 2, zf = north ? z1 + 0.0015 : z0 - 0.0015, right = north ? [1, 0, 0] : [-1, 0, 0], xs = north ? x0 + 0.025 : x1 - 0.025;
        const sz = 0.034, roll = (i) => ({ dy: (1 - spring(t - 52.0 - T.c * 0.03 - i * 0.02, 30)) * 1.4 });
        Text.world('text', T.id, [xs, 0.115, zf], right, [0, -1, 0], sz, C4(INK, lab), { track: 0.12, glyph: roll, clip: [-1, -sz * 1.05, 9, sz * 0.25] });
        Text.world('text', String(Math.round(T.e * 870)).padStart(3, '0') + ' M', [xs, 0.07, zf], right, [0, -1, 0], sz * 0.8, C4(INK, lab * 0.7), { track: 0.1, glyph: roll, clip: [-1, -sz * 0.85, 9, sz * 0.2] });
      }
    }
    // the main line (the thread) drops into the street the subdivision opened under it
    const zs = sectionZ(t), blockTop = mix(0.25, 0.0, E.inOutCubic(unit(60.0, 60.8, t)));
    const down = E.inOutCubic(unit(45.125, 45.4, t)), up = E.inOutCubic(unit(58.55, 59.05, t));
    const yline = mix(mix(S.yM + 0.002, 0.003, down), blockTop + 0.002, up);
    const ext = MW + 3.5 * STREET * E.inOutCubic(unit(46.0, 47.6, t)) * (1 - E.inOutCubic(unit(58.6, 59.3, t)));
    Lines.seg([-ext, yline, zs], [ext, yline, zs], C4(ORANGE), 3.0);
    // branches + data pulses (draw on 50.0–50.6, retract 56.8–57.6)
    for (const T of TILES) {
      const P = routeFor(T, t), Ln = polyLen(P);
      const on = E.inOutCubic(unit(50.0 + T.c * 0.04 + T.r * 0.02, 50.45 + T.c * 0.04 + T.r * 0.02, t)), off = E.inOutCubic(unit(56.8, 57.6, t));
      const d0 = Ln * off, d1 = Ln * on;
      if (d1 - d0 < 1e-4) continue;
      Lines.poly(polyPart(P, d0, d1).map((p) => [p[0], 0.003, p[1]]), C4(ORANGE, 0.85), 1.6);
      // pulses: launched on every 16th, outward until 56 s, then converging toward the main line
      if (t > 50.5 && t < 57.0) for (let k = 0; k < 4; k++) {
        const ph = ((t - 50.5) * 2 + k / 4 + (T.c + T.r * 3) * 0.13) % 1, conv = t > 56.0;
        const dd = (conv ? 1 - ph : ph) * Ln;
        if (dd < d0 || dd > d1) continue;
        const a = polyAt(P, Math.max(d0, dd - 0.05)), b = polyAt(P, dd);
        Lines.seg([a[0], 0.005, a[1]], [b[0], 0.005, b[1]], C4(PAPER, 1), 3.2);
      }
    }
  }
  Fills.flush(cam);
  Solids.flush(cam, [0.018, 1.0, t >= 44.4 ? 0.5 : 0]);
  MapSurf.draw(cam, {});
  if (mapTop !== null) { Terraces.upload(TERR.mesh2, 'm2'); Terraces.draw(cam, Object.assign(terraceState(t), { xf: [0, 0, 1, mapTop] })); }
  Glyph3D.flush(cam);
  Lines.flush(cam, true, 0.0012);
}
