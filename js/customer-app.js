/* Tiqnora Customer Portal — Phase 3 UX */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
let db = null, me = null, orgId = null, plan = null, usage = null, subRow = null, unread = 0;

const NAV = [
  { id: 'home', label: 'الرئيسية', ic: '◈' },
  { id: 'ai', label: 'الذكاء الاصطناعي', ic: '✺' },
  { id: 'demos', label: 'تجارب جاهزة', ic: '▷' },
  { id: 'projects', label: 'المشاريع', ic: '▣' },
  { id: 'services', label: 'الخدمات', ic: '✦' },
  { id: 'plans', label: 'الاشتراك', ic: '◈' },
  { id: 'billing', label: 'الفواتير', ic: '▤' },
  { id: 'notifications', label: 'الإشعارات', ic: '◉' },
  { id: 'account', label: 'الحساب', ic: '◎' },
];

function toast(msg, ok = true) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.style.borderColor = ok ? 'var(--ok)' : 'var(--danger)';
  t.classList.add('show'); clearTimeout(t._to); t._to = setTimeout(() => t.classList.remove('show'), 2800);
}
function periodYm() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
async function ensureOrg() {
  const { data, error } = await db.rpc('ensure_customer_organization', { org_name: me.full_name || null });
  if (error) throw error;
  orgId = data;
  return orgId;
}
async function loadPlanUsage() {
  const { data: sub } = await db.from('subscriptions').select('*, saas_plans(*)').eq('organization_id', orgId).maybeSingle();
  subRow = sub; plan = sub?.saas_plans || null;
  const ym = periodYm();
  const { data: u } = await db.from('usage_meters').select('*').eq('organization_id', orgId).eq('period_ym', ym).maybeSingle();
  usage = u || { ai_requests: 0, period_ym: ym };
  return { sub, plan, usage };
}
async function loadUnread() {
  const { count } = await db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', me.id).is('read_at', null);
  unread = count || 0;
  const btn = $('#notif-btn');
  if (btn) {
    btn.innerHTML = unread ? `إشعارات <span class="dot"></span>` : 'إشعارات';
  }
  return unread;
}

function renderAuth(msg = '') {
  $('#app-root').innerHTML = `<div class="auth-wrap"><div class="auth-card">
    <h1>بوابة عملاء Tiqnora AI</h1>
    <p>إدارة مشاريعك، الذكاء الاصطناعي، والخدمات في مكان واحد.</p>
    <div class="err">${esc(msg)}</div>
    <form id="auth-form">
      <label>البريد</label><input name="email" type="email" required dir="ltr" autocomplete="email" />
      <label>كلمة المرور</label><input name="password" type="password" required minlength="8" autocomplete="current-password" />
      <button class="btn btn-primary" type="submit">دخول</button>
      <button class="btn btn-ghost" type="button" id="toggle-mode" style="width:100%;margin-top:8px">إنشاء حساب جديد</button>
    </form>
    <p style="margin-top:14px;font-size:.85rem"><a href="/">الموقع الرئيسي</a></p>
  </div></div>`;
  let mode = 'login';
  $('#toggle-mode').onclick = () => {
    mode = mode === 'login' ? 'signup' : 'login';
    $('#toggle-mode').textContent = mode === 'login' ? 'إنشاء حساب جديد' : 'لدي حساب — تسجيل الدخول';
    $('#auth-form button[type=submit]').textContent = mode === 'login' ? 'دخول' : 'إنشاء حساب';
  };
  $('#auth-form').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = String(f.get('email')).trim();
    const password = String(f.get('password'));
    try {
      if (mode === 'signup') {
        const { error } = await db.auth.signUp({ email, password, options: { data: { full_name: email.split('@')[0] } } });
        if (error) return renderAuth(error.message);
        toast('تم إنشاء الحساب');
        mode = 'login';
      }
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) return renderAuth(error.message === 'Invalid login credentials' ? 'بيانات الدخول غير صحيحة' : error.message);
      boot();
    } catch (err) { renderAuth(err.message); }
  };
}

