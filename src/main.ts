import type { ExportPlan } from './image/validation.ts';
import { OUTPUT_GAP, parseHex, parseWidth, planExport } from './image/validation.ts';
import type { MainToUi, StrokeSettings, UiToMain } from './shared/messages.ts';
import { isUiToMain } from './shared/messages.ts';

interface SourceInfo {
  id: string;
  name: string;
}

interface SourceSnapshot {
  id: string;
  width: number;
  height: number;
  fills: string;
  transform: string;
}

interface Job {
  requestId: string;
  revision: number;
  settings: StrokeSettings;
  plan: ExportPlan;
  snapshot: SourceSnapshot;
  rendering: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

type CreateRequest = Extract<UiToMain, { type: 'create-request' }>;
type RenderResult = Extract<UiToMain, { type: 'render-result' }>;
type RenderError = Extract<UiToMain, { type: 'render-error' }>;

const JOB_TIMEOUT_MS = 30000;
const IDENTITY: Transform = [
  [1, 0, 0],
  [0, 1, 0],
];

let revision = 0;
let currentSource: SourceInfo | null = null;
let job: Job | null = null;
let ownOutputId: string | null = null;

function post(message: MainToUi): void {
  figma.ui.postMessage(message);
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'Something went wrong.';
}

function postError(requestId: string | null, error: string): void {
  post({ type: 'create-error', requestId, error });
}

function isVisible(item: { visible?: boolean }): boolean {
  return item.visible !== false;
}

function sourceError(node: SceneNode): string | null {
  if (node.type !== 'RECTANGLE') return 'Only image rectangles are supported.';
  if (!node.visible) return 'The image is hidden.';
  if (node.opacity !== 1 || node.blendMode !== 'PASS_THROUGH' && node.blendMode !== 'NORMAL') {
    return 'Reset the image opacity and blend mode first.';
  }
  const fills = node.fills;
  if (!Array.isArray(fills)) return 'Images with extra fills are not supported.';
  const visibleFills = fills.filter(isVisible);
  if (visibleFills.length === 0) return 'Select one image.';
  if (visibleFills.length !== 1) return 'Images with extra fills are not supported.';
  const fill = visibleFills[0];
  if (fill.type !== 'IMAGE') return 'Select one image.';
  if ((fill.blendMode ?? 'NORMAL') !== 'NORMAL' || (fill.opacity ?? 1) !== 1) {
    return 'Images with a custom fill opacity or blend mode are not supported.';
  }
  if (node.strokes.some(isVisible) || node.effects.some(isVisible)) {
    return 'Remove strokes and effects from the image first.';
  }
  return null;
}

function takeSnapshot(node: RectangleNode): SourceSnapshot {
  return {
    id: node.id,
    width: node.width,
    height: node.height,
    fills: JSON.stringify(node.fills),
    transform: JSON.stringify(node.absoluteTransform),
  };
}

function sameSnapshot(a: SourceSnapshot, b: SourceSnapshot): boolean {
  return a.id === b.id && a.width === b.width && a.height === b.height && a.fills === b.fills && a.transform === b.transform;
}

async function findSource(id: string): Promise<RectangleNode | null> {
  const node = await figma.getNodeByIdAsync(id);
  if (!node || node.removed || node.type !== 'RECTANGLE') return null;
  return node;
}

function evaluateSelection(): { source: SourceInfo | null; error: string | null } {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return { source: null, error: 'Select one image.' };
  if (selection.length > 1) return { source: null, error: 'Select a single image.' };
  const node = selection[0];
  const error = sourceError(node);
  if (error !== null) return { source: null, error };
  return { source: { id: node.id, name: node.name }, error: null };
}

function isOwnOutputSelected(): boolean {
  const selection = figma.currentPage.selection;
  return ownOutputId !== null && selection.length === 1 && selection[0].id === ownOutputId;
}

async function publishPreview(id: string, mine: number): Promise<void> {
  try {
    const node = await findSource(id);
    if (!node || mine !== revision) return;
    const width = node.width;
    const height = node.height;
    const png = await exportSource(node, Math.min(2, 600 / width, 400 / height));
    if (mine !== revision) return;
    post({ type: 'selection-preview', revision: mine, png, width, height });
  } catch {
    return;
  }
}

async function publishSelection(): Promise<void> {
  revision += 1;
  const mine = revision;
  try {
    if (isOwnOutputSelected() && currentSource) {
      const stillThere = await findSource(currentSource.id);
      if (mine !== revision) return;
      if (stillThere) {
        post({ type: 'selection-state', revision: mine, source: currentSource, error: null });
        await publishPreview(currentSource.id, mine);
        return;
      }
    }
    ownOutputId = null;
    const state = evaluateSelection();
    currentSource = state.source;
    post({ type: 'selection-state', revision: mine, source: state.source, error: state.error });
    if (state.source) await publishPreview(state.source.id, mine);
  } catch (error) {
    if (mine !== revision) return;
    currentSource = null;
    post({ type: 'selection-state', revision: mine, source: null, error: errorText(error) });
  }
}

function clearJob(): void {
  if (job && job.timer !== null) clearTimeout(job.timer);
  job = null;
}

function failJob(requestId: string, error: string): void {
  if (job && job.requestId === requestId) clearJob();
  postError(requestId, error);
}

function armTimeout(requestId: string): void {
  if (!job) return;
  if (job.timer !== null) clearTimeout(job.timer);
  job.timer = setTimeout(() => {
    if (job && job.requestId === requestId) failJob(requestId, 'Creating the stroke took too long. Try again.');
  }, JOB_TIMEOUT_MS);
}

async function exportSource(source: RectangleNode, scale: number): Promise<Uint8Array> {
  const clone = source.clone();
  try {
    figma.currentPage.appendChild(clone);
    clone.relativeTransform = IDENTITY;
    return await clone.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
  } finally {
    if (!clone.removed) clone.remove();
  }
}

async function handleCreateRequest(message: CreateRequest): Promise<void> {
  const { requestId } = message;
  if (job) {
    postError(requestId, 'Another stroke is still being created.');
    return;
  }
  if (message.selectionRevision !== revision) {
    postError(requestId, 'The selection changed. Try again.');
    return;
  }
  if (!currentSource || currentSource.id !== message.sourceNodeId) {
    postError(requestId, 'The selection changed. Try again.');
    return;
  }
  const width = parseWidth(message.settings.width);
  if (!width.ok) {
    postError(requestId, width.error);
    return;
  }
  const color = parseHex(message.settings.color);
  if (!color.ok) {
    postError(requestId, color.error);
    return;
  }
  const settings: StrokeSettings = { width: width.value, color: color.value };

  const placeholder: Job = {
    requestId,
    revision: message.selectionRevision,
    settings,
    plan: { scale: 1, padding: 0, width: 0, height: 0 },
    snapshot: { id: '', width: 0, height: 0, fills: '', transform: '' },
    rendering: false,
    timer: null,
  };
  job = placeholder;
  try {
    const source = await findSource(message.sourceNodeId);
    if (!source) throw new Error('The selected image no longer exists.');
    const error = sourceError(source);
    if (error !== null) throw new Error(error);
    const plan = planExport(source.width, source.height, settings.width);
    if (!plan.ok) throw new Error(plan.error);
    placeholder.plan = plan.value;
    placeholder.snapshot = takeSnapshot(source);
    const png = await exportSource(source, plan.value.scale);
    if (job !== placeholder) return;
    if (revision !== placeholder.revision) throw new Error('The selection changed. Try again.');
    placeholder.rendering = true;
    armTimeout(requestId);
    post({ type: 'source-ready', requestId, settings, plan: plan.value, png });
  } catch (error) {
    if (job === placeholder) failJob(requestId, errorText(error));
  }
}

function positionOutput(output: RectangleNode, source: RectangleNode): void {
  const [[a, c], [b, d]] = source.absoluteTransform;
  output.relativeTransform = [
    [a, c, 0],
    [b, d, 0],
  ];
  const sourceBox = source.absoluteBoundingBox;
  const outputBox = output.absoluteBoundingBox;
  if (!sourceBox || !outputBox) throw new Error('Could not measure the image position.');
  const dx = sourceBox.x + sourceBox.width + OUTPUT_GAP - outputBox.x;
  const dy = sourceBox.y + sourceBox.height / 2 - (outputBox.y + outputBox.height / 2);
  output.relativeTransform = [
    [a, c, dx],
    [b, d, dy],
  ];
}

async function createOutput(source: RectangleNode, current: Job, png: Uint8Array): Promise<string> {
  const { plan } = current;
  const image = figma.createImage(png);
  const output = figma.createRectangle();
  try {
    figma.currentPage.appendChild(output);
    output.name = `${source.name} — Stroke`;
    output.resize(plan.width / plan.scale, plan.height / plan.scale);
    output.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: image.hash }];
    positionOutput(output, source);
    ownOutputId = output.id;
    figma.currentPage.selection = [output];
    figma.commitUndo();
    return output.name;
  } catch (error) {
    ownOutputId = null;
    if (!output.removed) output.remove();
    throw error;
  }
}

