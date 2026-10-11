/* =====================================================================
   SOUNDTRACK — original composition, synthesized with OfflineAudioContext.
   120 BPM, 4/4, D minor. 75 s = 37 bars + 1/2 bar. 48 kHz stereo.
   The cycle is rendered after a pre-roll of the previous cycle's last bars,
   so every tail that crosses 75.000 s wraps into the start: the loop is seamless.
   Form: I thread/signal (bars 1-8) · II terrain, drop 1 at 0:20 (9-16) ·
   III system (17-24) · IV network (25-31) · V monument, drop 2 at 1:02, title (32-37½)
   ===================================================================== */
window.renderSoundtrack = async (opts = {}) => {
  const SR = 48000, CYCLE = 75, PRE = 6, NC = opts.verify ? 3 : 2, LEN = CYCLE * NC;
  const ctx = new OfflineAudioContext(2, SR * LEN, SR);
  const rnd = mulberry32(20261011);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const B = (n) => n * 0.5;            // beat -> seconds
  const S16 = (bar, step) => bar * 2 + step * 0.125;

  // ---------------------------------------------------------- shared resources
  const noiseBuf = ctx.createBuffer(2, SR * 6, SR);
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
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(t, (h - Math.floor(h)) * 2.5, dur + 0.05); return s;   // offset <= 2.5 s, dur <= 3.4 s
  }
  function env(param, t, a, peak, d, floor = 0.0001) {
    param.setValueAtTime(0, t); param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(floor, t + a + d); param.linearRampToValueAtTime(0, t + a + d + 0.01);
  }
  function pan(node, p) { const n = ctx.createStereoPanner(); n.pan.value = p; node.connect(n); return n; }

  // ---------------------------------------------------------- instruments
  function kick(t, big = 0) {         // big: 1 = section hit, 0 = normal, < 0 = soft heartbeat
    const soft = big < 0, b = Math.max(0, big);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(soft ? 110 : 180 + b * 40, t);
    o.frequency.exponentialRampToValueAtTime(soft ? 50 : 54, t + (soft ? 0.06 : 0.042));
    o.frequency.exponentialRampToValueAtTime(41 - b * 4, t + 0.32 + b * 0.3);
    const g = G(0); env(g.gain, t, soft ? 0.004 : 0.0015, soft ? 0.95 * -big : 0.95, soft ? 0.5 : 0.40 + b * 0.45);
    o.connect(g); g.connect(kickSat); o.start(t); o.stop(t + 1.0 + b * 0.5);
    if (!soft) {
      const n = noise(t, 0.02), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      const gn = G(0); env(gn.gain, t, 0.0008, 0.35, 0.012); n.connect(hp); hp.connect(gn); gn.connect(kickBus);
    }
    // side-chain duck of tonal bus
    duck.gain.setValueAtTime(soft ? 0.7 : 0.32, t); duck.gain.setTargetAtTime(1, t + 0.012, soft ? 0.12 : 0.065 + b * 0.03);
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
  function ping(t, m, vel = 0.4, p = 0) {       // a data pulse: sine + inharmonic partial
    const f = mtof(m), sum = G(1);
    for (const [ratio, lvl, dec] of [[1, 0.22, 0.16], [2.76, 0.07, 0.05]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * ratio;
      const g = G(0); env(g.gain, t, 0.0008, lvl * vel, dec); o.connect(g); g.connect(sum); o.start(t); o.stop(t + dec + 0.05);
    }
    const out = pan(sum, p); out.connect(synthBus); send(out, verb, 0.35);
  }
  function rumble(t0, t1, lvl = 0.3) {          // tectonic shift: low noise, filter opens and closes
    const n = noise(t0, t1 - t0), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(70, t0); lp.frequency.exponentialRampToValueAtTime(520, t0 + (t1 - t0) * 0.6); lp.frequency.exponentialRampToValueAtTime(90, t1);
    const g = G(0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(lvl, t0 + 0.3);
    g.gain.setValueAtTime(lvl, t1 - 0.4); g.gain.linearRampToValueAtTime(0, t1);
    n.connect(lp); lp.connect(g); g.connect(duck); send(g, verb, 0.25);
  }
  function whoosh(t0, t1, lvl = 0.2) {          // docking: band-passed noise sweeping down
    const n = noise(t0, t1 - t0), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(6000, t0); bp.frequency.exponentialRampToValueAtTime(300, t1);
    const g = G(0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(lvl, t0 + (t1 - t0) * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t1);
    n.connect(bp); bp.connect(g); g.connect(drumBus); send(g, verb, 0.3);
  }
  function swell(t0, t1, lvl = 0.3) {     // reverse cymbal into the downbeat
    const n = noise(t0, t1 - t0), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(2500, t0); hp.frequency.exponentialRampToValueAtTime(7000, t1);
    const g = G(0); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(lvl, t1 - 0.003); g.gain.linearRampToValueAtTime(0, t1);
    n.connect(hp); hp.connect(g); g.connect(drumBus);
  }

  // ---------------------------------------------------------- the score
  const CH = {
    Dm9: { pad: [50, 53, 57, 60, 64], arp: [62, 65, 69, 72, 76], root: 38 },
    Dm: { pad: [50, 57, 62, 65, 69], arp: [62, 65, 69, 74, 77], root: 38 },
    Bb: { pad: [46, 50, 53, 57], arp: [58, 62, 65, 69, 72], root: 34 },
    Bb9: { pad: [46, 53, 57, 60, 62], arp: [58, 62, 65, 69, 72], root: 34 },
    Bb11: { pad: [46, 53, 57, 60, 64], arp: [65, 69, 72, 76, 77], root: 34 },
    Gm9: { pad: [43, 46, 50, 53, 57], arp: [55, 58, 62, 65, 69], root: 31 },
    F: { pad: [41, 45, 48, 52, 55], arp: [53, 57, 60, 64, 67], root: 41 },
    A7s: { pad: [45, 50, 52, 55], arp: [57, 62, 64, 67, 69], root: 33 },
    A7: { pad: [45, 49, 52, 55], arp: [57, 61, 64, 67, 69], root: 33 },
  };
  // one chord (or two, split at beat 3) per bar; index = bar number - 1
  const PLAN = ['Dm9', 'Dm9', 'Bb', 'Gm9', 'Dm9', 'Dm9', 'Bb9', 'A7s|A7',
    'Bb', 'Gm9', 'Dm', 'Bb', 'F', 'Gm9', 'Bb|A7s', 'A7s|A7',
    'F', 'Dm9', 'Bb', 'Gm9', 'A7s|A7', 'Dm', 'Bb', 'Gm9|A7',
    'Dm9', 'Bb', 'F', 'Gm9', 'Bb9', 'A7s', 'A7',
    'Dm', 'Bb', 'Gm9', 'A7s|A7', 'Bb11', 'Bb11', 'Bb11'];
  const chordAt = (bar, beat = 0) => { const p = PLAN[bar].split('|'); return CH[p.length > 1 && beat >= 2 ? p[1] : p[0]]; };
  // tonal master filter (melt, fly-through dip); everything tonal passes through it
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.Q.value = 0.9; tone.frequency.value = 20000;
  duck.disconnect(); duck.connect(tone); tone.connect(master);
  let MIN = -1e9;                                      // events before MIN are skipped (pre-roll cycle)
  const EV = [];                                       // [time, fn]: created just in time while rendering (see below)

  function compose(T) {
    const at = (x) => T + x, ok = (x) => T + x >= MIN;
    const play = (x, fn) => { if (ok(x)) EV.push([at(x), fn]); };
    // ---------------- drums
    const KICK = (bar, beat) => {
      if (bar <= 6) return true;
      if (bar === 7) return beat < 3;
      if (bar === 8 || bar === 9) return false;
      if (bar >= 10 && bar <= 14) return true;
      if (bar === 15) return beat === 0 || beat === 2;
      if (bar >= 16 && bar <= 18) return true;
      if (bar === 19) return false;                   // fly-through: the floor drops away
      if (bar >= 20 && bar <= 29) return true;
      if (bar === 30) return beat < 2;
      if (bar >= 31 && bar <= 33) return true;
      if (bar === 34) return beat < 3;
      return false;
    };
    const BIG = [0, 40, 68, 96, 124];                 // 0:00, drop 1, explode, the city, drop 2
    for (let b = 0; b < 150; b++) {
      const bar = Math.floor(b / 4), beat = b % 4;
      if (KICK(bar, beat)) play(B(b), (t) => kick(t, BIG.includes(b) ? 1 : 0));
      else if (bar === 35 || bar === 36) play(B(b), (t) => kick(t, -0.45));  // heartbeat under the title's ring ripples
    }
    const CLAP = (bar) => (bar >= 2 && bar <= 6) || (bar >= 10 && bar <= 14) || (bar >= 16 && bar <= 18) || (bar >= 20 && bar <= 29) || (bar >= 31 && bar <= 33);
    for (let b = 1; b < 150; b += 2) { const bar = Math.floor(b / 4); if (CLAP(bar)) play(B(b), (t) => clap(t, bar >= 31 ? 1.08 : 1, (bar === 6 || bar === 33) ? 0.35 : 0.22)); }
    for (let s = 0; s < 600; s++) {
      const bar = Math.floor(s / 16), st = s % 16, inBeat = s % 4, x = s * 0.125;
      if (bar === 0 || bar >= 35) continue;
      const quiet = bar === 8 || bar === 9 || bar === 19;
      if (quiet && inBeat !== 2) continue;
      if (bar === 15 && st >= 8 && inBeat !== 2) continue;
      if (bar === 30 && st >= 4) continue;
      const v = [0.45, 0.22, 0.8, 0.3][inBeat] * (bar >= 31 ? 1.15 : 1) * (quiet ? 0.55 : 1);
      const open = inBeat === 2 && bar >= 2 && bar !== 3 && !quiet && bar !== 15;
      play(x, (t) => hat(t, open ? 0.7 : v, open, inBeat % 2 ? -0.3 : 0.3));
    }
    for (const x0 of [3.5, 7.5, 47.5]) for (let k = 0; k < 8; k++) play(x0 + 0.0625 + k * 0.0625, (t) => hat(t, 0.35 + k * 0.05, false, k % 2 ? 0.4 : -0.4));   // 32nd rolls
    // snare rolls into the drops / the title
    for (const [x0, x1] of [[19.5, 20.0], [61.0, 62.0], [69.5, 70.0]]) {
      const n = Math.round((x1 - x0) / 0.0625);
      for (let k = 0; k < n; k++) { const f = k / n; play(x0 + k * 0.0625 + (f > 0.5 ? 0 : 0.03125), (t) => clap(t, 0.3 + 0.45 * f, 0.12)); }
    }
    // ---------------- bass: off-beat 16ths on the bar's root; octave chatter on beat 4 of a beat
    const BASS = (bar) => !(bar === 0 || bar === 8 || bar === 9 || bar === 19 || bar >= 35);
    for (let s = 0; s < 600; s++) {
      const bar = Math.floor(s / 16), st = s % 16; if (!BASS(bar)) continue;
      const beat = Math.floor(st / 4), C = chordAt(bar, beat), m = C.root, x = s * 0.125;
      if (bar === 10) { if ([3, 6, 7, 10, 11, 14, 15].includes(st)) play(x, (t) => bass(t, 0.1, m + (st > 9 ? 12 : 0), { cut0: 900, vel: 0.9 })); continue; }   // drop 1: half-time
      if (bar === 12) { if (st % 4 !== 0) play(x, (t) => bass(t, 0.11, m + (st % 4 === 3 ? 12 : 0), { cut0: 1600, glide: st % 8 === 1 ? m - 5 : 0 })); continue; }   // the drape: glides
      if (bar === 15 && st >= 8) continue;
      if (bar === 30 && st >= 8) continue;
      if (st % 4 === 0) continue;
      const net = bar >= 24 && bar <= 29;
      const oct = net ? (st % 4 === 2 ? 12 : st % 4 === 3 ? 7 : 0) : (st % 4 === 3 ? 12 : 0);
      const climax = bar >= 31 && bar <= 34;
      play(x, (t) => bass(t, net ? 0.08 : 0.1, m + oct + (climax && st >= 12 && st % 4 === 3 ? 3 : 0),
        { cut0: climax ? 3400 : bar >= 16 && bar <= 23 ? 2600 : 1500 + 60 * st, cut1: climax ? 520 : 380, q: climax || bar === 16 ? 8 : 7, vel: (st % 4 === 2 ? 1 : 0.8) * (climax ? 1.05 : 1) }));
    }

    // ================= I · THREAD -> SIGNAL (bars 1-8)
    // bar 1: a pluck on every whip; the sub holds the floor
    [[0, 74, 0], [0.5, 69, -0.5], [1.0, 81, 0.5], [1.5, 77, 0]].forEach(([x, m, p], i) => play(x, (t) => pluck(t, m, i ? 0.95 : 1.2, p, { bend: i ? 5 : 7, bendT: 0.06, dec: i ? 0.3 : 0.45, cut: 7000, wet: 0.35 })));
    play(0, (t) => sub(t, 1.95, 26, 0.5));
    // bars 2 and 4: binary splits on 16ths -> note rate doubles (1, 2, 4, 8)
    const split = (x0, ch, lift = 0) => [[0, 1], [0.125, 2], [0.25, 4], [0.375, 8]].forEach(([dx, n]) => {
      for (let k = 0; k < n; k++) play(x0 + dx + k * (0.125 / n), (t) => pluck(t, ch.arp[(k + n) % ch.arp.length] + lift - (n > 4 ? 12 : 0), 0.75, (k % 2 ? 0.45 : -0.45), { dec: 0.12, cut: 4800 }));
    });
    split(2.0, CH.Dm9); split(6.0, CH.Gm9, 12);
    for (const x0 of [2.5, 6.5]) { const ch = x0 < 4 ? CH.Dm9 : CH.Gm9; for (let s = 0; s < 12; s++) play(x0 + s * 0.125, (t) => pluck(t, ch.arp[s % 5], 0.5 + 0.3 * (s % 4 === 0), s % 2 ? 0.35 : -0.35, { dec: 0.12, cut: 1800 + 260 * s, cutEnd: 500 })); }
    // bar 3: the scissor — the white family swings out a fifth above; the weave front
    play(4.0, (t) => pluck(t, 81, 0.95, 0.35, { bend: -5, bendT: 0.18, dec: 0.5, wet: 0.4 }));
    for (let s = 0; s < 16; s++) play(4.0 + s * 0.125, (t) => pluck(t, CH.Bb.arp[s % 5], 0.55 + 0.35 * (s % 4 === 0), (s % 2 ? 0.35 : -0.35), { dec: 0.15, cut: 900 + 4500 * (s / 15), cutEnd: 500 }));
    play(7.25, (t) => riser(t, t + 0.75, 0.16));
    // bar 5: the ratchet — interference pad, beat frequency halves with every 16th
    play(8.0, (t) => interference(t, t + 1.95, [50, 57, 65], (k) => 8 * Math.pow(2, -k)));
    // bar 6: SIGNAL — stab, stretch-bend, comb-split stutter, rebuild
    play(10.5, (t) => stab(t, CH.Dm9.pad, 0.32, { vel: 1.1, cut0: 7000, cut1: 1200 }));
    play(11.0, (t) => stab(t, CH.Dm9.pad, 0.24, { vel: 0.8, bend: -2, cut0: 4000, cut1: 600 }));
    for (let k = 0; k < 4; k++) play(11.25 + k * 0.0625, (t) => stab(t, CH.Dm9.pad, 0.045, { vel: 0.55, cut0: 3000, cut1: 1500, wet: 0.1 }));
    play(11.5, (t) => stab(t, CH.Dm9.pad, 0.4, { vel: 1.0, cut0: 6500, cut1: 500, wet: 0.45 }));
    // bar 7: relief — gated chords on 8ths, letters rising left to right (filter opens), pad swell
    for (let k = 0; k < 8; k++) play(12.0 + k * 0.25, (t) => stab(t, CH.Bb9.pad, 0.16, { vel: 0.55 + 0.05 * k, cut0: 1500 + 900 * k, cut1: 700, wet: 0.3 }));
    play(12.0, (t) => pad(t, 2.0, CH.Bb9.pad, { vel: 0.04, cut: 1800, att: 0.6, wet: 0.6 }));
    // bar 8: the melt — the tonal filter dives; riser into the stretch
    if (ok(14.0)) { tone.frequency.setValueAtTime(20000, at(14.0)); tone.frequency.exponentialRampToValueAtTime(420, at(15.2)); }
    play(14.0, (t) => pad(t, 2.0, CH.A7s.pad, { vel: 0.05, cut: 2600, att: 0.1, wet: 0.55 }));
    play(15.0, (t) => riser(t, t + 1.0, 0.18));

    // ================= II · TERRAIN (bars 9-16)
    // bars 9-10: no drums — the stretch. Arpeggios open with the filter; a drone holds the floor
    if (ok(16.0)) { tone.frequency.setValueAtTime(420, at(16.0)); tone.frequency.exponentialRampToValueAtTime(20000, at(19.8)); }
    play(16.0, (t) => sub(t, 3.95, 34, 0.28));
    play(16.0, (t) => pad(t, 2.0, CH.Bb.pad, { vel: 0.035, cut: 2400, att: 0.4, wet: 0.65 }));
    play(18.0, (t) => pad(t, 2.0, CH.Gm9.pad, { vel: 0.035, cut: 2800, att: 0.2, wet: 0.65 }));
    for (let s = 0; s < 32; s++) { const ch = s < 16 ? CH.Bb : CH.Gm9; play(16.0 + s * 0.125, (t) => pluck(t, ch.arp[(s * 2) % 5] + (s % 8 >= 6 ? 12 : 0), 0.45 + 0.3 * (s % 4 === 0), (s % 2 ? 0.45 : -0.45), { dec: 0.18, cut: 700 + 160 * s, cutEnd: 450, wet: 0.45 })); }
    play(19.0, (t) => riser(t, t + 0.6, 0.12));                 // the index sweep
    play(18.5, (t) => riser(t, t + 1.5, 0.26));
    play(19.75, (t) => swell(t, t + 0.25, 0.22));
    // bar 11: DROP 1 — extrusion. Sub drop, crash, wide pad
    play(20.0, (t) => { sub(t, 1.95, 26, 0.72, 12); crash(t, 0.32, 2.0); pad(t, 1.95, CH.Dm.pad, { vel: 0.05, cut: 1700, att: 0.06, wet: 0.6 }); stab(t, CH.Dm.pad, 0.5, { vel: 1.1, drive: 2.0, cut0: 8000, cut1: 900, wet: 0.45 }); });
    for (let s = 0; s < 16; s += 2) play(20.0 + s * 0.125 + 0.0625, (t) => pluck(t, CH.Dm.arp[(s / 2) % 5], 0.55, (s % 4 ? 0.5 : -0.5), { dec: 0.3, cut: 3500, wet: 0.55 }));
    // bars 12-15: groove with arps; the drape glides; the tectonic rumble
    for (let s = 0; s < 64; s++) {
      const bar = 11 + Math.floor(s / 16), st = s % 16, ch = chordAt(bar, Math.floor(st / 4));
      if (bar === 13 && st < 12) continue;                      // the shift: arps give way to the rumble
      if (st % 2 === 0) play(22.0 + s * 0.125 + 0.0625, (t) => pluck(t, ch.arp[(st / 2 + bar) % 5] + (st >= 12 ? 12 : 0), 0.5, (st % 4 ? 0.45 : -0.45), { dec: 0.22, cut: 3000 + 120 * st, wet: 0.45 }));
    }
    play(26.0, (t) => { rumble(t, t + 1.8, 0.3); stab(t, CH.Gm9.pad, 1.6, { vel: 0.6, bend: -1, cut0: 2600, cut1: 380, att: 0.25, wet: 0.6, drive: 2 }); });
    play(28.0, (t) => pad(t, 1.95, CH.Bb.pad, { vel: 0.045, cut: 2600, att: 0.3, wet: 0.55 }));
    play(29.0, (t) => riser(t, t + 1.0, 0.22));
    play(30.0, (t) => { stab(t, CH.A7s.pad, 0.3, { vel: 0.8, cut0: 5000, cut1: 900, wet: 0.5 }); sub(t, 0.95, 33, 0.5); });
    // bar 16: the terraces fall; one tick per projection line; the interface assembles
    for (let k = 0; k < 8; k++) play(30.95 + k * 0.0625, (t) => tick(t, 3000 + k * 180, 0.9, -0.6 + k * 0.17));
    play(31.0, (t) => { stab(t, CH.A7.pad, 0.2, { vel: 0.75, cut0: 4500, cut1: 1100 }); pad(t, 1.0, CH.A7.pad, { vel: 0.03, cut: 2200, att: 0.15, rel: 0.1, wet: 0.6 }); });
    for (let k = 0; k < 6; k++) play(31.05 + k * 0.04, (t) => tick(t, 4200 + k * 240, 0.6, 0.4));
    play(31.25, (t) => riser(t, t + 0.75, 0.2));

    // ================= III · SYSTEM (bars 17-24)
    // bar 17: mechanical groove on F, a tick on every 16th off-beat, the rising hook
    for (let s = 0; s < 16; s++) play(32.0 + s * 0.125 + 0.0625, (t) => tick(t, 5200, 0.35, s % 2 ? 0.5 : -0.5));
    for (const b of [64, 65, 66, 67]) play(B(b) + 0.25, (t) => stab(t, CH.F.pad, 0.12, { vel: 0.5, cut0: 3800, cut1: 1400, width: 1, wet: 0.2 }));
    const hook = (x0, ms, p = 0.2) => ms.forEach(([dx, m]) => play(x0 + dx, (t) => pluck(t, m, 0.7, p, { dec: 0.18, cut: 6000 })));
    hook(33.0, [[0, 77], [0.125, 81], [0.25, 84], [0.5, 81], [0.625, 84], [0.75, 88]]);
    // bar 18: EXPLODE
    play(34.0, (t) => { crash(t, 0.36, 2.2); sub(t, 1.9, 26, 0.7, 14); stab(t, CH.Dm9.pad.concat([38]), 0.55, { vel: 1.2, drive: 2.2, cut0: 9000, cut1: 900, width: 1, wet: 0.5 }); riser(t, t + 0.8, 0.1); });
    for (let s = 0; s < 16; s++) play(34.0 + s * 0.125 + 0.0625, (t) => tick(t, 4400 + (s % 4) * 300, 0.4, s % 2 ? 0.6 : -0.6));
    // bar 19: the section jumps north, then south; the letter drum rolls
    hook(36.0, [[0, 81], [0.125, 84], [0.25, 88]], -0.3); hook(37.0, [[0, 77], [0.125, 74], [0.25, 69]], 0.3);
    for (const x0 of [36.0, 37.0]) for (let k = 0; k < 5; k++) play(x0 + k * 0.03, (t) => tick(t, 3600 + k * 300, 0.6, 0.6));
    for (let s = 0; s < 16; s++) play(36.0 + s * 0.125 + 0.0625, (t) => tick(t, 5200, 0.3, s % 2 ? 0.5 : -0.5));
    // bar 20: fly-through — no floor, the tonal filter dips and returns; a slow Gm9 pad
    if (ok(38.0)) { tone.frequency.setValueAtTime(20000, at(38.0)); tone.frequency.exponentialRampToValueAtTime(650, at(38.6)); tone.frequency.setValueAtTime(650, at(39.3)); tone.frequency.exponentialRampToValueAtTime(20000, at(40.0)); }
    play(38.0, (t) => { pad(t, 2.0, CH.Gm9.pad, { vel: 0.06, cut: 3000, att: 0.3, wet: 0.7 }); sub(t, 1.95, 31, 0.45); });
    for (let s = 0; s < 16; s++) play(38.0 + s * 0.125, (t) => pluck(t, CH.Gm9.arp[s % 5] + 12, 0.45, (s % 2 ? 0.6 : -0.6), { dec: 0.25, cut: 5000, wet: 0.6 }));
    play(39.5, (t) => swell(t, t + 0.5, 0.2));
    // bar 21: the chart hinges up (A7sus4), A7 a beat later
    play(40.0, (t) => stab(t, CH.A7s.pad, 0.28, { vel: 0.85, cut0: 5000, cut1: 1100, wet: 0.4 }));
    play(41.0, (t) => stab(t, CH.A7.pad, 0.28, { vel: 0.9, cut0: 5000, cut1: 1100, wet: 0.4 }));
    hook(40.25, [[0, 81], [0.125, 84], [0.25, 88]]); hook(41.25, [[0, 81], [0.125, 85], [0.25, 88]], -0.2);
    // bar 22: the scan — a stab on every section step, letter drum spinning
    [42.0, 42.125, 42.25, 42.375].forEach((x, i) => play(x, (t) => stab(t, CH.Dm.pad.map((m) => m + [0, 2, 3, 5][i]), 0.1, { vel: 0.75, cut0: 6000, cut1: 1500, wet: 0.2 })));
    play(43.0, (t) => stab(t, CH.Dm.pad, 0.3, { vel: 0.85, cut0: 6000, cut1: 900, wet: 0.4 }));
    play(43.0, (t) => riser(t, t + 1.0, 0.2));
    // bar 23: panels dock; the map splits 1 -> 32 on 16ths (the thread's motif returns)
    play(44.35, (t) => whoosh(t, t + 0.65, 0.22));
    [[0, 1], [0.125, 2], [0.25, 4], [0.375, 8], [0.5, 16]].forEach(([dx, n]) => {
      for (let k = 0; k < n; k++) play(45.0 + dx + k * (0.125 / n), (t) => pluck(t, CH.Bb.arp[(k + n) % 5] + 12 - (n > 4 ? 12 : 0) - (n > 8 ? 12 : 0), 0.7, (k % 2 ? 0.5 : -0.5), { dec: 0.1, cut: 5000 }));
    });
    // bar 24: the streets open; riser into the city
    for (let s = 0; s < 16; s++) play(46.0 + s * 0.125, (t) => pluck(t, chordAt(23, Math.floor(s / 4)).arp[s % 5], 0.45 + 0.03 * s, s % 2 ? 0.4 : -0.4, { dec: 0.14, cut: 1500 + 300 * s }));
    play(46.5, (t) => riser(t, t + 1.5, 0.28));
    play(47.75, (t) => swell(t, t + 0.25, 0.2));

    // ================= IV · NETWORK (bars 25-31)
    play(48.0, (t) => { crash(t, 0.3, 2.0); sub(t, 1.95, 26, 0.65, 12); pad(t, 1.95, CH.Dm9.pad, { vel: 0.04, cut: 2000, att: 0.05, wet: 0.6 }); });
    for (let k = 0; k < 12; k++) play(48.0 + k * 0.0625, (t) => pluck(t, CH.Dm9.arp[k % 5] + 12 * Math.floor(k / 5), 0.55, -0.6 + k * 0.1, { dec: 0.12, cut: 6000 }));   // the towers rise, centre out
    // the sequence: a 16th arp that the data pulses ride (bars 26-29); pings on every launch
    for (let s = 0; s < 96; s++) {
      const x = 50.0 + s * 0.125, bar = Math.floor(x / 2), st = s % 16, ch = chordAt(bar, Math.floor(st / 4));
      const down = x >= 56.0;                                         // converge: the figure runs downhill
      const idx = down ? 4 - (st % 5) : st % 5;
      play(x, (t) => pluck(t, ch.arp[idx] + (st % 8 >= 6 ? 12 : 0), 0.4 + 0.25 * (st % 4 === 0) + (x >= 52 ? 0.08 : 0), (st % 2 ? 0.5 : -0.5), { dec: 0.1, cut: 2500 + 2500 * ((s % 32) / 31), wet: 0.3 }));
      if (x >= 50.5 && x < 57.0 && st % 2 === 1) play(x + 0.0625, (t) => ping(t, 96 + (st % 3) * 3, 0.35, st % 4 === 1 ? 0.7 : -0.7));
    }
    for (let k = 0; k < 8; k++) play(52.0 + k * 0.03, (t) => tick(t, 3800 + k * 200, 0.5, -0.5));        // labels roll in
    for (let k = 0; k < 6; k++) play(54.0 + k * 0.375, (t) => ping(t, 93 + [0, 3, 5, 7, 10, 12][k], 0.55, k % 2 ? 0.6 : -0.6));   // 3 over 4: the activation wave
    play(56.0, (t) => pad(t, 2.0, CH.Bb9.pad, { vel: 0.06, cut: 3200, att: 1.2, rel: 0.1, wet: 0.6 }));
    // bar 30: reassembly — towers lower, streets close, 32 -> 1 merges with halving stutters
    play(58.0, (t) => { stab(t, CH.A7s.pad, 0.5, { vel: 0.8, bend: -1, cut0: 4500, cut1: 600, wet: 0.45 }); });
    [59.3, 59.425, 59.55, 59.675, 59.8].forEach((x, i) => play(x, (t) => stab(t, CH.A7s.pad.map((m) => m + 12 - 3 * i), 0.06 + 0.02 * i, { vel: 0.7 - 0.06 * i, cut0: 5000 - 700 * i, cut1: 1400, wet: 0.2 })));
    // bar 31: the camera holds; section scan on 16ths; the roll into drop 2
    play(60.0, (t) => { stab(t, CH.A7.pad, 0.25, { vel: 0.8, cut0: 5000, cut1: 1100, wet: 0.45 }); sub(t, 1.95, 33, 0.45); });
    [60.5, 60.625, 60.75, 60.875].forEach((x, i) => play(x, (t) => tick(t, 2600 + i * 500, 1.0, -0.4 + i * 0.27)));
    play(60.5, (t) => riser(t, t + 1.5, 0.32));
    play(61.75, (t) => swell(t, t + 0.25, 0.26));

    // ================= V · MONUMENT + IDENTITY (bars 32-37½)
    play(62.0, (t) => { crash(t, 0.42, 2.4); sub(t, 1.95, 26, 0.8, 12); });
    for (let bar = 31; bar <= 33; bar++) {
      const ch = chordAt(bar), x0 = bar * 2, stabs = bar === 31 ? [[0, 1.35, 0.5], [0.5, 1.0, 0.3], [1.0, 1.15, 0.36], [1.5, 1.0, 0.3]] : [[0, 1.15, 0.36], [1.0, 1.05, 0.3]];
      stabs.forEach(([dx, v, d]) => play(x0 + dx, (t) => stab(t, (ch === CH.Dm ? CH.Dm.pad : ch.pad.map((m) => m + 12)).concat([ch.root]), d, { vel: v, drive: 2.4, cut0: 9000, cut1: 1200, width: 1, wet: 0.35 })));
      if (bar > 31) play(x0, (t) => sub(t, 1.95, ch.root - 12, 0.6));
    }
    play(62.5, (t) => stab(t, [50, 57, 62, 65, 69, 74], 0.3, { vel: 1.2, drive: 2.6, cut0: 10000, cut1: 1500, width: 1, wet: 0.3 }));   // the slam
    const LEAD = [[0.25, 86], [0.375, 89], [0.5, 93], [1.25, 86], [1.375, 89], [1.5, 91], [1.75, 93]];
    for (let bar = 31; bar <= 33; bar++) LEAD.forEach(([dx, m]) => play(bar * 2 + dx, (t) => pluck(t, m - (bar === 32 ? 4 : bar === 33 ? 7 : 0), 0.75, 0.15, { dec: 0.2, cut: 7500, wet: 0.35 })));
    // bar 35: the heights compress as the view rises to plan
    play(68.0, (t) => { stab(t, CH.A7s.pad.map((m) => m + 12), 0.4, { vel: 0.9, cut0: 6000, cut1: 900, wet: 0.5 }); sub(t, 0.95, 33, 0.55); });
    play(69.0, (t) => { stab(t, CH.A7.pad.map((m) => m + 12), 0.4, { vel: 0.95, cut0: 6000, cut1: 900, wet: 0.5 }); sub(t, 0.95, 33, 0.55); });
    play(68.6, (t) => riser(t, t + 1.4, 0.26));
    // bars 36-37: ISOLINE — Bbmaj9#11 held; the rings breathe on every beat; the subtitle rolls in and out
    play(70.0, (t) => { pad(t, 4.45, CH.Bb11.pad, { vel: 0.045, cut: 3200, att: 0.01, rel: 0.4, wet: 0.55 }); stab(t, CH.Bb11.pad, 0.6, { vel: 1.0, cut0: 8000, cut1: 1500, wet: 0.6 }); sub(t, 4.45, 34, 0.32); crash(t, 0.22, 2.6); });
    for (let b = 140; b < 149; b++) play(B(b), (t) => ping(t, [77, 81, 84, 88][(b - 140) % 4] + 12, 0.22, (b % 2 ? 0.5 : -0.5)));
    for (let k = 0; k < 10; k++) play(70.5 + k * 0.05, (t) => tick(t, 3200 + k * 160, 0.45, -0.7 + k * 0.15));
    for (let k = 0; k < 10; k++) play(73.0 + k * 0.04, (t) => tick(t, 4800 - k * 160, 0.4, 0.7 - k * 0.15));
    // final half bar: rings contract, stripes, stutter-merge 16 -> 1, reverse swell into the loop
    play(74.0, (t) => stab(t, CH.Bb11.pad, 0.42, { vel: 0.9, cut0: 8000, cut1: 1500, wet: 0.55 }));
    for (let k = 0; k < 4; k++) play(74.75 + k * 0.0625, (t) => stab(t, CH.Bb11.pad.map((m) => m - 12 * (k > 1)), 0.04, { vel: 0.5 - k * 0.07, cut0: 3000, cut1: 2000, wet: 0.15 }));
    play(74.5, (t) => swell(t, t + 0.5, 0.26));
  }
  // pre-roll: the last bars of the previous cycle (their tails cross the seam), then the kept cycle(s)
  for (let c = 0; c < NC; c++) { MIN = c === 0 ? (CYCLE - PRE) : -1e9; compose(c * CYCLE); }
  // Just-in-time graph: every event's nodes are created at least LEAD seconds before it sounds, at deterministic
  // suspend points. A graph built all at once would keep tens of thousands of idle nodes alive for the whole render.
  EV.sort((a, b) => a[0] - b[0]);
  const STEP = 1, LEAD = 0.5;
  let cur = 0;
  const upTo = (tEnd) => { while (cur < EV.length && EV[cur][0] < tEnd) { const [t, fn] = EV[cur++]; fn(t); } };
  upTo(STEP + LEAD);
  for (let k = 1; k * STEP < LEN; k++) ctx.suspend(k * STEP).then(() => { upTo((k + 1) * STEP + LEAD); ctx.resume(); });

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
