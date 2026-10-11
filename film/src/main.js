/* =====================================================================
   BOOT + PUBLIC API
   window.seek(t)            render the frame at absolute time t (s). Deterministic, stateless.
   window.captureFrame(t, offsets, weights) -> base64 RGB24 of a temporally supersampled frame
   window.renderSoundtrack() -> base64 WAV (48 kHz stereo 16-bit)
   ===================================================================== */
async function init() {
  await Text.init();
  FIELDS.terr = buildTerrain();
  TEX.terr = fieldTexture(FIELDS.terr, GX, GY);
  const sig = await buildWordField('SIGNAL', 'IDB', 900, 2.86, 0.0);
  FIELDS.sig = sig; TEX.sig = fieldTexture(sig.G, GX, GY);
  const tit = await buildWordField('ISOLINE', 'IDB', 900, 2.62, 0.0);
  FIELDS.tit = tit; TEX.tit = fieldTexture(tit.G, GX, GY);
  FieldPlane.init(); Terraces.init(); Lines.init(); Fills.init();
  if (typeof sceneInit === 'function') sceneInit();
}

// wrap only outside [0, 15] so that seek(15) is genuinely evaluated by the closing motion
const wrapT = (t) => (t < 0 || t > DUR ? ((t % DUR) + DUR) % DUR : t);
window.seek = (t) => { renderFrame(wrapT(t)); gl.finish(); return true; };

let _acc = null, _px = null;
window.captureFrame = (t, offsets = [0], weights = [1]) => {
  const N = W * H;
  if (!_acc) { _acc = new Float32Array(N * 3); _px = new Uint8Array(N * 4); }
  _acc.fill(0);
  let wsum = 0;
  for (let k = 0; k < offsets.length; k++) {
    renderFrame(wrapT(t + offsets[k]));
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, _px);
    const w = weights[k]; wsum += w;
    for (let y = 0; y < H; y++) {           // flip: GL rows are bottom-up
      const src = (H - 1 - y) * W * 4, dst = y * W * 3;
      for (let x = 0; x < W; x++) {
        const s = src + x * 4, d = dst + x * 3;
        _acc[d] += _px[s] * w; _acc[d + 1] += _px[s + 1] * w; _acc[d + 2] += _px[s + 2] * w;
      }
    }
  }
  const out = new Uint8Array(N * 3), inv = 1 / wsum;
  for (let i = 0; i < N * 3; i++) out[i] = Math.min(255, Math.round(_acc[i] * inv));
  let s = '';
  for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
  return btoa(s);
};

window.ready = init().then(() => { window.seek(0); window.__ready = true; return true; })
  .catch((e) => { window.__error = String(e && e.stack || e); console.error(e); throw e; });

// optional live preview: click to play with sound (the render path never uses this)
document.addEventListener('click', async () => {
  if (window.__playing || !window.renderSoundtrack) return;
  window.__playing = true;
  const ac = new AudioContext({ sampleRate: 48000 });
  const b64 = await window.renderSoundtrack();
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const buf = await ac.decodeAudioData(bin.buffer);
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(ac.destination);
  const t0 = ac.currentTime + 0.1; src.start(t0);
  const loop = () => { const t = (ac.currentTime - t0); if (t >= 0) window.seek(t % DUR); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