async function handleRenderResult(message: RenderResult): Promise<void> {
  const current = job;
  if (!current || current.requestId !== message.requestId || !current.rendering) return;
  try {
    if (message.width !== current.plan.width || message.height !== current.plan.height) {
      throw new Error('The rendered image has an unexpected size.');
    }
    const source = await findSource(current.snapshot.id);
    if (job !== current) return;
    if (!source || revision !== current.revision || !sameSnapshot(takeSnapshot(source), current.snapshot)) {
      throw new Error('The selection changed. Try again.');
    }
    const name = await createOutput(source, current, message.png);
    clearJob();
    post({ type: 'create-success', requestId: current.requestId, name });
  } catch (error) {
    if (job === current) failJob(current.requestId, errorText(error));
  }
}

function handleRenderError(message: RenderError): void {
  if (!job || job.requestId !== message.requestId) return;
  failJob(message.requestId, message.error || 'Rendering the stroke failed.');
}

function handleMessage(message: unknown): void {
  if (!isUiToMain(message)) return;
  switch (message.type) {
    case 'ui-ready':
      void publishSelection();
      return;
    case 'create-request':
      void handleCreateRequest(message);
      return;
    case 'render-result':
      void handleRenderResult(message);
      return;
    case 'render-error':
      handleRenderError(message);
      return;
  }
}

figma.showUI(__html__, { width: 360, height: 560, themeColors: false });
figma.ui.onmessage = handleMessage;
figma.on('selectionchange', () => {
  void publishSelection();
});
