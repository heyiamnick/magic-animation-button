/* =====================================================================
   RENDERERS
   ===================================================================== */

/* ---------------- 1. FIELD PLANE: lines as analytic level sets ---------------- */
const FIELD_VS = `#version 300 es
in vec2 aPos;
uniform mat4 uVP;
uniform vec4 uWhipFrame;   // c.xy, dir.xy  (plan coords)
uniform vec4 uPulse[4];    // pos, ampV, ampY, sigma
uniform vec4 uSheet;       // amp, wavelength, phase, along-decay
out vec3 vW;
void main(){
  vec2 q = vec2(aPos.x, -aPos.y);
  float s = dot(q - uWhipFrame.xy, uWhipFrame.zw);
  float n = dot(q - uWhipFrame.xy, vec2(-uWhipFrame.w, uWhipFrame.z));
  float y = 0.;
  for (int i = 0; i < 4; i++) { float x = (s - uPulse[i].x) / uPulse[i].w; y += uPulse[i].z * exp(-x * x) * exp(-n * n * 0.35); }
  y += uSheet.x * sin(6.2831853 * s / uSheet.y - uSheet.z) * exp(-abs(s) * uSheet.w);
  vW = vec3(aPos.x, y, aPos.y);
  gl_Position = uVP * vec4(vW, 1.);
}`;

