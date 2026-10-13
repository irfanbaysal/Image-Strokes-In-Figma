import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IDENTITY_VIEW,
  KEEP_VISIBLE,
  ZOOM_MAX,
  ZOOM_MIN,
  clampView,
  panBy,
  zoomAt,
} from '../src/ui/view.ts';

const box = { width: 300, height: 180 };
const image = { width: 100, height: 60 };

test('constants and identity view', () => {
  assert.equal(ZOOM_MIN, 1);
  assert.equal(ZOOM_MAX, 8);
  assert.equal(KEEP_VISIBLE, 24);
  assert.deepEqual(IDENTITY_VIEW, { zoom: 1, x: 0, y: 0 });
  assert.ok(Object.isFrozen(IDENTITY_VIEW));
});

test('clampView clamps zoom below 1 and above 8', () => {
  assert.equal(clampView({ zoom: 0.2, x: 0, y: 0 }, box, image).zoom, 1);
  assert.equal(clampView({ zoom: 20, x: 0, y: 0 }, box, image).zoom, 8);
});

test('clampView treats NaN zoom as 1', () => {
  assert.deepEqual(clampView({ zoom: NaN, x: 50, y: 50 }, box, image), { zoom: 1, x: 0, y: 0 });
});

test('clampView centres at zoom 1 even with an offset', () => {
  assert.deepEqual(clampView({ zoom: 1, x: 40, y: -30 }, box, image), { zoom: 1, x: 0, y: 0 });
});

test('clampView limits the pan at zoom 4', () => {
  assert.deepEqual(clampView({ zoom: 4, x: 1000, y: -1000 }, box, image), { zoom: 4, x: 326, y: -186 });
  assert.deepEqual(clampView({ zoom: 4, x: 10, y: -20 }, box, image), { zoom: 4, x: 10, y: -20 });
});

test('clampView resets NaN offsets to 0', () => {
  assert.deepEqual(clampView({ zoom: 4, x: NaN, y: Infinity }, box, image), { zoom: 4, x: 0, y: 0 });
});

test('zoomAt at the centre keeps the offset', () => {
  const view = zoomAt({ zoom: 1, x: 0, y: 0 }, 2, { x: 0, y: 0 }, box, image);
  assert.deepEqual(view, { zoom: 2, x: 0, y: 0 });
  const moved = zoomAt({ zoom: 2, x: 10, y: -5 }, 2, { x: 0, y: 0 }, box, image);
  assert.deepEqual(moved, { zoom: 4, x: 20, y: -10 });
});

test('zoomAt keeps the image point under the cursor fixed', () => {
  const start = { zoom: 2, x: 12, y: -8 };
  const point = { x: 30, y: 20 };
  const next = zoomAt(start, 1.5, point, box, image);
  const before = { x: (point.x - start.x) / start.zoom, y: (point.y - start.y) / start.zoom };
  const after = { x: (point.x - next.x) / next.zoom, y: (point.y - next.y) / next.zoom };
  assert.equal(next.zoom, 3);
  assert.ok(Math.abs(before.x - after.x) < 1e-9);
  assert.ok(Math.abs(before.y - after.y) < 1e-9);
});

test('zoomAt out to 1 recentres', () => {
  assert.deepEqual(zoomAt({ zoom: 2, x: 30, y: 10 }, 0.25, { x: 40, y: 10 }, box, image), { zoom: 1, x: 0, y: 0 });
});

test('zoomAt beyond the max stops at 8', () => {
  assert.equal(zoomAt({ zoom: 4, x: 0, y: 0 }, 100, { x: 0, y: 0 }, box, image).zoom, 8);
});

test('panBy moves the offset', () => {
  assert.deepEqual(panBy({ zoom: 4, x: 10, y: 10 }, 5, -7, box, image), { zoom: 4, x: 15, y: 3 });
});

test('panBy clamps to the limits', () => {
  assert.deepEqual(panBy({ zoom: 4, x: 320, y: 0 }, 100, 1000, box, image), { zoom: 4, x: 326, y: 186 });
});

test('panBy has no effect at zoom 1', () => {
  assert.deepEqual(panBy({ zoom: 1, x: 0, y: 0 }, 50, 50, box, image), { zoom: 1, x: 0, y: 0 });
});

test('arguments are not mutated', () => {
  const view = { zoom: 4, x: 1000, y: 1000 };
  const point = { x: 5, y: 5 };
  const b = { ...box };
  const i = { ...image };
  clampView(view, b, i);
  zoomAt(view, 2, point, b, i);
  panBy(view, 3, 3, b, i);
  assert.deepEqual(view, { zoom: 4, x: 1000, y: 1000 });
  assert.deepEqual(point, { x: 5, y: 5 });
  assert.deepEqual(b, box);
  assert.deepEqual(i, image);
});
