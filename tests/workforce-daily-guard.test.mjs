import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTORS, sectorForDay, buildDailyTaskContext, validateDailyTaskDraft } from '../lib/workforce-daily-guard.js';

const agents = [
  'manager','lead_research','sales','proposal','marketing','content','design',
  'video','social','seo','reputation','customer_success','operations'
];

test('all thirteen specialist roles get a sector-specific context and self-review requirement', () => {
  for (const slug of agents) {
    const result = buildDailyTaskContext({
      agent: { slug, system_prompt: 'Independent system prompt for ' + slug },
      task: { title: 'Create a realistic sector-specific recommendation', description: 'No fabricated evidence.' },
      memories: ['Verified organization memory'], dateKey: '2026-10-18'
    });
    assert.ok(result.system.includes('Independent system prompt for ' + slug));
    assert.ok(result.system.includes('مراجعة ذاتية'));
    assert.ok(result.prompt.includes('Verified organization memory'));
    assert.ok(SECTORS.includes(result.sector));
    assert.ok(result.system.includes('Sector test:'));
  }
});

test('sector changes on next day for same agent', () => {
  for (const slug of agents) {
    assert.notEqual(sectorForDay(slug, '2026-10-17'), sectorForDay(slug, '2026-10-18'));
  }
});

test('rejects generic placeholders, missing self-review and deterministic fallback', () => {
  assert.equal(validateDailyTaskDraft('Generic plan without a review.').passed, false);
  assert.equal(validateDailyTaskDraft('A'.repeat(160) + ' مراجعة ذاتية: [اسم العميل]').passed, false);
  assert.equal(validateDailyTaskDraft('A'.repeat(160) + ' مراجعة ذاتية: تم التحقق.', { provider: 'deterministic' }).passed, false);
  assert.equal(validateDailyTaskDraft('A'.repeat(160) + ' مراجعة ذاتية: الملاءمة القطاعية والهوية والفجوات والموافقة موثقة.').passed, true);
});

test('requires independent system prompt', () => {
  assert.throws(() => buildDailyTaskContext({ agent: { slug: 'design', system_prompt: '' }, task: {} }), /Missing specialist/);
});
