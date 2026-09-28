import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  TIQNORA_YCLOUD_TEMPLATE_PRESETS,
  normalizeYCloudTemplateList,
  ensureYCloudTemplatePresets,
  sendYCloudTemplateMessage
} from '../lib/integrations/ycloud-templates.js';

describe('YCloud WhatsApp template presets', () => {
  it('defines Arabic marketing templates including the website design campaign', () => {
    assert.equal(TIQNORA_YCLOUD_TEMPLATE_PRESETS.length, 4);
    for (const template of TIQNORA_YCLOUD_TEMPLATE_PRESETS) {
      assert.equal(template.language, 'ar');
      assert.equal(template.category, 'MARKETING');
      const body = template.components.find(x => x.type === 'BODY');
      assert.ok(body);
      assert.ok(body.text.includes('{{1}}'));
    }
    const website = TIQNORA_YCLOUD_TEMPLATE_PRESETS.find(x => x.name === 'tiqnora_web_design_intro_ar');
    assert.ok(website);
    assert.ok(website.components.find(x => x.type === 'BODY').text.includes('{{2}}'));
    const buttons = website.components.find(x => x.type === 'BUTTONS');
    assert.ok(buttons?.buttons?.some(x => x.url === 'https://www.tiqnora.com/services/web-design'));
  });

  it('normalizes YCloud paginated template responses', () => {
    const rows = normalizeYCloudTemplateList({
      items: [{
        officialTemplateId: 'tpl_1',
        wabaId: 'waba_1',
        name: 'tiqnora_building_intro_ar',
        language: 'ar',
        category: 'MARKETING',
        status: 'PENDING',
        components: [{ type: 'BODY', text: 'x' }]
      }]
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].official_template_id, 'tpl_1');
    assert.equal(rows[0].status, 'PENDING');
  });

  it('creates only missing presets and never sends customer messages', async () => {
    const previousKey = process.env.YCLOUD_API_KEY;
    const previousFetch = globalThis.fetch;
    process.env.YCLOUD_API_KEY = 'test-key';
    const requests = [];
    globalThis.fetch = async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (!options.method || options.method === 'GET') {
        return { ok: true, status: 200, json: async () => ({ items: [] }) };
      }
      const body = JSON.parse(options.body || '{}');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          officialTemplateId: 'tpl_' + body.name,
          wabaId: body.wabaId,
          name: body.name,
          language: body.language,
          category: body.category,
          status: 'PENDING',
          components: body.components
        })
      };
    };
    try {
      const out = await ensureYCloudTemplatePresets('waba-test');
      assert.equal(out.length, 4);
      assert.equal(requests.filter(x => x.options.method === 'POST').length, 4);
      assert.ok(out.every(x => x.status === 'PENDING'));
    } finally {
      globalThis.fetch = previousFetch;
      if (previousKey === undefined) delete process.env.YCLOUD_API_KEY;
      else process.env.YCLOUD_API_KEY = previousKey;
    }
  });

  it('sends the approved-template payload shape through YCloud client', async () => {
    const previousKey = process.env.YCLOUD_API_KEY;
    const previousFetch = globalThis.fetch;
    process.env.YCLOUD_API_KEY = 'test-key';
    let captured = null;
    globalThis.fetch = async (url, options = {}) => {
      captured = { url: String(url), body: JSON.parse(options.body || '{}') };
      return { ok: true, status: 200, json: async () => ({ id: 'msg_1', status: 'accepted' }) };
    };
    try {
      const result = await sendYCloudTemplateMessage({
        from: '+966551341398',
        to: '+966500000000',
        name: 'tiqnora_building_intro_ar',
        language: 'ar',
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'شركة تجريبية' }] }]
      });
      assert.equal(result.id, 'msg_1');
      assert.equal(captured.body.type, 'template');
      assert.equal(captured.body.template.name, 'tiqnora_building_intro_ar');
      assert.equal(captured.body.template.language.code, 'ar');
    } finally {
      globalThis.fetch = previousFetch;
      if (previousKey === undefined) delete process.env.YCLOUD_API_KEY;
      else process.env.YCLOUD_API_KEY = previousKey;
    }
  });
});
