import test from 'node:test';
import assert from 'node:assert/strict';
import { spriteBounds } from '../src/render/renderer.js';

function pixels(width, height, points) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha] of points) data[(y * width + x) * 4 + 3] = alpha;
  return { width, height, data };
}

test('sprite crop retains faint antialiasing and transparent filter margins', () => {
  const image = pixels(128, 128, [[48, 39, 1], [82, 86, 255], [61, 62, 127]]);
  assert.deepEqual(spriteBounds(image), { x: 46, y: 37, width: 39, height: 52 });
  // Source and destination points keep the original 8-radius / 128-pixel mapping.
  const b = spriteBounds(image);
  for (const x of [48, 61, 82]) {
    assert.equal(b.x / 16 - 4 + (x - b.x) / 16, x / 16 - 4);
  }
});

test('sprite crop clamps padding at bitmap edges without clipping painted pixels', () => {
  assert.deepEqual(spriteBounds(pixels(128, 128, [[0, 0, 1], [127, 127, 1]])),
    { x: 0, y: 0, width: 128, height: 128 });
  assert.deepEqual(spriteBounds(pixels(128, 128, [[0, 63, 1], [7, 70, 255]])),
    { x: 0, y: 61, width: 10, height: 12 });
});

test('an empty sprite retains a valid full-size transparent source rectangle', () => {
  assert.deepEqual(spriteBounds(pixels(128, 128, [])), { x: 0, y: 0, width: 128, height: 128 });
});
