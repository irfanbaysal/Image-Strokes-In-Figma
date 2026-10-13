import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceContours } from '../src/image/trace.ts';
import type { Contour } from '../src/image/trace.ts';

function area(c: Contour): number {
  let sum = 0;
  for (let i = 0; i < c.length; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}
function bounds(c: Contour) {
  const xs = c.map((p) => p.x);
  const ys = c.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}
function fill(w: number, h: number, x0: number, y0: number, x1: number, y1: number, a: Uint8Array<ArrayBuffer> = new Uint8Array(w * h)): Uint8Array<ArrayBuffer> {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * w + x] = 255;
  return a;
}
function near(a: number, b: number, d: number): void {
  assert.ok(Math.abs(a - b) <= d, `${a} not within ${d} of ${b}`);
}

test('fully transparent gives no contours', () => {
  assert.deepEqual(traceContours(new Uint8Array(25), 5, 5), []);
});

test('single opaque pixel gives a small closed shape around its centre', () => {
  const cs = traceContours(fill(5, 5, 2, 2, 3, 3), 5, 5);
  assert.equal(cs.length, 1);
  const a = Math.abs(area(cs[0]));
  assert.ok(a > 0.4 && a < 1.1);
  const b = bounds(cs[0]);
  assert.ok(b.minX > 2 && b.maxX < 3 && b.minY > 2 && b.maxY < 3);
});

test('filled block traces its box', () => {
  const cs = traceContours(fill(20, 20, 5, 5, 15, 15), 20, 20);
  assert.equal(cs.length, 1);
  const b = bounds(cs[0]);
  near(b.minX, 5, 0.5);
  near(b.maxX, 15, 0.5);
  near(b.minY, 5, 0.5);
  near(b.maxY, 15, 0.5);
  near(Math.abs(area(cs[0])), 100, 5);
});

test('fully opaque image hugs the pixel-centre box', () => {
  const cs = traceContours(fill(8, 6, 0, 0, 8, 6), 8, 6);
  assert.equal(cs.length, 1);
  const b = bounds(cs[0]);
  assert.ok(b.minX < 0.5 && b.minX > -0.5);
  assert.ok(b.maxX > 7.5 && b.maxX < 8.5);
  assert.ok(b.minY < 0.5 && b.minY > -0.5);
  assert.ok(b.maxY > 5.5 && b.maxY < 6.5);
});

test('ring gives two contours with opposite orientation', () => {
  const a = fill(20, 20, 4, 4, 16, 16);
  for (let y = 8; y < 12; y++) for (let x = 8; x < 12; x++) a[y * 20 + x] = 0;
  const cs = traceContours(a, 20, 20);
  assert.equal(cs.length, 2);
  assert.ok(area(cs[0]) * area(cs[1]) < 0);
});

test('two blobs give two contours', () => {
  const a = fill(20, 10, 1, 1, 5, 5);
  fill(20, 10, 12, 3, 18, 8, a);
  assert.equal(traceContours(a, 20, 10).length, 2);
});

test('soft edge crosses at the interpolated position', () => {
  const ramp = [0, 64, 128, 192, 255];
  const a = new Uint8Array(15);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) a[y * 5 + x] = ramp[x];
  const cs = traceContours(a, 5, 3);
  assert.equal(cs.length, 1);
  near(bounds(cs[0]).minX, 2.5, 1e-9);
  const shifted = traceContours(a, 5, 3, 96);
  near(bounds(shifted[0]).minX, 2, 1e-9);
  const off = traceContours(a, 5, 3, 100);
  const x = bounds(off[0]).minX;
  assert.ok(x !== Math.round(x));
});

test('diagonal saddle gives closed contours', () => {
  const cs = traceContours(new Uint8Array([255, 0, 0, 255]), 2, 2);
  assert.ok(cs.length >= 1);
  for (const c of cs) assert.ok(c.length >= 3);
});

test('contours have at least 3 points and no repeated neighbours', () => {
  const a = fill(20, 20, 3, 3, 12, 12);
  fill(20, 20, 12, 12, 18, 18, a);
  a[0] = 128;
  for (const c of traceContours(a, 20, 20)) {
    assert.ok(c.length >= 3);
    for (let i = 0; i < c.length; i++) {
      const p = c[i];
      const q = c[(i + 1) % c.length];
      assert.ok(p.x !== q.x || p.y !== q.y);
    }
  }
});
