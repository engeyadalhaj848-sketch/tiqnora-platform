/**
 * Production routing — NEVER imports production-e2e.js.
 * V2 uses production-runtime + collaboration-executor.
 */

import { isAgentArchV2Enabled, architectureMode } from './feature-flags.js';
import { runWorkflow } from './orchestrator.js';
import {
  selectRuntimeMode,
  buildV2RuntimeContext,
  runV2AgentTurn
} from './production-runtime.js';
import { executeCollaboration } from './collaboration-executor.js';
import { getDefaultStore } from './repos/index.js';

/**
 * Route a high-level workforce task.
 * OFF → legacy orchestrator
 * ON  → production collaboration executor (not E2E fixture)
 */
export async function routeWorkforceTask(task = {}, options = {}) {
  const env = options.env || process.env;
  const store = options.store || getDefaultStore();
  const mode = selectRuntimeMode(env);

  if (!isAgentArchV2Enabled(env)) {
    const result = await runWorkflow(
      task.workflow_type || 'daily_marketing',
      task.input || { name: task.title },
      { trigger: task.trigger || 'router_legacy' }
    );
    return { mode: 'legacy', path: 'orchestrator.runWorkflow', flag: false, result };
  }

  // Production V2: collaboration executor with caller-provided specialists, or single-agent turn
  if (Array.isArray(task.specialists) && task.specialists.length) {
    const result = await executeCollaboration({
      store,
      organization_id: task.organization_id || null,
      specialists: task.specialists,
      task: { title: task.title || task.input?.name || 'workforce task' },
      requireIdentity: !!task.requireIdentity,
      resolveAgentId: options.resolveAgentId || null
    });
    return {
      mode: 'v2',
      path: 'collaboration-executor',
      flag: true,
      result
    };
  }

  // Single-agent V2 path via production-runtime
  if (task.agent && options.invoke) {
    const runtime = buildV2RuntimeContext({
      agent: task.agent,
      message: task.message || task.title || '',
      agents: task.agents || [],
      state: task.state,
      memory: task.memory,
      tasks: task.tasks,
      recent: task.recent,
      knowledge: task.knowledge || []
    });
    const turn = await runV2AgentTurn({
      agent: task.agent,
      message: task.message || task.title || '',
      knowledge: task.knowledge || [],
      runtime,
      invoke: options.invoke
    });
    return {
      mode: 'v2',
      path: 'production-runtime.v2',
      flag: true,
      result: turn,
      runtime
    };
  }

  return {
    mode: mode.mode,
    path: 'production-runtime.v2.pending_handlers',
    flag: true,
    result: {
      ok: false,
      error: 'v2_requires_specialists_or_agent_invoke',
      hint: 'Pass task.specialists[] for multi-agent or task.agent + options.invoke for single-agent V2'
    }
  };
}

export { architectureMode, isAgentArchV2Enabled, selectRuntimeMode };
