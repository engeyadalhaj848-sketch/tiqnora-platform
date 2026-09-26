import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapPlaceToRaw,
  buildTextSearchQuery,
  textSearchPlaces,
  nearbySearchPlaces,
  discover,
  isGooglePlacesConfigured
} from '../lib/v6/research/providers/google-places.js';
import { resolveCityLocation, buildLocationBias } from '../lib/v6/research/location-resolver.js';
import { normalizeBusinessRecord, findDuplicateMatch, runResearchJob } from '../lib/v6/lead-research.js';
import { discoverWithProvider, getProvider } from '../lib/v6/research/provider-registry.js';

function mockFetchSequence(responses) {
  let i = 0;
  return async () => {
    const item = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return {
      ok: item.ok !== false,
      status: item.status || (item.ok === false ? 400 : 200),
      json: async () => item.body
    };
  };
}

const samplePlace = {
  id: 'places/ChIJ_test_madinah_clinic',
  displayName: { text: 'عيادة النور للأسنان', languageCode: 'ar' },
  formattedAddress: 'المدينة المنورة السعودية',
  location: { latitude: 24.47, longitude: 39.61 },
  primaryType: 'dentist',
  types: ['dentist', 'health'],
  rating: 4.6,
  userRatingCount: 88,
  websiteUri: null,
  nationalPhoneNumber: '0148211001',
  internationalPhoneNumber: '+966148211001',
  businessStatus: 'OPERATIONAL',
  googleMapsUri: 'https://maps.google.com/?cid=123'
};

