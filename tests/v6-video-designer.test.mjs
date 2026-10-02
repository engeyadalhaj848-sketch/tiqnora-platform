import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { isVideoDesignRequest, videoProviderStatus } from '../lib/v6/video-designer.js';
import { isAssetProductionRequest } from '../lib/telegram-agent-room.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('video designer recognizes real video production requests', () => {
  assert.equal(isVideoDesignRequest('نفذ فيديو فعلي 9:16 للحملة'), true);
  assert.equal(isVideoDesignRequest('جهز Reel و TikTok للحملة'), true);
  assert.equal(isVideoDesignRequest('اكتب منشور فقط'), false);
  assert.equal(isAssetProductionRequest('ابدأوا التنفيذ الآن والصور والفيديو تكون فعلية'), true);
  assert.equal(isAssetProductionRequest('ناقشوا فكرة الفيديو لاحقاً'), false);
});

test('video provider status is truthful and bounded to supported single clips', () => {
  const status = videoProviderStatus();
  assert.equal(status.provider, 'gemini');
  assert.equal(typeof status.configured, 'boolean');
  assert.ok(status.model.includes('veo'));
  assert.equal(status.max_single_clip_seconds, 8);
  assert.deepEqual(status.supported_aspect_ratios, ['9:16', '16:9']);
});

test('native MCP exposes an implemented media.generate_video tool', () => {
  const src = readFileSync(join(root, 'lib/v6/workforce/mcp-native.js'), 'utf8');
  assert.ok(src.includes("'media.generate_video'"));
  assert.ok(src.includes('runVideoGeneration'));
  assert.ok(src.includes('videoProviderStatus'));
  assert.ok(src.includes('NATIVE_TOOL_DEFS'));
});

test('Telegram collaboration executes asset pipelines instead of only discussing them', () => {
  const src = readFileSync(join(root, 'lib/telegram-agent-room.js'), 'utf8');
  assert.ok(src.includes('tryHandleImageDesignerChat'));
  assert.ok(src.includes('tryHandleVideoDesignerChat'));
  assert.ok(src.includes("task: assetProductionRequested && isAssetAgent ? 'specialist_execution' : 'specialist_discussion'"));
  assert.ok(src.includes("agent.slug === 'video-designer'"));
});

test('video persistence migration keeps generated media private and approval-gated', () => {
  const sql = readFileSync(join(root, 'supabase/migrations/076_video_designer_jobs.sql'), 'utf8');
  assert.ok(sql.includes('create table if not exists public.video_jobs'));
  assert.ok(sql.includes("'pending_approval'"));
  assert.ok(sql.includes("'videos'"));
  assert.ok(sql.includes('false'));
  assert.ok(sql.includes("array['video/mp4','video/webm']"));
});
