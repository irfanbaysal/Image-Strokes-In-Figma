import type { MainToUi, OutputKind, StrokeSettings, UiToMain } from '../shared/messages.ts';
import { isMainToUi } from '../shared/messages.ts';
import { renderStroke } from '../image/stroke.ts';
import { traceContours } from '../image/trace.ts';
import { buildOutline, toPathData } from '../image/simplify.ts';
import { previewLayout } from './preview.ts';
import { IDENTITY_VIEW, ZOOM_MAX, clampView, panBy, zoomAt } from './view.ts';
import type { View } from './view.ts';
import { createColorPicker } from './picker.ts';
import { attachScrub } from './scrub.ts';
import { COLOR_DEFAULT, WIDTH_DEFAULT, WIDTH_MAX, WIDTH_MIN, hexToRgb, parseHex, parseWidth } from '../image/validation.ts';

type Source = { id: string; name: string };
type SourceReady = Extract<MainToUi, { type: 'source-ready' }>;

const PREVIEW_BOX = { width: 326, height: 196 };

function byId<T extends Element>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as unknown as T;
}

const widthInput = byId<HTMLInputElement>('width');
const widthError = byId<HTMLElement>('width-error');
const swatch = byId<HTMLButtonElement>('color-swatch');
const widthLabel = byId<HTMLElement>('width-label');
const pickerHost = byId<HTMLElement>('color-picker');
const hexInput = byId<HTMLInputElement>('color-hex');
const colorError = byId<HTMLElement>('color-error');
const previewCanvas = byId<HTMLCanvasElement>('preview-canvas');
const previewBox = byId<HTMLElement>('preview');
const zoomControls = byId<HTMLElement>('zoom-controls');
const zoomOutButton = byId<HTMLButtonElement>('zoom-out');
const zoomInButton = byId<HTMLButtonElement>('zoom-in');
const zoomFitButton = byId<HTMLButtonElement>('zoom-fit');
const previewEmpty = byId<HTMLElement>('preview-empty');
const previewNote = byId<HTMLElement>('preview-note');
const sourceLine = byId<HTMLElement>('source');
const imageButton = byId<HTMLButtonElement>('create-image');
const vectorButton = byId<HTMLButtonElement>('create-vector');
const message = byId<HTMLElement>('message');

const state = {
  widthDraft: String(WIDTH_DEFAULT),
  lastWidth: WIDTH_DEFAULT,
  widthValid: true,
  colorDraft: COLOR_DEFAULT,
  lastColor: COLOR_DEFAULT,
  colorValid: true,
  source: null as Source | null,
  revision: 0,
  runningId: null as string | null,
  runningKind: null as OutputKind | null,
  selected: null as { id: string; bitmap: ImageBitmap; size: { width: number; height: number } } | null,
};

const picker = createColorPicker({ anchor: swatch, host: pickerHost, initial: COLOR_DEFAULT, onInput: applySwatch });

function post(msg: UiToMain): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function setFieldError(input: HTMLInputElement, target: HTMLElement, error: string | null): void {
  target.textContent = error ?? '';
  if (error) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function setMessage(text: string, kind: 'error' | 'success' | ''): void {
  message.textContent = text;
  message.className = kind ? `message ${kind}` : 'message';
}

let frame = 0;

function schedulePreview(): void {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    drawPreview();
  });
}

let view: View = IDENTITY_VIEW;
let dragging = false;
let work: HTMLCanvasElement | null = null;
const MAX_PIXELS = 4_000_000;

function geometry() {
  const selected = state.selected;
  if (!selected) return null;
  const layout = previewLayout(state.lastWidth, PREVIEW_BOX, selected.size, 14);
  return { bitmap: selected.bitmap, layout, image: { width: layout.imageWidth, height: layout.imageHeight } };
}

function setView(next: View): void {
  view = next;
  schedulePreview();
}

function resetView(): void {
  setView(IDENTITY_VIEW);
}

function boxPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
  const rect = previewCanvas.getBoundingClientRect();
  return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
}

function zoomBy(factor: number, point: { x: number; y: number }): void {
  const g = geometry();
  if (g) setView(zoomAt(view, factor, point, PREVIEW_BOX, g.image));
}

function panView(dx: number, dy: number): void {
  const g = geometry();
  if (g) setView(panBy(view, dx, dy, PREVIEW_BOX, g.image));
}

