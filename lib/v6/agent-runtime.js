/**
 * Tiqnora Agent Concepts Runtime v1
 *
 * Implements a common runtime contract for:
 * 1) Memory & State  2) Orchestration  3) RAG  4) Harness  5) Evals
 * 6) MCP  7) Skills  8) A2A  9) Multi-Agent
 *
 * Pure/runtime-safe module: no secrets, no direct external side effects.
 */

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export const AGENT_CONCEPTS = Object.freeze([
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

export const RUNTIME_LIMITS = Object.freeze({
  max_harness_attempts: 2,
  max_rag_chunks: 8,
  max_multi_agents: 4,
  max_a2a_hops: 4
});

const SKILLS = Object.freeze({
  executive_routing: {
    id: 'executive_routing',
    title: 'Executive routing',
    instruction: 'Clarify the objective, decompose it, assign specialist ownership, define dependencies, and reconcile outputs into one next-action plan.'
  },
  sales_discovery: {
    id: 'sales_discovery',
    title: 'Sales discovery',
    instruction: 'Diagnose need, pain, urgency, authority, budget signals, objections, trust gaps, and the next buying step. Keep outbound messages approval-gated.'
  },
  growth_strategy: {
    id: 'growth_strategy',
    title: 'Growth strategy',
    instruction: 'Frame ICP, JTBD, positioning, offer, funnel, channel, experiment, KPI, and pipeline impact. Separate evidence from hypotheses.'
  },
  performance_ads: {
    id: 'performance_ads',
    title: 'Performance ads',
    instruction: 'Design objective, audience, offer, creative hypothesis, conversion path, measurement, budget logic, and stop/scale rules.'
  },
  content_strategy: {
    id: 'content_strategy',
    title: 'Content strategy',
    instruction: 'Match search/platform intent, create strong structure and CTA, avoid unsupported claims, and optimize usefulness and discoverability.'
  },
  social_growth: {
    id: 'social_growth',
    title: 'Social growth',
    instruction: 'Create platform-native hooks, formats, retention beats, response playbooks, experiments, and measurable learning loops.'
  },
  visual_direction: {
    id: 'visual_direction',
    title: 'Visual direction',
    instruction: 'Translate the business objective into composition, hierarchy, typography direction, imagery, brand constraints, platform dimensions, and negative constraints.'
  },
  video_direction: {
    id: 'video_direction',
    title: 'Video direction',
    instruction: 'Engineer hook, retention beats, narrative, shot list, on-screen text, voice-over, pacing, CTA, and platform-native duration.'
  },
  software_engineering: {
    id: 'software_engineering',
    title: 'Software engineering',
    instruction: 'Reproduce from evidence, trace root cause, minimize blast radius, implement the smallest safe fix, test, define rollback, and verify.'
  },
  commerce_ops: {
    id: 'commerce_ops',
    title: 'Commerce operations',
    instruction: 'Evaluate landed cost, fulfillment confidence, margin, returns/support risk, catalog quality, conversion potential, and supplier uncertainty.'
  },
  customer_ops: {
    id: 'customer_ops',
    title: 'Customer operations',
    instruction: 'Understand intent, answer from verified context, protect private data, route specialist work, and keep external irreversible actions approval-gated.'
  },
  grounded_research: {
    id: 'grounded_research',
    title: 'Grounded research',
    instruction: 'Use retrieved evidence when available, distinguish facts from assumptions, cite the supplied source labels internally, and never invent missing evidence.'
  }
});

const AGENT_SKILLS = Object.freeze({
  manager: ['executive_routing', 'grounded_research'],
  assistant: ['customer_ops', 'grounded_research'],
  'voice-agent': ['customer_ops', 'sales_discovery', 'grounded_research'],
  marketing: ['growth_strategy', 'content_strategy', 'grounded_research'],
  sales: ['sales_discovery', 'grounded_research'],
  ads: ['performance_ads', 'growth_strategy', 'grounded_research'],
  channel: ['growth_strategy', 'grounded_research'],
  content: ['content_strategy', 'grounded_research'],
  'social-media': ['social_growth', 'content_strategy', 'grounded_research'],
  'image-designer': ['visual_direction', 'content_strategy', 'grounded_research'],
  'video-designer': ['video_direction', 'content_strategy', 'grounded_research'],
  developer: ['software_engineering', 'grounded_research'],
  commerce: ['commerce_ops', 'grounded_research']
});

const MCP_POLICY = Object.freeze({
  manager: ['workflow.read', 'workflow.delegate', 'memory.read', 'knowledge.search', 'eval.read'],
  assistant: ['memory.read', 'knowledge.search'],
  'voice-agent': ['memory.read', 'knowledge.search', 'crm.read'],
  marketing: ['memory.read', 'knowledge.search', 'analytics.read', 'social.draft'],
  sales: ['memory.read', 'knowledge.search', 'crm.read', 'crm.draft'],
  ads: ['memory.read', 'knowledge.search', 'analytics.read', 'ads.read', 'ads.draft'],
  channel: ['memory.read', 'knowledge.search', 'analytics.read'],
  content: ['memory.read', 'knowledge.search', 'social.draft'],
  'social-media': ['memory.read', 'knowledge.search', 'social.read', 'social.draft'],
  'image-designer': ['memory.read', 'knowledge.search', 'media.generate_image', 'media.read'],
  'video-designer': ['memory.read', 'knowledge.search', 'media.read', 'media.generate_video'],
  developer: ['memory.read', 'knowledge.search', 'github.read', 'vercel.read', 'supabase.read'],
  commerce: ['memory.read', 'knowledge.search', 'commerce.read', 'commerce.draft']
});

function normalizeWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^p{L}p{N}_-]+/gu, ' ')
    .split(/s+/)
    .filter(word => word.length >= 2);
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function stableId(parts = []) {
  const input = parts.map(v => String(v ?? '')).join('|');
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `a2a_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function getSkillsForAgent(agentSlug) {
  const ids = AGENT_SKILLS[String(agentSlug || '').toLowerCase()] || ['grounded_research'];
  return ids.map(id => SKILLS[id]).filter(Boolean);
}

export function buildSkillsPrompt(agentSlug) {
  const skills = getSkillsForAgent(agentSlug);
  return [
    'Loaded specialist skills:',
    ...skills.map(skill => `- ${skill.title}: ${skill.instruction}`)
  ].join('\n');
}

export function allowedMcpTools(agentSlug) {
  return [...(MCP_POLICY[String(agentSlug || '').toLowerCase()] || ['memory.read', 'knowledge.search'])];
}

export function buildAgentCard(agent = {}) {
  const slug = String(agent.slug || agent.key || 'agent').toLowerCase();
  return {
    protocol: 'tiqnora-a2a/v1',
    id: agent.id || null,
    slug,
    name: agent.name_ar || agent.name || slug,
    description: agent.description || null,
    skills: getSkillsForAgent(slug).map(skill => skill.id),
    tools: allowedMcpTools(slug),
    accepts: ['task', 'message', 'artifact'],
    returns: ['message', 'artifact', 'handoff'],
    external_actions_require_approval: true
  };
}

export function buildStateSnapshot({ agent, state, memory, tasks, recent } = {}) {
  const safeState = state && typeof state === 'object' ? state : {};
  return {
    version: Number(safeState.version || 1),
    agent_slug: agent?.slug || null,
    mode: safeState.mode || 'ready',
    current_goal: safeState.current_goal || null,
    active_thread: safeState.active_thread || null,
    last_outcome: safeState.last_outcome || null,
    counters: safeState.counters || {},
    memory_items: Array.isArray(memory) ? memory.length : 0,
    open_tasks: Array.isArray(tasks) ? tasks.length : 0,
    recent_turns: Array.isArray(recent) ? recent.length : 0
  };
}

export function formatStateContext(snapshot = {}) {
  return [
    'Agent runtime state:',
    `- mode: ${snapshot.mode || 'ready'}`,
    `- current_goal: ${snapshot.current_goal || 'none'}`,
    `- active_thread: ${snapshot.active_thread || 'none'}`,
    `- last_outcome: ${snapshot.last_outcome || 'none'}`,
    `- open_tasks: ${Number(snapshot.open_tasks || 0)}`
  ].join('\n');
}

export function retrieveRagCandidates(query, chunks = [], options = {}) {
  const limit = clamp(Number(options.limit || RUNTIME_LIMITS.max_rag_chunks), 1, RUNTIME_LIMITS.max_rag_chunks);
  const q = unique(normalizeWords(query));
  if (!q.length) return [];
  return (chunks || [])
    .map((chunk, index) => {
      const text = String(chunk.content || chunk.chunk_text || chunk.text || '');
      const hay = new Set(normalizeWords(`${chunk.title || ''} ${text}`));
      let score = 0;
      for (const word of q) if (hay.has(word)) score += 2;
      if (text.toLowerCase().includes(String(query || '').toLowerCase())) score += 5;
      if (chunk.priority != null) score += Number(chunk.priority) * 0.1;
      return {
        id: chunk.id || `chunk_${index + 1}`,
        document_id: chunk.document_id || null,
        title: chunk.title || chunk.document_title || 'Knowledge',
        source_uri: chunk.source_uri || null,
        content: text.slice(0, 2400),
        score
      };
    })
    .filter(item => item.score > 0 && item.content)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function formatRagContext(chunks = []) {
  if (!chunks.length) return 'No retrieved knowledge context matched this request.';
  return [
    'Retrieved Tiqnora knowledge (ground answers in this evidence; do not invent beyond it):',
    ...chunks.map((chunk, index) =>
      `[K${index + 1}] ${chunk.title}${chunk.source_uri ? ` — ${chunk.source_uri}` : ''}\n${chunk.content}`
    )
  ].join('\n\n');
}

export function evaluateAgentResponse({ agentSlug, message, response, knowledge = [] } = {}) {
  const text = String(response || '').trim();
  const user = String(message || '').trim();
  const dimensions = {
    non_empty: text.length > 0 ? 1 : 0,
    useful_detail: text.length >= 80 ? 1 : text.length >= 30 ? 0.6 : 0.2,
    no_fake_execution_claim: /(?:تم|نفذت|نشرت|ارسلت|اتصلت|deployed|published|sent|executed)/i.test(text) &&
      !/(?:مسودة|اقتراح|خطة|لم يتم|لم أنفذ|requires approval|draft|not executed)/i.test(text) ? 0.5 : 1,
    grounded_when_available: knowledge.length ? (
      /(?:المصدر|السياق|البيانات|المعرفة|وفق|بحسب|K\d|context|evidence|source)/i.test(text) ? 1 : 0.75
    ) : 1,
    relevant: user && text ? 1 : 0.5
  };
  const weighted = (
    dimensions.non_empty * 0.25 +
    dimensions.useful_detail * 0.25 +
    dimensions.no_fake_execution_claim * 0.2 +
    dimensions.grounded_when_available * 0.15 +
    dimensions.relevant * 0.15
  );
  const score = Math.round(weighted * 100);
  const failures = Object.entries(dimensions).filter(([, value]) => value < 0.75).map(([key]) => key);
  return {
    rubric: 'tiqnora-agent-eval/v1',
    agent_slug: agentSlug || null,
    score,
    pass: score >= 75 && dimensions.non_empty === 1 && failures.length === 0,
    retryable: dimensions.non_empty === 1 && failures.length > 0,
    dimensions,
    failures
  };
}

export function buildLearningEvent(evaluation = {}, context = {}) {
  if (evaluation.pass) return null;
  const failures = evaluation.failures || [];
  return {
    kind: 'eval_feedback',
    status: 'proposed',
    agent_slug: evaluation.agent_slug || context.agent_slug || null,
    lesson_key: failures.length ? failures.join('+') : 'low_quality',
    lesson: `Improve future responses for: ${failures.join(', ') || 'overall response quality'}. Re-check evidence, specificity, and claims before finalizing.`,
    source_score: evaluation.score ?? null,
    auto_apply: false,
    requires_human_approval: true
  };
}

export function buildHarnessMeta({ agent, message, knowledge = [], attempt = 1 } = {}) {
  return {
    protocol: 'tiqnora-harness/v1',
    attempt,
    max_attempts: RUNTIME_LIMITS.max_harness_attempts,
    agent_card: buildAgentCard(agent),
    skills: getSkillsForAgent(agent?.slug).map(skill => skill.id),
    allowed_tools: allowedMcpTools(agent?.slug),
    rag_chunks: knowledge.map(chunk => chunk.id),
    external_actions_require_approval: true,
    request_fingerprint: stableId([agent?.slug, message])
  };
}

export async function runAgentHarness({ agent, message, knowledge = [], invoke } = {}) {
  if (typeof invoke !== 'function') throw new TypeError('runAgentHarness requires invoke()');
  let attempt = 0;
  let lastResult = null;
  let evaluation = null;
  while (attempt < RUNTIME_LIMITS.max_harness_attempts) {
    attempt += 1;
    lastResult = await invoke({
      attempt,
      feedback: evaluation?.failures || [],
      harness: buildHarnessMeta({ agent, message, knowledge, attempt })
    });
    evaluation = evaluateAgentResponse({
      agentSlug: agent?.slug,
      message,
      response: lastResult?.text,
      knowledge
    });
    if (evaluation.pass || !evaluation.retryable) break;
  }
  return {
    result: lastResult,
    evaluation,
    learning_event: buildLearningEvent(evaluation, { agent_slug: agent?.slug }),
    harness: buildHarnessMeta({ agent, message, knowledge, attempt })
  };
}

export function createA2AEnvelope({ from, to, task, message, artifact, correlationId, hop = 0 } = {}) {
  const nextHop = Number(hop || 0);
  if (nextHop >= RUNTIME_LIMITS.max_a2a_hops) {
    throw Object.assign(new Error('A2A hop limit exceeded'), { code: 'a2a_hop_limit' });
  }
  return {
    protocol: 'tiqnora-a2a/v1',
    id: stableId([from, to, task, message, correlationId, nextHop]),
    correlation_id: correlationId || stableId([from, task, message]),
    from: String(from || 'manager'),
    to: String(to || ''),
    type: artifact ? 'artifact' : task ? 'task' : 'message',
    task: task || null,
    message: message || null,
    artifact: artifact || null,
    hop: nextHop + 1,
    status: 'queued',
    requires_approval: false,
    created_at: new Date().toISOString()
  };
}

function agentIntentScore(slug, text) {
  const value = String(text || '').toLowerCase();
  const rules = {
    sales: /(بيع|مبيعات|عميل|عملاء|lead|عرض سعر|متابعة|واتساب)/i,
    marketing: /(تسويق|حملة|growth|استراتيجية|جمهور|عرض)/i,
    ads: /(اعلان|إعلان|ads|meta|tiktok ads|google ads|ميزانية)/i,
    channel: /(قناة|منصة|channel|linkedin|facebook|instagram|tiktok)/i,
    content: /(محتوى|كتابة|seo|مقال|landing|نسخة)/i,
    'social-media': /(سوشيال|social|منشور|تعليق|ريلز|reels)/i,
    'image-designer': /(صورة|تصميم|بوستر|visual|image|banner)/i,
    'video-designer': /(فيديو|video|ugc|مونتاج|reel)/i,
    developer: /(كود|برمجة|خطأ|bug|api|github|vercel|supabase|deploy|موقع)/i,
    commerce: /(منتج|متجر|مورد|سعر|شحن|stock|supplier|commerce)/i,
    assistant: /(مساعدة|تنظيم|ملخص|assistant)/i
  };
  const rule = rules[slug];
  if (!rule) return 0;
  return rule.test(value) ? 1 : 0;
}

export function planMultiAgentDelegation(message, agents = []) {
  const candidates = (agents || [])
    .map(agent => ({
      agent,
      slug: String(agent.slug || agent.key || '').toLowerCase(),
      score: agentIntentScore(String(agent.slug || agent.key || '').toLowerCase(), message)
    }))
    .filter(item => item.slug && item.score > 0 && item.slug !== 'manager')
    .slice(0, RUNTIME_LIMITS.max_multi_agents);

  if (!candidates.length) {
    const fallback = agents.find(agent => ['assistant', 'manager'].includes(String(agent.slug || '').toLowerCase()));
    if (fallback) candidates.push({ agent: fallback, slug: fallback.slug, score: 0.5 });
  }

  return {
    protocol: 'tiqnora-multi-agent/v1',
    objective: String(message || '').slice(0, 2000),
    strategy: candidates.length > 1 ? 'specialists_then_manager_synthesis' : 'single_specialist',
    participants: candidates.map(item => buildAgentCard(item.agent)),
    tasks: candidates.map((item, index) => ({
      order: index + 1,
      agent_slug: item.slug,
      task: `Analyze the request from the ${item.slug} specialty and return a concrete artifact or recommendation.`,
      acceptance: ['specific', 'evidence-aware', 'actionable', 'within-approval-policy']
    })),
    manager_synthesis_required: candidates.length > 1,
    external_actions_require_approval: true
  };
}

export function orchestrationContext({ agent, message, agents = [], state, memory, tasks, recent, knowledge = [] } = {}) {
  const snapshot = buildStateSnapshot({ agent, state, memory, tasks, recent });
  const delegation = String(agent?.slug || '').toLowerCase() === 'manager'
    ? planMultiAgentDelegation(message, agents)
    : null;
  return {
    state: snapshot,
    skills_prompt: buildSkillsPrompt(agent?.slug),
    rag_prompt: formatRagContext(knowledge),
    tools: allowedMcpTools(agent?.slug),
    delegation,
    agent_card: buildAgentCard(agent)
  };
}

export default {
  AGENT_CONCEPTS,
  RUNTIME_LIMITS,
  getSkillsForAgent,
  buildSkillsPrompt,
  allowedMcpTools,
  buildAgentCard,
  buildStateSnapshot,
  formatStateContext,
  retrieveRagCandidates,
  formatRagContext,
  evaluateAgentResponse,
  buildLearningEvent,
  buildHarnessMeta,
  runAgentHarness,
  createA2AEnvelope,
  planMultiAgentDelegation,
  orchestrationContext
};