function renderShell() {
  $('#app-root').innerHTML = `<div class="shell">
    <aside class="side" id="side">
      <div class="side-brand"><img src="assets/tiqnora-logo.png" alt=""><span>Tiqnora</span></div>
      ${NAV.map(n => `<a href="#${n.id}" data-nav="${n.id}"><span>${n.ic}</span>${n.label}</a>`).join('')}
      <div style="margin-top:auto;padding:8px"><button class="btn btn-ghost btn-sm" id="logout" style="width:100%">خروج</button></div>
    </aside>
    <div class="main">
      <div class="top">
        <div style="display:flex;gap:8px;align-items:center">
          <button class="burger" id="burger">☰</button>
          <h1 id="page-title">بوابة العملاء</h1>
        </div>
        <div style="display:flex;gap:8px;align-items:center;position:relative">
          <button class="notif-btn" id="notif-btn">إشعارات</button>
          <span class="pill">${esc(plan?.name_ar || '—')}</span>
          <div class="notif-panel" id="notif-panel" style="display:none"></div>
        </div>
      </div>
      <div id="view"></div>
    </div>
  </div>`;
  $('#logout').onclick = async () => { await db.auth.signOut(); location.reload(); };
  $('#burger').onclick = () => $('#side').classList.toggle('open');
  $$('[data-nav]').forEach(a => a.onclick = e => { e.preventDefault(); location.hash = a.dataset.nav; route(); $('#side').classList.remove('open'); });
  $('#notif-btn').onclick = async () => {
    const p = $('#notif-panel');
    if (p.style.display === 'block') { p.style.display = 'none'; return; }
    const { data } = await db.from('notifications').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(15);
    p.innerHTML = (data || []).map(n => `<div class="notif-item ${n.read_at ? '' : 'unread'}" data-nid="${n.id}">
      <b>${esc(n.title_ar)}</b><br><small>${esc(n.body_ar || '')}</small><br>
      <small>${new Date(n.created_at).toLocaleString('ar-SA')}</small></div>`).join('') || '<div class="notif-item">لا إشعارات</div>';
    p.style.display = 'block';
    $$('[data-nid]').forEach(el => el.onclick = async () => {
      await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', el.dataset.nid);
      el.classList.remove('unread'); loadUnread();
    });
  };
  document.addEventListener('click', e => {
    if (!$('#notif-panel')?.contains(e.target) && e.target.id !== 'notif-btn') {
      if ($('#notif-panel')) $('#notif-panel').style.display = 'none';
    }
  });
  loadUnread();
}

