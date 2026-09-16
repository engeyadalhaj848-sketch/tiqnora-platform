/* Tiqnora Customer Portal — Phase 2 */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const cfg = window.TIQNORA_CONFIG || {};
let db = null, me = null, orgId = null, plan = null, usage = null;

const NAV = [
  { id: 'home', label: 'نظرة عامة', ic: '◈' },
  { id: 'ai', label: 'الذكاء الاصطناعي', ic: '✺' },
  { id: 'projects', label: 'المشاريع', ic: '▣' },
  { id: 'services', label: 'طلب خدمة', ic: '✦' },
  { id: 'plans', label: 'الاشتراك', ic: '◈' },
  { id: 'account', label: 'الحساب', ic: '◉' },
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
  plan = sub?.saas_plans || null;
  const ym = periodYm();
  const { data: u } = await db.from('usage_meters').select('*').eq('organization_id', orgId).eq('period_ym', ym).maybeSingle();
  usage = u || { ai_requests: 0, period_ym: ym };
  return { sub, plan, usage };
}

function renderAuth(msg = '') {
  $('#app-root').innerHTML = `<div class="auth-wrap"><div class="auth-card">
    <h1>بوابة عملاء Tiqnora</h1>
    <p>سجّل الدخول لإدارة مشاريعك واستخدام الذكاء الاصطناعي حسب خطتك.</p>
    <div class="err">${esc(msg)}</div>
    <form id="auth-form">
      <label>البريد</label><input name="email" type="email" required dir="ltr" autocomplete="email" />
      <label>كلمة المرور</label><input name="password" type="password" required minlength="8" autocomplete="current-password" />
      <button class="btn btn-primary" type="submit" data-mode="login">دخول</button>
      <button class="btn btn-ghost" type="button" id="toggle-mode" style="width:100%;margin-top:8px">إنشاء حساب جديد</button>
    </form>
    <p style="margin-top:14px;font-size:.85rem"><a href="/">العودة للموقع</a></p>
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
        toast('تم إنشاء الحساب — يمكنك الدخول الآن');
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
        <span class="pill">${esc(plan?.name_ar || '—')} · ${esc(me.email)}</span>
      </div>
      <div id="view"></div>
    </div>
  </div>`;
  $('#logout').onclick = async () => { await db.auth.signOut(); location.reload(); };
  $('#burger').onclick = () => $('#side').classList.toggle('open');
  $$('[data-nav]').forEach(a => a.onclick = e => { e.preventDefault(); location.hash = a.dataset.nav; route(); $('#side').classList.remove('open'); });
}

async function viewHome(v) {
  const limit = plan?.ai_requests_monthly ?? 20;
  const used = usage?.ai_requests ?? 0;
  const { count: projCount } = await db.from('customer_projects').select('id', { count: 'exact', head: true }).eq('organization_id', orgId);
  v.innerHTML = `<div class="cards">
    <div class="card"><div class="sub">الخطة</div><div class="val" style="font-size:1.1rem">${esc(plan?.name_ar || 'مجاني')}</div></div>
    <div class="card"><div class="sub">استخدام AI هذا الشهر</div><div class="val">${used} / ${limit}</div></div>
    <div class="card"><div class="sub">المشاريع</div><div class="val">${projCount || 0} / ${plan?.max_projects ?? 1}</div></div>
    <div class="card"><div class="sub">الوكلاء المتاحون</div><div class="val">${plan?.max_agents ?? 1}</div></div>
  </div>
  <div class="card"><h2>مرحباً في منصة Tiqnora</h2>
    <p style="color:var(--muted);line-height:1.7;margin:0">استخدم الذكاء الاصطناعي، أنشئ مشاريعك، واطلب خدمات التسويق والتقنية من مكان واحد.</p>
    <div class="row" style="margin-top:12px">
      <button class="btn btn-primary btn-sm" onclick="location.hash='ai'">بدء محادثة AI</button>
      <button class="btn btn-ghost btn-sm" onclick="location.hash='services'">طلب خدمة</button>
    </div>
  </div>`;
}

