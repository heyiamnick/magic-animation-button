/* =====================================================================
   SOLIDS — the physical interface: lit slabs/boxes/cylinders, soft drop
   shadows, contour-map surfaces on arbitrary 3D quads, and extruded glyph
   solids (isobands of each glyph's own distance field) on drum odometers.
   ===================================================================== */

// light: horizontal direction toward the light (same as the terrace walls) + elevation for top faces
const L3 = (() => { const a = [-0.95, 0.3], l = Math.hypot(a[0], a[1]); return [a[0] / l, 0.62, a[1] / l]; })();

/* ---------------- 1. lit triangle meshes ----------------
   per vertex: p.xyz n.xyz c.rgba mode
   mode 0 = print surface (exact colour), 1 = sculpted wall (shadow -> lit ramp of c), 2 = diffuse */
const SOLID_VS = `#version 300 es
in vec3 aP; in vec3 aN; in vec4 aC; in float aM;
uniform mat4 uVP;
out vec3 vN; out vec4 vC; flat out float vM; out vec3 vW;
void main(){ vN = aN; vC = aC; vM = aM; vW = aP; gl_Position = uVP * vec4(aP, 1.); }`;
const SOLID_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec4 vC; flat in float vM; in vec3 vW;
uniform vec3 uL, uDark; uniform vec4 uStrata;
out vec4 oC;
float cover(float d, float w) { return max(0., min(d + w * .5, .5) - max(d - w * .5, -.5)); }
void main(){
  vec3 n = normalize(vN), col = vC.rgb;
  if (vM > .5 && vM < 1.5) {
    float lam = dot(normalize(vec3(n.x, 0., n.z) + 1e-6), normalize(vec3(uL.x, 0., uL.z))) * (1. - abs(n.y)) + n.y * .85;
    col = mix(uDark, vC.rgb, smoothstep(-.45, 1., lam));
    if (uStrata.z > 0. && abs(n.y) < .5) {               // strata hatching on vertical faces
      float f = vW.y / uStrata.x, g = length(vec2(dFdx(f), dFdy(f)));
      float d = abs(fract(f + .5) - .5) / max(g, 1e-6);
      col = mix(col, col * .55, cover(d, uStrata.y) * uStrata.z * smoothstep(.6, 2.5, 1. / max(g, 1e-6)));
    }
  } else if (vM > 1.5) {
    col = vC.rgb * (.55 + .45 * max(dot(n, normalize(uL)), 0.));
  }
  oC = vec4(col, vC.a);
}`;
const Solids = (() => {
  let prog, vao, buf;
  const B = new FBuf(1 << 16);
  function init() {
    prog = Program(SOLID_VS, SOLID_FS);
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const st = 44, at = (n, s, o) => { const l = prog.a(n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, s, gl.FLOAT, false, st, o); };
    at('aP', 3, 0); at('aN', 3, 12); at('aC', 4, 24); at('aM', 1, 40);
    gl.bindVertexArray(null);
  }
  const V = (p, n, c, m) => B.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], c[3] ?? 1, m);
  function tri(a, b, c, n, col, m) { V(a, n, col, m); V(b, n, col, m); V(c, n, col, m); }
  function quad(a, b, c, d, n, col, m) { tri(a, b, c, n, col, m); tri(a, c, d, n, col, m); }
  const nrm = (a, b, c) => norm3(cross3(sub3(b, a), sub3(c, a)));
  // box from local min/max, transformed by an optional point mapper f(p) (rigid); tops print, sides sculpt
  // (sideMode 1: shadow ramps to cobalt, for paper/ink; 2: plain diffuse, for orange so it never turns magenta)
  function box(x0, y0, z0, x1, y1, z1, topCol, sideCol, f = null, botCol = null, sideMode = 1) {
    const P = (x, y, z) => (f ? f([x, y, z]) : [x, y, z]);
    const c = [P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)];
    const F = (a, b, cc, d, col, m) => quad(c[a], c[b], c[cc], c[d], nrm(c[a], c[b], c[cc]), col, m);
    F(4, 7, 6, 5, topCol, 0);                 // top (+y)
    F(0, 1, 2, 3, botCol || sideCol, sideMode);   // bottom
    F(3, 2, 6, 7, sideCol, sideMode);             // +z (south)
    F(1, 0, 4, 5, sideCol, sideMode);             // -z (north)
    F(0, 3, 7, 4, sideCol, sideMode);             // -x (west)
    F(2, 1, 5, 6, sideCol, sideMode);             // +x (east)
  }
  // cylinder along local x from x0..x1, radius r around (cy, cz)
  function cylinderX(x0, x1, cy, cz, r, col, segs = 28, f = null) {
    const P = (x, y, z) => (f ? f([x, y, z]) : [x, y, z]);
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * TAU, a1 = ((i + 1) / segs) * TAU;
      const y0 = cy + r * Math.cos(a0), z0 = cz + r * Math.sin(a0), y1 = cy + r * Math.cos(a1), z1 = cz + r * Math.sin(a1);
      const n = norm3(sub3(P(0, (y0 + y1) / 2, (z0 + z1) / 2), P(0, cy, cz)));
      quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z1), P(x0, y1, z1), n, col, 1);
      tri(P(x0, cy, cz), P(x0, y1, z1), P(x0, y0, z0), norm3(sub3(P(-1, 0, 0), P(0, 0, 0))), col, 1);
      tri(P(x1, cy, cz), P(x1, y0, z0), P(x1, y1, z1), norm3(sub3(P(1, 0, 0), P(0, 0, 0))), col, 1);
    }
  }
  function flush(cam, strata = [0.02, 1, 0]) {
    const n = B.n / 11; if (!n) return;
    prog.use(); const u = prog.u;
    gl.uniformMatrix4fv(u('uVP'), false, cam.vp);
    gl.uniform3fv(u('uL'), L3); gl.uniform3fv(u('uDark'), WALL_DARK_S);
    gl.uniform4f(u('uStrata'), strata[0], strata[1] * PX, strata[2], 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, B.view(), gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, n); gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    B.reset();
  }
  return { init, tri, quad, box, cylinderX, flush };
})();
const WALL_DARK_S = [0.085, 0.105, 0.56];

/* soft drop shadow of a rectangle footprint (x0..x1, z0..z1) floating at height h, cast on the ground */
function dropShadow(x0, z0, x1, z1, h, strength = 0.22, groundY = 0.0008) {
  if (h <= 1e-4) return;
  const k = 0.55, dx = -L3[0] * h * k, dz = -L3[2] * h * k;
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const g = (i / (layers - 1) - 0.5) * h * 0.22;
    const a = (strength / layers) * clamp(1.4 - h * 0.6, 0.35, 1);
    Fills.rectXZ(x0 + dx - g, z0 + dz - g, x1 + dx + g, z1 + dz + g, groundY + i * 1e-5, [INK[0], INK[1], INK[2], a]);
  }
}

/* ---------------- 2. contour-map surfaces on any 3D quad ----------------
   per vertex: p.xyz q.xy (map plan coordinates). Lines are the same analytic level sets as everywhere else. */
const MAPS_VS = `#version 300 es
in vec3 aP; in vec2 aQ; in vec2 aA;
uniform mat4 uVP;
out vec2 vQ; out vec2 vA;
void main(){ vQ = aQ; vA = aA; gl_Position = uVP * vec4(aP, 1.); }`;
const MAPS_FS = `#version 300 es
precision highp float;
in vec2 vQ; in vec2 vA;
uniform sampler2D uT1, uT2; uniform float uMix, uK, uOff;
uniform vec4 uMapRect; uniform vec3 uBg, uLine; uniform vec4 uW;   // w, wIdx, every, alpha
uniform vec4 uFlip;                                                   // global invert amount; vA.y = per-quad invert
out vec4 oC;
float cover(float d, float w) { return max(0., min(d + w * .5, .5) - max(d - w * .5, -.5)); }
void main(){
  vec2 uv = (vQ - uMapRect.xy) / uMapRect.zw;
  float h = mix(texture(uT1, uv).r, texture(uT2, uv).r, uMix);
  float F = uK * h + uOff;
  float g = length(vec2(dFdx(F), dFdy(F)));
  float n = floor(F);
  float w = abs(mod(n, uW.z)) < .5 ? uW.y : uW.x;
  float d = fract(F) / max(g, 1e-7);
  float c = cover(abs(d - w * .5), w) * step(.5, n);
  float sp = 1. / max(g, 1e-7);
  c = mix(c, min(w / sp, 1.) * step(.5, n), smoothstep(3., 1.4, sp));
  float fl = clamp(uFlip.x + vA.y, 0., 1.);
  vec3 bg = mix(uBg, uLine, fl), ln = mix(uLine, uBg, fl);
  oC = vec4(mix(bg, ln, c * uW.w), vA.x);
}`;
const MAP_LIFT = 4e-4;
const MapSurf = (() => {
  let prog, vao, buf;
  const B = new FBuf(1 << 12);
  function init() {
    prog = Program(MAPS_VS, MAPS_FS);
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const st = 28, at = (n, s, o) => { const l = prog.a(n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, s, gl.FLOAT, false, st, o); };
    at('aP', 3, 0); at('aQ', 2, 12); at('aA', 2, 20);
    gl.bindVertexArray(null);
  }
  // quad corners p0..p3 (world) carrying plan coords q0..q3; flip inverts paper/ink on this quad only.
  // Callers lift the quad MAP_LIFT above the face it prints on (no polygon offset: that would hide lines at grazing angles).
  function quad(p, q, a = 1, flip = 0) { for (const i of [0, 1, 2, 0, 2, 3]) B.push(p[i][0], p[i][1], p[i][2], q[i][0], q[i][1], a, flip); }
  function draw(cam, o = {}) {
    const n = B.n / 7; if (!n) return;
    prog.use(); const u = prog.u;
    gl.uniformMatrix4fv(u('uVP'), false, cam.vp);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, TEX.terr); gl.uniform1i(u('uT1'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, TEX.terr2); gl.uniform1i(u('uT2'), 1);
    gl.uniform1f(u('uMix'), o.mix ?? 1); gl.uniform1f(u('uK'), LEVELS); gl.uniform1f(u('uOff'), 0.5);
    gl.uniform4fv(u('uMapRect'), MAPRECT); gl.uniform3fv(u('uBg'), o.bg || INK); gl.uniform3fv(u('uLine'), o.line || PAPER);
    gl.uniform4f(u('uW'), (o.w ?? 1.2) * PX, (o.wIdx ?? 2.28) * PX, o.every ?? 5, o.alpha ?? 1);
    gl.uniform4f(u('uFlip'), o.flip ?? 0, 0, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, B.view(), gl.DYNAMIC_DRAW);
    gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, n); gl.bindVertexArray(null);
    B.reset();
  }
  return { init, quad, draw };
})();

/* ---------------- 3. extruded glyph solids + drum odometers ---------------- */
const GLYPH_VS = `#version 300 es
in vec2 aPos; in vec3 aLv; in vec2 aN; in float aG;
uniform mat4 uVP, uM; uniform float uDepth;
out vec3 vN; flat out float vKind;
void main(){
  float y = mix(aLv.x, aLv.y, aLv.z) * uDepth;
  bool wall = dot(aN, aN) > .01;
  vN = mat3(uM) * (wall ? vec3(aN.x, 0., aN.y) : vec3(0., 1., 0.));
  vKind = wall ? 1. : 0.;
  gl_Position = uVP * (uM * vec4(aPos.x, y, aPos.y, 1.));
}`;
const GLYPH_FS = `#version 300 es
precision highp float;
in vec3 vN; flat in float vKind;
uniform vec3 uCap, uLit, uDark, uL;
out vec4 oC;
void main(){
  vec3 n = normalize(vN);
  if (vKind < .5) { oC = vec4(uCap, 1.); return; }
  float lam = dot(n, normalize(uL));
  oC = vec4(mix(uDark, uLit, smoothstep(-.45, 1., lam)), 1.);
}`;
const Glyph3D = (() => {
  let prog;
  const cache = {};
  function init() { prog = Program(GLYPH_VS, GLYPH_FS); }
  // build (once) an extruded mesh for one glyph; local units: 1 = font em, y up, baseline at 0
  function mesh(fk, ch) {
    const key = fk + ':' + ch;
    if (cache[key]) return cache[key];
    const em = 160, pad = 12;
    const css = fk === 'display' ? `900 ${em}px "IDB"` : `600 ${em}px "IST"`;
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    cx.font = css;
    const m = cx.measureText(ch);
    const l = Math.ceil(m.actualBoundingBoxLeft) + pad, r = Math.ceil(m.actualBoundingBoxRight) + pad;
    const a = Math.ceil(m.actualBoundingBoxAscent) + pad, d = Math.ceil(m.actualBoundingBoxDescent) + pad;
    const w = l + r, h = a + d;
    cv.width = w; cv.height = h;
    cx.font = css; cx.fillStyle = '#000'; cx.fillRect(0, 0, w, h); cx.fillStyle = '#fff'; cx.fillText(ch, l, a);
    const img = cx.getImageData(0, 0, w, h).data, al = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) al[i] = img[i * 4];
    const sd = sdfFromAlpha(al, w, h);
    // grid rows bottom-up, field crosses 1 on the outline
    const G = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) G[j * w + i] = clamp(1 - sd[(h - 1 - j) * w + i] / 3, 0, 1.9);
    const iso = Isobands();
    const res = iso.build(G, 1, 1, { w, h, x0: (0.5 - l) / em, y0: (0.5 - d) / em, dx: 1 / em, dy: 1 / em }, true);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, res.verts, gl.STATIC_DRAW);
    const st = 32, at = (n, s, o) => { const lc = prog.a(n); if (lc < 0) return; gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, s, gl.FLOAT, false, st, o); };
    at('aPos', 2, 0); at('aLv', 3, 8); at('aN', 2, 20); at('aG', 1, 28);
    gl.bindVertexArray(null);
    return (cache[key] = { vao, nv: res.nv, adv: m.width / em, minX: -m.actualBoundingBoxLeft / em, maxX: m.actualBoundingBoxRight / em, asc: m.actualBoundingBoxAscent / em });
  }
  const queue = [];
  // place a glyph: M maps glyph-local (x right, y extrusion, z = text-down; isobands already store z = -glyph-up) to world
  function put(fk, ch, M, depth, cap, lit, dark) { queue.push({ g: mesh(fk, ch), M, depth, cap, lit, dark }); }
  function flush(cam) {
    if (!queue.length) return;
    prog.use(); const u = prog.u;
    gl.uniformMatrix4fv(u('uVP'), false, cam.vp); gl.uniform3fv(u('uL'), L3);
    for (const q of queue) {
      gl.uniformMatrix4fv(u('uM'), false, q.M); gl.uniform1f(u('uDepth'), q.depth);
      gl.uniform3fv(u('uCap'), q.cap); gl.uniform3fv(u('uLit'), q.lit); gl.uniform3fv(u('uDark'), q.dark);
      gl.bindVertexArray(q.g.vao); gl.drawArrays(gl.TRIANGLES, 0, q.g.nv);
    }
    gl.bindVertexArray(null); queue.length = 0;
  }
  return { init, mesh, put, flush };
})();

// 4x4 helpers (column-major)
const M4 = {
  I: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  T: (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]),
  S: (s) => new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]),
  Rx: (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
  Ry: (a) => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
  mul: (...ms) => ms.reduce((a, b) => mul4(a, b)),
};

/* drum odometer: glyphs on a cylinder around an axis parallel to world x.
   frame(p) maps drum-local points to world (for slabs that tilt); value is continuous (wheel position). */
function drum(fk, chars, value, o) {
  const n = chars.length, step = TAU / n * (o.spread ?? 1);
  const size = o.size, R = o.radius ?? size * 0.62, depth = o.depth ?? size * 0.12;
  const base = o.base;              // matrix: drum frame -> world (origin = drum axis at the cell's left edge)
  for (let i = 0; i < n; i++) {
    let k = i - (value % n); if (k > n / 2) k -= n; if (k < -n / 2) k += n;
    const th = k * step;
    if (Math.abs(th) > 1.9) continue;
    const g = Glyph3D.mesh(fk, chars[i]);
    const cx = (o.cell - (g.maxX + g.minX) * size) / 2;          // centre horizontally in the cell
    const M = M4.mul(base, M4.Rx(th), M4.T(cx, R, g.asc * size * 0.5), M4.S(size));
    Glyph3D.put(fk, chars[i], M, depth / size, o.cap, o.lit, o.dark);
  }
}