async function viewHome(v) {
  await loadPlanUsage();
  const limit = plan?.ai_requests_monthly ?? 20;
  const used = usage?.ai_requests ?? 0;
  const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  const { count: projCount } = await db.from('customer_projects').select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
  const { count: reqCount } = await db.from('service_requests').select('id', { count: 'exact', head: true }).eq('user_id', me.id);
  const { data: inv } = await db.from('billing_invoices').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(3);
  const { data: notes } = await db.from('notifications').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(4);
  v.innerHTML = `
  <div class="hero">
    <h2>مرحباً ${esc(me.full_name || me.email.split('@')[0])}</h2>
    <p>خطتك الحالية <b>${esc(plan?.name_ar || 'مجاني')}</b>. استخدم الذكاء الاصطناعي، أدر مشاريعك، واطلب خدمات Tiqnora من لوحة واحدة.</p>
    <div class="row" style="margin-top:14px">
      <button class="btn btn-primary btn-sm" onclick="location.hash='ai'">محادثة AI</button>
      <button class="btn btn-ghost btn-sm" onclick="location.hash='services'">طلب خدمة</button>
      <button class="btn btn-ghost btn-sm" onclick="location.hash='plans'">إدارة الاشتراك</button>
    </div>
  </div>
  <div class="cards">
    <div class="card"><div class="sub">الاشتراك</div><div class="val" style="font-size:1.15rem">${esc(plan?.name_ar || 'مجاني')}</div>
      <div class="sub">تجديد: ${subRow?.current_period_end ? new Date(subRow.current_period_end).toLocaleDateString('ar-SA') : '—'}</div></div>
    <div class="card"><div class="sub">استخدام AI</div><div class="val">${used}<span style="font-size:.9rem;color:var(--muted)"> / ${limit}</span></div>
      <div class="progress ${pct>=90?'warn':''}"><i style="width:${pct}%"></i></div></div>
    <div class="card"><div class="sub">المشاريع</div><div class="val">${projCount || 0}<span style="font-size:.9rem;color:var(--muted)"> / ${plan?.max_projects ?? 1}</span></div></div>
    <div class="card"><div class="sub">طلبات الخدمات</div><div class="val">${reqCount || 0}</div></div>
  </div>
  <div class="grid2">
    <div class="card"><h2>آخر الإشعارات</h2>
      ${(notes||[]).map(n=>`<div style="padding:10px 0;border-bottom:1px solid var(--line)"><b>${esc(n.title_ar)}</b><div class="sub">${esc(n.body_ar||'')}</div></div>`).join('') || '<p class="sub">لا إشعارات بعد</p>'}
      <button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="location.hash='notifications'">عرض الكل</button>
    </div>
    <div class="card"><h2>آخر الفواتير</h2>
      <table><thead><tr><th>المبلغ</th><th>الحالة</th></tr></thead>
      <tbody>${(inv||[]).map(i=>`<tr><td>${Number(i.amount).toLocaleString('ar-SA')} ${esc(i.currency||'SAR')}</td><td><span class="pill">${esc(i.status)}</span></td></tr>`).join('') || '<tr><td colspan="2" class="sub">لا فواتير</td></tr>'}
      </tbody></table>
    </div>
  </div>`;
}

async function viewAi(v) {
  await loadPlanUsage();
  const demoAgent = sessionStorage.getItem('tiqnora_demo_agent');
  const demoPrompt = sessionStorage.getItem('tiqnora_demo_prompt');
  if (demoAgent) sessionStorage.removeItem('tiqnora_demo_agent');
  if (demoPrompt) sessionStorage.removeItem('tiqnora_demo_prompt');
  const limit = plan?.ai_requests_monthly ?? 20;
  const used = usage?.ai_requests ?? 0;
  const maxAgents = plan?.max_agents ?? 1;
  const agents = [
    { slug: 'marketing', name: 'وكيل التسويق' },
    { slug: 'content', name: 'وكيل المحتوى' },
    { slug: 'social-media', name: 'وكيل التواصل' },
    { slug: 'developer', name: 'المساعد التقني' },
    { slug: 'commerce', name: 'وكيل التجارة' },
  ].slice(0, Math.max(1, maxAgents));
  v.innerHTML = `<div class="card">
    <h2>مساعدو الذكاء الاصطناعي</h2>
    <p class="sub">الاستخدام: ${used} / ${limit} هذا الشهر ${used>=limit?'· <span class="pill warn">الحد ممتلئ — رقِّ خطتك</span>':''}</p>
    <label>الوكيل</label>
    <select id="agent">${agents.map(a => `<option value="${a.slug}">${esc(a.name)}</option>`).join('')}</select>
    <div class="chat-log" id="log"></div>
    <div class="row">
      <input id="msg" placeholder="اكتب رسالتك…" />
      <button class="btn btn-primary btn-sm" id="send">إرسال</button>
    </div>
  </div>`;
  if (demoAgent) { const sel = $('#agent'); if (sel) sel.value = demoAgent; }
  if (demoPrompt) { const inp = $('#msg'); if (inp) inp.value = demoPrompt; }
  const log = $('#log');
  const append = (role, text) => { const d = document.createElement('div'); d.className = `bubble ${role}`; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; };
  $('#send').onclick = async () => {
    const message = $('#msg').value.trim();
    if (!message) return;
    if (used >= limit) { toast('وصلت لحد خطتك — رقِّ الاشتراك', false); location.hash = 'plans'; return; }
    $('#msg').value = ''; append('user', message); append('ai', '…');
    try {
      const { data: { session } } = await db.auth.getSession();
      const res = await fetch('/api/customer/ai-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ agentSlug: $('#agent').value, message })
      });
      const payload = await res.json().catch(() => ({}));
      log.lastChild.remove();
      if (!res.ok) { append('ai', payload.error || 'تعذر الرد'); toast(payload.error || 'خطأ', false); return; }
      append('ai', payload.reply || '');
      await loadPlanUsage();
    } catch (e) { log.lastChild.textContent = e.message; }
  };
}

