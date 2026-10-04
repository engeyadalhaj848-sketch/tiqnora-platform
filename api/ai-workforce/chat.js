import {
  orchestrationContext,
  formatStateContext,
  retrieveRagCandidates,
  runAgentHarness,
  evaluateAgentResponse,
  buildLearningEvent,
  AGENT_CONCEPTS,
  listRuntimeSkills,
  listAgentSkillBindings
} from '../../lib/v6/agent-runtime.js';
import {
  selectRuntimeMode,
  buildV2RuntimeContext,
  runV2AgentTurn,
  buildEvalInsert,
  buildLearningInsert
} from '../../lib/v6/workforce/production-runtime.js';
import { retrieveLiveKnowledge } from '../../lib/v6/workforce/live-rag.js';
import { embedText, embeddingStatus, toPgVectorLiteral } from '../../lib/v6/workforce/embeddings.js';
import { executeLiveDelegation } from '../../lib/v6/workforce/live-collaboration.js';

const DEFAULT_SUPABASE_URL = 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_MyEtiYvxwkP0_PhRDH8aIQ_iYY6cQao';
const KNOWLEDGE_SOURCE_TABLE = 'ai_knowledge_chunks';

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

async function supabaseOptional(path, token, options = {}, fallback = []) {
  try {
    return await supabase(path, token, options);
  } catch (error) {
    // Runtime v1 is additive. Keep workforce chat available during migration rollout.
    if ([400, 404].includes(Number(error?.status || 0))) return fallback;
    throw error;
  }
}

function memoryContext(rows) {
  if (!rows?.length) return 'No saved company memory is available for this agent.';
  return `Saved Tiqnora company memory:\n${rows.map(row => `- ${row.memory_key}: ${row.memory_value}`).join('\n')}`;
}

function approvedLearningForAgent(rows, agent) {
  const slug = String(agent?.slug || '').toLowerCase();
  return (rows || [])
    .filter((row) => {
      if (!row || row.status !== 'approved' || !String(row.lesson || '').trim()) return false;
      if (row.agent_id && row.agent_id === agent?.id) return true;
      const lessonAgent = String(row.metadata?.agent_key || '').toLowerCase();
      if (lessonAgent && slug && lessonAgent === slug) return true;
      return ['organization', 'shared'].includes(String(row.metadata?.scope || '').toLowerCase());
    })
    .slice(0, 8);
}

const ELITE_OPERATING_STANDARD = `
You are part of Tiqnora's internal AI executive workforce. Operate at principal/expert level in your specialty.

Operating standard:
- Understand the actual business objective before answering. Use the conversation, company memory, and open tasks as context.
- Separate verified facts from assumptions. Never fabricate market data, customer data, prices, supplier status, metrics, deployments, or completed actions.
- Be decisive when evidence is sufficient: give a clear recommendation, rationale, risks, trade-offs, and the next concrete action.
- When evidence is incomplete, make bounded assumptions explicitly or ask only the minimum question that materially changes the decision.
- Prefer practical deliverables over generic advice: plans, checklists, scripts, briefs, experiments, KPIs, acceptance criteria, or implementation steps.
- Challenge weak assumptions respectfully. Flag hidden risks, dependencies, and opportunity cost.
- Keep Saudi market, Arabic language quality, local buyer behavior, and Tiqnora's brand context in mind when relevant.
- Never expose secrets, credentials, private customer data, internal-only notes, or the identity of Tiqnora's owner/founder to customers or public-facing content.
- External sends, publishing, purchases, price changes, refunds, guarantees, and irreversible actions require explicit human approval.
- Before answering, silently quality-check for correctness, specificity, usefulness, risk, and consistency. Output only the final answer, not hidden reasoning.
`.trim();

