// Usage: node scripts/vector-figure.mjs  (renders docs/features/vector.png with headless Chrome; CHROME env overrides the binary)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { buildOutline, toPathData } from '../src/image/simplify.ts';
import { traceContours } from '../src/image/trace.ts';
import { planVectorExport } from '../src/image/validation.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sourcePath = join(root, 'docs', 'cover-source.png');
const out = join(root, 'docs', 'features', 'vector.png');
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(chrome)) fail(`Chrome not found at ${chrome}. Set the CHROME env variable to the browser binary.`);

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

const sourceFile = readFileSync(sourcePath);
const image = decodePng(sourceFile);
const plan = planVectorExport(image.width / 2, image.height / 2);
if (!plan.ok) fail(`Vector export plan failed: ${plan.error}`);
const { padding, width: pw, height: ph, scale } = plan.value;
const alpha = new Uint8ClampedArray(pw * ph);
for (let y = 0; y < image.height; y++) {
  for (let x = 0; x < image.width; x++) alpha[(y + padding) * pw + x + padding] = image.data[(y * image.width + x) * 4 + 3];
}
const contours = traceContours(alpha, pw, ph);
if (contours.length === 0) fail('Tracing found no contours in docs/cover-source.png.');
const outline = buildOutline(contours);
if (!outline) fail('Simplification produced no outline.');
const data = toPathData(outline.contours, scale, { x: padding, y: padding });
if (!data) fail('Path data is empty.');
const dots = [...data.matchAll(/[ML] (\S+) (\S+)/g)].map((m) => `<circle cx="${m[1]}" cy="${m[2]}" r="1.6" fill="#fff" stroke="#1e1e1e" stroke-width="0.5"/>`).join('');

const size = image.width / scale;
const view = `-24 -24 ${size + 48} ${size + 48}`;
const href = `data:image/png;base64,${sourceFile.toString('base64')}`;
const img = (opacity) => `<image href="${href}" x="0" y="0" width="${size}" height="${size}" opacity="${opacity}"/>`;
const vec = (color, weight) => `<path d="${data}" fill="${color}" fill-rule="evenodd" stroke="${color}" stroke-width="${weight * 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
const cells = [
  [`${img(0.35)}<path d="${data}" fill="none" stroke="#7cc4ff" stroke-width="1" stroke-linejoin="round"/>${dots}`, `Traced path · ${outline.points} points`],
  [vec('#0095FF', 10) + img(1), 'Native stroke · weight 10'],
  [vec('#FF4D8D', 18) + img(1), 'Same vector, restyled in Figma · weight 18'],
];

const W = 960;
const MARGIN = 24;
const GAP = 16;
const cellW = (W - 2 * MARGIN - 2 * GAP) / 3;
const H = Math.ceil(2 * MARGIN + 12 + (cellW - 24) + 10 + 18 + 14);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#1e1e1e}
body{box-sizing:border-box;padding:${MARGIN}px;display:grid;grid-template-columns:repeat(3,1fr);gap:${GAP}px;font:13px system-ui,sans-serif;color:#c8c8c8}
.cell{background:#252525;border-radius:10px;padding:12px 12px 14px;display:flex;flex-direction:column;align-items:center;gap:10px;overflow:hidden}
svg{width:100%;display:block;background-image:linear-gradient(#ffffff0a 1px,transparent 1px),linear-gradient(90deg,#ffffff0a 1px,transparent 1px);background-size:16px 16px}
.cap{text-align:center;line-height:18px}
</style></head><body>${cells.map(([body, cap]) => `<div class="cell"><svg viewBox="${view}">${body}</svg><div class="cap">${cap}</div></div>`).join('')}</body></html>`;

mkdirSync(dirname(out), { recursive: true });
const page = join(tmpdir(), 'strokes-vector-figure.html');
writeFileSync(page, html);
try {
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--window-size=${W},${H}`,
    '--force-device-scale-factor=2',
    '--virtual-time-budget=2000',
    `--screenshot=${out}`,
    pathToFileURL(page).href,
  ], { stdio: 'ignore' });
} catch (error) {
  fail(`Chrome failed to render the figure: ${error.message}`);
}
console.log(`${out} ${statSync(out).size} bytes`);
