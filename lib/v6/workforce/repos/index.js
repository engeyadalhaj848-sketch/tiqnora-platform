import { createHash, randomUUID } from 'node:crypto';
import { MemoryStore } from './store.js';

let defaultStore = new MemoryStore();
let productionMode = false;
export function setProductionMode(on) { productionMode = !!on; }
export function assertProductionIdentity({ organization_id, agent_id }, { needAgent = false } = {}) {
  if (!productionMode) return;
  if (!organization_id) throw new Error('organization_id_required');
  if (needAgent && !agent_id) throw new Error('agent_id_required');
}

export function setDefaultStore(s) { defaultStore = s; }
export function getDefaultStore() { return defaultStore; }
export function sha256(c) { return createHash('sha256').update(String(c ?? ''), 'utf8').digest('hex'); }

export function createMemoryRepository(store = defaultStore) {
  const T = 'agent_memory_entries';
  return {
    async remember(entry) {
      const memory_id = entry.memory_id || ('mem_' + randomUUID().replace(/-/g,'').slice(0,16));
      return store.insert(T, { ...entry, memory_id, archived_at: null, created_at: entry.created_at || new Date().toISOString(), updated_at: new Date().toISOString() });
    },
    async recall(memory_id) {
      const rows = await store.find(T, { eq: { memory_id }, is: { archived_at: null }, limit: 1 });
      return rows[0] || null;
    },
    async search({ organization_id=null, agent_key=null, memory_type=null, query=null, scope=null, limit=8 } = {}) {
      const eq = {};
      if (organization_id) eq.organization_id = organization_id;
      if (memory_type) eq.memory_type = memory_type;
      if (scope) eq.scope = scope;
      let rows = await store.find(T, { eq: Object.keys(eq).length?eq:undefined, is: { archived_at: null }, limit: 200, order: { column: 'created_at', ascending: false } });
      if (agent_key) rows = rows.filter(r => r.scope==='shared'||r.scope==='organization'||r.memory_type==='shared'||(r.memory_type==='semantic'&&(r.tags||[]).includes('service'))||!r.agent_key||r.agent_key===agent_key);
      if (query) {
        const tokens = String(query).toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,' ').split(/\s+/).filter(t=>t.length>1);
        rows = rows.map(e => {
          const text = (e.key+' '+e.content+' '+(e.summary||'')).toLowerCase();
          let score = 0; for (const t of tokens) if (text.includes(t)) score++;
          return { e, score };
        }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).map(x=>x.e);
      }
      return rows.slice(0, limit);
    },
    async archive(memory_id) {
      const rows = await store.find(T, { eq: { memory_id }, limit: 1 });
      if (!rows[0]) return null;
      return store.update(T, rows[0].id, { archived_at: new Date().toISOString() });
    }
  };
}

