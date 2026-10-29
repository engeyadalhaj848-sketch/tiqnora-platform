import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExpleePayload,
  mapExpleeCompany,
  discover as discoverExplee,
  isExpleeConfigured
} from '../lib/v6/research/providers/explee.js';
import { discover as discoverHybrid, availableHybridSources } from '../lib/v6/research/providers/hybrid.js';
import { getProvider, listProviders } from '../lib/v6/research/provider-registry.js';
import { runResearchJob } from '../lib/v6/lead-research.js';

describe('Explee + native hybrid lead discovery (offline)', () => {
  it('registers both new providers without changing native providers', () => {
    for (const id of ['google_places', 'apify_maps', 'explee', 'hybrid']) {
      assert.ok(listProviders().includes(id));
      assert.equal(typeof getProvider(id).discover, 'function');
    }
  });

  it('caps paid-provider risk with a Saudi-first 10-result page', () => {
    const p = buildExpleePayload({ query: 'real estate', city: 'Riyadh', target_count: 99 });
    assert.deepEqual(p, {
      filters: { definition: 'real estate', geo_include: ['SA'], geo_city: ['Riyadh'] },
      page: 1,
      page_size: 10
    });
  });

  it('does not invent email, phone or WhatsApp consent', () => {
    const mapped = mapExpleeCompany({ name: 'شركة تجريبية', domain: 'example.test', geo: 'SA' });
    assert.equal(mapped.email, null);
    assert.equal(mapped.phone, null);
    assert.equal(mapped.website, 'https://example.test');
    assert.equal(mapped.source, 'explee');
    assert.equal(mapped.whatsapp, undefined);
  });

  it('requires explicit credentials and feature opt-in for live Explee', async () => {
    const before = process.env.EXPLEE_LEAD_RESEARCH_ENABLED;
    try {
      process.env.EXPLEE_LEAD_RESEARCH_ENABLED = 'false';
      assert.equal(isExpleeConfigured(), false);
      await assert.rejects(discoverExplee({ query: 'shops' }), /disabled or EXPLEE_API_KEY/);
    } finally {
      if (before === undefined) delete process.env.EXPLEE_LEAD_RESEARCH_ENABLED;
      else process.env.EXPLEE_LEAD_RESEARCH_ENABLED = before;
    }
  });

  it('accepts offline fixtures without fetching or sending messages', async () => {
    const rows = await discoverExplee(
      { query: 'real estate', target_count: 3 },
      { mockCompanies: [{ name: 'Alpha', domain: 'alpha.test', phones: ['0501234567'], geo: 'SA' }] }
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].phone, '0501234567');
  });

  it('runs both sources through existing dedup, scoring and approval gates', async () => {
    const result = await runResearchJob(
      { query: 'real estate', city: 'الرياض', source: 'hybrid', target_count: 10 },
      {
        mockCompanies: [{ name: 'Alpha', domain: 'alpha.test', geo_city: 'الرياض', geo: 'SA' }],
        mockNativeRows: [
          { business_name: 'Alpha', website: 'https://www.alpha.test', city: 'الرياض', source: 'google_places' },
          { business_name: 'Beta', website: 'https://beta.test', city: 'الرياض', source: 'google_places' }
        ]
      }
    );
    assert.equal(result.summary.discovered, 3);
    assert.equal(result.summary.duplicates, 1);
    assert.equal(result.summary.auto_outreach, false);
    assert.ok(result.candidates.every(c => c.requires_approval === true));
    assert.ok(result.candidates.filter(c => c.outreach_draft).every(c => c.outreach_draft.auto_send === false));
  });

  it('never silently returns fabricated businesses when all sources are unavailable', async () => {
    const beforeKey = process.env.EXPLEE_API_KEY;
    const beforeFlag = process.env.EXPLEE_LEAD_RESEARCH_ENABLED;
    const beforePlaces = process.env.GOOGLE_PLACES_API_KEY;
    const beforeMaps = process.env.GOOGLE_MAPS_API_KEY;
    const beforeApify = process.env.APIFY_TOKEN;
    try {
      delete process.env.EXPLEE_API_KEY;
      delete process.env.EXPLEE_LEAD_RESEARCH_ENABLED;
      delete process.env.GOOGLE_PLACES_API_KEY;
      delete process.env.GOOGLE_MAPS_API_KEY;
      delete process.env.APIFY_TOKEN;
      assert.deepEqual(availableHybridSources(), []);
      await assert.rejects(discoverHybrid({ query: 'restaurants' }), /No hybrid lead source configured/);
    } finally {
      for (const [key, value] of [
        ['EXPLEE_API_KEY', beforeKey], ['EXPLEE_LEAD_RESEARCH_ENABLED', beforeFlag],
        ['GOOGLE_PLACES_API_KEY', beforePlaces], ['GOOGLE_MAPS_API_KEY', beforeMaps],
        ['APIFY_TOKEN', beforeApify]
      ]) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
