import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScene } from '../src/scene-data.js';

const SHAPE_PARAMS = { ball: ['radius'], snake: ['length', 'radius', 'curvature'] };

test('rejects something that is not a DoughLab scene', () => {
  for (const bad of [null, 42, {}, { app: 'other', pieces: [] }, { app: 'doughlab', pieces: 'x' }]) {
    assert.throws(() => normalizeScene(bad, SHAPE_PARAMS), (err) => err.key === 'err.notScene', JSON.stringify(bad));
  }
});

test('skips entries that are not usable pieces', () => {
  const scene = normalizeScene({ app: 'doughlab', pieces: [null, 7, { type: 'cube' }, { type: 'ball' }] }, SHAPE_PARAMS);
  assert.equal(scene.pieces.length, 1);
  assert.equal(scene.pieces[0].type, 'ball');
});

test('drops malformed fields instead of failing later', () => {
  const [p] = normalizeScene(
    {
      app: 'doughlab',
      pieces: [
        {
          type: 'snake',
          name: 5,
          group: ['x'],
          color: 'red',
          dough: 'clay',
          texture: 'rough',
          seed: 'abc',
          link: 3,
          params: { length: 6, radius: 'big', extra: 1 },
          position: [1, 2],
          rotation: [0, 'a', 0],
          scale: [1, 1, 1],
        },
      ],
    },
    SHAPE_PARAMS,
  ).pieces;
  assert.deepEqual(p, { type: 'snake', params: { length: 6 }, scale: [1, 1, 1] });
});

test('keeps valid fields as they are', () => {
  const piece = {
    type: 'ball',
    name: 'Çin',
    group: 'Asya',
    color: '#E5383B',
    dough: 'glossy',
    texture: 0.4,
    seed: 123,
    link: 'g2',
    params: { radius: 0.7 },
    position: [1, 2, 3],
    rotation: [0, 0.5, 0],
    scale: [1, 2, 1],
  };
  const scene = normalizeScene({ app: 'doughlab', version: 1, density: 80, pieces: [piece] }, SHAPE_PARAMS);
  assert.equal(scene.density, 80);
  assert.deepEqual(scene.pieces[0], piece);
});

test('ignores a density that is not a sensible number', () => {
  assert.equal(normalizeScene({ app: 'doughlab', density: 'x', pieces: [] }, SHAPE_PARAMS).density, undefined);
  assert.equal(normalizeScene({ app: 'doughlab', density: -5, pieces: [] }, SHAPE_PARAMS).density, undefined);
});