async function viewAi(v) {
  const limit = plan?.ai_requests_monthly ?? 20;
  const used = usage?.ai_requests ?? 0;
  const maxAgents = plan?.max_agents ?? 1;
  // Public agent list for customers: fixed catalog labels (server maps slug)
  const agents = [
    { slug: 'marketing', name: 'وكيل التسويق' },
    { slug: 'content', name: 'وكيل المحتوى' },
    { slug: 'social-media', name: 'وكيل التواصل' },
    { slug: 'developer', name: 'المساعد التقني' },
    { slug: 'commerce', name: 'وكيل التجارة' },
  ].slice(0, Math.max(1, maxAgents));
  v.innerHTML = `<div class="card">
    <h2>مساعدو الذكاء الاصطناعي</h2>
    <p class="sub">الاستخدام: ${used} / ${limit} هذا الشهر</p>
    <label>الوكيل</label>
    <select id="agent">${agents.map(a => `<option value="${a.slug}">${esc(a.name)}</option>`).join('')}</select>
    <div class="chat-log" id="log"></div>
    <div class="row">
      <input id="msg" placeholder="اكتب رسالتك…" />
      <button class="btn btn-primary btn-sm" id="send">إرسال</button>
    </div>
  </div>`;
  const log = $('#log');
  const append = (role, text) => {
    const d = document.createElement('div');
    d.className = `bubble ${role}`;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
  };
  $('#send').onclick = async () => {
    const message = $('#msg').value.trim();
    if (!message) return;
    if (used >= limit) { toast('وصلت لحد خطتك الشهري — رقِّ خطتك', false); return; }
    $('#msg').value = '';
    append('user', message);
    append('ai', '…');
    try {
      const { data: { session } } = await db.auth.getSession();
      const res = await fetch('/api/customer/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ agentSlug: $('#agent').value, message })
      });
      const payload = await res.json().catch(() => ({}));
      log.lastChild.remove();
      if (!res.ok) { append('ai', payload.error || 'تعذر الرد'); toast(payload.error || 'خطأ', false); return; }
      append('ai', payload.reply || '');
      await loadPlanUsage();
      $('#page-title').textContent = 'الذكاء الاصطناعي';
    } catch (e) {
      log.lastChild.textContent = e.message;
    }
  };
}

async function viewProjects(v) {
  const { data: rows } = await db.from('customer_projects').select('*').eq('organization_id', orgId).order('created_at', { ascending: false });
  v.innerHTML = `<div class="card"><h2>المشاريع</h2>
    <div class="row" style="margin-bottom:12px">
      <input id="pt" placeholder="عنوان مشروع جديد" />
      <button class="btn btn-primary btn-sm" id="add">إضافة</button>
    </div>
    <table><thead><tr><th>العنوان</th><th>الحالة</th><th>تاريخ</th></tr></thead>
    <tbody>${(rows || []).map(r => `<tr><td>${esc(r.title)}</td><td><span class="pill">${esc(r.status)}</span></td><td>${new Date(r.created_at).toLocaleDateString('ar-SA')}</td></tr>`).join('') || '<tr><td colspan="3" style="color:var(--muted)">لا مشاريع بعد</td></tr>'}
    </tbody></table></div>`;
  $('#add').onclick = async () => {
    const title = $('#pt').value.trim();
    if (!title) return;
    const max = plan?.max_projects ?? 1;
    if ((rows || []).length >= max) { toast('وصلت لحد المشاريع في خطتك', false); return; }
    await db.from('customer_projects').insert({ organization_id: orgId, created_by: me.id, title });
    toast('تمت الإضافة'); viewProjects(v);
  };
}

async function viewServices(v) {
  const cats = [
    ['ai_solutions', 'حلول الذكاء الاصطناعي'],
    ['digital_marketing', 'التسويق الرقمي'],
    ['seo', 'تحسين محركات البحث'],
    ['website_development', 'تطوير المواقع'],
    ['automation', 'الأتمتة'],
    ['social_media', 'إدارة التواصل'],
    ['it_services', 'خدمات تقنية المعلومات'],
    ['other', 'أخرى'],
  ];
  const { data: mine } = await db.from('service_requests').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(20);
  v.innerHTML = `<div class="grid2">
    <div class="card"><h2>طلب خدمة جديدة</h2>
      <label>التصنيف</label><select id="cat">${cats.map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select>
      <label>العنوان</label><input id="st" />
      <label>التفاصيل</label><textarea id="sd" rows="4"></textarea>
      <label>الجوال</label><input id="sp" dir="ltr" />
      <button class="btn btn-primary" id="sr">إرسال الطلب</button>
    </div>
    <div class="card"><h2>طلباتي</h2>
      <table><thead><tr><th>العنوان</th><th>الحالة</th></tr></thead>
      <tbody>${(mine || []).map(r => `<tr><td>${esc(r.title)}</td><td><span class="pill">${esc(r.status)}</span></td></tr>`).join('') || '<tr><td colspan="2" style="color:var(--muted)">لا طلبات</td></tr>'}
      </tbody></table>
    </div>
  </div>`;
  $('#sr').onclick = async () => {
    const title = $('#st').value.trim();
    if (!title) return toast('أدخل عنواناً', false);
    await db.from('service_requests').insert({
      organization_id: orgId, user_id: me.id, category: $('#cat').value,
      title, details: $('#sd').value.trim() || null, contact_phone: $('#sp').value.trim() || null,
      contact_email: me.email
    });
    toast('تم إرسال الطلب'); viewServices(v);
  };
}

