import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WHATSAPP_HUMAN_TAKEOVER_MS,
  isHumanWhatsAppMessage,
  whatsappHumanTakeoverActive
} from '../lib/v6/whatsapp-human-takeover.js';

const now = Date.parse('2026-10-10T19:40:00Z');
const phone = '+966500000111';
const otherPhone = '+966500000222';
const connectionId = 'connection-a';
const organizationId = 'org-a';
const conversationId = 'conversation-a';
const eventTime = new Date(now - 90_000).toISOString();

const echo = (customer = phone, occurredAt = eventTime) => ({
  occurred_at: occurredAt, conversation_id: null,
  raw_payload: { adapter: 'ycloud', kind: 'app_echo', message: { to: customer, from: '+966500000000' } }
});
const auto = () => ({
  occurred_at: eventTime, conversation_id: conversationId,
  raw_payload: { adapter: 'tiqnora_outbound', mode: 'auto_reply', recipient_phone: phone }
});
const manual = (customer = phone) => ({
  occurred_at: eventTime, conversation_id: conversationId,
  raw_payload: { adapter: 'tiqnora_outbound', mode: 'manual_reply', recipient_phone: customer }
});
const check = (rows, overrides = {}) => whatsappHumanTakeoverActive({
  organizationId, connectionId, customerPhone: phone, conversationId, now,
  rest: async () => rows, ...overrides
});

test('owner WhatsApp Business app reply pauses only that customer', () => {
  assert.equal(isHumanWhatsAppMessage(echo(), { customerPhone: phone, now }), true);
  assert.equal(isHumanWhatsAppMessage(echo(), { customerPhone: otherPhone, now }), false);
  assert.equal(isHumanWhatsAppMessage(echo(otherPhone), { customerPhone: phone, now }), false);
});

test('AI outbound messages and status events never pause the AI', async () => {
  assert.equal(isHumanWhatsAppMessage(auto(), { customerPhone: phone, conversationId, now }), false);
  assert.equal(await check([auto()]), false);
});

test('manual admin inbox replies and approved human proposals pause a matching customer', async () => {
  assert.equal(await check([manual()]), true);
  const proposal = { ...manual(), raw_payload: { ...manual().raw_payload, mode: 'approved_proposal' } };
  assert.equal(await check([proposal]), true);
  assert.equal(await check([manual(otherPhone)], { customerPhone: otherPhone, conversationId: 'different' }), true);
  assert.equal(await check([manual(otherPhone)], { conversationId: 'different' }), false);
});

test('old manually-sent YCloud messages without a mode are supported by conversation ID', () => {
  const legacy = {
    occurred_at: eventTime, conversation_id: conversationId,
    raw_payload: { adapter: 'tiqnora_outbound', in_reply_to: 'incoming-event' }
  };
  assert.equal(isHumanWhatsAppMessage(legacy, { customerPhone: phone, conversationId, now }), true);
  assert.equal(isHumanWhatsAppMessage(legacy, { customerPhone: phone, conversationId: 'other', now }), false);
});

test('takeover expires after two hours without a human message', async () => {
  assert.equal(WHATSAPP_HUMAN_TAKEOVER_MS, 120 * 60 * 1000);
  const expired = echo(phone, new Date(now - WHATSAPP_HUMAN_TAKEOVER_MS - 1).toISOString());
  assert.equal(await check([expired]), false);
  assert.equal(await check([echo(phone, new Date(now - 10 * 60_000).toISOString())]), true);
});

test('account isolation, unknown numbers and database failures are safe', async () => {
  let query = '';
  assert.equal(await check([echo()], { connectionId: 'other-account', rest: async q => { query = q; return []; } }), false);
  assert.match(query, /connection_id=eq.other-account/);
  assert.equal(await check([], { customerPhone: null }), true);
  await assert.rejects(check([], { rest: async () => { throw new Error('DB unavailable'); } }), /DB unavailable/);
});

test('the lookup checks persisted events, not ephemeral memory', async () => {
  let requested = '';
  const paused = await check([auto(), echo()], { rest: async q => { requested = q; return [auto(), echo()]; } });
  assert.equal(paused, true);
  assert.match(requested, /event_type=eq.message.sent/);
  assert.match(requested, /occurred_at=gte/);
  assert.match(requested, /order=occurred_at.desc/);
  assert.equal(await check(Array.from({ length: 200 }, auto)), true); // fail-closed when result is truncated
});
