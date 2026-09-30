import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESIGN_FORMATS,
  VISUAL_GUIDELINES,
  buildArtDirection,
  runQualityGate,
  isImageDesignRequest,
  buildDesignReviewCaption,
  designReviewKeyboard
} from '../lib/v6/image-designer.js';

describe('image-designer core', () => {
  it('exposes three social formats', () => {
    assert.equal(DESIGN_FORMATS.length, 3);
    assert.deepEqual(
      DESIGN_FORMATS.map((f) => `${f.width}x${f.height}`),
      ['1080x1080', '1080x1350', '1080x1920']
    );
  });

  it('has visual guidelines for required verticals', () => {
    for (const key of [
      'web_design', 'ai_agents', 'social_automation', 'crm', 'whatsapp_automation',
      'ecommerce', 'it_networking', 'cyber_technology', 'saudi_b2b'
    ]) {
      assert.ok(VISUAL_GUIDELINES[key], `missing guideline ${key}`);
    }
  });

  it('detects design requests', () => {
    assert.equal(isImageDesignRequest('تصميم منشور عن المواقع'), true);
    assert.equal(isImageDesignRequest('ما هو الطقس؟'), false);
  });

  it('builds art direction without Arabic in diffusion prompt', () => {
    const art = buildArtDirection({
      message: 'تصميم المواقع الإلكترونية والمتاجر الإلكترونية — Tiqnora AI',
      campaign: {},
      vertical: 'web_design',
      brand: {
        brand_name: 'Tiqnora AI',
        visual_identity: {
          colors: { electric_blue: '#0A5CFF', cyber_cyan: '#00D2FF', midnight_navy: '#060B1E' }
        }
      },
      format: DESIGN_FORMATS[0]
    });
    assert.match(art.prompt, /midnight navy/i);
    assert.match(art.prompt, /do not render any text/i);
    assert.ok(art.overlay.headline_ar);
    assert.ok(art.overlay.cta_ar);
    assert.equal(art.prompt_version, 'tiqnora-art-v2');
  });

  it('quality gate fails without image bytes', () => {
    const gate = runQualityGate({}, { prompt: 'midnight navy test' });
    assert.equal(gate.ok, false);
    assert.ok(gate.failures.includes('missing_image_bytes'));
  });

  it('quality gate passes with bytes', () => {
    const gate = runQualityGate(
      { b64: 'abc', width: 1024, height: 1024, provider: 'openai' },
      { prompt: 'includes midnight navy palette' }
    );
    assert.equal(gate.ok, true);
  });

  it('design review caption and keyboard', () => {
    const caption = buildDesignReviewCaption({
      campaign: { name: 'Test', platform: 'instagram' },
      format: DESIGN_FORMATS[0],
      version: 1
    });
    assert.match(caption, /Design Review/);
    assert.match(caption, /pending_approval/);
    const kb = designReviewKeyboard('img_test');
    assert.equal(kb.inline_keyboard[0].length, 3);
  });
});
