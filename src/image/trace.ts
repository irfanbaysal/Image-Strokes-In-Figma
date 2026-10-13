export interface Point {
  x: number;
  y: number;
}
export type Contour = Point[];

export function traceContours(
  alpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 128,
): Contour[] {
  const pw = width + 2;
  const ph = height + 2;

  function value(i: number, j: number): number {
    if (i < 1 || j < 1 || i > width || j > height) return 0;
    return alpha[(j - 1) * width + (i - 1)];
  }
  function hEdge(i: number, j: number): number {
    return (j * pw + i) * 2;
  }
  function vEdge(i: number, j: number): number {
    return (j * pw + i) * 2 + 1;
  }
  function crossing(edge: number): Point {
    const vertical = edge % 2 === 1;
    const cell = (edge - (vertical ? 1 : 0)) / 2;
    const i = cell % pw;
    const j = (cell - i) / pw;
    const a = value(i, j);
    const b = vertical ? value(i, j + 1) : value(i + 1, j);
    const t = (threshold - a) / (b - a);
    return vertical ? { x: i - 0.5, y: j - 0.5 + t } : { x: i - 0.5 + t, y: j - 0.5 };
  }

  const next = new Map<number, number>();
  for (let j = 0; j < ph - 1; j++) {
    for (let i = 0; i < pw - 1; i++) {
      const tl = value(i, j);
      const tr = value(i + 1, j);
      const br = value(i + 1, j + 1);
      const bl = value(i, j + 1);
      const inTl = tl >= threshold;
      const inTr = tr >= threshold;
      const inBr = br >= threshold;
      const inBl = bl >= threshold;
      const code = (inTl ? 1 : 0) | (inTr ? 2 : 0) | (inBr ? 4 : 0) | (inBl ? 8 : 0);
      if (code === 0 || code === 15) continue;
      const T = hEdge(i, j);
      const B = hEdge(i, j + 1);
      const L = vEdge(i, j);
      const R = vEdge(i + 1, j);
      switch (code) {
        case 1: next.set(T, L); break;
        case 2: next.set(R, T); break;
        case 3: next.set(R, L); break;
        case 4: next.set(B, R); break;
        case 6: next.set(B, T); break;
        case 7: next.set(B, L); break;
        case 8: next.set(L, B); break;
        case 9: next.set(T, B); break;
        case 11: next.set(R, B); break;
        case 12: next.set(L, R); break;
        case 13: next.set(T, R); break;
        case 14: next.set(L, T); break;
        case 5:
          if ((tl + tr + br + bl) / 4 >= threshold) {
            next.set(T, R);
            next.set(B, L);
          } else {
            next.set(T, L);
            next.set(B, R);
          }
          break;
        case 10:
          if ((tl + tr + br + bl) / 4 >= threshold) {
            next.set(L, T);
            next.set(R, B);
          } else {
            next.set(R, T);
            next.set(L, B);
          }
          break;
      }
    }
  }

  const contours: Contour[] = [];
  const visited = new Set<number>();
  for (const start of next.keys()) {
    if (visited.has(start)) continue;
    const contour: Contour = [];
    let edge = start;
    while (!visited.has(edge)) {
      visited.add(edge);
      const p = crossing(edge);
      const last = contour[contour.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) contour.push(p);
      const following = next.get(edge);
      if (following === undefined) break;
      edge = following;
    }
    while (contour.length > 1) {
      const first = contour[0];
      const last = contour[contour.length - 1];
      if (first.x !== last.x || first.y !== last.y) break;
      contour.pop();
    }
    if (contour.length >= 3) contours.push(contour);
  }
  return contours;
}
