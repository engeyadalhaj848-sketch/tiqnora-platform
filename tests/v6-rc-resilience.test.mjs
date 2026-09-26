import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  discoverProspects,
  runAutonomousGrowth,
} from '../lib/autonomous-sales.js';
import { generateText, aiProviderHealth } from '../lib/ai/provider.js';

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

  it('prospecting degrades on quota message even if status is not 429', async () => {
    const oldFetch = globalThis.fetch;
    const oldKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';

    globalThis.fetch = async () => ({
      ok: false,
      status: 403,
      json: async () => ({
        error: { message: 'You exceeded your current quota' }
      })
    });

    try {
      const result = await discoverProspects();
      assert.equal(result.degraded, true);
      assert.ok(['AI_PROVIDER_QUOTA', 'AI_PROVIDER_AUTH', 'AI_PROVIDER_ERROR'].includes(result.error_code));
      assert.equal(result.candidates, 0);
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
      // When fetch is fully mocked, Supabase also fails so due may be 0 — just ensure no throw.
      assert.ok(result.tasks);
    } finally {
      globalThis.fetch = oldFetch;
      if (oldKey == null) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = oldKey;
    }
  });

  it('generateText falls back to deterministic when all providers fail and allowDeterministic', async () => {
    const oldFetch = globalThis.fetch;
    const keys = {
      GEMINI: process.env.GEMINI_API_KEY,
      OPENAI: process.env.OPENAI_API_KEY,
      XAI: process.env.XAI_API_KEY,
      ANTHROPIC: process.env.ANTHROPIC_API_KEY
    };
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'You exceeded your current quota' } })
    });

    try {
      const result = await generateText({
        prompt: 'Write a short sales draft for a hotel POS system.',
        allowDeterministic: true
      });
      assert.equal(result.provider, 'deterministic');
      assert.equal(result.fallback_used, true);
      assert.ok(String(result.text).includes('Deterministic fallback') || String(result.text).includes('Manual'));
    } finally {
      globalThis.fetch = oldFetch;
      if (keys.GEMINI == null) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = keys.GEMINI;
      if (keys.OPENAI) process.env.OPENAI_API_KEY = keys.OPENAI;
      if (keys.XAI) process.env.XAI_API_KEY = keys.XAI;
      if (keys.ANTHROPIC) process.env.ANTHROPIC_API_KEY = keys.ANTHROPIC;
    }
  });

  it('generateText throws when all providers fail and allowDeterministic is false', async () => {
    const oldFetch = globalThis.fetch;
    const oldKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'You exceeded your current quota' } })
    });

    try {
      await assert.rejects(
        () => generateText({ prompt: 'hello', allowDeterministic: false }),
        (err) => err.code === 'AI_PROVIDER_QUOTA' || err.status === 429
      );
    } finally {
      globalThis.fetch = oldFetch;
      if (oldKey == null) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = oldKey;
    }
  });

  it('aiProviderHealth reports configured providers', () => {
    const health = aiProviderHealth();
    assert.ok(typeof health.configured === 'boolean');
    assert.ok(health.providers);
    assert.ok('gemini' in health.providers);
  });

  it('missing API key is classified as not configured', async () => {
    const oldKey = process.env.GEMINI_API_KEY;
    const oldOpen = process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    delete process.env.GOOGLE_GEMINI_API_KEY;

    try {
      await assert.rejects(
        () => generateText({ prompt: 'test', allowDeterministic: false }),
        (err) => err.code === 'AI_PROVIDER_NOT_CONFIGURED'
      );
    } finally {
      if (oldKey) process.env.GEMINI_API_KEY = oldKey;
      if (oldOpen) process.env.OPENAI_API_KEY = oldOpen;
    }
  });
});