describe('google places provider', () => {
  it('registry exposes google_places', () => {
    assert.ok(getProvider('google_places'));
  });

  it('builds text query with city', () => {
    const q = buildTextSearchQuery({ query: 'عيادات أسنان', city: 'المدينة المنورة' });
    assert.match(q, /عيادات/);
    assert.match(q, /المدينة/);
  });

  it('resolves madinah location bias', () => {
    const loc = resolveCityLocation('المدينة المنورة');
    assert.ok(loc.lat > 24 && loc.lat < 25);
    const bias = buildLocationBias('المدينة المنورة');
    assert.ok(bias.circle.center.latitude);
  });

  it('maps place to raw research row without inventing email', () => {
    const raw = mapPlaceToRaw(samplePlace, { city: 'المدينة المنورة' });
    assert.equal(raw.business_name, 'عيادة النور للأسنان');
    assert.equal(raw.place_id, 'ChIJ_test_madinah_clinic');
    assert.equal(raw.source, 'google_places');
    assert.equal(raw.email, undefined);
    assert.equal(raw.rating, 4.6);
    assert.equal(raw.reviews_count, 88);
  });

  it('normalizeBusinessRecord keeps place_id and null email', () => {
    const raw = mapPlaceToRaw(samplePlace, { city: 'المدينة المنورة' });
    const n = normalizeBusinessRecord(raw);
    assert.equal(n.place_id, 'ChIJ_test_madinah_clinic');
    assert.equal(n.email, null);
    assert.equal(n.source, 'google_places');
  });

  it('dedupes by place_id', () => {
    const a = normalizeBusinessRecord(mapPlaceToRaw(samplePlace));
    const dup = findDuplicateMatch(a, [{ place_id: 'ChIJ_test_madinah_clinic', business_name: 'Old' }]);
    assert.equal(dup.matched, true);
    assert.equal(dup.match_on, 'place_id');
  });

  it('text search respects target_count and maps results', async () => {
    const fetchImpl = mockFetchSequence([
      {
        body: {
          places: [samplePlace, { ...samplePlace, id: 'places/ChIJ_2', displayName: { text: 'عيادة 2' }, rating: 3.5 }]
        }
      }
    ]);
    const prev = process.env.GOOGLE_PLACES_API_KEY;
    process.env.GOOGLE_PLACES_API_KEY = 'test-key-not-real';
    try {
      const rows = await textSearchPlaces(
        { query: 'عيادات أسنان', city: 'المدينة المنورة', target_count: 2 },
        { fetchImpl }
      );
      assert.equal(rows.length, 2);
      assert.equal(rows[0].source, 'google_places');
    } finally {
      if (prev === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
      else process.env.GOOGLE_PLACES_API_KEY = prev;
    }
  });

  it('applies minimum rating filter', async () => {
    const fetchImpl = mockFetchSequence([
      {
        body: {
          places: [
            samplePlace,
            { ...samplePlace, id: 'places/low', displayName: { text: 'Low' }, rating: 2.1, userRatingCount: 3 }
          ]
        }
      }
    ]);
    process.env.GOOGLE_PLACES_API_KEY = 'test-key-not-real';
    const rows = await textSearchPlaces(
      { query: 'عيادات', city: 'المدينة المنورة', target_count: 10, min_rating: 4 },
      { fetchImpl }
    );
    assert.ok(rows.every((r) => r.rating >= 4));
  });

  it('pagination stops at max pages / target', async () => {
    const page = {
      places: Array.from({ length: 20 }, (_, i) => ({
        ...samplePlace,
        id: `places/p${i}`,
        displayName: { text: `عيادة ${i}` }
      })),
      nextPageToken: 'NEXT'
    };
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => page };
    };
    process.env.GOOGLE_PLACES_API_KEY = 'test-key-not-real';
    const rows = await textSearchPlaces(
      { query: 'عيادات', city: 'المدينة المنورة', target_count: 40 },
      { fetchImpl }
    );
    assert.ok(rows.length <= 40);
    assert.ok(calls <= 3);
  });

  it('missing API key throws code missing_api_key', async () => {
    const prev = process.env.GOOGLE_PLACES_API_KEY;
    const prev2 = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    try {
      await assert.rejects(
        () => discover({ query: 'x', city: 'y', target_count: 1 }),
        (err) => err.code === 'missing_api_key'
      );
    } finally {
      if (prev !== undefined) process.env.GOOGLE_PLACES_API_KEY = prev;
      if (prev2 !== undefined) process.env.GOOGLE_MAPS_API_KEY = prev2;
    }
  });

  it('handles Google API error without leaking secrets', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'secret-should-not-appear-in-message';
    const fetchImpl = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'PERMISSION_DENIED', status: 'PERMISSION_DENIED' } })
    });
    try {
      await textSearchPlaces({ query: 'x', city: 'المدينة', target_count: 1 }, { fetchImpl });
      assert.fail('should throw');
    } catch (e) {
      assert.match(String(e.message), /PERMISSION|Google|403/i);
      assert.equal(String(e.message).includes('secret-should-not-appear'), false);
    }
  });

  it('nearby search uses coordinates', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key-not-real';
    let bodySeen = null;
    const fetchImpl = async (url, init) => {
      bodySeen = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ places: [samplePlace] })
      };
    };
    const rows = await nearbySearchPlaces(
      {
        query: 'عيادات',
        city: 'المدينة المنورة',
        latitude: 24.5,
        longitude: 39.5,
        radius_m: 3000,
        target_count: 5,
        search_mode: 'nearby'
      },
      { fetchImpl }
    );
    assert.equal(rows.length, 1);
    assert.ok(bodySeen.locationRestriction.circle.center.latitude);
  });

  it('full research job with mocked google places provider', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key-not-real';
    const fetchImpl = mockFetchSequence([{ body: { places: [samplePlace] } }]);
    const result = await runResearchJob(
      {
        query: 'عيادات أسنان',
        city: 'المدينة المنورة',
        industry: 'dental_clinic',
        target_count: 1,
        source: 'google_places'
      },
      { fetchImpl, provider: 'google_places' }
    );
    assert.equal(result.job.status, 'completed');
    assert.ok(result.candidates.length >= 1);
    const c = result.candidates[0];
    assert.equal(c.requires_approval, true);
    assert.equal(c.auto_send, false);
    if (c.outreach_draft) {
      assert.equal(c.outreach_draft.auto_send, false);
      assert.equal(c.outreach_draft.requires_approval, true);
    }
  });

  it('discoverWithProvider returns array for google_places', async () => {
    process.env.GOOGLE_PLACES_API_KEY = 'test-key-not-real';
    const fetchImpl = mockFetchSequence([{ body: { places: [samplePlace] } }]);
    const rows = await discoverWithProvider('google_places', {
      query: 'مطاعم',
      city: 'المدينة المنورة',
      target_count: 1
    }, { fetchImpl });
    assert.ok(Array.isArray(rows));
    assert.equal(rows[0].source, 'google_places');
  });
});
