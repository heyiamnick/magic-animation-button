/* =====================================================================
   FIELDS — scalar fields sampled on one shared grid over the map region.
   Map region (plan coords q): x in [-MW, MW], y in [-1, 1]; world z = -q.y.
   Texel (i,j) centre: x = -MW + (i+.5)*DX, y = -1 + (j+.5)*DY.
   ===================================================================== */
const GX = 768, GY = 432, DX = (2 * MW) / GX, DY = 2 / GY;
const LEVELS = 30;               // terrain contour levels (field value 0..LEVELS)
const MAPRECT = [-MW, -1, 2 * MW, 2];

function gridSample(G, x, y) {   // bilinear, matches GL LINEAR filtering on texel centres
  let fx = (x + MW) / DX - 0.5, fy = (y + 1) / DY - 0.5;
  fx = clamp(fx, 0, GX - 1.0001); fy = clamp(fy, 0, GY - 1.0001);
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, k = j * GX + i;
  const a = G[k], b = G[k + 1], c = G[k + GX], d = G[k + GX + 1];
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

/* ---- terrain: a designed island massif, domain-warped ridged noise + sculpted features ---- */
const TERRAIN_A = [[-0.72, 0.10, 0.66, 0.40, 0.70, 0.30], [-0.05, -0.12, 1.05, 0.15, 0.30, -0.40], [0.88, 0.20, 0.40, 0.33, 0.55, 0.90], [0.40, -0.48, 0.30, 0.20, 0.22, 0.20], [0.15, 0.30, 0.30, 0.22, -0.16, 0.0]];
// the same island after a tectonic shift: the massif slides east and folds, a new ridge rises in the west
const TERRAIN_B = [[-0.22, 0.18, 0.58, 0.36, 0.72, -0.25], [-0.95, -0.22, 0.55, 0.16, 0.42, 0.55], [1.02, -0.10, 0.36, 0.40, 0.50, 0.35], [0.45, 0.45, 0.34, 0.20, 0.30, -0.6], [-0.55, 0.42, 0.28, 0.20, -0.14, 0.0]];
function buildTerrain(F = TERRAIN_A, warpSeed = 1907) {
  const n1 = perlin2(warpSeed), n2 = perlin2(4211), n3 = perlin2(733), n4 = perlin2(91);
  const raw = new Float32Array(GX * GY);
  const g = (x, y, cx, cy, sx, sy, a, rot = 0) => {
    const c = Math.cos(rot), s = Math.sin(rot), dx = x - cx, dy = y - cy;
    const u = (c * dx + s * dy) / sx, v = (-s * dx + c * dy) / sy;
    return a * Math.exp(-(u * u + v * v));
  };
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    const x = -MW + (i + 0.5) * DX, y = -1 + (j + 0.5) * DY;
    // domain warp (large, slow) gives flowing landforms
    const wx = x + 0.34 * n1(x * 0.7 + 3.1, y * 0.7 - 1.7) + 0.05 * n2(x * 2.6 + 9.2, y * 2.6 + 1.3);
    const wy = y + 0.34 * n1(x * 0.7 - 4.2, y * 0.7 + 2.3) + 0.05 * n2(x * 2.6 - 5.3, y * 2.6 + 7.7);
    // three octaves of ridged noise: ridges and valleys, not pockmarks
    let f = 0, amp = 0.5, fr = 1.15;
    for (let o = 0; o < 3; o++) { const r = 1 - Math.abs(n2(wx * fr + o * 17.1, wy * fr - o * 9.3) * 1.3); f += amp * r * r * r; amp *= 0.45; fr *= 2.1; }
    let h = 0.30 * f;
    for (const p of F) h += g(wx, wy, p[0], p[1], p[2], p[3], p[4], p[5]);   // sculpted massifs, ridges, basins
    h += 0.05 * n3(wx * 1.8, wy * 1.8);
    // organic coastline: warped ellipse, exactly flat beyond it
    const ex = x / (MW * 0.86), ey = y / 0.84;
    const r = Math.hypot(ex, ey) + 0.10 * n4(x * 1.3 + 2.0, y * 1.3 - 3.0);
    const m = 1 - sstep(0.62, 1.0, r);
    raw[j * GX + i] = Math.max(0, h) * m;
  }
  // gentle separable blur: removes pixel noise, keeps landforms
  const tmp = new Float32Array(GX * GY), R = 3, wts = [];
  for (let k = -R; k <= R; k++) wts.push(Math.exp(-(k * k) / (2 * 1.6 * 1.6)));
  const ws = wts.reduce((a, b) => a + b, 0);
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) { let a = 0; for (let k = -R; k <= R; k++) a += wts[k + R] * raw[j * GX + clamp(i + k, 0, GX - 1)]; tmp[j * GX + i] = a / ws; }
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) { let a = 0; for (let k = -R; k <= R; k++) a += wts[k + R] * tmp[clamp(j + k, 0, GY - 1) * GX + i]; raw[j * GX + i] = a / ws; }
  let mx = 0; for (let k = 0; k < raw.length; k++) mx = Math.max(mx, raw[k]);
  const out = new Float32Array(GX * GY);
  for (let k = 0; k < out.length; k++) out[k] = Math.pow(raw[k] / mx, 1.05);
  return out;            // normalized 0..1 (multiply by LEVELS for contour units)
}

