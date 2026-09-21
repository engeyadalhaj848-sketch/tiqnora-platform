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

  function addConnectionCard(view) {
    const card = addCard(view, 'ربط المنصات', 'اربط الحساب الرسمي عبر OAuth الآمن. لا يتم عرض أو حفظ أي Access Token داخل المتصفح.');
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-top:14px';
    const platforms = [
      ['meta', 'Meta / Facebook / Instagram', 'ربط الصفحات وحساب Instagram والرسائل والتعليقات'],
      ['whatsapp', 'WhatsApp Cloud', 'استقبال الرسائل عبر WhatsApp Cloud API'],
      ['tiktok', 'TikTok', 'تسجيل الدخول وتجهيز مسودة فيديو للمراجعة'],
      ['linkedin', 'LinkedIn', 'ربط الحساب الشخصي أو صفحة الشركة حسب الصلاحيات']
    ];
    platforms.forEach(([key, title, description]) => {
      const item = document.createElement('div');
      item.style.cssText = 'border:1px solid var(--border,rgba(255,255,255,.12));border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px';
      const h = document.createElement('strong'); h.textContent = title; item.appendChild(h);
      const p = document.createElement('small'); p.className = 'card-desc'; p.textContent = description; item.appendChild(p);
      const button = document.createElement('button');
      button.className = 'btn-sm';
      button.textContent = 'ربط الحساب';
      button.type = 'button';
      button.dataset.connectPlatform = key;
      button.onclick = () => {
        button.disabled = true;
        button.textContent = 'جارٍ فتح OAuth…';
        const organizationId = window.TiqnoraDB?.organizationId || '';
        const query = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : '';
        window.location.href = `/api/social/oauth/${key}${query}`;
      };
      item.appendChild(button);
      grid.appendChild(item);
    });
    card.appendChild(grid);
    const note = document.createElement('p');
    note.className = 'card-desc';
    note.style.marginTop = '12px';
    note.textContent = 'إذا ظهر خطأ إعداد، أضف بيانات التطبيق المطلوبة في Vercel Environment Variables ثم أعد المحاولة.';
    card.appendChild(note);
  }

  function addTikTokUploadCard(view, db) {
    const card = addCard(
      view,
      'إرسال فيديو إلى TikTok',
      'اختر فيديو من جهازك وسيُرسل كمسودة إلى حساب TikTok المرتبط. بعد وصوله افتح إشعار TikTok لإكمال التحرير والنشر.'
    );

    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:grid;gap:12px;margin-top:14px';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';
    input.style.maxWidth = '100%';
    wrap.appendChild(input);

    const meta = document.createElement('small');
    meta.className = 'card-desc';
    meta.textContent = 'الصيغ المدعومة: MP4 / MOV / WebM — الحد الأقصى 4GB.';
    wrap.appendChild(meta);

    const progress = document.createElement('progress');
    progress.max = 100;
    progress.value = 0;
    progress.style.cssText = 'width:100%;height:14px;display:none';
    wrap.appendChild(progress);

    const status = document.createElement('div');
    status.className = 'card-desc';
    status.style.cssText = 'min-height:22px;white-space:pre-wrap';
    wrap.appendChild(status);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    const sendBtn = document.createElement('button');
    sendBtn.className = 'btn-sm';
    sendBtn.type = 'button';
    sendBtn.textContent = 'إرسال كمسودة إلى TikTok';
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn-sm';
    refreshBtn.type = 'button';
    refreshBtn.textContent = 'تحديث سجل الإرسال';
    actions.append(sendBtn, refreshBtn);
    wrap.appendChild(actions);

    const historyWrap = document.createElement('div');
    historyWrap.style.overflow = 'auto';
    wrap.appendChild(historyWrap);
    card.appendChild(wrap);

    const formatBytes = (n) => {
      const x = Number(n) || 0;
      if (x < 1024 * 1024) return (x / 1024).toFixed(1) + ' KB';
      if (x < 1024 * 1024 * 1024) return (x / (1024 * 1024)).toFixed(1) + ' MB';
      return (x / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
    };

    const api = async (payload) => {
      const { data: { session } } = await db.auth.getSession();
      if (!session?.access_token) throw new Error('انتهت جلسة الإدارة. سجّل الدخول مرة أخرى.');
      const r = await fetch('/api/social/oauth/tiktok', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`
        },
        body: JSON.stringify(payload)
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        const err = new Error(body.error || 'تعذر تنفيذ طلب TikTok');
        err.code = body.code;
        throw err;
      }
      return body;
    };

    const normalizeMime = (file) => {
      if (['video/mp4', 'video/quicktime', 'video/webm'].includes(file.type)) return file.type;
      const name = String(file.name || '').toLowerCase();
      if (name.endsWith('.mp4')) return 'video/mp4';
      if (name.endsWith('.mov')) return 'video/quicktime';
      if (name.endsWith('.webm')) return 'video/webm';
      return '';
    };

    const renderHistory = async () => {
      try {
        const data = await api({ action: 'history' });
        const rows = data.jobs || [];
        if (!rows.length) {
          historyWrap.innerHTML = '<div class="card-desc">لا توجد عمليات إرسال إلى TikTok حتى الآن.</div>';
          return;
        }
        const labels = {
          uploading: 'جارٍ الرفع',
          processing: 'قيد المعالجة',
          send_to_user_inbox: 'وصل إلى TikTok',
          inbox_delivered: 'وصل إلى TikTok',
          publish_complete: 'مكتمل',
          completed: 'مكتمل',
          failed: 'فشل'
        };
        historyWrap.innerHTML = '<table><thead><tr><th>الفيديو</th><th>الحالة</th><th>الحجم</th><th>الوقت</th></tr></thead><tbody>' +
          rows.map(j => {
            const st = String(j.status || '');
            return `<tr><td>${String(j.file_name || 'فيديو').replaceAll('<','&lt;').replaceAll('>','&gt;')}</td><td>${labels[st] || st || '—'}${j.error_message ? '<br><small>' + String(j.error_message).replaceAll('<','&lt;').replaceAll('>','&gt;') + '</small>' : ''}</td><td dir="ltr">${formatBytes(j.media_size)}</td><td>${new Date(j.created_at).toLocaleString('ar-SA')}</td></tr>`;
          }).join('') + '</tbody></table>';
      } catch (e) {
        historyWrap.innerHTML = '<div class="card-desc">تعذر تحميل سجل TikTok: ' + e.message + '</div>';
      }
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    sendBtn.onclick = async () => {
      const file = input.files?.[0];
      if (!file) {
        status.textContent = 'اختر ملف فيديو أولًا.';
        return;
      }
      const mime = normalizeMime(file);
      if (!mime) {
        status.textContent = 'الصيغة غير مدعومة. استخدم MP4 أو MOV أو WebM.';
        return;
      }
      if (file.size > 4 * 1024 * 1024 * 1024) {
        status.textContent = 'حجم الفيديو أكبر من حد TikTok البالغ 4GB.';
        return;
      }

      sendBtn.disabled = true;
      refreshBtn.disabled = true;
      input.disabled = true;
      progress.style.display = 'block';
      progress.value = 0;
      status.textContent = 'جارٍ تجهيز الرفع الآمن إلى TikTok…';

      let init = null;
      try {
        init = await api({
          action: 'init_upload',
          file_name: file.name,
          mime_type: mime,
          video_size: file.size
        });

        const chunkSize = Number(init.chunk_size);
        const totalChunks = Number(init.total_chunk_count);
        let offset = 0;

        for (let i = 0; i < totalChunks; i += 1) {
          const isLast = i === totalChunks - 1;
          const endExclusive = isLast ? file.size : Math.min(file.size, offset + chunkSize);
          const chunk = file.slice(offset, endExclusive, mime);
          status.textContent = `جارٍ رفع الجزء ${i + 1} من ${totalChunks}…`;

          const uploadRes = await fetch(init.upload_url, {
            method: 'PUT',
            headers: {
              'Content-Type': mime,
              'Content-Range': `bytes ${offset}-${endExclusive - 1}/${file.size}`
            },
            body: chunk
          });

          if (!uploadRes.ok) {
            const detail = await uploadRes.text().catch(() => '');
            throw new Error(`TikTok رفض جزء الرفع (${uploadRes.status})${detail ? ': ' + detail.slice(0, 180) : ''}`);
          }

          offset = endExclusive;
          progress.value = Math.round((offset / file.size) * 100);
        }

        await api({ action: 'mark_uploaded', job_id: init.job_id });
        status.textContent = 'تم رفع الفيديو. TikTok يعالجه الآن…';

        let latest = null;
        for (let attempt = 0; attempt < 4; attempt += 1) {
          await sleep(attempt === 0 ? 1200 : 2200);
          latest = await api({
            action: 'status',
            publish_id: init.publish_id,
            job_id: init.job_id
          });
          const st = String(latest.status || '').toLowerCase();
          if (st.includes('fail') || st.includes('inbox') || st.includes('complete')) break;
        }

        const st = String(latest?.status || '').toLowerCase();
        if (st.includes('fail')) {
          throw new Error(latest?.fail_reason || 'فشل TikTok في معالجة الفيديو.');
        }

        progress.value = 100;
        status.textContent = '✅ تم إرسال الفيديو إلى TikTok. افتح تطبيق TikTok > صندوق الوارد لإكمال التحرير والنشر.';
        input.value = '';
        await renderHistory();
      } catch (e) {
        if (e.code === 'reauthorize_required') {
          status.textContent = 'يلزم تحديث تفويض TikTok مرة واحدة لحفظ صلاحية طويلة الأمد. اضغط زر «متصل — Tiqnora Ai» بالأعلى ثم وافق على الصلاحيات.';
        } else if (e.code === 'scope_not_authorized') {
          status.textContent = 'صلاحية video.upload غير مفعلة على الحساب. أعد ربط TikTok ووافق على صلاحية رفع الفيديو.';
        } else {
          status.textContent = '❌ ' + e.message;
        }
        if (init?.job_id) {
          try { await renderHistory(); } catch {}
        }
      } finally {
        sendBtn.disabled = false;
        refreshBtn.disabled = false;
        input.disabled = false;
      }
    };

    refreshBtn.onclick = renderHistory;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      meta.textContent = `${file.name} — ${formatBytes(file.size)}`;
      progress.value = 0;
      status.textContent = '';
    };

    renderHistory();
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

    addConnectionCard(root);
    addTikTokUploadCard(root, db);
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

      const connectionRows = connectionsRes.data || [];
      const activeByPlatform = new Map();
      connectionRows.forEach(item => {
        const key = String(item.platform || '').toLowerCase();
        if (!activeByPlatform.has(key) || item.status === 'active') activeByPlatform.set(key, item);
      });
      root.querySelectorAll('[data-connect-platform]').forEach(button => {
        const key = String(button.dataset.connectPlatform || '').toLowerCase();
        const connection = activeByPlatform.get(key);
        if (connection?.status === 'active') {
          button.textContent = `متصل ✓${connection.account_name ? ' — ' + connection.account_name : ''}`;
          button.title = 'الحساب مرتبط بنجاح. اضغط لإعادة التفويض إذا احتجت.';
        } else {
          button.textContent = 'ربط الحساب';
          button.title = '';
        }
        button.disabled = false;
      });

      connectionTable.body.replaceChildren();
      connectionRows.forEach(item => {
        const row = document.createElement('tr');
        addCell(row, item.platform); addCell(row, item.account_name); addCell(row, item.external_account_id, 'ltr');
        addCell(row, labels[item.status] || item.status); addCell(row, dateText(item.connected_at || item.created_at));
        connectionTable.body.appendChild(row);
      });
      if (!connectionRows.length) { const row = document.createElement('tr'); const cell = addCell(row, 'لا توجد اتصالات محفوظة بعد.'); cell.colSpan = 5; connectionTable.body.appendChild(row); }

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
