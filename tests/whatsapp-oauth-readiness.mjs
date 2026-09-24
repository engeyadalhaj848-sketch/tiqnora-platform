import assert from 'node:assert/strict';
import { discoverWhatsAppAccounts, whatsAppIssueFromDiscovery, whatsAppPhoneIssue } from '../api/social/oauth/[provider].js';

function fakeGraph({ wabas = [], phones = [], platform = {}, subscribe = { success: true }, phoneError = false, platformError = false } = {}) {
  const calls = [];
  globalThis.fetch = async (rawUrl, options = {}) => {
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/^\/v22\.0\//, '');
    const method = options.method || 'GET';
    calls.push(`${method} ${path}`);
    let body;
    let ok = true;
    if (path === 'me/businesses') body = { data: [{ id: 'business-1', name: 'Business' }] };
    else if (path === 'business-1/owned_whatsapp_business_accounts') body = { data: wabas };
    else if (path === 'waba-1/phone_numbers') {
      if (phoneError) { ok = false; body = { error: { message: 'phone read denied' } }; }
      else body = { data: phones };
    } else if (path === 'phone-1' && method === 'GET') {
      if (platformError) { ok = false; body = { error: { message: 'platform unavailable' } }; }
      else body = platform;
    } else if (path === 'waba-1/subscribed_apps' && method === 'POST') body = subscribe;
    else throw new Error(`Unexpected Graph request: ${method} ${path}`);
    return { ok, status: ok ? 200 : 403, json: async () => body };
  };
  return calls;
}

const waba = { id: 'waba-1', name: 'Business WhatsApp' };
const connectedPhone = { id: 'phone-1', status: 'CONNECTED', display_phone_number: '+1 555 0100' };
assert.equal(whatsAppPhoneIssue({ ...connectedPhone, platform_type: 'CLOUD_API', is_on_biz_app: true }), null);
assert.equal(whatsAppPhoneIssue({ ...connectedPhone, platform_type: 'BUSINESS_APP' }), 'not_cloud_api');
assert.equal(whatsAppPhoneIssue({ ...connectedPhone, platform_type: 'CLOUD_API', status: 'DISCONNECTED' }), 'phone_disconnected');
assert.equal(whatsAppPhoneIssue({ id: 'phone-1', platform_type: 'CLOUD_API' }), 'phone_status_unknown');

let calls = fakeGraph();
let result = await discoverWhatsAppAccounts('test-token');
assert.equal(whatsAppIssueFromDiscovery(result), 'no_waba');
assert.equal(result.accounts.length, 0);
assert.equal(calls.some(call => call.includes('subscribed_apps')), false);

calls = fakeGraph({ wabas: [waba] });
result = await discoverWhatsAppAccounts('test-token');
assert.equal(whatsAppIssueFromDiscovery(result), 'no_phone');
assert.equal(calls.some(call => call.includes('subscribed_apps')), false);

calls = fakeGraph({ wabas: [waba], phones: [{ ...connectedPhone, status: 'DISCONNECTED' }], platform: { platform_type: 'CLOUD_API' } });
result = await discoverWhatsAppAccounts('test-token');
assert.equal(result.accounts[0].connection_issue, 'phone_disconnected');
assert.equal(calls.some(call => call.includes('subscribed_apps')), false);

calls = fakeGraph({ wabas: [waba], phones: [connectedPhone], platform: { platform_type: 'BUSINESS_APP', is_on_biz_app: true } });
result = await discoverWhatsAppAccounts('test-token');
assert.equal(result.accounts[0].connection_issue, 'not_cloud_api');
assert.equal(calls.some(call => call.includes('subscribed_apps')), false);

calls = fakeGraph({ wabas: [waba], phones: [connectedPhone], platform: { platform_type: 'CLOUD_API' }, subscribe: { success: false } });
result = await discoverWhatsAppAccounts('test-token');
assert.equal(result.accounts[0].connection_issue, 'webhook_subscription_failed');
assert.equal(calls.filter(call => call.includes('subscribed_apps')).length, 1);

calls = fakeGraph({ wabas: [waba], phones: [connectedPhone], platform: { platform_type: 'CLOUD_API', is_on_biz_app: true } });
result = await discoverWhatsAppAccounts('test-token');
assert.equal(result.accounts[0].connection_issue, null);
assert.equal(result.accounts[0].is_on_biz_app, true);
assert.equal(calls.filter(call => call.includes('subscribed_apps')).length, 1);

calls = fakeGraph({ wabas: [waba], phones: [connectedPhone], platformError: true });
result = await discoverWhatsAppAccounts('test-token');
assert.equal(result.accounts[0].connection_issue, 'platform_unknown');
assert.equal(calls.some(call => call.includes('subscribed_apps')), false);

calls = fakeGraph({ wabas: [waba], phoneError: true });
result = await discoverWhatsAppAccounts('test-token');
assert.equal(whatsAppIssueFromDiscovery(result), 'phone_lookup_failed');
assert.equal(calls.some(call => call.includes('subscribed_apps')), false);

console.log('WhatsApp OAuth readiness checks passed');