async function viewDemos(v) {
  const { data: rows } = await db.from('demo_workflows').select('*').eq('is_public', true).order('sort_order');
  if (!rows?.length) {
    v.innerHTML = `<div class="card"><div class="empty"><b>التجارب غير مفعّلة بعد</b>شغّل migration 014 في Supabase</div></div>`;
    return;
  }
  v.innerHTML = `<div class="hero"><h2>تجارب جاهزة (Demo Workflows)</h2>
    <p>مسارات قصيرة لاستخدام الوكلاء بدون تعقيد — مثالية للتعرّف على المنصة.</p></div>
    <div class="cards">${rows.map(d => `
      <div class="card">
        <h2>${esc(d.title_ar)}</h2>
        <p class="sub">${esc(d.description_ar || '')}</p>
        <ol style="margin:10px 0;padding-inline-start:18px;color:var(--muted);font-size:.9rem;line-height:1.6">
          ${(d.steps||[]).map(s=>`<li>${esc(s.ar||s)}</li>`).join('')}
        </ol>
        <button class="btn btn-primary btn-sm" data-demo="${esc(d.agent_slug||'marketing')}" data-prompt="${esc((d.title_ar||'') + ': ' + (d.description_ar||''))}">ابدأ مع الوكيل</button>
      </div>`).join('')}</div>`;
  $$('[data-demo]').forEach(b => b.onclick = () => {
    sessionStorage.setItem('tiqnora_demo_agent', b.dataset.demo);
    sessionStorage.setItem('tiqnora_demo_prompt', b.dataset.prompt);
    location.hash = 'ai';
  });
}

async function viewProjects(v) {
  const { data: rows } = await db.from('customer_projects').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
  v.innerHTML = `<div class="card"><h2>المشاريع</h2>
    <div class="row" style="margin-bottom:12px">
      <input id="pt" placeholder="عنوان مشروع جديد" />
      <button class="btn btn-primary btn-sm" id="add">إضافة</button>
    </div>
    <table><thead><tr><th>العنوان</th><th>الحالة</th><th>تاريخ</th></tr></thead>
    <tbody>${(rows||[]).map(r=>`<tr><td>${esc(r.title)}</td><td><span class="pill">${esc(r.status)}</span></td><td>${new Date(r.created_at).toLocaleDateString('ar-SA')}</td></tr>`).join('') || '<tr><td colspan="3"><div class="empty"><b>لا مشاريع بعد</b>أنشئ أول مشروع لبدء العمل</div></td></tr>'}
    </tbody></table></div>`;
  $('#add').onclick = async () => {
    const title = $('#pt').value.trim(); if (!title) return;
    const max = plan?.max_projects ?? 1;
    if ((rows||[]).length >= max) return toast('وصلت لحد المشاريع', false);
    await db.from('customer_projects').insert({ organization_id: orgId, created_by: me.id, title });
    toast('تمت الإضافة'); viewProjects(v);
  };
}

