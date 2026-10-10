import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../pay.html', import.meta.url), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match, 'Manual checkout inline script exists');
const script = match[1];

async function runClientPaymentPage({ paid = false, cancelled = false } = {}) {
  const token = 'a'.repeat(48);
  const events = { fetch: [], whop: [], mount: [], scripts: [] };
  const nodes = new Map();
  const getNode = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      id, textContent: '', hidden: id === 'checkout-host',
      className: '', style: {},
      appendChild() {}, replaceChildren() {},
    });
    return nodes.get(id);
  };
  const invoice = {
    ok: true, order_number: 'TQ-PAY-EXAMPLE-001', customer_name: 'Sandbox test',
    description: 'Pre-existing client payment', amount_sar: 250, currency: 'SAR',
    paid, cancelled, environment: 'production',
    session_id: 'ch_existing_configuration', plan_id: 'plan_existing',
  };
  const makeSdk = (options) => ({
    checkout: { create: (configuration) => {
      events.whop.push({ options, configuration });
      return { create: (name) => ({
        mount: (selector) => events.mount.push({ name, selector }),
      }) };
    } },
  });
  const windowMock = {};
  const context = {
    window: windowMock,
    document: {
      getElementById: getNode,
      documentElement: {},
      head: {
        appendChild(scriptNode) {
          events.scripts.push(scriptNode.src);
          windowMock.WhopElements = makeSdk;
          queueMicrotask(() => scriptNode.onload?.());
        },
      },
      createElement() {
        return { setAttribute() {}, src: '', async: false, onload: null, onerror: null };
      },
      addEventListener() {},
      hidden: false,
    },
    location: { search: '?t=' + token, href: 'https://www.tiqnora.com/pay?t=' + token },
    history: { replaceState() {} },
    URL, URLSearchParams, Intl, console, queueMicrotask,
    fetch: async (path, opts) => {
      events.fetch.push({ path, method: opts?.method || 'GET' });
      return { ok: true, json: async () => invoice };
    },
  };
  vm.runInNewContext(script, context, { filename: 'pay.html' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  return { events, nodes, context, token };
}

test('existing live customer checkout mounts Elements using original configuration without new order', async () => {
  const { events, nodes, token } = await runClientPaymentPage();
  assert.equal(events.fetch.length, 1);
  assert.equal(events.fetch[0].method, 'GET');
  assert.equal(events.fetch[0].path, '/api/payments/manual-link-public?token=' + token);
  assert.deepEqual(JSON.parse(JSON.stringify(events.whop)), [{
    options: { environment: 'production' },
    configuration: { checkoutConfiguration: 'ch_existing_configuration' },
  }]);
  assert.deepEqual(events.mount, [{ name: 'checkout', selector: '#checkout-host' }]);
  assert.equal(nodes.get('checkout-host').hidden, false);
  assert.match(nodes.get('amount').textContent, /250/);
  assert.equal(nodes.get('order').textContent, 'TQ-PAY-EXAMPLE-001');
});

test('already-paid customer link never mounts another payment form', async () => {
  const { events } = await runClientPaymentPage({ paid: true });
  assert.deepEqual(events.whop, []);
  assert.deepEqual(events.mount, []);
  assert.equal(events.fetch.length, 1);
});
