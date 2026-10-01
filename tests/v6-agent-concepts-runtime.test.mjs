import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  AGENT_CONCEPTS,
  getSkillsForAgent,
  allowedMcpTools,
  buildAgentCard,
  buildStateSnapshot,
  retrieveRagCandidates,
  evaluateAgentResponse,
  buildLearningEvent,
  runAgentHarness,
  createA2AEnvelope,
  planMultiAgentDelegation,
  orchestrationContext
} from '../lib/v6/agent-runtime.js';

test('runtime exposes all nine agent concepts', () => {
  assert.deepEqual(AGENT_CONCEPTS, [
    'memory_state',
    'orchestration',
    'rag',
    'harness',
    'evals',
    'mcp',
    'skills',
    'a2a',
    'multi_agent'
  ]);
});

test('skills and MCP are scoped by specialist', () => {
  assert.ok(getSkillsForAgent('sales').some(skill => skill.id === 'sales_discovery'));
  assert.ok(getSkillsForAgent('developer').some(skill => skill.id === 'software_engineering'));
  assert.ok(allowedMcpTools('developer').includes('github.read'));
  assert.equal(allowedMcpTools('sales').includes('github.read'), false);
});

test('agent card exposes reusable skills and guarded tools', () => {
  const card = buildAgentCard({ id: 'a1', slug: 'image-designer', name: 'Designer' });
  assert.equal(card.protocol, 'tiqnora-a2a/v1');
  assert.ok(card.skills.includes('visual_direction'));
  assert.ok(card.tools.includes('media.generate_image'));
  assert.equal(card.external_actions_require_approval, true);
});

test('memory and state snapshot is bounded and explicit', () => {
  const state = buildStateSnapshot({
    agent: { slug: 'sales' },
    state: { version: 3, current_goal: 'qualify lead', mode: 'working' },
    memory: [{}, {}],
    tasks: [{}],
    recent: [{}, {}, {}]
  });
  assert.equal(state.version, 3);
  assert.equal(state.agent_slug, 'sales');
  assert.equal(state.memory_items, 2);
  assert.equal(state.open_tasks, 1);
  assert.equal(state.recent_turns, 3);
});

test('RAG retrieval selects matching grounded chunks', () => {
  const chunks = [
    { id: '1', title: 'WhatsApp', content: 'Tiqnora uses approval before outbound WhatsApp customer messages.' },
    { id: '2', title: 'Commerce', content: 'Supplier catalog and shipping workflow.' }
  ];
  const found = retrieveRagCandidates('WhatsApp approval', chunks);
  assert.ok(found.length > 0);
});

test('evals propose review-gated learning instead of silently self-modifying', () => {
  const evaluation = evaluateAgentResponse({
    agentSlug: 'sales',
    message: 'اكتب خطة متابعة للعميل',
    response: 'حسنا'
  });
  assert.equal(evaluation.pass, false);
  const lesson = buildLearningEvent(evaluation);
  assert.equal(lesson.status, 'proposed');
  assert.equal(lesson.auto_apply, false);
  assert.equal(lesson.requires_human_approval, true);
});

test('harness can retry one weak response then keep evaluated result', async () => {
  let calls = 0;
  const result = await runAgentHarness({
    agent: { slug: 'content' },
    message: 'اكتب خطة محتوى عملية',
    invoke: async () => {
      calls += 1;
      return calls === 1
        ? { text: 'قصير' }
        : { text: 'خطة محتوى عملية تتضمن الهدف والجمهور ومحاور المحتوى والمنصات وجدول الاختبارات ومؤشرات القياس وخطوة المراجعة قبل النشر.' };
    }
  });
  assert.equal(calls, 2);
  assert.ok(result.evaluation.score >= 75);
});

test('A2A envelope is bounded and traceable', () => {
  const envelope = createA2AEnvelope({
    from: 'manager',
    to: 'developer',
    task: 'inspect deployment',
    message: 'check the failing route'
  });
  assert.equal(envelope.protocol, 'tiqnora-a2a/v1');
  assert.equal(envelope.from, 'manager');
  assert.equal(envelope.to, 'developer');
  assert.equal(envelope.hop, 1);
  assert.ok(envelope.correlation_id);
});

test('multi-agent planner assigns matching specialists and manager synthesis', () => {
  const plan = planMultiAgentDelegation(
    'ابغى حملة تسويق وتصميم صورة وفيديو وإصلاح الموقع',
    [
      { slug: 'manager' },
      { slug: 'marketing' },
      { slug: 'image-designer' },
      { slug: 'video-designer' },
      { slug: 'developer' },
      { slug: 'sales' }
    ]
  );
  const participants = plan.participants.map(p => p.slug);
  assert.ok(participants.includes('marketing'));
  assert.ok(participants.includes('image-designer'));
  assert.ok(participants.includes('video-designer'));
  assert.ok(participants.includes('developer'));
  assert.equal(plan.manager_synthesis_required, true);
});

test('orchestration context combines state, skills, RAG, tools and delegation', () => {
  const ctx = orchestrationContext({
    agent: { slug: 'manager' },
    message: 'حل مشكلة الموقع وسو خطة تسويق',
    agents: [{ slug: 'manager' }, { slug: 'developer' }, { slug: 'marketing' }],
    knowledge: [{ id: 'k1', title: 'Runbook', content: 'Deployment runbook' }]
  });
  assert.equal(ctx.agent_card.slug, 'manager');
  assert.ok(ctx.skills_prompt.includes('Loaded specialist skills'));
  assert.ok(Array.isArray(ctx.tools));
  assert.ok(ctx.delegation);
});

test('migration contains persistence for state, RAG, evals, learning and A2A', () => {
  const sql = readFileSync(new URL('../supabase/migrations/060_agent_concepts_runtime.sql', import.meta.url), 'utf8');
  for (const table of [
    'ai_agent_state',
    'ai_knowledge_documents',
    'ai_knowledge_chunks',
    'ai_agent_evals',
    'ai_agent_learning_events',
    'ai_agent_messages'
  ]) {
    assert.ok(sql.includes(table), table);
  }
  assert.ok(sql.includes('search_agent_knowledge'));
  assert.ok(sql.includes("status in ('proposed','approved','rejected','applied')"));
});


test('Telegram collaboration room uses standardized A2A and multi-agent runtime', () => {
  const src = readFileSync(new URL('../lib/telegram-agent-room.js', import.meta.url), 'utf8');
  assert.ok(src.includes('createA2AEnvelope'));
  assert.ok(src.includes('planMultiAgentDelegation'));
  assert.ok(src.includes('runAgentHarness'));
  assert.ok(src.includes('ai_agent_messages'));
  assert.ok(src.includes('ai_agent_evals'));
  assert.ok(src.includes('buildSkillsPrompt'));
  assert.ok(src.includes('allowedMcpTools'));
});

test('workforce chat loads state, RAG, skills, harness and eval persistence', () => {
  const src = readFileSync(new URL('../api/ai-workforce/chat.js', import.meta.url), 'utf8');
  assert.ok(src.includes('ai_agent_state'));
  assert.ok(src.includes('ai_knowledge_chunks'));
  assert.ok(src.includes('orchestrationContext'));
  assert.ok(src.includes('runAgentHarness'));
  assert.ok(src.includes('ai_agent_evals'));
  assert.ok(src.includes('ai_agent_learning_events'));
});
