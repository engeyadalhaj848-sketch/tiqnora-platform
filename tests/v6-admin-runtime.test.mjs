import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/admin-app.js', import.meta.url), 'utf8');

function hasSingleSelector(selector) {
  const escaped = selector.replace(/[.*+?^$()|[\\]\\\\]/g, '\\$&');
  return new RegExp('(^|[^$])\\$\\(' + escaped + '\\)').test(source);
}

test('V6 proposal price inputs use a collection selector', () => {
  assert.match(source, /\\$\\$\\('\\[data-proposal-price\\]'\\)/);
  assert.equal(hasSingleSelector("'[data-proposal-price]'"), false);
});

test('V6 pending approval buttons use collection selectors', () => {
  assert.match(source, /\\$\\$\\('\\[data-v6-approve\\]'\\)\\.forEach/);
  assert.match(source, /\\$\\$\\('\\[data-v6-reject\\]'\\)\\.forEach/);
  assert.equal(hasSingleSelector("'[data-v6-approve]'"), false);
  assert.equal(hasSingleSelector("'[data-v6-reject]'"), false);
});
