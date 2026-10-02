/**
 * Query-capable stores. SupabaseStore requires Query objects (never JS predicates).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

function matchQuery(row, query = {}) {
  if (query.eq) for (const [k, v] of Object.entries(query.eq)) if (row[k] !== v) return false;
  if (query.neq) for (const [k, v] of Object.entries(query.neq)) if (row[k] === v) return false;
  if (query.is) for (const [k, v] of Object.entries(query.is)) {
    if (v === null) { if (row[k] != null) return false; }
    else if (Boolean(row[k]) !== Boolean(v)) return false;
  }
  if (query.in) for (const [k, vals] of Object.entries(query.in)) {
    if (!Array.isArray(vals) || !vals.includes(row[k])) return false;
  }
  return true;
}

export class MemoryStore {
  constructor() { this.tables = new Map(); }
  _t(n) { if (!this.tables.has(n)) this.tables.set(n, new Map()); return this.tables.get(n); }
  async insert(table, row) {
    const id = row.id || randomUUID();
    const rec = { ...row, id };
    this._t(table).set(id, rec);
    return { ...rec };
  }
  async upsert(table, keyField, row) {
    for (const [id, r] of this._t(table)) {
      if (r[keyField] === row[keyField]) {
        const next = { ...r, ...row, id, updated_at: new Date().toISOString() };
        this._t(table).set(id, next);
        return { ...next };
      }
    }
    return this.insert(table, { ...row, created_at: new Date().toISOString() });
  }
  async getById(table, id) {
    const r = this._t(table).get(id);
    return r ? { ...r } : null;
  }
  async find(table, query = {}, opts = {}) {
    if (typeof query === 'function') throw new Error('Use Query object, not predicate');
    const limit = query.limit ?? opts.limit ?? 100;
    let rows = [...this._t(table).values()].filter((r) => matchQuery(r, query));
    if (query.order?.column) {
      const col = query.order.column, asc = query.order.ascending !== false;
      rows.sort((a, b) => asc ? String(a[col]??'').localeCompare(String(b[col]??'')) : String(b[col]??'').localeCompare(String(a[col]??'')));
    }
    return rows.slice(0, limit).map((r) => ({ ...r }));
  }
  async update(table, id, patch) {
    const r = this._t(table).get(id);
    if (!r) return null;
    const next = { ...r, ...patch, updated_at: new Date().toISOString() };
    this._t(table).set(id, next);
    return { ...next };
  }
  clear() { this.tables.clear(); }
}

export class FileStore {
  constructor(filePath) { this.filePath = filePath; this._ensure(); }
  _ensure() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    if (!existsSync(this.filePath)) writeFileSync(this.filePath, JSON.stringify({ tables: {} }));
  }
  _load() { this._ensure(); return JSON.parse(readFileSync(this.filePath, 'utf8')).tables || {}; }
  _save(tables) { writeFileSync(this.filePath, JSON.stringify({ tables, saved_at: new Date().toISOString() })); }
  async insert(table, row) {
    const tables = this._load();
    if (!tables[table]) tables[table] = {};
    const id = row.id || randomUUID();
    const rec = { ...row, id };
    tables[table][id] = rec; this._save(tables); return { ...rec };
  }
  async upsert(table, keyField, row) {
    const tables = this._load();
    if (!tables[table]) tables[table] = {};
    for (const [id, r] of Object.entries(tables[table])) {
      if (r[keyField] === row[keyField]) {
        const next = { ...r, ...row, id, updated_at: new Date().toISOString() };
        tables[table][id] = next; this._save(tables); return { ...next };
      }
    }
    return this.insert(table, { ...row, created_at: new Date().toISOString() });
  }
  async getById(table, id) {
    const r = this._load()[table]?.[id];
    return r ? { ...r } : null;
  }
  async find(table, query = {}, opts = {}) {
    if (typeof query === 'function') throw new Error('Use Query object, not predicate');
    const limit = query.limit ?? opts.limit ?? 100;
    let rows = Object.values(this._load()[table] || {}).filter((r) => matchQuery(r, query));
    if (query.order?.column) {
      const col = query.order.column, asc = query.order.ascending !== false;
      rows.sort((a, b) => asc ? String(a[col]??'').localeCompare(String(b[col]??'')) : String(b[col]??'').localeCompare(String(a[col]??'')));
    }
    return rows.slice(0, limit).map((r) => ({ ...r }));
  }
  async update(table, id, patch) {
    const tables = this._load();
    const r = tables[table]?.[id];
    if (!r) return null;
    const next = { ...r, ...patch, updated_at: new Date().toISOString() };
    tables[table][id] = next; this._save(tables); return { ...next };
  }
  clear() { this._save({}); }
}

export class SupabaseStore {
  constructor(client) {
    if (!client) throw new Error('supabase_client_required');
    this.client = client;
  }
  async insert(table, row) {
    const { data, error } = await this.client.from(table).insert(row).select('*').single();
    if (error) throw new Error(error.message);
    return data;
  }
  async upsert(table, keyField, row) {
    const { data, error } = await this.client.from(table).upsert(row, { onConflict: keyField }).select('*').single();
    if (error) throw new Error(error.message);
    return data;
  }
  async getById(table, id) {
    const { data, error } = await this.client.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }
  async find(table, query = {}, opts = {}) {
    if (typeof query === 'function') throw new Error('SupabaseStore.find requires Query object, not predicate');
    let q = this.client.from(table).select('*');
    if (query.eq) for (const [k, v] of Object.entries(query.eq)) q = q.eq(k, v);
    if (query.neq) for (const [k, v] of Object.entries(query.neq)) q = q.neq(k, v);
    if (query.is) for (const [k, v] of Object.entries(query.is)) {
      if (v === null) q = q.is(k, null); else q = q.eq(k, v);
    }
    if (query.in) for (const [k, vals] of Object.entries(query.in)) q = q.in(k, vals);
    if (query.order?.column) q = q.order(query.order.column, { ascending: query.order.ascending !== false });
    q = q.limit(query.limit ?? opts.limit ?? 100);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  }
  async update(table, id, patch) {
    // Tables without updated_at: ai_agent_learning_events, ai_agent_evals, agent_trace_spans, etc.
    const WITH_UPDATED_AT = new Set([
      'agent_memory_entries', 'agent_artifacts',
      'ai_knowledge_documents', 'ai_agent_state'
    ]);
    // agent_traces: migration 074 has no updated_at — do not inject
    const body = { ...patch };
    if (WITH_UPDATED_AT.has(table)) body.updated_at = new Date().toISOString();
    const { data, error } = await this.client.from(table).update(body).eq('id', id).select('*').single();
    if (error) throw new Error(error.message);
    return data;
  }
}

export function createFakeSupabase(seed = {}, { enforceSchema = true } = {}) {
  // Columns must match migration 074 + existing ai_* tables
  const SCHEMA = {
    ai_agent_evals: {
      required: ['organization_id', 'agent_id'],
      columns: ['id','organization_id','agent_id','conversation_id','rubric','score','passed','dimensions','failures','metadata','created_at']
    },
    ai_agent_learning_events: {
      required: ['organization_id', 'agent_id'],
      columns: ['id','organization_id','agent_id','source_eval_id','lesson_key','lesson','status','auto_apply','metadata','reviewed_by','reviewed_at','created_at']
    },
    ai_agent_messages: {
      required: ['organization_id'],
      columns: ['id','organization_id','protocol','correlation_id','message_id','from_agent_id','to_agent_id','message_type','task','message','artifact','hop','status','requires_approval','metadata','created_at','completed_at']
    },
    agent_memory_entries: {
      required: ['organization_id'],
      columns: ['id','organization_id','memory_id','agent_key','memory_type','scope','customer_id','key','content','summary','metadata','confidence','source','tags','expires_at','archived_at','created_at','updated_at']
    },
    agent_artifacts: {
      required: ['organization_id'],
      columns: ['id','organization_id','artifact_id','task_id','workflow_run_id','trace_id','creator_agent_key','artifact_type','uri','storage_path','storage_bucket','reference_id','content','content_hash','metadata','verification_status','verified_at','verification_evidence','created_at','updated_at']
    },
    agent_traces: {
      required: ['organization_id'],
      // migration 074 has NO updated_at
      columns: ['id','organization_id','trace_id','workflow_run_id','task_id','root_agent_key','trigger','status','summary','metadata','started_at','completed_at','duration_ms','created_at']
    },
    agent_trace_spans: {
      required: ['organization_id'],
      columns: ['id','organization_id','trace_id','span_id','parent_span_id','agent_key','span_type','name','status','input','output','error_code','error_message','duration_ms','metadata','started_at','completed_at','created_at']
    },
    ai_knowledge_documents: {
      required: [],
      columns: ['id','organization_id','title','source_type','source_uri','checksum','metadata','is_active','created_at','updated_at']
    },
    ai_knowledge_chunks: {
      required: [],
      columns: ['id','document_id','organization_id','ordinal','content','metadata','created_at']
    }
  };

  function validate(table, row, op) {
    if (!enforceSchema) return null;
    const sch = SCHEMA[table];
    if (!sch) return null;
    if (op === 'insert' || op === 'upsert') {
      for (const col of sch.required) {
        if (row[col] == null || row[col] === '') {
          return { message: `null value in column "${col}" of relation "${table}" violates not-null constraint` };
        }
      }
    }
    if (op === 'update' || op === 'insert' || op === 'upsert') {
      for (const k of Object.keys(row || {})) {
        if (k === 'id') continue;
        if (sch.columns && !sch.columns.includes(k)) {
          return { message: `column "${k}" of relation "${table}" does not exist` };
        }
      }
    }
    return null;
  }

  const tables = {};
  for (const [n, rows] of Object.entries(seed)) tables[n] = rows.map((r) => ({ ...r }));
  function from(table) {
    if (!tables[table]) tables[table] = [];
    const state = { filters: [], limit: 1000, op: 'select', payload: null, order: null };
    const api = {
      select() { return api; },
      insert(row) { state.op = 'insert'; state.payload = row; return api; },
      upsert(row) { state.op = 'upsert'; state.payload = row; return api; },
      update(p) { state.op = 'update'; state.payload = p; return api; },
      eq(k, v) { state.filters.push((r) => r[k] === v); return api; },
      neq(k, v) { state.filters.push((r) => r[k] !== v); return api; },
      is(k, v) { state.filters.push((r) => (v === null ? r[k] == null : r[k] === v)); return api; },
      in(k, vals) { state.filters.push((r) => vals.includes(r[k])); return api; },
      order(col, { ascending = true } = {}) { state.order = { col, ascending }; return api; },
      limit(n) { state.limit = n; return api; },
      single() {
        return api.then((res) => {
          if (res.error) return res;
          const d = Array.isArray(res.data) ? res.data[0] : res.data;
          return { data: d ?? null, error: d ? null : { message: 'not found' } };
        });
      },
      maybeSingle() {
        return api.then((res) => {
          if (res.error) return res;
          const d = Array.isArray(res.data) ? res.data[0] : res.data;
          return { data: d ?? null, error: null };
        });
      },
      then(resolve, reject) {
        return new Promise((res, rej) => {
          try {
            let rows = tables[table];
            if (state.op === 'insert' || state.op === 'upsert') {
              const err = validate(table, state.payload || {}, state.op);
              if (err) { const out = { data: null, error: err }; resolve?.(out); res(out); return; }
              const rec = { id: (state.payload && state.payload.id) || randomUUID(), ...state.payload };
              rows.push(rec);
              const out = { data: rec, error: null };
              resolve?.(out); res(out); return;
            }
            if (state.op === 'update') {
              const err = validate(table, state.payload || {}, 'update');
              if (err) { const out = { data: null, error: err }; resolve?.(out); res(out); return; }
            }
            let filtered = rows.filter((r) => state.filters.every((f) => f(r)));
            if (state.op === 'update') filtered.forEach((r) => Object.assign(r, state.payload));
            if (state.order) {
              const { col, ascending } = state.order;
              filtered.sort((a, b) => ascending
                ? String(a[col] ?? '').localeCompare(String(b[col] ?? ''))
                : String(b[col] ?? '').localeCompare(String(a[col] ?? '')));
            }
            const out = { data: filtered.slice(0, state.limit).map((r) => ({ ...r })), error: null };
            resolve?.(out); res(out);
          } catch (e) {
            const out = { data: null, error: { message: e.message } };
            resolve?.(out); res(out);
          }
        }).then(resolve, reject);
      }
    };
    return api;
  }
  return { from, _tables: tables, _schema: SCHEMA };
}

export default { MemoryStore, FileStore, SupabaseStore, createFakeSupabase };
