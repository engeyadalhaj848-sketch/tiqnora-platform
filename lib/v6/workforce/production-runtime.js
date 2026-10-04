/**
 * Production workforce V2 runtime — NOT the E2E fixture.
 * Used by API entrypoint when AGENT_ARCH_V2_ENABLED=true.
 */

import { isAgentArchV2Enabled, architectureMode } from './feature-flags.js';
import {
  orchestrationContext,
  formatStateContext,
  runAgentHarness,
  evaluateAgentResponse,
  buildLearningEvent
} from '../agent-runtime.js';

/**
 * Resolve whether this request should use V2 runtime.
 * @param {object} env
 */
export function selectRuntimeMode(env = process.env) {
  return {
    mode: architectureMode(env),
    v2: isAgentArchV2Enabled(env),
    path: isAgentArchV2Enabled(env) ? 'production-runtime.v2' : 'legacy.chat'
  };
}

/**
 * Build V2 orchestration envelope for a live chat request.
 * Does not invent agents or skip org/agent identity.
 */
export function buildV2RuntimeContext({
  agent,
  message,
  agents = [],
  state,
  memory,
  tasks,
  recent,
  knowledge = [],
  approvedLessons = []
}) {
  if (!agent?.id) throw new Error('agent_id_required');
  if (!agent?.organization_id) throw new Error('organization_id_required');
  const runtime = orchestrationContext({
    agent,
    message,
    agents,
    state,
    memory,
    tasks,
    recent,
    knowledge,
    approvedLessons
  });
  return {
    ...runtime,
    organization_id: agent.organization_id,
    agent_id: agent.id,
    agent_key: agent.slug || agent.id,
    mode: 'v2',
    path: 'production-runtime.v2'
  };
}

/**
 * Run harness + eval for production chat (provider invoke injected by caller).
 */
export async function runV2AgentTurn({
  agent,
  message,
  knowledge = [],
  runtime,
  invoke
}) {
  if (!agent?.id || !agent?.organization_id) {
    throw new Error('production_identity_required');
  }
  const harnessRun = await runAgentHarness({
    agent,
    message,
    knowledge,
    executionContract: runtime?.execution_contract || null,
    invoke
  });
  const responseText =
    harnessRun?.result?.text ??
    harnessRun?.text ??
    harnessRun?.response ??
    (typeof harnessRun?.result === 'string' ? harnessRun.result : '') ??
    '';
  if (responseText && typeof responseText !== 'string') {
    throw new Error('harness_response_not_text');
  }
  const evaluation = evaluateAgentResponse({
    agentSlug: agent.slug,
    message,
    response: responseText,
    knowledge
  });
  const learning = evaluation?.pass ? null : buildLearningEvent(evaluation, {
    agent_id: agent.id,
    organization_id: agent.organization_id
  });
  return {
    result: harnessRun,
    response: responseText,
    evaluation,
    learning,
    meta: {
      mode: 'v2',
      path: 'production-runtime.v2',
      organization_id: agent.organization_id,
      agent_id: agent.id,
      harness: harnessRun?.meta || null,
      runtime_skills: runtime?.agent_card?.skills || [],
      tools: runtime?.tools || [],
      execution_contract: runtime?.execution_contract || null
    }
  };
}

/**
 * Persistence payload builders — always include required tenant fields.
 */
export function buildEvalInsert({ organization_id, agent_id, conversation_id, evaluation, meta = {} }) {
  if (!organization_id) throw new Error('organization_id_required');
  if (!agent_id) throw new Error('agent_id_required');
  let score = evaluation?.score;
  if (typeof score === 'number' && score <= 1) score = Math.round(score * 100);
  score = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  return {
    organization_id,
    agent_id,
    conversation_id: conversation_id || null,
    rubric: evaluation?.rubric || 'tiqnora-agent-eval/v1',
    score,
    passed: !!(evaluation?.pass ?? evaluation?.passed),
    dimensions: evaluation?.dimensions || {},
    failures: evaluation?.failures || [],
    metadata: meta
  };
}

export function buildLearningInsert({ organization_id, agent_id, agent_key = null, source_eval_id, learning }) {
  if (!organization_id) throw new Error('organization_id_required');
  if (!agent_id) throw new Error('agent_id_required');
  if (!learning) return null;
  return {
    organization_id,
    agent_id,
    source_eval_id: source_eval_id || null,
    lesson_key: learning.lesson_key || `les_${Date.now()}`,
    lesson: learning.lesson || learning.message || 'Improve failed evaluation dimensions.',
    status: 'proposed',
    auto_apply: false,
    metadata: {
      score: learning.source_score,
      requires_human_approval: true,
      agent_key: agent_key || learning.agent_slug || null
    }
  };
}

export default {
  selectRuntimeMode,
  buildV2RuntimeContext,
  runV2AgentTurn,
  buildEvalInsert,
  buildLearningInsert
};