const FIELD_FS = `#version 300 es
precision highp float;
in vec3 vW;
out vec4 oC;
uniform vec3 uBg;
uniform vec4 uA0, uA1, uA2, uA3, uA4, uB0, uB1, uB2, uB3, uB4;
// X0: c.xy dir.xy | X1: W m0 f mode | X2: sp invS v0 hwPx | X3: rgb alpha | X4: hwWorld gapPx idxBoost idxEvery
uniform vec4 uPulse[4]; uniform vec4 uSag; uniform vec4 uWhipFrame;
uniform vec4 uWeave;              // dir.xy, front, mode (0 A-top, 1 parity behind front, 2 B-top)
uniform sampler2D uTerr; uniform vec4 uMapRect; uniform float uK; uniform float uKoff;
uniform sampler2D uSig; uniform vec4 uSigP; uniform vec4 uSigQ;
// SigP: amount stretch split blur | SigQ: phase duty morph wipeY
uniform sampler2D uTit; uniform vec4 uTitP; uniform vec4 uTitQ; uniform vec4 uTitR;
// TitP: maskB stretch open fill | TitQ: ringAlpha ringSp ringDelta ringCount | TitR: ringW 0 0 0
uniform float uSweep; uniform float uInside;
uniform vec3 uRingCol;
uniform vec3 uEye; uniform vec2 uFog;

float cover(float d, float w) { return max(0., min(d + w * .5, .5) - max(d - w * .5, -.5)); }
float whipD(float s) {
  float d = 0.;
  for (int i = 0; i < 4; i++) { float x = (s - uPulse[i].x) / uPulse[i].w; d += uPulse[i].y * exp(-x * x); }
  float sl = s / uSag.y; d -= uSag.x * max(0., 1. - sl * sl);
  return d;
}
vec2 subdiv(float v, float Wd, float m0, float f) {
  float cells = exp2(m0), cw = Wd / cells;
  float u = (v + Wd * .5) / cw;
  float cell = floor(u), cu = fract(u) - .5, o = f * .25;
  float d1 = abs(cu - o), d2 = abs(cu + o);
  float side = d1 < d2 ? 1. : 0.;
  float inside = (u >= 0. && u < cells) ? 1. : 0.;
  return vec2(inside > .5 ? min(d1, d2) * cw : 1e3, cell * 2. + side);
}
void main() {
  vec2 q = vec2(vW.x, -vW.z);
  float pw = sqrt(abs(dFdx(q.x) * dFdy(q.y) - dFdx(q.y) * dFdy(q.x)));
  float sW = dot(q - uWhipFrame.xy, uWhipFrame.zw);
  vec2 nW = vec2(-uWhipFrame.w, uWhipFrame.z);
  float wd = whipD(sW);
  vec2 nA = vec2(-uA0.w, uA0.z), nB = vec2(-uB0.w, uB0.z);
  float vA = dot(q - uA0.xy, nA) - wd * dot(nW, nA);
  float vB = dot(q - uB0.xy, nB) - wd * dot(nW, nB);
  vec2 tuv = (q - uMapRect.xy) / uMapRect.zw;
  float hT = texture(uTerr, tuv).r;

  float FB0 = (vB - uB2.z) * uB2.y / uB2.x;
  float strip = floor(FB0 + .5);
  float par = mod(strip, 2.) * 2. - 1.;
  vec2 lq = vec2(q.x / uSigP.y + par * uSigP.z, q.y);
  float sdS = texture(uSig, (lq - uMapRect.xy) / uMapRect.zw).r;
  float aaS = pw * .8 / uSigP.y + uSigP.w;
  float LS = (1. - smoothstep(-aaS, aaS, sdS)) * uSigP.x * step(uSigQ.w, q.y);
  float phiB = LS * uSigQ.x * (1. - uSigQ.z) + uK * hT + uKoff;
  float FB = FB0 + phiB;
  float FA = (vA - uA2.z) * uA2.y / uA2.x;

  float sdT0 = texture(uTit, tuv).r;
  float aaT = pw * .8;
  float LT = 1. - smoothstep(-aaT, aaT, sdT0 - uTitP.w);
  if (uTitP.y > 1e-4) {            // directional smear: horizontal running max of the letter mask
    for (int k = -8; k <= 8; k++) {
      vec2 sq = q + vec2(float(k) / 8. * uTitP.y, 0.);
      float s = textureLod(uTit, (sq - uMapRect.xy) / uMapRect.zw, 0.).r - uTitP.w;
      LT = max(LT, 1. - smoothstep(-aaT, aaT, s));
    }
  }
  float ringF = (sdT0 - uTitQ.z) / uTitQ.y;

  float gvA = length(vec2(dFdx(vA), dFdy(vA))), gvB = length(vec2(dFdx(vB), dFdy(vB)));
  float gFA = length(vec2(dFdx(FA), dFdy(FA))), gFB = length(vec2(dFdx(FB), dFdy(FB)));
  float gR = length(vec2(dFdx(ringF), dFdy(ringF)));

  // family A
  float dA, iA, spA;
  if (uA1.w < .5) { vec2 s = subdiv(vA, uA1.x, uA1.y, uA1.z); dA = s.x / max(gvA, 1e-7); iA = s.y; spA = 1e3; }
  else { dA = abs(fract(FA + .5) - .5) / max(gFA, 1e-7); iA = floor(FA + .5); spA = 1. / max(gFA, 1e-7); }
  float wA = max(2. * uA2.w, 2. * uA4.x / max(gvA, 1e-7));
  float mA = (uA1.w > .5 && uA1.x > 0.) ? step(abs(vA), uA1.x * .5) : 1.;
  float cA = cover(dA, wA) * mA;
  cA = mix(cA, min(wA / spA, 1.), smoothstep(3., 1.4, spA));

  // family B
  float dB, iB, spB;
  if (uB1.w < .5) { vec2 s = subdiv(vB, uB1.x, uB1.y, uB1.z); dB = s.x / max(gvB, 1e-7); iB = s.y; spB = 1e3; }
  else { dB = abs(fract(FB + .5) - .5) / max(gFB, 1e-7); iB = floor(FB + .5); spB = 1. / max(gFB, 1e-7); }
  float wB = max(2. * uB2.w, 2. * uB4.x / max(gvB, 1e-7));
  float isIdx = abs(mod(iB, uB4.w)) < .5 ? 1. : 0.;
  float sweepM = 1. - smoothstep(uSweep - .03, uSweep + .03, q.x);
  wB *= mix(1., uB4.z, isIdx * sweepM);
  wB += LS * uSigQ.y * min(spB, 60.) * (1. - uSigQ.z);
  wB = mix(wB, mix(spB + 1.5, wB, uTitP.z), uTitP.x);
  float mB = ((uB1.w > .5 && uB1.x > 0.) ? step(abs(vB), uB1.x * .5) : 1.) * mix(1., LT, uTitP.x);
  if (uInside > .5 && uK > 0.) dB = abs(fract(FB) / max(gFB, 1e-7) - wB * .5);
  float cB = cover(dB, wB) * mB;
  cB = mix(cB, min(wB / spB, 1.), smoothstep(3., 1.4, spB));

  // rings around the title letters (level sets of the title distance field)
  float iR = floor(ringF + .5);
  float dR = abs(ringF - iR) / max(gR, 1e-7);
  if (uInside > .5) { iR = ceil(ringF); dR = abs((iR - ringF) / max(gR, 1e-7) - uTitR.x * .5); }
  float cR = cover(dR, uTitR.x) * step(.5, iR) * step(iR, uTitQ.w + .5) * uTitQ.x;
  cR *= smoothstep(0., pw * 1.5, sdT0);

  bool aTop;
  if (uWeave.w < .5) aTop = true;
  else if (uWeave.w < 1.5) { float behind = step(dot(q, uWeave.xy), uWeave.z); aTop = behind * mod(iA + iB, 2.) < .5; }
  else aTop = false;
  float gA = cover(dA, wA + 2. * uA4.y) * mA, gB = cover(dB, wB + 2. * uB4.y) * mB;

  float fog = 1. - smoothstep(uFog.x, uFog.y, length(vW - uEye));
  cA *= fog; cB *= fog; cR *= fog;
  vec3 col = uBg;
  col = mix(col, uRingCol, cR);
  if (aTop) { col = mix(col, uB3.rgb, cB * uB3.a * (1. - gA * uA3.a)); col = mix(col, uA3.rgb, cA * uA3.a); }
  else { col = mix(col, uA3.rgb, cA * uA3.a * (1. - gB * uB3.a)); col = mix(col, uB3.rgb, cB * uB3.a); }
  oC = vec4(col, 1.);
}`;

