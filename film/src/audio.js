/* =====================================================================
   SOUNDTRACK — original composition, synthesized with OfflineAudioContext.
   120 BPM, 4/4, D minor. 15 s = 7 bars + 1/2 bar. 48 kHz stereo.
   Two identical cycles are rendered and the second is kept, so every tail
   that crosses 15.000 s wraps into the start: the loop is seamless.
   Harmony per bar: Dm9 | Dm9 | Bbmaj7 | Gm9 | Fmaj9 | A7sus4-A7 | Dm | Bbmaj9#11 (1/2)
   ===================================================================== */
window.renderSoundtrack = async (opts = {}) => {
  const SR = 48000, CYCLE = 15, NC = opts.verify ? 3 : 2, LEN = CYCLE * NC;
  const ctx = new OfflineAudioContext(2, SR * LEN, SR);
  const rnd = mulberry32(20261011);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const B = (n) => n * 0.5;            // beat -> seconds
  const S16 = (bar, step) => bar * 2 + step * 0.125;

  // ---------------------------------------------------------- shared resources
  const noiseBuf = ctx.createBuffer(2, SR * 3, SR);
  for (let c = 0; c < 2; c++) { const d = noiseBuf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
  const curve = (drive) => { const n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); } return c; };
  function IR(sec, decay, seed) {
    const r = mulberry32(seed), b = ctx.createBuffer(2, Math.floor(SR * sec), SR);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) { const tt = i / SR; d[i] = (r() * 2 - 1) * Math.exp(-tt / decay) * (1 - Math.exp(-tt / 0.004)); } }
    return b;
  }
  const G = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };

  // ---------------------------------------------------------- buses
  const master = G(0.9);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.12;
  master.connect(comp); comp.connect(ctx.destination);
  const verb = ctx.createConvolver(); verb.buffer = IR(2.4, 0.55, 99); const verbRet = G(0.32); verb.connect(verbRet); verbRet.connect(master);
  const room = ctx.createConvolver(); room.buffer = IR(0.6, 0.12, 7); const roomRet = G(0.22); room.connect(roomRet); roomRet.connect(master);
  const kickBus = G(0.95); kickBus.connect(master);
  const kickSat = ctx.createWaveShaper(); kickSat.curve = curve(1.8); kickSat.connect(kickBus);
  const drumBus = G(0.8); drumBus.connect(master);
  const duck = G(1); duck.connect(master);                 // everything tonal is side-chained to the kick
  const bassBus = G(0.62); const bassSat = ctx.createWaveShaper(); bassSat.curve = curve(2.6); bassSat.oversample = '2x';
  bassBus.connect(bassSat); bassSat.connect(duck);
  const synthBus = G(0.5); synthBus.connect(duck);
  const subBus = G(0.75); subBus.connect(duck);
  const send = (node, bus, amt) => { const g = G(amt); node.connect(g); g.connect(bus); };

  // noise read offset is a pure function of the event's position in the cycle -> both cycles are sample-identical
  function noise(t, dur) {
    const tl = ((t % CYCLE) + CYCLE) % CYCLE, h = Math.sin(tl * 12.9898 + 0.31) * 43758.5453;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(t, (h - Math.floor(h)) * 1.5, dur + 0.05); return s;
  }
  function env(param, t, a, peak, d, floor = 0.0001) {
    param.setValueAtTime(0, t); param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(floor, t + a + d); param.linearRampToValueAtTime(0, t + a + d + 0.01);
  }
  function pan(node, p) { const n = ctx.createStereoPanner(); n.pan.value = p; node.connect(n); return n; }

  // ---------------------------------------------------------- instruments
  function kick(t, big = 0) {
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(180 + big * 40, t);
    o.frequency.exponentialRampToValueAtTime(54, t + 0.042);
    o.frequency.exponentialRampToValueAtTime(41 - big * 4, t + 0.32 + big * 0.3);
    const g = G(0); env(g.gain, t, 0.0015, 0.95, 0.40 + big * 0.45);
    o.connect(g); g.connect(kickSat); o.start(t); o.stop(t + 1.0 + big * 0.5);
    const n = noise(t, 0.02), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const gn = G(0); env(gn.gain, t, 0.0008, 0.35, 0.012); n.connect(hp); hp.connect(gn); gn.connect(kickBus);
    // side-chain duck of tonal bus
    duck.gain.setValueAtTime(0.32, t); duck.gain.setTargetAtTime(1, t + 0.012, 0.065 + big * 0.03);
  }
  function clap(t, vel = 1, wet = 0.22) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1350; bp.Q.value = 0.9;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450;
    const g = G(0); bp.connect(hp); hp.connect(g);
    const out = pan(g, 0.04);
    out.connect(drumBus); send(out, verb, wet); send(out, room, 0.5);
    for (const [dt, a, d] of [[0, 0.7, 0.008], [0.0095, 0.75, 0.008], [0.0195, 1, 0.16]]) {
      const n = noise(t + dt, d + 0.02), gg = G(0); env(gg.gain, t + dt, 0.0006, a * vel, d); n.connect(gg); gg.connect(bp);
    }
    g.gain.value = 0.85;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(205, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
    const go = G(0); env(go.gain, t, 0.001, 0.35 * vel, 0.08); o.connect(go); go.connect(drumBus); o.start(t); o.stop(t + 0.15);
  }
  function hat(t, vel, open = false, p = 0) {
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7200;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 10500; pk.gain.value = 6; pk.Q.value = 1.2;
    const g = G(0); env(g.gain, t, 0.0007, 0.42 * vel, open ? 0.17 : 0.028);
    const n = noise(t, open ? 0.25 : 0.06); n.connect(hp); hp.connect(pk); pk.connect(g);
    const out = pan(g, p); out.connect(drumBus); if (open) send(out, room, 0.4);
  }
  function tick(t, f = 3400, vel = 1, p = 0) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = G(0); env(g.gain, t, 0.0005, 0.18 * vel, 0.006); o.connect(g); pan(g, p).connect(drumBus); o.start(t); o.stop(t + 0.03);
  }
  function bass(t, dur, m, o = {}) {
    const f = mtof(m), cut0 = o.cut0 || 1800, cut1 = o.cut1 || 260, vel = o.vel || 1;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = o.q || 7;
    lp.frequency.setValueAtTime(cut0, t); lp.frequency.exponentialRampToValueAtTime(cut1, t + Math.max(0.05, dur * 0.8));
    const g = G(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.003);
    g.gain.setTargetAtTime(0.32 * vel, t + 0.01, 0.05); g.gain.setValueAtTime(0.32 * vel, t + dur - 0.012); g.gain.linearRampToValueAtTime(0, t + dur);
    for (const [type, det, lvl] of [['sawtooth', -7, 0.6], ['square', 6, 0.38], ['sawtooth', -1200, 0.5]]) {
      const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = f; osc.detune.value = det;
      if (o.glide) { osc.frequency.setValueAtTime(mtof(o.glide), t); osc.frequency.exponentialRampToValueAtTime(f, t + 0.06); }
      const gl = G(lvl); osc.connect(gl); gl.connect(lp); osc.start(t); osc.stop(t + dur + 0.02);
    }
    lp.connect(g); g.connect(bassBus);
  }
  function sub(t, dur, m, lvl = 0.6, dive = 0) {
    const o = ctx.createOscillator(); o.type = 'sine';
    if (dive) { o.frequency.setValueAtTime(mtof(m + dive), t); o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.18); }
    else o.frequency.value = mtof(m);
    const g = G(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + 0.012);
    g.gain.setValueAtTime(lvl, t + dur - 0.08); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(subBus); o.start(t); o.stop(t + dur + 0.02);
  }
  function pluck(t, m, vel = 1, p = 0, o = {}) {
    const f = mtof(m), dec = o.dec || 0.2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = o.q || 4;
    lp.frequency.setValueAtTime(o.cut || 5200, t); lp.frequency.exponentialRampToValueAtTime(o.cutEnd || 700, t + dec);
    const g = G(0); env(g.gain, t, 0.0015, 0.32 * vel, dec);
    for (const [type, det] of [['sawtooth', -6], ['square', 7]]) {
      const osc = ctx.createOscillator(); osc.type = type; osc.frequency.value = f; osc.detune.value = det;
      if (o.bend) { osc.frequency.setValueAtTime(f * Math.pow(2, o.bend / 12), t); osc.frequency.exponentialRampToValueAtTime(f, t + (o.bendT || 0.05)); }
      osc.connect(lp); osc.start(t); osc.stop(t + dec + 0.05);
    }
    lp.connect(g); const out = pan(g, p); out.connect(synthBus); send(out, verb, o.wet ?? 0.25);
  }
  function stab(t, ms, dur, o = {}) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = o.q || 3;
    lp.frequency.setValueAtTime(o.cut0 || 6500, t); lp.frequency.exponentialRampToValueAtTime(o.cut1 || 900, t + dur * 0.9);
    const sat = ctx.createWaveShaper(); sat.curve = curve(o.drive || 1.6);
    const g = G(0); env(g.gain, t, o.att || 0.002, (o.vel || 1) * 0.16, dur);
    for (const m of ms) for (const [det, p] of [[-11, -0.5], [9, 0.5], [0, 0]]) {
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = mtof(m); osc.detune.value = det;
      if (o.bend) { osc.detune.setValueAtTime(det, t); osc.detune.linearRampToValueAtTime(det + o.bend * 100, t + dur); }
      const pn = ctx.createStereoPanner(); pn.pan.value = p * (o.width ?? 0.7);
      osc.connect(pn); pn.connect(lp); osc.start(t); osc.stop(t + dur + 0.05);
    }
    lp.connect(sat); sat.connect(g); g.connect(synthBus); send(g, verb, o.wet ?? 0.3);
    return g;
  }
  // interference pad: each voice is a pair of saws whose beat frequency follows the moire angle
  function interference(t0, t1, ms, beatAt) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 1.5;
    const g = G(0); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.07, t0 + 0.02);
    g.gain.setValueAtTime(0.07, t1 - 0.06); g.gain.linearRampToValueAtTime(0, t1);
    lp.frequency.setValueAtTime(900, t0); lp.frequency.exponentialRampToValueAtTime(3800, t1);
    ms.forEach((m, i) => {
      const f = mtof(m);
      const a = ctx.createOscillator(); a.type = 'sawtooth'; a.frequency.value = f;
      const b = ctx.createOscillator(); b.type = 'sawtooth';
      b.frequency.setValueAtTime(f + beatAt(0), t0);
      for (let k = 1; k <= 14; k++) b.frequency.setTargetAtTime(f + beatAt(k), t0 + k * 0.125, 0.012);
      const pa = ctx.createStereoPanner(); pa.pan.value = -0.6 + i * 0.3; const pb = ctx.createStereoPanner(); pb.pan.value = 0.6 - i * 0.3;
      a.connect(pa); b.connect(pb); pa.connect(lp); pb.connect(lp);
      a.start(t0); b.start(t0); a.stop(t1 + 0.02); b.stop(t1 + 0.02);
    });
    lp.connect(g); g.connect(synthBus); send(g, verb, 0.2);
  }
  function pad(t, dur, ms, o = {}) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.cut || 2200; lp.Q.value = 0.8;
    const g = G(0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.vel || 0.05, t + (o.att || 0.03));
    g.gain.setValueAtTime(o.vel || 0.05, t + dur - (o.rel || 0.2)); g.gain.linearRampToValueAtTime(0, t + dur);
    ms.forEach((m, i) => { for (const det of [-9, 8]) {
      const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = mtof(m); osc.detune.value = det;
      const pn = ctx.createStereoPanner(); pn.pan.value = (det < 0 ? -1 : 1) * (0.3 + 0.1 * i);
      osc.connect(pn); pn.connect(lp); osc.start(t); osc.stop(t + dur + 0.02);
    } });
    lp.connect(g); g.connect(synthBus); send(g, verb, o.wet ?? 0.45);
  }
  function riser(t0, t1, lvl = 0.25) {
    const n = noise(t0, t1 - t0), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(350, t0); bp.frequency.exponentialRampToValueAtTime(9000, t1);
    const g = G(0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(lvl, t1 - 0.004); g.gain.linearRampToValueAtTime(0, t1);
    n.connect(bp); bp.connect(g); g.connect(drumBus); send(g, verb, 0.3);
  }
  function crash(t, lvl = 0.35, dur = 2.4) {
    const n = noise(t, dur), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
    const g = G(0); env(g.gain, t, 0.001, lvl, dur); n.connect(hp); hp.connect(g); g.connect(drumBus); send(g, verb, 0.4);
  }
  function swell(t0, t1, lvl = 0.3) {     // reverse cymbal into the downbeat
    const n = noise(t0, t1 - t0), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(2500, t0); hp.frequency.exponentialRampToValueAtTime(7000, t1);
    const g = G(0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(lvl, t1 - 0.003); g.gain.linearRampToValueAtTime(0, t1);
    n.connect(hp); hp.connect(g); g.connect(drumBus);
  }

  // ---------------------------------------------------------- the score
  const DM9 = [50, 53, 57, 60, 64], BBM7 = [46, 50, 53, 57], GM9 = [43, 46, 50, 53, 57], FM9 = [41, 45, 48, 52, 55];
  const A7S = [45, 50, 52, 55], A7 = [45, 49, 52, 55], DMC = [50, 57, 62, 65, 69], BBM9 = [46, 53, 57, 60, 64];
  const ROOT = [38, 38, 34, 31, 41, 33, 38, 34];

  function compose(T) {
    // kick on every beat (30); section downbeats hit harder
    for (let b = 0; b < 30; b++) kick(T + B(b), [0, 12, 24, 28].includes(b) ? 1 : 0);
    // clap on beats 2 & 4 of every bar (and the final upbeat)
    for (let b = 1; b < 30; b += 2) clap(T + B(b), b === 29 ? 1.1 : 1, b === 23 ? 0.35 : 0.22);
    // hats: 16ths with groove; open hats on the off-8ths from bar 3; roll at 1.5 and 11.5
    for (let s = 0; s < 120; s++) {
      const t = T + s * 0.125, inBeat = s % 4, bar = Math.floor(s / 16);
      if (bar === 7 && inBeat === 0) continue;
      const v = [0.45, 0.22, 0.8, 0.3][inBeat] * (bar >= 6 ? 1.15 : 1);
      if (inBeat === 2 && bar >= 2 && bar !== 3) hat(t, 0.7, true, 0.25); else hat(t, v, false, inBeat % 2 ? -0.3 : 0.3);
    }
    for (let k = 0; k < 8; k++) hat(T + 1.5 + 0.0625 + k * 0.0625, 0.35 + k * 0.05, false, k % 2 ? 0.4 : -0.4);   // 32nd roll (densify)
    // ---- bar 1: the thread. a pluck snaps on the downbeat, then the note-rate doubles on every 16th (1>2>4>8)
    pluck(T + 0, 74, 1.2, 0, { bend: 7, bendT: 0.06, dec: 0.45, cut: 7000, wet: 0.35 });
    const arp = [74, 81, 77, 86, 74, 77, 81, 84];
    [[0.5, 1], [0.625, 2], [0.75, 4], [0.875, 8]].forEach(([t0, n]) => {
      for (let k = 0; k < n; k++) pluck(T + t0 + k * (0.125 / n), arp[(k + n) % arp.length] - (n > 4 ? 12 : 0), 0.75, (k % 2 ? 0.45 : -0.45), { dec: 0.12, cut: 4800 });
    });
    pluck(T + 1.0, 81, 0.9, 0.35, { bend: -5, bendT: 0.18, dec: 0.5, wet: 0.4 });                 // the white thread swings out (a fifth above)
    // ---- bars 1-2 bass: off-beat pulse, then octave chatter
    for (let s = 0; s < 32; s++) {
      const bar = Math.floor(s / 16), st = s % 16, m = ROOT[bar];
      const on = bar === 0 ? [2, 3, 6, 7, 10, 11, 14, 15].includes(st) : st % 4 !== 0;
      if (on) bass(T + s * 0.125, 0.11, m + (bar === 1 && st % 4 === 3 ? 12 : 0), { cut0: bar ? 2400 : 1500, vel: st % 4 === 2 ? 1 : 0.8 });
    }
    // ---- bar 2: interference (beat rate halves with the moire angle), SIGNAL stab + stretch + stutter
    interference(T + 2.0, T + 3.95, [50, 57, 65], (k) => 8 * Math.pow(2, -k));
    stab(T + 2.5, DM9, 0.32, { vel: 1.1, cut0: 7000, cut1: 1200 });
    stab(T + 3.0, DM9, 0.24, { vel: 0.8, bend: -2, cut0: 4000, cut1: 600 });
    for (let k = 0; k < 4; k++) stab(T + 3.25 + k * 0.0625, DM9, 0.045, { vel: 0.55, cut0: 3000, cut1: 1500, wet: 0.1 });
    stab(T + 3.5, DM9, 0.4, { vel: 1.0, cut0: 6500, cut1: 500, wet: 0.45 });
    // ---- bar 3: contour arpeggio over Bbmaj7, filter opening as the rings close
    const arp3 = [58, 62, 65, 69, 72, 69, 65, 62];
    for (let s = 0; s < 16; s++) pluck(T + 4.0 + s * 0.125, arp3[s % 8], 0.6 + 0.4 * (s % 4 === 0), (s % 2 ? 0.35 : -0.35), { dec: 0.16, cut: 900 + 4500 * (s / 15), cutEnd: 500 });
    for (let s = 0; s < 16; s++) if (s % 4 !== 0) bass(T + 4.0 + s * 0.125, 0.11, ROOT[2] + ([7, 12, 0][s % 3]) * (s % 4 === 3 ? 1 : 0), { cut0: 1200 + 120 * s });
    riser(T + 5.25, T + 6.0, 0.16);
    // ---- bar 4: DIMENSIONAL BREAKTHROUGH - sub drop, wide Gm9, half-time bass, arp continues
    sub(T + 6.0, 1.95, 31, 0.7, 12);
    pad(T + 6.0, 1.95, GM9, { vel: 0.045, cut: 1600, att: 0.08, wet: 0.6 });
    crash(T + 6.0, 0.22, 1.8);
    for (const s of [3, 6, 7, 10, 11, 14, 15]) bass(T + 6.0 + s * 0.125, 0.1, 31 + (s > 9 ? 12 : 0), { cut0: 900, vel: 0.85 });
    const arp4 = [67, 70, 74, 77, 79, 77, 74, 70];
    for (let s = 0; s < 16; s += 2) pluck(T + 6.0 + s * 0.125 + 0.0625, arp4[(s / 2) % 8], 0.55, (s % 4 ? 0.5 : -0.5), { dec: 0.3, cut: 3500, wet: 0.55 });
    riser(T + 7.5, T + 8.0, 0.14);
    // ---- bar 5: SYSTEM - mechanical 16ths, ticks for each projection line, Fmaj9 plucks
    for (let s = 0; s < 16; s++) if (s % 4 !== 0) bass(T + 8.0 + s * 0.125, 0.07, ROOT[4] + (s % 4 === 2 ? 12 : 0), { cut0: 2600, cut1: 400, q: 9, vel: 0.85 });
    for (let k = 0; k < 8; k++) tick(T + 8.95 + k * 0.0625, 3000 + k * 180, 0.9, -0.6 + k * 0.17);
    for (let s = 0; s < 16; s++) tick(T + 8.0 + s * 0.125 + 0.0625, 5200, 0.35, s % 2 ? 0.5 : -0.5);
    for (const b of [16, 17, 18, 19]) stab(T + B(b) + 0.25, FM9, 0.12, { vel: 0.5, cut0: 3800, cut1: 1400, width: 1, wet: 0.2 });
    // the hook: rising three-note figure on the data points
    [[9.0, 77], [9.125, 81], [9.25, 84], [9.5, 81], [9.625, 84], [9.75, 88]].forEach(([tt, m]) => pluck(T + tt, m, 0.7, 0.2, { dec: 0.18, cut: 6000 }));
    // ---- bar 6: LIVING SYSTEM - A7sus4 -> A7, driving 16ths, riser + snare roll into the climax
    for (let s = 0; s < 16; s++) if (s % 4 !== 0) bass(T + 10.0 + s * 0.125, 0.1, ROOT[5] + (s % 4 === 3 ? 12 : 0), { cut0: 1500 + 260 * s, cut1: 380, vel: 0.9 });
    stab(T + 10.0, A7S, 0.2, { vel: 0.7, cut0: 4000, cut1: 1100 });
    stab(T + 11.0, A7, 0.2, { vel: 0.75, cut0: 4500, cut1: 1100 });
    for (let k = 0; k < 16; k++) tick(T + 10.0 + k * 0.125 + 0.0625, 4400 + (k % 4) * 300, 0.4, k % 2 ? 0.6 : -0.6);
    [[10.25, 81], [10.375, 84], [10.5, 88], [11.25, 81], [11.375, 85], [11.5, 88]].forEach(([tt, m]) => pluck(T + tt, m, 0.65, -0.2, { dec: 0.16, cut: 6500 }));
    riser(T + 11.0, T + 12.0, 0.3);
    for (let k = 0; k < 4; k++) clap(T + 11.5 + 0.125 * k + 0.0625, 0.45 + 0.1 * k, 0.15);
    for (let k = 0; k < 8; k++) clap(T + 11.75 + 0.03125 * k, 0.35 + 0.07 * k, 0.12);
    // ---- bar 7: THE CLIMAX - stabs on every beat, distorted 16ths, D minor with octaves, sub, crash
    crash(T + 12.0, 0.4, 2.2);
    sub(T + 12.0, 2.0, 26, 0.75, 12);
    [[12.0, 1.35, 0.5], [12.5, 1.0, 0.3], [13.0, 1.15, 0.36], [13.5, 1.0, 0.3]].forEach(([tt, v, d]) => stab(T + tt, DMC.concat([38]), d, { vel: v, drive: 2.4, cut0: 9000, cut1: 1200, width: 1, wet: 0.35 }));
    for (let s = 0; s < 32; s++) if (s % 4 !== 0) bass(T + 12.0 + s * 0.125, 0.1, ROOT[6] + (s % 4 === 2 ? 12 : 0) + (s >= 24 && s % 4 === 3 ? 3 : 0), { cut0: 3400, cut1: 520, q: 8, vel: 1.05 });
    [[12.25, 86], [12.375, 89], [12.5, 93], [13.25, 86], [13.375, 89], [13.5, 91], [13.75, 93]].forEach(([tt, m]) => pluck(T + tt, m, 0.75, 0.15, { dec: 0.2, cut: 7500, wet: 0.35 }));
    // ---- final half bar: IDENTITY - Bbmaj9#11, stutter into the merge, reverse swell into the loop
    pad(T + 14.0, 0.98, BBM9, { vel: 0.07, cut: 3200, att: 0.01, rel: 0.05, wet: 0.5 });
    stab(T + 14.0, BBM9, 0.42, { vel: 1.0, cut0: 8000, cut1: 1500, wet: 0.55 });
    sub(T + 14.0, 0.98, 34, 0.55);
    for (let k = 0; k < 4; k++) stab(T + 14.75 + k * 0.0625, BBM9.map((m) => m - 12 * (k > 1)), 0.04, { vel: 0.5 - k * 0.07, cut0: 3000, cut1: 2000, wet: 0.15 });
    swell(T + 14.5, T + 15.0, 0.26);
  }
  for (let c = 0; c < NC; c++) compose(c * CYCLE);

  const buf = await ctx.startRendering();
  if (opts.verify) {   // is cycle 3 a sample-exact continuation of cycle 2 in the same way cycle 2 follows cycle 1?
    const N = SR * CYCLE; let dHead = 0, dTail = 0;
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c);
      for (let i = 0; i < SR; i++) dHead = Math.max(dHead, Math.abs(d[2 * N + i] - d[N + i]));
      for (let i = 1; i <= SR; i++) dTail = Math.max(dTail, Math.abs(d[3 * N - i] - d[2 * N - i])); }
    return JSON.stringify({ maxDiffAfterSeam: dHead, maxDiffBeforeSeam: dTail });
  }
  // second cycle, peak-normalised to -1 dBFS, TPDF-dithered 16-bit PCM
  const n = SR * CYCLE, L = buf.getChannelData(0).subarray(n, 2 * n), R = buf.getChannelData(1).subarray(n, 2 * n);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = Math.pow(10, -1 / 20) / (peak || 1);
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); wstr(8, 'WAVE'); wstr(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, SR, true);
  out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); wstr(36, 'data'); out.setUint32(40, n * 4, true);
  const dr = mulberry32(5);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) {
    const x = (c ? R[i] : L[i]) * gain * 32767 + (dr() - dr());
    out.setInt16(44 + (i * 2 + c) * 2, Math.max(-32768, Math.min(32767, Math.round(x))), true);
  }
  window.__audioStats = { peakRaw: peak, gain };
  const bytes = new Uint8Array(out.buffer); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