async function viewServices(v) {
  const cats = [
    ['ai_solutions','حلول الذكاء الاصطناعي'],['digital_marketing','التسويق الرقمي'],['seo','SEO'],
    ['website_development','تطوير المواقع'],['automation','الأتمتة'],['social_media','التواصل'],
    ['it_services','خدمات تقنية'],['other','أخرى']
  ];
  const { data: mine } = await db.from('service_requests').select('*').eq('user_id', me.id).order('created_at',{ascending:false}).limit(20);
  v.innerHTML = `<div class="grid2">
    <div class="card"><h2>طلب خدمة</h2>
      <label>التصنيف</label><select id="cat">${cats.map(([k,t])=>`<option value="${k}">${t}</option>`).join('')}</select>
      <label>العنوان</label><input id="st" />
      <label>التفاصيل</label><textarea id="sd" rows="4"></textarea>
      <label>الجوال</label><input id="sp" dir="ltr" />
      <button class="btn btn-primary" id="sr">إرسال</button>
    </div>
    <div class="card"><h2>طلباتي</h2>
      <table><thead><tr><th>العنوان</th><th>الحالة</th></tr></thead>
      <tbody>${(mine||[]).map(r=>`<tr><td>${esc(r.title)}</td><td><span class="pill">${esc(r.status)}</span></td></tr>`).join('')||'<tr><td colspan="2" class="sub">لا طلبات</td></tr>'}
      </tbody></table>
    </div>
  </div>`;
  $('#sr').onclick = async () => {
    const title = $('#st').value.trim(); if (!title) return toast('أدخل عنواناً', false);
    await db.from('service_requests').insert({
      organization_id: orgId, user_id: me.id, category: $('#cat').value,
      title, details: $('#sd').value.trim()||null, contact_phone: $('#sp').value.trim()||null, contact_email: me.email
    });
    toast('تم إرسال الطلب'); viewServices(v);
  };
}

async function viewPlans(v) {
  await loadPlanUsage();
  const { data: plans } = await db.from('saas_plans').select('*').eq('is_public', true).order('sort_order');
  const limit = plan?.ai_requests_monthly ?? 20;
  const used = usage?.ai_requests ?? 0;
  const over = used >= limit;
  v.innerHTML = `
  <div class="card" style="${over?'border-color:var(--warn)':''}">
    <h2>اشتراكك</h2>
    <div class="cards" style="margin-top:12px">
      <div class="card"><div class="sub">الخطة</div><div class="val" style="font-size:1.15rem">${esc(plan?.name_ar||'مجاني')}</div></div>
      <div class="card"><div class="sub">AI</div><div class="val">${used} / ${limit}</div>${over?'<div class="sub" style="color:var(--warn)">تجاوز الحد</div>':''}</div>
      <div class="card"><div class="sub">التجديد</div><div class="val" style="font-size:1rem">${subRow?.current_period_end?new Date(subRow.current_period_end).toLocaleDateString('ar-SA'):'—'}</div></div>
    </div>
  </div>
  <div class="cards" style="margin-top:12px">${(plans||[]).map(p=>`
    <div class="card" style="${plan?.slug===p.slug?'border-color:var(--accent)':''}">
      <h2>${esc(p.name_ar)} ${plan?.slug===p.slug?'<span class="pill ok">الحالية</span>':''}</h2>
      <div class="val">${Number(p.price_monthly)===0?'مجاناً':Number(p.price_monthly).toLocaleString('ar-SA')+' ر.س'}</div>
      <div class="sub">${p.ai_requests_monthly} AI · ${p.max_projects} مشاريع · ${p.max_agents} وكلاء</div>
      <p class="sub">${esc(p.description_ar||'')}</p>
      ${plan?.slug===p.slug?'':`<button class="btn btn-primary btn-sm" data-upgrade="${esc(p.slug)}">${Number(p.price_monthly)===0?'التبديل':'طلب ترقية'}</button>`}
    </div>`).join('')}</div>`;
  $$('[data-upgrade]').forEach(b => b.onclick = async () => {
    const { data, error } = await db.rpc('request_plan_change', { p_plan_slug: b.dataset.upgrade, p_billing_cycle: 'monthly' });
    if (error) return toast(error.message, false);
    toast(data?.message || 'تم');
    await loadPlanUsage(); viewPlans(v);
  });
}

