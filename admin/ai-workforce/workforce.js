(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const app = $('#workforce-app');
  let db, me, org, agents = [], selectedAgent = null;
  let activeRecognition = null;
  const state = { counts: {}, conversations: [], tasks: [], memory: [], voiceCandidates: [], voiceCalls: [] };
  const labels = {
    manager: ['إدارة الوكلاء', 'MG', '#8bc6ff'],
    assistant: ['مساعد تنفيذي', 'AI', '#6de8dc'],
    'voice-agent': ['وكيل صوتي', 'VO', '#00d2ff'],
    marketing: ['تسويق ونمو', 'MA', '#6de8dc'],
    sales: ['مبيعات', 'SA', '#efc875'],
    ads: ['إعلانات', 'AD', '#ff9d76'],
    channel: ['تحليل القنوات', 'CH', '#8bc6ff'],
    content: ['محتوى وSEO', 'CO', '#efc875'],
    'social-media': ['تواصل اجتماعي', 'SM', '#b399ff'],
    'image-designer': ['تصميم صور', 'ID', '#ff9bc2'],
    'video-designer': ['تصميم فيديو', 'VD', '#ffb676'],
    developer: ['تقنية وهندسة', 'CT', '#76e6a1'],
    commerce: ['تجارة ومنتجات', 'CM', '#7aa7ff']
  };
  const statusAr = { todo:'جديدة', in_progress:'قيد التنفيذ', blocked:'متوقفة', done:'مكتملة', cancelled:'ملغاة' };
  const priorityAr = { low:'منخفضة', medium:'متوسطة', high:'عالية', urgent:'عاجلة' };

  function toast(message, ok = true) {
    const el = $('#toast'); el.textContent = message; el.style.borderColor = ok ? 'var(--accent)' : 'var(--danger)';
    el.classList.add('show'); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  function isVoiceAgent() {
    return String(selectedAgent?.slug || '') === 'voice-agent';
  }
  function recognitionCtor() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }
  function stopVoiceOutput() {
    try { window.speechSynthesis?.cancel(); } catch {}
  }
  function stopVoiceSession() {
    if (activeRecognition) {
      try { activeRecognition.abort(); } catch {}
      activeRecognition = null;
    }
    stopVoiceOutput();
  }
  function speakArabic(value) {
    if (!isVoiceAgent() || !('speechSynthesis' in window)) return;
    const text = String(value || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[\*_#`>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
    if (!text) return;
    stopVoiceOutput();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 1;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices?.() || [];
    utterance.voice = voices.find(v => /^ar[-_]?SA$/i.test(v.lang || ''))
      || voices.find(v => /^ar/i.test(v.lang || ''))
      || null;
    window.speechSynthesis.speak(utterance);
  }
  function startVoiceInput() {
    if (!isVoiceAgent()) return;
    const Ctor = recognitionCtor();
    const input = $('#chat-input');
    const button = $('#voice-mic');
    if (!Ctor || !input || !button) {
      toast('التعرّف الصوتي غير مدعوم في هذا المتصفح. استخدم Chrome أو Edge محدثًا.', false);
      return;
    }
    if (activeRecognition) {
      try { activeRecognition.stop(); } catch {}
      return;
    }
    stopVoiceOutput();
    const recognition = new Ctor();
    activeRecognition = recognition;
    recognition.lang = 'ar-SA';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    let finalText = '';
    const originalPlaceholder = input.placeholder;
    const reset = () => {
      activeRecognition = null;
      if (button) {
        button.dataset.listening = 'false';
        button.textContent = '🎙 تحدث';
        button.setAttribute('aria-pressed', 'false');
      }
      if (input) input.placeholder = originalPlaceholder;
    };
    recognition.onstart = () => {
      button.dataset.listening = 'true';
      button.textContent = '⏹ إيقاف';
      button.setAttribute('aria-pressed', 'true');
      input.placeholder = 'أسمعك الآن…';
    };
    recognition.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i]?.[0]?.transcript || '';
        if (event.results[i].isFinal) finalText += transcript + ' ';
        else interim += transcript;
      }
      input.value = (finalText + interim).trim();
    };
    recognition.onerror = event => {
      if (!['aborted', 'no-speech'].includes(event.error)) {
        const msg = event.error === 'not-allowed'
          ? 'اسمح للمتصفح باستخدام الميكروفون ثم جرّب مرة أخرى.'
          : 'تعذر التقاط الصوت: ' + event.error;
        toast(msg, false);
      }
    };
    recognition.onend = () => {
      const shouldSend = Boolean(finalText.trim() && input.value.trim());
      reset();
      if (shouldSend) $('#chat-form')?.requestSubmit();
    };
    try { recognition.start(); }
    catch (error) { reset(); toast(error.message || 'تعذر تشغيل الميكروفون', false); }
  }
  function showError(title, message, action = '') {
    app.className = 'boot-screen';
    app.innerHTML = `<div class="error-card"><h1>${esc(title)}</h1><p>${esc(message)}</p>${action}</div>`;
  }
  async function boot() {
    if (!window.TiqnoraDB?.isConfigured) return showError('قاعدة البيانات غير متصلة', 'أكمل إعداد Supabase أولًا.');
    await window.TiqnoraDB.ready(); db = window.TiqnoraDB.raw;
    if (!db) return showError('تعذر تحميل الاتصال', 'تحقق من الشبكة ثم أعد المحاولة.', '<button class="btn" onclick="location.reload()">إعادة المحاولة</button>');
    const { data: { session } } = await db.auth.getSession();
    if (!session) return showError('يلزم تسجيل الدخول', 'هذه مساحة داخلية خاصة بإدارة Tiqnora.', '<a class="btn btn-primary" href="/admin.html" style="display:inline-block;text-decoration:none">دخول لوحة التحكم</a>');
    const { data: profile, error } = await db.from('profiles').select('*').eq('id', session.user.id).single();
    if (error || !profile || !['admin','super_admin'].includes(profile.role) || !profile.is_active) {
      return showError('غير مصرح بالدخول', 'حسابك لا يملك صلاحية إدارة فريق العمل الذكي.', '<a class="btn" href="/">العودة للموقع</a>');
    }
    me = profile;
    const { data: organizations, error: orgError } = await db.from('organizations').select('*').eq('slug', 'tiqnora').limit(1);
    if (orgError) return showError('يلزم تحديث قاعدة البيانات', 'نفّذ migration رقم 003_ai_workforce.sql ثم أعد تحميل الصفحة.');
    org = organizations?.[0];
    if (!org) return showError('مساحة Tiqnora غير موجودة', 'نفّذ migration الخاص بفريق العمل الذكي.');
    await loadData(); renderShell(); renderOverview();
  }
  async function loadData() {
    const { data, error } = await db.from('ai_agents').select('*').eq('organization_id', org.id).eq('is_enabled', true).order('created_at');
    if (error) throw error;
    agents = data || []; selectedAgent = selectedAgent || agents[0] || null;
    const [tasks, memory, conversations] = await Promise.all([
      db.from('ai_tasks').select('*').eq('organization_id', org.id).order('created_at', { ascending:false }),
      db.from('ai_memory').select('*').eq('organization_id', org.id).order('created_at', { ascending:false }),
      db.from('ai_conversations').select('*').eq('organization_id', org.id).order('created_at', { ascending:false }).limit(200)
    ]);
    state.tasks = tasks.data || []; state.memory = memory.data || []; state.conversations = conversations.data || [];
    agents.forEach(a => state.counts[a.id] = {
      tasks: state.tasks.filter(x => x.agent_id === a.id && !['done','cancelled'].includes(x.status)).length,
      memory: state.memory.filter(x => x.agent_id === a.id).length
    });
  }
  function renderShell() {
    app.className = 'app-shell';
    app.innerHTML = `<header class="topbar"><div class="brand"><img src="/assets/tiqnora-logo.png" alt="Tiqnora AI"><div><strong>Tiqnora AI Workforce</strong><small>INTERNAL OPERATIONS</small></div></div><div class="top-actions"><span class="user-chip">${esc(me.full_name || me.email)}</span><a class="btn btn-sm" href="/admin.html"><span class="back-label">لوحة الإدارة</span> ←</a><button class="btn btn-sm" id="logout">خروج</button></div></header>
    <main class="main"><section class="hero"><div><span class="eyebrow">فريقك التنفيذي الذكي</span><h1>إدارة Tiqnora بقدرات AI متخصصة</h1><p>وجّه الموظفين، تابع المهام، واحتفظ بمعرفة الشركة داخل مساحة إدارية آمنة وقابلة للتوسع.</p></div><span class="secure-badge">● مساحة إدارية محمية</span></section>
    <nav class="tabs" aria-label="أقسام فريق العمل"><button class="tab active" data-view="overview">نظرة عامة</button><button class="tab" data-view="chat">المحادثات</button><button class="tab" data-view="calls">المكالمات</button><button class="tab" data-view="tasks">المهام</button><button class="tab" data-view="memory">الذاكرة</button></nav><section class="view" id="view"></section></main>
    <dialog class="dialog" id="dialog"><div class="dialog-body" id="dialog-body"></div></dialog>`;
    $('#logout').onclick = async () => { await db.auth.signOut(); location.href = '/admin.html'; };
    $$('.tab').forEach(btn => btn.onclick = () => switchView(btn.dataset.view));
  }
  function switchView(view, agentId) {
    if (view !== 'chat') stopVoiceSession();
    if (agentId) selectedAgent = agents.find(a => a.id === agentId) || selectedAgent;
    $$('.tab').forEach(x => x.classList.toggle('active', x.dataset.view === view));
    ({ overview:renderOverview, chat:renderChat, calls:renderCalls, tasks:renderTasks, memory:renderMemory }[view] || renderOverview)();
  }
  function renderOverview() {
    const openTasks = state.tasks.filter(x => !['done','cancelled'].includes(x.status)).length;
    $('#view').innerHTML = `<div class="stats"><div class="stat"><span>الموظفون النشطون</span><strong>${agents.filter(a => a.status === 'active' && a.is_enabled).length}</strong></div><div class="stat"><span>المهام المفتوحة</span><strong>${openTasks}</strong></div><div class="stat"><span>عناصر الذاكرة</span><strong>${state.memory.length}</strong></div><div class="stat"><span>المحادثات</span><strong>${state.conversations.length}</strong></div></div>
    <div class="agents-grid">${agents.map(agentCard).join('')}</div>`;
    $$('[data-chat]').forEach(b => b.onclick = () => switchView('chat', b.dataset.chat));
    $$('[data-task-agent]').forEach(b => b.onclick = () => openTaskDialog(b.dataset.taskAgent));
  }
  function agentCard(a) {
    const meta = labels[a.slug] || [a.department, 'AI', '#6de8dc'], count = state.counts[a.id] || { tasks:0, memory:0 };
    const isOn = a.status === 'active' && a.is_enabled;
    const statusLabel = isOn ? 'نشط' : (a.is_enabled === false ? 'معطّل' : 'متوقف');
    const statusStyle = isOn ? '' : 'style="color:var(--muted);border-color:var(--line);background:transparent"';
    return `<article class="agent-card" style="--glow:${meta[2]}"><div class="agent-head"><div class="agent-identity"><span class="agent-avatar">${meta[1]}</span><div><h2>${esc(a.name_ar || a.name)}</h2><span class="dept">${esc(meta[0])}</span></div></div><span class="status" ${statusStyle}>${statusLabel}</span></div><p class="agent-desc">${esc(a.description_ar || a.description)}</p><div class="agent-metrics"><div class="metric"><strong>${count.tasks}</strong><span>مهام مفتوحة</span></div><div class="metric"><strong>${count.memory}</strong><span>عناصر ذاكرة</span></div><div class="metric"><strong>${esc(a.provider || '—')}</strong><span>المزود</span></div></div><div class="agent-actions"><button class="btn btn-primary" data-chat="${a.id}">بدء محادثة</button><button class="btn" data-task-agent="${a.id}">إضافة مهمة</button></div></article>`;
  }
  function pickerHtml() { return agents.map(a => `<button class="picker-item ${a.id === selectedAgent?.id ? 'active' : ''}" data-pick="${a.id}">${esc(a.name_ar || a.name)}<small>${esc(labels[a.slug]?.[0] || a.department)}</small></button>`).join(''); }
  function renderChat() {
    if (!selectedAgent) return $('#view').innerHTML = '<div class="panel empty">لا يوجد موظفون. نفّذ migration قاعدة البيانات.</div>';
    const history = state.conversations.filter(x => x.agent_id === selectedAgent.id).sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
    const voiceAgent = isVoiceAgent();
    const voiceSupported = Boolean(recognitionCtor());
    $('#view').innerHTML = `<div class="chat-layout"><aside class="panel agent-picker">${pickerHtml()}</aside><section class="panel chat-panel"><div class="panel-head"><div><h2>${esc(selectedAgent.name_ar || selectedAgent.name)}</h2><span class="hint">${esc(selectedAgent.provider || '—')} · ${esc(selectedAgent.model || '—')}${voiceAgent ? ' · ar-SA' : ''}</span></div><span class="status">${voiceAgent ? '🎙 صوتي جاهز' : 'جاهز'}</span></div><div class="messages" id="messages">${history.length ? history.map(messagePair).join('') : '<div class="empty">ابدأ بإرسال أول توجيه لهذا الموظف.</div>'}</div><form class="chat-form" id="chat-form"><textarea id="chat-input" maxlength="20000" required placeholder="${voiceAgent ? 'اضغط «تحدث» وابدأ الكلام، أو اكتب رسالتك…' : 'اكتب توجيهًا واضحًا… (Enter للإرسال، Shift+Enter لسطر جديد)'}"></textarea>${voiceAgent ? `<button class="btn voice-mic" id="voice-mic" type="button" aria-pressed="false" ${voiceSupported ? '' : 'disabled'}>${voiceSupported ? '🎙 تحدث' : 'الميكروفون غير مدعوم'}</button><button class="btn btn-sm voice-stop" id="voice-stop" type="button">🔇 إيقاف الصوت</button>` : ''}<button class="btn btn-primary" id="send" type="submit">إرسال</button></form></section></div>`;
    $('[data-pick]').forEach(b => b.onclick = () => { stopVoiceSession(); selectedAgent = agents.find(a => a.id === b.dataset.pick); renderChat(); });
    $('#chat-form').onsubmit = sendMessage;
    $('#chat-input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chat-form').requestSubmit(); } };
    if ($('#voice-mic')) $('#voice-mic').onclick = startVoiceInput;
    if ($('#voice-stop')) $('#voice-stop').onclick = stopVoiceOutput;
    const messages = $('#messages'); messages.scrollTop = messages.scrollHeight;
    $('[data-memory-response]').forEach(b => b.onclick = () => openMemoryDialog(b.dataset.memoryResponse));
  }
  function messagePair(row) {
    const time = new Date(row.created_at).toLocaleString('ar-SA', { dateStyle:'short', timeStyle:'short' });
    return `<div class="message user">${esc(row.message)}<div class="meta"><span>أنت</span><span>${time}</span></div></div><div class="message ai">${esc(row.response || (row.status === 'failed' ? row.error_message : 'جارٍ المعالجة…'))}<div class="meta"><button class="memory-action" data-memory-response="${row.id}">حفظ في الذاكرة</button><span>${esc(row.model || '')}</span></div></div>`;
  }
  async function sendMessage(e) {
    e.preventDefault(); const input = $('#chat-input'), button = $('#send'), message = input.value.trim(); if (!message) return;
    button.disabled = true; input.disabled = true; button.textContent = 'يفكر…';
    try {
      const { data: { session } } = await db.auth.getSession();
      const response = await fetch('/api/ai-workforce/chat', { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${session.access_token}` }, body:JSON.stringify({ agentId:selectedAgent.id, message }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'تعذر الحصول على رد');
      const reply = payload.conversation?.response || '';
      const shouldSpeak = isVoiceAgent();
      state.conversations.unshift(payload.conversation); input.value = ''; renderChat();
      if (shouldSpeak && reply) setTimeout(() => speakArabic(reply), 60);
    } catch (error) { toast(error.message, false); button.disabled = false; input.disabled = false; button.textContent = 'إرسال'; }
  }
  async function voiceApi(op, init = {}) {
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) throw new Error('انتهت جلسة الإدارة. سجّل الدخول مرة أخرى.');
    const method = init.method || 'GET';
    const response = await fetch(`/api/v6?route=voice_calls&op=${encodeURIComponent(op)}`, {
      ...init,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        ...(init.headers || {})
      },
      ...(init.body && typeof init.body !== 'string' ? { body: JSON.stringify(init.body) } : {})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Voice API failed (${response.status})`);
    return payload;
  }

  function voicePermissionLabel(permission) {
    if (permission?.status === 'granted') return '<span class="pill voice-ok">موافقة مسجلة</span>';
    if (permission?.status === 'revoked') return '<span class="pill voice-no">موقوفة</span>';
    return '<span class="pill">لا توجد موافقة</span>';
  }

  async function renderCalls() {
    $('#view').innerHTML = '<div class="panel empty">جارٍ تحميل مركز المكالمات…</div>';
    try {
      const [statusPayload, candidatesPayload, historyPayload] = await Promise.all([
        voiceApi('status'),
        voiceApi('candidates'),
        voiceApi('history')
      ]);
      const status = statusPayload || {};
      const candidates = [
        ...(candidatesPayload.leads || []).map(x => ({ ...x, _type:'lead', _label:x.contact_name || x.name || x.company_name || 'Lead' })),
        ...(candidatesPayload.customers || []).map(x => ({ ...x, _type:'customer', _label:x.full_name || 'عميل' }))
      ];
      state.voiceCandidates = candidates;
      state.voiceCalls = historyPayload.calls || [];

      const configured = Boolean(status.configured);
      const rows = candidates.length ? candidates.map(item => {
        const p = item.voice_permission;
        const canCall = configured && p?.status === 'granted';
        return `<tr>
          <td><strong>${esc(item._label)}</strong>${item.company_name ? `<br><small>${esc(item.company_name)}</small>` : ''}</td>
          <td class="ltr">${esc(item.phone || '—')}</td>
          <td>${item._type === 'lead' ? 'Lead' : 'عميل'}</td>
          <td>${voicePermissionLabel(p)}</td>
          <td class="actions">
            ${p?.status === 'granted'
              ? `<button class="btn btn-sm btn-primary" data-voice-draft="${item._type}:${item.id}" ${canCall ? '' : 'disabled'}>طلب اتصال</button><button class="btn btn-sm" data-voice-revoke="${p.id}">إلغاء الموافقة</button>`
              : `<button class="btn btn-sm" data-voice-consent="${item._type}:${item.id}">تسجيل موافقة العميل</button>`}
          </td>
        </tr>`;
      }).join('') : '<tr><td colspan="5" class="empty">لا توجد جهات اتصال برقم هاتف.</td></tr>';

      const calls = state.voiceCalls.slice(0,20);
      $('#view').innerHTML = `
        <div class="voice-status-grid">
          <div class="panel"><div class="panel-head"><div><h2>الوكيل الهاتفي</h2><span class="hint">Vapi + رقم هاتف خارجي + Tiqnora CRM</span></div><span class="status ${configured ? 'voice-ready' : ''}">${configured ? 'جاهز للاتصال' : 'بانتظار إعداد الهاتف'}</span></div>
            <div class="voice-checks">
              <span>${status.api_key ? '✓' : '○'} Vapi API</span>
              <span>${status.assistant_id ? '✓' : '○'} Assistant</span>
              <span>${status.phone_number_id ? '✓' : '○'} Phone Number</span>
              <span>${status.webhook_secret ? '✓' : '○'} Webhook</span>
            </div>
            <p class="hint" style="margin:10px 0 0">المكالمات الصادرة تتطلب موافقة عميل مسجلة ثم اعتمادًا منفصلًا قبل بدء الاتصال. التسجيل الصوتي وحفظ النص معطلان افتراضيًا.</p>
          </div>
        </div>
        <div class="panel" style="margin-top:14px"><div class="panel-head"><div><h2>جهات الاتصال</h2><span class="hint">لن يظهر زر الاتصال الفعلي قبل تسجيل موافقة صريحة.</span></div></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>الجهة</th><th>الهاتف</th><th>النوع</th><th>الموافقة</th><th>الإجراء</th></tr></thead><tbody>${rows}</tbody></table></div>
        </div>
        <div class="panel" style="margin-top:14px"><div class="panel-head"><div><h2>آخر المكالمات</h2><span class="hint">سجل تشغيلي مختصر بدون تخزين تسجيل صوتي أو نص المحادثة.</span></div></div>
          <div class="table-wrap"><table class="table"><thead><tr><th>الوقت</th><th>الرقم</th><th>الغرض</th><th>الحالة</th><th>المدة</th></tr></thead><tbody>
            ${calls.length ? calls.map(call => `<tr><td>${new Date(call.created_at).toLocaleString('ar-SA')}</td><td class="ltr">${esc(call.destination_phone)}</td><td>${esc(call.purpose)}</td><td><span class="pill">${esc(call.status)}</span></td><td>${call.duration_seconds != null ? esc(call.duration_seconds) + ' ث' : '—'}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">لا توجد مكالمات بعد.</td></tr>'}
          </tbody></table></div>
        </div>`;

      $('[data-voice-consent]').forEach(btn => btn.onclick = () => {
        const [type,id] = btn.dataset.voiceConsent.split(':');
        const item = state.voiceCandidates.find(x => x._type === type && x.id === id);
        if (item) openVoiceConsentDialog(item);
      });
      $('[data-voice-revoke]').forEach(btn => btn.onclick = async () => {
        if (!confirm('إلغاء موافقة الاتصال لهذا العميل؟')) return;
        btn.disabled = true;
        try {
          await voiceApi('revoke_consent', { method:'POST', body:{ permission_id:btn.dataset.voiceRevoke } });
          toast('تم إلغاء موافقة الاتصال');
          renderCalls();
        } catch (error) { toast(error.message, false); btn.disabled = false; }
      });
      $('[data-voice-draft]').forEach(btn => btn.onclick = async () => {
        const [type,id] = btn.dataset.voiceDraft.split(':');
        const item = state.voiceCandidates.find(x => x._type === type && x.id === id);
        if (!item?.voice_permission?.id) return;
        openVoiceCallDialog(item);
      });
    } catch (error) {
      $('#view').innerHTML = `<div class="panel"><h2>تعذر تحميل المكالمات</h2><p class="hint">${esc(error.message)}</p></div>`;
    }
  }

  function openVoiceConsentDialog(item) {
    const dialog = $('#dialog'), body = $('#dialog-body');
    body.innerHTML = `<h2>تسجيل موافقة صريحة على الاتصال</h2>
      <p class="hint">سجّل الموافقة فقط إذا طلب العميل أو وافق بوضوح على أن تتصل به Tiqnora. لا تعتبر سياسة الخصوصية أو العقد العام موافقة اتصال تسويقي.</p>
      <form id="voice-consent-form"><div class="form-row">
        <div class="full"><label>العميل</label><input value="${esc(item._label)}" disabled></div>
        <div class="full"><label>الهاتف</label><input name="phone" dir="ltr" value="${esc(item.phone || '')}" required></div>
        <div class="full"><label>مصدر الموافقة</label><select name="source" required>
          <option value="whatsapp_explicit">موافقة صريحة عبر واتساب</option>
          <option value="web_form_explicit">نموذج مستقل للموافقة</option>
          <option value="inbound_call_explicit">العميل طلب الاتصال في مكالمة واردة</option>
          <option value="written_consent">موافقة مكتوبة مستقلة</option>
          <option value="other_explicit">موافقة صريحة أخرى</option>
        </select></div>
        <div class="full"><label>ملاحظة إثبات (اختياري)</label><textarea name="evidence_note" rows="3" placeholder="مثال: وافق في واتساب بتاريخ ..."></textarea></div>
        <div class="full"><label class="consent-check"><input name="confirmed" type="checkbox" required> أؤكد أن العميل وافق صراحة على الاتصال به.</label></div>
      </div><div class="dialog-actions"><button type="button" class="btn" data-close>إلغاء</button><button class="btn btn-primary">حفظ الموافقة</button></div></form>`;
    $('[data-close]', body).onclick = () => dialog.close();
    $('#voice-consent-form').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await voiceApi('record_consent', {
          method:'POST',
          body:{
            entity_type:item._type,
            entity_id:item.id,
            phone:String(fd.get('phone') || '').trim(),
            source:fd.get('source'),
            evidence_note:String(fd.get('evidence_note') || '').trim(),
            confirmed:Boolean(fd.get('confirmed'))
          }
        });
        dialog.close(); toast('تم تسجيل موافقة العميل'); renderCalls();
      } catch (error) { toast(error.message, false); }
    };
    dialog.showModal();
  }

  function openVoiceCallDialog(item) {
    const dialog = $('#dialog'), body = $('#dialog-body');
    body.innerHTML = `<h2>إنشاء طلب اتصال بالوكيل الصوتي</h2>
      <p class="hint">هذه الخطوة تنشئ طلبًا فقط. ستظهر خطوة اعتماد ثانية قبل بدء المكالمة فعليًا.</p>
      <form id="voice-call-form"><div class="form-row">
        <div class="full"><label>العميل</label><input value="${esc(item._label)}" disabled></div>
        <div class="full"><label>الهاتف</label><input value="${esc(item.phone || '')}" dir="ltr" disabled></div>
        <div class="full"><label>غرض الاتصال</label><select name="purpose">
          <option value="followup">متابعة طلب/اهتمام سابق</option>
          <option value="support">خدمة ودعم</option>
          <option value="appointment">موعد</option>
          <option value="sales">مبيعات بموافقة العميل</option>
          <option value="other">أخرى</option>
        </select></div>
      </div><div class="dialog-actions"><button type="button" class="btn" data-close>إلغاء</button><button class="btn btn-primary">إنشاء طلب الاتصال</button></div></form>`;
    $('[data-close]', body).onclick = () => dialog.close();
    $('#voice-call-form').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const created = await voiceApi('create_action', {
          method:'POST',
          body:{ permission_id:item.voice_permission.id, purpose:fd.get('purpose') }
        });
        const action = created.action;
        body.innerHTML = `<h2>اعتماد المكالمة</h2><p>سيبدأ الوكيل الصوتي اتصالًا فعليًا إلى <bdi dir="ltr">${esc(item.phone)}</bdi> بعد الضغط على الزر التالي.</p>
          <p class="hint">لن يتم تسجيل الصوت أو تخزين نص المحادثة افتراضيًا.</p>
          <div class="dialog-actions"><button type="button" class="btn" data-close>إلغاء</button><button class="btn btn-primary" id="voice-approve-call">اعتماد وبدء الاتصال</button></div>`;
        $('[data-close]', body).onclick = () => dialog.close();
        $('#voice-approve-call').onclick = async () => {
          const btn = $('#voice-approve-call'); btn.disabled = true; btn.textContent = 'جاري بدء الاتصال…';
          try {
            const result = await voiceApi('approve_and_call', { method:'POST', body:{ action_id:action.id } });
            dialog.close();
            toast(result.action?.result?.call_id ? 'بدأ اتصال الوكيل الصوتي' : 'تم اعتماد طلب الاتصال');
            renderCalls();
          } catch (error) { toast(error.message, false); btn.disabled = false; btn.textContent = 'اعتماد وبدء الاتصال'; }
        };
      } catch (error) { toast(error.message, false); }
    };
    dialog.showModal();
  }

  function renderTasks() {
    $('#view').innerHTML = `<div class="panel"><div class="panel-head"><div><h2>مهام الموظفين</h2><span class="hint">توزيع الأولويات ومتابعة التنفيذ</span></div><button class="btn btn-primary" id="new-task">+ مهمة جديدة</button></div><div class="table-wrap"><table class="table"><thead><tr><th>المهمة</th><th>الموظف</th><th>الأولوية</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>${state.tasks.length ? state.tasks.map(taskRow).join('') : '<tr><td colspan="5" class="empty">لا توجد مهام بعد</td></tr>'}</tbody></table></div></div>`;
    $('#new-task').onclick = () => openTaskDialog(selectedAgent?.id);
    $$('[data-task-status]').forEach(s => s.onchange = async () => { const { error } = await db.from('ai_tasks').update({ status:s.value, updated_at:new Date().toISOString() }).eq('id', s.dataset.taskStatus); if (error) return toast(error.message,false); await loadData(); renderTasks(); });
    $$('[data-task-delete]').forEach(b => b.onclick = async () => { if (!confirm('حذف هذه المهمة؟')) return; const { error } = await db.from('ai_tasks').delete().eq('id', b.dataset.taskDelete); if (error) return toast(error.message,false); await loadData(); renderTasks(); toast('تم حذف المهمة'); });
  }
  function taskRow(t) { const a = agents.find(x => x.id === t.agent_id); return `<tr><td class="desc"><strong>${esc(t.title)}</strong><br><small>${esc(t.description || '')}</small></td><td>${esc(a?.name_ar || '—')}</td><td><span class="pill">${priorityAr[t.priority] || esc(t.priority)}</span></td><td><select data-task-status="${t.id}">${Object.entries(statusAr).map(([k,v]) => `<option value="${k}" ${t.status === k ? 'selected':''}>${v}</option>`).join('')}</select></td><td><button class="btn btn-danger btn-sm" data-task-delete="${t.id}">حذف</button></td></tr>`; }
  function openTaskDialog(agentId) {
    const dialog = $('#dialog'), body = $('#dialog-body');
    body.innerHTML = `<h2>إضافة مهمة</h2><form id="task-form"><div class="form-row"><div class="full"><label>الموظف</label><select name="agent_id" required>${agents.map(a => `<option value="${a.id}" ${a.id === agentId ? 'selected':''}>${esc(a.name_ar || a.name)}</option>`).join('')}</select></div><div class="full"><label>عنوان المهمة</label><input name="title" maxlength="240" required></div><div class="full"><label>الوصف</label><textarea name="description" rows="4"></textarea></div><div><label>الأولوية</label><select name="priority"><option value="medium">متوسطة</option><option value="high">عالية</option><option value="urgent">عاجلة</option><option value="low">منخفضة</option></select></div><div><label>الحالة</label><select name="status"><option value="todo">جديدة</option><option value="in_progress">قيد التنفيذ</option></select></div></div><div class="dialog-actions"><button type="button" class="btn" data-close>إلغاء</button><button class="btn btn-primary">حفظ المهمة</button></div></form>`;
    $('[data-close]', body).onclick = () => dialog.close();
    $('#task-form').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); const payload = { organization_id:org.id, agent_id:f.get('agent_id'), title:f.get('title').trim(), description:f.get('description').trim() || null, priority:f.get('priority'), status:f.get('status'), created_by:me.id }; const { error } = await db.from('ai_tasks').insert(payload); if (error) return toast(error.message,false); dialog.close(); await loadData(); switchView('tasks'); toast('تمت إضافة المهمة'); };
    dialog.showModal();
  }
  function renderMemory() {
    $('#view').innerHTML = `<div class="panel"><div class="panel-head"><div><h2>ذاكرة الشركة</h2><span class="hint">معلومات دائمة تساعد الموظفين على فهم Tiqnora</span></div><button class="btn btn-primary" id="new-memory">+ معلومة جديدة</button></div><div class="table-wrap"><table class="table"><thead><tr><th>المفتاح</th><th>القيمة</th><th>الموظف</th><th>الإجراء</th></tr></thead><tbody>${state.memory.length ? state.memory.map(memoryRow).join('') : '<tr><td colspan="4" class="empty">لم تُحفظ معلومات بعد</td></tr>'}</tbody></table></div></div>`;
    $('#new-memory').onclick = () => openMemoryDialog();
    $$('[data-memory-delete]').forEach(b => b.onclick = async () => { if (!confirm('حذف هذه المعلومة؟')) return; const { error } = await db.from('ai_memory').delete().eq('id', b.dataset.memoryDelete); if (error) return toast(error.message,false); await loadData(); renderMemory(); toast('تم حذف المعلومة'); });
  }
  function memoryRow(m) { const a = agents.find(x => x.id === m.agent_id); return `<tr><td><strong>${esc(m.memory_key)}</strong></td><td class="desc">${esc(m.memory_value)}</td><td>${esc(a?.name_ar || '—')}</td><td><button class="btn btn-danger btn-sm" data-memory-delete="${m.id}">حذف</button></td></tr>`; }
  function openMemoryDialog(conversationId) {
    const conversation = state.conversations.find(x => x.id === conversationId), dialog = $('#dialog'), body = $('#dialog-body');
    body.innerHTML = `<h2>حفظ في الذاكرة</h2><form id="memory-form"><div class="form-row"><div class="full"><label>الموظف</label><select name="agent_id" required>${agents.map(a => `<option value="${a.id}" ${a.id === (conversation?.agent_id || selectedAgent?.id) ? 'selected':''}>${esc(a.name_ar || a.name)}</option>`).join('')}</select></div><div class="full"><label>مفتاح مختصر للمعلومة</label><input name="memory_key" maxlength="160" placeholder="مثال: target_market" required></div><div class="full"><label>المعلومة</label><textarea name="memory_value" rows="6" maxlength="20000" required>${esc(conversation?.response || '')}</textarea></div></div><div class="dialog-actions"><button type="button" class="btn" data-close>إلغاء</button><button class="btn btn-primary">حفظ المعلومة</button></div></form>`;
    $('[data-close]', body).onclick = () => dialog.close();
    $('#memory-form').onsubmit = async e => { e.preventDefault(); const f = new FormData(e.target); const payload = { organization_id:org.id, agent_id:f.get('agent_id'), memory_key:f.get('memory_key').trim(), memory_value:f.get('memory_value').trim(), created_by:me.id }; const { error } = await db.from('ai_memory').upsert(payload, { onConflict:'agent_id,memory_key' }); if (error) return toast(error.message,false); dialog.close(); await loadData(); switchView('memory'); toast('تم حفظ المعلومة في الذاكرة'); };
    dialog.showModal();
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(error => showError('حدث خطأ', error.message)));
})();
