import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  discoverProspects,
  runAutonomousGrowth
} from '../lib/autonomous-sales.js';

describe('RC AI quota resilience', () => {
  it('prospecting degrades cleanly on Gemini quota exhaustion', async () => {
    const oldFetch = globalThis.fetch;
    const oldKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';

    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({
        error: { message: 'You exceeded your current quota' }
      })
    });

    try {
      const result = await discoverProspects();
      assert.equal(result.degraded, true);
      assert.equal(result.error_code, 'AI_PROVIDER_QUOTA');
      assert.equal(result.candidates, 0);
      assert.equal(result.saved, 0);
    } finally {
      globalThis.fetch = oldFetch;
      if (oldKey == null) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = oldKey;
    }
  });

  it('autonomous growth still returns a report when AI quota is exhausted', async () => {
    const oldFetch = globalThis.fetch;
    const oldKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';

    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({
        error: { message: 'You exceeded your current quota' }
      })
    });

    try {
      const result = await runAutonomousGrowth();
      assert.equal(result.degraded, true);
      assert.equal(result.prospecting.error_code, 'AI_PROVIDER_QUOTA');
      assert.equal(result.tasks.due, 0);
    } finally {
      globalThis.fetch = oldFetch;
      if (oldKey == null) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = oldKey;
    }
  });
});
