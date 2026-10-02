import { embedText, toPgVectorLiteral } from '../../lib/v6/workforce/embeddings.js';

const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
}

function bearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function supabase(path, token, options = {}) {
  const url = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || `Database request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const token = bearer(req);
  if (!token) return json(res, 401, { error: 'يلزم تسجيل الدخول.' });

  try {
    const user = await supabase('/auth/v1/user', token);
    const profiles = await supabase(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,is_active,default_organization_id`,
      token
    );
    const profile = profiles?.[0];
    if (!profile || !profile.is_active || !['admin', 'super_admin'].includes(profile.role)) {
      return json(res, 403, { error: 'صلاحية أدمن مطلوبة.' });
    }
    if (!profile.default_organization_id) {
      return json(res, 400, { error: 'لا توجد مؤسسة افتراضية مرتبطة بالحساب.' });
    }

    const limit = Math.max(1, Math.min(Number(req.body?.limit || 10), 25));
    const rows = await supabase(
      `/rest/v1/ai_knowledge_chunks?organization_id=eq.${encodeURIComponent(profile.default_organization_id)}&embedding=is.null&select=id,content&order=created_at.asc&limit=${limit}`,
      token
    );

    const results = [];
    for (const row of rows || []) {
      try {
        const embedded = await embedText(row.content, {
          env: process.env,
          taskType: 'RETRIEVAL_DOCUMENT'
        });
        await supabase(
          `/rest/v1/ai_knowledge_chunks?id=eq.${encodeURIComponent(row.id)}`,
          token,
          {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              embedding: toPgVectorLiteral(embedded.vector),
              embedding_model: embedded.model,
              embedding_updated_at: new Date().toISOString()
            })
          }
        );
        results.push({ id: row.id, ok: true, provider: embedded.provider, model: embedded.model });
      } catch (error) {
        results.push({ id: row.id, ok: false, error: String(error?.message || error).slice(0, 300) });
      }
    }

    return json(res, 200, {
      organization_id: profile.default_organization_id,
      requested: limit,
      processed: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results
    });
  } catch (error) {
    return json(res, error.status && error.status < 600 ? error.status : 500, {
      error: error.message || 'تعذر تجهيز embeddings.'
    });
  }
}
