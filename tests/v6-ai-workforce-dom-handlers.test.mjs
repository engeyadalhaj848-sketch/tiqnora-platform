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
    const body = src.slice(start, start + 500);
    assert.ok(start >= 0);
    assert.match(body, /e\.preventDefault\(\)/);
    assert.ok(body.indexOf('e.preventDefault()') < body.indexOf("fetch('/api/ai-workforce/chat'"));
  });
});