async function viewBilling(v) {
  const { data: inv } = await db.from('billing_invoices').select('*').eq('organization_id', orgId).order('created_at',{ascending:false}).limit(30);
  v.innerHTML = `<div class="card"><h2>الفواتير</h2>
    <p class="sub">الدفع الإلكتروني غير مفعّل بعد — الفواتير تُسجَّل للمعالجة اليدوية.</p>
    <table><thead><tr><th>المبلغ</th><th>الحالة</th><th>المزود</th><th>التاريخ</th></tr></thead>
    <tbody>${(inv||[]).map(i=>`<tr><td>${Number(i.amount).toLocaleString('ar-SA')} ${esc(i.currency||'SAR')}</td><td><span class="pill">${esc(i.status)}</span></td><td>${esc(i.provider||'—')}</td><td>${new Date(i.created_at).toLocaleDateString('ar-SA')}</td></tr>`).join('')||'<tr><td colspan="4" class="sub">لا فواتير</td></tr>'}
    </tbody></table></div>`;
}

async function viewNotifications(v) {
  const { data } = await db.from('notifications').select('*').eq('user_id', me.id).order('created_at',{ascending:false}).limit(50);
  v.innerHTML = `<div class="card"><h2>الإشعارات</h2>
    ${(data||[]).map(n=>`<div class="notif-item ${n.read_at?'':'unread'}" style="position:relative">
      <b>${esc(n.title_ar)}</b><div class="sub">${esc(n.body_ar||'')}</div>
      <small class="sub">${new Date(n.created_at).toLocaleString('ar-SA')}</small>
      ${n.read_at?'':`<button class="btn btn-ghost btn-sm" data-read="${n.id}" style="margin-top:6px">تعيين كمقروء</button>`}
    </div>`).join('')||'<p class="sub">لا إشعارات</p>'}
  </div>`;
  $$('[data-read]').forEach(b => b.onclick = async () => {
    await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', b.dataset.read);
    loadUnread(); viewNotifications(v);
  });
}

async function viewAccount(v) {
  v.innerHTML = `<div class="card"><h2>الحساب</h2>
    <p><b>البريد:</b> <span dir="ltr">${esc(me.email)}</span></p>
    <p><b>الاسم:</b> ${esc(me.full_name||'—')}</p>
    <p><b>الخطة:</b> ${esc(plan?.name_ar||'—')}</p>
    <button class="btn btn-ghost btn-sm" id="out">تسجيل الخروج</button>
  </div>`;
  $('#out').onclick = async () => { await db.auth.signOut(); location.reload(); };
}

const VIEWS = { home: viewHome, ai: viewAi, demos: viewDemos, projects: viewProjects, services: viewServices, plans: viewPlans, billing: viewBilling, notifications: viewNotifications, account: viewAccount };

async function route() {
  const id = (location.hash || '#home').slice(1);
  const item = NAV.find(n => n.id === id) || NAV[0];
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === item.id));
  $('#page-title').textContent = item.label;
  const v = $('#view');
  v.innerHTML = '<div class="skeleton"></div>';
  await (VIEWS[item.id] || viewHome)(v);
}

async function boot() {
  await window.TiqnoraDB.ready();
  db = window.TiqnoraDB.raw;
  if (!db) { $('#app-root').innerHTML = '<div class="boot">تعذر الاتصال بقاعدة البيانات</div>'; return; }
  const { data: { session } } = await db.auth.getSession();
  if (!session) { renderAuth(); return; }
  const { data: { user } } = await db.auth.getUser();
  let { data: profile } = await db.from('profiles').select('*').eq('id', user.id).single();
  if (!profile) { await new Promise(r => setTimeout(r, 800)); ({ data: profile } = await db.from('profiles').select('*').eq('id', user.id).single()); }
  if (!profile) { renderAuth('تعذر تحميل الملف الشخصي'); return; }
  me = profile;
  try { await ensureOrg(); await loadPlanUsage(); }
  catch (e) { renderAuth(e.message || 'تعذر تهيئة مساحة العميل'); return; }
  renderShell(); route();
  window.addEventListener('hashchange', route);
}
boot();
})();