const FieldPlane = (() => {
  let prog, vao, count;
  function init() {
    prog = Program(FIELD_VS, FIELD_FS);
    const N = 240, S = 7;                       // grid over [-S,S]^2
    const v = new Float32Array((N + 1) * (N + 1) * 2);
    let k = 0;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { v[k++] = -S + (2 * S * i) / N; v[k++] = -S + (2 * S * j) / N; }
    const idx = new Uint32Array(N * N * 6); k = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i; idx[k++] = a; idx[k++] = a + 1; idx[k++] = a + N + 1; idx[k++] = a + 1; idx[k++] = a + N + 2; idx[k++] = a + N + 1;
    }
    count = idx.length;
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    const l = prog.a('aPos'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }
  function fam(pre, F) {
    const u = prog.u;
    const m0 = Math.floor(F.m + 1e-9);
    gl.uniform4f(u(pre + '0'), F.c[0], F.c[1], Math.cos(F.ang), Math.sin(F.ang));
    gl.uniform4f(u(pre + '1'), F.W, m0, F.m - m0, F.mode);
    gl.uniform4f(u(pre + '2'), F.sp, F.invS, F.v0, F.hw * PX);
    gl.uniform4f(u(pre + '3'), F.col[0], F.col[1], F.col[2], F.alpha);
    gl.uniform4f(u(pre + '4'), F.hwW, F.gap * PX, F.boost, F.every);
  }
  function draw(cam, S, tex) {
    prog.use(); const u = prog.u;
    gl.uniformMatrix4fv(u('uVP'), false, cam.vp);
    gl.uniform3fv(u('uBg'), S.bg);
    fam('uA', S.A); fam('uB', S.B);
    const P = new Float32Array(16);
    for (let i = 0; i < 4; i++) { const p = S.pulses[i] || [0, 0, 0, 1]; P.set(p, i * 4); }
    gl.uniform4fv(u('uPulse'), P);
    gl.uniform4f(u('uSag'), S.sag[0], S.sag[1], 0, 0);
    gl.uniform4f(u('uWhipFrame'), 0, 0, 1, 0);
    gl.uniform4f(u('uSheet'), S.sheet[0], S.sheet[1], S.sheet[2], S.sheet[3]);
    gl.uniform4f(u('uWeave'), S.weave[0], S.weave[1], S.weave[2], S.weave[3]);
    gl.uniform4fv(u('uMapRect'), MAPRECT);
    gl.uniform1f(u('uK'), S.K); gl.uniform1f(u('uKoff'), S.kOff || 0);
    gl.uniform4fv(u('uSigP'), S.sigP); gl.uniform4fv(u('uSigQ'), S.sigQ);
    gl.uniform4fv(u('uTitP'), S.titP); gl.uniform4fv(u('uTitQ'), S.titQ); gl.uniform4f(u('uTitR'), S.ringW * PX, 0, 0, 0);
    gl.uniform1f(u('uSweep'), S.sweep); gl.uniform1f(u('uInside'), S.inside || 0);
    gl.uniform3fv(u('uRingCol'), S.ringCol);
    gl.uniform3fv(u('uEye'), cam.eye); gl.uniform2fv(u('uFog'), S.fog);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.terr); gl.uniform1i(u('uTerr'), 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.sig); gl.uniform1i(u('uSig'), 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, tex.tit); gl.uniform1i(u('uTit'), 2);
    gl.bindVertexArray(vao);
    gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  }
  return { init, draw };
})();

