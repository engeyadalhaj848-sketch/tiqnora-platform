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
      ANTHROPIC: process.env.ANTHROPIC_API_KEY,
      GROQ: process.env.GROQ_API_KEY,
      OPENROUTER: process.env.OPENROUTER_API_KEY
    };
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

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
      if (keys.GROQ) process.env.GROQ_API_KEY = keys.GROQ;
      if (keys.OPENROUTER) process.env.OPENROUTER_API_KEY = keys.OPENROUTER;
    }
  });

  it('generateText throws when all providers fail and allowDeterministic is false', async () => {
    const oldFetch = globalThis.fetch;
    const oldKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

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

  it('uses Vercel AI Gateway first and sends model fallbacks at the REST top level', async () => {
    const oldFetch = globalThis.fetch;
    const saved = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
      GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
      XAI_API_KEY: process.env.XAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      AI_GATEWAY_ENABLED: process.env.AI_GATEWAY_ENABLED,
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
      AI_GATEWAY_MODEL: process.env.AI_GATEWAY_MODEL,
      AI_GATEWAY_FALLBACK_MODELS: process.env.AI_GATEWAY_FALLBACK_MODELS
    };
    process.env.AI_GATEWAY_ENABLED = 'true';
    process.env.VERCEL_OIDC_TOKEN = 'oidc-test-token';
    process.env.AI_GATEWAY_MODEL = 'openai/gpt-5.6-luna';
    process.env.AI_GATEWAY_FALLBACK_MODELS = 'google/gemini-3.1-flash-lite,alibaba/qwen3.7-flash';
    process.env.OPENAI_API_KEY = 'direct-openai-test-key';
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).includes('ai-gateway.vercel.sh')) {
        const body = JSON.parse(init.body);
        assert.equal(init.headers.Authorization, 'Bearer oidc-test-token');
        assert.equal(body.model, 'openai/gpt-5.6-luna');
        assert.deepEqual(body.models, ['google/gemini-3.1-flash-lite', 'alibaba/qwen3.7-flash']);
        assert.equal(body.providerOptions.gateway.tags[0], 'app:tiqnora');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: 'openai/gpt-5.6-luna',
            choices: [{ message: { content: 'gateway ok' } }]
          })
        };
      }
      throw new Error('direct provider should not be called when Gateway succeeds');
    };

    try {
      const result = await generateText({ prompt: 'hello', allowDeterministic: false });
      assert.equal(result.provider, 'vercel_ai_gateway');
      assert.equal(result.text, 'gateway ok');
      assert.equal(calls.length, 1);
    } finally {
      globalThis.fetch = oldFetch;
      for (const [key, value] of Object.entries(saved)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('falls back from exhausted Gateway budget to the direct OpenAI provider', async () => {
    const oldFetch = globalThis.fetch;
    const saved = {
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
      GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
      XAI_API_KEY: process.env.XAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      AI_GATEWAY_ENABLED: process.env.AI_GATEWAY_ENABLED,
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN
    };
    process.env.AI_GATEWAY_ENABLED = 'true';
    process.env.VERCEL_OIDC_TOKEN = 'oidc-test-token';
    process.env.OPENAI_API_KEY = 'direct-openai-test-key';
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GEMINI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const urls = [];
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      if (String(url).includes('ai-gateway.vercel.sh')) {
        return {
          ok: false,
          status: 402,
          json: async () => ({ error: { message: 'Payment required: gateway budget exhausted' } })
        };
      }
      if (String(url).includes('api.openai.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: 'chat-latest',
            choices: [{ message: { content: 'direct fallback ok' } }]
          })
        };
      }
      throw new Error('unexpected provider');
    };

    try {
      const result = await generateText({ prompt: 'hello', allowDeterministic: false });
      assert.equal(result.provider, 'openai');
      assert.equal(result.text, 'direct fallback ok');
      assert.equal(urls[0].includes('ai-gateway.vercel.sh'), true);
      assert.equal(urls[1].includes('api.openai.com'), true);
    } finally {
      globalThis.fetch = oldFetch;
      for (const [key, value] of Object.entries(saved)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('uses Groq before other configured direct providers', async () => {
    const oldFetch = globalThis.fetch;
    const saved = {
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      AI_GATEWAY_ENABLED: process.env.AI_GATEWAY_ENABLED,
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN
    };
    process.env.GROQ_API_KEY = 'groq-test-key';
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    process.env.OPENROUTER_API_KEY = 'openrouter-test-key';
    process.env.OPENAI_API_KEY = 'openai-test-key';
    delete process.env.AI_GATEWAY_ENABLED;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;

    const urls = [];
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      if (String(url).includes('api.groq.com')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: 'openai/gpt-oss-20b',
            choices: [{ message: { content: 'groq ok' } }]
          })
        };
      }
      throw new Error('a later provider should not be called when Groq succeeds');
    };

    try {
      const result = await generateText({ prompt: 'hello', allowDeterministic: false });
      assert.equal(result.provider, 'groq');
      assert.equal(result.text, 'groq ok');
      assert.equal(result.fallback_used, false);
      assert.equal(urls.length, 1);
      assert.equal(urls[0].includes('api.groq.com'), true);
    } finally {
      globalThis.fetch = oldFetch;
      for (const [key, value] of Object.entries(saved)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('falls back from Groq and Gemini to OpenRouter free router', async () => {
    const oldFetch = globalThis.fetch;
    const saved = {
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      XAI_API_KEY: process.env.XAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      AI_GATEWAY_ENABLED: process.env.AI_GATEWAY_ENABLED,
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN
    };
    process.env.GROQ_API_KEY = 'groq-test-key';
    process.env.GEMINI_API_KEY = 'gemini-test-key';
    process.env.OPENROUTER_API_KEY = 'openrouter-test-key';
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.AI_GATEWAY_ENABLED;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;

    const urls = [];
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      if (String(url).includes('api.groq.com')) {
        return { ok: false, status: 429, json: async () => ({ error: { message: 'rate limit' } }) };
      }
      if (String(url).includes('generativelanguage.googleapis.com')) {
        return { ok: false, status: 429, json: async () => ({ error: { message: 'quota exhausted' } }) };
      }
      if (String(url).includes('openrouter.ai')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            model: 'free-model',
            choices: [{ message: { content: 'openrouter fallback ok' } }]
          })
        };
      }
      throw new Error('unexpected provider');
    };

    try {
      const result = await generateText({ prompt: 'hello', allowDeterministic: false });
      assert.equal(result.provider, 'openrouter');
      assert.equal(result.text, 'openrouter fallback ok');
      assert.equal(result.fallback_used, true);
      assert.equal(urls[0].includes('api.groq.com'), true);
      assert.equal(urls.some(url => url.includes('generativelanguage.googleapis.com')), true);
      assert.equal(urls.at(-1).includes('openrouter.ai'), true);
    } finally {
      globalThis.fetch = oldFetch;
      for (const [key, value] of Object.entries(saved)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('aiProviderHealth reports configured providers', () => {
    const health = aiProviderHealth();
    assert.ok(typeof health.configured === 'boolean');
    assert.ok(health.providers);
    assert.ok('gemini' in health.providers);
  });

  it('missing API key is classified as not configured', async () => {
    const saved = {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      XAI_API_KEY: process.env.XAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
      GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY,
      AI_GATEWAY_ENABLED: process.env.AI_GATEWAY_ENABLED,
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN
    };
    for (const key of Object.keys(saved)) delete process.env[key];

    try {
      await assert.rejects(
        () => generateText({ prompt: 'test', allowDeterministic: false }),
        (err) => err.code === 'AI_PROVIDER_NOT_CONFIGURED'
      );
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value == null) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