async function viewPlans(v) {
  await loadPlanUsage();
  const { data: plans } = await db.from('saas_plans').select('*').eq('is_public', true).order('sort_order');
  const { data: sub } = await db.from('subscriptions').select('*, saas_plans(*)').eq('organization_id', orgId).maybeSingle();
  plan = sub?.saas_plans || plan;
  const limit = plan?.ai_requests_monthly ?? 20;
  const used = usage?.ai_requests ?? 0;
  const over = used >= limit;
  const { data: inv } = await db.from('billing_invoices').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(5);
  v.innerHTML = `
  <div class="card" style="${over ? 'border-color:var(--warn)' : ''}">
    <h2>اشتراكك الحالي</h2>
    <div class="cards" style="margin-top:12px">
      <div class="card"><div class="sub">الخطة</div><div class="val" style="font-size:1.15rem">${esc(plan?.name_ar || 'مجاني')}</div></div>
      <div class="card"><div class="sub">استخدام AI</div><div class="val">${used} / ${limit}</div>
        ${over ? '<div class="sub" style="color:var(--warn)">وصلت للحد — رقِّ خطتك</div>' : ''}</div>
      <div class="card"><div class="sub">المشاريع</div><div class="val">${plan?.max_projects ?? 1}</div></div>
      <div class="card"><div class="sub">الوكلاء</div><div class="val">${plan?.max_agents ?? 1}</div></div>
    </div>
    <p class="sub">التجديد: ${sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('ar-SA') : '—'}</p>
    <p style="color:var(--muted);line-height:1.6;margin:8px 0 0">${esc(plan?.description_ar || '')}</p>
  </div>
  <div class="cards" style="margin-top:12px">${(plans || []).map(p => `
    <div class="card" style="${plan?.slug === p.slug ? 'border-color:var(--accent)' : ''}">
      <h2>${esc(p.name_ar)} ${plan?.slug === p.slug ? '<span class="pill ok">الحالية</span>' : ''}</h2>
      <div class="val">${Number(p.price_monthly) === 0 ? 'مجاناً' : Number(p.price_monthly).toLocaleString('ar-SA') + ' ر.س'}</div>
      <div class="sub">شهرياً · ${p.ai_requests_monthly} AI · ${p.max_projects} مشاريع · ${p.max_agents} وكلاء</div>
      <p style="color:var(--muted);font-size:.85rem;margin:10px 0">${esc(p.description_ar || '')}</p>
      ${plan?.slug === p.slug ? '' : `<button class="btn btn-primary btn-sm" data-upgrade="${esc(p.slug)}">${Number(p.price_monthly)===0?'التبديل للمجاني':'طلب ترقية'}</button>`}
    </div>`).join('')}</div>
  <div class="card" style="margin-top:12px"><h2>الفواتير</h2>
    <table><thead><tr><th>المبلغ</th><th>الحالة</th><th>التاريخ</th></tr></thead>
    <tbody>${(inv||[]).map(i=>`<tr><td>${Number(i.amount).toLocaleString('ar-SA')} ${esc(i.currency||'SAR')}</td><td><span class="pill">${esc(i.status)}</span></td><td>${new Date(i.created_at).toLocaleDateString('ar-SA')}</td></tr>`).join('') || '<tr><td colspan="3" style="color:var(--muted)">لا فواتير بعد</td></tr>'}
    </tbody></table>
    <p style="color:var(--muted);font-size:.85rem;margin-top:10px">بوابات الدفع (Stripe / HyperPay / Tap / Mada) جاهزة معمارياً وغير مفعّلة بعد. طلب الترقية يُسجَّل ويُعالَج من الإدارة.</p>
  </div>`;
  $$('[data-upgrade]').forEach(b => b.onclick = async () => {
    const { data, error } = await db.rpc('request_plan_change', { p_plan_slug: b.dataset.upgrade, p_billing_cycle: 'monthly' });
    if (error) return toast(error.message, false);
    toast(data?.message || 'تم تسجيل الطلب');
    await loadPlanUsage();
    viewPlans(v);
  });
}

async function viewAccount(v) {
  v.innerHTML = `<div class="card"><h2>الحساب</h2>
    <p><b>البريد:</b> <span dir="ltr">${esc(me.email)}</span></p>
    <p><b>الاسم:</b> ${esc(me.full_name || '—')}</p>
    <p><b>الدور:</b> ${esc(me.role)}</p>
    <p><b>المنظمة:</b> <code dir="ltr">${esc(orgId)}</code></p>
    <button class="btn btn-ghost btn-sm" id="out">تسجيل الخروج</button>
  </div>`;
  $('#out').onclick = async () => { await db.auth.signOut(); location.reload(); };
}

const VIEWS = { home: viewHome, ai: viewAi, projects: viewProjects, services: viewServices, plans: viewPlans, account: viewAccount };

async function route() {
  const id = (location.hash || '#home').slice(1);
  const item = NAV.find(n => n.id === id) || NAV[0];
  $$('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === item.id));
  $('#page-title').textContent = item.label;
  const v = $('#view');
  v.innerHTML = '<p style="color:var(--muted)">…</p>';
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
  if (!profile) {
    await new Promise(r => setTimeout(r, 800));
    ({ data: profile } = await db.from('profiles').select('*').eq('id', user.id).single());
  }
  if (!profile) { renderAuth('تعذر تحميل الملف الشخصي'); return; }
  if (['admin', 'super_admin'].includes(profile.role)) {
    // Admins can still use customer portal against tiqnora org
  }
  me = profile;
  try {
    await ensureOrg();
    await loadPlanUsage();
  } catch (e) {
    renderAuth(e.message || 'تعذر تهيئة مساحة العميل');
    return;
  }
  renderShell();
  route();
  window.addEventListener('hashchange', route);
}

boot();
})();
