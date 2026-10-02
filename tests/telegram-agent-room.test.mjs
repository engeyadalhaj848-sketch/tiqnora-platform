import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAgentRoomSetupCommand,
  isAgentRoomDiscussionRequest,
  selectExplicitParticipants
} from '../lib/telegram-agent-room.js';
import { isTeamCollaborationRequest } from '../lib/telegram-command-center.js';

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


test('Telegram team campaign instructions are classified as collaboration, not a single image request', () => {
  const request = [
    'جهّزوا حملة منشورات عن تصميم المواقع والمتاجر الإلكترونية من Tiqnora.',
    'مدير التسويق يحدد الزاوية، مدير المحتوى يكتب المحتوى، ومصمم الصور والفيديو يجهز المواد البصرية.',
    'لا تنشروا أي شيء الآن. أرسلوا المنشورات والصور والفيديوهات هنا للمراجعة والموافقة.'
  ].join(' ');
  assert.equal(isTeamCollaborationRequest(request), true);
  assert.equal(isTeamCollaborationRequest('مصمم الصور: صمم لي صورة لخدمة تصميم المواقع'), false);
  assert.equal(isTeamCollaborationRequest('اكتب منشور عن تصميم المواقع'), false);
});

test('Telegram command center excludes team collaboration from generic image execution', () => {
  const src = readFileSync(join(root, 'lib/telegram-command-center.js'), 'utf8');
  assert.ok(src.includes('const teamCollaborationRequested = isTeamCollaborationRequest(text)'));
  assert.ok(src.includes('(isImageDesignRequest(text) && !teamCollaborationRequested && !videoExecutionRequested)'));
  assert.ok(src.includes('(isVideoDesignRequest(text) && !teamCollaborationRequested)'));
  assert.ok(src.includes('teamCollaborationRequested || isAgentRoomDiscussionRequest(text)'));
});


test('Telegram collaboration prioritizes explicitly named campaign agents', () => {
  const agents = [
    { slug:'sales' },
    { slug:'channel' },
    { slug:'marketing' },
    { slug:'content' },
    { slug:'image-designer' },
    { slug:'video-designer' },
    { slug:'manager' }
  ];
  const request = 'مدير التسويق يحدد الزاوية، مدير المحتوى يكتب المحتوى، ومصمم الصور ومصمم الفيديو يجهزون المواد البصرية.';
  assert.deepEqual(
    selectExplicitParticipants(request, agents).map(agent => agent.slug),
    ['marketing','content','image-designer','video-designer']
  );
});

test('Telegram collaboration keeps explicit participant priority ahead of generic runtime ranking', () => {
  const src = readFileSync(join(root, 'lib/telegram-agent-room.js'), 'utf8');
  const start = src.indexOf('export async function runAgentRoomDiscussion');
  const body = src.slice(start, start + 2600);
  assert.ok(body.includes('const explicitParticipants = selectExplicitParticipants(topic, agents)'));
  assert.ok(body.indexOf('explicitParticipants.forEach(addParticipant)') < body.indexOf('plannedParticipants.forEach(addParticipant)'));
});


test('Telegram collaboration expands combined image/video designer wording into both explicit agents', () => {
  const agents = [
    { slug:'marketing' },
    { slug:'content' },
    { slug:'image-designer' },
    { slug:'video-designer' },
    { slug:'sales' },
    { slug:'manager' }
  ];
  const request = 'مدير التسويق يحدد الزاوية، مدير المحتوى يكتب المحتوى، ومصمم الصور/الفيديو يجهز المواد البصرية.';
  assert.deepEqual(
    selectExplicitParticipants(request, agents).map(agent => agent.slug),
    ['marketing','content','image-designer','video-designer']
  );
});


test('Telegram agent room receives approved Tiqnora brand context and does not re-request known assets', () => {
  const src = readFileSync(join(root, 'lib/telegram-agent-room.js'), 'utf8');
  assert.ok(src.includes("buildBrandContext"));
  assert.ok(src.includes("getDefaultBrandProfile"));
  assert.ok(src.includes("approved_logo_asset: '/assets/tiqnora-logo.png'"));
  assert.ok(src.includes('لا تطلب من المالك إعادة تزويدك بالشعار أو الألوان أو قواعد الاستخدام'));
  assert.ok(src.includes('استخدم CTA من مكتبة الهوية المعتمدة'));
});
