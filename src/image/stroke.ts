export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const BIG = 1e20;

function transform1d(
  f: Float64Array,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
  n: number,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -BIG;
  z[1] = BIG;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = BIG;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

export function distanceToMask(
  alpha: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  threshold = 128,
): Float32Array {
  const count = width * height;
  const out = new Float32Array(count);
  const grid = new Float64Array(count);
  let any = false;
  for (let i = 0; i < count; i++) {
    if (alpha[i] >= threshold) {
      grid[i] = 0;
      any = true;
    } else {
      grid[i] = BIG;
    }
  }
  if (!any) {
    out.fill(Infinity);
    return out;
  }
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    transform1d(f, d, v, z, height);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = grid[row + x];
    transform1d(f, d, v, z, width);
    for (let x = 0; x < width; x++) out[row + x] = Math.sqrt(d[x]);
  }
  return out;
}

export function renderStroke(
  source: RgbaImage,
  radius: number,
  color: { r: number; g: number; b: number },
): RgbaImage | null {
  const { width, height, data } = source;
  const count = width * height;
  const alpha = new Uint8ClampedArray(count);
  for (let i = 0; i < count; i++) alpha[i] = data[i * 4 + 3];
  const dist = distanceToMask(alpha, width, height, 128);
  let any = false;
  for (let i = 0; i < count; i++) {
    if (alpha[i] >= 128) {
      any = true;
      break;
    }
  }
  if (!any) return null;

  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < count; i++) {
    const p = i * 4;
    const cov = Math.min(1, Math.max(0, radius + 0.5 - dist[i]));
    if (cov === 0) {
      out[p] = data[p];
      out[p + 1] = data[p + 1];
      out[p + 2] = data[p + 2];
      out[p + 3] = data[p + 3];
      continue;
    }
    const sa = data[p + 3] / 255;
    const oa = sa + cov * (1 - sa);
    if (oa <= 0) continue;
    const ws = sa / oa;
    const wc = (cov * (1 - sa)) / oa;
    out[p] = Math.round(data[p] * ws + color.r * wc);
    out[p + 1] = Math.round(data[p + 1] * ws + color.g * wc);
    out[p + 2] = Math.round(data[p + 2] * ws + color.b * wc);
    out[p + 3] = Math.round(oa * 255);
  }
  return { width, height, data: out };
}
