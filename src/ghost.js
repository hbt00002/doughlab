import * as THREE from 'three';
import { makeArrow, placeArrow, disposeArrow } from './arrows.js';

export { parseCSV, describeColumns, buildGhostData, fitScores } from './ghost-data.js';

const LOADING_COLOR = '#0f766e';

function dotTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(32, 32, 28, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

// Translucent point cloud of a reduced dataset, plus one arrow per original variable
export class Ghost {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.points = null;
    this.arrows = [];
    this.data = null;
    this.dot = dotTexture();
  }

  setData(data) {
    this.clear();
    this.data = data;

    // Palette colours are sRGB; vertex colours must be linear
    const linear = new Float32Array(data.colors.length);
    const c = new THREE.Color();
    for (let i = 0; i < data.colors.length; i += 3) {
      c.setRGB(data.colors[i], data.colors[i + 1], data.colors[i + 2], THREE.SRGBColorSpace);
      linear[i] = c.r;
      linear[i + 1] = c.g;
      linear[i + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(linear, 3));
    const mat = new THREE.PointsMaterial({
      size: 7,
      sizeAttenuation: false,
      vertexColors: true,
      map: this.dot,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      alphaTest: 0.1,
    });
    this.points = new THREE.Points(geo, mat);
    this.group.add(this.points);

    const center = new THREE.Vector3(...data.center);
    for (const l of data.loadings) {
      const dir = new THREE.Vector3(...l.dir);
      const len = dir.length();
      if (len < 0.05) continue; // variable barely shows up in these three components
      const arrow = makeArrow(LOADING_COLOR, l.name, 0.025);
      placeArrow(arrow, center, dir.normalize(), len * data.span * 0.25);
      this.group.add(arrow.group);
      this.arrows.push(arrow);
    }
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  setArrowsVisible(visible) {
    for (const a of this.arrows) a.group.visible = visible;
  }

  // Row index (into the CSV rows) of the ghost point under the ray, or -1
  pick(raycaster) {
    if (!this.points || !this.group.visible) return -1;
    raycaster.params.Points.threshold = 0.15;
    const hit = raycaster.intersectObject(this.points, false)[0];
    return hit ? this.data.rowIndex[hit.index] : -1;
  }

  clear() {
    if (this.points) {
      this.group.remove(this.points);
      this.points.geometry.dispose();
      this.points.material.dispose();
      this.points = null;
    }
    for (const a of this.arrows) disposeArrow(a);
    this.arrows = [];
    this.data = null;
  }
}
