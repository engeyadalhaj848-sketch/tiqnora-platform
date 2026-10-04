import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('AI Workforce DOM handler wiring', () => {
  it('uses querySelectorAll helper for NodeList iteration before chat submit binding', () => {
    const src = readFileSync(new URL('../admin/ai-workforce/workforce.js', import.meta.url), 'utf8');

    assert.match(src, /\$\$\('\[data-pick\]'\)\.forEach/);
    assert.match(src, /\$\$\('\[data-memory-response\]'\)\.forEach/);
    assert.match(src, /\$\$\('\[data-voice-consent\]'\)\.forEach/);
    assert.match(src, /\$\$\('\[data-voice-revoke\]'\)\.forEach/);
    assert.match(src, /\$\$\('\[data-voice-draft\]'\)\.forEach/);

    assert.doesNotMatch(src, /(?<!\$)\$\('\[data-(?:pick|memory-response|voice-consent|voice-revoke|voice-draft)\]'\)\.forEach/);

    const renderChat = src.slice(src.indexOf('function renderChat()'), src.indexOf('function messagePair('));
    assert.match(renderChat, /\$\('#chat-form'\)\.onsubmit = sendMessage/);
    assert.match(renderChat, /type="submit"/);
  });

  it('sendMessage always prevents native form navigation first', () => {
    const src = readFileSync(new URL('../admin/ai-workforce/workforce.js', import.meta.url), 'utf8');
    const start = src.indexOf('async function sendMessage(e)');
    const end = src.indexOf('async function voiceApi(', start);
    const body = src.slice(start, end > start ? end : start + 5000);
    assert.ok(start >= 0);
    assert.match(body, /e\.preventDefault\(\)/);
    assert.match(body, /fetch\('\/api\/ai-workforce\/chat'/);
    assert.ok(body.indexOf('e.preventDefault()') < body.indexOf("fetch('/api/ai-workforce/chat'"));
  });
});


describe('AI Workforce chat rendering resilience', () => {
  it('renders the user message immediately and keeps a processing bubble while the API runs', () => {
    const src = readFileSync(new URL('../admin/ai-workforce/workforce.js', import.meta.url), 'utf8');
    assert.match(src, /function showPendingMessage\(message, tempId\)/);
    assert.match(src, /data-temp-user=/);
    assert.match(src, /data-temp-ai=/);
    assert.match(src, /جارٍ المعالجة/);

    const start = src.indexOf('async function sendMessage(e)');
    const body = src.slice(start, start + 2600);
    assert.ok(body.indexOf('showPendingMessage(message, tempId)') < body.indexOf("fetch('/api/ai-workforce/chat'"));
  });

  it('resyncs saved history from Supabase after a successful response and has an API reply fallback', () => {
    const src = readFileSync(new URL('../admin/ai-workforce/workforce.js', import.meta.url), 'utf8');
    assert.match(src, /async function refreshAgentConversations\(agentId\)/);
    assert.match(src, /from\('ai_conversations'\)/);
    assert.match(src, /await refreshAgentConversations\(agentId\)/);
    assert.match(src, /payload\.conversation \|\| fallbackConversation/);
    assert.match(src, /payload\.reply \|\| ''/);
    assert.match(src, /filter\(Boolean\)/);
  });

  it('recovers a completed persisted reply after a transient browser fetch failure', () => {
    const src = readFileSync(new URL('../admin/ai-workforce/workforce.js', import.meta.url), 'utf8');
    assert.match(src, /async function recoverSavedConversation\(agentId, message, startedAt\)/);
    assert.match(src, /await refreshAgentConversations\(agentId\)/);
    assert.match(src, /row\.status !== 'completed'/);
    assert.match(src, /String\(row\.message \|\| ''\)\.trim\(\) !== normalizedMessage/);
    assert.match(src, /failed to fetch\|networkerror\|load failed\|network request failed/i);
    assert.match(src, /const recovered = await recoverSavedConversation\(agentId, message, startedAt\)/);
    assert.match(src, /تم تنفيذ الطلب واستعادة رد الوكيل بعد انقطاع الاتصال/);
  });

  it('cache-busts the Workforce JavaScript asset on the page', () => {
    const html = readFileSync(new URL('../admin/ai-workforce/index.html', import.meta.url), 'utf8');
    assert.match(html, /workforce\.js\?v=20261004-1/);
  });

  it('chat API returns an explicit reply fallback in addition to the saved conversation', () => {
    const api = readFileSync(new URL('../api/ai-workforce/chat.js', import.meta.url), 'utf8');
    assert.match(api, /conversation_id: conversation\?\.id \|\| null/);
    assert.match(api, /reply: result\.text/);
    assert.match(api, /provider: result\.provider \|\| null/);
  });
});


describe('AI Workforce A2A visibility and DAILY dates', () => {
  it('loads real A2A routing fields and renders from/to plus task or artifact summary', () => {
    const src = readFileSync(new URL('../admin/ai-workforce/workforce.js', import.meta.url), 'utf8');
    assert.match(src, /ai_agent_messages', 'id,correlation_id,message_id,from_agent_id,to_agent_id,message_type,task,message,artifact,hop,status,metadata,created_at/);
    assert.match(src, /const agentLabel = \(id, fallback\)/);
    assert.match(src, /a2aTypeLabel/);
    assert.match(src, /a2aSummary/);
    assert.match(src, /تتبّع التفويض من المدير إلى الوكيل ثم رجوع الناتج للمدير/);
    assert.match(src, /من ← إلى/);
    assert.match(src, /المهمة \/ الناتج/);
    assert.match(src, /r\.metadata\?\.from_agent/);
    assert.match(src, /r\.metadata\?\.to_agent/);
  });

  it('renders DAILY task dates as isolated LTR badges using launch_day when available', () => {
    const src = readFileSync(new URL('../admin/ai-workforce/workforce.js', import.meta.url), 'utf8');
    assert.match(src, /function taskTitleHtml\(t\)/);
    assert.match(src, /t\?\.context\?\.launch_day/);
    assert.match(src, /dir="ltr">DAILY/);
    assert.match(src, /\^\\\[DAILY\\s\+\(\\d\{4\}-\\d\{2\}-\\d\{2\}\)\\\]/);
  });

  it('cache-busts the updated Workforce UI asset', () => {
    const html = readFileSync(new URL('../admin/ai-workforce/index.html', import.meta.url), 'utf8');
    assert.match(html, /workforce\.js\?v=20261004-1/);
  });
});


describe('AI Workforce A2A Arabic polish', () => {
  it('fully localizes protocol type/status labels in the visible table', () => {
    const src = readFileSync(new URL('../admin/ai-workforce/workforce.js', import.meta.url), 'utf8');
    assert.match(src, /completed:'مكتمل'/);
    assert.match(src, /failed:'فشل'/);
    assert.match(src, /handoff:'تفويض'/);
    assert.match(src, /artifact:'ناتج'/);
    assert.match(src, /<th>الخطوة<\/th>/);
    assert.doesNotMatch(src, /<span class="hint" dir="ltr">' \+ esc\(r\.message_type/);
    assert.match(src, /a2aStatusLabel\(r\.status\)/);
  });

  it('localizes the known English handoff boilerplate and hides the original behind details', () => {
    const src = readFileSync(new URL('../admin/ai-workforce/workforce.js', import.meta.url), 'utf8');
    assert.match(src, /genericEnglish/);
    assert.match(src, /تفويض إلى \$\{target\}: حلّل الطلب ضمن اختصاصك/);
    assert.match(src, /عرض النص الأصلي/);
    assert.match(src, /summary\.original/);
  });
});
