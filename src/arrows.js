import * as THREE from 'three';

const HEAD = 0.35;
const UP = new THREE.Vector3(0, 1, 0);

// Text sprite, 0.4 world units tall, with a light outline so it reads on any background
export function makeLabel(text, color) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const font = 'bold 40px system-ui, sans-serif';
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 24;
  canvas.height = 64;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(255, 253, 248, 0.9)';
  ctx.strokeText(text, canvas.width / 2, 34);
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
  sprite.scale.set((0.4 * canvas.width) / canvas.height, 0.4, 1);
  return sprite;
}

// Labelled arrow drawn on top of everything (no depth test) so it stays visible inside the dough
export function makeArrow(color, label, radius = 0.035) {
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 12), mat);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(radius * 3.4, HEAD, 16), mat);
  const tag = makeLabel(label, color);
  const group = new THREE.Group();
  group.add(shaft, cone, tag);
  shaft.renderOrder = cone.renderOrder = 10;
  tag.renderOrder = 11;
  return { group, shaft, cone, tag };
}

// Points the arrow from `start` along the unit vector `dir` for `length` units
export function placeArrow(arrow, start, dir, length) {
  const head = Math.min(HEAD, length * 0.3);
  const body = Math.max(length - head, 1e-3);
  arrow.group.position.copy(start);
  arrow.group.quaternion.setFromUnitVectors(UP, dir);
  arrow.shaft.scale.set(1, body, 1);
  arrow.shaft.position.y = body / 2;
  arrow.cone.scale.set(1, head / HEAD, 1);
  arrow.cone.position.y = body + head / 2;
  arrow.tag.position.y = length + 0.3;
}

export function disposeArrow(arrow) {
  arrow.group.removeFromParent();
  arrow.group.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) {
      o.material.map?.dispose();
      o.material.dispose();
    }
  });
}
