import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToRgb,
  isVectorPathData,
  parseHex,
  parseWidth,
  planExport,
  planVectorExport,
  MAX_AXIS,
  MAX_PATH_CHARS,
  MAX_PIXELS,
} from '../src/image/validation.ts';
import { isMainToUi, isUiToMain } from '../src/shared/messages.ts';

const WIDTH_ERROR = 'Width must be a whole number from 1 to 200.';
const plan = { scale: 2 as const, padding: 4, width: 100, height: 80 };
const settings = { width: 10, color: '#0095FF' };
const png = new Uint8Array([137, 80, 78, 71]);
const TRIANGLE = 'M 0 0 L 10 0 L 10 10 Z';

test('parseWidth accepts integers in range as numbers and strings', () => {
  assert.deepEqual(parseWidth(10), { ok: true, value: 10 });
  assert.deepEqual(parseWidth(1), { ok: true, value: 1 });
  assert.deepEqual(parseWidth(200), { ok: true, value: 200 });
  assert.deepEqual(parseWidth('  42 '), { ok: true, value: 42 });
});

test('parseWidth rejects empty, NaN, fractional, zero, too large and negative values', () => {
  for (const input of ['', '   ', NaN, 2.5, '2.5', 0, '0', 201, '201', -1, '-3', 'abc', null, undefined]) {
    assert.deepEqual(parseWidth(input), { ok: false, error: WIDTH_ERROR }, String(input));
  }
});

test('parseHex expands the short form and normalizes case', () => {
  assert.deepEqual(parseHex('#09f'), { ok: true, value: '#0099FF' });
  assert.deepEqual(parseHex('#0095ff'), { ok: true, value: '#0095FF' });
  assert.deepEqual(parseHex('  #0095FF  '), { ok: true, value: '#0095FF' });
});

test('parseHex rejects a missing hash, bad lengths, bad digits and non-strings', () => {
  for (const input of ['0095FF', '#0095F', '#0095FFF', '#GGGGGG', '#', '', 123, null]) {
    assert.equal(parseHex(input).ok, false, String(input));
  }
});

