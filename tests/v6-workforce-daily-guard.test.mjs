import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDailyTaskContext, sectorForDay, validateDailyTaskDraft } from '../lib/workforce-daily-guard.js';

const roles = [
  'manager', 'lead_research', 'sales', 'proposal', 'marketing', 'content', 'design',
  'video', 'social', 'seo', 'reputation', 'customer_success', 'operations'
];

for (const role of roles) {
  test('sector-specific context: ' + role, () => {
    const agent = { slug: role, system_prompt: 'Expert ' + role + ' system instructions.' };
    const task = { title: 'Design a practical service approach', description: 'Saudi business needs a specific plan.' };
    const today = buildDailyTaskContext({ agent, task, memories: [], dateKey: '2026-10-23' });
    const prior = buildDailyTaskContext({ agent, task, memories: [], dateKey: '2026-10-22' });
    assert.equal(today.role, role);
    assert.notEqual(today.sector, prior.sector);
    assert.match(today.system, /seasoned, cross-industry specialist/);
    assert.match(today.system, /Tiqnora AI is a Saudi technology business/);
    assert.match(today.system, /#0A5CFF/);
    assert.match(today.system, /Specialist focus:/);
    assert.match(today.system, /مراجعة ذاتية/);
    assert.match(today.prompt, /Sector for this acceptance scenario/);
    assert.equal(today.sector, sectorForDay(role, '2026-10-23'));
  });
}

test('generic output is rejected even if it says self-review', () => {
  const result = validateDailyTaskDraft('A generic plan. مراجعة ذاتية. ' + 'Same advice for every business. '.repeat(12));
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes('incomplete_self_review') || result.issues.includes('missing_sector_assessment'));
});

test('detailed human-reviewable draft passes only the heuristic gate', () => {
  const output = 'مقترح لمطعم: قائمة عربية واضحة، صفحة طلبات جوال، خيارات استلام وتوصيل، ومؤشرات تحويل. '.repeat(3) +
    '\nمراجعة ذاتية: ملاءمة القطاع للمطاعم تستدعي رحلة طلب سريعة. الهوية البصرية تلتزم بألوان تيكنورا المعتمدة. ' +
    'المصدر غير متوفر للتحقق من أرقام الطلبات، ولذلك جميع المقاييس المقترحة افتراضات وليست حقائق. ' +
    'حالة الموافقة: مسودة تتطلب موافقة بشرية قبل النشر أو الإرسال.';
  const result = validateDailyTaskDraft(output, { provider: 'groq' });
  assert.equal(result.passed, true, JSON.stringify(result.issues));
});

test('unapproved publication claim is blocked', () => {
  const text = 'auto-publish: yes. ' + 'تفاصيل قطاع المطاعم وهوية التصميم. '.repeat(8) +
    '\nمراجعة ذاتية: القطاع مناسب. الهوية متسقة. لا يوجد مصدر للتحقق. الموافقة البشرية مطلوبة.';
  assert.ok(validateDailyTaskDraft(text).issues.includes('unauthorized_publication_claim'));
});

test('EGP in sales drafts is blocked for Saudi business', () => {
  const text = 'مبيعات CRM بقيمة 500 ج.م ' + 'نموذج متكامل '.repeat(20) +
    '\nمراجعة ذاتية: القطاع العقاري مناسب، الهوية واضحة، لا مصدر للأرقام، الموافقة البشرية مطلوبة.';
  assert.ok(validateDailyTaskDraft(text).issues.includes('wrong_market_currency'));
});

test('deterministic fallback is never accepted as verified quality', () => {
  const text = 'ملخص مناسب '.repeat(30) +
    '\nمراجعة ذاتية: القطاع مطاعم، الهوية مناسبة، لا يوجد مصدر، الموافقة البشرية مطلوبة.';
  assert.ok(validateDailyTaskDraft(text, { provider: 'deterministic', degraded: true }).issues.includes('degraded_or_deterministic'));
});

test('daily runner and scheduler enforce approval and specialist context', () => {
  const runner = readFileSync(new URL('../lib/autonomous-sales.js', import.meta.url), 'utf8');
  const scheduler = readFileSync(new URL('../lib/cron-growth.js', import.meta.url), 'utf8');
  assert.match(runner, /buildDailyTaskContext\(/);
  assert.match(runner, /validateDailyTaskDraft\(/);
  assert.match(runner, /review_status: 'pending_human_approval'/);
  assert.match(runner, /requires_approval: true/);
  assert.match(scheduler, /requires_approval: true/);
  assert.doesNotMatch(runner, /system: 'Tiqnora agent\. Draft only\. No external send\.'/);
});