/* ---------------- 2. TERRACES: isoband mesh, extruded per level ---------------- */
const TERR_VS = `#version 300 es
in vec2 aPos; in vec3 aLv; in vec2 aN; in float aG;
uniform mat4 uVP; uniform float uLift[64]; uniform vec4 uXf; // map transform: offset.xz, scale, yOffset
out vec3 vW; out vec2 vN; out float vT; out float vG; flat out float vLv; flat out float vKind;
void main(){
  vG = aG;
  float y = mix(uLift[int(aLv.x)], uLift[int(aLv.y)], aLv.z);
  vec2 p = aPos * uXf.z + uXf.xy;
  vW = vec3(p.x, y * uXf.z + uXf.w, p.y);
  vN = aN; vT = aLv.z; vLv = aLv.y;
  vKind = dot(aN, aN) > .01 ? 1. : 0.;
  gl_Position = uVP * vec4(vW, 1.);
}`;
const TERR_FS = `#version 300 es
precision highp float;
in vec3 vW; in vec2 vN; in float vT; in float vG; flat in float vLv; flat in float vKind;
out vec4 oC;
uniform vec3 uCapLo, uCapHi; uniform vec4 uTint;   // amount, gamma, topLevel, topBoost
uniform float uLmax;
uniform vec4 uLine;     // width px, index width px, index every, alpha
uniform vec3 uLineCol, uInk; uniform float uSkipLevel, uSkipAmt;
uniform vec2 uLight;
uniform vec3 uWallLit, uWallDark;
uniform vec4 uStrata;   // spacing(world), width px, alpha, 0
uniform vec4 uXf;
float cover(float d, float w) { return max(0., min(d + w * .5, .5) - max(d - w * .5, -.5)); }
void main(){
  vec3 col;
  float gg = length(vec2(dFdx(vG), dFdy(vG)));
  if (vKind < .5) {
    float h = vLv / uLmax;
    col = mix(uCapLo, uCapHi, pow(h, uTint.y) * uTint.x);
    if (vLv >= uTint.z - .5) col = mix(col, uCapHi, uTint.w);
    // contour line: the level set g = level, drawn just inside this cap's outer edge
    float la = uLine.w * (abs(vLv - uSkipLevel) < .5 ? 1. - uSkipAmt : 1.);
    if (vLv > .5 && la > 0.) {
      float w = abs(mod(vLv, uLine.z)) < .5 ? uLine.y : uLine.x;
      float d = (vG - vLv) / max(gg, 1e-6);
      float lum = dot(col, vec3(.299, .587, .114));
      vec3 lc = mix(uLineCol, uInk, smoothstep(.42, .62, lum));
      col = mix(col, lc, cover(abs(d - w * .5), w) * la);
    }
  } else {
    float lam = dot(normalize(vN), uLight);
    col = mix(uWallDark, uWallLit, smoothstep(-.4, 1., lam));
    col *= mix(.62, 1., vT);
    float f = (vW.y - uXf.w) / uXf.z / uStrata.x;
    float g = length(vec2(dFdx(f), dFdy(f)));
    float d = abs(fract(f + .5) - .5) / max(g, 1e-6);
    col = mix(col, col * .45, cover(d, uStrata.y) * uStrata.z * smoothstep(.6, 2., 1. / max(g, 1e-6)));
  }
  oC = vec4(col, 1.);
}`;
const TERRL_VS = `#version 300 es
in vec2 aC;                // corner: along (0|1), side (-1|1)
in vec4 aSeg; in float aLvl;
uniform mat4 uVP; uniform vec2 uRes; uniform float uLift[64]; uniform vec4 uXf;
uniform float uW, uWIdx, uEvery, uBias;
out float vD; flat out float vWd; flat out float vLv;
void main(){
  float y = uLift[int(aLvl)] * uXf.z + uXf.w;
  vec3 p0 = vec3(aSeg.xy * uXf.z + uXf.xy, y).xzy, p1 = vec3(aSeg.zw * uXf.z + uXf.xy, y).xzy;
  vec4 c0 = uVP * vec4(p0, 1.), c1 = uVP * vec4(p1, 1.);
  float wd = abs(mod(aLvl, uEvery)) < .5 ? uWIdx : uW;
  vec2 s0 = c0.xy / c0.w * .5 * uRes, s1 = c1.xy / c1.w * .5 * uRes;
  vec2 d = s1 - s0; float L = length(d); d = L > 1e-5 ? d / L : vec2(1., 0.);
  vec2 n = vec2(-d.y, d.x);
  float hw = wd * .5 + 1.;
  vec4 c = mix(c0, c1, aC.x);
  vec2 off = n * aC.y * hw + d * (aC.x * 2. - 1.) * hw * .5;
  c.xy += off / (.5 * uRes) * c.w;
  c.z -= uBias * c.w;
  gl_Position = c; vD = aC.y * hw; vWd = wd; vLv = aLvl;
}`;
const TERRL_FS = `#version 300 es
precision highp float;
in float vD; flat in float vWd; flat in float vLv;
out vec4 oC;
uniform vec4 uCol; uniform vec4 uColIdx; uniform float uEvery;
uniform vec3 uCapLo, uCapHi; uniform vec4 uTint; uniform float uLmax; uniform vec3 uInk;
float cover(float d, float w) { return max(0., min(d + w * .5, .5) - max(d - w * .5, -.5)); }
void main(){
  vec4 c = abs(mod(vLv, uEvery)) < .5 ? uColIdx : uCol;
  // contrast against the cap this contour bounds
  float tnt = pow(vLv / uLmax, uTint.y) * uTint.x;
  if (vLv >= uTint.z - .5) tnt = mix(tnt, 1., uTint.w);
  vec3 cap = mix(uCapLo, uCapHi, tnt);
  float lum = dot(cap, vec3(.299, .587, .114));
  c.rgb = mix(c.rgb, uInk, smoothstep(.42, .62, lum));
  float a = cover(abs(vD), vWd) * c.a;
  if (a < .003) discard;
  oC = vec4(c.rgb, a);
}`;