function drawPreview(): void {
  const g = geometry();
  const ctx = previewCanvas.getContext('2d', { willReadFrequently: true });
  previewEmpty.style.display = state.source ? 'none' : 'block';
  if (!g) {
    dragging = false;
    if (ctx) ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewNote.style.visibility = 'hidden';
    zoomControls.style.display = 'none';
    previewBox.style.cursor = '';
    previewBox.tabIndex = -1;
    previewBox.setAttribute('aria-label', 'Preview. Select an image to see it here.');
    return;
  }
  zoomControls.style.display = '';
  previewBox.tabIndex = 0;
  previewBox.setAttribute('aria-label', 'Preview. Scroll to zoom, drag to pan.');
  const { bitmap, layout } = g;
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(PREVIEW_BOX.width * dpr);
  const h = Math.round(PREVIEW_BOX.height * dpr);
  if (previewCanvas.width !== w) previewCanvas.width = w;
  if (previewCanvas.height !== h) previewCanvas.height = h;
  view = clampView(view, PREVIEW_BOX, g.image);
  const shown = layout.scale * view.zoom;
  previewNote.textContent = `Preview at ${Math.max(1, Math.round(shown * 100))}%`;
  previewNote.style.visibility = Math.round(shown * 100) !== 100 ? 'visible' : 'hidden';
  const atMin = view.zoom <= 1;
  zoomOutButton.disabled = atMin;
  zoomFitButton.disabled = atMin;
  zoomInButton.disabled = view.zoom >= ZOOM_MAX;
  previewBox.style.cursor = dragging ? 'grabbing' : atMin ? '' : 'grab';
  const radius = layout.radius * view.zoom * dpr;
  let margin = Math.ceil(radius) + 2;
  if (w * h >= MAX_PIXELS) margin = 0;
  else {
    const fit = Math.floor((-(w + h) + Math.sqrt((w + h) ** 2 - 4 * (w * h - MAX_PIXELS))) / 4);
    margin = Math.max(0, Math.min(margin, fit));
  }
  const bw = w + 2 * margin;
  const bh = h + 2 * margin;
  if (!work) work = document.createElement('canvas');
  if (work.width !== bw) work.width = bw;
  if (work.height !== bh) work.height = bh;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  if (!wctx) return;
  wctx.clearRect(0, 0, bw, bh);
  wctx.imageSmoothingEnabled = true;
  wctx.imageSmoothingQuality = 'high';
  const dw = layout.imageWidth * view.zoom * dpr;
  const dh = layout.imageHeight * view.zoom * dpr;
  wctx.drawImage(bitmap, (bw - dw) / 2 + view.x * dpr, (bh - dh) / 2 + view.y * dpr, dw, dh);
  const out = renderStroke(wctx.getImageData(0, 0, bw, bh), radius, hexToRgb(state.lastColor));
  if (out) wctx.putImageData(new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, out.width, out.height), 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(work, margin, margin, w, h, 0, 0, w, h);
}

function attachPreviewInput(): void {
  previewBox.addEventListener(
    'wheel',
    (event) => {
      if (!state.selected) return;
      event.preventDefault();
      const k = event.ctrlKey ? 0.01 : 0.0015;
      zoomBy(Math.exp(-event.deltaY * k), boxPoint(event));
    },
    { passive: false },
  );
  let last = { x: 0, y: 0 };
  previewBox.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !state.selected) return;
    dragging = true;
    last = { x: event.clientX, y: event.clientY };
    previewBox.setPointerCapture(event.pointerId);
    schedulePreview();
  });
  previewBox.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    panView(event.clientX - last.x, event.clientY - last.y);
    last = { x: event.clientX, y: event.clientY };
  });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    schedulePreview();
  };
  previewBox.addEventListener('pointerup', endDrag);
  previewBox.addEventListener('pointercancel', endDrag);
  previewBox.addEventListener('lostpointercapture', endDrag);
  previewBox.addEventListener('dblclick', () => {
    if (state.selected) resetView();
  });
  previewBox.addEventListener('keydown', (event) => {
    if (!state.selected || event.target !== previewBox || event.ctrlKey || event.metaKey || event.altKey) return;
    const origin = { x: 0, y: 0 };
    switch (event.key) {
      case '+':
      case '=':
        zoomBy(1.25, origin);
        break;
      case '-':
        zoomBy(1 / 1.25, origin);
        break;
      case '0':
        resetView();
        break;
      case 'ArrowLeft':
        panView(20, 0);
        break;
      case 'ArrowRight':
        panView(-20, 0);
        break;
      case 'ArrowUp':
        panView(0, 20);
        break;
      case 'ArrowDown':
        panView(0, -20);
        break;
      default:
        return;
    }
    event.preventDefault();
  });
  zoomControls.addEventListener('pointerdown', (event) => event.stopPropagation());
  zoomControls.addEventListener('dblclick', (event) => event.stopPropagation());
  zoomOutButton.addEventListener('click', () => zoomBy(1 / 1.25, { x: 0, y: 0 }));
  zoomInButton.addEventListener('click', () => zoomBy(1.25, { x: 0, y: 0 }));
  zoomFitButton.addEventListener('click', resetView);
}

