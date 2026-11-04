import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadContent } from '../../src/services/exercises.js';
import { examMark, examMaxMark, placementView, requiredWeight, trackProgress, valueOf } from '../../src/services/marks.js';

loadContent(resolve(import.meta.dirname, '../../../content'));

test('values follow the weights: Java CP1 is 10/20/30/40%, optional 50%', () => {
  assert.equal(requiredWeight('java', '1'), 28000);
  assert.equal(valueOf('java', '1', 'goodbye-mars'), 10);
  assert.equal(valueOf('java', '1', 'sort-array'), 40);
  assert.equal(valueOf('java', '1', 'factorial'), 50);
  assert.equal(valueOf('java', '1', 'no-such'), null);
});

test('exam mark sums values passed; optional goes above 100%', () => {
  const items = [['goodbye-mars', 1], ['unit-converter', 2], ['strlen', 3], ['sort-array', 4], ['factorial', 5]].map(([slug]) => ({ slug: slug as string, passed: true }));
  assert.equal(examMark('java', '1', items), 150);
  assert.equal(examMark('java', '1', items.map((i, n) => ({ ...i, passed: n < 2 }))), 30);
  assert.equal(examMaxMark('java', '1', items.map((i) => i.slug)), 150);
});

test('JS weights are balanced like the other tracks', () => {
  assert.equal(valueOf('js', '1', 'js-factorial'), 6.7);
  assert.equal(valueOf('js', '1', 'js-even-sum'), 6.7);
});

test('placements sent to the browser carry a value, never the weight', () => {
  const v = placementView('java', 'factorial', { checkpoint: '1', level: 5, baseXp: 14000, category: 'optional' });
  assert.equal('baseXp' in v, false);
  assert.equal(v.value, 50);
});

test('track progress is weighted and stays within 0–100', () => {
  assert.equal(trackProgress('java', ['goodbye-mars'], new Set()), 0);
  assert.equal(trackProgress('java', ['goodbye-mars', 'sort-array'], new Set(['goodbye-mars', 'sort-array'])), 100);
  const p = trackProgress('java', ['goodbye-mars', 'sort-array'], new Set(['sort-array']));
  assert.ok(p > 50 && p < 100);
});
