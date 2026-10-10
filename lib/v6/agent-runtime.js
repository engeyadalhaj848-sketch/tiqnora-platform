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
  lead_qualification: {
    id: 'lead_qualification',
    title: 'Sector-aware lead research',
    instruction: 'For each industry, verify actual company activity and buying signals from available sources; compare the sector-specific buying process, decision makers and evidence gaps. Never fabricate prospects or contact details.'
  },
  proposal_scoping: {
    id: 'proposal_scoping',
    title: 'Sector-specific proposals',
    instruction: 'Scope deliverables, integrations, content, timelines, dependencies, acceptance tests and exclusions for the actual sector. Distinguish a clinic privacy workflow from restaurant ordering, property listings, contracting tenders and e-commerce checkout. Do not invent prices.'
  },
  sector_uiux: {
    id: 'sector_uiux',
    title: 'Cross-sector UI/UX and brand direction',
    instruction: 'Before proposing a website, distinguish restaurants (menus/reservations), clinics (trust/privacy/appointments), real estate (listings/filters/leads), contracting (portfolio/tenders), stores (catalog/checkout), hotels (availability/booking), education (courses/enrollment), services (lead qualification), and technology (product demos/onboarding). Inspect actual reference patterns when tools provide them; cite evidence or say references are unavailable. Preserve Tiqnora brand identity; never copy competitor assets or layouts.'
  },
  local_seo_intent: {
    id: 'local_seo_intent',
    title: 'Local SEO and search intent',
    instruction: 'Separate transactional, navigational and informational intent by Saudi city and industry. Evaluate local landing pages, GBP, structured data, internal links, service areas and evidence-backed keyword opportunities; never invent rankings or volumes.'
  },
  reputation_care: {
    id: 'reputation_care',
    title: 'Industry-aware reputation response',
    instruction: 'Adapt review triage to sector risk: patient privacy in clinics, food safety in restaurants, service-level commitments in hotels, project disputes in contracting and delivery issues in retail. Draft empathetic evidence-aware responses without exposing private data or claiming resolution.'
  },
  workflow_operations: {
    id: 'workflow_operations',
    title: 'Sector-aware operations workflows',
    instruction: 'Map triggers, approvals, handoffs, exception paths, observability and rollback for the specific sector; distinguish reservations, patient scheduling, property inquiries, project procurement and fulfillment workflows. No external action without authorization.'
  },
  grounded_research: {
    id: 'grounded_research',
    title: 'Grounded research',
    instruction: 'Use retrieved evidence when available, distinguish facts from assumptions, cite the supplied source labels internally, and never invent missing evidence.'
  }
});

const AGENT_SKILLS = Object.freeze({
  manager: ['executive_routing', 'grounded_research'],
  lead_research: ['lead_qualification', 'grounded_research'],
  sales: ['sales_discovery', 'lead_qualification', 'grounded_research'],
  proposal: ['proposal_scoping', 'sales_discovery', 'grounded_research'],
  marketing: ['growth_strategy', 'content_strategy', 'grounded_research'],
  content: ['content_strategy', 'grounded_research'],
  design: ['sector_uiux', 'visual_direction', 'grounded_research'],
  'video-designer': ['video_direction', 'content_strategy', 'grounded_research'],
  'social-media': ['social_growth', 'content_strategy', 'grounded_research'],
  seo: ['local_seo_intent', 'content_strategy', 'grounded_research'],
  reputation: ['reputation_care', 'customer_ops', 'grounded_research'],
  customer_success: ['customer_ops', 'grounded_research'],
  operations: ['workflow_operations', 'executive_routing', 'grounded_research'],
  assistant: ['customer_ops', 'grounded_research'],
  'voice-agent': ['customer_ops', 'sales_discovery', 'grounded_research'],
  ads: ['performance_ads', 'growth_strategy', 'grounded_research'],
  channel: ['growth_strategy', 'grounded_research'],
  'image-designer': ['visual_direction', 'content_strategy', 'grounded_research'],
  developer: ['software_engineering', 'grounded_research'],
  commerce: ['commerce_ops', 'grounded_research']
});

