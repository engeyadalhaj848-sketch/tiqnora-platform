import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/social-inbox-admin.js', import.meta.url), 'utf8');
const hook = "  window.addEventListener('hashchange', () => setTimeout(mount, 150));";
assert.ok(source.includes(hook), 'Social Inbox script changed; update this test hook');
const instrumented = source.replace(hook, `  globalThis.whatsAppRowStatusForTest = whatsAppRowStatus;\n${hook}`);
const context = { window: { addEventListener() {} }, setInterval() {} };
runInNewContext(instrumented, context);
const rowStatus = context.whatsAppRowStatusForTest;
assert.equal(typeof rowStatus, 'function');

const healthy = {
  platform: 'whatsapp',
  status: 'active',
  external_account_id: 'ready-number',
  settings: { phone_status: 'CONNECTED', platform_type: 'CLOUD_API', webhook_subscribed: true }
};
const stale = {
  platform: 'whatsapp',
  status: 'active',
  external_account_id: 'disconnected-number',
  settings: { phone_status: 'DISCONNECTED', platform_type: 'BUSINESS_APP', webhook_subscribed: false }
};

// One ready phone must never make another active-looking row appear connected.
assert.deepEqual([healthy, stale].map(row => rowStatus(row, 'connected')), ['active', 'pending']);
assert.equal(rowStatus({ ...healthy, settings: { ...healthy.settings, webhook_subscribed: false } }, 'connected'), 'pending');
assert.equal(rowStatus(healthy, 'error'), 'pending');
assert.equal(rowStatus({ platform: 'facebook', status: 'active' }, 'error'), 'active');
console.log('WhatsApp Social Inbox row status checks passed');
