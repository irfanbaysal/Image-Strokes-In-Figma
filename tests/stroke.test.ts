import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceToMask, renderStroke } from '../src/image/stroke.ts';
import type { RgbaImage } from '../src/image/stroke.ts';

const RED = { r: 255, g: 0, b: 0 };

function blank(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}

function setPixel(img: RgbaImage, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const p = (y * img.width + x) * 4;
  img.data[p] = r;
  img.data[p + 1] = g;
  img.data[p + 2] = b;
  img.data[p + 3] = a;
}

function px(img: RgbaImage, x: number, y: number): number[] {
  const p = (y * img.width + x) * 4;
  return [img.data[p], img.data[p + 1], img.data[p + 2], img.data[p + 3]];
}

function dot(): RgbaImage {
  const img = blank(21, 21);
  setPixel(img, 10, 10, 0, 255, 0, 255);
  return img;
}

test('distance from a single pixel matches hypot', () => {
  const img = dot();
  const alpha = new Uint8ClampedArray(21 * 21);
  for (let i = 0; i < alpha.length; i++) alpha[i] = img.data[i * 4 + 3];
  const dist = distanceToMask(alpha, 21, 21);
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      assert.ok(Math.abs(dist[y * 21 + x] - Math.hypot(x - 10, y - 10)) < 1e-4);
    }
  }
});

test('stroke of a single pixel is a disc', () => {
  const out = renderStroke(dot(), 5, RED);
  assert.ok(out);
  assert.deepEqual(px(out, 14, 10), [255, 0, 0, 255]);
  assert.deepEqual(px(out, 15, 10), [255, 0, 0, 128]);
  assert.deepEqual(px(out, 17, 10), [0, 0, 0, 0]);
  assert.deepEqual(px(out, 10, 10), [0, 255, 0, 255]);
});

test('source is not mutated', () => {
  const img = dot();
  const copy = new Uint8ClampedArray(img.data);
  renderStroke(img, 5, RED);
  assert.deepEqual(img.data, copy);
});

test('fully opaque image is unchanged', () => {
  const img = blank(6, 6);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) setPixel(img, x, y, x * 10, y * 10, 7, 255);
  const out = renderStroke(img, 4, RED);
  assert.ok(out);
  assert.deepEqual(out.data, img.data);
});

test('fully transparent image returns null', () => {
  assert.equal(renderStroke(blank(8, 8), 3, RED), null);
  const dist = distanceToMask(new Uint8Array(64), 8, 8);
  for (const v of dist) assert.equal(v, Infinity);
});

test('ring hole near the edge gets stroke color', () => {
  const img = blank(21, 21);
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      const d = Math.hypot(x - 10, y - 10);
      if (d >= 6 && d <= 8) setPixel(img, x, y, 0, 255, 0, 255);
    }
  }
  const out = renderStroke(img, 2, RED);
  assert.ok(out);
  assert.deepEqual(px(out, 10, 10 - 5), [255, 0, 0, 255]);
  assert.deepEqual(px(out, 10, 10), [0, 0, 0, 0]);
});

test('one pixel wide line has a continuous stroke on both sides', () => {
  const img = blank(21, 21);
  for (let x = 0; x < 21; x++) setPixel(img, x, 10, 0, 255, 0, 255);
  const out = renderStroke(img, 3, RED);
  assert.ok(out);
  for (let x = 0; x < 21; x++) {
    for (const dy of [1, 2]) {
      assert.deepEqual(px(out, x, 10 - dy), [255, 0, 0, 255]);
      assert.deepEqual(px(out, x, 10 + dy), [255, 0, 0, 255]);
    }
    assert.deepEqual(px(out, x, 10 - 5), [0, 0, 0, 0]);
  }
});

test('half transparent source over full coverage', () => {
  const img = blank(9, 9);
  setPixel(img, 4, 4, 0, 0, 255, 255);
  setPixel(img, 5, 4, 0, 255, 0, 128);
  const out = renderStroke(img, 3, RED);
  assert.ok(out);
  const [r, g, , a] = px(out, 5, 4);
  assert.equal(a, 255);
  assert.ok(r > 0 && r < 255);
  assert.ok(g > 0 && g < 255);
});

test('distanceToMask matches brute force on a random mask', () => {
  let seed = 12345;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const w = 16;
  const h = 16;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rand() < 0.08 ? 200 : 0;
  alpha[37] = 255;
  const dist = distanceToMask(alpha, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let best = Infinity;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          if (alpha[j * w + i] >= 128) best = Math.min(best, Math.hypot(x - i, y - j));
        }
      }
      assert.ok(Math.abs(dist[y * w + x] - best) < 1e-4);
    }
  }
});