const MCP_POLICY = Object.freeze({
  manager: ['workflow.read', 'workflow.delegate', 'memory.read', 'knowledge.search', 'eval.read'],
  lead_research: ['memory.read', 'knowledge.search', 'crm.read'],
  sales: ['memory.read', 'knowledge.search', 'crm.read', 'crm.draft'],
  proposal: ['memory.read', 'knowledge.search', 'crm.read', 'crm.draft'],
  marketing: ['memory.read', 'knowledge.search', 'analytics.read', 'social.draft'],
  content: ['memory.read', 'knowledge.search', 'social.draft'],
  design: ['memory.read', 'knowledge.search', 'media.read', 'media.generate_image'],
  'video-designer': ['memory.read', 'knowledge.search', 'media.read', 'media.generate_video'],
  'social-media': ['memory.read', 'knowledge.search', 'social.read', 'social.draft'],
  seo: ['memory.read', 'knowledge.search', 'analytics.read'],
  reputation: ['memory.read', 'knowledge.search', 'social.read', 'social.draft'],
  customer_success: ['memory.read', 'knowledge.search', 'crm.read', 'crm.draft'],
  operations: ['memory.read', 'knowledge.search', 'workflow.read', 'eval.read'],
  assistant: ['memory.read', 'knowledge.search'],
  'voice-agent': ['memory.read', 'knowledge.search', 'crm.read'],
  ads: ['memory.read', 'knowledge.search', 'analytics.read', 'ads.read', 'ads.draft'],
  channel: ['memory.read', 'knowledge.search', 'analytics.read'],
  'image-designer': ['memory.read', 'knowledge.search', 'media.generate_image', 'media.read'],
  developer: ['memory.read', 'knowledge.search', 'github.read', 'vercel.read', 'supabase.read'],
  commerce: ['memory.read', 'knowledge.search', 'commerce.read', 'commerce.draft']
});

const AGENT_ALIASES = Object.freeze({
  manager_agent: 'manager',
  lead_research_agent: 'lead_research',
  sales_agent: 'sales',
  proposal_agent: 'proposal',
  marketing_agent: 'marketing',
  content_agent: 'content',
  design_agent: 'design',
  video_agent: 'video-designer',
  social_agent: 'social-media',
  seo_agent: 'seo',
  reputation_agent: 'reputation',
  customer_success_agent: 'customer_success',
  operations_agent: 'operations'
});

function canonicalAgentSlug(agentSlug) {
  const slug = String(agentSlug || '').trim().toLowerCase();
  return AGENT_ALIASES[slug] || slug;
}

const CROSS_SECTOR_QUALITY_STANDARD = [
  'Tiqnora expert operating standard: reason as a seasoned cross-sector specialist, not a generic assistant.',
  'Identify the actual industry, buyer/user, local market, business model, constraints, risks and success metric before deciding.',
  'Compare sector-specific workflows and relevant real examples or references from available knowledge/tools; distinguish verified examples from illustrative assumptions and never invent sources.',
  'For UI/UX, compare sector patterns and brand expectations; keep original Tiqnora identity and never copy competitor design or imagery.',
  'Deliver a tailored recommendation, rationale, trade-offs, measurable acceptance criteria and an actionable next step.',
  'Self-review before final delivery: sector fit, factual grounding, tool availability, safety, brand fit and no false claims of execution.',
  'All external sends, publishing, purchases, price changes and irreversible actions remain approval-gated.'
].join('\\n');

function normalizeWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
    .split(/\s+/)
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
  const ids = AGENT_SKILLS[canonicalAgentSlug(agentSlug)] || ['grounded_research'];
  return ids.map(id => SKILLS[id]).filter(Boolean);
}

export function listRuntimeSkills() {
  return Object.values(SKILLS).map((skill) => ({
    id: skill.id,
    title: skill.title,
    instruction: skill.instruction
  }));
}

export function listAgentSkillBindings() {
  return [...Object.keys(AGENT_SKILLS), ...Object.keys(AGENT_ALIASES)].map((agent_slug) => ({
    agent_slug,
    skill_ids: getSkillsForAgent(agent_slug).map(skill => skill.id),
    tools: allowedMcpTools(agent_slug)
  }));
}


export function buildSkillsPrompt(agentSlug) {
  const skills = getSkillsForAgent(agentSlug);
  return [
    'Loaded specialist skills:',
    ...skills.map(skill => `- ${skill.title}: ${skill.instruction}`),
    CROSS_SECTOR_QUALITY_STANDARD
  ].join('\n');
}

