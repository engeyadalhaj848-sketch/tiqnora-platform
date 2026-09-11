(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const app = $('#workforce-app');
  let db, me, org, agents = [], selectedAgent = null;
  const state = { counts: {}, conversations: [], tasks: [], memory: [] };
  const labels = {
    marketing: ['تسويق', 'MA', '#6de8dc'], content: ['محتوى', 'CO', '#efc875'],
    'social-media': ['تواصل اجتماعي', 'SM', '#b399ff'], developer: ['تقنية', 'CT', '#76e6a1']
  };
  const statusAr = { todo:'جديدة', in_progress:'قيد التنفيذ', blocked:'متوقفة', done:'مكتملة', cancelled:'ملغاة' };
  const priorityAr = { low:'منخفضة', medium:'متوسطة', high:'عالية', urgent:'عاجلة' };

  function toast(message, ok = true) {
    const el = $('#toast'); el.textContent = message; el.style.borderColor = ok ? 'var(--accent)' : 'var(--danger)';
    el.classList.add('show'); clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  function showError(title, message, action = '') {
    app.className = 'boot-screen';
    app.innerHTML = `<div class="error-card"><h1>${esc(title)}</h1><p>${esc(message)}</p>${action}</div>`;
  }
  async function waitForDatabaseClient(timeoutMs = 10000) {
    if (window.TiqnoraDB?.raw) return window.TiqnoraDB.raw;
    await new Promise(resolve => {
      let settled = false;
      const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
      const timer = setTimeout(finish, timeoutMs);
      window.addEventListener('tiqnora:db-ready', finish, { once:true });
    });
    return window.TiqnoraDB?.raw || null;
  }
  async function boot() {
    if (!window.TiqnoraDB?.isConfigured) return showError('قاعدة البيانات غير متصلة', 'أكمل إعداد Supabase أولًا.');
    await window.TiqnoraDB.ready(); db = await waitForDatabaseClient();
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
    const { data, error } = await db.from('ai_agents').select('*').eq('organization_id', org.id).in('slug', ['marketing','content','social-media','developer']).order('created_at');
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
    app.innerHTML = `<header class="topbar"><div class="brand"><img src="../../assets/tiqnora-logo.png" alt="Tiqnora AI"><div><strong>Tiqnora AI Workforce</strong><small>INTERNAL OPERATIONS</small></div></div><div class="top-actions"><span class="user-chip">${esc(me.full_name || me.email)}</span><a class="btn btn-sm" href="/admin.html"><span class="back-label">لوحة الإدارة</span> ←</a><button class="btn btn-sm" id="logout">خروج</button></div></header>
    <main class="main"><section class="hero"><div><span class="eyebrow">فريقك التنفيذي الذكي</span><h1>إدارة Tiqnora بقدرات AI متخصصة</h1><p>وجّه الموظفين، تابع المهام، واحتفظ بمعرفة الشركة داخل مساحة إدارية آمنة وقابلة للتوسع.</p></div><span class="secure-badge">● مساحة إدارية محمية</span></section>
    <nav class="tabs" aria-label="أقسام فريق العمل"><button class="tab active" data-view="overview">نظرة عامة</button><button class="tab" data-view="chat">المحادثات</button><button class="tab" data-view="tasks">المهام</button><button class="tab" data-view="memory">الذاكرة</button></nav><section class="view" id="view"></section></main>
    <dialog class="dialog" id="dialog"><div class="dialog-body" id="dialog-body"></div></dialog>`;
    $('#logout').onclick = async () => { await db.auth.signOut(); location.href = '/admin.html'; };
    $$('.tab').forEach(btn => btn.onclick = () => switchView(btn.dataset.view));
  }
  function switchView(view, agentId) {
    if (agentId) selectedAgent = agents.find(a => a.id === agentId) || selectedAgent;
    $$('.tab').forEach(x => x.classList.toggle('active', x.dataset.view === view));
    ({ overview:renderOverview, chat:renderChat, tasks:renderTasks, memory:renderMemory }[view] || renderOverview)();
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
    return `<article class="agent-card" style="--glow:${meta[2]}"><div class="agent-head"><div class="agent-identity"><span class="agent-avatar">${meta[1]}</span><div><h2>${esc(a.name_ar || a.name)}</h2><span class="dept">${esc(meta[0])}</span></div></div><span class="status">${a.status === 'active' && a.is_enabled ? 'نشط' : 'متوقف'}</span></div><p class="agent-desc">${esc(a.description_ar || a.description)}</p><div class="agent-metrics"><div class="metric"><strong>${count.tasks}</strong><span>مهام مفتوحة</span></div><div class="metric"><strong>${count.memory}</strong><span>عناصر ذاكرة</span></div><div class="metric"><strong>${esc(a.provider)}</strong><span>المزود</span></div></div><div class="agent-actions"><button class="btn btn-primary" data-chat="${a.id}">بدء محادثة</button><button class="btn" data-task-agent="${a.id}">إضافة مهمة</button></div></article>`;
  }
  function pickerHtml() { return agents.map(a => `<button class="picker-item ${a.id === selectedAgent?.id ? 'active' : ''}" data-pick="${a.id}">${esc(a.name_ar || a.name)}<small>${esc(labels[a.slug]?.[0] || a.department)}</small></button>`).join(''); }
  function renderChat() {
    if (!selectedAgent) return $('#view').innerHTML = '<div class="panel empty">لا يوجد موظفون. نفّذ migration قاعدة البيانات.</div>';
    const history = state.conversations.filter(x => x.agent_id === selectedAgent.id).sort((a,b) => new Date(a.created_at)-new Date(b.created_at));
    $('#view').innerHTML = `<div class="chat-layout"><aside class="panel agent-picker">${pickerHtml()}</aside><section class="panel chat-panel"><div class="panel-head"><div><h2>${esc(selectedAgent.name_ar || selectedAgent.name)}</h2><span class="hint">${esc(selectedAgent.provider)} · ${esc(selectedAgent.model)}</span></div><span class="status">جاهز</span></div><div class="messages" id="messages">${history.length ? history.map(messagePair).join('') : '<div class="empty">ابدأ بإرسال أول توجيه لهذا الموظف.</div>'}</div><form class="chat-form" id="chat-form"><textarea id="chat-input" maxlength="20000" required placeholder="اكتب توجيهًا واضحًا… (Enter للإرسال، Shift+Enter لسطر جديد)"></textarea><button class="btn btn-primary" id="send" type="submit">إرسال</button></form></section></div>`;
    $$('[data-pick]').forEach(b => b.onclick = () => { selectedAgent = agents.find(a => a.id === b.dataset.pick); renderChat(); });
    $('#chat-form').onsubmit = sendMessage;
    $('#chat-input').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chat-form').requestSubmit(); } };
    const messages = $('#messages'); messages.scrollTop = messages.scrollHeight;
    $$('[data-memory-response]').forEach(b => b.onclick = () => openMemoryDialog(b.dataset.memoryResponse));
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
      state.conversations.unshift(payload.conversation); input.value = ''; renderChat();
    } catch (error) { toast(error.message, false); button.disabled = false; input.disabled = false; button.textContent = 'إرسال'; }
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
