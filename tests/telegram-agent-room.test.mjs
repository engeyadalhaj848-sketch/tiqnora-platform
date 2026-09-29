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