/* ---- word distance field on the map grid (world units, negative inside) ---- */
async function buildWordField(word, family, weight, widthU, centerY, res = 2) {
  // render at `res` x grid resolution, then downsample distances to the grid
  const cw = GX * res, ch = GY * res;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.fillStyle = '#000'; cx.fillRect(0, 0, cw, ch);
  const probe = 200;
  cx.font = `${weight} ${probe}px "${family}"`;
  cx.fontKerning = 'normal';
  const m = cx.measureText(word);
  const pxPerU = cw / (2 * MW);
  const targetW = widthU * pxPerU;
  const visW = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
  const size = probe * targetW / visW;
  cx.font = `${weight} ${size}px "${family}"`;
  const m2 = cx.measureText(word);
  const asc = m2.actualBoundingBoxAscent, desc = m2.actualBoundingBoxDescent;
  const vis = m2.actualBoundingBoxLeft + m2.actualBoundingBoxRight;
  const x = cw / 2 - vis / 2 + m2.actualBoundingBoxLeft;
  // canvas y grows downward; q.y = centerY maps to row (1 - centerY)/2 * ch
  const yc = (1 - centerY) / 2 * ch;
  const y = yc + (asc - desc) / 2;
  cx.fillStyle = '#fff';
  cx.fillText(word, x, y);
  const img = cx.getImageData(0, 0, cw, ch).data;
  const alpha = new Uint8Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) alpha[i] = img[i * 4];
  const sd = sdfFromAlpha(alpha, cw, ch);
  // to grid (flip vertical: grid row 0 = q.y = -1 = bottom)
  const G = new Float32Array(GX * GY), uPerPx = (2 * MW) / cw;
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    let acc = 0;
    for (let b = 0; b < res; b++) for (let a = 0; a < res; a++) {
      const px = i * res + a, py = (GY - 1 - j) * res + b;
      acc += sd[py * cw + px];
    }
    G[j * GX + i] = (acc / (res * res)) * uPerPx;
  }
  return { G, capU: (asc) * uPerPx, size, widthU: vis * uPerPx, ascU: asc * uPerPx, descU: desc * uPerPx };
}

/* ---- isobands: terraces from a scalar field (level units) ----
   caps : x z lv lv 0 0 0 g       (8 floats / vertex, triangles; g = field value, for analytic contour lines)
   walls: x z lvLo lvHi t nx nz g (8 floats / vertex, triangles)
   segs : x0 z0 x1 z1 lv          (5 floats / instance)                       */
