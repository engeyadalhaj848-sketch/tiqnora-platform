/**
 * Safety boundary for established WhatsApp commercial conversations.
 *
 * A proposal/contract is NEVER inferred as an approved price from chat text.
 * These signals only move the conversation to human review. The pause is
 * persisted in conversations.metadata.sales_manager and is not time-limited.
 * Never merge facts from different customers or connected accounts.
 */
const CONTRACT_STAGES = new Set([
  'proposal_sent', 'proposal', 'negotiating', 'negotiation',
  'agreement_in_principle', 'agreed', 'contracting', 'contracted',
  'active_project', 'won', 'customer', 'awaiting_team'
]);
const ADVANCED_PIPELINE = new Set([
  'proposal', 'proposal_sent', 'negotiating', 'negotiation',
  'agreement_in_principle', 'agreed', 'contracting', 'contracted',
  'won', 'closed_won', 'active_project'
]);

function norm(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670]/g, '').replace(/\s+/g, ' ').trim();
}

export function isProtectedDealState(salesState = {}, lead = {}) {
  const state = salesState && typeof salesState === 'object' ? salesState : {};
  const fields = lead?.custom_fields?.sales_manager || {};
  if (state.automation_paused === true || fields.automation_paused === true) return true;
  if (state.automation_paused === false) return false; // explicit operator resume
  return CONTRACT_STAGES.has(norm(state.stage))
    || CONTRACT_STAGES.has(norm(fields.stage))
    || ADVANCED_PIPELINE.has(norm(lead?.pipeline_stage));
}

const CLEAR_DEAL = /(?:\b(?:proposal accepted|contract signed|deal agreed|agreed on price|approved the quote)\b|(?:تم|قد) (?:اعتماد|الموافقه على|الاتفاق على) (?:العرض|الاتفاق|العقد|التكلفه|السعر|المشروع)|(?:وافقنا|موافقتنا|موافقون) (?:المبدئيه )?(?:على|بخصوص) (?:العرض|الخطه|التكلفه|الاتفاق)|(?:اتفقنا|متفقين|متفقون) (?:على|بخصوص|ومستمرون)|(?:ابدا|نبدأ) (?:التنفيذ|العمل) (?:حسب|وفق|بناء على) (?:الاتفاق|العرض)|(?:اعتماد|توقيع) (?:العقد|الاتفاق)|(?:صرف|سداد|دفع) (?:الدفعة|الدفعة الاولى|العربون))/i;
const BUSINESS_TERMS = /(?:\b(?:proposal|quote|contract|budget|payment)\b|عرض (?:سعر|مالي|فني)|الميزانيه|التكلفه|السعر|الريال|ريال|دفعات|دفعة|العقد|الاتفاق|مدة التنفيذ|مده التنفيذ|التسليم|نطاق العمل|الشراكه)/i;
const SHORT_AGREEMENT = /^(?:تمام\s*)?(?:متفقون|متفقين|متفق|موافقون|موافقين)[\s.،!🤍👍]*$/i;

export function assessCommercialHandoff({ message = '', history = [], salesState = {}, lead = {} } = {}) {
  if (isProtectedDealState(salesState, lead)) {
    return { protect: true, reason: 'persisted_deal_stage', existing: true };
  }
  const input = norm(message);
  if (!input) return { protect: false };
  const entries = (Array.isArray(history) ? history : []).slice(-20);
  const previousCustomers = entries.filter(x => x?.role === 'customer').map(x => norm(x?.text));
  const allPrevious = entries.map(x => norm(x?.text));
  // A prior strong customer statement can protect a subsequent short follow-up,
  // even when an earlier processing attempt did not persist the status.
  if (previousCustomers.some(x => CLEAR_DEAL.test(x))) {
    return { protect: true, reason: 'customer_prior_agreement', existing: false };
  }
  if (CLEAR_DEAL.test(input) || /(?:متفقون|متفقين|متفقان).{0,22}مستمرون/.test(input)) {
    return { protect: true, reason: 'customer_agreement', existing: false };
  }
  const hasCommercialContext = allPrevious.some(x => BUSINESS_TERMS.test(x))
    || BUSINESS_TERMS.test(norm(salesState?.scope))
    || BUSINESS_TERMS.test(norm(salesState?.goal));
  if (hasCommercialContext && SHORT_AGREEMENT.test(input)) {
    return { protect: true, reason: 'affirmed_commercial_context', existing: false };
  }
  return { protect: false };
}
