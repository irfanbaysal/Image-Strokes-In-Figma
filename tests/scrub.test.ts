import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubValue } from '../src/ui/scrub.ts';

test('zero delta keeps the start value', () => {
  assert.equal(scrubValue(10, 0, 0, 100, 2, false), 10);
});

test('positive and negative deltas', () => {
  assert.equal(scrubValue(10, 8, 0, 100, 2, false), 14);
  assert.equal(scrubValue(10, -8, 0, 100, 2, false), 6);
});

test('truncates toward zero below one step', () => {
  assert.equal(scrubValue(10, 1, 0, 100, 2, false), 10);
  assert.equal(scrubValue(10, -1, 0, 100, 2, false), 10);
  assert.equal(scrubValue(10, 3, 0, 100, 2, false), 11);
  assert.equal(scrubValue(10, -3, 0, 100, 2, false), 9);
});

test('custom pixelsPerStep', () => {
  assert.equal(scrubValue(0, 10, 0, 100, 5, false), 2);
  assert.equal(scrubValue(50, -9, 0, 100, 1, false), 41);
});

test('fast mode multiplies by ten', () => {
  assert.equal(scrubValue(0, 6, 0, 100, 2, true), 30);
  assert.equal(scrubValue(50, -4, 0, 100, 2, true), 30);
});

test('clamps at min and max', () => {
  assert.equal(scrubValue(5, -100, 0, 100, 2, false), 0);
  assert.equal(scrubValue(95, 100, 0, 100, 2, false), 100);
  assert.equal(scrubValue(95, 100, 0, 100, 2, true), 100);
});

test('non-integer start is rounded before use', () => {
  assert.equal(scrubValue(4.6, 0, 0, 100, 2, false), 5);
  assert.equal(scrubValue(4.4, 4, 0, 100, 2, false), 6);
});
