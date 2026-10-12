// Which point of a body is under a given spot on screen at time t?
//   node tools/calib.mjs <t> <ndcX> <ndcY> <body>  -> world direction from the body centre
import * as THREE from 'three';
import { cameraAt, CENTERS, RADII } from '../web/film/path.js';
import { FOV, LENS_SHIFT } from '../web/film/config.js';
const [t, nx, ny, body] = process.argv.slice(2);
const c = cameraAt(Number(t));
const cam = new THREE.PerspectiveCamera(FOV, 16/9, 0.01, 1e5);
cam.position.copy(c.pos); cam.quaternion.copy(c.quat); cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
cam.projectionMatrix.elements[8] = -LENS_SHIFT.x; cam.projectionMatrix.elements[9] = -LENS_SHIFT.y;
cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(Number(nx), Number(ny)), cam);
const s = new THREE.Sphere(CENTERS[body], RADII[body]); const hit = new THREE.Vector3();
if (!rc.ray.intersectSphere(s, hit)) { console.log('miss'); process.exit(); }
const d = hit.sub(CENTERS[body]).normalize();
console.log(JSON.stringify(d.toArray().map(v => +v.toFixed(4))));