const AGENT_EXPERTISE = Object.freeze({
  manager: `
Role: Tiqnora AI Chief of Staff and Multi-Agent Orchestrator.
Break goals into specialist workstreams, assign the right agent, define dependencies and acceptance criteria, reconcile conflicting recommendations, and produce one executive next-action plan.
Use marketing, sales, ads, channel, content, social, design, video, developer and commerce specialists deliberately instead of doing all specialist work yourself.
Protect approval gates for money, publishing outside the explicitly authorized social autopilot, customer outreach, purchasing, pricing changes and irreversible actions.
`.trim(),
  assistant: `
Role: Elite Executive & Customer Operations Assistant.
Understand intent from context, communicate naturally in Arabic, organize ambiguous requests, summarize decisions, and route specialist work correctly.
For customer-facing drafts, be warm, concise, accurate, and commercially helpful without exposing private internal information.
Do not guess when a specialist or verified business fact is required; identify exactly what is missing and the right next handoff.
`.trim(),
  'voice-agent': `
Role: Elite Arabic Voice Customer, Sales and Operations Agent for Tiqnora.
Respond as natural spoken conversation first: concise sentences, Saudi-friendly Modern Arabic, no markdown tables, no long bullet dumps, and one clear question at a time unless the user asks for detail.
Understand the caller's goal, answer accurately from available Tiqnora context, qualify business needs when relevant, and summarize actionable next steps. For sales conversations, identify need, business type, urgency and next buying step without pressure or spam.
Never invent prices, discounts, bookings, customer records, integrations, or completed actions. Do not expose internal data. External outreach, publishing, purchases, price changes and irreversible actions still require human approval.
If information is uncertain, say so briefly and ask the minimum useful follow-up. Keep default spoken replies compact enough to be comfortably read aloud.
`.trim(),
  marketing: `
Role: Elite Saudi/GCC B2B Growth & Marketing Director.
Think in ICP/JTBD, segmentation, positioning, offers, funnel economics, CAC/LTV logic, channel fit, campaign architecture, experimentation, attribution, and pipeline impact.
For campaigns, define objective, audience, insight, offer, message angle, channel, creative hypothesis, CTA, KPI, budget logic when data exists, and test plan.
Prefer revenue and qualified-pipeline outcomes over vanity metrics. Distinguish market evidence from hypotheses.
`.trim(),
  sales: `
Role: Elite B2B Sales Director and Revenue Operator for Saudi SMEs.
Diagnose the lead's business, pain, urgency, authority, budget signals, objections, trust gaps, and next buying step. Use consultative selling, discovery, qualification, objection handling, follow-up design, and proposal strategy.
Produce personalized outreach and next-best actions, not spam. Tie Tiqnora services to a concrete business outcome and ask one high-value question at a time.
Never invent client facts, discounts, guarantees, prices, or approvals. Any external message remains a draft until approved.
`.trim(),
  ads: `
Role: Elite Performance Marketing & Paid Acquisition Director.
Design campaigns from business economics backward: conversion event, audience, offer, creative angle, landing experience, measurement, CAC target, budget allocation, testing cadence, and stop/scale rules.
Separate Meta, TikTok, Google and LinkedIn strategy by intent and platform mechanics. Diagnose creative, audience, auction, funnel, and tracking failure modes separately.
Never fabricate benchmark data or platform performance. Use explicit hypotheses and measurable experiments.
`.trim(),
  channel: `
Role: Elite Omnichannel Growth & Revenue Analyst.
Compare channels by customer intent, reach, conversion path, cost, lead quality, speed to revenue, retention contribution, operational burden, and measurement confidence.
Identify channel overlap, leakage, attribution ambiguity, and the next experiment that can reduce uncertainty.
Recommend a channel mix based on the objective and available evidence rather than popularity.
`.trim(),
  content: `
Role: Elite Arabic-English Content, SEO and Editorial Strategy Director.
Master search intent, topic clusters, landing-page conversion, persuasive structure, Saudi Arabic tone, editorial quality, credibility, GEO/AI-search discoverability, hooks, CTAs, and repurposing.
Write for the reader and channel first. Avoid filler, cliché AI wording, fake statistics, fake testimonials, and unsupported claims.
When drafting, optimize clarity, usefulness, trust, scannability, intent match, and conversion while preserving natural Arabic.
`.trim(),
  'social-media': `
Role: Elite Social Media Growth & Community Director.
Think platform-native: hook, retention, watch-time, saves, shares, comments, profile visits, lead intent, cadence, creative format, community response, and learning loops.
Adapt strategy separately for TikTok, Instagram, LinkedIn, Facebook and X instead of cloning the same post.
Build content systems, not random posts: pillars, series, experiments, production briefs, publishing logic, response playbooks, and measurable weekly learnings.
`.trim(),
  'image-designer': `
Role: Elite Brand Art Director and AI Visual Designer with cross-industry commercial creative direction expertise equivalent to a principal creative director operating across SaaS, B2B, e-commerce, and Saudi market campaigns.
Translate business objectives into production-ready visual concepts: audience insight, single message, hierarchy, composition, format, typography direction, brand constraints, imagery, negative constraints, dimensions, and final generation prompt.
Design for the destination platform and conversion goal, not decoration. Keep Tiqnora brand consistency and legibility on mobile.
Operate the platform image pipeline when the user requests a design, poster, social visual, or campaign creative: generate real images via generateImage(), compose Arabic text and the official Tiqnora logo programmatically, run quality gates, store outputs, and send Telegram design-review previews with approval controls.
Never reply that you have no image tool or that you can only provide a prompt unless every configured image provider has already failed — then report the technical error briefly.
Never auto-publish to Instagram, Facebook, TikTok, LinkedIn, or WhatsApp; default approval_status is pending_approval.
Do not claim an image file was generated unless the image pipeline actually produced it.
`.trim(),
  'video-designer': `
Role: Elite Short-Form Video Creative Director and Performance Storyteller.
Engineer the first seconds, retention beats, narrative arc, proof, pattern interrupts, shot list, on-screen text, voice-over, B-roll, pacing, CTA, thumbnail idea, and platform-native duration.
Create production-ready scripts for TikTok, Reels, Shorts, ads, demos, and B2B explainers. Every scene must have a purpose.
Do not claim a video file was rendered unless a video-generation or editing tool actually produced it.
`.trim(),
  developer: `
Role: Principal Software Architect, SRE and Security Engineer for Tiqnora.
Work from evidence: reproduce the issue, trace root cause, inspect data flow, identify blast radius, propose the smallest safe fix, test it, define rollback, and verify production behavior.
Prioritize security, correctness, reliability, observability, performance, maintainability, backward compatibility, and cost.
Never claim code was executed, deployed, or verified unless the system actually did so. Protect secrets and avoid destructive changes without approval.
`.trim(),
  commerce: `
Role: Elite Saudi E-commerce, Merchandising, Sourcing and Unit-Economics Director.
Evaluate product-market fit, landed cost, shipping, VAT awareness, payment/returns risk, supplier reliability, stock confidence, delivery promise, conversion potential, margin, competitive positioning, catalog quality, and after-sales burden.
Never invent live supplier facts. Mark uncertainty clearly. Prefer products with verifiable demand, healthy economics, reliable fulfillment, and low return/support risk.
No auto-purchase, auto-publish, or public price change without explicit approval.
`.trim()
});

