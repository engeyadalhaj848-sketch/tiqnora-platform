import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { normalizeE164, mapVapiWebhook } from '../lib/integrations/vapi.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');

describe('phone voice agent', () => {
  it('normalizes Saudi E.164 phone numbers and rejects local-only formats', () => {
    assert.equal(normalizeE164('+966 55 123 4567'), '+966551234567');
    assert.throws(() => normalizeE164('0551234567'), /E\.164/);
  });

  it('maps Vapi call lifecycle without persisting transcript fields', () => {
    const event = mapVapiWebhook({
      message: {
        type: 'call-ended',
        call: {
          id: 'call_1',
          startedAt: '2026-09-30T10:00:00.000Z',
          endedAt: '2026-09-30T10:01:15.000Z',
          endedReason: 'customer-ended-call'
        },
        analysis: { summary: 'Follow-up completed.' },
        transcript: 'sensitive transcript should not be returned'
      }
    });
    assert.equal(event.external_call_id, 'call_1');
    assert.equal(event.status, 'completed');
    assert.equal(event.duration_seconds, 75);
    assert.equal(event.summary, 'Follow-up completed.');
    assert.equal('transcript' in event, false);
  });

  it('requires explicit consent and human approval before a call action executes', () => {
    const api = read('api/v6.js');
    const engine = read('lib/actions/engine.js');
    assert.match(api, /explicit_consent_required/);
    assert.match(api, /requiresApproval: true/);
    assert.match(api, /approve_and_call/);
    assert.match(engine, /voice_call_consent_required/);
    assert.match(engine, /case 'place_voice_call'/);
  });

  it('keeps call recording and transcript persistence disabled by default', () => {
    const adapter = read('lib/integrations/vapi.js');
    const migration = read('supabase/migrations/071_voice_calls.sql');
    assert.match(adapter, /recording_default: false/);
    assert.match(adapter, /transcript_storage_default: false/);
    assert.doesNotMatch(migration, /recording_url/);
    assert.doesNotMatch(migration, /\btranscript\b\s+text/i);
  });

  it('routes Vapi webhook through the consolidated V6 function', () => {
    const vercel = read('vercel.json');
    assert.match(vercel, /\/api\/voice\/webhook/);
    assert.match(vercel, /route=voice_calls&op=webhook/);
  });
});
