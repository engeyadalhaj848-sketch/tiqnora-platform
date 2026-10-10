import test from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_REGISTRY } from '../lib/v6/workforce/registry.js';
import { getSkillsForAgent, allowedMcpTools, buildSkillsPrompt, buildAgentCard, listAgentSkillBindings } from '../lib/v6/agent-runtime.js';

const cases = [
  ['manager_agent', 'executive_routing', 'workflow.read', 'construction'],
  ['lead_research_agent', 'lead_qualification', 'crm.read', 'hotels'],
  ['sales_agent', 'sales_discovery', 'crm.read', 'clinics'],
  ['proposal_agent', 'proposal_scoping', 'crm.draft', 'real estate'],
  ['marketing_agent', 'growth_strategy', 'analytics.read', 'restaurants'],
  ['content_agent', 'content_strategy', 'social.draft', 'education'],
  ['design_agent', 'sector_uiux', 'media.read', 'healthcare'],
  ['video_agent', 'video_direction', 'media.read', 'retail'],
  ['social_agent', 'social_growth', 'social.read', 'technology'],
  ['seo_agent', 'local_seo_intent', 'analytics.read', 'services'],
  ['reputation_agent', 'reputation_care', 'social.read', 'hospitality'],
  ['customer_success_agent', 'customer_ops', 'crm.read', 'e-commerce'],
  ['operations_agent', 'workflow_operations', 'workflow.read', 'property management']
];

test('every Registry workforce agent resolves specialist skills and conservative MCP scopes', () => {
  assert.equal(new Set(cases.map(c => c[3])).size, 13, 'Each acceptance scenario must use a distinct industry');
  assert.deepEqual(Object.keys(AGENT_REGISTRY).sort(), cases.map(c => c[0]).sort());
  for (const [slug, specialty, tool] of cases) {
    const skills = getSkillsForAgent(slug).map(s => s.id);
    const tools = allowedMcpTools(slug);
    assert.ok(skills.includes(specialty), slug + ' missing specialty');
    assert.ok(tools.includes(tool), slug + ' missing tool');
    assert.ok(skills.includes('grounded_research'), slug + ' missing grounding');
    assert.equal(tools.some(t => /\.(send|publish|purchase|delete)$/.test(t)), false, slug + ' has unsafe side-effect scope');
    const card = buildAgentCard({ slug });
    assert.deepEqual(card.skills, skills);
    assert.equal(card.external_actions_require_approval, true);
  }
});

test('all workforce agents receive cross-sector grounding and self-review prompts', () => {
  for (const [slug] of cases) {
    const prompt = buildSkillsPrompt(slug);
    assert.match(prompt, /cross-sector specialist/);
    assert.match(prompt, /real examples or references/);
    assert.match(prompt, /Self-review before final delivery/);
    assert.match(prompt, /approval-gated/);
  }
  const designPrompt = buildSkillsPrompt('design_agent');
  for (const sector of ['restaurants', 'clinics', 'real estate', 'contracting', 'stores', 'hotels', 'education', 'technology']) {
    assert.ok(designPrompt.includes(sector), 'missing design sector ' + sector);
  }
});

test('Skills UI exposes registry aliases without removing legacy bindings', () => {
  const bindings = listAgentSkillBindings();
  for (const [slug, specialty] of cases) {
    assert.ok(bindings.some(b => b.agent_slug === slug && b.skill_ids.includes(specialty)));
  }
  assert.ok(bindings.some(b => b.agent_slug === 'image-designer'));
  assert.ok(bindings.some(b => b.agent_slug === 'developer'));
});
