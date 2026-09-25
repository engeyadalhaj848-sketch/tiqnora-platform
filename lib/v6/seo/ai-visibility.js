/**
 * GEO / AI Visibility — deterministic readiness checks (no fake percentage scores).
 */

import { CANONICAL_BRAND, brandSpellingIssues } from './core.js';

/**
 * Evaluate answer / citation readiness with explicit checks — not a magic score.
 */
export function evaluateAiVisibility(page = {}) {
  const text = [
    page.title,
    page.description,
    page.h1,
    page.body_excerpt,
    ...(page.headings || [])
  ]
    .filter(Boolean)
    .join('\n');

  const checks = [];
  const pass = (id, ok, detail) => checks.push({ id, ok: !!ok, detail });

  pass('clear_brand_name', /Tiqnora AI|تيقنورا/i.test(text), 'Brand name present on page signals');
  pass('no_forbidden_spelling', brandSpellingIssues(text).length === 0, 'No Teknora/Technora variants');
  pass('has_title', Boolean(page.title), 'Title present');
  pass('has_description', Boolean(page.description), 'Meta description present');
  pass('has_h1', Boolean(page.h1), 'H1 present');
  pass('has_canonical', Boolean(page.canonical), 'Canonical present');
  pass(
    'location_clarity',
    !page.expects_local || /المدينة المنورة|Madinah|السعودية|Saudi/i.test(text),
    'Local/market context when expected'
  );
  pass(
    'direct_definition',
    /منصة|شركة|نقدم|نبني|AI|ذكاء/i.test(text),
    'Some definitional language'
  );
  pass(
    'structured_headings',
    Array.isArray(page.headings) ? page.headings.length >= 2 : Boolean(page.h1),
    'Heading structure signal'
  );
  pass(
    'organization_schema',
    Array.isArray(page.schemas) &&
      page.schemas.some((s) => s['@type'] === 'Organization' || s['@type']?.includes?.('Organization')),
    'Organization schema when provided'
  );

  const passed = checks.filter((c) => c.ok).length;
  const warnings = checks.filter((c) => !c.ok).map((c) => c.id);

  return {
    page_path: page.path || null,
    checks,
    checks_passed: passed,
    checks_total: checks.length,
    warnings,
    // Explicitly not a ranking guarantee
    disclaimer: 'Readiness checks only — does not guarantee AI/search citations'
  };
}

export function evaluateLlmsTxt(content = '') {
  const text = String(content || '');
  const issues = [];
  if (!text.trim()) issues.push('missing_llms_txt');
  if (/Teknora|Technora|Tegnora/i.test(text)) issues.push('forbidden_brand_spelling');
  if (/\bSAR\s*\d|\b\d+\s*ريال|سعر\s*ثابت/i.test(text)) issues.push('possible_stale_pricing_claim');
  if (!/Tiqnora AI/i.test(text) && text.trim()) issues.push('missing_canonical_brand_name');
  return {
    ok: issues.length === 0,
    issues,
    recommendation: issues.length
      ? 'Align llms.txt with Brand Brain approved facts only'
      : 'llms.txt looks consistent on basic checks'
  };
}

export function entityClarityReport(entity = CANONICAL_BRAND) {
  return {
    canonical_name: entity.name,
    aliases: [entity.short_name, entity.arabic_name].filter(Boolean),
    website: entity.domain,
    market: entity.market,
    city: entity.city,
    disambiguation_notes: [
      'Prefer "Tiqnora AI" in titles and Organization.name',
      'Do not use Teknora/Technora/Tegnora in public metadata',
      'Keep sameAs limited to verified official profiles'
    ],
    forbidden_spellings: ['Teknora', 'Technora', 'Tegnora']
  };
}

export default {
  evaluateAiVisibility,
  evaluateLlmsTxt,
  entityClarityReport
};