export function allowedMcpTools(agentSlug) {
  return [...(MCP_POLICY[canonicalAgentSlug(agentSlug)] || ['memory.read', 'knowledge.search'])];
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

export function formatApprovedLearning(lessons = []) {
  const approved = (lessons || [])
    .filter((row) => row && row.status === 'approved' && String(row.lesson || '').trim())
    .slice(0, 8);

  if (!approved.length) {
    return 'No approved learning lessons are available for this agent yet.';
  }

  return [
    'Approved learning from previous evaluated work:',
    'Apply these lessons when relevant. They are operational guidance only and never override global safety rules, evidence requirements, allowed tool scopes, or human approval gates.',
    ...approved.map((row, index) => {
      const key = row.lesson_key || row.id || `lesson_${index + 1}`;
      const lesson = String(row.lesson || '').replace(/\s+/g, ' ').trim().slice(0, 900);
      return `- [${key}] ${lesson}`;
    })
  ].join('\n');
}

export function buildExecutionContract({
  agent,
  message,
  state = {},
  memory = [],
  tasks = [],
  knowledge = [],
  approvedLessons = []
} = {}) {
  const objective = String(message || '').trim().slice(0, 2400);
  const approvedCount = (approvedLessons || []).filter((row) => row?.status === 'approved').length;
  return {
    protocol: 'tiqnora-intent/v1',
    agent_slug: agent?.slug || agent?.key || null,
    objective: objective || 'No explicit objective provided.',
    current_goal: state?.current_goal || null,
    context_available: {
      memory_items: Array.isArray(memory) ? memory.length : 0,
      open_tasks: Array.isArray(tasks) ? tasks.length : 0,
      knowledge_chunks: Array.isArray(knowledge) ? knowledge.length : 0,
      approved_lessons: approvedCount
    },
    definition_of_done: [
      'Directly satisfy the stated objective and requested deliverable.',
      'Use available Tiqnora context and current evidence for claims that depend on business facts.',
      'Never claim an external action or completed execution without tool/runtime evidence.',
      'Stay inside allowed tool scopes and stop at human approval gates for external or irreversible actions.',
      'If material information is missing, ask only the minimum blocking question; otherwise proceed with bounded assumptions stated clearly.'
    ],
    ambiguity_policy: 'Resolve intent from available context first. Do not invent missing requirements. Ask only when the missing detail materially changes correctness, safety, or the requested deliverable.',
    external_actions_require_approval: true
  };
}

export function formatExecutionContract(contract = {}) {
  const context = contract.context_available || {};
  return [
    'Execution contract — resolve intent and definition of done before acting:',
    `- objective: ${contract.objective || 'unspecified'}`,
    `- current_goal: ${contract.current_goal || 'none'}`,
    `- available_context: memory=${Number(context.memory_items || 0)}, tasks=${Number(context.open_tasks || 0)}, knowledge=${Number(context.knowledge_chunks || 0)}, approved_lessons=${Number(context.approved_lessons || 0)}`,
    '- definition_of_done:',
    ...(contract.definition_of_done || []).map((criterion, index) => `  ${index + 1}. ${criterion}`),
    `- ambiguity_policy: ${contract.ambiguity_policy || 'Use bounded assumptions and ask only when materially blocked.'}`
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

export function buildHarnessMeta({ agent, message, knowledge = [], executionContract = null, attempt = 1 } = {}) {
  return {
    protocol: 'tiqnora-harness/v1',
    attempt,
    max_attempts: RUNTIME_LIMITS.max_harness_attempts,
    agent_card: buildAgentCard(agent),
    skills: getSkillsForAgent(agent?.slug).map(skill => skill.id),
    allowed_tools: allowedMcpTools(agent?.slug),
    rag_chunks: knowledge.map(chunk => chunk.id),
    execution_contract: executionContract || null,
    external_actions_require_approval: true,
    request_fingerprint: stableId([agent?.slug, message])
  };
}

export async function runAgentHarness({ agent, message, knowledge = [], executionContract = null, invoke } = {}) {
  if (typeof invoke !== 'function') throw new TypeError('runAgentHarness requires invoke()');
  let attempt = 0;
  let lastResult = null;
  let evaluation = null;
  while (attempt < RUNTIME_LIMITS.max_harness_attempts) {
    attempt += 1;
    lastResult = await invoke({
      attempt,
      feedback: evaluation?.failures || [],
      harness: buildHarnessMeta({ agent, message, knowledge, executionContract, attempt })
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
    harness: buildHarnessMeta({ agent, message, knowledge, executionContract, attempt })
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
    sales: /(بيع|مبيعات|عميل|عملاء|lead|crm|pipeline|icp|qualification|تأهيل|outreach|playbook|discovery|sql|عرض سعر|متابعة|follow-?up|واتساب)/i,
    marketing: /(تسويق|marketing|حملة|campaign|growth|استراتيجية|جمهور|تموضع|positioning|شريحة|segment|عرض)/i,
    ads: /(اعلان|إعلان|ads|meta|tiktok ads|google ads|ميزانية)/i,
    channel: /(قناة|منصة|channel|linkedin|facebook|instagram|tiktok)/i,
    content: /(محتوى|content|كتابة|صياغ|رسالة|رسائل|قالب|قوالب|copy|seo|مقال|landing|نسخة)/i,
    'social-media': /(سوشيال|social|منشور|تعليق|ريلز|reels)/i,
    'image-designer': /(صورة|صور|تصميم|مصمم الصور|بوستر|visual|image|banner)/i,
    'video-designer': /(فيديو|مصمم الفيديو|video|ugc|مونتاج|reel)/i,
    developer: /(كود|برمجة|خطأ|bug|api|github|vercel|supabase|deploy|موقع)/i,
    commerce: /(منتج|متجر|مورد|سعر|شحن|stock|supplier|commerce)/i,
    assistant: /(مساعدة|تنظيم|ملخص|خلاصة|assistant)/i
  };
  const rule = rules[slug];
  if (!rule) return 0;
  return rule.test(value) ? 1 : 0;
}

function routingContextText({ state = {}, recent = [] } = {}) {
  const recentText = (Array.isArray(recent) ? recent : [])
    .slice(0, 4)
    .flatMap((row) => [row?.message, row?.response])
    .filter(Boolean)
    .join('\n')
    .slice(0, 8000);
  return [
    String(state?.current_goal || ''),
    recentText
  ].filter(Boolean).join('\n');
}

export function planMultiAgentDelegation(message, agents = [], context = {}) {
  const directText = String(message || '');
  const contextualText = routingContextText(context);

  let candidates = (agents || [])
    .map(agent => {
      const slug = String(agent.slug || agent.key || '').toLowerCase();
      const direct = agentIntentScore(slug, directText);
      const contextual = agentIntentScore(slug, contextualText);
      return {
        agent,
        slug,
        direct,
        contextual,
        score: (direct * 3) + contextual
      };
    })
    .filter(item => item.slug && item.score > 0 && item.slug !== 'manager')
    .sort((a, b) => b.score - a.score);

  const hasSpecialist = candidates.some(item => item.slug !== 'assistant');
  if (hasSpecialist) {
    candidates = candidates.filter(item => item.slug !== 'assistant');
  }

  candidates = candidates.slice(0, RUNTIME_LIMITS.max_multi_agents);

  if (!candidates.length) {
    const fallback = agents.find(agent => String(agent.slug || '').toLowerCase() === 'assistant')
      || agents.find(agent => String(agent.slug || '').toLowerCase() === 'manager');
    if (fallback) {
      candidates.push({
        agent: fallback,
        slug: String(fallback.slug || fallback.key || '').toLowerCase(),
        direct: 0,
        contextual: 0,
        score: 0.5
      });
    }
  }

  return {
    protocol: 'tiqnora-multi-agent/v1',
    objective: directText.slice(0, 2000),
    strategy: candidates.length > 1 ? 'specialists_then_manager_synthesis' : 'single_specialist',
    routing_context_used: Boolean(contextualText),
    routing: candidates.map(item => ({
      agent_slug: item.slug,
      direct_match: Boolean(item.direct),
      contextual_match: Boolean(item.contextual),
      score: item.score
    })),
    participants: candidates.map(item => buildAgentCard(item.agent)),
    tasks: candidates.map((item, index) => ({
      order: index + 1,
      agent_slug: item.slug,
      task: `Own the ${item.slug} workstream for this objective: ${directText.slice(0, 1200)}. Resolve references such as "previous", "these", or "the three problems" from the supplied runtime context. Return a concrete artifact or recommendation from your specialty only.`,
      acceptance: ['specific', 'evidence-aware', 'actionable', 'within-approval-policy']
    })),
    manager_synthesis_required: candidates.length > 1,
    external_actions_require_approval: true
  };
}

export function orchestrationContext({ agent, message, agents = [], state, memory, tasks, recent, knowledge = [], approvedLessons = [] } = {}) {
  const snapshot = buildStateSnapshot({ agent, state, memory, tasks, recent });
  const executionContract = buildExecutionContract({
    agent,
    message,
    state: snapshot,
    memory,
    tasks,
    knowledge,
    approvedLessons
  });
  const delegation = String(agent?.slug || '').toLowerCase() === 'manager'
    ? planMultiAgentDelegation(message, agents, { state, recent })
    : null;
  return {
    state: snapshot,
    execution_contract: executionContract,
    intent_prompt: formatExecutionContract(executionContract),
    skills_prompt: buildSkillsPrompt(agent?.slug),
    rag_prompt: formatRagContext(knowledge),
    learning_prompt: formatApprovedLearning(approvedLessons),
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
  formatApprovedLearning,
  buildExecutionContract,
  formatExecutionContract,
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
