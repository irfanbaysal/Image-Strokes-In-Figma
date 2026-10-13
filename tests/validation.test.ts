import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, parseHex, parseWidth, planExport, MAX_AXIS, MAX_PIXELS } from '../src/image/validation.ts';
import { isMainToUi, isUiToMain } from '../src/shared/messages.ts';

const WIDTH_ERROR = 'Width must be a whole number from 1 to 200.';
const plan = { scale: 2 as const, padding: 4, width: 100, height: 80 };
const settings = { width: 10, color: '#0095FF' };
const png = new Uint8Array([137, 80, 78, 71]);

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
    isMainToUi({ type: 'source-ready', requestId: 'r1', settings, plan, png }),
    true,
  );
  assert.equal(isMainToUi({ type: 'create-success', requestId: 'r1', name: 'Photo stroke' }), true);
  assert.equal(isMainToUi({ type: 'create-error', requestId: null, error: 'Failed.' }), true);
});

test('isMainToUi rejects invalid samples per message type', () => {
  assert.equal(isMainToUi(null), false);
  assert.equal(isMainToUi({ type: 'unknown' }), false);
  assert.equal(isMainToUi({ type: 'selection-state', revision: '1', source: null, error: null }), false);
  assert.equal(isMainToUi({ type: 'source-ready', requestId: 'r1', settings, plan, png: [1, 2] }), false);
  assert.equal(
    isMainToUi({ type: 'source-ready', requestId: 'r1', settings: { width: 10, color: '#09f' }, plan, png }),
    false,
  );
  assert.equal(
    isMainToUi({ type: 'source-ready', requestId: 'r1', settings, plan: { ...plan, scale: 3 }, png }),
    false,
  );
  assert.equal(isMainToUi({ type: 'create-success', requestId: 'r1' }), false);
  assert.equal(isMainToUi({ type: 'create-error', requestId: 7, error: 'Failed.' }), false);
});

test('isUiToMain accepts one valid sample per message type', () => {
  assert.equal(isUiToMain({ type: 'ui-ready' }), true);
  assert.equal(
    isUiToMain({ type: 'create-request', requestId: 'r1', sourceNodeId: '1:2', selectionRevision: 3, settings }),
    true,
  );
  assert.equal(isUiToMain({ type: 'render-result', requestId: 'r1', png, width: 100, height: 80 }), true);
  assert.equal(isUiToMain({ type: 'render-error', requestId: 'r1', error: 'Decode failed.' }), true);
});

test('isUiToMain rejects invalid samples per message type', () => {
  assert.equal(isUiToMain(undefined), false);
  assert.equal(isUiToMain({ type: 'create-success', requestId: 'r1', name: 'x' }), false);
  assert.equal(
    isUiToMain({ type: 'create-request', requestId: 'r1', sourceNodeId: '1:2', selectionRevision: 3, settings: { width: 0, color: '#0095FF' } }),
    false,
  );
  assert.equal(
    isUiToMain({ type: 'create-request', requestId: 'r1', sourceNodeId: '1:2', selectionRevision: '3', settings }),
    false,
  );
  assert.equal(isUiToMain({ type: 'render-result', requestId: 'r1', png: 'data', width: 100, height: 80 }), false);
  assert.equal(isUiToMain({ type: 'render-result', requestId: 'r1', png, width: 100.5, height: 80 }), false);
  assert.equal(isUiToMain({ type: 'render-error', requestId: 'r1' }), false);
});