function Isobands() {
  const verts = new FBuf(1 << 20), segs = new FBuf(1 << 18), runs = new FBuf(1 << 16);
  const P = new Float64Array(48), Q2 = new Float64Array(48);   // scratch polygons (x,y,g)*n
  function emitTri(ax, ay, bx, by, cx, cy, lv, ga, gb, gc) {
    if (SKIP0 && lv === 0) return;
    verts.need(24); const a = verts.a; let n = verts.n;
    a[n++] = ax; a[n++] = -ay; a[n++] = lv; a[n++] = lv; a[n++] = 0; a[n++] = 0; a[n++] = 0; a[n++] = ga;
    a[n++] = bx; a[n++] = -by; a[n++] = lv; a[n++] = lv; a[n++] = 0; a[n++] = 0; a[n++] = 0; a[n++] = gb;
    a[n++] = cx; a[n++] = -cy; a[n++] = lv; a[n++] = lv; a[n++] = 0; a[n++] = 0; a[n++] = 0; a[n++] = gc;
    verts.n = n;
  }
  function emitWall(ax, ay, bx, by, lo, hi, nx, ny) {
    // world normal (q.y -> -z)
    const wx = nx, wz = -ny;
    verts.need(48); const a = verts.a; let n = verts.n;
    const V = (x, y, t) => { a[n++] = x; a[n++] = -y; a[n++] = lo; a[n++] = hi; a[n++] = t; a[n++] = wx; a[n++] = wz; a[n++] = hi; };
    V(ax, ay, 0); V(bx, by, 0); V(bx, by, 1);
    V(ax, ay, 0); V(bx, by, 1); V(ax, ay, 1);
    verts.n = n;
  }
  // canonical edge crossing: identical result whichever triangle (and direction) asks -> watertight mesh
  let CX = 0, CY = 0;
  function cross(ax, ay, ag, bx, by, bg, lv) {
    if (ax > bx || (ax === bx && ay > by)) { let s = ax; ax = bx; bx = s; s = ay; ay = by; by = s; s = ag; ag = bg; bg = s; }
    const t = (lv - ag) / (bg - ag);
    CX = ax + (bx - ax) * t; CY = ay + (by - ay) * t;
  }
  // clip polygon src (len m) keeping g >= lv (sign=+1) or g <= lv (sign=-1); returns new length in dst
  function clip(src, m, dst, lv, sign) {
    let k = 0;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const ax = src[i * 3], ay = src[i * 3 + 1], ag = src[i * 3 + 2];
      const bx = src[j * 3], by = src[j * 3 + 1], bg = src[j * 3 + 2];
      const ain = sign > 0 ? ag >= lv : ag <= lv, bin = sign > 0 ? bg >= lv : bg <= lv;
      if (ain) { dst[k * 3] = ax; dst[k * 3 + 1] = ay; dst[k * 3 + 2] = ag; k++; }
      if (ain !== bin) { cross(ax, ay, ag, bx, by, bg, lv); dst[k * 3] = CX; dst[k * 3 + 1] = CY; dst[k * 3 + 2] = lv; k++; }
    }
    return k;
  }
  function tri(x0, y0, g0, x1, y1, g1, x2, y2, g2, L) {
    const gmin = Math.min(g0, g1, g2), gmax = Math.max(g0, g1, g2);
    const lo = clamp(Math.floor(gmin), 0, L), hi = clamp(Math.floor(gmax), 0, L);
    if (lo === hi) { emitTri(x0, y0, x1, y1, x2, y2, lo, g0, g1, g2); return; }
    for (let lv = lo; lv <= hi; lv++) {
      P[0] = x0; P[1] = y0; P[2] = g0; P[3] = x1; P[4] = y1; P[5] = g1; P[6] = x2; P[7] = y2; P[8] = g2;
      let m = 3, src = P, dst = Q2;
      if (lv > lo) { m = clip(src, m, dst, lv, +1); const t = src; src = dst; dst = t; }
      if (lv < hi) { m = clip(src, m, dst, lv + 1, -1); const t = src; src = dst; dst = t; }
      for (let k = 1; k + 1 < m; k++) emitTri(src[0], src[1], src[k * 3], src[k * 3 + 1], src[(k + 1) * 3], src[(k + 1) * 3 + 1], lv, src[2], src[k * 3 + 2], src[(k + 1) * 3 + 2]);
    }
    // gradient of the linear interpolant -> outward (downhill) wall normal
    const ex1 = x1 - x0, ey1 = y1 - y0, ex2 = x2 - x0, ey2 = y2 - y0, dg1 = g1 - g0, dg2 = g2 - g0;
    const det = ex1 * ey2 - ex2 * ey1;
    let gx = (dg1 * ey2 - dg2 * ey1) / det, gy = (ex1 * dg2 - ex2 * dg1) / det;
    const gl_ = Math.hypot(gx, gy) || 1; gx /= gl_; gy /= gl_;
    for (let lv = lo + 1; lv <= hi; lv++) {
      // two crossing points of g = lv on the triangle edges
      let c = 0, ax = 0, ay = 0, bx = 0, by = 0;
      const E3 = [[x0, y0, g0, x1, y1, g1], [x1, y1, g1, x2, y2, g2], [x2, y2, g2, x0, y0, g0]];
      for (const e of E3) {
        if ((e[2] < lv) !== (e[5] < lv)) {
          cross(e[0], e[1], e[2], e[3], e[4], e[5], lv);
          const px = CX, py = CY;
          if (c === 0) { ax = px; ay = py; } else { bx = px; by = py; }
          c++;
        }
      }
      if (c < 2) continue;
      emitWall(ax, ay, bx, by, lv - 1, lv, -gx, -gy);
      segs.need(5); const s = segs.a; let n = segs.n;
      s[n++] = ax; s[n++] = -ay; s[n++] = bx; s[n++] = -by; s[n++] = lv; segs.n = n;
    }
  }
  // average wall normals across segments that share an endpoint (removes faceting on curved walls)
  const acc = new Map();
  function smoothWallNormals() {
    acc.clear();
    const a = verts.a, n = verts.n;
    const key = (i) => Math.round(a[i] * 2e5) + ',' + Math.round(a[i + 1] * 2e5) + ',' + a[i + 3];
    for (let i = 0; i < n; i += 8) {
      if (a[i + 5] === 0 && a[i + 6] === 0) continue;
      const k = key(i); let v = acc.get(k); if (!v) { v = [0, 0]; acc.set(k, v); }
      v[0] += a[i + 5]; v[1] += a[i + 6];
    }
    for (let i = 0; i < n; i += 8) {
      if (a[i + 5] === 0 && a[i + 6] === 0) continue;
      const v = acc.get(key(i)), l = Math.hypot(v[0], v[1]) || 1;
      a[i + 5] = v[0] / l; a[i + 6] = v[1] / l;
    }
  }
  /* G: field in level units. sub: grid stride (1 = full res).
     grid (optional): {w, h, x0, y0, dx, dy} for fields other than the map grid; skip0: omit band 0 (glyph solids) */
  let SKIP0 = false;
  function build(G, L, sub = 1, grid = null, skip0 = false) {
    verts.reset(); segs.reset(); runs.reset(); SKIP0 = skip0;
    const gw = grid ? grid.w : GX, gh = grid ? grid.h : GY;
    const gx0 = grid ? grid.x0 : -MW + 0.5 * DX, gy0 = grid ? grid.y0 : -1 + 0.5 * DY;
    const gdx = grid ? grid.dx : DX, gdy = grid ? grid.dy : DY;
    const nx = Math.floor((gw - 1) / sub) + 1, ny = Math.floor((gh - 1) / sub) + 1;
    const X = (i) => gx0 + i * sub * gdx, Y = (j) => gy0 + j * sub * gdy;
    const val = (i, j) => G[(j * sub) * gw + i * sub] + 1e-4;
    const DXr = gdx;
    for (let j = 0; j < ny - 1; j++) {
      let runStart = -1, runLv = -1;
      const y0 = Y(j), y1 = Y(j + 1);
      const flush = (iEnd) => {
        if (runStart >= 0) {
          if (SKIP0 && runLv === 0) { runStart = -1; runLv = -1; return; }
          const e = 0.35 * DXr, xa = X(runStart) - e, xb = X(iEnd) + e, ya = y0 - e, yb = y1 + e, gm = runLv + 0.5, lv = runLv;
          runs.need(48); const a = runs.a; let n = runs.n;
          for (const [x, y] of [[xa, ya], [xb, ya], [xb, yb], [xa, ya], [xb, yb], [xa, yb]]) { a[n++] = x; a[n++] = -y; a[n++] = lv; a[n++] = lv; a[n++] = 0; a[n++] = 0; a[n++] = 0; a[n++] = gm; }
          runs.n = n;
        }
        runStart = -1; runLv = -1;
      };
      for (let i = 0; i < nx - 1; i++) {
        const ga = val(i, j), gb = val(i + 1, j), gc = val(i + 1, j + 1), gd = val(i, j + 1);
        const mn = Math.min(ga, gb, gc, gd), mx = Math.max(ga, gb, gc, gd);
        const lo = clamp(Math.floor(mn), 0, L), hi = clamp(Math.floor(mx), 0, L);
        if (lo === hi && (lo === 0 || mn - lo > 0.12) && (lo === L || lo + 1 - mx > 0.12)) {
          if (runStart >= 0 && runLv === lo) continue;
          flush(i); runStart = i; runLv = lo; continue;
        }
        flush(i);
        const xa = X(i), xb = X(i + 1);
        tri(xa, y0, ga, xb, y0, gb, xb, y1, gc, L);
        tri(xa, y0, ga, xb, y1, gc, xa, y1, gd, L);
      }
      flush(nx - 1);
    }
    smoothWallNormals();
    const nTri = verts.n / 8;
    verts.need(runs.n); verts.a.set(runs.a.subarray(0, runs.n), verts.n); verts.n += runs.n;   // runs appended last
    return { verts: verts.view(), segs: segs.view(), nv: verts.n / 8, ns: segs.n / 5, nTri };
  }
  return { build };
}

/* contour polylines of one level along a horizontal section, used by the interface */
function sectionProfile(G, y, n = 600) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = -MW + (i / (n - 1)) * 2 * MW; out[i] = gridSample(G, x, y); }
  return out;
}