function taskContext(rows) {
  if (!rows?.length) return 'No open tasks are assigned to this agent.';
  return [
    'Open tasks for this agent:',
    ...rows.map(row => `- [${row.priority || 'medium'} | ${row.status || 'todo'}] ${row.title}${row.description ? `: ${String(row.description).slice(0, 500)}` : ''}${row.due_at ? ` (due ${row.due_at})` : ''}`)
  ].join('\n');
}

function expertSystemPrompt(agent, memory, tasks) {
  const specialty = AGENT_EXPERTISE[agent?.slug] || `
Role: Principal specialist. Stay rigorous, evidence-aware, practical, and within your real expertise. Recommend another Tiqnora specialist when a task clearly belongs elsewhere.
`.trim();
  return [
    agent?.system_prompt || agent?.description || '',
    ELITE_OPERATING_STANDARD,
    specialty,
    memoryContext(memory),
    taskContext(tasks)
  ].filter(Boolean).join('\n\n');
}

async function callOpenAI(agent, messages) {
  if (!process.env.OPENAI_API_KEY) throw Object.assign(new Error('لم يتم إعداد OPENAI_API_KEY في Vercel بعد.'), { status: 503 });
  const model = process.env.OPENAI_MODEL || 'chat-latest';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_completion_tokens: 4096, messages })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || `OpenAI request failed (${response.status})`), { status: 502 });
  return { text: payload.choices?.[0]?.message?.content || '', model: payload.model || agent.model };
}

async function callAnthropic(agent, messages) {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('لم يتم إعداد ANTHROPIC_API_KEY في Vercel بعد.'), { status: 503 });
  const system = messages.find(m => m.role === 'system')?.content || '';
  const conversation = messages.filter(m => m.role !== 'system');
  const model = agent.model?.startsWith('claude-') ? agent.model : (process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, system, messages: conversation, max_tokens: 2048, temperature: Number(agent.temperature ?? 0.7) })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || `Anthropic request failed (${response.status})`), { status: 502 });
  return { text: (payload.content || []).filter(x => x.type === 'text').map(x => x.text).join('\n'), model: payload.model || model };
}

async function callGemini(agent, messages) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw Object.assign(new Error('لم يتم إعداد GEMINI_API_KEY في Vercel بعد.'), { status: 503 });
  const model = agent.model?.startsWith('gemini-') ? agent.model : (process.env.GEMINI_MODEL || 'gemini-3.8-flash');
  const systemInstruction = messages.find(message => message.role === 'system')?.content || '';
  const contents = messages.filter(message => message.role !== 'system').map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }]
  }));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      contents,
      generationConfig: { temperature: Number(agent.temperature ?? 0.7), maxOutputTokens: 2048 }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || `Gemini request failed (${response.status})`), { status: 502 });
  const text = (payload.candidates?.[0]?.content?.parts || []).map(part => part.text || '').join('\n');
  return { text, model };
}

async function callGrok(agent, messages) {
  if (!process.env.XAI_API_KEY) throw Object.assign(new Error('لم يتم إعداد XAI_API_KEY في Vercel بعد.'), { status: 503 });
  const model = agent.model?.startsWith('grok-') ? agent.model : (process.env.XAI_MODEL || 'grok-3-mini');
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: Number(agent.temperature ?? 0.7), messages })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.error?.message || `xAI/Grok request failed (${response.status})`), { status: 502 });
  return { text: payload.choices?.[0]?.message?.content || '', model: payload.model || model };
}

function providerCandidates() {
  const out = [];
  if (process.env.OPENAI_API_KEY) out.push({ id: 'openai', call: callOpenAI });
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) out.push({ id: 'google_ai', call: callGemini });
  if (process.env.XAI_API_KEY) out.push({ id: 'xai', call: callGrok });
  if (process.env.ANTHROPIC_API_KEY) out.push({ id: 'anthropic', call: callAnthropic });
  return out;
}

async function callPreferredProvider(agent, messages) {
  const candidates = providerCandidates();
  if (!candidates.length) throw Object.assign(new Error('لا يوجد مزود ذكاء اصطناعي مهيأ في Vercel.'), { status: 503 });
  const failures = [];
  for (const candidate of candidates) {
    try {
      const result = await candidate.call(agent, messages);
      if (!String(result?.text || '').trim()) throw new Error('عاد المزود برد فارغ.');
      return { ...result, provider: candidate.id };
    } catch (error) {
      failures.push(`${candidate.id}: ${error.message}`);
    }
  }
  const error = new Error(`فشلت جميع مزودات الذكاء الاصطناعي: ${failures.join(' | ')}`);
  error.status = 502;
  throw error;
}

async function saveConversation(token, row) {
  const data = await supabase('/rest/v1/ai_conversations?select=*', token, {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(row)
  });
  return data?.[0];
}

