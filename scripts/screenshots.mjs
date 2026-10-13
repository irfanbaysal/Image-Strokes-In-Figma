// Usage: npm run build && node scripts/screenshots.mjs  (renders docs/features/*.png with headless Chrome; CHROME env overrides the binary)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const outDir = join(root, 'docs', 'features');
const uiPath = join(root, 'dist', 'ui.html');

if (!existsSync(uiPath)) {
  console.error('dist/ui.html is missing. Run "npm run build" first.');
  process.exit(1);
}
if (!existsSync(chrome)) {
  console.error(`Chrome not found at ${chrome}. Set the CHROME env variable to the browser binary.`);
  process.exit(1);
}

const html = readFileSync(uiPath, 'utf8');
const imageBase64 = readFileSync(join(root, 'docs', 'cover-source.png')).toString('base64');

const arrow = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><path d="M3 2v15l4-4 3 7 3-1.4-3-6.6h6z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const grab = '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><path d="M6 12c0-1.2 1.6-1.2 1.6 0v-1.4c0-1.3 1.7-1.3 1.7 0v-.6c0-1.3 1.8-1.3 1.8 0v.6c0-1.2 1.7-1.2 1.7 0V16c0 4-2.2 6.5-5.4 6.5C6.2 22.5 4.6 20 4.6 17.5z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round" transform="translate(2 -1)"/></svg>';
const resize = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="20" viewBox="0 0 28 20"><path d="M2 10l6-6v4h12V4l6 6-6 6v-4H8v4z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';

const scenes = {
  zoom: `async () => {
    setWidth(6);
    const p = box('#preview');
    const x = p.left + p.width / 2 + 4, y = p.top + p.height * 0.28;
    for (let i = 0; i < 8; i++) { wheel(x, y, -160); await frames(2); }
    cursor(${JSON.stringify(arrow)}, x, y, 3, 2);
  }`,
  pan: `async () => {
    setWidth(6);
    const p = box('#preview');
    const x = p.left + p.width / 2 + 4, y = p.top + p.height * 0.28;
    for (let i = 0; i < 8; i++) { wheel(x, y, -160); await frames(2); }
    const sx = p.left + p.width / 2, sy = p.top + p.height / 2;
    fire('#preview', 'pointerdown', sx, sy);
    for (let i = 1; i <= 8; i++) { fire('#preview', 'pointermove', sx + i * 8, sy + i * 5); await frames(1); }
    await frames(3);
    cursor(${JSON.stringify(grab)}, sx + 64, sy + 40, 13, 12);
  }`,
  scrub: `async () => {
    const l = box('#width-label');
    const sx = l.left + l.width / 2, sy = l.top + l.height / 2;
    fire('#width-label', 'pointerdown', sx, sy);
    for (let i = 1; i <= 15; i++) { fire('#width-label', 'pointermove', sx + i * 4, sy); await frames(1); }
    await frames(3);
    cursor(${JSON.stringify(resize)}, sx + 60, sy, 14, 10);
  }`,
};

function inject(action) {
  return `<script>
(() => {
  for (const name of ['setPointerCapture', 'releasePointerCapture']) Element.prototype[name] = () => {};
  Element.prototype.hasPointerCapture = () => true;
  const frames = (n) => new Promise((r) => setTimeout(r, 40 * n));
  const box = (sel) => document.querySelector(sel).getBoundingClientRect();
  const fire = (sel, type, x, y) => document.querySelector(sel).dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, bubbles: true }));
  const wheel = (x, y, dy) => document.querySelector('#preview').dispatchEvent(new WheelEvent('wheel', { clientX: x, clientY: y, deltaY: dy, bubbles: true, cancelable: true }));
  const cursor = (svg, x, y, hx, hy) => {
    const el = document.createElement('div');
    el.innerHTML = svg;
    el.style.cssText = 'position:fixed;pointer-events:none;z-index:99;left:' + (x - hx) + 'px;top:' + (y - hy) + 'px';
    document.body.appendChild(el);
  };
  const setWidth = (v) => { const w = document.querySelector('#width'); w.value = String(v); w.dispatchEvent(new Event('input', { bubbles: true })); };
  const bytes = Uint8Array.from(atob('${imageBase64}'), (c) => c.charCodeAt(0));
  const send = (pluginMessage) => window.dispatchEvent(new MessageEvent('message', { data: { pluginMessage } }));
  window.addEventListener('load', async () => {
    send({ type: 'selection-state', revision: 1, source: { id: '1:2', name: 'Eiffel Tower' }, error: null });
    send({ type: 'selection-preview', revision: 1, png: bytes, width: 512, height: 512 });
    const canvas = document.querySelector('#preview-canvas');
    for (let i = 0; i < 100; i++) {
      const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      if (d.some((v, j) => j % 4 === 3 && v > 0)) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    await new Promise((r) => setTimeout(r, 200));
    await frames(3);
    await (${action})();
  });
})();
</script>`;
}

mkdirSync(outDir, { recursive: true });
for (const [name, action] of Object.entries(scenes)) {
  const page = join(tmpdir(), `strokes-shot-${name}.html`);
  const out = join(outDir, `${name}.png`);
  writeFileSync(page, html.replace(/<\/body>(?![\s\S]*<\/body>)/, `${inject(action)}</body>`));
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=360,560',
    '--force-device-scale-factor=2',
    '--virtual-time-budget=4000',
    `--screenshot=${out}`,
    pathToFileURL(page).href,
  ], { stdio: 'ignore' });
  console.log(`${out} ${statSync(out).size} bytes`);
}
