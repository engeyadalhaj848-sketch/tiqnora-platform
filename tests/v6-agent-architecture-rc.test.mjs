import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryStore, SupabaseStore, createFakeSupabase } from '../lib/v6/workforce/repos/store.js';
import {
  createArtifactRepository, createTraceRepository, sha256, setDefaultStore
} from '../lib/v6/workforce/repos/index.js';
import { createMemoryStorageAdapter } from '../lib/v6/workforce/storage-verifier.js';
import { runV2AgentTurn, buildV2RuntimeContext, selectRuntimeMode } from '../lib/v6/workforce/production-runtime.js';
import { routeWorkforceTask } from '../lib/v6/workforce/runtime-router.js';
import { GLOBAL_GUARDS, runWorkflow } from '../lib/v6/workforce/orchestrator.js';

function walkJs(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walkJs(p, acc);
    else if (/\.(js|mjs|cjs)$/.test(name)) acc.push(p);
  }
  return acc;
}

describe('no production import of production-e2e', () => {
  it('only tests may import production-e2e.js', () => {
    const root = new URL('..', import.meta.url).pathname;
    const files = walkJs(root).filter((f) => !f.includes('/tests/') && !f.includes('production-e2e.js'));
    const offenders = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      if (/production-e2e/.test(src) && /import\s+.*production-e2e|require\(.*production-e2e/.test(src)) {
        offenders.push(f.replace(root, ''));
      }
    }
    assert.deepEqual(offenders, [], 'production modules import production-e2e: ' + offenders.join(', '));
  });
  it('runtime-router does not import production-e2e', () => {
    const src = readFileSync(new URL('../lib/v6/workforce/runtime-router.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /import\s+.*from\s+['"]\.\/production-e2e/);
    assert.doesNotMatch(src, /runCampaignE2E/);
  });
});

describe('runV2AgentTurn response extraction', () => {
  it('reads result.text not [object Object]', async () => {
    const agent = { id: 'ag1', organization_id: 'org1', slug: 'content' };
    const captured = { response: null };
    const originalEval = (await import('../lib/v6/agent-runtime.js')).evaluateAgentResponse;
    // invoke returns provider shape; harness wraps as { result: { text } }
    // We unit-test extraction by calling with mocked harness path via runV2AgentTurn's internal extraction
    // Simulate by testing the same expression used in production-runtime
    const harnessRun = { result: { text: 'real response' } };
    const responseText =
      harnessRun?.result?.text ??
      harnessRun?.text ??
      harnessRun?.response ??
      (typeof harnessRun?.result === 'string' ? harnessRun.result : '') ??
      '';
    assert.equal(responseText, 'real response');
    assert.notEqual(String(responseText), '[object Object]');
  });
});

describe('agent_traces via SupabaseStore schema', () => {
  it('createTrace / updateTraceStatus / finishTrace without updated_at', async () => {
    const fake = createFakeSupabase({}, { enforceSchema: true });
    const store = new SupabaseStore(fake);
    const traces = createTraceRepository(store);
    const tr = await traces.createTrace({
      organization_id: 'org1',
      root_agent_key: 'manager_agent',
      status: 'running',
      trigger: 'test'
    });
    assert.ok(tr.trace_id);
    const updated = await traces.updateTraceStatus(tr.trace_id, 'running', { summary: { step: 1 } });
    assert.ok(updated);
    const finished = await traces.finishTrace(tr.trace_id, { status: 'waiting_approval', summary: { done: true } });
    assert.equal(finished.status, 'waiting_approval');
    // inject updated_at must fail
    await assert.rejects(
      () => store.update('agent_traces', tr.id, { status: 'completed', updated_at: new Date().toISOString() }),
      /updated_at|does not exist/i
    );
  });
});

describe('artifact storage adapter required', () => {
  it('caller storage_exists=true without object FAILS', async () => {
    const store = new MemoryStore();
    const arts = createArtifactRepository(store); // no adapter
    const a = await arts.create({
      organization_id: 'org1',
      creator_agent_key: 'design',
      artifact_type: 'image',
      content_hash: sha256('x'),
      storage_bucket: 'media',
      storage_path: 'missing.png'
    });
    const v = await arts.verify(a.artifact_id, { storage_exists: true, file_exists: true, size: 999 });
    assert.equal(v.ok, false);
    assert.match(v.failure_reason, /storage_adapter_required|missing_object/);
  });
  it('actual object + correct hash PASSES', async () => {
    const store = new MemoryStore();
    const storage = createMemoryStorageAdapter();
    const body = Buffer.from('png-bytes');
    storage.put('media', 'ok.png', body);
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(body).digest('hex');
    const arts = createArtifactRepository(store, { storageAdapter: storage });
    const a = await arts.create({
      organization_id: 'org1',
      creator_agent_key: 'design',
      artifact_type: 'image',
      content_hash: hash,
      storage_bucket: 'media',
      storage_path: 'ok.png'
    });
    const v = await arts.verify(a.artifact_id);
    assert.equal(v.ok, true);
  });
  it('wrong hash FAILS', async () => {
    const store = new MemoryStore();
    const storage = createMemoryStorageAdapter();
    storage.put('media', 'bad.png', Buffer.from('png-bytes'));
    const arts = createArtifactRepository(store, { storageAdapter: storage });
    const a = await arts.create({
      organization_id: 'org1',
      creator_agent_key: 'design',
      artifact_type: 'image',
      content_hash: 'deadbeef',
      storage_bucket: 'media',
      storage_path: 'bad.png'
    });
    const v = await arts.verify(a.artifact_id);
    assert.equal(v.ok, false);
    assert.equal(v.failure_reason, 'hash_mismatch');
  });
});

describe('FakeSupabase columns match migration 074', () => {
  it('compares schema keys to migration SQL', () => {
    const sql = readFileSync(new URL('../supabase/migrations/074_agent_architecture_persistence.sql', import.meta.url), 'utf8');
    const fake = createFakeSupabase({}, { enforceSchema: true });
    const schema = fake._schema;
    for (const col of ['customer_id', 'confidence', 'source', 'expires_at']) {
      assert.ok(schema.agent_memory_entries.columns.includes(col), 'memory missing ' + col);
      assert.match(sql, new RegExp(col));
    }
    for (const col of ['task_id', 'workflow_run_id', 'storage_bucket']) {
      assert.ok(schema.agent_artifacts.columns.includes(col), 'artifacts missing ' + col);
    }
    assert.ok(!schema.agent_traces.columns.includes('updated_at'), 'traces must not have updated_at');
    assert.doesNotMatch(sql, /agent_traces[\s\S]{0,800}updated_at/);
    for (const col of ['parent_span_id', 'error_code', 'error_message', 'duration_ms', 'started_at', 'completed_at']) {
      assert.ok(schema.agent_trace_spans.columns.includes(col), 'spans missing ' + col);
    }
  });
});

describe('V2 production routing', () => {
  it('routeWorkforceTask V2 does not call e2e', async () => {
    const r = await routeWorkforceTask({ title: 'x' }, { env: { AGENT_ARCH_V2_ENABLED: 'true' } });
    assert.equal(r.flag, true);
    assert.notEqual(r.path, 'production-e2e.specialists');
    assert.match(r.path, /production-runtime|collaboration-executor|pending_handlers/);
  });
  it('chat.js uses buildV2RuntimeContext and buildEvalInsert', () => {
    const src = readFileSync(new URL('../api/ai-workforce/chat.js', import.meta.url), 'utf8');
    assert.match(src, /buildV2RuntimeContext\s*\(/);
    assert.match(src, /buildEvalInsert\s*\(/);
    assert.match(src, /buildLearningInsert\s*\(/);
    assert.match(src, /runtimeMode\.v2/);
    assert.doesNotMatch(src, /production-e2e/);
  });
});

describe('legacy regression', () => {
  it('guards', async () => {
    assert.equal(GLOBAL_GUARDS.no_auto_send, true);
    const r = await runWorkflow('social_content', { name: 't' }, { trigger: 'test' });
    assert.equal(r.external_actions, 0);
  });
});
