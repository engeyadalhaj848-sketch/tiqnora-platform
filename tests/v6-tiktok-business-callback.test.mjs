import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const callback = readFileSync(new URL('../api/social/oauth/tiktok-business.js', import.meta.url), 'utf8');

test('TikTok for Business callback is public-ready without exposing auth codes', () => {
  assert.equal(callback.includes("status: 'callback_ready'"), true);
  assert.equal(callback.includes("req.query?.auth_code || req.query?.code"), true);
  assert.equal(callback.includes('TIKTOK_BUSINESS_APP_ID'), true);
  assert.equal(callback.includes('TIKTOK_BUSINESS_APP_SECRET'), true);
  assert.equal(callback.includes('authCode'), true);
  assert.equal(callback.includes("authorization code is intentionally not logged"), true);
});
