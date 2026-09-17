/* Tiqnora first-party + GA4 event bridge + commerce funnel */
(function () {
  const KEY = 'tiqnora_sid';
  function sid() {
    try {
      let s = localStorage.getItem(KEY);
      if (!s) { s = 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(KEY, s); }
      return s;
    } catch { return 'anon'; }
  }
  function utm() {
    const q = new URLSearchParams(location.search);
    return {
      utm_source: q.get('utm_source') || undefined,
      utm_medium: q.get('utm_medium') || undefined,
      utm_campaign: q.get('utm_campaign') || undefined
    };
  }
  async function send(event_name, properties = {}) {
    try {
      if (typeof gtag === 'function') {
        gtag('event', event_name, properties);
      }
    } catch (_) {}
    try {
      await window.TiqnoraDB?.ready?.();
      const db = window.TiqnoraDB?.raw;
      if (!db) return;
      await db.from('analytics_events').insert({
        event_name,
        path: location.pathname + location.search,
        session_id: sid(),
        properties: { ...utm(), ...properties, referrer: document.referrer || null }
      });
    } catch (_) {}
  }
  window.TiqnoraAnalytics = {
    track: send,
    pageView() { return send('page_view', { title: document.title }); },
    signup() { return send('sign_up'); },
    serviceRequest() { return send('service_request'); },
    aiDemo(agent) { return send('ai_demo', { agent }); },
    planClick(plan) { return send('plan_click', { plan }); },
    leadSubmit(source) { return send('generate_lead', { source }); },
    productView(slug, name, price) { return send('view_item', { slug, name, price, currency: 'SAR' }); },
    addToCart(slug, name, price, qty) { return send('add_to_cart', { slug, name, price, qty, currency: 'SAR' }); },
    beginCheckout(value, items) { return send('begin_checkout', { value, items, currency: 'SAR' }); },
    purchase(orderNumber, value, items) { return send('purchase', { order_number: orderNumber, value, items, currency: 'SAR' }); }
  };
  document.addEventListener('DOMContentLoaded', () => {
    window.TiqnoraAnalytics.pageView();
  });
})();
