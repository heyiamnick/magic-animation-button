/* =====================================================================
   TEXT — SDF glyph atlas built at load time from the embedded Inter fonts.
   Kerning pairs are measured from the browser's shaping of the real font.
   ===================================================================== */
const TEXT_VS = `#version 300 es
in vec3 aP; in vec2 aUV; in vec4 aCol; in vec2 aL; in vec4 aClip;
uniform mat4 uVP; uniform vec2 uRes; uniform float uScreen;
out vec2 vUV; out vec4 vCol; out vec2 vL; flat out vec4 vClip;
void main(){
  vUV = aUV; vCol = aCol; vL = aL; vClip = aClip;
  if (uScreen > .5) gl_Position = vec4(aP.x / uRes.x * 2. - 1., 1. - aP.y / uRes.y * 2., 0., 1.);
  else gl_Position = uVP * vec4(aP, 1.);
}`;
const TEXT_FS = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vCol; in vec2 vL; flat in vec4 vClip;
uniform sampler2D uAtlas;
out vec4 oC;
void main(){
  if (vL.x < vClip.x || vL.y < vClip.y || vL.x > vClip.z || vL.y > vClip.w) discard;
  float d = texture(uAtlas, vUV).r;
  float w = max(fwidth(d) * .62, 1e-4);
  float a = smoothstep(.5 - w, .5 + w, d) * vCol.a;
  if (a < .003) discard;
  oC = vec4(vCol.rgb, a);
}`;

const Text = (() => {
  const AW = 2048, AH = 2048;
  const fonts = {};
  let prog, vao, buf, tex;
  const BW = new FBuf(1 << 14), BS = new FBuf(1 << 14);
  const NOCLIP = [-1e9, -1e9, 1e9, 1e9];

  async function loadFonts() {
    const faces = [new FontFace('IDB', `url(data:font/woff;base64,${window.FONT_DATA.display})`, { weight: '900' }),
                   new FontFace('IST', `url(data:font/woff;base64,${window.FONT_DATA.text})`, { weight: '600' })];
    for (const f of faces) { await f.load(); document.fonts.add(f); }
    await document.fonts.ready;
  }

  function buildAtlas() {
    const atlas = new Uint8Array(AW * AH);
    const cv = document.createElement('canvas'); const cx = cv.getContext('2d', { willReadFrequently: true });
    const specs = [
      { key: 'display', css: '900 {s}px "IDB"', em: 150, spread: 14, chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:/-—′+−×°%' },
      { key: 'text', css: '600 {s}px "IST"', em: 64, spread: 7, chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;/-–—′\'·×+−=()%°→' },
    ];
    let px = 0, py = 0, rowH = 0;
    for (const sp of specs) {
      const F = { em: sp.em, spread: sp.spread, g: {}, kern: {} };
      const css = sp.css.replace('{s}', sp.em);
      cx.font = css;
      F.space = cx.measureText(' ').width;
      const m0 = cx.measureText('H'); F.cap = m0.actualBoundingBoxAscent;
      for (const ch of sp.chars) {
        cx.font = css;
        const m = cx.measureText(ch);
        const l = Math.ceil(m.actualBoundingBoxLeft) + 1, r = Math.ceil(m.actualBoundingBoxRight) + 1;
        const a = Math.ceil(m.actualBoundingBoxAscent) + 1, d = Math.ceil(m.actualBoundingBoxDescent) + 1;
        const gw = l + r + 2 * sp.spread, gh = a + d + 2 * sp.spread;
        if (px + gw > AW) { px = 0; py += rowH + 1; rowH = 0; }
        cv.width = gw; cv.height = gh;
        cx.font = css; cx.fillStyle = '#000'; cx.fillRect(0, 0, gw, gh);
        cx.fillStyle = '#fff'; cx.textBaseline = 'alphabetic';
        cx.fillText(ch, sp.spread + l, sp.spread + a);
        const img = cx.getImageData(0, 0, gw, gh).data;
        const al = new Uint8Array(gw * gh); for (let i = 0; i < gw * gh; i++) al[i] = img[i * 4];
        const sd = sdfFromAlpha(al, gw, gh);
        for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
          const v = clamp(0.5 - sd[y * gw + x] / (2 * sp.spread));
          atlas[(py + y) * AW + px + x] = Math.round(v * 255);
        }
        F.g[ch] = { x: px, y: py, w: gw, h: gh, l: l + sp.spread, a: a + sp.spread, adv: m.width };
        px += gw + 1; rowH = Math.max(rowH, gh);
      }
      // kerning from real shaping
      cx.font = css;
      const cs = [...sp.chars];
      for (const a of cs) for (const b of cs) {
        const k = cx.measureText(a + b).width - F.g[a].adv - F.g[b].adv;
        if (Math.abs(k) > 0.01) F.kern[a + b] = k;
      }
      fonts[sp.key] = F;
      px = 0; py += rowH + 2; rowH = 0;
    }
    tex = byteTexture(atlas, AW, AH);
  }

  async function init() {
    await loadFonts();
    buildAtlas();
    prog = Program(TEXT_VS, TEXT_FS);
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const st = 15 * 4;
    const at = (n, sz, off) => { const l = prog.a(n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, sz, gl.FLOAT, false, st, off); };
    at('aP', 3, 0); at('aUV', 2, 12); at('aCol', 4, 20); at('aL', 2, 36); at('aClip', 4, 44);
    gl.bindVertexArray(null);
  }

  // layout in em-relative units (1 = font size)
  function layout(fk, str, track = 0) {
    const F = fonts[fk], out = []; let x = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (i > 0) x += (F.kern[str[i - 1] + ch] || 0) / F.em;
      if (ch === ' ') { out.push({ ch, x, i }); x += F.space / F.em + track; continue; }
      const g = F.g[ch]; if (!g) { x += F.space / F.em; continue; }
      out.push({ ch, x, i, g }); x += g.adv / F.em + track;
    }
    return { glyphs: out, width: x - track, cap: F.cap / F.em };
  }
  /* emit a string.
     place(lx, ly) -> [x,y,z] maps text-local coords (em units * size, y down from baseline) to output space.
     opts.glyph(i, n, ch) -> {dx, dy, a, sx, sy} kinetic per-glyph offsets (in size units). */
  function emit(B, fk, str, size, col, place, opts = {}) {
    const F = fonts[fk], L = layout(fk, str, opts.track || 0);
    const ax = opts.align === 'right' ? -L.width : opts.align === 'center' ? -L.width / 2 : 0;
    const clip = opts.clip || NOCLIP;
    const n = L.glyphs.length;
    for (const G of L.glyphs) {
      if (!G.g) continue;
      const k = opts.glyph ? opts.glyph(G.i, n, G.ch) : null;
      const a = col[3] * (k && k.a !== undefined ? k.a : 1);
      if (a <= 0.002) continue;
      const g = G.g, s = size / F.em;
      const sx = k && k.sx !== undefined ? k.sx : 1, sy = k && k.sy !== undefined ? k.sy : 1;
      const ox = (G.x + ax + (k ? k.dx || 0 : 0)) * size, oy = (k ? k.dy || 0 : 0) * size;
      const x0 = ox - g.l * s * sx, x1 = ox + (g.w - g.l) * s * sx;
      const y0 = oy - g.a * s * sy, y1 = oy + (g.h - g.a) * s * sy;
      const u0 = g.x / AW, v0 = g.y / AH, u1 = (g.x + g.w) / AW, v1 = (g.y + g.h) / AH;
      const P = [[x0, y0, u0, v0], [x1, y0, u1, v0], [x1, y1, u1, v1], [x0, y1, u0, v1]];
      const V = P.map(([lx, ly, u, v]) => { const p = place(lx, ly); return [p[0], p[1], p[2] || 0, u, v, col[0], col[1], col[2], a, lx, ly, clip[0], clip[1], clip[2], clip[3]]; });
      for (const idx of [0, 1, 2, 0, 2, 3]) B.push(...V[idx]);
    }
    return L.width * size;
  }
  // screen-space text: x,y in design px (baseline-left), size in design px
  function screen(fk, str, x, y, size, col, opts = {}) {
    return emit(BS, fk, str, size, col, (lx, ly) => [(x + lx) * PX, (y + ly) * PX, 0], opts);
  }
  // world-space text on an arbitrary plane: origin, right & down unit vectors, size in world units
  function world(fk, str, origin, right, down, size, col, opts = {}) {
    return emit(BW, fk, str, size, col, (lx, ly) => [origin[0] + right[0] * lx + down[0] * ly, origin[1] + right[1] * lx + down[1] * ly, origin[2] + right[2] * lx + down[2] * ly], opts);
  }
  function width(fk, str, size, track = 0) { return layout(fk, str, track).width * size; }
  function capHeight(fk) { return fonts[fk].cap / fonts[fk].em; }
  function flush(cam, which = 'both') {
    prog.use(); const u = prog.u;
    gl.uniformMatrix4fv(u('uVP'), false, cam.vp); gl.uniform2f(u('uRes'), W, H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(u('uAtlas'), 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.bindVertexArray(vao);
    if (which !== 'screen' && BW.n) {
      gl.uniform1f(u('uScreen'), 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, BW.view(), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, BW.n / 15); BW.reset();
    }
    if (which !== 'world' && BS.n) {
      gl.disable(gl.DEPTH_TEST); gl.uniform1f(u('uScreen'), 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, BS.view(), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, BS.n / 15); BS.reset(); gl.enable(gl.DEPTH_TEST);
    }
    gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND);
  }
  return { init, screen, world, width, capHeight, flush, layout, fonts };
})();
