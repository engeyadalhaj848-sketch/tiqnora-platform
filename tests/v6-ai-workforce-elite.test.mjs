import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workforceChat = readFileSync(new URL('../api/ai-workforce/chat.js', import.meta.url), 'utf8');
const commerceAi = readFileSync(new URL('../api/commerce/ai.js', import.meta.url), 'utf8');
const provider = readFileSync(new URL('../lib/ai/provider.js', import.meta.url), 'utf8');

test('elite workforce has specialist operating standards for every internal agent', () => {
  assert.equal(workforceChat.includes('ELITE_OPERATING_STANDARD'), true);
  assert.equal(workforceChat.includes("marketing: \`"), true);
  assert.equal(workforceChat.includes("content: \`"), true);
  assert.equal(workforceChat.includes("'social-media': \`"), true);
  assert.equal(workforceChat.includes("developer: \`"), true);
  assert.equal(workforceChat.includes("commerce: \`"), true);
  assert.equal(workforceChat.includes('silently quality-check for correctness, specificity, usefulness, risk, and consistency'), true);
});

test('elite workforce uses memory, recent conversation, and open tasks', () => {
  assert.equal(workforceChat.includes('expertSystemPrompt(agent, memory, tasks)'), true);
  assert.equal(workforceChat.includes('limit=40'), true);
  assert.equal(workforceChat.includes('limit=12'), true);
  assert.equal(workforceChat.includes('status=in.(todo,in_progress,blocked)'), true);
  assert.equal(workforceChat.includes('Open tasks for this agent:'), true);
});

test('OpenAI is primary with provider resilience for workforce and commerce', () => {
  const candidatesStart = workforceChat.indexOf('function providerCandidates()');
  const candidatesEnd = workforceChat.indexOf('async function callPreferredProvider', candidatesStart);
  const candidates = workforceChat.slice(candidatesStart, candidatesEnd);
  assert.equal(candidates.indexOf("id: 'openai'") < candidates.indexOf("id: 'google_ai'"), true);
  assert.equal(workforceChat.includes('max_completion_tokens: 4096'), true);
  assert.equal(commerceAi.includes("import { generateText } from '../../lib/ai/provider.js';"), true);
  assert.equal(commerceAi.includes('async function callCommerceAI'), true);
  assert.equal(commerceAi.includes('generativelanguage.googleapis.com'), false);
  assert.equal(provider.includes("preferredProvider = openaiKey()"), true);
});

test('workforce public-output guard protects private ownership identity', () => {
  assert.equal(workforceChat.includes("identity of Tiqnora's owner/founder"), true);
});
