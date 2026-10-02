import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runV2AgentTurn, buildV2RuntimeContext } from '../lib/v6/workforce/production-runtime.js';

describe('runV2AgentTurn real function', () => {
  it('extracts result.text and evaluates the string', async () => {
    const agent = { id: 'ag1', organization_id: 'org1', slug: 'content', name: 'Content' };
    const turn = await runV2AgentTurn({
      agent,
      message: 'اكتب مسودة قصيرة',
      knowledge: [],
      runtime: { agent_card: { skills: [] }, tools: [] },
      invoke: async () => ({ text: 'real response' })
    });
    assert.equal(turn.response, 'real response');
    assert.notEqual(String(turn.response), '[object Object]');
    assert.ok(turn.evaluation);
    // evaluation must have been run against the string response
    assert.ok(typeof turn.evaluation.score === 'number' || typeof turn.evaluation.pass === 'boolean');
    assert.ok(turn.meta?.path === 'production-runtime.v2');
    assert.equal(turn.meta.agent_id, 'ag1');
    assert.equal(turn.meta.organization_id, 'org1');
  });

  it('rejects missing identity', async () => {
    await assert.rejects(
      () => runV2AgentTurn({
        agent: { id: 'ag1' },
        message: 'x',
        knowledge: [],
        runtime: {},
        invoke: async () => ({ text: 'x' })
      }),
      /production_identity|organization_id/
    );
  });
});

describe('admin skills honesty', () => {
  it('does not hard-code executive_routing skill list', () => {
    const src = readFileSync(new URL('../admin/ai-workforce/workforce.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /executive_routing/);
    assert.doesNotMatch(src, /sales_discovery.*growth_strategy.*content_strategy/s);
    assert.match(src, /Not configured/);
  });
});

describe('live chat V2 consumes full turn', () => {
  it('chat.js assigns evaluation/learning/meta from v2Turn', () => {
    const src = readFileSync(new URL('../api/ai-workforce/chat.js', import.meta.url), 'utf8');
    assert.match(src, /const v2Turn = await runV2AgentTurn/);
    assert.match(src, /runtimeEvaluation = v2Turn\.evaluation/);
    assert.match(src, /learningEvent = v2Turn\.learning/);
    assert.match(src, /harnessMeta = \{/);
    assert.match(src, /agent_traces/);
    assert.match(src, /sp_req_|request_runtime/);
    assert.match(src, /provider_harness/);
    assert.match(src, /span_id: `sp_eval_/);
    assert.match(src, /name: 'runtime_error'/);
    assert.match(src, /status: 'failed'/);
    assert.match(src, /throw error/);
  });
});
