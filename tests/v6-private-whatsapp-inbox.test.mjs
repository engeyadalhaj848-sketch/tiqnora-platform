import test from 'node:test';
import assert from 'node:assert/strict';
import { excludedWhatsAppPeer, isExcludedWhatsAppEvent } from '../api/social/webhook.js';

const peer = '+966512345678';

test('private WhatsApp lookup consistently identifies inbound, delivery, and outbound echo peers', () => {
  assert.equal(excludedWhatsAppPeer({ platform: 'whatsapp', author_external_id: peer }), peer);
  assert.equal(excludedWhatsAppPeer({ platform: 'whatsapp', event_type: 'message.status.read', author_external_id: '966512345678' }), peer);
  assert.equal(excludedWhatsAppPeer({
    platform: 'whatsapp', author_external_id: 'tiqnora',
    raw_payload: { kind: 'app_echo', message: { to: peer } }
  }), peer);
  assert.equal(excludedWhatsAppPeer({ platform: 'instagram', author_external_id: peer }), null);
});

test('a marked WhatsApp contact is excluded before CRM writes or autoresponders', async () => {
  let calls = 0;
  const privateRest = async (path) => {
    calls++;
    assert.match(path, /organization_id=eq.org-test/);
    assert.match(path, /external_thread_id=eq.dm%3A%2B966512345678/);
    return [{ metadata: { private_excluded: true } }];
  };
  assert.equal(await isExcludedWhatsAppEvent({ platform: 'whatsapp', author_external_id: peer }, 'org-test', privateRest), true);
  assert.equal(calls, 1);
  assert.equal(await isExcludedWhatsAppEvent({ platform: 'facebook', author_external_id: peer }, 'org-test', privateRest), false);
  assert.equal(calls, 1);
});

test('other WhatsApp contacts remain enabled', async () => {
  const active = async () => [{ metadata: { private_excluded: false } }];
  assert.equal(await isExcludedWhatsAppEvent({ platform: 'whatsapp', author_external_id: peer }, 'org-test', active), false);
});

test('privacy lookup errors block webhook ingestion (fail closed)', async () => {
  await assert.rejects(
    isExcludedWhatsAppEvent({ platform: 'whatsapp', author_external_id: peer }, 'org-test', async () => { throw new Error('database unavailable'); }),
    /database unavailable/
  );
});
