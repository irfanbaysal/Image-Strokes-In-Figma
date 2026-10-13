import type { MainToUi, StrokeSettings, UiToMain } from '../shared/messages.ts';
import { isMainToUi } from '../shared/messages.ts';
import { renderStroke } from '../image/stroke.ts';
import { createColorPicker } from './picker.ts';
import { attachScrub } from './scrub.ts';
import { COLOR_DEFAULT, WIDTH_DEFAULT, WIDTH_MAX, WIDTH_MIN, hexToRgb, parseHex, parseWidth } from '../image/validation.ts';

type Source = { id: string; name: string };
type SourceReady = Extract<MainToUi, { type: 'source-ready' }>;

const PREVIEW_MAX_STROKE = 26;

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
const outline = byId<SVGPathElement>('outline');
const previewNote = byId<HTMLElement>('preview-note');
const sourceLine = byId<HTMLElement>('source');
const createButton = byId<HTMLButtonElement>('create');
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

function drawPreview(): void {
  const drawn = Math.min(state.lastWidth, PREVIEW_MAX_STROKE);
  outline.setAttribute('stroke-width', String(drawn * 2));
  outline.setAttribute('stroke', state.lastColor);
  outline.setAttribute('fill', state.lastColor);
  previewNote.style.visibility = drawn === state.lastWidth ? 'hidden' : 'visible';
}

function updateButton(): void {
  const running = state.runningId !== null;
  createButton.textContent = running ? 'Creating…' : 'Create Stroke';
  createButton.disabled = running || !state.source || !state.widthValid || !state.colorValid;
}

function applyWidthDraft(text: string): void {
  state.widthDraft = text;
  const result = parseWidth(text);
  state.widthValid = result.ok;
  if (result.ok) state.lastWidth = result.value;
  setFieldError(widthInput, widthError, result.ok ? null : result.error);
  drawPreview();
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
  drawPreview();
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
  drawPreview();
  updateButton();
}

function onSelectionState(msg: Extract<MainToUi, { type: 'selection-state' }>): void {
  state.source = msg.source;
  state.revision = msg.revision;
  sourceLine.textContent = msg.source ? msg.source.name : (msg.error ?? '');
  updateButton();
}

function onCreateClick(): void {
  if (createButton.disabled || state.runningId !== null || !state.source) return;
  const requestId = newRequestId();
  state.runningId = requestId;
  setMessage('', '');
  updateButton();
  const settings: StrokeSettings = { width: state.lastWidth, color: state.lastColor };
  post({ type: 'create-request', requestId, sourceNodeId: state.source.id, selectionRevision: state.revision, settings });
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

function onSourceReady(msg: SourceReady): void {
  if (msg.requestId !== state.runningId) return;
  render(msg).catch((error: unknown) => {
    const text = error instanceof Error && error.message ? error.message : 'Rendering failed.';
    post({ type: 'render-error', requestId: msg.requestId, error: text });
  });
}

function finishJob(requestId: string | null, text: string, kind: 'error' | 'success'): void {
  if (requestId !== null && requestId !== state.runningId) return;
  state.runningId = null;
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
  if (event.key === 'Enter' && !createButton.disabled) onCreateClick();
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
  createButton.addEventListener('click', onCreateClick);
  window.addEventListener('message', onMessage);
  drawPreview();
  updateButton();
  post({ type: 'ui-ready' });
}

init();
