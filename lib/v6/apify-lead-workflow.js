/**
 * Apify → Google Maps Leads → Tiqnora CRM (preview / gated import)
 * Allowed: search, normalize, dedupe, score, CRM payload preview
 * Forbidden: auto outreach, social DM, email blast, publish, ads
 */

import {
  isApifyConfigured,
  runGoogleMapsLeadCollection,
  clampMaxResults,
  DEFAULT_MAX_RESULTS
} from '../integrations/apify.js';
import {
  normalizeBusinessRecord,
  findDuplicateMatch,
  analyzeResearchCandidate,
  buildCrmLeadPayload,
  createResearchJobSpec
} from './lead-research.js';

export async function runApifyGoogleMapsLeadWorkflow(input = {}, options = {}) {
  const job = createResearchJobSpec({
    query: input.keyword || input.query || '',
    city: input.city,
    industry: input.industry || input.keyword,
    target_count: clampMaxResults(input.maxResults ?? input.limit ?? DEFAULT_MAX_RESULTS),
    source: 'apify_maps',
    filters: {
      actor_id: input.actorId || options.actorId || null,
      ...(input.filters || {})
    }
  });

  if (!isApifyConfigured() && !options.mockCollection) {
    return {
      ok: false,
      status: 'not_configured',
      message: 'APIFY_TOKEN is not configured',
      job,
      candidates: [],
      requires_approval: true,
      auto_outreach: false
    };
  }

  let collection;
  if (options.mockCollection) {
    collection = options.mockCollection;
  } else {
    collection = await runGoogleMapsLeadCollection(
      {
        keyword: job.query || job.industry,
        city: job.city,
        maxResults: job.target_count,
        language: input.language || 'ar'
      },
      {
        actorId: job.filters?.actor_id || options.actorId,
        fetchImpl: options.fetchImpl
      }
    );
  }

  if (!collection.ok && !options.acceptPartial) {
    return {
      ok: false,
      status: collection.status || 'failed',
      message: collection.message || 'Apify collection failed',
      run_id: collection.run_id,
      actor_id: collection.actor_id,
      job,
      candidates: [],
      requires_approval: true,
      auto_outreach: false
    };
  }

  const existing = options.existingLeads || options.existingCandidates || [];
  const candidates = [];
  let duplicates = 0;
  let qualified = 0;

  for (const raw of collection.items || []) {
    const record = normalizeBusinessRecord(
      {
        ...raw,
        source: 'apify',
        provider: 'apify_maps',
        source_actor: collection.actor_id,
        source_run_id: collection.run_id
      },
      { city: job.city, industry: job.industry, source: 'apify' }
    );
    if (!record.business_name && !record.phone && !record.website) continue;

    const dup = findDuplicateMatch(record, [...existing, ...candidates.map((c) => c.record)]);
    if (dup.matched) {
      duplicates += 1;
      candidates.push({
        status: 'duplicate',
        match_on: dup.match_on,
        record,
        opportunity_score: null,
        grade: null,
        requires_approval: true,
        auto_send: false
      });
      continue;
    }

    const analysis = await analyzeResearchCandidate(record, options);
    const status = analysis.opportunity_score >= 45 ? 'qualified' : 'enriched';
    if (status === 'qualified') qualified += 1;

    const crmBase = buildCrmLeadPayload(analysis, job);
    candidates.push({
      status,
      record: analysis.record,
      opportunity_score: analysis.opportunity_score,
      grade: analysis.grade,
      reasons: analysis.reasons,
      missing_data: analysis.missing_data,
      recommended_services: analysis.recommended_services,
      next_best_action: analysis.next_best_action,
      vertical: analysis.vertical,
      crm_payload: {
        ...crmBase,
        tags: ['research', 'apify', 'apify_maps'],
        custom_fields: {
          ...(crmBase.custom_fields || {}),
          research_source: 'apify',
          source_actor: collection.actor_id,
          source_run_id: collection.run_id,
          requires_approval: true
        }
      },
      requires_approval: true,
      auto_send: false
    });
  }

  job.status = 'completed';
  job.discovered_count = candidates.length;
  job.qualified_count = qualified;
  job.completed_at = new Date().toISOString();

  return {
    ok: true,
    status: 'completed',
    job,
    run_id: collection.run_id,
    actor_id: collection.actor_id,
    dataset_id: collection.dataset_id,
    items_collected: collection.items_count ?? (collection.items || []).length,
    candidates,
    duplicate_count: duplicates,
    qualified_count: qualified,
    usage: collection.usage || null,
    requires_approval: true,
    auto_outreach: false,
    gates: {
      crm_write: options.commitCandidates === true ? 'allowed_if_admin' : 'preview_only',
      outreach: 'blocked',
      social_publish: 'blocked',
      ads: 'blocked'
    }
  };
}

export default { runApifyGoogleMapsLeadWorkflow };