const Terraces = (() => {
  let prog, lprog, vao, vbo, lvao, lbo, cornerBuf, nv = 0, ns = 0, nTri = 0;
  function init() {
    prog = Program(TERR_VS, TERR_FS);
    lprog = Program(TERRL_VS, TERRL_FS);
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const st = 32;
    let l;
    l = prog.a('aPos'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, st, 0);
    l = prog.a('aLv'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, st, 8);
    l = prog.a('aN'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, st, 20);
    l = prog.a('aG'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 1, gl.FLOAT, false, st, 28);
    gl.bindVertexArray(null);
    lvao = gl.createVertexArray(); gl.bindVertexArray(lvao);
    cornerBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
    l = lprog.a('aC'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    lbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lbo);
    l = lprog.a('aSeg'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 20, 0); gl.vertexAttribDivisor(l, 1);
    l = lprog.a('aLvl'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 1, gl.FLOAT, false, 20, 16); gl.vertexAttribDivisor(l, 1);
    gl.bindVertexArray(null);
  }
  let lastKey = null;
  function upload(mesh, key) {
    if (key !== undefined && key === lastKey) return;
    lastKey = key;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, mesh.verts, gl.DYNAMIC_DRAW); nv = mesh.nv; nTri = mesh.nTri ?? mesh.nv;
    gl.bindBuffer(gl.ARRAY_BUFFER, lbo); gl.bufferData(gl.ARRAY_BUFFER, mesh.segs, gl.DYNAMIC_DRAW); ns = mesh.ns;
  }
  function liftArray(T) { const a = new Float32Array(64); for (let i = 0; i < 64; i++) a[i] = T.lift(i); return a; }
  function draw(cam, T) {
    const lift = liftArray(T);
    const xf = T.xf || [0, 0, 1, 0];
    prog.use(); let u = prog.u;
    gl.uniformMatrix4fv(u('uVP'), false, cam.vp);
    gl.uniform1fv(u('uLift'), lift);
    gl.uniform4fv(u('uXf'), xf);
    gl.uniform3fv(u('uCapLo'), T.capLo); gl.uniform3fv(u('uCapHi'), T.capHi);
    gl.uniform4fv(u('uTint'), T.tint);
    gl.uniform1f(u('uLmax'), T.L);
    gl.uniform2fv(u('uLight'), T.light);
    gl.uniform3fv(u('uWallLit'), T.wallLit); gl.uniform3fv(u('uWallDark'), T.wallDark);
    gl.uniform4fv(u('uStrata'), [T.strata[0], T.strata[1] * PX, T.strata[2], 0]);
    gl.uniform4f(u('uLine'), T.lineW * PX, T.lineWIdx * PX, T.every, T.lineAlpha);
    gl.uniform3fv(u('uLineCol'), T.lineCol); gl.uniform3fv(u('uInk'), T.lineInk || INK); gl.uniform1f(u('uSkipLevel'), T.skipLevel ?? -9); gl.uniform1f(u('uSkipAmt'), T.skipAmt ?? 1);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, nTri);
    // merged interior runs: pushed back in depth so exact geometry always wins; they only fill sub-pixel cracks
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.0, 4.0);
    gl.drawArrays(gl.TRIANGLES, nTri, nv - nTri);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindVertexArray(null);
    if (T.segLines && T.lineAlpha > 0.001 && ns > 0) {
      lprog.use(); u = lprog.u;
      gl.uniformMatrix4fv(u('uVP'), false, cam.vp);
      gl.uniform2f(u('uRes'), W, H);
      gl.uniform1fv(u('uLift'), lift);
      gl.uniform4fv(u('uXf'), xf);
      gl.uniform1f(u('uW'), T.lineW * PX); gl.uniform1f(u('uWIdx'), T.lineWIdx * PX); gl.uniform1f(u('uEvery'), T.every);
      gl.uniform1f(u('uBias'), T.bias || 0.0004);
      gl.uniform4f(u('uCol'), T.lineCol[0], T.lineCol[1], T.lineCol[2], T.lineAlpha);
      gl.uniform4f(u('uColIdx'), T.lineColIdx[0], T.lineColIdx[1], T.lineColIdx[2], T.lineAlpha);
      gl.uniform3fv(u('uCapLo'), T.capLo); gl.uniform3fv(u('uCapHi'), T.capHi); gl.uniform4fv(u('uTint'), T.tint);
      gl.uniform1f(u('uLmax'), T.L); gl.uniform3fv(u('uInk'), T.lineInk || INK);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.bindVertexArray(lvao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, ns);
      gl.bindVertexArray(null);
      gl.depthMask(true); gl.disable(gl.BLEND);
    }
  }
  return { init, upload, draw };
})();

