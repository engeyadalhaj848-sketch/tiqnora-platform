/* Tiqnora Social Inbox administration controls */
(() => {
  let loading = false;

  const labels = {
    active: 'Active', pending: 'Pending', expired: 'Expired', disabled: 'Disabled', error: 'Error',
    new: 'جديد', matched: 'مطابق', processed: 'تمت المعالجة', ignored: 'متجاهل', failed: 'فشل'
  };

  const text = (value) => value == null || value === '' ? '—' : String(value);
  const dateText = (value) => value ? new Date(value).toLocaleString('ar-SA') : '—';

  function addCell(row, value, dir) {
    const cell = document.createElement('td');
    cell.textContent = text(value);
    if (dir) cell.dir = dir;
    row.appendChild(cell);
    return cell;
  }

  function makeTable(headers) {
    const wrap = document.createElement('div');
    wrap.style.overflow = 'auto';
    const table = document.createElement('table');
    const head = document.createElement('thead');
    const row = document.createElement('tr');
    headers.forEach(label => { const th = document.createElement('th'); th.textContent = label; row.appendChild(th); });
    head.appendChild(row); table.appendChild(head);
    const body = document.createElement('tbody'); table.appendChild(body); wrap.appendChild(table);
    return { wrap, body };
  }

  function addCard(view, title, description) {
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h2'); h.textContent = title; card.appendChild(h);
    if (description) { const p = document.createElement('p'); p.className = 'card-desc'; p.textContent = description; card.appendChild(p); }
    view.appendChild(card);
    return card;
  }

  async function mount() {
    if (loading || location.hash !== '#social-inbox' || document.getElementById('social-admin-extra')) return;
    const view = document.getElementById('view');
    const db = window.TiqnoraDB?.raw;
    if (!view || !db) return;
    loading = true;

    const root = document.createElement('div');
    root.id = 'social-admin-extra';
    view.appendChild(root);

    const webhookCard = addCard(root, 'إعداد Webhook', 'نقطة دخول واحدة لكل المنصات، ويحدد Adapter طريقة تطبيع الحدث.');
    const webhook = document.createElement('code');
    webhook.dir = 'ltr'; webhook.style.wordBreak = 'break-all'; webhook.textContent = `${location.origin}/api/social/webhook?platform=meta`;
    webhookCard.appendChild(webhook);
    const hint = document.createElement('p'); hint.className = 'card-desc';
    hint.textContent = 'Verify Token يجب أن يطابق META_WEBHOOK_VERIFY_TOKEN في Vercel. اختبار المنصات المستقبلية يستخدم نفس المسار مع platform=<name> وهيدر x-tiqnora-webhook-secret.';
    webhookCard.appendChild(hint);

    const connectionsCard = addCard(root, 'الاتصالات الحالية', 'الحالة تأتي من social_connections بدون جداول منفصلة لكل منصة.');
    const connectionTable = makeTable(['المنصة', 'الحساب', 'External ID', 'الحالة', 'تاريخ الربط']);
    connectionsCard.appendChild(connectionTable.wrap);

    const rulesCard = addCard(root, 'قواعد الأتمتة', 'يمكن تفعيل القاعدة والرد التلقائي أو إيقافهما من هنا.');
    const rulesTable = makeTable(['القاعدة', 'Match', 'Intent', 'الحالة', 'Auto Reply']);
    rulesCard.appendChild(rulesTable.wrap);

    const eventsCard = addCard(root, 'فلترة الأحداث بالتاريخ', 'الفلاتر الأساسية للمنصة والحالة والنية موجودة أعلى الصفحة.');
    const dateInput = document.createElement('input'); dateInput.type = 'date'; dateInput.id = 'social-date-filter'; eventsCard.appendChild(dateInput);
    const eventsTable = makeTable(['المنصة', 'العميل', 'المحتوى', 'النية', 'الحالة', 'وقت الاستلام']);
    eventsCard.appendChild(eventsTable.wrap);

    async function refresh() {
      const [connectionsRes, rulesRes, eventsRes] = await Promise.all([
        db.from('social_connections').select('*').order('created_at', { ascending: false }),
        db.from('social_automation_rules').select('*').order('created_at', { ascending: true }),
        db.from('social_events').select('*').order('received_at', { ascending: false }).limit(250)
      ]);

      connectionTable.body.replaceChildren();
      (connectionsRes.data || []).forEach(item => {
        const row = document.createElement('tr');
        addCell(row, item.platform); addCell(row, item.account_name); addCell(row, item.external_account_id, 'ltr');
        addCell(row, labels[item.status] || item.status); addCell(row, dateText(item.connected_at || item.created_at));
        connectionTable.body.appendChild(row);
      });
      if (!(connectionsRes.data || []).length) { const row = document.createElement('tr'); const cell = addCell(row, 'لا توجد اتصالات محفوظة بعد.'); cell.colSpan = 5; connectionTable.body.appendChild(row); }

      rulesTable.body.replaceChildren();
      (rulesRes.data || []).forEach(rule => {
        const row = document.createElement('tr');
        addCell(row, rule.name); addCell(row, rule.match_mode); addCell(row, rule.intent, 'ltr');
        const activeCell = document.createElement('td');
        const activeBtn = document.createElement('button'); activeBtn.className = 'btn-sm'; activeBtn.textContent = rule.is_active ? 'إيقاف' : 'تفعيل';
        activeBtn.onclick = async () => { activeBtn.disabled = true; await db.from('social_automation_rules').update({ is_active: !rule.is_active, updated_at: new Date().toISOString() }).eq('id', rule.id); await refresh(); };
        activeCell.appendChild(activeBtn); row.appendChild(activeCell);
        const replyCell = document.createElement('td');
        const replyBtn = document.createElement('button'); replyBtn.className = 'btn-sm'; replyBtn.textContent = rule.auto_reply ? 'إيقاف الرد' : 'تشغيل الرد';
        replyBtn.onclick = async () => { replyBtn.disabled = true; await db.from('social_automation_rules').update({ auto_reply: !rule.auto_reply, updated_at: new Date().toISOString() }).eq('id', rule.id); await refresh(); };
        replyCell.appendChild(replyBtn); row.appendChild(replyCell);
        rulesTable.body.appendChild(row);
      });

      const allEvents = eventsRes.data || [];
      const renderEvents = () => {
        const wantedDate = dateInput.value;
        eventsTable.body.replaceChildren();
        allEvents.filter(item => !wantedDate || String(item.received_at || '').slice(0, 10) === wantedDate).forEach(item => {
          const row = document.createElement('tr');
          addCell(row, item.platform); addCell(row, item.author_name); addCell(row, item.content); addCell(row, item.intent, 'ltr');
          addCell(row, labels[item.processing_status] || item.processing_status); addCell(row, dateText(item.received_at));
          eventsTable.body.appendChild(row);
        });
      };
      dateInput.onchange = renderEvents;
      renderEvents();
    }

    await refresh();
    loading = false;
  }

  window.addEventListener('hashchange', () => setTimeout(mount, 150));
  setInterval(mount, 700);
})();