export function createArtifactRepository(store = defaultStore, { storageAdapter = null, providerAdapter = null } = {}) {
  const T = 'agent_artifacts';
  return {
    async create(art) {
      const artifact_id = art.artifact_id || ('art_' + randomUUID().replace(/-/g,'').slice(0,16));
      let content_hash = art.content_hash || null;
      if (art.content != null && !content_hash) content_hash = sha256(art.content);
      return store.insert(T, { ...art, artifact_id, content_hash, verification_status: 'unverified', created_at: new Date().toISOString() });
    },
    /**
     * Deterministic verification.
     * For image/video/document: REQUIRES storageAdapter — never trust storage_exists flags alone.
     */
    async verify(artifact_id, evidence = {}) {
      const rows = await store.find(T, { eq: { artifact_id }, limit: 1 });
      const art = rows[0];
      if (!art) return { ok: false, failure_reason: 'artifact_not_found' };
      let ok = false, failure_reason = null;
      const type = art.artifact_type || 'other';
      const ev = { ...evidence };

      if (['image','video','document'].includes(type)) {
        const adapter = storageAdapter || evidence.storageAdapter || null;
        // Explicitly ignore caller-provided storage_exists / file_exists
        delete ev.storage_exists;
        delete ev.file_exists;
        if (!adapter) {
          failure_reason = 'storage_adapter_required';
        } else {
          const bucket = art.storage_bucket || evidence.bucket;
          const path = art.storage_path || art.uri || evidence.path;
          try {
            const { verifyStoredArtifact } = await import('../storage-verifier.js');
            const v = await verifyStoredArtifact({
              storage: adapter,
              bucket,
              path,
              expected_sha256: art.content_hash || evidence.expected_sha256 || null
            });
            ok = !!v.ok;
            failure_reason = v.failure_reason || null;
            Object.assign(ev, { method: 'storage_adapter', size: v.size, sha256: v.sha256 });
          } catch (e) {
            failure_reason = e.message || 'storage_verify_error';
          }
        }
      } else {
        if (art.content && art.content_hash && sha256(art.content) !== art.content_hash) failure_reason = 'hash_mismatch';
        else if (evidence.expected_hash && art.content_hash && evidence.expected_hash !== art.content_hash) failure_reason = 'hash_mismatch';
        else if (!art.content && !art.content_hash) failure_reason = 'no_immutable_content';
        else if (art.reference_id && !art.content && !art.content_hash) failure_reason = 'reference_only_insufficient';
        else ok = true;
      }

      if (evidence.require_provider || art.artifact_type === 'provider_action') {
        const adapter = providerAdapter || evidence.providerAdapter || null;
        const ref = art.reference_id || evidence.provider_response?.id || evidence.post_id;
        if (!adapter) {
          ok = false;
          failure_reason = 'provider_adapter_required';
        } else if (!ref) {
          ok = false;
          failure_reason = 'provider_reference_missing';
        } else {
          const { verifyProviderAction } = await import('../storage-verifier.js');
          const v = await verifyProviderAction({ provider: adapter, action: evidence.action, reference_id: ref });
          ok = !!v.ok;
          failure_reason = v.failure_reason || null;
        }
      }

      await store.update(T, art.id, {
        verification_status: ok ? 'verified' : 'failed',
        verified_at: ok ? new Date().toISOString() : null,
        verification_evidence: { ...ev, failure_reason }
      });
      const updated = (await store.find(T, { eq: { artifact_id }, limit: 1 }))[0];
      return { ok, verification_status: ok ? 'verified' : 'failed', failure_reason, evidence: ev, artifact: updated };
    },
    async get(artifact_id) {
      const rows = await store.find(T, { eq: { artifact_id }, limit: 1 });
      return rows[0] || null;
    },
    async list({ organization_id=null, trace_id=null, limit=50 } = {}) {
      const eq = {};
      if (organization_id) eq.organization_id = organization_id;
      if (trace_id) eq.trace_id = trace_id;
      return store.find(T, { eq: Object.keys(eq).length?eq:undefined, limit, order: { column: 'created_at', ascending: false } });
    }
  };
}

export function createEvaluationRepository(store = defaultStore) {
  const T = 'ai_agent_evals';
  return {
    async save(ev) {
      assertProductionIdentity({ organization_id: ev.organization_id, agent_id: ev.agent_id }, { needAgent: true });
      let score = ev.score;
      if (typeof score === 'number' && score <= 1) score = Math.round(score * 100);
      score = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
      return store.insert(T, {
        id: ev.id || randomUUID(),
        organization_id: ev.organization_id || null,
        agent_id: ev.agent_id || null,
        rubric: ev.rubric || 'tiqnora-agent-eval/v1',
        score, passed: !!ev.passed,
        dimensions: ev.dimensions || {},
        failures: ev.failures || (ev.failure_reason ? [ev.failure_reason] : []),
        metadata: { ...(ev.metadata||{}), evaluation_id: ev.evaluation_id || null, trace_id: ev.trace_id || null, agent_key: ev.agent_key || null, evidence: ev.evidence || {} },
        created_at: new Date().toISOString()
      });
    },
    async list({ organization_id=null, trace_id=null, limit=50 } = {}) {
      const eq = {};
      if (organization_id) eq.organization_id = organization_id;
      let rows = await store.find(T, { eq: Object.keys(eq).length?eq:undefined, limit: 200, order: { column: 'created_at', ascending: false } });
      if (trace_id) rows = rows.filter(r => r.metadata?.trace_id === trace_id);
      return rows.slice(0, limit);
    }
  };
}