function updateButton(): void {
  const running = state.runningId !== null;
  imageButton.textContent = running && state.runningKind === 'image' ? 'Creating…' : 'Create As Image';
  vectorButton.textContent = running && state.runningKind === 'vector' ? 'Creating…' : 'Create As Vector';
  const disabled = running || !state.source || !state.widthValid || !state.colorValid;
  imageButton.disabled = disabled;
  vectorButton.disabled = disabled;
}

function applyWidthDraft(text: string): void {
  state.widthDraft = text;
  const result = parseWidth(text);
  state.widthValid = result.ok;
  if (result.ok) state.lastWidth = result.value;
  setFieldError(widthInput, widthError, result.ok ? null : result.error);
  schedulePreview();
  updateButton();
}

function applyHexDraft(text: string): void {
  state.colorDraft = text;
  const result = parseHex(text);
  state.colorValid = result.ok;
  if (result.ok) {
    state.lastColor = result.value;
    swatch.style.backgroundColor = result.value;
    picker.setColor(result.value);
  }
  setFieldError(hexInput, colorError, result.ok ? null : result.error);
  schedulePreview();
  updateButton();
}

function applySwatch(value: string): void {
  const result = parseHex(value);
  if (!result.ok) return;
  state.lastColor = result.value;
  state.colorValid = true;
  state.colorDraft = result.value;
  hexInput.value = result.value;
  swatch.style.backgroundColor = result.value;
  setFieldError(hexInput, colorError, null);
  schedulePreview();
  updateButton();
}

function onSelectionState(msg: Extract<MainToUi, { type: 'selection-state' }>): void {
  state.source = msg.source;
  if (state.selected && (!msg.source || msg.source.id !== state.selected.id)) {
    state.selected.bitmap.close();
    state.selected = null;
    resetView();
  }
  state.revision = msg.revision;
  schedulePreview();
  sourceLine.textContent = msg.source ? msg.source.name : (msg.error ?? '');
  updateButton();
}

function onSelectionPreview(msg: Extract<MainToUi, { type: 'selection-preview' }>): void {
  const source = state.source;
  if (msg.revision !== state.revision || !source) return;
  const id = source.id;
  const revision = msg.revision;
  createImageBitmap(new Blob([msg.png as Uint8Array<ArrayBuffer>], { type: 'image/png' })).then(
    (bitmap) => {
      if (revision !== state.revision || !state.source) {
        bitmap.close();
        return;
      }
      state.selected?.bitmap.close();
      state.selected = { id, bitmap, size: { width: msg.width, height: msg.height } };
      resetView();
    },
    () => {},
  );
}

function onCreateClick(output: OutputKind): void {
  if (imageButton.disabled || state.runningId !== null || !state.source) return;
  const requestId = newRequestId();
  state.runningId = requestId;
  state.runningKind = output;
  setMessage('', '');
  updateButton();
  const settings: StrokeSettings = { width: state.lastWidth, color: state.lastColor };
  post({ type: 'create-request', requestId, sourceNodeId: state.source.id, selectionRevision: state.revision, settings, output });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Could not encode the PNG.'));
        return;
      }
      blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
    }, 'image/png');
  });
}

