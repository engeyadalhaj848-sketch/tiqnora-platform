import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pay = readFileSync(new URL('../pay.html', import.meta.url), 'utf8');
const shop = readFileSync(new URL('../checkout.html', import.meta.url), 'utf8');

test('manual payment link URL, lookup, and bilingual copy are preserved', () => {
  assert.match(pay, /get\('t'\)/);
  assert.match(pay, /manual-link-public\?token=/);
  assert.match(pay, /new URLSearchParams\(location\.search\)\.get\('lang'\)/);
  assert.match(pay, /'ar'/);
  assert.match(pay, /'en'/);
  assert.match(pay, /invoice\.amount_sar/);
  assert.match(pay, /data\.order_number/);
});

test('legacy Whop embed is removed from both active checkouts', () => {
  for (const html of [pay, shop]) {
    assert.doesNotMatch(html, /js\.whop\.com\/static\/checkout\/loader\.js/);
    assert.doesNotMatch(html, /Whop\.loadCheckout/);
    assert.match(html, /cdn\.whop\.com\/elements\/amber\/elements\.js/);
  }
});

test('existing server-created checkout configuration remains the source of price', () => {
  assert.match(pay, /checkoutOptions=session\s*\?\s*\{checkoutConfiguration:session\}\s*:\s*\{plan\}/);
  assert.match(shop, /sessionId\s*\?\s*\{\s*checkoutConfiguration:\s*sessionId\s*\}\s*:\s*\{\s*plan:\s*planId\s*\}/);
  assert.doesNotMatch(pay, /initial_price\s*[:=]/);
  assert.doesNotMatch(shop, /checkout\.create\(\{\s*amount\s*:/);
});

test('storefront retry reuses existing pending configuration instead of new order', () => {
  assert.match(shop, /lastWhop\?\.whop\?\.sessionId\s*&&\s*!checkoutMounted/);
  assert.match(shop, /await mountWhop\(lastWhop\.whop\.sessionId/);
  assert.match(shop, /await mountWhop\(data\.whop\.sessionId/);
  assert.match(shop, /api\/payments\/create-checkout/);
});

test('payment verification remains server-side, never via client-only paid flag', () => {
  assert.match(pay, /manual-link-public\?token=/);
  assert.match(shop, /التأكيد النهائي بعد التحقق من بوابة الدفع/);
  assert.doesNotMatch(pay, /window\.TiqnoraAnalytics\?\.purchase/);
});
