import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewLayout } from '../src/ui/preview.ts';

const box = { width: 300, height: 100 };
const sample = { width: 36, height: 56 };

test('stroke that fits keeps scale 1', () => {
  const layout = previewLayout(10, box, sample);
  assert.equal(layout.scale, 1);
  assert.equal(layout.imageWidth, 36);
  assert.equal(layout.imageHeight, 56);
  assert.equal(layout.radius, 10);
});

test('stroke 19 still fits at scale 1', () => {
  assert.equal(previewLayout(19, box, sample).scale, 1);
});

test('stroke 20 shrinks to 47/48', () => {
  assert.equal(previewLayout(20, box, sample).scale, 47 / 48);
});

test('stroke 200 shrinks so image plus stroke fills the margin-limited height', () => {
  const layout = previewLayout(200, box, sample);
  assert.equal(layout.scale, 47 / 228);
  assert.ok(Math.abs(layout.imageHeight / 2 + layout.radius - 47) < 1e-9);
});

test('wide image is limited by width when the box is narrow', () => {
  const layout = previewLayout(10, { width: 100, height: 300 }, { width: 200, height: 20 });
  assert.equal(layout.scale, (100 / 2 - 3) / (200 / 2 + 10));
});

test('custom margin changes the result', () => {
  assert.equal(previewLayout(20, box, sample, 0).scale, 1);
  assert.notEqual(previewLayout(200, box, sample, 0).scale, previewLayout(200, box, sample).scale);
});

test('scale never exceeds 1', () => {
  for (const stroke of [0, 1, 10, 19, 20, 100, 500]) {
    assert.ok(previewLayout(stroke, box, sample).scale <= 1);
  }
});
