import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/admin-app.js', import.meta.url), 'utf8');

test('V6 proposal price inputs use a collection selector', () => {
  assert.equal(source.includes("$$('[data-proposal-price]')"), true);
  assert.equal(source.includes("$('[data-proposal-price]')"), false);
});

test('V6 pending approval buttons use collection selectors', () => {
  assert.equal(source.includes("$$('[data-v6-approve]')"), true);
  assert.equal(source.includes("$$('[data-v6-reject]')"), true);
  assert.equal(source.includes("$('[data-v6-approve]')"), false);
  assert.equal(source.includes("$('[data-v6-reject]')"), false);
});
