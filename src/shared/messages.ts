import type { ExportPlan } from '../image/validation.ts';
import { isVectorPathData, parseHex, parseWidth } from '../image/validation.ts';

export type OutputKind = 'image' | 'vector';

export interface StrokeSettings {
  width: number;
  color: string;
}

export type MainToUi =
  | { type: 'selection-state'; revision: number; source: { id: string; name: string } | null; error: string | null }
  | { type: 'source-ready'; requestId: string; settings: StrokeSettings; plan: ExportPlan; png: Uint8Array; output: OutputKind }
  | { type: 'create-success'; requestId: string; name: string }
  | { type: 'create-error'; requestId: string | null; error: string }
  | { type: 'selection-preview'; revision: number; png: Uint8Array; width: number; height: number };

export type UiToMain =
  | { type: 'ui-ready' }
  | { type: 'create-request'; requestId: string; sourceNodeId: string; selectionRevision: number; settings: StrokeSettings; output: OutputKind }
  | { type: 'render-result'; requestId: string; png: Uint8Array; width: number; height: number }
  | { type: 'vector-result'; requestId: string; data: string }
  | { type: 'render-error'; requestId: string; error: string };

type Fields = Record<string, unknown>;

function isRecord(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStrokeSettings(value: unknown): value is StrokeSettings {
  if (!isRecord(value)) return false;
  if (typeof value.width !== 'number' || !parseWidth(value.width).ok) return false;
  if (!isString(value.color)) return false;
  const color = parseHex(value.color);
  return color.ok && color.value === value.color;
}

function isExportPlan(value: unknown): value is ExportPlan {
  if (!isRecord(value)) return false;
  return (
    (value.scale === 1 || value.scale === 2) &&
    isPositiveInteger(value.padding) &&
    isPositiveInteger(value.width) &&
    isPositiveInteger(value.height)
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

function isOutputKind(value: unknown): value is OutputKind {
  return value === 'image' || value === 'vector';
}

function isSource(value: unknown): boolean {
  return value === null || (isRecord(value) && isString(value.id) && isString(value.name));
}

export function isMainToUi(value: unknown): value is MainToUi {
  if (!isRecord(value) || !isString(value.type)) return false;
  switch (value.type) {
    case 'selection-state':
      return isNumber(value.revision) && isSource(value.source) && isNullableString(value.error);
    case 'source-ready':
      return (
        isString(value.requestId) &&
        isStrokeSettings(value.settings) &&
        isExportPlan(value.plan) &&
        value.png instanceof Uint8Array &&
        isOutputKind(value.output)
      );
    case 'create-success':
      return isString(value.requestId) && isString(value.name);
    case 'create-error':
      return (value.requestId === null || isString(value.requestId)) && isString(value.error);
    case 'selection-preview':
      return (
        isNumber(value.revision) &&
        value.png instanceof Uint8Array &&
        isPositiveNumber(value.width) &&
        isPositiveNumber(value.height)
      );
    default:
      return false;
  }
}

export function isUiToMain(value: unknown): value is UiToMain {
  if (!isRecord(value) || !isString(value.type)) return false;
  switch (value.type) {
    case 'ui-ready':
      return true;
    case 'create-request':
      return (
        isString(value.requestId) &&
        isString(value.sourceNodeId) &&
        isNumber(value.selectionRevision) &&
        isStrokeSettings(value.settings) &&
        isOutputKind(value.output)
      );
    case 'render-result':
      return (
        isString(value.requestId) &&
        value.png instanceof Uint8Array &&
        isPositiveInteger(value.width) &&
        isPositiveInteger(value.height)
      );
    case 'vector-result':
      return isString(value.requestId) && isVectorPathData(value.data);
    case 'render-error':
      return isString(value.requestId) && isString(value.error);
    default:
      return false;
  }
}
