export const WIDTH_MIN = 1;
export const WIDTH_MAX = 200;
export const WIDTH_DEFAULT = 10;
export const COLOR_DEFAULT = '#0095FF';
export const MAX_AXIS = 4096;
export const MAX_PIXELS = 8_000_000;
export const OUTPUT_GAP = 32;

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ExportPlan {
  scale: 1 | 2;
  padding: number;
  width: number;
  height: number;
}

const WIDTH_ERROR = `Width must be a whole number from ${WIDTH_MIN} to ${WIDTH_MAX}.`;
const HEX_ERROR = 'Color must be a hex value like #0095FF or #09F.';
const SIZE_ERROR = 'Select a layer with a positive width and height.';
const TOO_LARGE_ERROR = 'The layer is too large to export with this stroke width.';

export function parseWidth(input: unknown): Result<number> {
  let value: number;
  if (typeof input === 'number') {
    value = input;
  } else if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
      return { ok: false, error: WIDTH_ERROR };
    }
    value = Number(trimmed);
  } else {
    return { ok: false, error: WIDTH_ERROR };
  }
  if (!Number.isInteger(value) || value < WIDTH_MIN || value > WIDTH_MAX) {
    return { ok: false, error: WIDTH_ERROR };
  }
  return { ok: true, value };
}

export function parseHex(input: unknown): Result<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: HEX_ERROR };
  }
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match) {
    return { ok: false, error: HEX_ERROR };
  }
  let digits = match[1].toUpperCase();
  if (digits.length === 3) {
    digits = digits
      .split('')
      .map((char) => char + char)
      .join('');
  }
  return { ok: true, value: `#${digits}` };
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export function planExport(nodeWidth: number, nodeHeight: number, strokeWidth: number): Result<ExportPlan> {
  if (!(nodeWidth > 0) || !(nodeHeight > 0) || !Number.isFinite(nodeWidth) || !Number.isFinite(nodeHeight)) {
    return { ok: false, error: SIZE_ERROR };
  }
  for (const scale of [2, 1] as const) {
    const padding = Math.ceil(strokeWidth * scale) + 2;
    const width = Math.ceil(nodeWidth * scale) + 2 * padding;
    const height = Math.ceil(nodeHeight * scale) + 2 * padding;
    if (width <= MAX_AXIS && height <= MAX_AXIS && width * height <= MAX_PIXELS) {
      return { ok: true, value: { scale, padding, width, height } };
    }
  }
  return { ok: false, error: TOO_LARGE_ERROR };
}
