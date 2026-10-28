import test from 'node:test';
import assert from 'node:assert/strict';
import { getSkillsForAgent, buildSkillsPrompt, allowedMcpTools, orchestrationContext, listRuntimeSkills } from '../lib/v6/agent-runtime.js';

test('Headcount skills reach the appropriate runtime prompts without granting write tools', () => {
  for (const slug of ['marketing', 'content', 'social-media', 'ads']) {
    const ids = getSkillsForAgent(slug).map(skill => skill.id);
    assert.ok(ids.includes('headcount_brand_voice'));
    assert.ok(ids.includes('headcount_marketing_copywriting'));
    assert.ok(!ids.includes('headcount_code_review'));
    assert.match(buildSkillsPrompt(slug), /تقنورا/);
    assert.match(buildSkillsPrompt(slug), /Sentence rhythm/);
  }
  assert.match(buildSkillsPrompt('sales'), /Know where deals actually stall/);
  assert.match(buildSkillsPrompt('developer'), /Verify before implementing/);
  assert.ok(!getSkillsForAgent('unknown').some(skill => skill.id.startsWith('headcount_')));
  assert.ok(!allowedMcpTools('developer').some(tool => /write|deploy|publish/.test(tool)));
  const runtime = orchestrationContext({ agent: { slug: 'developer' }, message: 'Review this change' });
  assert.match(runtime.skills_prompt, /US legal references are not Saudi legal authority/);
  assert.match(runtime.skills_prompt, /never claim a review/);
  assert.equal(listRuntimeSkills().filter(skill => skill.id.startsWith('headcount_')).length, 4);
});