/* ---------------- 3. LINES: instanced world-space segments, AA in screen space ---------------- */
const LINE_VS = `#version 300 es
in vec2 aC;
in vec3 aP0; in vec3 aP1; in vec4 aCol; in vec2 aWD;   // width px, dash-phase(unused<0)
uniform mat4 uVP; uniform vec2 uRes; uniform float uBias;
out float vD; out vec4 vCol; flat out float vWd;
void main(){
  vec4 c0 = uVP * vec4(aP0, 1.), c1 = uVP * vec4(aP1, 1.);
  // clip against near plane in clip space
  float e = 1e-4;
  if (c0.w < e && c1.w < e) { gl_Position = vec4(2., 2., 2., 1.); vD = 0.; vCol = vec4(0.); vWd = 0.; return; }
  if (c0.w < e) c0 = mix(c0, c1, (e - c0.w) / (c1.w - c0.w));
  if (c1.w < e) c1 = mix(c1, c0, (e - c1.w) / (c0.w - c1.w));
  vec2 s0 = c0.xy / c0.w * .5 * uRes, s1 = c1.xy / c1.w * .5 * uRes;
  vec2 d = s1 - s0; float L = length(d); d = L > 1e-5 ? d / L : vec2(1., 0.);
  vec2 n = vec2(-d.y, d.x);
  float hw = aWD.x * .5 + 1.;
  vec4 c = mix(c0, c1, aC.x);
  vec2 off = n * aC.y * hw + d * (aC.x * 2. - 1.) * min(hw, aWD.x * .5 + .5);
  c.xy += off / (.5 * uRes) * c.w;
  c.z -= uBias * c.w;
  gl_Position = c; vD = aC.y * hw; vCol = aCol; vWd = aWD.x;
}`;
const LINE_FS = `#version 300 es
precision highp float;
in float vD; in vec4 vCol; flat in float vWd;
out vec4 oC;
float cover(float d, float w) { return max(0., min(d + w * .5, .5) - max(d - w * .5, -.5)); }
void main(){ float a = cover(abs(vD), vWd) * vCol.a; if (a < .003) discard; oC = vec4(vCol.rgb, a); }`;

