import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync(new URL('../lib/v6/social-runtime.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../api/v6.js', import.meta.url), 'utf8');
const reports = readFileSync(new URL('../api/reports/telegram.js', import.meta.url), 'utf8');
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('worker only claims approval-cleared queue rows', () => {
  assert.equal(runtime.includes('requires_approval=eq.false'), true);
  assert.equal(runtime.includes("status:'processing'"), true);
});

test('worker supports Facebook and Instagram Graph publishing', () => {
  assert.equal(runtime.includes('/feed'), true);
  assert.equal(runtime.includes('/media_publish'), true);
  assert.equal(runtime.includes('instagram_image_required'), true);
});

test('worker does not fake TikTok or WhatsApp feed publishing', () => {
  assert.equal(runtime.includes('tiktok_media_consent_required'), true);
  assert.equal(runtime.includes('whatsapp_not_feed'), true);
});

test('worker records provider outcomes and is fail-closed behind CRON_SECRET', () => {
  assert.equal(runtime.includes("status:'published'"), true);
  assert.equal(runtime.includes("status:'failed'"), true);
  assert.equal(runtime.includes("status:'waiting_provider'"), true);
  assert.equal(api.includes("if (!secret || (auth !== `Bearer ${secret}` && headerSecret !== secret))"), true);
});

test('scheduled publishing reuses existing daily crons and adds no new Hobby cron', () => {
  assert.equal(reports.includes('processPublishingQueue({ limit: 10 })'), true);
  assert.equal(vercel.crons.some(c => c.path === '/api/social/publish-worker'), false);
  assert.equal(vercel.rewrites.some(r => r.source === '/api/social/publish-worker' && r.destination.includes('route=social_publish_worker')), true);
});
