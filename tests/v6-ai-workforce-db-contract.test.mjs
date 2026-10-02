import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('AI Workforce browser DB contract', () => {
  it('uses the actual TiqnoraDB API exported by js/db.js', () => {
    const db = readFileSync(new URL('../js/db.js', import.meta.url), 'utf8');
    const workforce = readFileSync(new URL('../admin/ai-workforce/workforce.js', import.meta.url), 'utf8');

    assert.match(db, /ready:\s*readyPromise/);
    assert.match(db, /isEnabled:\s*\(\)\s*=>\s*enabled/);
    assert.match(db, /getClient:\s*\(\)\s*=>\s*client/);

    assert.match(workforce, /TiqnoraDB\?\.isEnabled\?\.\(\)/);
    assert.match(workforce, /await window\.TiqnoraDB\.ready/);
    assert.match(workforce, /TiqnoraDB\.getClient\?\.\(\)/);

    assert.doesNotMatch(workforce, /TiqnoraDB\?\.isConfigured/);
    assert.doesNotMatch(workforce, /TiqnoraDB\.ready\(\)/);
    assert.doesNotMatch(workforce, /TiqnoraDB\.raw/);
  });
});
