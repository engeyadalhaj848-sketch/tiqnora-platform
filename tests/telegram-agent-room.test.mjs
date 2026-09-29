import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAgentRoomSetupCommand,
  isAgentRoomDiscussionRequest
} from '../lib/telegram-agent-room.js';

test('Telegram agent room recognizes setup commands', () => {
  assert.equal(isAgentRoomSetupCommand('/group'), true);
  assert.equal(isAgentRoomSetupCommand('/room setup'), true);
  assert.equal(isAgentRoomSetupCommand('/group@tiqnora_bot'), true);
  assert.equal(isAgentRoomSetupCommand('/status'), false);
});

test('Telegram agent room recognizes discussion requests', () => {
  assert.equal(isAgentRoomDiscussionRequest('/discuss كيف نزيد مبيعات تصميم المواقع؟'), true);
  assert.equal(isAgentRoomDiscussionRequest('ناقشوا خطة التسويق لهذا الأسبوع'), true);
  assert.equal(isAgentRoomDiscussionRequest('حالة المنصة'), false);
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('collaboration group keeps explicit discussions multi-agent but routes normal chat to one specialist', () => {
  const src = readFileSync(join(root, 'lib/telegram-command-center.js'), 'utf8');
  assert.ok(src.includes('isCollaborationGroup'));
  assert.ok(src.includes('directAgentTarget'));
  assert.ok(src.includes('isCasualGroupMessage'));
  assert.ok(src.includes('selectedGroupAgent'));
  assert.ok(src.includes('runAgentRoomDiscussion(message, agents)'));
});

test('agent room uses shared provider fallback and never exposes raw provider errors', () => {
  const room = readFileSync(join(root, 'lib/telegram-agent-room.js'), 'utf8');
  const center = readFileSync(join(root, 'lib/telegram-command-center.js'), 'utf8');
  assert.ok(room.includes('generateText'));
  assert.ok(room.includes('callProvider'));
  assert.equal(room.includes('https://api.openai.com/v1/responses'), false);
  assert.equal(room.includes('generativelanguage.googleapis.com/v1beta/models/'), false);
  assert.ok(center.includes('generateText'));
  assert.ok(center.includes("error: 'ai_provider_unavailable'"));
  assert.ok(center.includes('سجلت الخطأ داخلياً'));
});