export function createMessageRepository(store = defaultStore) {
  const T = 'ai_agent_messages';
  const ALLOWED = new Set(['task','message','artifact','handoff']);
  return {
    async save(msg) {
      if (msg.requireIdentity || productionMode) {
        assertProductionIdentity({ organization_id: msg.organization_id }, { needAgent: false });
      }
      let message_type = msg.message_type || 'task';
      if (message_type === 'delegate') message_type = 'handoff';
      if (!ALLOWED.has(message_type)) message_type = 'message';
      const message_id = msg.message_id || ('am_' + randomUUID().replace(/-/g,'').slice(0,16));
      return store.insert(T, {
        organization_id: msg.organization_id || null,
        protocol: 'tiqnora-a2a/v1',
        correlation_id: msg.correlation_id || msg.trace_id || message_id,
        message_id,
        from_agent_id: msg.from_agent_id || null,
        to_agent_id: msg.to_agent_id || null,
        message_type,
        task: msg.task || null,
        message: msg.message || null,
        artifact: msg.artifact || null,
        hop: Math.min(4, Math.max(1, Number(msg.hop_count || msg.hop || 1))),
        status: msg.status || 'queued',
        requires_approval: !!msg.requires_approval,
        metadata: { ...(msg.metadata||{}), trace_id: msg.trace_id || null, from_agent: msg.from_agent || null, to_agent: msg.to_agent || null, payload: msg.payload || null },
        created_at: new Date().toISOString()
      });
    },
    async list({ organization_id=null, trace_id=null, limit=50 } = {}) {
      const eq = {};
      if (organization_id) eq.organization_id = organization_id;
      let rows = await store.find(T, { eq: Object.keys(eq).length?eq:undefined, limit: 200, order: { column: 'created_at', ascending: false } });
      if (trace_id) rows = rows.filter(r => r.correlation_id === trace_id || r.metadata?.trace_id === trace_id);
      return rows.slice(0, limit);
    }
  };
}

export function createTraceRepository(store = defaultStore) {
  const T = 'agent_traces', S = 'agent_trace_spans';
  return {
    async createTrace(tr) {
      const trace_id = tr.trace_id || ('tr_' + randomUUID().replace(/-/g,'').slice(0,16));
      const existing = await store.find(T, { eq: { trace_id }, limit: 1 });
      if (existing[0]) return existing[0];
      return store.insert(T, { ...tr, trace_id, status: tr.status || 'running', created_at: new Date().toISOString(), started_at: tr.started_at || new Date().toISOString() });
    },
    async updateTraceStatus(trace_id, status, extra = {}) {
      const rows = await store.find(T, { eq: { trace_id }, limit: 1 });
      if (!rows[0]) return null;
      return store.update(T, rows[0].id, { status, ...extra, ...((['completed','waiting_approval','failed'].includes(status)) ? { completed_at: new Date().toISOString() } : {}) });
    },
    async finishTrace(trace_id, { status = 'completed', summary = {} } = {}) {
      return this.updateTraceStatus(trace_id, status, { summary });
    },
    async saveSpan(span) {
      return store.insert(S, { ...span, span_id: span.span_id || ('sp_' + randomUUID().replace(/-/g,'').slice(0,12)), created_at: new Date().toISOString() });
    },
    async getTrace(trace_id) {
      const rows = await store.find(T, { eq: { trace_id }, limit: 1 });
      return rows[0] || null;
    },
    async list({ organization_id=null, limit=50 } = {}) {
      const eq = {};
      if (organization_id) eq.organization_id = organization_id;
      return store.find(T, { eq: Object.keys(eq).length?eq:undefined, limit, order: { column: 'created_at', ascending: false } });
    }
  };
}

