import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { isTouch } from './state.js';

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export const viewport = document.getElementById('viewport');
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color('#efe9df');

export const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
camera.position.set(9, 8, 12);

scene.add(new THREE.HemisphereLight('#ffffff', '#b9a98f', 1.2));
export const SUN_HOME = new THREE.Vector3(6, 12, 8);
export const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.copy(SUN_HOME);
scene.add(sun.target);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
sun.shadow.normalBias = 0.02;
scene.add(sun);

export const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.18 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

export const grid = new THREE.GridHelper(30, 30, '#b8ab97', '#d8cfc0');
grid.position.y = 0.001;
scene.add(grid);
scene.add(new THREE.AxesHelper(1.5));

export const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.target.set(0, 1.5, 0);

export const gizmo = new TransformControls(camera, renderer.domElement);
// Bigger handles are easier to grab with a finger
gizmo.setSize(isTouch ? 1.4 : 0.9);
scene.add(gizmo.getHelper ? gizmo.getHelper() : gizmo);

new ResizeObserver(() => {
  const { clientWidth: w, clientHeight: h } = viewport;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}).observe(viewport);

renderer.setAnimationLoop(() => {
  orbit.update();
  renderer.render(scene, camera);
});

export const raycaster = new THREE.Raycaster();
export const pointer = new THREE.Vector2();

export function rayFromEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
}
