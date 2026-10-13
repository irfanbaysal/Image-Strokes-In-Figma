import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { renderStroke } from '../src/image/stroke.ts';
import { hexToRgb } from '../src/image/validation.ts';

const root = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(root, 'docs', 'cover-source.png');
const outputPath = path.join(root, 'docs', 'cover.png');

const SCALE = 2;
const PADDING = 44;
const CARD_RADIUS = 40;
const CARD_COLOR = { r: 30, g: 30, b: 30 };
const STROKE_COLOR = '#FFFFFF';
const HOLD_MS = 900;
const STEP_MS = 70;
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('cover-source.png is not a PNG file');
  let off = 8;
  let header = null;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const name = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (name === 'IHDR') {
      header = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], type: data[9], interlace: data[12] };
    } else if (name === 'IDAT') {
      idat.push(data);
    }
    off += 12 + len;
  }
  if (!header || header.depth !== 8 || header.type !== 6 || header.interlace !== 0) {
    throw new Error('cover-source.png must be an 8-bit RGBA non-interlaced PNG');
  }
  const { width, height } = header;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const out = new Uint8ClampedArray(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x];
      const a = x >= 4 ? out[y * stride + x - 4] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4] : 0;
      let p = 0;
      if (filter === 1) p = a;
      else if (filter === 2) p = b;
      else if (filter === 3) p = (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = (v + p) & 255;
    }
  }
  return { width, height, data: out };
}

function pad(image, padding) {
  const width = image.width + padding * 2;
  const height = image.height + padding * 2;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < image.height; y++) {
    const from = y * image.width * 4;
    data.set(image.data.subarray(from, from + image.width * 4), ((y + padding) * width + padding) * 4);
  }
  return { width, height, data };
}

function onCard(image) {
  const { width, height } = image;
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = Math.min(Math.max(x + 0.5, CARD_RADIUS), width - CARD_RADIUS);
      const cy = Math.min(Math.max(y + 0.5, CARD_RADIUS), height - CARD_RADIUS);
      const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const cover = Math.min(1, Math.max(0, CARD_RADIUS - dist + 0.5));
      const i = (y * width + x) * 4;
      const sa = image.data[i + 3] / 255;
      const oa = sa + cover * (1 - sa);
      if (oa > 0) {
        const bg = cover * (1 - sa);
        out[i] = (image.data[i] * sa + CARD_COLOR.r * bg) / oa;
        out[i + 1] = (image.data[i + 1] * sa + CARD_COLOR.g * bg) / oa;
        out[i + 2] = (image.data[i + 2] * sa + CARD_COLOR.b * bg) / oa;
      }
      out[i + 3] = Math.round(oa * 255);
    }
  }
  return { width, height, data: out };
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function u32(...values) {
  const buf = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => buf.writeUInt32BE(v, i * 4));
  return buf;
}

function compress(image) {
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    raw.set(image.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return deflateSync(raw, { level: 9 });
}

function fcTL(sequence, width, height, delay) {
  const buf = Buffer.alloc(26);
  buf.writeUInt32BE(sequence, 0);
  buf.writeUInt32BE(width, 4);
  buf.writeUInt32BE(height, 8);
  buf.writeUInt16BE(delay, 20);
  buf.writeUInt16BE(1000, 22);
  return buf;
}

const source = decodePng(await readFile(sourcePath));
const padded = pad(source, PADDING);
const color = hexToRgb(STROKE_COLOR);

const widths = [2, 2.5, 3, 3.5, 4, 4.5, 5];
const rendered = new Map();
for (const width of widths) {
  const image = renderStroke(padded, width * SCALE, color);
  if (!image || image.width !== padded.width || image.height !== padded.height) {
    throw new Error(`Stroke width ${width} did not render at the canvas size`);
  }
  rendered.set(width, compress(onCard(image)));
}

const sequence = [
  [2, HOLD_MS],
  ...[2.5, 3, 3.5, 4, 4.5].map((w) => [w, STEP_MS]),
  [5, HOLD_MS],
  ...[4.5, 4, 3.5, 3, 2.5].map((w) => [w, STEP_MS]),
];

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(padded.width, 0);
ihdr.writeUInt32BE(padded.height, 4);
ihdr[8] = 8;
ihdr[9] = 6;

const parts = [SIGNATURE, chunk('IHDR', ihdr), chunk('acTL', u32(sequence.length, 0))];
let seq = 0;
sequence.forEach(([width, delay], index) => {
  parts.push(chunk('fcTL', fcTL(seq++, padded.width, padded.height, delay)));
  const data = rendered.get(width);
  if (index === 0) parts.push(chunk('IDAT', data));
  else parts.push(chunk('fdAT', Buffer.concat([u32(seq++), data])));
});
parts.push(chunk('IEND', Buffer.alloc(0)));

const png = Buffer.concat(parts);
await writeFile(outputPath, png);
console.log(`docs/cover.png: ${png.length} bytes, ${sequence.length} frames`);