async function render(msg: SourceReady): Promise<void> {
  const { plan, settings, requestId } = msg;
  await nextFrame();
  const bitmap = await createImageBitmap(new Blob([msg.png as Uint8Array<ArrayBuffer>],{ type: 'image/png' }), { colorSpaceConversion: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');
  ctx.drawImage(bitmap, plan.padding, plan.padding);
  bitmap.close();
  const image = ctx.getImageData(0, 0, plan.width, plan.height);
  const out = renderStroke(image, settings.width * plan.scale, hexToRgb(settings.color));
  if (!out) {
    post({ type: 'render-error', requestId, error: 'The image is fully transparent.' });
    return;
  }
  ctx.putImageData(new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, out.width, out.height), 0, 0);
  const png = await canvasToPng(canvas);
  post({ type: 'render-result', requestId, png, width: canvas.width, height: canvas.height });
}

async function renderVector(msg: SourceReady): Promise<void> {
  const { plan, requestId } = msg;
  await nextFrame();
  const bitmap = await createImageBitmap(new Blob([msg.png as Uint8Array<ArrayBuffer>], { type: 'image/png' }), { colorSpaceConversion: 'none' });
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is not available.');
  ctx.drawImage(bitmap, plan.padding, plan.padding);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, plan.width, plan.height).data;
  const alpha = new Uint8ClampedArray(plan.width * plan.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3] ?? 0;
  const contours = traceContours(alpha, plan.width, plan.height);
  if (contours.length === 0) {
    post({ type: 'render-error', requestId, error: 'The image is fully transparent.' });
    return;
  }
  const outline = buildOutline(contours);
  if (!outline) {
    post({ type: 'render-error', requestId, error: 'The image is too detailed for a vector outline.' });
    return;
  }
  const data = toPathData(outline.contours, plan.scale, { x: plan.padding, y: plan.padding });
  post({ type: 'vector-result', requestId, data });
}

function onSourceReady(msg: SourceReady): void {
  if (msg.requestId !== state.runningId) return;
  if (msg.output !== state.runningKind) {
    post({ type: 'render-error', requestId: msg.requestId, error: 'Unexpected job type.' });
    return;
  }
  (msg.output === 'vector' ? renderVector(msg) : render(msg)).catch((error: unknown) => {
    const text = error instanceof Error && error.message ? error.message : 'Rendering failed.';
    post({ type: 'render-error', requestId: msg.requestId, error: text });
  });
}

function finishJob(requestId: string | null, text: string, kind: 'error' | 'success'): void {
  if (requestId !== null && requestId !== state.runningId) return;
  state.runningId = null;
  state.runningKind = null;
  setMessage(text, kind);
  updateButton();
}

function onMessage(event: MessageEvent): void {
  const data: unknown = event.data;
  if (typeof data !== 'object' || data === null) return;
  const payload: unknown = (data as { pluginMessage?: unknown }).pluginMessage;
  if (!isMainToUi(payload)) return;
  switch (payload.type) {
    case 'selection-state':
      onSelectionState(payload);
      break;
    case 'selection-preview':
      onSelectionPreview(payload);
      break;
    case 'source-ready':
      onSourceReady(payload);
      break;
    case 'create-success':
      finishJob(payload.requestId, `Created "${payload.name}".`, 'success');
      break;
    case 'create-error':
      finishJob(payload.requestId, payload.error, 'error');
      break;
  }
}

function onEnter(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !imageButton.disabled) onCreateClick('image');
}

function init(): void {
  widthInput.value = state.widthDraft;
  hexInput.value = state.colorDraft;
  swatch.style.backgroundColor = state.lastColor;
  widthInput.addEventListener('input', () => applyWidthDraft(widthInput.value));
  hexInput.addEventListener('input', () => applyHexDraft(hexInput.value));
  hexInput.addEventListener('blur', () => {
    if (state.colorValid) {
      state.colorDraft = state.lastColor;
      hexInput.value = state.lastColor;
    }
  });
  attachScrub({
    handle: widthLabel,
    min: WIDTH_MIN,
    max: WIDTH_MAX,
    getValue: () => state.lastWidth,
    onChange: (value) => {
      widthInput.value = String(value);
      applyWidthDraft(widthInput.value);
    },
  });
  widthInput.addEventListener('keydown', onEnter);
  hexInput.addEventListener('keydown', onEnter);
  imageButton.addEventListener('click', () => onCreateClick('image'));
  vectorButton.addEventListener('click', () => onCreateClick('vector'));
  window.addEventListener('message', onMessage);
  attachPreviewInput();
  schedulePreview();
  updateButton();
  post({ type: 'ui-ready' });
}

init();