export function createLessonRepository(store = defaultStore) {
  const T = 'ai_agent_learning_events';
  return {
    async propose(lesson) {
      assertProductionIdentity({ organization_id: lesson.organization_id, agent_id: lesson.agent_id }, { needAgent: true });
      return store.insert(T, {
        id: lesson.id || randomUUID(),
        organization_id: lesson.organization_id || null,
        agent_id: lesson.agent_id || null,
        source_eval_id: lesson.source_eval_id || null,
        lesson_key: lesson.lesson_key || ('les_' + randomUUID().slice(0,8)),
        lesson: lesson.lesson,
        status: 'proposed', auto_apply: false,
        metadata: { ...(lesson.metadata||{}), agent_key: lesson.agent_key || null, category: lesson.category || null, evidence: lesson.evidence || {} },
        created_at: new Date().toISOString()
      });
    },
    async review(key, { status, approved_by=null }) {
      if (!['approved','rejected'].includes(status)) throw new Error('invalid_lesson_status');
      let rows = await store.find(T, { eq: { lesson_key: key }, limit: 1 });
      if (!rows[0]) rows = await store.find(T, { eq: { id: key }, limit: 1 });
      if (!rows[0]) return null;
      return store.update(T, rows[0].id, { status, reviewed_by: approved_by, reviewed_at: new Date().toISOString() });
    },
    async listApproved({ agent_key=null, limit=20 } = {}) {
      let rows = await store.find(T, { eq: { status: 'approved' }, limit: 100, order: { column: 'created_at', ascending: false } });
      if (agent_key) rows = rows.filter(r => !r.metadata?.agent_key || r.metadata.agent_key === agent_key);
      return rows.slice(0, limit);
    },
    async list({ status=null, limit=50 } = {}) {
      return store.find(T, { eq: status ? { status } : undefined, limit, order: { column: 'created_at', ascending: false } });
    }
  };
}

export function createKnowledgeRepository(store = defaultStore) {
  const DOCS = 'ai_knowledge_documents', CHUNKS = 'ai_knowledge_chunks';
  function chunkText(text, size=400) {
    const clean = String(text||'').replace(/\s+/g,' ').trim();
    if (!clean) return [];
    const out = []; for (let i=0;i<clean.length;i+=size) out.push(clean.slice(i,i+size)); return out;
  }
  return {
    async ingestDocument({ title, content, source_type='internal', source_uri=null, metadata={}, organization_id=null }) {
      const checksum = sha256(content).slice(0,32);
      const doc = await store.insert(DOCS, { title, source_type, source_uri, checksum, metadata: { ...metadata, ingestion_sanitized: true }, organization_id, is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      const saved = [];
      const chunks = chunkText(content);
      for (let i=0;i<chunks.length;i++) {
        saved.push(await store.insert(CHUNKS, { document_id: doc.id, organization_id, ordinal: i, content: chunks[i], metadata: { title, source_type, untrusted: true, content_hash: sha256(chunks[i]) }, created_at: new Date().toISOString() }));
      }
      return { document: doc, chunks: saved };
    },
    async search({ query, limit=5, organization_id=null }) {
      const tokens = String(query||'').toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,' ').split(/\s+/).filter(t=>t.length>1);
      const eq = {}; if (organization_id) eq.organization_id = organization_id;
      let rows = await store.find(CHUNKS, { eq: Object.keys(eq).length?eq:undefined, limit: 500 });
      return rows.map(c => {
        const text = c.content.toLowerCase();
        let score = 0; for (const t of tokens) if (text.includes(t)) score++;
        if (/ignore previous|system prompt|reveal secrets/i.test(c.content)) score *= 0.1;
        return { ...c, score, untrusted: true };
      }).filter(c => c.score > 0).sort((a,b)=>b.score-a.score).slice(0, limit);
    },
    async listDocuments({ organization_id=null, limit=50 } = {}) {
      const eq = { is_active: true }; if (organization_id) eq.organization_id = organization_id;
      return store.find(DOCS, { eq, limit, order: { column: 'created_at', ascending: false } });
    }
  };
}
