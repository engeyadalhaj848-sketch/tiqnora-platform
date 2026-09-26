/**
 * Apify integration unit tests (offline — no live token required).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isApifyConfigured,
  clampMaxResults,
  classifyApifyError,
  normalizeApifyPlaceItem,
  buildGoogleMapsInput,
  testConnection,
  DEFAULT_MAX_RESULTS,
  HARD_CAP_RESULTS
} from '../lib/integrations/apify.js';

import { runApifyGoogleMapsLeadWorkflow } from '../lib/v6/apify-lead-workflow.js';
import { findDuplicateMatch, normalizeBusinessRecord } from '../lib/v6/lead-research.js';
import { listProviders, getProvider } from '../lib/v6/research/provider-registry.js';

describe('Apify cost safeguards', () => {
  it('default max results is 10 and hard cap 50', () => {
    assert.equal(DEFAULT_MAX_RESULTS, 10);
    assert.equal(HARD_CAP_RESULTS, 50);
  });

  it('clampMaxResults enforces hard cap', () => {
    assert.equal(clampMaxResults(1000), 50);
    assert.equal(clampMaxResults(3), 3);
    assert.equal(clampMaxResults(null), 10);
    assert.equal(clampMaxResults(0), 10);
  });
});

describe('Apify missing token', () => {
  it('isApifyConfigured is false without env', () => {
    const prev = process.env.APIFY_TOKEN;
    delete process.env.APIFY_TOKEN;
    assert.equal(isApifyConfigured(), false);
    if (prev) process.env.APIFY_TOKEN = prev;
  });

  it('testConnection returns not_configured', async () => {
    const prev = process.env.APIFY_TOKEN;
    delete process.env.APIFY_TOKEN;
    const r = await testConnection();
    assert.equal(r.ok, false);
    assert.equal(r.status, 'not_configured');
    assert.equal(r.provider, 'apify');
    assert.equal(r.mcp_status, 'available_not_enabled');
    if (prev) process.env.APIFY_TOKEN = prev;
  });
});

describe('Apify error classification', () => {
  it('classifies auth, rate limit, timeout', () => {
    assert.equal(classifyApifyError({}, 401).code, 'auth_error');
    assert.equal(classifyApifyError({ message: 'rate limit' }, 429).code, 'rate_limited');
    assert.equal(classifyApifyError({ name: 'AbortError' }).code, 'timeout');
  });
});

describe('Apify normalize place item', () => {
  it('maps compass-style fields', () => {
    const raw = {
      title: 'مطعم البيت',
      address: 'المدينة المنورة',
      phone: '+966148211004',
      website: 'https://example.sa',
      totalScore: 4.5,
      reviewsCount: 88,
      placeId: 'ChIJ_test_place',
      url: 'https://maps.google.com/?cid=1',
      categoryName: 'Restaurant',
      city: 'المدينة المنورة'
    };
    const n = normalizeApifyPlaceItem(raw, { actor_id: 'compass/crawler-google-places', run_id: 'run123' });
    assert.equal(n.business_name, 'مطعم البيت');
    assert.equal(n.phone, '+966148211004');
    assert.equal(n.source, 'apify');
    assert.equal(n.place_id, 'ChIJ_test_place');
    assert.equal(n.source_actor, 'compass/crawler-google-places');
    assert.equal(n.source_run_id, 'run123');
    assert.equal(n.rating, 4.5);
    assert.equal(n.reviews_count, 88);
  });
});

describe('buildGoogleMapsInput', () => {
  it('builds search string and clamps max', () => {
    const input = buildGoogleMapsInput({
      keyword: 'مطاعم',
      city: 'المدينة المنورة',
      maxResults: 999
    });
    assert.ok(Array.isArray(input.searchStringsArray));
    assert.ok(input.searchStringsArray[0].includes('مطاعم'));
    assert.equal(input.maxCrawledPlacesPerSearch, 50);
  });
});

describe('CRM dedupe with apify records', () => {
  it('matches on place_id and phone', () => {
    const existing = [
      normalizeBusinessRecord({
        business_name: 'Old',
        phone: '0148211004',
        place_id: 'ChIJ_test_place',
        source: 'manual'
      })
    ];
    const incoming = normalizeBusinessRecord({
      business_name: 'مطعم البيت',
      phone: '0148211004',
      place_id: 'ChIJ_test_place',
      source: 'apify'
    });
    const d1 = findDuplicateMatch(incoming, existing);
    assert.equal(d1.matched, true);
    assert.ok(['place_id', 'phone'].includes(d1.match_on));
  });
});

describe('Provider registry', () => {
  it('registers apify_maps and apify alias', () => {
    const list = listProviders();
    assert.ok(list.includes('apify_maps'));
    assert.ok(list.includes('apify'));
    assert.ok(getProvider('apify_maps'));
    assert.equal(typeof getProvider('apify_maps').discover, 'function');
  });
});

describe('Apify Maps lead workflow (mock)', () => {
  it('normalizes, scores, blocks outreach, preview only', async () => {
    const mockCollection = {
      ok: true,
      status: 'SUCCEEDED',
      run_id: 'mock-run-1',
      actor_id: 'compass/crawler-google-places',
      dataset_id: 'ds-mock',
      items: [
        {
          business_name: 'مطعم تجريبي Apify',
          phone: '0500000001',
          city: 'المدينة المنورة',
          website: null,
          rating: 4.7,
          reviews_count: 40,
          place_id: 'apify-place-test-1',
          source: 'apify',
          provider: 'apify_maps'
        },
        {
          business_name: 'مطعم مكرر',
          phone: '0500000001',
          city: 'المدينة المنورة',
          place_id: 'apify-place-test-1',
          source: 'apify'
        }
      ],
      items_count: 2
    };

    const result = await runApifyGoogleMapsLeadWorkflow(
      { keyword: 'مطاعم', city: 'المدينة المنورة', maxResults: 3 },
      { mockCollection, commitCandidates: false }
    );

    assert.equal(result.ok, true);
    assert.equal(result.auto_outreach, false);
    assert.equal(result.requires_approval, true);
    assert.equal(result.gates.outreach, 'blocked');
    assert.equal(result.gates.social_publish, 'blocked');
    assert.ok(result.duplicate_count >= 1);
    assert.ok(Array.isArray(result.candidates));
    for (const c of result.candidates) {
      assert.equal(c.requires_approval, true);
      assert.equal(c.auto_send, false);
    }
  });

  it('returns not_configured without token and without mock', async () => {
    const prev = process.env.APIFY_TOKEN;
    delete process.env.APIFY_TOKEN;
    const result = await runApifyGoogleMapsLeadWorkflow(
      { keyword: 'x', city: 'y', maxResults: 3 },
      { commitCandidates: false }
    );
    assert.equal(result.ok, false);
    assert.equal(result.status, 'not_configured');
    if (prev) process.env.APIFY_TOKEN = prev;
  });
});

describe('Admin authorization expectation (documented)', () => {
  it('API module exists and exports default handler', async () => {
    const mod = await import('../api/integrations/apify/[action].js');
    assert.equal(typeof mod.default, 'function');
  });
});
