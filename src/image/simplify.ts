import type { Contour, Point } from './trace.ts';

export const MAX_VECTOR_POINTS = 6000;

const MAX_DOUBLINGS = 6;

export interface VectorOutline {
  contours: Contour[];
  points: number;
  tolerance: number;
}

export interface OutlineOptions {
  tolerance?: number;
  maxPoints?: number;
  minArea?: number;
}

export function contourArea(contour: Contour): number {
  let sum = 0;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i];
    const b = contour[(i + 1) % contour.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function farthest(points: Point[], from: Point): number {
  let best = 0;
  let bestDist = -1;
  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - from.x, points[i].y - from.y);
    if (d > bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

function simplifyOpen(points: Point[], tolerance: number): Point[] {
  const last = points.length - 1;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[last] = 1;
  const stack: number[] = [0, last];
  while (stack.length > 0) {
    const end = stack.pop() as number;
    const start = stack.pop() as number;
    let maxDist = -1;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > Math.max(tolerance, 1e-9)) {
      keep[index] = 1;
      stack.push(start, index, index, end);
    }
  }
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

export function simplifyContour(contour: Contour, tolerance: number): Contour {
  if (contour.length < 3) return [];
  const first = farthest(contour, contour[0]);
  const second = farthest(contour, contour[first]);
  const a = Math.min(first, second);
  const b = Math.max(first, second);
  if (a === b) return [];
  const half1 = simplifyOpen(contour.slice(a, b + 1), tolerance);
  const half2 = simplifyOpen([...contour.slice(b), ...contour.slice(0, a + 1)], tolerance);
  const result = [...half1.slice(0, -1), ...half2.slice(0, -1)];
  return result.length < 3 ? [] : result;
}

export function buildOutline(contours: Contour[], options: OutlineOptions = {}): VectorOutline | null {
  const maxPoints = options.maxPoints ?? MAX_VECTOR_POINTS;
  const minArea = options.minArea ?? 2;
  let tolerance = options.tolerance ?? 0.75;
  const kept = contours.filter((c) => Math.abs(contourArea(c)) >= minArea);
  if (kept.length === 0) return null;
  for (let attempt = 0; attempt <= MAX_DOUBLINGS; attempt++) {
    const simplified = kept.map((c) => simplifyContour(c, tolerance)).filter((c) => c.length >= 3);
    const points = simplified.reduce((sum, c) => sum + c.length, 0);
    if (simplified.length === 0) return null;
    if (points <= maxPoints) return { contours: simplified, points, tolerance };
    tolerance *= 2;
  }
  return null;
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? '0' : String(rounded);
}

export function toPathData(contours: Contour[], scale: number, offset: Point): string {
  const parts: string[] = [];
  for (const contour of contours) {
    contour.forEach((p, i) => {
      const x = formatNumber((p.x - offset.x) / scale);
      const y = formatNumber((p.y - offset.y) / scale);
      parts.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
    });
    parts.push('Z');
  }
  return parts.join(' ');
}
