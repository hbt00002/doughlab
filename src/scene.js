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
scene.background = new THREE.Color('#eef1f5');

export const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
camera.position.set(9, 8, 12);

const hemi = new THREE.HemisphereLight('#ffffff', '#b4bcc8', 1.2);
scene.add(hemi);
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

export let grid = makeGrid('#cbd5e1', '#e2e8f0');

function makeGrid(major, minor) {
  const g = new THREE.GridHelper(30, 30, major, minor);
  g.position.y = 0.001;
  scene.add(g);
  return g;
}

// Colours that follow the light / dark theme; modules with their own scene objects subscribe
const SCENE_THEMES = {
  light: { background: '#eef1f5', grid: ['#cbd5e1', '#e2e8f0'], ground: '#b4bcc8', shadow: 0.18 },
  dark: { background: '#111318', grid: ['#3a414d', '#232831'], ground: '#2b313b', shadow: 0.45 },
};
const themeListeners = [];

export function onSceneTheme(fn) {
  themeListeners.push(fn);
}

export function applySceneTheme(resolved) {
  const look = SCENE_THEMES[resolved] ?? SCENE_THEMES.light;
  scene.background.set(look.background);
  hemi.groundColor.set(look.ground);
  ground.material.opacity = look.shadow;
  scene.remove(grid);
  grid.geometry.dispose();
  grid.material.dispose();
  grid = makeGrid(...look.grid);
  for (const fn of themeListeners) fn(resolved);
}
scene.add(new THREE.AxesHelper(1.5));

export const orbit = new OrbitControls(camera, renderer.domElement);
// Damping keeps gliding after a drag; people who ask for reduced motion get a direct camera
orbit.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
