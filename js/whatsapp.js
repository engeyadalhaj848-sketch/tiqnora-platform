/* Tiqnora WhatsApp helper + floating button */
(function () {
  function num() {
    const n = (window.TIQNORA_CONFIG && window.TIQNORA_CONFIG.whatsapp) || '966551341398';
    return String(n).replace(/[^\d]/g, '');
  }
  function link(message) {
    const text = encodeURIComponent(message || 'مرحباً، أريد معرفة المزيد عن عروض Tiqnora');
    return 'https://wa.me/' + num() + '?text=' + text;
  }
  function mountFloat(message) {
    if (document.getElementById('tiqnora-wa-float')) return;
    const a = document.createElement('a');
    a.id = 'tiqnora-wa-float';
    a.className = 'wa-float';
    a.href = link(message);
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'تواصل عبر واتساب');
    a.innerHTML = '💬 واتساب';
    a.addEventListener('click', function () {
      try { window.TiqnoraAnalytics && window.TiqnoraAnalytics.track && window.TiqnoraAnalytics.track('whatsapp_click', { source: 'float' }); } catch (_) {}
    });
    document.body.appendChild(a);
  }
  window.TiqnoraWhatsApp = { num: num, link: link, mountFloat: mountFloat };
  document.addEventListener('DOMContentLoaded', function () {
    const path = location.pathname || '';
    let msg = 'مرحباً، أريد معرفة المزيد عن عروض Tiqnora';
    if (path.indexOf('product') !== -1) msg = 'مرحباً، أريد الاستفسار عن هذا المنتج';
    else if (path.indexOf('checkout') !== -1) msg = 'أحتاج مساعدة في إكمال الطلب';
    else if (path.indexOf('national-day') !== -1) msg = 'مرحباً، أريد معرفة المزيد عن عروض اليوم الوطني';
    else if (path.indexOf('shop') !== -1) msg = 'مرحباً، أريد المساعدة في اختيار منتج من المتجر';
    mountFloat(msg);
  });
})();
