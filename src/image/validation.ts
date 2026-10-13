export const WIDTH_MIN = 1;
export const WIDTH_MAX = 200;
export const WIDTH_DEFAULT = 10;
export const COLOR_DEFAULT = '#0095FF';
export const MAX_AXIS = 4096;
export const MAX_PIXELS = 8_000_000;
export const OUTPUT_GAP = 32;
export const MAX_PATH_CHARS = 400_000;

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

function planWithPadding(
  nodeWidth: number,
  nodeHeight: number,
  paddingFor: (scale: 1 | 2) => number,
): Result<ExportPlan> {
  if (!(nodeWidth > 0) || !(nodeHeight > 0) || !Number.isFinite(nodeWidth) || !Number.isFinite(nodeHeight)) {
    return { ok: false, error: SIZE_ERROR };
  }
  for (const scale of [2, 1] as const) {
    const padding = paddingFor(scale);
    const width = Math.ceil(nodeWidth * scale) + 2 * padding;
    const height = Math.ceil(nodeHeight * scale) + 2 * padding;
    if (width <= MAX_AXIS && height <= MAX_AXIS && width * height <= MAX_PIXELS) {
      return { ok: true, value: { scale, padding, width, height } };
    }
  }
  return { ok: false, error: TOO_LARGE_ERROR };
}

export function planExport(nodeWidth: number, nodeHeight: number, strokeWidth: number): Result<ExportPlan> {
  return planWithPadding(nodeWidth, nodeHeight, (scale) => Math.ceil(strokeWidth * scale) + 2);
}

export function planVectorExport(nodeWidth: number, nodeHeight: number): Result<ExportPlan> {
  return planWithPadding(nodeWidth, nodeHeight, () => 2);
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

export function isVectorPathData(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PATH_CHARS) return false;
  const length = value.length;
  let pos = 0;

  const char = (code: string): boolean => {
    if (pos < length && value[pos] === code) {
      pos += 1;
      return true;
    }
    return false;
  };

  const digits = (): boolean => {
    const start = pos;
    while (pos < length && isDigit(value.charCodeAt(pos))) pos += 1;
    return pos > start;
  };

  const number = (): boolean => {
    char('-');
    if (!digits()) return false;
    return !char('.') || digits();
  };

  const point = (): boolean => char(' ') && number() && char(' ') && number();

  for (;;) {
    if (!char('M') || !point()) return false;
    let points = 1;
    for (;;) {
      if (!char(' ')) return false;
      if (char('Z')) break;
      if (!char('L') || !point()) return false;
      points += 1;
    }
    if (points < 3) return false;
    if (pos === length) return true;
    if (!char(' ')) return false;
  }
}
