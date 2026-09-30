import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

describe('voice-agent wiring', () => {
  it('allows same-origin microphone use', () => {
    assert.match(read('vercel.json'), /microphone=\(self\)/);
  });

  it('adds a dedicated voice agent UI with Arabic speech recognition', () => {
    const js = read('admin/ai-workforce/workforce.js');
    assert.match(js, /'voice-agent'/);
    assert.match(js, /SpeechRecognition/);
    assert.match(js, /webkitSpeechRecognition/);
    assert.match(js, /recognition\.lang = 'ar-SA'/);
    assert.match(js, /speechSynthesis/);
    assert.match(js, /SpeechSynthesisUtterance/);
  });

  it('adds voice-specific agent expertise and seed migration', () => {
    assert.match(read('api/ai-workforce/chat.js'), /Role: Elite Arabic Voice Customer/);
    const migration = read('supabase/migrations/070_voice_agent.sql');
    assert.match(migration, /'voice-agent'/);
    assert.match(migration, /'active'/);
    assert.match(migration, /true/);
  });
});
