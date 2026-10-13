import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOutline, contourArea, simplifyContour, toPathData } from '../src/image/simplify.ts';

type Pt = { x: number; y: number };

function square(size: number, perSide: number, ox = 0, oy = 0): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < perSide; i++) pts.push({ x: ox + (size * i) / perSide, y: oy });
  for (let i = 0; i < perSide; i++) pts.push({ x: ox + size, y: oy + (size * i) / perSide });
  for (let i = 0; i < perSide; i++) pts.push({ x: ox + size - (size * i) / perSide, y: oy + size });
  for (let i = 0; i < perSide; i++) pts.push({ x: ox, y: oy + size - (size * i) / perSide });
  return pts;
}

function circle(radius: number, count: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const a = (2 * Math.PI * i) / count;
    pts.push({ x: 100 + radius * Math.cos(a), y: 100 + radius * Math.sin(a) });
  }
  return pts;
}

function distToPolygon(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

test('contourArea of a square and orientation sign', () => {
  const sq = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.equal(contourArea(sq), 100);
  assert.equal(contourArea([...sq].reverse()), -100);
});

test('square with 40 points per side collapses to 4 points', () => {
  assert.equal(simplifyContour(square(100, 40), 0).length, 4);
});

test('circle keeps few points within tolerance', () => {
  const c = circle(80, 720);
  const s = simplifyContour(c, 0.5);
  assert.ok(s.length > 3 && s.length < 100);
  for (const p of c) assert.ok(distToPolygon(p, s) <= 0.5 + 1e-9);
});

test('contour of 2 points gives empty', () => {
  assert.deepEqual(simplifyContour([{ x: 0, y: 0 }, { x: 1, y: 1 }], 1), []);
});

test('large contour does not overflow the stack', () => {
  const s = simplifyContour(circle(5000, 50000), 0.5);
  assert.ok(s.length >= 3 && s.length < 50000);
});

test('buildOutline drops tiny contours and keeps ring contours', () => {
  const tiny = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const outer = square(100, 5);
  const hole = square(40, 5, 30, 30).reverse();
  const out = buildOutline([tiny, outer, hole]);
  assert.ok(out);
  assert.equal(out.contours.length, 2);
  assert.equal(out.points, 8);
  assert.equal(out.tolerance, 0.75);
});

test('buildOutline raises tolerance when over budget', () => {
  const out = buildOutline([circle(80, 720)], { tolerance: 0.1, maxPoints: 20 });
  assert.ok(out);
  assert.ok(out.points <= 20);
  assert.ok(out.tolerance > 0.1);
});

test('buildOutline returns null for nothing and for unreachable budget', () => {
  assert.equal(buildOutline([]), null);
  assert.equal(buildOutline([circle(80, 720)], { tolerance: 0.01, maxPoints: 3 }), null);
});

test('toPathData formats subpaths with scale and offset', () => {
  const a = [{ x: 4, y: 4 }, { x: 24, y: 4 }, { x: 24, y: 14 }];
  const b = [{ x: 5, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 7 }];
  assert.equal(
    toPathData([a, b], 2, { x: 4, y: 4 }),
    'M 0 0 L 10 0 L 10 5 Z M 0.5 0.5 L 1.5 0.5 L 1.5 1.5 Z',
  );
});

test('toPathData rounds to 2 decimals and never writes -0', () => {
  const c = [{ x: 1.005, y: -0.001 }, { x: 1 / 3, y: 2 }, { x: 0, y: 0 }];
  const d = toPathData([c], 1, { x: 0, y: 0 });
  assert.ok(!d.includes('-0 ') && !d.endsWith('-0'));
  assert.ok(d.startsWith('M 1 0 L 0.33 2 L 0 0 Z') || d.startsWith('M 1.01 0 L 0.33 2 L 0 0 Z'));
});
