// Boot the film page. window.renderFrame(n) draws frame n from n alone.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FPS, FOV, LENS_SHIFT } from './config.js';
import { cameraAt, yearAt, yearFloatAt, lineAt, CENTERS, RADII } from './path.js';
import { buildBodies, updateBodies } from './scene.js';
import { buildWorks, updateWorks } from './built.js';

const params = new URLSearchParams(location.search);
const W = Number(params.get('w') || 1920), H = Number(params.get('h') || 1080);
const SHUTTER = 0.5; // frames: star streaks cover half a frame, like a 180-degree shutter

const canvas = document.getElementById('c');
canvas.width = W; canvas.height = H;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0, 0, 0);
const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.01, 30000);
const prevCamera = camera.clone();

const target = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, target);
composer.setPixelRatio(1);
composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.32, 0.18, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const loader = new THREE.TextureLoader();
function tex(url, srgb) {
  return new Promise((resolve, reject) => {
    loader.load(url, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      resolve(t);
    }, undefined, reject);
  });
}

const yearEl = document.getElementById('year');
const lineEl = document.getElementById('line');
const res = new THREE.Vector2(W, H);
let bodies, works;

function placeCamera(cam, t) {
  const c = cameraAt(t);
  cam.position.copy(c.pos);
  cam.quaternion.copy(c.quat);
  // keep the depth range tight around what is near
  let near = Infinity;
  for (const b of ['earth', 'moon', 'mars']) near = Math.min(near, c.pos.distanceTo(CENTERS[b]) - RADII[b] * 1.05);
  cam.near = Math.min(Math.max(near * 0.3, 0.002), 40);
  cam.far = 30000;
  cam.updateProjectionMatrix();
  // lens shift: the point we aim at sits up and to the right of centre
  cam.projectionMatrix.elements[8] = -LENS_SHIFT.x;
  cam.projectionMatrix.elements[9] = -LENS_SHIFT.y;
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  cam.updateMatrixWorld(true);
}

function overlay(t) {
  yearEl.textContent = String(yearAt(t));
  const l = lineAt(t);
  lineEl.textContent = l.line;
  lineEl.style.opacity = l.alpha.toFixed(3);
}

window.renderFrame = (n) => {
  const t = n / FPS;
  placeCamera(camera, t);
  placeCamera(prevCamera, Math.max(0, t - SHUTTER / FPS));
  const year = yearFloatAt(t);
  updateBodies(bodies, t, camera, prevCamera, res);
  updateWorks(works, t, year, camera, res);
  composer.render();
  overlay(t);
  renderer.getContext().finish();
  return { t, year: yearAt(t) };
};

window.__ready = (async () => {
  const [earthDay, earthNight, moonColor, moonNormal, marsColor] = await Promise.all([
    tex('tex/earth_day_8k.jpg', true), tex('tex/earth_night_8k.jpg', true),
    tex('tex/moon_color_4k.jpg', true), tex('tex/moon_normal_2k.png', false), tex('tex/mars_color_4k.jpg', true),
  ]);
  bodies = buildBodies(scene, { earthDay, earthNight, moonColor, moonNormal, marsColor });
  works = buildWorks(scene);
  await document.fonts.ready;
  await Promise.all([document.fonts.load('300 100px "Alegreya Sans"'), document.fonts.load('400 40px "Alegreya Sans SC"')]);
  // compile everything once so the first real frame is not special
  window.renderFrame(0);
  return { w: W, h: H, maxTex: renderer.capabilities.maxTextureSize };
})();
