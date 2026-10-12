// Numeric check of the camera path, frame by frame: turn rate, body sizes,
// whether the subject is cut by the frame, distance to bodies, year and line.
// Writes out/path_report.json and prints a summary.
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { FPS, FRAMES, FOV, LENS_SHIFT, STOPS, OPENING } from '../web/film/config.js';
import { cameraAt, CENTERS, RADII, SEGMENTS, yearAt, lineAt } from '../web/film/path.js';

const outDir = path.resolve(process.argv[2] || 'out');
fs.mkdirSync(outDir, { recursive: true });

const cam = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.001, 1e6);
const tanHalf = Math.tan((FOV / 2) * Math.PI / 180);
const rows = [];
let prevQ = null, prevPos = null;
for (let f = 0; f < FRAMES; f++) {
  const t = f / FPS;
  const c = cameraAt(t);
  cam.position.copy(c.pos); cam.quaternion.copy(c.quat); cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  cam.projectionMatrix.elements[8] = -LENS_SHIFT.x; cam.projectionMatrix.elements[9] = -LENS_SHIFT.y;
  const row = { f, t, rot: prevQ ? (2 * Math.acos(Math.min(1, Math.abs(prevQ.dot(c.quat))))) * 180 / Math.PI : 0,
    speed: prevPos ? prevPos.distanceTo(c.pos) * FPS : 0, S: c.S, year: yearAt(t), line: lineAt(t) };
  for (const b of ['earth', 'moon', 'mars']) {
    const d = c.pos.distanceTo(CENTERS[b]);
    const ang = Math.asin(Math.min(1, RADII[b] / d));
    const ndc = CENTERS[b].clone().project(cam);
    const view = CENTERS[b].clone().applyMatrix4(cam.matrixWorldInverse);
    const inFront = view.z < 0;
    const rY = Math.tan(ang) / tanHalf; // radius in NDC y units
    const rX = rY * 9 / 16;
    row[b] = { d, diamPx: 2 * rY * 540, x: ndc.x, y: ndc.y, inFront,
      cut: inFront && (ndc.x - rX < -1 || ndc.x + rX > 1 || ndc.y - rY < -1 || ndc.y + rY > 1) &&
        (ndc.x + rX > -1 && ndc.x - rX < 1 && ndc.y + rY > -1 && ndc.y - rY < 1) };
  }
  rows.push(row);
  prevQ = c.quat.clone(); prevPos = c.pos.clone();
}
fs.writeFileSync(path.join(outDir, 'path_report.json'), JSON.stringify({ rows, segments: SEGMENTS }, null, 0));

console.log('moves:');
for (const s of SEGMENTS) if (s.type === 'move') console.log(`  ${s.t0.toFixed(1)}-${s.t1.toFixed(1)}s ${s.from}->${s.to} dS=${(s.S1 - s.S0).toFixed(2)} va=${s.va.toFixed(3)} vb=${s.vb.toFixed(3)} A=${s.A.toFixed(3)}`);
console.log('holds:');
for (const s of SEGMENTS) if (s.type === 'hold') console.log(`  ${s.t0.toFixed(1)}-${s.t1.toFixed(1)}s v=${s.v.toFixed(3)} rad/s`);
const maxRot = rows.reduce((m, r) => (r.rot > m.rot ? r : m), rows[0]);
console.log(`max turn: ${maxRot.rot.toFixed(3)} deg/frame (${(maxRot.rot * FPS).toFixed(1)} deg/s) at t=${maxRot.t.toFixed(2)}`);
let maxJerk = { v: 0, t: 0 };
for (let i = 2; i < rows.length; i++) {
  const d = Math.abs(rows[i].rot - 2 * rows[i - 1].rot + rows[i - 2].rot);
  if (d > maxJerk.v) maxJerk = { v: d, t: rows[i].t };
}
console.log(`max change of turn rate: ${maxJerk.v.toFixed(4)} deg/frame^2 at t=${maxJerk.t.toFixed(2)}`);
for (const b of ['earth', 'moon', 'mars']) {
  const minD = rows.reduce((m, r) => Math.min(m, r[b].d / RADII[b]), Infinity);
  console.log(`closest to ${b}: ${minD.toFixed(2)} radii`);
}
for (const [i, s] of STOPS.entries()) {
  const at = rows[Math.round(s.t * FPS)], mid = rows[Math.round((s.t + s.hold / 2) * FPS)];
  const b = mid[s.body];
  console.log(`stop ${i + 1} ${s.id}: year@arrive=${at.year} diam=${b.diamPx.toFixed(0)}px (${(b.diamPx / 1080 * 100).toFixed(0)}% of height) at ndc (${b.x.toFixed(2)},${b.y.toFixed(2)}) cut=${b.cut}`);
}
const cuts = rows.filter((r) => ['earth', 'moon', 'mars'].some((b) => r[b].cut && r[b].diamPx > 40));
console.log(`frames with a body (>40px) cut by the frame edge: ${cuts.length}` + (cuts.length ? ` e.g. t=${cuts[0].t.toFixed(2)}..${cuts[cuts.length - 1].t.toFixed(2)}` : ''));
console.log('year ticks:', rows.filter((r, i) => i > 0 && r.year !== rows[i - 1].year).map((r) => `${r.year}@${r.t.toFixed(2)}`).join(' '));