async function backfillKnowledgeEmbeddings(token, userId, limitRaw = 10) {
  const profiles = await supabase(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,role,is_active,default_organization_id`,
    token
  );
  const profile = profiles?.[0];
  if (!profile || !profile.is_active || !['admin', 'super_admin'].includes(profile.role)) {
    const error = new Error('صلاحية أدمن مطلوبة.');
    error.status = 403;
    throw error;
  }
  if (!profile.default_organization_id) {
    const error = new Error('لا توجد مؤسسة افتراضية مرتبطة بالحساب.');
    error.status = 400;
    throw error;
  }

  const limit = Math.max(1, Math.min(Number(limitRaw || 10), 25));
  const rows = await supabase(
    `/rest/v1/${KNOWLEDGE_SOURCE_TABLE}?organization_id=eq.${encodeURIComponent(profile.default_organization_id)}&embedding=is.null&select=id,content&order=created_at.asc&limit=${limit}`,
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
        `/rest/v1/${KNOWLEDGE_SOURCE_TABLE}?id=eq.${encodeURIComponent(row.id)}`,
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

  return {
    organization_id: profile.default_organization_id,
    requested: limit,
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results
  };
}

function providerStatusPayload() {
  const providers = [
    { id: 'google_ai', name: 'Google Gemini', configured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY), defaultModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash', envVars: ['GEMINI_API_KEY', 'GOOGLE_GEMINI_API_KEY', 'GEMINI_MODEL'] },
    { id: 'openai', name: 'OpenAI', configured: Boolean(process.env.OPENAI_API_KEY), defaultModel: process.env.OPENAI_MODEL || 'chat-latest', envVars: ['OPENAI_API_KEY', 'OPENAI_MODEL'] },
    { id: 'anthropic', name: 'Claude (Anthropic)', configured: Boolean(process.env.ANTHROPIC_API_KEY), defaultModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest', envVars: ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'] },
    { id: 'xai', name: 'Grok (xAI)', configured: Boolean(process.env.XAI_API_KEY), defaultModel: process.env.XAI_MODEL || 'grok-3-mini', envVars: ['XAI_API_KEY', 'XAI_MODEL'] }
  ];
  return { providers, anyConfigured: providers.some(p => p.configured), note: 'المفاتيح تُدار فقط من Vercel Environment Variables ولا تُعرض هنا.' };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  const token = bearer(req);
  if (!token) return json(res, 401, { error: 'يلزم تسجيل الدخول.' });

  if (req.method === 'GET' && String(req.query?.route || '').toLowerCase() === 'runtime-status') {
    try {
      const user = await supabase('/auth/v1/user', token);
      const profiles = await supabase(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,is_active`, token);
      const profile = profiles?.[0];
      if (!profile || !profile.is_active || !['admin','super_admin'].includes(profile.role)) {
        return json(res, 403, { error: 'صلاحية أدمن مطلوبة.' });
      }
      const mode = selectRuntimeMode(process.env);
      return json(res, 200, {
        runtime: { mode: mode.mode, path: mode.path, v2_enabled: mode.v2 },
        concepts: AGENT_CONCEPTS,
        skills: listRuntimeSkills(),
        agent_skill_bindings: listAgentSkillBindings(),
        embeddings: embeddingStatus(process.env),
        mcp: {
          native: true,
          endpoint: '/api/v6?route=mcp',
          sdk: '@modelcontextprotocol/server',
          compatibility_endpoint: '/api/v6?route=mcp_social'
        }
      });
    } catch (error) {
      return json(res, error.status && error.status < 600 ? error.status : 500, { error: error.message || 'تعذر تحميل حالة runtime.' });
    }
  }

  if (req.method === 'GET' && String(req.query?.route || '').toLowerCase() === 'providers') {
    try {
      const user = await supabase('/auth/v1/user', token);
      const profiles = await supabase(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,is_active`, token);
      const profile = profiles?.[0];
      if (!profile || !profile.is_active || !['admin','super_admin'].includes(profile.role)) return json(res, 403, { error: 'صلاحية أدمن مطلوبة.' });
      return json(res, 200, providerStatusPayload());
    } catch (error) {
      return json(res, error.status && error.status < 600 ? error.status : 500, { error: error.message || 'حدث خطأ غير متوقع.' });
    }
  }

  if (req.method === 'POST' && String(req.query?.route || '').toLowerCase() === 'rag-backfill') {
    try {
      const user = await supabase('/auth/v1/user', token);
      const result = await backfillKnowledgeEmbeddings(token, user.id, req.body?.limit);
      return json(res, 200, result);
    } catch (error) {
      return json(res, error.status && error.status < 600 ? error.status : 500, {
        error: error.message || 'تعذر تجهيز embeddings.'
      });
    }
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const agentId = String(req.body?.agentId || '');
  const message = String(req.body?.message || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(agentId)) return json(res, 400, { error: 'معرّف الموظف غير صالح.' });
  if (!message || message.length > 20000) return json(res, 400, { error: 'يجب أن تكون الرسالة بين 1 و20000 حرف.' });

  let user, agent;
  try {
    user = await supabase('/auth/v1/user', token);
    const profiles = await supabase(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role,is_active`, token);
    const profile = profiles?.[0];
    if (!profile || !profile.is_active || !['admin','super_admin'].includes(profile.role)) return json(res, 403, { error: 'لا تملك صلاحية استخدام فريق العمل الذكي.' });
    const agents = await supabase(`/rest/v1/ai_agents?id=eq.${encodeURIComponent(agentId)}&select=*`, token);
    agent = agents?.[0];
    if (!agent || agent.status !== 'active' || !agent.is_enabled) return json(res, 404, { error: 'الموظف غير موجود أو غير نشط.' });

    const [legacyMemory, typedMemoryRows, recent, tasks, stateRows, runtimeAgents, approvedLearningRows] = await Promise.all([
      supabase(`/rest/v1/ai_memory?agent_id=eq.${encodeURIComponent(agentId)}&select=memory_key,memory_value&order=created_at.desc&limit=40`, token),
      supabaseOptional(`/rest/v1/agent_memory_entries?organization_id=eq.${encodeURIComponent(agent.organization_id)}&archived_at=is.null&select=memory_id,agent_key,memory_type,scope,key,content,summary,tags,created_at&order=created_at.desc&limit=80`, token, {}, []),
      supabase(`/rest/v1/ai_conversations?agent_id=eq.${encodeURIComponent(agentId)}&select=message,response&status=eq.completed&order=created_at.desc&limit=12`, token),
      supabase(`/rest/v1/ai_tasks?agent_id=eq.${encodeURIComponent(agentId)}&status=in.(todo,in_progress,blocked)&select=title,description,status,priority,due_at&order=priority.desc,created_at.desc&limit=20`, token),
      supabaseOptional(`/rest/v1/ai_agent_state?agent_id=eq.${encodeURIComponent(agentId)}&select=version,mode,current_goal,active_thread,last_outcome,counters,state&limit=1`, token, {}, []),
      supabase(`/rest/v1/ai_agents?organization_id=eq.${encodeURIComponent(agent.organization_id)}&is_enabled=eq.true&status=eq.active&select=id,organization_id,slug,name,name_ar,description,system_prompt,model,temperature,provider,status,is_enabled`, token),
      supabaseOptional(`/rest/v1/ai_agent_learning_events?organization_id=eq.${encodeURIComponent(agent.organization_id)}&status=eq.approved&select=id,agent_id,lesson_key,lesson,status,metadata,created_at&order=created_at.desc&limit=100`, token, {}, [])
    ]);
    const typedMemory = (typedMemoryRows || []).filter(row =>
      ['shared','organization'].includes(row.scope) || !row.agent_key || row.agent_key === agent.slug
    ).slice(0, 30);
    const memory = [
      ...(legacyMemory || []),
      ...typedMemory.map(row => ({
        memory_key: `[${row.memory_type}] ${row.key}`,
        memory_value: row.content,
        typed_memory_id: row.memory_id
      }))
    ].slice(0, 60);
    const approvedLessons = approvedLearningForAgent(approvedLearningRows, agent);
    const stateRow = stateRows?.[0] || {};
    const runtimeState = {
      ...(stateRow.state || {}),
      version: stateRow.version || stateRow.state?.version || 1,
      mode: stateRow.mode || stateRow.state?.mode || 'ready',
      current_goal: stateRow.current_goal || stateRow.state?.current_goal || null,
      active_thread: stateRow.active_thread || stateRow.state?.active_thread || null,
      last_outcome: stateRow.last_outcome || stateRow.state?.last_outcome || null,
      counters: stateRow.counters || stateRow.state?.counters || {}
    };
    const knowledgeRetrieval = await retrieveLiveKnowledge({
      query: message,
      organization_id: agent.organization_id,
      token,
      supabaseCall: supabase,
      env: process.env,
      limit: 8
    });
    const knowledge = knowledgeRetrieval.chunks;
    const runtimeMode = selectRuntimeMode(process.env);
    const runtime = runtimeMode.v2
      ? buildV2RuntimeContext({
          agent,
          message,
          agents: runtimeAgents || [],
          state: runtimeState,
          memory,
          tasks,
          recent,
          knowledge,
          approvedLessons
        })
      : orchestrationContext({
          agent,
          message,
          agents: runtimeAgents || [],
          state: runtimeState,
          memory,
          tasks,
          recent,
          knowledge,
          approvedLessons
        });

    const history = (recent || []).reverse().flatMap(row => [
      { role: 'user', content: row.message },
      ...(row.response ? [{ role: 'assistant', content: row.response }] : [])
    ]);
    const runtimePrompt = [
      formatStateContext(runtime.state),
      runtime.intent_prompt,
      runtime.skills_prompt,
      runtime.rag_prompt,
      runtime.learning_prompt,
      `Allowed MCP/tool scopes for this agent: ${runtime.tools.join(', ')}. Never call or claim tools outside these scopes.`,
      runtime.delegation ? `Manager orchestration plan (delegate through Tiqnora A2A/multi-agent runtime where available):\n${JSON.stringify(runtime.delegation)}` : ''
    ].filter(Boolean).join('\n\n');

    const messages = [
      { role: 'system', content: [expertSystemPrompt(agent, memory, tasks), runtimePrompt].filter(Boolean).join('\n\n') },
      ...history,
      { role: 'user', content: message }
    ];

    let result;
    try {
      const { tryHandleImageDesignerChat } = await import('../../lib/v6/image-designer-chat-hook.js');
      const imageResult = await tryHandleImageDesignerChat({ agent, message, user, token });
      if (imageResult) result = imageResult;
    } catch (hookErr) {
      if (String(agent?.slug || '').toLowerCase() === 'image-designer') {
        console.error('image-designer-hook', hookErr?.message || hookErr);
      }
    }
    let runtimeEvaluation = null;
    let learningEvent = null;
    let harnessMeta = null;
    let liveCollaboration = null;
    let providerMessages = messages;

    if (!result) {
      const invoke = async ({ attempt, feedback }) => {
          const retryNote = attempt > 1 && feedback.length
            ? { role: 'system', content: `Quality retry: improve these failed checks before answering: ${feedback.join(', ')}. Do not mention this retry to the user.` }
            : null;
          return callPreferredProvider(agent, retryNote ? [...providerMessages, retryNote] : providerMessages);
        };

      if (runtimeMode.v2) {
        const v2Started = Date.now();
        const v2TraceId = `tr_chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        // One logical trace for the live V2 turn (best-effort; never blocks response)
        await supabaseOptional('/rest/v1/agent_traces', token, {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            organization_id: agent.organization_id,
            trace_id: v2TraceId,
            root_agent_key: agent.slug || agent.id,
            trigger: 'chat_v2',
            status: 'running',
            metadata: { agent_id: agent.id, agent_key: agent.slug, mode: 'v2' },
            started_at: new Date().toISOString()
          })
        }, null);
        await supabaseOptional('/rest/v1/agent_trace_spans', token, {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({
            organization_id: agent.organization_id,
            trace_id: v2TraceId,
            span_id: `sp_req_${Date.now().toString(36)}`,
            agent_key: agent.slug || agent.id,
            span_type: 'step',
            name: 'request_runtime',
            status: 'completed',
            input: {
              message_len: message.length,
              execution_contract: runtime.execution_contract
            },
            output: { path: runtimeMode.path }
          })
        }, null);

        try {
          if (
            String(agent.slug || '').toLowerCase() === 'manager'
            && Array.isArray(runtime.delegation?.tasks)
            && runtime.delegation.tasks.length
          ) {
            liveCollaboration = await executeLiveDelegation({
              manager: agent,
              plan: runtime.delegation,
              agents: runtimeAgents || [],
              objective: message,
              correlationId: v2TraceId,
              invokeSpecialist: async ({ specialist, task: delegatedTask, objective }) => {
                const specialistRuntime = buildV2RuntimeContext({
                  agent: specialist,
                  message: delegatedTask.task || objective,
                  agents: runtimeAgents || [],
                  state: {
                    mode: 'delegated',
                    current_goal: delegatedTask.task || objective,
                    active_thread: v2TraceId,
                    parent_agent: agent.slug || agent.id
                  },
                  memory,
                  tasks,
                  recent: [],
                  knowledge,
                  approvedLessons: approvedLearningForAgent(approvedLearningRows, specialist)
                });
                const specialistRuntimePrompt = [
                  formatStateContext(specialistRuntime.state),
                  specialistRuntime.intent_prompt,
                  specialistRuntime.skills_prompt,
                  specialistRuntime.rag_prompt,
                  specialistRuntime.learning_prompt,
                  `Allowed MCP/tool scopes for this specialist: ${specialistRuntime.tools.join(', ')}. Do not execute external actions.`,
                  'This is a bounded A2A specialist task. Return analysis/artifact text only. Do not delegate again.'
                ].filter(Boolean).join('\n\n');
                const specialistMessages = [
                  {
                    role: 'system',
                    content: [
                      expertSystemPrompt(specialist, memory, tasks),
                      specialistRuntimePrompt
                    ].filter(Boolean).join('\n\n')
                  },
                  {
                    role: 'user',
                    content: [
                      `Manager objective: ${objective}`,
                      `Delegated task: ${delegatedTask.task || objective}`,
                      `Acceptance: ${(delegatedTask.acceptance || []).join(', ') || 'specific, evidence-aware, actionable'}`
                    ].join('\n')
                  }
                ];
                const specialistTurn = await runV2AgentTurn({
                  agent: specialist,
                  message: delegatedTask.task || objective,
                  knowledge,
                  runtime: specialistRuntime,
                  invoke: async ({ attempt, feedback }) => {
                    const retryNote = attempt > 1 && feedback.length
                      ? {
                          role: 'system',
                          content: `Quality retry for delegated specialist output: ${feedback.join(', ')}.`
                        }
                      : null;
                    return callPreferredProvider(
                      specialist,
                      retryNote ? [...specialistMessages, retryNote] : specialistMessages
                    );
                  }
                });
                const providerResult = specialistTurn.result?.result || {};
                return {
                  text: specialistTurn.response,
                  provider: providerResult.provider || null,
                  model: providerResult.model || specialist.model || null,
                  evaluation: specialistTurn.evaluation
                };
              },
              persistMessage: async (row) => {
                return supabase('/rest/v1/ai_agent_messages', token, {
                  method: 'POST',
                  headers: { Prefer: 'return=minimal' },
                  body: JSON.stringify(row)
                });
              },
              recordSpan: async (span) => {
                return supabase('/rest/v1/agent_trace_spans', token, {
                  method: 'POST',
                  headers: { Prefer: 'return=minimal' },
                  body: JSON.stringify(span)
                });
              }
            });

            providerMessages = [
              ...messages.slice(0, -1),
              { role: 'system', content: liveCollaboration.synthesis_context },
              messages[messages.length - 1]
            ];

            await supabaseOptional('/rest/v1/agent_trace_spans', token, {
              method: 'POST',
              headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({
                organization_id: agent.organization_id,
                trace_id: v2TraceId,
                span_id: `sp_synthesis_${Date.now().toString(36)}`,
                agent_key: agent.slug || agent.id,
                span_type: 'synthesis',
                name: 'manager_synthesis_context',
                status: 'completed',
                input: {
                  specialists: liveCollaboration.specialists_executed,
                  failures: liveCollaboration.failures.length
                },
                output: {
                  external_actions: 0,
                  auto_send: false,
                  auto_publish: false
                },
                completed_at: new Date().toISOString()
              })
            }, null);
          }

          const v2Turn = await runV2AgentTurn({
            agent,
            message,
            knowledge,
            runtime,
            invoke
          });
          // Consume full V2 turn — do not discard evaluation/learning/meta
          result = v2Turn.result?.result ?? v2Turn.result;
          runtimeEvaluation = v2Turn.evaluation;
          learningEvent = v2Turn.learning;
          harnessMeta = {
            ...(v2Turn.meta || {}),
            trace_id: v2TraceId,
            duration_ms: Date.now() - v2Started,
            collaboration: liveCollaboration ? {
              protocol: liveCollaboration.protocol,
              specialists_executed: liveCollaboration.specialists_executed,
              failures: liveCollaboration.failures,
              warnings: liveCollaboration.warnings,
              external_actions: 0
            } : null
          };

          await supabaseOptional('/rest/v1/agent_trace_spans', token, {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              organization_id: agent.organization_id,
              trace_id: v2TraceId,
              span_id: `sp_harness_${Date.now().toString(36)}`,
              agent_key: agent.slug || agent.id,
              span_type: 'step',
              name: 'provider_harness',
              status: 'completed',
              output: { has_result: Boolean(result) }
            })
          }, null);
          await supabaseOptional('/rest/v1/agent_trace_spans', token, {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              organization_id: agent.organization_id,
              trace_id: v2TraceId,
              span_id: `sp_eval_${Date.now().toString(36)}`,
              agent_key: agent.slug || agent.id,
              span_type: 'step',
              name: 'eval',
              status: runtimeEvaluation?.pass || runtimeEvaluation?.passed ? 'completed' : 'failed',
              output: {
                score: runtimeEvaluation?.score ?? null,
                pass: runtimeEvaluation?.pass ?? runtimeEvaluation?.passed ?? null
              }
            })
          }, null);
          // Finish same trace (PATCH by trace_id filter)
          await supabaseOptional(
            `/rest/v1/agent_traces?trace_id=eq.${encodeURIComponent(v2TraceId)}`,
            token,
            {
              method: 'PATCH',
              headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({
                status: 'completed',
                completed_at: new Date().toISOString(),
                duration_ms: Date.now() - v2Started,
                summary: {
                  eval_pass: runtimeEvaluation?.pass ?? runtimeEvaluation?.passed ?? null,
                  score: runtimeEvaluation?.score ?? null,
                  specialists: liveCollaboration?.specialists_executed || [],
                  specialist_failures: liveCollaboration?.failures?.length || 0
                }
              })
            },
            null
          );
        } catch (error) {
          const failure = String(error?.code || error?.message || 'v2_runtime_failed').slice(0, 500);
          await supabaseOptional('/rest/v1/agent_trace_spans', token, {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({
              organization_id: agent.organization_id,
              trace_id: v2TraceId,
              span_id: `sp_error_${Date.now().toString(36)}`,
              agent_key: agent.slug || agent.id,
              span_type: 'error',
              name: 'runtime_error',
              status: 'failed',
              error_code: String(error?.code || 'v2_runtime_error').slice(0, 120),
              error_message: failure,
              duration_ms: Date.now() - v2Started
            })
          }, null);
          await supabaseOptional(
            `/rest/v1/agent_traces?trace_id=eq.${encodeURIComponent(v2TraceId)}`,
            token,
            {
              method: 'PATCH',
              headers: { Prefer: 'return=minimal' },
              body: JSON.stringify({
                status: 'failed',
                completed_at: new Date().toISOString(),
                duration_ms: Date.now() - v2Started,
                summary: { error_code: String(error?.code || 'v2_runtime_error').slice(0, 120) }
              })
            },
            null
          );
          throw error;
        }
      } else {
        const harnessRun = await runAgentHarness({
          agent,
          message,
          knowledge,
          executionContract: runtime.execution_contract,
          invoke
        });
        result = harnessRun.result;
        runtimeEvaluation = harnessRun.evaluation;
        learningEvent = harnessRun.learning_event;
        harnessMeta = harnessRun.harness;
      }
    } else {
      runtimeEvaluation = evaluateAgentResponse({
        agentSlug: agent.slug,
        message,
        response: result.text,
        knowledge
      });
      learningEvent = buildLearningEvent(runtimeEvaluation, { agent_slug: agent.slug });
    }

    const conversation = await saveConversation(token, {
      organization_id: agent.organization_id, agent_id: agent.id, user_id: user.id,
      message, response: result.text, provider: result.provider, model: result.model, status: 'completed'
    });

    if (conversation?.id) {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      await supabaseOptional('/rest/v1/agent_memory_entries', token, {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          organization_id: agent.organization_id,
          memory_id: `chat_${conversation.id}`,
          agent_key: agent.slug || agent.id,
          memory_type: 'episodic',
          scope: 'agent',
          key: `chat_turn:${conversation.id}`,
          content: `User: ${message.slice(0, 1800)}\nAssistant: ${String(result.text || '').slice(0, 2200)}`,
          summary: String(result.text || '').slice(0, 500),
          confidence: 1,
          source: 'ai-workforce-chat',
          tags: ['chat','episodic'],
          expires_at: expiresAt,
          metadata: {
            conversation_id: conversation.id,
            provider: result.provider || null,
            model: result.model || null,
            runtime_mode: runtimeMode.mode
          }
        })
      }, []);
    }

    await supabaseOptional('/rest/v1/ai_agent_state?on_conflict=agent_id', token, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        agent_id: agent.id,
        organization_id: agent.organization_id,
        version: Number(runtime.state.version || 1) + 1,
        mode: 'ready',
        current_goal: String(message).slice(0, 500),
        active_thread: conversation?.id || runtime.state.active_thread || null,
        last_outcome: runtimeEvaluation?.pass === false ? 'completed_with_eval_feedback' : 'completed',
        counters: {
          ...(runtimeState.counters || {}),
          conversations: Number(runtimeState.counters?.conversations || 0) + 1
        },
        state: {
          ...(runtimeState || {}),
          last_message_at: new Date().toISOString(),
          last_eval_score: runtimeEvaluation?.score ?? null,
          last_rag_chunks: knowledge.map(item => item.id)
        }
      })
    }, []);

    if (runtimeEvaluation) {
      const evalRows = await supabaseOptional('/rest/v1/ai_agent_evals?select=id', token, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(buildEvalInsert({
          organization_id: agent.organization_id,
          agent_id: agent.id,
          conversation_id: conversation?.id || null,
          evaluation: {
            rubric: runtimeEvaluation.rubric,
            score: runtimeEvaluation.score,
            pass: runtimeEvaluation.pass,
            dimensions: runtimeEvaluation.dimensions,
            failures: runtimeEvaluation.failures
          },
          meta: {
            mode: runtimeMode.mode,
            path: runtimeMode.path,
            harness: harnessMeta,
            rag_chunk_ids: knowledge.map(item => item.id),
            rag_retrieval_mode: knowledgeRetrieval.mode,
            rag_source_table: KNOWLEDGE_SOURCE_TABLE,
            rag_vector_error: knowledgeRetrieval.diagnostics?.vector_error || null,
            approved_learning_ids: approvedLessons.map((row) => row.id || row.lesson_key).filter(Boolean),
            execution_contract: {
              protocol: runtime.execution_contract?.protocol || null,
              objective: runtime.execution_contract?.objective || message,
              definition_of_done: runtime.execution_contract?.definition_of_done || []
            },
            skills: runtime.agent_card.skills,
            allowed_tools: runtime.tools
          }
        }))
      }, []);

      if (learningEvent) {
        await supabaseOptional('/rest/v1/ai_agent_learning_events', token, {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify(buildLearningInsert({
            organization_id: agent.organization_id,
            agent_id: agent.id,
            agent_key: agent.slug || agent.id,
            source_eval_id: evalRows?.[0]?.id || null,
            learning: learningEvent
          }))
        }, []);
      }
    }

    return json(res, 200, {
      conversation,
      conversation_id: conversation?.id || null,
      reply: result.text,
      provider: result.provider || null,
      model: result.model || null,
      meta: {
        ...(result.meta || {}),
        runtime: {
          concepts: ['memory_state','orchestration','rag','harness','evals','mcp','skills','a2a','multi_agent'],
          mode: (typeof runtimeMode !== 'undefined' ? runtimeMode.mode : 'legacy'),
          path: (typeof runtimeMode !== 'undefined' ? runtimeMode.path : 'legacy.chat'),
          eval: runtimeEvaluation ? { score: runtimeEvaluation.score, pass: runtimeEvaluation.pass } : null,
          rag_chunks: knowledge.map(item => item.id),
          rag_mode: knowledgeRetrieval.mode,
          rag_source_table: KNOWLEDGE_SOURCE_TABLE,
          skills: runtime.agent_card.skills,
          delegation: runtime.delegation || null,
          live_collaboration: liveCollaboration ? {
            protocol: liveCollaboration.protocol,
            specialists_executed: liveCollaboration.specialists_executed,
            failures: liveCollaboration.failures,
            warnings: liveCollaboration.warnings,
            external_actions: 0,
            auto_send: false,
            auto_publish: false
          } : null
        }
      }
    });
  } catch (error) {
    if (agent && user) {
      await saveConversation(token, {
        organization_id: agent.organization_id, agent_id: agent.id, user_id: user.id,
        message, response: null, provider: process.env.OPENAI_API_KEY ? 'openai' : agent.provider, model: process.env.OPENAI_MODEL || agent.model,
        status: 'failed', error_message: String(error.message).slice(0, 1000)
      }).catch(() => {});
    }
    return json(res, error.status && error.status < 600 ? error.status : 500, { error: error.message || 'حدث خطأ غير متوقع.' });
  }
}
