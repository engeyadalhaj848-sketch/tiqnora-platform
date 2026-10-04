import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  listRuntimeSkills,
  listAgentSkillBindings,
  getSkillsForAgent,
  allowedMcpTools,
  formatApprovedLearning,
  orchestrationContext
} from '../lib/v6/agent-runtime.js';

describe('runtime Skills registry', () => {
  it('exposes real registered skills and agent bindings', () => {
    const skills = listRuntimeSkills();
    const bindings = listAgentSkillBindings();
    assert.ok(skills.length >= 10);
    assert.ok(skills.some((skill) => skill.id === 'software_engineering'));
    assert.ok(skills.some((skill) => skill.id === 'grounded_research'));
    const developer = bindings.find((binding) => binding.agent_slug === 'developer');
    assert.ok(developer);
    assert.deepEqual(developer.skill_ids, getSkillsForAgent('developer').map((skill) => skill.id));
    assert.deepEqual(developer.tools, allowedMcpTools('developer'));
  });
});

describe('approved learning accumulation', () => {
  it('injects only approved lessons and preserves safety boundaries', () => {
    const prompt = formatApprovedLearning([
      { id: 'a1', lesson_key: 'verify_before_claiming', lesson: 'Verify production evidence before claiming success.', status: 'approved' },
      { id: 'p1', lesson_key: 'not_ready', lesson: 'This proposed lesson must not be applied.', status: 'proposed' }
    ]);
    assert.match(prompt, /Verify production evidence before claiming success/);
    assert.doesNotMatch(prompt, /proposed lesson must not be applied/);
    assert.match(prompt, /never override global safety rules/i);

    const runtime = orchestrationContext({
      agent: { slug: 'developer' },
      message: 'Fix the production bug',
      approvedLessons: [
        { id: 'a1', lesson_key: 'verify_before_claiming', lesson: 'Verify production evidence before claiming success.', status: 'approved' }
      ]
    });
    assert.match(runtime.learning_prompt, /verify_before_claiming/);
  });

  it('live chat loads approved learning and adds it to main and delegated prompts', () => {
    const src = readFileSync(new URL('../api/ai-workforce/chat.js', import.meta.url), 'utf8');
    assert.match(src, /ai_agent_learning_events\?organization_id=eq/);
    assert.match(src, /status=eq\.approved/);
    assert.match(src, /approvedLearningForAgent/);
    assert.match(src, /runtime\.learning_prompt/);
    assert.match(src, /specialistRuntime\.learning_prompt/);
    assert.match(src, /approved_learning_ids/);
    assert.match(src, /agent_key: agent\.slug \|\| agent\.id/);
  });
});

describe('live typed Memory wiring', () => {
  it('chat loads typed memory, injects it, and persists episodic turns', () => {
    const src = readFileSync(new URL('../api/ai-workforce/chat.js', import.meta.url), 'utf8');
    assert.match(src, /agent_memory_entries\?organization_id=eq/);
    assert.match(src, /const memory = \[/);
    assert.match(src, /legacyMemory/);
    assert.match(src, /expertSystemPrompt\(agent, memory, tasks\)/);
    assert.match(src, /memory_type: 'episodic'/);
    assert.match(src, /scope: 'agent'/);
    assert.match(src, /source: 'ai-workforce-chat'/);
    assert.match(src, /expires_at: expiresAt/);
    assert.match(src, /memory_id: .*chat_/);
  });

  it('runtime-status exposes real skills, embeddings and MCP status to admins', () => {
    const src = readFileSync(new URL('../api/ai-workforce/chat.js', import.meta.url), 'utf8');
    assert.match(src, /runtime-status/);
    assert.match(src, /skills: listRuntimeSkills\(\)/);
    assert.match(src, /agent_skill_bindings: listAgentSkillBindings\(\)/);
    assert.match(src, /embeddings: embeddingStatus\(process\.env\)/);
    assert.match(src, /native: true/);
  });
});

describe('Admin Skills UI', () => {
  it('loads the runtime status endpoint instead of a hard-coded subset', () => {
    const src = readFileSync(new URL('../admin/ai-workforce/workforce.js', import.meta.url), 'utf8');
    assert.match(src, /loadRuntimeStatus/);
    assert.match(src, /\/api\/ai-workforce\/chat\?route=runtime-status/);
    assert.match(src, /runtimeStatus\.skills/);
    assert.match(src, /agent_skill_bindings/);
    assert.doesNotMatch(src, /Not configured — no runtime status endpoint/);
  });
});