const Lines = (() => {
  let prog, vao, buf, cbuf;
  const B = new FBuf(1 << 16);
  function init() {
    prog = Program(LINE_VS, LINE_FS);
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    cbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cbuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
    let l = prog.a('aC'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 0, 0);
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const st = 48;
    const at = (n, sz, off) => { const l2 = prog.a(n); gl.enableVertexAttribArray(l2); gl.vertexAttribPointer(l2, sz, gl.FLOAT, false, st, off); gl.vertexAttribDivisor(l2, 1); };
    at('aP0', 3, 0); at('aP1', 3, 12); at('aCol', 4, 24); at('aWD', 2, 40);
    gl.bindVertexArray(null);
  }
  const begin = () => B.reset();
  // segment in world space; col = [r,g,b,a]; w in design px
  function seg(p0, p1, col, w) { B.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], col[0], col[1], col[2], col[3], w * PX, 0); }
  function poly(pts, col, w, closed = false) { for (let i = 0; i + 1 < pts.length; i++) seg(pts[i], pts[i + 1], col, w); if (closed && pts.length > 2) seg(pts[pts.length - 1], pts[0], col, w); }
  function flush(cam, depthTest = true, bias = 0.0006) {
    const n = B.n / 12; if (!n) return;
    prog.use(); const u = prog.u;
    gl.uniformMatrix4fv(u('uVP'), false, cam.vp); gl.uniform2f(u('uRes'), W, H); gl.uniform1f(u('uBias'), bias);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, B.view(), gl.DYNAMIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    if (!depthTest) gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n); gl.bindVertexArray(null);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);
    B.reset();
  }
  return { init, begin, seg, poly, flush };
})();

/* ---------------- 4. FILLS: world-space or screen-space triangles ---------------- */
const FILL_VS = `#version 300 es
in vec3 aP; in vec4 aCol;
uniform mat4 uVP; uniform vec2 uRes; uniform float uScreen;
out vec4 vCol;
void main(){
  vCol = aCol;
  if (uScreen > .5) gl_Position = vec4(aP.x / uRes.x * 2. - 1., 1. - aP.y / uRes.y * 2., 0., 1.);
  else gl_Position = uVP * vec4(aP, 1.);
}`;
const FILL_FS = `#version 300 es
precision highp float; in vec4 vCol; out vec4 oC; void main(){ oC = vCol; }`;
const Fills = (() => {
  let prog, vao, buf;
  const B = new FBuf(1 << 14), BS = new FBuf(1 << 12);
  function init() {
    prog = Program(FILL_VS, FILL_FS);
    vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    let l = prog.a('aP'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 28, 0);
    l = prog.a('aCol'); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
  }
  function tri(a, b, c, col, screen = false) { const T = screen ? BS : B; for (const p of [a, b, c]) T.push(p[0], p[1], p[2] || 0, col[0], col[1], col[2], col[3]); }
  function quad(a, b, c, d, col, screen = false) { tri(a, b, c, col, screen); tri(a, c, d, col, screen); }
  function rectXZ(x0, z0, x1, z1, y, col) { quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], col); }
  function rectPx(x0, y0, x1, y1, col) { quad([x0 * PX, y0 * PX], [x1 * PX, y0 * PX], [x1 * PX, y1 * PX], [x0 * PX, y1 * PX], col, true); }
  function flush(cam, screenOnly = false) {
    prog.use(); const u = prog.u;
    gl.uniformMatrix4fv(u('uVP'), false, cam.vp); gl.uniform2f(u('uRes'), W, H);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(vao);
    if (!screenOnly && B.n) {
      gl.uniform1f(u('uScreen'), 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, B.view(), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, B.n / 7); B.reset();
    }
    if (BS.n) {
      gl.disable(gl.DEPTH_TEST); gl.uniform1f(u('uScreen'), 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, BS.view(), gl.DYNAMIC_DRAW);
      gl.drawArrays(gl.TRIANGLES, 0, BS.n / 7); BS.reset(); gl.enable(gl.DEPTH_TEST);
    }
    gl.bindVertexArray(null); gl.disable(gl.BLEND);
  }
  return { init, tri, quad, rectXZ, rectPx, flush };
})();