test('hexToRgb splits a normalized color into channels', () => {
  assert.deepEqual(hexToRgb('#0095FF'), { r: 0, g: 149, b: 255 });
  assert.deepEqual(hexToRgb('#FFFFFF'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(hexToRgb('#000000'), { r: 0, g: 0, b: 0 });
});

test('planExport chooses scale 2 for a small node', () => {
  const result = planExport(100, 50, 10);
  assert.deepEqual(result, {
    ok: true,
    value: { scale: 2, padding: 22, width: 200 + 44, height: 100 + 44 },
  });
});

test('planExport falls back to scale 1 when scale 2 exceeds the axis limit', () => {
  const result = planExport(3000, 100, 2);
  assert.deepEqual(result, {
    ok: true,
    value: { scale: 1, padding: 4, width: 3000 + 8, height: 100 + 8 },
  });
});

test('planExport falls back to scale 1 when scale 2 exceeds the pixel limit', () => {
  const result = planExport(2000, 2000, 1);
  assert.deepEqual(result, {
    ok: true,
    value: { scale: 1, padding: 3, width: 2006, height: 2006 },
  });
});

test('planExport errors when neither scale fits', () => {
  const result = planExport(MAX_AXIS + 1, 10, 1);
  assert.equal(result.ok, false);
  const pixels = planExport(5000, 5000, 1);
  assert.equal(pixels.ok, false);
  assert.ok(5000 * 5000 > MAX_PIXELS);
});

test('planExport errors on non-positive or non-finite node sizes', () => {
  for (const [w, h] of [[0, 10], [10, 0], [-5, 10], [10, -5], [NaN, 10], [Infinity, 10]] as const) {
    assert.equal(planExport(w, h, 10).ok, false, `${w}x${h}`);
  }
});

test('isMainToUi accepts one valid sample per message type', () => {
  assert.equal(isMainToUi({ type: 'selection-state', revision: 1, source: { id: '1:2', name: 'Photo' }, error: null }), true);
  assert.equal(isMainToUi({ type: 'selection-state', revision: 0, source: null, error: 'Select one image.' }), true);
  assert.equal(
    isMainToUi({ type: 'source-ready', requestId: 'r1', settings, plan, png, output: 'image' }),
    true,
  );
  assert.equal(isMainToUi({ type: 'create-success', requestId: 'r1', name: 'Photo stroke' }), true);
  assert.equal(isMainToUi({ type: 'create-error', requestId: null, error: 'Failed.' }), true);
  assert.equal(
    isMainToUi({ type: 'selection-preview', revision: 2, png, width: 120.5, height: 80 }),
    true,
  );
});

test('isMainToUi rejects invalid samples per message type', () => {
  assert.equal(isMainToUi(null), false);
  assert.equal(isMainToUi({ type: 'unknown' }), false);
  assert.equal(isMainToUi({ type: 'selection-state', revision: '1', source: null, error: null }), false);
  assert.equal(isMainToUi({ type: 'source-ready', requestId: 'r1', settings, plan, png: [1, 2], output: 'image' }), false);
  assert.equal(
    isMainToUi({ type: 'source-ready', requestId: 'r1', settings: { width: 10, color: '#09f' }, plan, png, output: 'image' }),
    false,
  );
  assert.equal(
    isMainToUi({ type: 'source-ready', requestId: 'r1', settings, plan: { ...plan, scale: 3 }, png, output: 'image' }),
    false,
  );
  assert.equal(isMainToUi({ type: 'create-success', requestId: 'r1' }), false);
  assert.equal(isMainToUi({ type: 'create-error', requestId: 7, error: 'Failed.' }), false);
  assert.equal(isMainToUi({ type: 'selection-preview', revision: 2, png: [1, 2], width: 120, height: 80 }), false);
  assert.equal(isMainToUi({ type: 'selection-preview', revision: 2, png, width: 0, height: 80 }), false);
  assert.equal(isMainToUi({ type: 'selection-preview', revision: 2, png, width: 120, height: NaN }), false);
  assert.equal(isMainToUi({ type: 'selection-preview', png, width: 120, height: 80 }), false);
});

test('isUiToMain accepts one valid sample per message type', () => {
  assert.equal(isUiToMain({ type: 'ui-ready' }), true);
  assert.equal(
    isUiToMain({ type: 'create-request', requestId: 'r1', sourceNodeId: '1:2', selectionRevision: 3, settings, output: 'image' }),
    true,
  );
  assert.equal(isUiToMain({ type: 'render-result', requestId: 'r1', png, width: 100, height: 80 }), true);
  assert.equal(isUiToMain({ type: 'render-error', requestId: 'r1', error: 'Decode failed.' }), true);
  assert.equal(isUiToMain({ type: 'vector-result', requestId: 'r1', data: TRIANGLE }), true);
});

test('isUiToMain rejects invalid samples per message type', () => {
  assert.equal(isUiToMain(undefined), false);
  assert.equal(isUiToMain({ type: 'create-success', requestId: 'r1', name: 'x' }), false);
  assert.equal(
    isUiToMain({ type: 'create-request', requestId: 'r1', sourceNodeId: '1:2', selectionRevision: 3, settings: { width: 0, color: '#0095FF' }, output: 'image' }),
    false,
  );
  assert.equal(
    isUiToMain({ type: 'create-request', requestId: 'r1', sourceNodeId: '1:2', selectionRevision: '3', settings, output: 'image' }),
    false,
  );
  assert.equal(isUiToMain({ type: 'render-result', requestId: 'r1', png: 'data', width: 100, height: 80 }), false);
  assert.equal(isUiToMain({ type: 'render-result', requestId: 'r1', png, width: 100.5, height: 80 }), false);
  assert.equal(isUiToMain({ type: 'render-error', requestId: 'r1' }), false);
});

test('output kind is accepted for image and vector and rejected otherwise', () => {
  for (const output of ['image', 'vector']) {
    assert.equal(isMainToUi({ type: 'source-ready', requestId: 'r1', settings, plan, png, output }), true, output);
    assert.equal(
      isUiToMain({ type: 'create-request', requestId: 'r1', sourceNodeId: '1:2', selectionRevision: 3, settings, output }),
      true,
      output,
    );
  }
  for (const output of [undefined, 'raster', 'Vector', 1, null]) {
    assert.equal(isMainToUi({ type: 'source-ready', requestId: 'r1', settings, plan, png, output }), false, String(output));
    assert.equal(
      isUiToMain({ type: 'create-request', requestId: 'r1', sourceNodeId: '1:2', selectionRevision: 3, settings, output }),
      false,
      String(output),
    );
  }
});

test('isUiToMain rejects invalid vector-result samples', () => {
  const send = (data: unknown) => isUiToMain({ type: 'vector-result', requestId: 'r1', data });
  assert.equal(send(TRIANGLE), true);
  assert.equal(send(5), false);
  assert.equal(send(''), false);
  assert.equal(send('M 0 0 L 10 0 Z'), false);
  assert.equal(send('m 0 0 l 10 0 l 10 10 z'), false);
  assert.equal(send('M 0 0 C 1 1 2 2 3 3 L 10 10 Z'), false);
  assert.equal(send('M 0 0 L 1e3 0 L 10 10 Z'), false);
  assert.equal(send('M 0  0 L 10 0 L 10 10 Z'), false);
  assert.equal(send(`M 0 0 L 1 1 L 2 2 Z ${'M 0 0 L 1 1 L 2 2 Z '.repeat(MAX_PATH_CHARS / 20)}`), false);
  assert.equal(isUiToMain({ type: 'vector-result', requestId: 'r1' }), false);
  assert.equal(isUiToMain({ type: 'vector-result', data: TRIANGLE }), false);
});

test('isVectorPathData accepts negative and fractional numbers and several subpaths', () => {
  assert.equal(isVectorPathData('M -1.5 2.25 L 3 -4 L 0.5 0 Z'), true);
  assert.equal(isVectorPathData('M 0 0 L 10 0 L 10 10 Z M 2 2 L 4 2 L 4 4 L 2 4 Z'), true);
});

test('isVectorPathData rejects malformed strings', () => {
  for (const value of [
    'M 0 0 L 10 0 L 10 10',
    'M 0 0 L 10 0 L 10 10 Z ',
    ' M 0 0 L 10 0 L 10 10 Z',
    'M 0 0 L 10 0 L 10 10 Z M 1 1 L 2 2 Z',
    'M 0 0 L 10 0 L 10 10 ZM 1 1 L 2 2 L 3 3 Z',
    'M 0 0 L 10 0 L 10 10 Z L 1 1',
    'M 0 0 L 10. 0 L 10 10 Z',
    'M 0 0 L .5 0 L 10 10 Z',
    'M 0 0 L -  0 L 10 10 Z',
    'M 0 0 L 1E3 0 L 10 10 Z',
    'M 0 0 L 10 0 L 10 Z',
    'L 0 0 L 10 0 L 10 10 Z',
    null,
    undefined,
    42,
  ]) {
    assert.equal(isVectorPathData(value), false, String(value));
  }
});

test('isVectorPathData stays fast near the length limit', () => {
  const unit = 'M 0 0 L 1 0 L 1 1 Z';
  const data = Array.from({ length: Math.floor((MAX_PATH_CHARS - 20) / (unit.length + 1)) }, () => unit).join(' ');
  assert.ok(data.length > MAX_PATH_CHARS - 40 && data.length <= MAX_PATH_CHARS);
  const start = performance.now();
  assert.equal(isVectorPathData(data), true);
  assert.ok(performance.now() - start < 500);
  const hostile = `M 0 0 L ${'1'.repeat(MAX_PATH_CHARS - 20)}`;
  const hostileStart = performance.now();
  assert.equal(isVectorPathData(hostile), false);
  assert.ok(performance.now() - hostileStart < 500);
});

test('planVectorExport pads 2 px and prefers scale 2', () => {
  assert.deepEqual(planVectorExport(100, 50), {
    ok: true,
    value: { scale: 2, padding: 2, width: 204, height: 104 },
  });
  assert.deepEqual(planVectorExport(10.2, 5), {
    ok: true,
    value: { scale: 2, padding: 2, width: 21 + 4, height: 10 + 4 },
  });
});

test('planVectorExport falls back to scale 1 and errors when neither fits', () => {
  assert.deepEqual(planVectorExport(3000, 100), {
    ok: true,
    value: { scale: 1, padding: 2, width: 3004, height: 104 },
  });
  assert.equal(planVectorExport(MAX_AXIS, 10).ok, false);
  assert.equal(planVectorExport(5000, 5000).ok, false);
});

test('planVectorExport errors on non-positive or non-finite node sizes', () => {
  for (const [w, h] of [[0, 10], [10, 0], [-5, 10], [10, -5], [NaN, 10], [Infinity, 10]] as const) {
    assert.equal(planVectorExport(w, h).ok, false, `${w}x${h}`);
  }
});
