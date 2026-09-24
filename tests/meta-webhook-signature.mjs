import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { validMetaSignature } from '../api/social/webhook.js';

process.env.META_APP_SECRET = 'facebook-test-secret';
process.env.INSTAGRAM_APP_SECRET = 'instagram-test-secret';

const signed = (object, secret) => {
  const rawBody = Buffer.from(JSON.stringify({ object, entry: [] }));
  const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return [{ headers: { 'x-hub-signature-256': signature } }, rawBody];
};

assert.equal(validMetaSignature(...signed('page', 'facebook-test-secret')), true);
assert.equal(validMetaSignature(...signed('instagram', 'facebook-test-secret')), true);
assert.equal(validMetaSignature(...signed('instagram', 'instagram-test-secret')), true);
assert.equal(validMetaSignature(...signed('page', 'instagram-test-secret')), false);
assert.equal(validMetaSignature(...signed('whatsapp_business_account', 'instagram-test-secret')), false);
assert.equal(validMetaSignature(...signed('instagram', 'instagram-test-secret'), 'whatsapp'), false);
assert.equal(validMetaSignature(...signed('instagram', 'wrong-secret')), false);

delete process.env.INSTAGRAM_APP_SECRET;
assert.equal(validMetaSignature(...signed('instagram', 'instagram-test-secret')), false);
assert.equal(validMetaSignature(...signed('page', 'facebook-test-secret')), true);

console.log('signature isolation checks passed');
