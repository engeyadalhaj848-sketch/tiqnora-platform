/**
 * E2E / test fixture only — uses collaboration-executor with injected handlers.
 * Not the production chat entrypoint.
 */
import { isAgentArchV2Enabled } from './feature-flags.js';
import { runWorkflow } from './orchestrator.js';
import { executeCollaboration } from './collaboration-executor.js';
import { createMemoryRepository, createEvaluationRepository, sha256, getDefaultStore } from './repos/index.js';
import { ingestDocument, searchKnowledge, buildGroundedContext } from './rag.js';
import { recordLearningFromEval } from './learning.js';
import { createTraceRepository } from './repos/index.js';

function specialistHandlers(title, grounded, memoryHits) {
  return [
    {
      key: 'marketing_agent',
      agent_id: '00000000-0000-4000-8000-000000000001',
      async handler({ task }) {
        const plan = { objective: title, cta: memoryHits.find(m => m.key === 'brand:cta')?.content || 'ناقش مشروعك', auto_publish: false };
        return { artifact_type: 'report', artifact_content: plan, plan };
      }
    },
    {
      key: 'content_agent',
      agent_id: '00000000-0000-4000-8000-000000000002',
      async handler({ previous }) {
        const m = previous.find(p => p.key === 'marketing_agent');
        const body = 'حملة: ' + title + '\n' + (m?.output?.plan?.cta || '') + '\n' + (grounded.model_context || '').slice(0, 120);
        return { artifact_type: 'content_draft', artifact_content: body, draft: body };
      }
    },
    {
      key: 'design_agent',
      agent_id: '00000000-0000-4000-8000-000000000003',
      async handler({ previous }) {
        const c = previous.find(p => p.key === 'content_agent');
        const brief = { concept: String(c?.output?.draft || '').slice(0, 80), style: 'navy cyan' };
        return { artifact_type: 'creative_brief', artifact_content: brief, brief };
      }
    },
    {
      key: 'manager_agent',
      agent_id: '00000000-0000-4000-8000-000000000004',
      async handler({ previous }) {
        const summary = { specialists: previous.map(p => p.key), requires_approval: true, auto_publish: false };
        return { artifact_type: 'report', artifact_content: summary, summary };
      }
    }
  ];
}

export async function runCampaignE2E({
  title = 'جهز حملة لخدمة تصميم المواقع في Tiqnora',
  store = getDefaultStore(),
  env = process.env,
  organization_id = '00000000-0000-4000-8000-000000000099'
} = {}) {
  if (!isAgentArchV2Enabled(env)) {
    const legacy = await runWorkflow('daily_marketing', { name: title }, { trigger: 'e2e_legacy' });
    return { ok: true, mode: 'legacy', path: 'orchestrator.runWorkflow', external_actions: legacy.external_actions ?? 0, auto_publish: false, specialists_executed: [], legacy };
  }

  await ingestDocument({ organization_id, title: 'Tiqnora Web Design', content: 'Tiqnora provides custom website design for Saudi businesses. CTA: ناقش مشروعك.' }, store);
  const memory = createMemoryRepository(store);
  await memory.remember({ organization_id, agent_key: 'marketing_agent', memory_type: 'semantic', scope: 'shared', key: 'brand:cta', content: 'Primary CTA: ناقش مشروعك', tags: ['service', 'brand'] });
  const memoryHits = await memory.search({ organization_id, query: 'CTA', limit: 5 });
  const ragHits = await searchKnowledge('Tiqnora website design', { limit: 5, store, organization_id });
  const grounded = buildGroundedContext(ragHits);

  const collab = await executeCollaboration({
    store,
    organization_id,
    specialists: specialistHandlers(title, grounded, memoryHits),
    task: { title },
    requireIdentity: false
  });

  const allVerified = collab.results.every(r => !r.verified || r.verified.ok);
  const evals = createEvaluationRepository(store);
  const savedEval = await evals.save({
    organization_id,
    agent_id: '00000000-0000-4000-8000-000000000002',
    agent_key: 'content_agent',
    trace_id: collab.trace_id,
    score: allVerified ? 90 : 30,
    passed: allVerified,
    failure_reason: allVerified ? null : 'artifact_verification_failed',
    failures: allVerified ? [] : ['artifact_verification_failed']
  });
  const learning = await recordLearningFromEval(savedEval, { agent_key: 'content_agent', store });

  return {
    ok: true,
    mode: 'v2',
    path: 'collaboration-executor',
    trace_id: collab.trace_id,
    specialists_executed: collab.specialists_executed,
    specialist_results: collab.results,
    a2a_count: Math.max(0, collab.results.length - 1),
    memory_hits: memoryHits.length,
    rag_hits: ragHits.length,
    evaluation: savedEval,
    evaluation_count: 1,
    learning,
    external_actions: 0,
    auto_publish: false,
    auto_send: false
  };
}

export async function recallAfterRun(trace_id, store = getDefaultStore()) {
  const { createMemoryRepository, createArtifactRepository, createEvaluationRepository, createMessageRepository, createTraceRepository } = await import('./repos/index.js');
  const traces = createTraceRepository(store);
  const tr = await traces.getTrace(trace_id);
  const evals = await createEvaluationRepository(store).list({ trace_id, limit: 10 });
  return {
    trace_found: !!tr,
    trace_status: tr?.status || null,
    memory_found: (await createMemoryRepository(store).search({ query: 'e2e campaign', limit: 10 })).length > 0 || (await createMemoryRepository(store).search({ query: 'CTA', limit: 5 })).length > 0,
    artifacts_found: (await createArtifactRepository(store).list({ trace_id, limit: 20 })).length > 0,
    evaluations_found: evals.length > 0,
    evaluation_count: evals.length,
    a2a_found: (await createMessageRepository(store).list({ trace_id, limit: 20 })).length > 0
  };
}
