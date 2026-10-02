/**
 * Reusable multi-agent collaboration executor.
 * Handlers injected (production or deterministic test fixtures).
 */

import { randomUUID } from 'node:crypto';
import { createTraceRepository, createMessageRepository, createArtifactRepository, sha256 } from './repos/index.js';

/**
 * @param {object} opts
 * @param {object} opts.store
 * @param {string} opts.organization_id required in production mode
 * @param {Array<{key:string, handler:Function, agent_id?:string}>} opts.specialists
 * @param {object} opts.task
 * @param {boolean} opts.requireIdentity
 */
export async function executeCollaboration({
  store,
  organization_id = null,
  specialists = [],
  task = {},
  requireIdentity = false,
  resolveAgentId = null
} = {}) {
  if (requireIdentity && !organization_id) {
    throw new Error('organization_id_required');
  }
  if (!specialists.length) throw new Error('specialists_required');

  const traces = createTraceRepository(store);
  const messages = createMessageRepository(store);
  const artifacts = createArtifactRepository(store);

  const trace = await traces.createTrace({
    organization_id,
    root_agent_key: specialists[0].key,
    status: 'running',
    trigger: 'collaboration_executor',
    metadata: { task: task.title || task }
  });
  const trace_id = trace.trace_id;
  const results = [];
  let hop = 1;
  let prev = null;

  for (const spec of specialists) {
    const agent_id = spec.agent_id
      || (resolveAgentId ? await resolveAgentId(organization_id, spec.key) : null);
    if (requireIdentity && !agent_id) {
      throw new Error(`agent_id_required_for:${spec.key}`);
    }

    await traces.saveSpan({
      organization_id,
      trace_id,
      agent_key: spec.key,
      span_type: 'step',
      name: `invoke_${spec.key}`,
      status: 'running',
      input: { task }
    });

    if (prev) {
      await messages.save({
        organization_id,
        trace_id,
        correlation_id: trace_id,
        from_agent: prev.key,
        to_agent: spec.key,
        from_agent_id: prev.agent_id || null,
        to_agent_id: agent_id || null,
        message_type: 'handoff',
        task: task.title || String(task),
        hop,
        status: 'completed',
        requireIdentity
      });
    }

    const output = await spec.handler({
      task,
      previous: results,
      organization_id,
      agent_id,
      trace_id,
      store
    });

    let artifact = null;
    let verified = null;
    if (output?.artifact_content != null) {
      const content = typeof output.artifact_content === 'string'
        ? output.artifact_content
        : JSON.stringify(output.artifact_content);
      artifact = await artifacts.create({
        organization_id,
        trace_id,
        creator_agent_key: spec.key,
        artifact_type: output.artifact_type || 'report',
        content,
        content_hash: sha256(content)
      });
      verified = await artifacts.verify(artifact.artifact_id);
    }

    await traces.saveSpan({
      organization_id,
      trace_id,
      agent_key: spec.key,
      span_type: 'step',
      name: `complete_${spec.key}`,
      status: verified && !verified.ok ? 'failed' : 'completed',
      output: { artifact_id: artifact?.artifact_id, verified: verified?.ok }
    });

    const record = {
      key: spec.key,
      agent_id,
      output,
      artifact,
      verified,
      hop
    };
    results.push(record);
    prev = { key: spec.key, agent_id };
    hop += 1;
  }

  await traces.finishTrace(trace_id, {
    status: 'waiting_approval',
    summary: { specialists: results.map((r) => r.key), count: results.length }
  });

  return {
    ok: true,
    trace_id,
    organization_id,
    results,
    specialists_executed: results.map((r) => r.key),
    external_actions: 0,
    auto_publish: false
  };
}

export default { executeCollaboration };
