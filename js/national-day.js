(() => {
  const END = new Date('2026-09-30T23:59:59+03:00').getTime();
  const money = (n) => `${new Intl.NumberFormat('ar-SA').format(Number(n) || 0)} ر.س`;
  const esc = (s) =>
    String(s ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  const yearEl = document.querySelector('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  function tick() {
    const now = Date.now();
    let diff = Math.max(0, END - now);
    const days = Math.floor(diff / 86400000);
    diff -= days * 86400000;
    const hours = Math.floor(diff / 3600000);
    diff -= hours * 3600000;
    const mins = Math.floor(diff / 60000);
    diff -= mins * 60000;
    const secs = Math.floor(diff / 1000);
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(v).padStart(2, '0');
    };
    set('cd-days', days);
    set('cd-hours', hours);
    set('cd-mins', mins);
    set('cd-secs', secs);
  }
  tick();
  setInterval(tick, 1000);

  function renderCount() {
    const c = (window.TiqnoraStore?.getCart() || []).reduce((a, i) => a + i.qty, 0);
    const el = document.querySelector('#store-cart-count');
    if (el) el.textContent = c;
  }

  let all = [];
  let mode = 'research';

  function isCampaignProduct(p) {
    const tags = (p.keywords_ar || '') + ' ' + (p.keywords_en || '') + ' ' + (p.slug || '');
    const cat = p.categories?.slug || '';
    return (
      p.featured ||
      Number(p.discount_percent) > 0 ||
      /national|اليوم.?الوطني|nd96|saudi.?day/i.test(tags) ||
      cat === 'national-day' ||
      cat === 'offers'
    );
  }

  function finalPrice(p) {
    const disc = Number(p.discount_percent) || 0;
    return disc > 0 ? p.price * (1 - disc / 100) : p.price;
  }

  function render(filter) {
    const grid = document.querySelector('#nd-grid');
    if (!grid) return;
    let list = all.filter((p) => p.is_active && isCampaignProduct(p));
    if (filter === 'discount') list = list.filter((p) => Number(p.discount_percent) > 0);
    if (filter === 'featured') list = list.filter((p) => p.featured);

    if (!list.length) {
      // fallback: show any active products with discount or featured, else top active
      list = all.filter((p) => p.is_active && (p.featured || Number(p.discount_percent) > 0));
      if (!list.length) list = all.filter((p) => p.is_active).slice(0, 8);
    }

    grid.innerHTML = list.length
      ? list
          .map((p) => {
            const hasDisc = Number(p.discount_percent) > 0;
            const final = finalPrice(p);
            const out = p.track_stock && p.stock_quantity <= 0;
            const img = (p.images || [])[0];
            return `<a class="product-card nd-featured" href="product.html?slug=${encodeURIComponent(p.slug)}">
          ${out ? '<span class="badge out">غير متوفر</span>' : hasDisc ? `<span class="badge nd-sale">-${Math.round(p.discount_percent)}%</span>` : '<span class="badge nd-sale">عرض</span>'}
          <div class="product-thumb">${img ? `<img src="${esc(img)}" alt="${esc(p.name_ar)}" loading="lazy">` : '▣'}</div>
          <div class="product-body">
            <span class="p-cat">${esc(p.categories?.name_ar || 'عرض وطني')}</span>
            <h3>${esc(p.name_ar)}</h3>
            <span class="stock-note">${p.delivery_note_ar || (p.track_stock ? (p.stock_quantity > 0 ? `متوفر (${p.stock_quantity})` : 'نفدت الكمية') : 'متوفر')}</span>
            <div class="product-price"><strong>${money(final)}</strong>${hasDisc ? `<s>${money(p.price)}</s>` : ''}</div>
          </div></a>`;
          })
          .join('')
      : '<p style="color:var(--muted)">لا توجد عروض منشورة بعد. أضف منتجات مميزة أو بخصم من لوحة الإدارة.</p>';
  }

  function renderChips() {
    const row = document.querySelector('#nd-chips');
    if (!row) return;
    const chips = [
      { id: '', t: 'الكل' },
      { id: 'discount', t: 'بخصم' },
      { id: 'featured', t: 'مميز' },
      ];
    row.innerHTML = chips
      .map((c, i) => `<button type="button" class="chip${i === 0 ? ' active' : ''}" data-filter="${c.id}">${c.t}</button>`)
      .join('');
    row.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.onclick = () => {
        row.querySelectorAll('.chip').forEach((x) => x.classList.remove('active'));
        btn.classList.add('active');
        render(btn.dataset.filter);
      };
    });
  }

  async function loadProducts() {
    await window.TiqnoraDB?.ready?.();
    const rows = (await window.TiqnoraDB?.getProducts?.()) || [];
    all = Array.isArray(rows) ? rows : [];
    renderChips();
    render('');
    renderCount();
  }

  // AI commerce assistant
  document.querySelectorAll('.nd-ai-modes .chip').forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll('.nd-ai-modes .chip').forEach((x) => x.classList.remove('active'));
      btn.classList.add('active');
      mode = btn.dataset.mode || 'research';
    };
  });

  const sendBtn = document.querySelector('#nd-ai-send');
  const input = document.querySelector('#nd-ai-input');
  const out = document.querySelector('#nd-ai-out');

  if (sendBtn && input && out) {
    sendBtn.onclick = async () => {
      const message = input.value.trim();
      if (!message) return;
      sendBtn.disabled = true;
      sendBtn.textContent = 'جارٍ التحليل…';
      out.hidden = false;
      out.textContent = '…';
      try {
        const res = await fetch('/api/commerce/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, message }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'فشل الطلب');
        out.textContent = data.reply || data.message || 'تم.';
      } catch (e) {
        out.textContent = e.message || 'تعذر الاتصال بمساعد التجارة.';
      } finally {
        sendBtn.disabled = false;
        sendBtn.textContent = 'إرسال للوكيل';
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadProducts);
  } else {
    loadProducts();
  }
})();
