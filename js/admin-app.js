/* ============================================================
   TIQNORA AI — Admin Dashboard App v3
   Auth: Supabase Auth | Data: Supabase (RLS-protected)
   ============================================================ */
(() => {
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const cfg = window.TIQNORA_CONFIG || {};
const money = n => new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ر.س';
let db = null, me = null;

const STATUS_AR = { pending: 'بانتظار', confirmed: 'مؤكد', processing: 'تجهيز', shipped: 'مشحون', delivered: 'مسلّم', cancelled: 'ملغي', refunded: 'مسترجع', unpaid: 'غير مدفوع', paid: 'مدفوع', failed: 'فاشل', draft: 'مسودة', published: 'منشور', archived: 'مؤرشف' };
const pillCls = s => ['delivered', 'published', 'paid'].includes(s) ? 'ok' : ['pending', 'processing', 'draft', 'unpaid'].includes(s) ? 'warn' : ['cancelled', 'failed', 'refunded'].includes(s) ? 'danger' : 'muted';

function toast(msg, ok = true) {
  const t = $('#toast'); t.textContent = msg; t.style.borderColor = ok ? 'var(--ok)' : 'var(--danger)';
  t.classList.add('show'); clearTimeout(t._to); t._to = setTimeout(() => t.classList.remove('show'), 3200);
}
async function log(action, entity, entity_id, details = {}) {
  try { await db.from('activity_logs').insert({ user_id: me?.id, action, entity, entity_id: entity_id ? String(entity_id) : null, details }); } catch {}
}
const openModal = html => { $('#modal').innerHTML = html; $('#modal-back').classList.add('show'); };
const closeModal = () => $('#modal-back').classList.remove('show');
$('#modal-back')?.addEventListener('click', e => { if (e.target.id === 'modal-back') closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ============================================================
   LOGIN / BOOT
   ============================================================ */
function renderLogin(msg = '') {
  if (!window.TiqnoraDB?.isConfigured) {
    $('#app-root').innerHTML = `<div class="login-wrap"><div class="login-card">
      <img src="assets/tiqnora-logo.png" alt="Tiqnora"><h1>لوحة تحكم Tiqnora AI</h1>
      <p style="color:var(--muted);font-size:.85rem;line-height:1.8">لوحة التحكم تحتاج ربط Supabase.<br>افتح ملف <bdi dir="ltr"><code>js/config.js</code></bdi> وأضف <bdi dir="ltr"><code>supabaseUrl</code></bdi> و<bdi dir="ltr"><code>supabaseAnonKey</code></bdi> من إعدادات مشروعك في Supabase، ثم نفّذ ملفي <bdi dir="ltr"><code>supabase/schema.sql</code></bdi> و<bdi dir="ltr"><code>supabase/seed.sql</code></bdi> من <bdi dir="ltr"><code>SQL Editor</code></bdi>.</p>
      <a class="btn-primary" style="display:block;text-align:center;text-decoration:none;padding:10px" href="index.html">العودة للموقع</a></div></div>`;
    return;
  }
  $('#app-root').innerHTML = `<div class="login-wrap"><div class="login-card">
    <img src="assets/tiqnora-logo.png" alt="Tiqnora"><h1>دخول لوحة التحكم</h1>
    <form id="login-form">
      <label>البريد الإكتروني</label><input name="email" type="email" required dir="ltr" autocomplete="username" />
      <div style="height:12px"></div>
      <label>كلمة المرور</label><input name="password" type="password" required dir="ltr" autocomplete="current-password" />
      <div class="form-err">${esc(msg)}</div>
      <button class="btn-primary" style="width:100%" type="submit">دخول</button>
      <div style="text-align:center;margin-top:12px">
        <button type="button" class="btn-ghost btn-sm" id="signup-toggle" style="width:100%">إنشاء حساب مالك جديد (أول مرة فقط)</button>
      </div>
    </form>
    <p class="hint">أول مرة؟ أنشئ حساب المالك بالبريد <bdi dir="ltr"><b>${esc(cfg.ownerEmails?.[0] || '')}</b></bdi> — سيحصل تلقائيًا على صلاحية المالك.</p>
    <p class="hint" style="text-align:center;margin:10px 0 0"><a href="index.html">← العودة للموقع</a></p>
  </div></div>`;
  $('#signup-toggle').onclick = () => {
    const btn = $('#login-form button[type=submit]');
    const isSignup = btn.dataset.mode === 'signup';
    btn.dataset.mode = isSignup ? 'login' : 'signup';
    btn.textContent = isSignup ? 'دخول' : 'إنشاء الحساب';
    $('#signup-toggle').textContent = isSignup ? 'إنشاء حساب مالك جديد (أول مرة فقط)' : 'الرجوع لتسجيل الدخول';
    $('.form-err').textContent = '';
  };
  $('#login-form').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const email = f.get('email').trim(), password = f.get('password');
    const btn = e.target.querySelector('button[type=submit]');
    if (btn.dataset.mode === 'signup') {
      if (password.length < 8) { $('.form-err').textContent = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل'; return; }
      const { error } = await db.auth.signUp({ email, password });
      if (error) { renderLogin(error.message); return; }
      const isOwner = (cfg.ownerEmails || []).map(x => x.toLowerCase()).includes(email.toLowerCase());
      if (isOwner) { boot(); return; }
      renderLogin('تم إنشاء الحساب — انتظر تفعيل المالك ثم سجّل الدخول');
      return;
    }
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) { renderLogin(error.message === 'Invalid login credentials' ? 'بيانات الدخول غير صحيحة' : error.message); return; }
    boot();
  };
}

async function boot() {
  const ready = await window.TiqnoraDB.ready();
  db = window.TiqnoraDB.raw;
  if (ready && !db) {
    await new Promise(resolve => {
      let settled = false;
      const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
      const timer = setTimeout(finish, 10000);
      window.addEventListener('tiqnora:db-ready', finish, { once: true });
    });
    db = window.TiqnoraDB.raw;
  }
  if (!db) { renderLogin(); return; }
  const { data: { session } } = await db.auth.getSession();
  if (!session) { renderLogin(); return; }
  const { data: { user } } = await db.auth.getUser();
  let { data: profile } = await db.from('profiles').select('*').eq('id', user.id).single();
  if (!profile) { await new Promise(r => setTimeout(r, 1200)); ({ data: profile } = await db.from('profiles').select('*').eq('id', user.id).single()); }
  if (!profile) { renderLogin('تعذر إنشاء الملف الشخصي — تأكد من تنفيذ schema.sql'); return; }
  if (profile.role === 'customer') {
    $('#app-root').innerHTML = `<div class="login-wrap"><div class="login-card" style="text-align:center">
      <h1>حسابك ليس أدمن</h1><p style="color:var(--muted)">هذا الحساب بصلاحية عميل. تواصل مع المالك لترقية صلاحيتك.</p>
      <button class="btn-ghost" onclick="location.reload()">تحديث</button></div></div>`;
    return;
  }
  me = profile;
  renderShell();
  route(location.hash || '#dashboard');
}

/* ============================================================
   SHELL + ROUTING
   ============================================================ */
const NAV = [
  { group: 'عام' },
  { id: 'dashboard', ic: '◈', label: 'نظرة عامة' },
  { id: 'analytics', ic: '▦', label: 'التحليلات' },
  { id: 'growth', ic: '↗', label: 'النمو والسوق' },
  { id: 'blog', ic: '✎', label: 'المدونة SEO' },
  { id: 'notifications', ic: '◉', label: 'الإشعارات' },
  { id: 'orders', ic: '▤', label: 'الطلبات' },
  { id: 'leads', ic: '✉', label: 'استفسارات العملاء' },
  { id: 'customers', ic: '◉', label: 'العملاء' },
  { id: 'saas', ic: '◈', label: 'اشتراكات SaaS' },
  { id: 'service-requests', ic: '✉', label: 'طلبات الخدمات' },
  { group: 'الكتالوج' },
  { id: 'services', ic: '✦', label: 'الخدمات' },
  { id: 'categories', ic: '▤', label: 'الأقسام' },
  { id: 'products', ic: '▣', label: 'المنتجات' },
  { id: 'commerce', ic: '◫', label: 'Tiqnora Commerce AI' },
  { id: 'brands', ic: '⬢', label: 'الماركات' },
  { id: 'packages', ic: '◈', label: 'الباقات والأسعار' },
  { id: 'coupons', ic: '%', label: 'كوبونات الخصم' },
  { group: 'الموقع' },
  { id: 'cms', ic: '✎', label: 'المحتوى والإعدادات' },
  { id: 'pages', ic: '☰', label: 'الصفحات' },
  { id: 'media', ic: '▣', label: 'مكتبة الصور' },
  { id: 'seo', ic: '⌕', label: 'SEO وGEO' },
  { group: 'الأنظمة' },
  { id: 'workforce', ic: '✣', label: 'فريق الموظفين بالذكاء الاصطناعي' },
  { id: 'social-inbox', ic: '◎', label: 'صندوق التواصل الموحد' },
  { id: 'shipping', ic: '⇄', label: 'الشحن والتتبع' },
  { id: 'ai', ic: '✺', label: 'وحدات الذكاء الاصطناعي' },
  { id: 'users', ic: '◉', label: 'المستخدمون والصلاحيات' },
  { id: 'logs', ic: '≡', label: 'سجل النشاط' },
];

function renderShell() {
  $('#app-root').innerHTML = `
  <div class="admin-layout">
    <div class="side-backdrop" id="side-bd" style="display:none"></div>
    <aside class="admin-side" id="admin-side">
      <div class="side-brand"><img src="assets/tiqnora-logo.png" alt=""> <span>Tiqnora AI</span></div>
      ${NAV.map(n => n.group ? `<div class="side-group">${n.group}</div>` :
        `<a class="side-link" href="#${n.id}" data-nav="${n.id}"><span class="ic">${n.ic}</span>${n.label}</a>`).join('')}
      <div style="margin-top:auto;padding:12px 8px">
        <button class="btn-ghost btn-sm" id="logout" style="width:100%">تسجيل الخروج</button>
      </div>
    </aside>
    <div class="admin-main">
      <div class="admin-topbar">
        <div style="display:flex;align-items:center;gap:12px">
          <button class="burger" id="burger">☰</button>
          <h1 id="page-title">لوحة التحكم</h1>
        </div>
        <div class="topbar-user">
          <span>${esc(me.full_name || me.email)}</span>
          <span class="pill ${me.role === 'super_admin' ? 'ok' : ''}">${me.role === 'super_admin' ? 'مالك' : 'أدمن'}</span>
        </div>
      </div>
      <div id="view"></div>
    </div>
  </div>`;
  $('#logout').onclick = async () => { await db.auth.signOut(); location.reload(); };
  $('#burger').onclick = () => { $('#admin-side').classList.toggle('open'); $('#side-bd').style.display = $('#admin-side').classList.contains('open') ? 'block' : 'none'; };
  $('#side-bd').onclick = () => { $('#admin-side').classList.remove('open'); $('#side-bd').style.display = 'none'; };
  window.addEventListener('hashchange', () => route(location.hash));
}
function route(hash) {
  const id = (hash || '#dashboard').slice(1);
  const item = NAV.find(n => n.id === id) || NAV[1];
  $$('.side-link').forEach(a => a.classList.toggle('active', a.dataset.nav === item.id));
  $('#page-title').textContent = item.label;
  $('#admin-side').classList.remove('open'); $('#side-bd').style.display = 'none';
  const fn = VIEWS[item.id] || VIEWS.dashboard;
  fn($('#view'));
  $('#view').scrollIntoView?.({ block: 'start' });
}

/* ============================================================
   GENERIC CRUD HELPERS (field-def driven)
   ============================================================ */
function fieldInput(f, val) {
  const v = val ?? f.default ?? '';
  if (f.type === 'textarea') return `<textarea name="${f.k}" rows="3" ${f.req ? 'required' : ''}>${esc(v)}</textarea>`;
  if (f.type === 'select') return `<select name="${f.k}" ${f.req ? 'required' : ''}>${(f.options || []).map(o => `<option value="${esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${esc(o.t)}</option>`).join('')}</select>`;
  if (f.type === 'number') return `<input name="${f.k}" type="number" step="${f.step || 'any'}" value="${esc(v)}" ${f.req ? 'required' : ''}>`;
  if (f.type === 'checkbox') return `<label class="check-row"><input type="checkbox" name="${f.k}" ${v ? 'checked' : ''}> ${f.t}</label>`;
  if (f.type === 'list') return `<textarea name="${f.k}" rows="3" placeholder="عنصر في كل سطر">${esc(Array.isArray(v) ? v.join('\n') : v)}</textarea>`;
  return `<input name="${f.k}" type="${f.type === 'email' ? 'email' : 'text'}" value="${esc(v)}" dir="${f.dir || 'auto'}" ${f.req ? 'required' : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>`;
}
function readForm(form, fields) {
  const out = {};
  fields.forEach(f => {
    const el = form.elements[f.k]; if (!el) return;
    if (f.type === 'checkbox') out[f.k] = el.checked;
    else if (f.type === 'number') out[f.k] = el.value === '' ? null : Number(el.value);
    else if (f.type === 'list') out[f.k] = el.value.split('\n').map(x => x.trim()).filter(Boolean);
    else out[f.k] = el.value.trim() || null;
  });
  return out;
}
function crudModal({ title, fields, row, onSave }) {
  openModal(`<h3>${title}</h3><form id="crud-f"><div class="form-grid">
    ${fields.map(f => `<div class="${f.full ? 'full' : ''}">${f.type === 'checkbox' ? '' : `<label>${f.t}${f.req ? ' *' : ''}</label>`}${fieldInput(f, row ? row[f.k] : undefined)}</div>`).join('')}
  </div><div class="modal-foot"><button type="button" class="btn-ghost" id="m-cancel">إلغاء</button><button class="btn-primary" type="submit">حفظ</button></div></form>`);
  $('#m-cancel').onclick = closeModal;
  $('#crud-f').onsubmit = async e => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    try { await onSave(readForm(e.target, fields)); closeModal(); } catch (err) { toast('خطأ: ' + err.message, false); btn.disabled = false; }
  };
}
function tbl(heads, rowsHtml) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml || `<tr><td colspan="${heads.length}" class="empty">لا توجد بيانات بعد</td></tr>`}</tbody></table></div>`;
}
function dbBanner() {
  return `<div class="db-banner ok">✓ متصل بقاعدة بيانات Supabase — كل التعديلات تظهر فورًا على الموقع.</div>`;
}

/* ============================================================
   VIEWS
   ============================================================ */
const VIEWS = {};

VIEWS['social-inbox'] = async v => {
  v.innerHTML = dbBanner() + '<div class="grid-stats" id="social-stats"></div><div class="card"><h2>صندوق التواصل الموحد</h2><p class="card-desc">كل المنصات تدخل إلى مسار موحّد. إضافة منصة جديدة لا تغيّر بنية العملاء أو قواعد الأتمتة.</p><div class="social-filters" style="display:flex;gap:8px;flex-wrap:wrap;margin:14px 0"><select id="social-platform-filter"><option value="">كل المنصات</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="linkedin">LinkedIn</option><option value="tiktok">TikTok</option><option value="whatsapp">WhatsApp</option></select><select id="social-status-filter"><option value="">كل الحالات</option><option value="new">جديد</option><option value="matched">مطابق</option><option value="processed">تمت المعالجة</option><option value="ignored">متجاهل</option><option value="failed">فشل</option></select><select id="social-intent-filter"><option value="">كل النوايا</option><option value="business_audit">طلب تحليل</option></select></div><div id="social-events">جارٍ التحميل…</div></div>';
  const [{ data: connections = [] }, { data: events = [], error }] = await Promise.all([
    db.from('social_connections').select('id,platform,status'),
    db.from('social_events').select('*').order('received_at', { ascending: false }).limit(50)
  ]);
  if (error) { $('#social-events').innerHTML = '<div class="empty">نفّذ ملف الترحيل 004_social_inbox.sql في Supabase أولًا.</div>'; return; }
  const matched = events.filter(x => x.intent === 'business_audit').length;
  $('#social-stats').innerHTML = [
    ['المنصات المتصلة', connections.filter(x => x.status === 'active').length],
    ['الأحداث الجديدة', events.filter(x => x.processing_status === 'new').length],
    ['طلبات التحليل', matched]
  ].map(([t,n]) => `<div class="stat-card"><div class="stat-num">${n}</div><div class="stat-label">${t}</div></div>`).join('');
  const renderEvents = () => { const platform = $('#social-platform-filter').value, status = $('#social-status-filter').value, intent = $('#social-intent-filter').value; const filtered = events.filter(e => (!platform || e.platform === platform) && (!status || e.processing_status === status) && (!intent || e.intent === intent)); $('#social-events').innerHTML = tbl(['المنصة','العميل','المحتوى','النية','الحالة','وقت الاستلام'], filtered.map(e => `<tr><td>${esc(e.platform)}</td><td>${esc(e.author_name || '—')}</td><td>${esc(e.content || '—')}</td><td>${e.intent === 'business_audit' ? '<span class="pill ok">طلب تحليل</span>' : '—'}</td><td><span class="pill ${pillCls(e.processing_status)}">${esc(e.processing_status)}</span></td><td>${new Date(e.received_at).toLocaleString('ar-SA')}</td></tr>`).join('')); };
  ['social-platform-filter','social-status-filter','social-intent-filter'].forEach(id => { $('#' + id).onchange = renderEvents; }); renderEvents();
};

VIEWS.workforce = v => {
  v.innerHTML = `<div class="card"><h2>Tiqnora AI Workforce</h2><p class="card-desc">مساحة العمل الداخلية لمديري التسويق والمحتوى والتواصل الاجتماعي والتقنية بالذكاء الاصطناعي.</p><a class="btn-primary" style="display:inline-block;text-decoration:none;padding:10px 18px;margin-top:8px" href="/admin/ai-workforce/">فتح فريق العمل الذكي</a></div>`;
};

/* ---------- Dashboard ---------- */
VIEWS.dashboard = async v => {
  const ym = new Date().toISOString().slice(0, 7);
  const [
    orders, leads, products, services, shopCustomers, portalCustomers,
    agents, usageRows, reqs, subs, plans, invoices, notifs
  ] = await Promise.all([
    db.from('orders').select('id,order_number,customer_name,total,status,created_at').order('created_at',{ascending:false}).limit(8),
    db.from('leads').select('id').limit(500),
    db.from('products').select('id'),
    db.from('services').select('id'),
    db.from('customers').select('id'),
    db.from('profiles').select('id').eq('role','customer'),
    db.from('ai_agents').select('slug,is_enabled,status,model').eq('is_enabled', true),
    db.from('usage_meters').select('ai_requests,organization_id,period_ym').eq('period_ym', ym).limit(500),
    db.from('service_requests').select('id,status,title,created_at').order('created_at',{ascending:false}).limit(200),
    db.from('subscriptions').select('id,status,saas_plans(slug,name_ar,price_monthly)'),
    db.from('saas_plans').select('id,slug,is_public'),
    db.from('billing_invoices').select('amount,status').eq('status','pending'),
    db.from('notifications').select('id').eq('audience','admin').is('read_at', null).limit(100),
  ]);
  const aiUsed = (usageRows.data || []).reduce((s, r) => s + (r.ai_requests || 0), 0);
  const newReqs = (reqs.data || []).filter(r => r.status === 'new').length;
  const activeSubs = (subs.data || []).filter(s => s.status === 'active').length;
  const mrr = (subs.data || []).filter(s => s.status === 'active').reduce((s, x) => s + Number(x.saas_plans?.price_monthly || 0), 0);
  const pendingRev = (invoices.data || []).reduce((s, x) => s + Number(x.amount || 0), 0);
  v.innerHTML = `
  <div class="stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">
    <div class="card" style="padding:14px"><div style="color:var(--muted);font-size:.8rem">عملاء البوابة</div><div style="font-size:1.4rem;font-weight:700">${portalCustomers.data?.length||0}</div></div>
    <div class="card" style="padding:14px"><div style="color:var(--muted);font-size:.8rem">اشتراكات نشطة</div><div style="font-size:1.4rem;font-weight:700">${activeSubs}</div></div>
    <div class="card" style="padding:14px"><div style="color:var(--muted);font-size:.8rem">إيراد متوقع شهري</div><div style="font-size:1.25rem;font-weight:700">${money(mrr)}</div></div>
    <div class="card" style="padding:14px"><div style="color:var(--muted);font-size:.8rem">فواتير معلّقة</div><div style="font-size:1.25rem;font-weight:700">${money(pendingRev)}</div></div>
    <div class="card" style="padding:14px"><div style="color:var(--muted);font-size:.8rem">استخدام AI (${ym})</div><div style="font-size:1.4rem;font-weight:700">${aiUsed}</div></div>
    <div class="card" style="padding:14px"><div style="color:var(--muted);font-size:.8rem">طلبات خدمات جديدة</div><div style="font-size:1.4rem;font-weight:700">${newReqs}</div></div>
    <div class="card" style="padding:14px"><div style="color:var(--muted);font-size:.8rem">وكلاء نشطون</div><div style="font-size:1.4rem;font-weight:700">${agents.data?.length||0}</div></div>
    <div class="card" style="padding:14px"><div style="color:var(--muted);font-size:.8rem">إشعارات غير مقروءة</div><div style="font-size:1.4rem;font-weight:700">${notifs.data?.length||0}</div></div>
  </div>
  <div class="card"><div class="card-head"><h2 style="margin:0">آخر طلبات المتجر</h2><a class="btn-sm" href="#orders">الكل</a></div>
  <div style="overflow:auto">${tbl(['رقم','عميل','الإجمالي','حالة'], (orders.data||[]).map(o=>`<tr><td dir="ltr">${esc(o.order_number)}</td><td>${esc(o.customer_name)}</td><td>${money(o.total)}</td><td><span class="pill ${pillCls(o.status)}">${STATUS_AR[o.status]||o.status}</span></td></tr>`).join('') || '<tr><td colspan="4" style="color:var(--muted)">لا طلبات</td></tr>')}</div></div>
  <div class="card" style="margin-top:12px"><h2 style="margin-top:0">آخر طلبات الخدمات</h2>
    ${tbl(['العنوان','الحالة','تاريخ'], (reqs.data||[]).slice(0,6).map(r=>`<tr><td>${esc(r.title)}</td><td><span class="pill">${esc(r.status)}</span></td><td>${new Date(r.created_at).toLocaleDateString('ar-SA')}</td></tr>`).join('') || '<tr><td colspan="3" style="color:var(--muted)">لا طلبات</td></tr>')}
  </div>
  <div class="card" style="margin-top:12px"><h2 style="margin-top:0">اختصارات</h2>
    <div style="display:flex;flex-wrap:wrap;gap:8px">
      <a class="btn-sm btn-primary" href="#analytics">التحليلات</a>
      <a class="btn-sm" href="#saas">الاشتراكات</a>
      <a class="btn-sm" href="#service-requests">طلبات الخدمات</a>
      <a class="btn-sm" href="#workforce">فريق AI</a>
      <a class="btn-sm" href="#notifications">الإشعارات</a>
      <a class="btn-sm" href="/customer.html" target="_blank">بوابة العملاء</a>
    </div>
  </div>`;
};

VIEWS.services = async v => {
  v.innerHTML = dbBanner() + `<div class="card"><div class="card-head"><div><h2>الخدمات</h2><p class="card-desc">الخدمات المعروضة في الموقع الرئيسي — محتوى ثنائي اللغة مع حقول SEO.</p></div><button class="btn-primary" id="add">+ خدمة جديدة</button></div><div id="tbl"></div></div>`;
  const { data: cats } = await db.from('categories').select('*').eq('type', 'service').order('sort_order');
  const { data: rows } = await db.from('services').select('*, categories(name_ar)').order('sort_order');
  const F = SVC_FIELDS(cats || []);
  $('#tbl').innerHTML = tbl(['الخدمة', 'القسم', 'السعر', 'الفترة', 'الحالة', 'إجراءات'], (rows || []).map(s =>
    `<tr><td><b>${esc(s.title_ar)}</b><br><small style="color:var(--muted)" dir="ltr">${esc(s.title_en)}</small></td>
     <td>${esc(s.categories?.name_ar || '—')}</td><td>${money(s.price)}</td>
     <td><span class="pill muted">${s.period === 'monthly' ? 'شهري' : s.period === 'yearly' ? 'سنوي' : 'مرة'}</span></td>
     <td><span class="pill ${pillCls(s.status)}">${STATUS_AR[s.status]}</span></td>
     <td class="actions"><button class="btn-sm" data-edit="${s.id}">تعديل</button><button class="btn-sm btn-danger" data-del="${s.id}">حذف</button></td></tr>`).join(''));
  $('#add').onclick = () => crudModal({ title: 'خدمة جديدة', fields: F, row: null, onSave: async d => { await db.from('services').insert(d); log('service.create', 'services', null, { title: d.title_ar }); toast('تمت إضافة الخدمة'); VIEWS.services(v); } });
  $$('[data-edit]').forEach(b => b.onclick = () => { const row = rows.find(r => r.id === b.dataset.edit); crudModal({ title: 'تعديل خدمة', fields: F, row, onSave: async d => { await db.from('services').update(d).eq('id', row.id); log('service.update', 'services', row.id); toast('تم التحديث'); VIEWS.services(v); } }); });
  $$('[data-del]').forEach(b => b.onclick = async () => { if (!confirm('حذف هذه الخدمة نهائيًا؟')) return; const row = rows.find(r => r.id === b.dataset.del); await db.from('services').delete().eq('id', row.id); log('service.delete', 'services', row.id, { title: row.title_ar }); toast('تم الحذف'); VIEWS.services(v); });
};

/* ---------- Categories ---------- */
VIEWS.categories = async v => {
  v.innerHTML = `<div class="card"><div class="card-head"><div><h2>الأقسام</h2><p class="card-desc">أقسام الخدمات وأقسام منتجات المتجر.</p></div><button class="btn-primary" id="add">+ قسم جديد</button></div><div id="tbl"></div></div>`;
  const F = [
    { k: 'slug', t: 'المعرّف', req: 1, dir: 'ltr' },
    { k: 'type', t: 'النوع', type: 'select', options: [{ v: 'service', t: 'قسم خدمات' }, { v: 'product', t: 'قسم منتجات' }] },
    { k: 'name_ar', t: 'الاسم بالعربية', req: 1 }, { k: 'name_en', t: 'Name (EN)', req: 1, dir: 'ltr' },
    { k: 'icon', t: 'الأيقونة' }, { k: 'image_url', t: 'رابط صورة', dir: 'ltr' },
    { k: 'sort_order', t: 'الترتيب', type: 'number', default: 0 },
    { k: 'status', t: 'الحالة', type: 'select', options: [{ v: 'published', t: 'منشور' }, { v: 'draft', t: 'مسودة' }] },
    { k: 'description_ar', t: 'وصف (عربي)', type: 'textarea', full: 1 }, { k: 'description_en', t: 'Description (EN)', type: 'textarea', full: 1 },
  ];
  const { data: rows } = await db.from('categories').select('*').order('type').order('sort_order');
  const draw = () => $('#tbl').innerHTML = tbl(['القسم', 'النوع', 'الترتيب', 'الحالة', 'إجراءات'], (rows || []).map(c =>
    `<tr><td>${esc(c.icon || '')} <b>${esc(c.name_ar)}</b></td><td>${c.type === 'service' ? 'خدمات' : 'منتجات'}</td><td>${c.sort_order}</td><td><span class="pill ${pillCls(c.status)}">${STATUS_AR[c.status]}</span></td><td class="actions"><button class="btn-sm" data-edit="${c.id}">تعديل</button><button class="btn-sm btn-danger" data-del="${c.id}">حذف</button></td></tr>`).join(''));
  draw();
  const bind = () => {
    $('#add').onclick = () => crudModal({ title: 'قسم جديد', fields: F, onSave: async d => { await db.from('categories').insert(d); log('category.create', 'categories'); toast('تم الإضافة'); VIEWS.categories(v); } });
    $$('[data-edit]').forEach(b => b.onclick = () => { const row = rows.find(r => r.id === b.dataset.edit); crudModal({ title: 'تعديل قسم', fields: F, row, onSave: async d => { await db.from('categories').update(d).eq('id', row.id); toast('تم التحديث'); VIEWS.categories(v); } }); });
    $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm('حذف القسم؟')) { await db.from('categories').delete().eq('id', b.dataset.del); toast('تم الحذف'); VIEWS.categories(v); } });
  }; bind();
};

/* ---------- Products ---------- */
VIEWS.products = async v => {
  v.innerHTML = dbBanner() + `<div class="card"><div class="card-head"><div><h2>منتجات المتجر</h2><p class="card-desc">إدارة المخزون والأسعار والمواصفات وصور المنتجات.</p></div><button class="btn-primary" id="add">+ منتج جديد</button></div><div id="tbl"></div></div>`;
  const [{ data: cats }, { data: brands }] = await Promise.all([
    db.from('categories').select('*').eq('type', 'product').order('sort_order'),
    db.from('brands').select('*').order('name')]);
  const F = [
    { k: 'name_ar', t: 'اسم المنتج (عربي)', req: 1 }, { k: 'name_en', t: 'Name (EN)', req: 1, dir: 'ltr' },
    { k: 'slug', t: 'المعرّف', req: 1, dir: 'ltr', ph: 'cisco-switch-24port' },
    { k: 'sku', t: 'SKU', dir: 'ltr' },
    { k: 'category_id', t: 'القسم', type: 'select', options: [{ v: '', t: '—' }, ...(cats || []).map(c => ({ v: c.id, t: c.name_ar }))] },
    { k: 'brand_id', t: 'الماركة', type: 'select', options: [{ v: '', t: '—' }, ...(brands || []).map(b => ({ v: b.id, t: b.name }))] },
    { k: 'price', t: 'سعر البيع (ر.س)', type: 'number', req: 1 },
    { k: 'discount_percent', t: 'خصم %', type: 'number' },
    { k: 'cost_price', t: 'سعر التكلفة', type: 'number' },
    { k: 'supplier_name', t: 'المورد (يدوي)', ph: 'AliExpress / CJ / محلي' },
    { k: 'supplier_url', t: 'رابط المورد', dir: 'ltr', ph: 'https://...' },
    { k: 'fulfillment_type', t: 'طريقة التنفيذ', type: 'select', options: [{ v: 'own_stock', t: 'مخزون Tiqnora' }, { v: 'dropship', t: 'دروبشيبنغ — مورد خارجي' }] },
    { k: 'delivery_note_ar', t: 'ملاحظة الشحن للعميل', ph: 'يصل خلال 7–14 يوم عمل' },
    { k: 'campaign_tags', t: 'وسوم الحملة (سطر أو فواصل: national-day)', type: 'list', full: 1, dir: 'ltr' },
    { k: 'stock_quantity', t: 'الكمية بالمخزون', type: 'number', default: 0 },
    { k: 'track_stock', t: 'تتبع المخزون', type: 'checkbox', default: true },
    { k: 'is_active', t: 'ظاهر في المتجر', type: 'checkbox', default: true },
    { k: 'featured', t: 'منتج مميز', type: 'checkbox' },
    { k: 'sort_order', t: 'الترتيب', type: 'number', default: 0 },
    { k: 'images', t: 'روابط الصور (رابط في كل سطر)', type: 'list', full: 1, dir: 'ltr' },
    { k: 'description_ar', t: 'الوصف (عربي)', type: 'textarea', full: 1 },
    { k: 'description_en', t: 'Description (EN)', type: 'textarea', full: 1, dir: 'ltr' },
    { k: 'seo_title_ar', t: 'SEO عنوان' }, { k: 'seo_description_ar', t: 'SEO وصف', type: 'textarea' },
  ];
  const { data: rows } = await db.from('products').select('*, categories(name_ar), brands(name)').order('sort_order');
  const margin = (p) => {
    const cost = Number(p.cost_price);
    const price = Number(p.price);
    if (!cost || !price || cost <= 0) return '—';
    const m = ((price - cost) / price) * 100;
    return m.toFixed(0) + '%';
  };
  $('#tbl').innerHTML = tbl(['المنتج', 'المورد', 'بيع', 'تكلفة', 'هامش', 'المخزون', 'الحالة', 'إجراءات'], (rows || []).map(p =>
    `<tr><td><b>${esc(p.name_ar)}</b>${p.sku ? `<br><small style="color:var(--muted)" dir="ltr">${esc(p.sku)}</small>` : ''}${p.fulfillment_type==='dropship'?' <span class="pill warn">DS</span>':''}${(p.campaign_tags||[]).includes('national-day')?' <span class="pill ok">وطني</span>':''}</td>
     <td>${esc(p.supplier_name || '—')}</td>
     <td>${money(p.price)}${p.discount_percent > 0 ? ` <span class="pill warn">-${p.discount_percent}%</span>` : ''}</td>
     <td>${p.cost_price != null ? money(p.cost_price) : '—'}</td>
     <td><b>${margin(p)}</b></td>
     <td>${p.track_stock ? (p.stock_quantity > 3 ? `<span class="pill ok">${p.stock_quantity}</span>` : `<span class="pill danger">${p.stock_quantity}</span>`) : '—'}</td>
     <td><span class="pill ${p.is_active ? 'ok' : 'muted'}">${p.is_active ? 'ظاهر' : 'مخفي'}</span></td>
     <td class="actions"><button class="btn-sm" data-edit="${p.id}">تعديل</button><button class="btn-sm btn-danger" data-del="${p.id}">حذف</button></td></tr>`).join(''));
  const fixImgs = d => {
    if (typeof d.images === 'string') d.images = d.images.split(/\n+/).map(s=>s.trim()).filter(Boolean);
    if (typeof d.campaign_tags === 'string') d.campaign_tags = d.campaign_tags.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
    if (Array.isArray(d.campaign_tags) === false && d.campaign_tags) d.campaign_tags = [String(d.campaign_tags)];
    return d;
  };
  $('#add').onclick = () => crudModal({ title: 'منتج جديد', fields: F, onSave: async d => { await db.from('products').insert(fixImgs(d)); log('product.create', 'products'); toast('تمت إضافة المنتج'); VIEWS.products(v); } });
  $$('[data-edit]').forEach(b => b.onclick = () => { const row = rows.find(r => r.id === b.dataset.edit); crudModal({ title: 'تعديل منتج', fields: F, row: { ...row, images: (row.images || []).join('\n') }, onSave: async d => { await db.from('products').update(d).eq('id', row.id); log('product.update', 'products', row.id); toast('تم التحديث'); VIEWS.products(v); } }); });
  $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm('حذف المنتج نهائيًا؟')) { await db.from('products').delete().eq('id', b.dataset.del); toast('تم الحذف'); VIEWS.products(v); } });
};

/* ---------- Tiqnora Commerce AI ---------- */
VIEWS.commerce = async v => {
  v.innerHTML = dbBanner() + `<div class="card"><div class="card-head"><div><h2>Tiqnora Commerce AI</h2><p class="card-desc">إدارة البيع بدون مخزون. الوكلاء يقترحون ويجهزون؛ اعتماد المنتج وتنفيذ طلب المورد يتطلبان موافقة المالك.</p></div><button class="btn-primary" id="add-source">+ إضافة منتج مرشح</button></div><div id="commerce-summary" class="grid-stats"></div></div><div class="card"><h2>الموردون والتكاملات</h2><div id="supplier-list">جارٍ التحميل…</div></div><div class="card"><h2>مرشحات المنتجات</h2><div id="candidate-list">جارٍ التحميل…</div></div><div class="card"><h2>طلبات التنفيذ</h2><div id="fulfillment-list">جارٍ التحميل…</div></div>`;
  const [suppliersRes, candidatesRes, requestsRes] = await Promise.all([
    db.from('commerce_suppliers').select('*').order('display_name'),
    db.from('supplier_products').select('*, commerce_suppliers(display_name,provider), products(name_ar)').order('created_at',{ascending:false}).limit(100),
    db.from('fulfillment_requests').select('*, orders(order_number,customer_name), commerce_suppliers(display_name)').order('created_at',{ascending:false}).limit(50)
  ]);
  if (suppliersRes.error || candidatesRes.error || requestsRes.error) {
    v.innerHTML = `<div class="card"><h2>Tiqnora Commerce AI</h2><p class="card-desc">يلزم تنفيذ ملف <code dir="ltr">009_commerce_ai_dropshipping.sql</code> في Supabase SQL Editor أولًا، ثم أعد تحميل اللوحة.</p></div>`; return;
  }
  const suppliers = suppliersRes.data || [], candidates = candidatesRes.data || [], requests = requestsRes.data || [];
  $('#commerce-summary').innerHTML = [['الموردون المتصلون', suppliers.filter(x=>x.status==='connected').length],['منتجات بانتظار المراجعة',candidates.filter(x=>x.approval_status==='candidate').length],['طلبات بانتظار الاعتماد',requests.filter(x=>x.status==='awaiting_approval').length]].map(([t,n])=>`<div class="stat-card"><div class="stat-num">${n}</div><div class="stat-label">${t}</div></div>`).join('');
  $('#supplier-list').innerHTML = tbl(['المورد','الحالة','تنفيذ الطلب','الدول','إجراء'], suppliers.map(s=>`<tr><td><b>${esc(s.display_name)}</b><br><small dir="ltr">${esc(s.provider)}</small></td><td><span class="pill ${s.status==='connected'?'ok':s.status==='error'?'danger':'warn'}">${esc(s.status)}</span></td><td>${s.fulfillment_mode==='approval_required'?'موافقة إلزامية':esc(s.fulfillment_mode)}</td><td dir="ltr">${esc((s.shipping_countries||[]).join(', '))}</td><td><button class="btn-sm" data-supplier="${s.id}">تحديث الإعداد</button></td></tr>`).join(''));
  $('#candidate-list').innerHTML = tbl(['المنتج المصدر','المورد','التكلفة','التوصيل','الحالة','إجراء'], candidates.map(c=>`<tr><td><b>${esc(c.source_title||'—')}</b><br><small dir="ltr">${esc(c.external_product_id)}</small></td><td>${esc(c.commerce_suppliers?.display_name||'—')}</td><td>${c.source_price == null ? '—' : `${c.source_price} ${esc(c.source_currency)}`}</td><td>${c.estimated_delivery_min_days||'?'}–${c.estimated_delivery_max_days||'?'} يوم</td><td><span class="pill ${c.approval_status==='approved'?'ok':c.approval_status==='rejected'?'danger':'warn'}">${esc(c.approval_status)}</span></td><td><button class="btn-sm" data-candidate="${c.id}">مراجعة</button></td></tr>`).join(''));
  $('#fulfillment-list').innerHTML = tbl(['الطلب','المورد','الحالة','المرجع','إجراء'], requests.map(r=>`<tr><td dir="ltr">${esc(r.orders?.order_number||'—')}</td><td>${esc(r.commerce_suppliers?.display_name||'—')}</td><td><span class="pill ${r.status==='fulfilled'?'ok':r.status==='failed'?'danger':'warn'}">${esc(r.status)}</span></td><td dir="ltr">${esc(r.supplier_order_reference||'—')}</td><td>${r.status==='awaiting_approval'?`<button class="btn-sm btn-primary" data-approve="${r.id}">اعتماد للتنفيذ</button>`:'—'}</td></tr>`).join(''));
  $$('[data-supplier]').forEach(b=>b.onclick=()=>{ const s=suppliers.find(x=>x.id===b.dataset.supplier); crudModal({title:`إعداد ${s.display_name}`,fields:[{k:'status',t:'حالة الاتصال',type:'select',options:[{v:'not_configured',t:'غير مهيأ'},{v:'pending',t:'بانتظار الربط'},{v:'connected',t:'متصل'},{v:'paused',t:'موقوف'}]},{k:'fulfillment_mode',t:'طريقة التنفيذ',type:'select',options:[{v:'approval_required',t:'موافقة إلزامية'},{v:'semi_automatic',t:'شبه تلقائي'}]}],row:s,onSave:async d=>{await db.from('commerce_suppliers').update(d).eq('id',s.id);log('commerce.supplier.update','commerce_suppliers',s.id,d);toast('تم حفظ إعداد المورد');VIEWS.commerce(v);}});});
  $$('[data-candidate]').forEach(b=>b.onclick=()=>{ const c=candidates.find(x=>x.id===b.dataset.candidate); crudModal({title:'مراجعة منتج مرشح',fields:[{k:'approval_status',t:'القرار',type:'select',options:[{v:'candidate',t:'قيد المراجعة'},{v:'approved',t:'معتمد'},{v:'rejected',t:'مرفوض'},{v:'paused',t:'موقوف'}]},{k:'review_notes',t:'ملاحظات',type:'textarea',full:1}],row:c,onSave:async d=>{await db.from('supplier_products').update(d).eq('id',c.id);log('commerce.candidate.review','supplier_products',c.id,d);toast('تم حفظ القرار');VIEWS.commerce(v);}});});
  $$('[data-approve]').forEach(b=>b.onclick=async()=>{if(!confirm('اعتماد هذا الطلب لإرساله للمورد؟ لن يتم الإرسال تلقائيًا من Tiqnora في هذه المرحلة.'))return; await db.from('fulfillment_requests').update({status:'approved',approved_by:me.id,approved_at:new Date().toISOString()}).eq('id',b.dataset.approve);log('commerce.fulfillment.approve','fulfillment_requests',b.dataset.approve);toast('تم الاعتماد — جاهز للإرسال عبر التكامل الرسمي');VIEWS.commerce(v);});
  $('#add-source').onclick=()=>crudModal({title:'إضافة منتج مرشح من مورد',fields:[{k:'supplier_id',t:'المورد',type:'select',req:1,options:suppliers.map(s=>({v:s.id,t:s.display_name}))},{k:'external_product_id',t:'رقم/معرف المنتج عند المورد',req:1,dir:'ltr'},{k:'source_url',t:'رابط المنتج عند المورد',req:1,dir:'ltr'},{k:'source_title',t:'اسم المنتج عند المورد',full:1},{k:'source_price',t:'سعر المورد',type:'number'},{k:'source_currency',t:'العملة',default:'USD',dir:'ltr'},{k:'shipping_cost',t:'تكلفة الشحن',type:'number',default:0},{k:'estimated_delivery_min_days',t:'أقل مدة توصيل (يوم)',type:'number'},{k:'estimated_delivery_max_days',t:'أعلى مدة توصيل (يوم)',type:'number'}],onSave:async d=>{await db.from('supplier_products').insert(d);log('commerce.candidate.create','supplier_products',null,{supplier_id:d.supplier_id});toast('تمت إضافة المنتج للمراجعة');VIEWS.commerce(v);}});
};

/* ---------- Brands ---------- */
VIEWS.brands = async v => {
  v.innerHTML = `<div class="card"><div class="card-head"><div><h2>الماركات</h2></div><button class="btn-primary" id="add">+ ماركة</button></div><div id="tbl"></div></div>`;
  const F = [{ k: 'name', t: 'اسم الماركة', req: 1 }, { k: 'slug', t: 'المعرّف', req: 1, dir: 'ltr' }, { k: 'logo_url', t: 'رابط الشعار', dir: 'ltr' }, { k: 'status', t: 'الحالة', type: 'select', options: [{ v: 'published', t: 'منشور' }, { v: 'draft', t: 'مسودة' }] }];
  const { data: rows } = await db.from('brands').select('*').order('name');
  $('#tbl').innerHTML = tbl(['الماركة', 'الحالة', 'إجراءات'], (rows || []).map(b => `<tr><td>${esc(b.name)}</td><td><span class="pill ${pillCls(b.status)}">${STATUS_AR[b.status]}</span></td><td class="actions"><button class="btn-sm" data-edit="${b.id}">تعديل</button><button class="btn-sm btn-danger" data-del="${b.id}">حذف</button></td></tr>`).join(''));
  $('#add').onclick = () => crudModal({ title: 'ماركة جديدة', fields: F, onSave: async d => { await db.from('brands').insert(d); toast('تمت الإضافة'); VIEWS.brands(v); } });
  $$('[data-edit]').forEach(b => b.onclick = () => { const row = rows.find(r => r.id === b.dataset.edit); crudModal({ title: 'تعديل ماركة', fields: F, row, onSave: async d => { await db.from('brands').update(d).eq('id', row.id); toast('تم التحديث'); VIEWS.brands(v); } }); });
  $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm('حذف الماركة؟')) { await db.from('brands').delete().eq('id', b.dataset.del); toast('تم الحذف'); VIEWS.brands(v); } });
};

/* ---------- Packages ---------- */
VIEWS.packages = async v => {
  v.innerHTML = `<div class="card"><div class="card-head"><div><h2>الباقات والأسعار</h2><p class="card-desc">الباقات المعروضة في قسم الأسعار بالموقع.</p></div><button class="btn-primary" id="add">+ باقة</button></div><div id="tbl"></div></div>`;
  const F = [
    { k: 'name_ar', t: 'الاسم (عربي)', req: 1 }, { k: 'name_en', t: 'Name (EN)', req: 1, dir: 'ltr' },
    { k: 'slug', t: 'المعرّف', req: 1, dir: 'ltr' },
    { k: 'billing_type', t: 'نوع الفوترة', type: 'select', options: [{ v: 'monthly', t: 'شهري' }, { v: 'yearly', t: 'سنوي' }, { v: 'one_time', t: 'مرة واحدة' }, { v: 'range', t: 'نطاق سعري' }] },
    { k: 'price_monthly', t: 'السعر الشهري (ر.س)', type: 'number' },
    { k: 'price_yearly', t: 'السعر السنوي (ر.س)', type: 'number' },
    { k: 'price_range_min', t: 'أقل سعر بالنطاق', type: 'number' }, { k: 'price_range_max', t: 'أعلى سعر بالنطاق', type: 'number' },
    { k: 'discount_percent', t: 'خصم %', type: 'number' },
    { k: 'is_visible', t: 'ظاهرة بالموقع', type: 'checkbox', default: true },
    { k: 'featured', t: 'الأكثر اختيارًا', type: 'checkbox' },
    { k: 'sort_order', t: 'الترتيب', type: 'number', default: 0 },
    { k: 'description_ar', t: 'الوصف (عربي)', type: 'textarea', full: 1 },
    { k: 'description_en', t: 'Description (EN)', type: 'textarea', full: 1, dir: 'ltr' },
    { k: 'features_ar', t: 'المزايا (عربي) — سطر لكل ميزة', type: 'list', full: 1 },
    { k: 'features_en', t: 'Features (EN) — one per line', type: 'list', full: 1, dir: 'ltr' },
  ];
  const { data: rows } = await db.from('packages').select('*').order('sort_order');
  $('#tbl').innerHTML = tbl(['الباقة', 'النوع', 'السعر', 'الظهور', 'إجراءات'], (rows || []).map(p =>
    `<tr><td><b>${esc(p.name_ar)}</b>${p.featured ? ' <span class="pill ok">مميزة</span>' : ''}</td><td>${{ monthly: 'شهري', yearly: 'سنوي', one_time: 'مرة', range: 'نطاق' }[p.billing_type] || p.billing_type}</td>
     <td>${p.billing_type === 'range' ? `${p.price_range_min || 0} - ${p.price_range_max || '+ قيمة'}` : money(p.price_monthly)}</td>
     <td><span class="pill ${p.is_visible ? 'ok' : 'muted'}">${p.is_visible ? 'ظاهرة' : 'مخفية'}</span></td>
     <td class="actions"><button class="btn-sm" data-edit="${p.id}">تعديل</button><button class="btn-sm btn-danger" data-del="${p.id}">حذف</button></td></tr>`).join(''));
  $('#add').onclick = () => crudModal({ title: 'باقة جديدة', fields: F, onSave: async d => { await db.from('packages').insert(d); toast('تمت الإضافة'); VIEWS.packages(v); } });
  $$('[data-edit]').forEach(b => b.onclick = () => { const row = rows.find(r => r.id === b.dataset.edit); crudModal({ title: 'تعديل باقة', fields: F, row: { ...row, features_ar: (row.features_ar || []).join('\n'), features_en: (row.features_en || []).join('\n') }, onSave: async d => { await db.from('packages').update(d).eq('id', row.id); toast('تم التحديث'); VIEWS.packages(v); } }); });
  $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm('حذف الباقة؟')) { await db.from('packages').delete().eq('id', b.dataset.del); toast('تم الحذف'); VIEWS.packages(v); } });
};

/* ---------- Orders ---------- */
VIEWS.orders = async v => {
  v.innerHTML = dbBanner() + `<div class="card"><div class="card-head"><div><h2>الطلبات</h2><p class="card-desc">إدارة الطلبات وتحديث حالتها وإنشاء شحنات.</p></div></div><div id="tbl"></div></div>`;
  const { data: rows } = await db.from('orders').select('*').order('created_at', { ascending: false }).limit(200);
  $('#tbl').innerHTML = tbl(['رقم الطلب', 'العميل', 'الجوال', 'الإجمالي', 'الدفع', 'الحالة', 'التاريخ', 'إجراءات'], (rows || []).map(o =>
    `<tr><td dir="ltr"><b>${esc(o.order_number)}</b></td><td>${esc(o.customer_name)}<br><small style="color:var(--muted)">${esc(o.shipping_city || '')}</small></td><td dir="ltr">${esc(o.customer_phone)}</td><td>${money(o.total)}</td>
     <td><span class="pill ${pillCls(o.payment_status)}">${STATUS_AR[o.payment_status]}</span></td>
     <td><span class="pill ${pillCls(o.status)}">${STATUS_AR[o.status]}</span></td>
     <td style="color:var(--muted);white-space:nowrap">${new Date(o.created_at).toLocaleDateString('ar-SA')}</td>
     <td class="actions"><button class="btn-sm btn-primary" data-view="${o.id}">تفاصيل</button></td></tr>`).join(''));
  $$('[data-view]').forEach(b => b.onclick = async () => {
    const o = rows.find(r => r.id === b.dataset.view);
    const { data: items } = await db.from('order_items').select('*').eq('order_id', o.id);
    const { data: ship } = await db.from('shipments').select('*').eq('order_id', o.id).maybeSingle();
    openModal(`<h3>الطلب ${esc(o.order_number)}</h3>
      <div class="kv" style="margin-bottom:16px">
        <span class="k">العميل</span><span>${esc(o.customer_name)}</span>
        <span class="k">الجوال</span><span dir="ltr">${esc(o.customer_phone)}</span>
        <span class="k">البريد</span><span dir="ltr">${esc(o.customer_email || '—')}</span>
        <span class="k">المدينة/العنوان</span><span>${esc(o.shipping_city || '')} — ${esc(o.shipping_address || '')}</span>
        <span class="k">الإجمالي</span><span>${money(o.total)} (شحن ${money(o.shipping_cost)})</span>
        <span class="k">طريقة الدفع</span><span>${{ cod: 'دفع عند الاستلام', bank_transfer: 'تحويل بنكي', mada: 'مدى', credit_card: 'بطاقة', apple_pay: 'Apple Pay' }[o.payment_method] || o.payment_method}</span>
        ${o.notes ? `<span class="k">ملاحظات</span><span>${esc(o.notes)}</span>` : ''}
      </div>
      ${tbl(['العنصر', 'السعر', 'الكمية', 'المجموع'], (items || []).map(i => `<tr><td>${esc(i.title_ar)}</td><td>${money(i.unit_price)}</td><td>${i.quantity}</td><td>${money(i.line_total)}</td></tr>`).join(''))}
      <div class="form-grid" style="margin-top:18px">
        <div><label>حالة الطلب</label><select id="o-status">${['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'].map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${STATUS_AR[s]}</option>`).join('')}</select></div>
        <div><label>حالة الدفع</label><select id="o-pay">${['unpaid', 'paid', 'failed', 'refunded'].map(s => `<option value="${s}" ${o.payment_status === s ? 'selected' : ''}>${STATUS_AR[s]}</option>`).join('')}</select></div>
      </div>
      <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:14px">
        <strong>الشحنة</strong>
        ${ship ? `<div class="kv" style="margin-top:8px"><span class="k">الناقل</span><span>${ship.provider.toUpperCase()}</span><span class="k">رقم البوليصة</span><span dir="ltr">${esc(ship.awb_number || '—')}</span><span class="k">الحالة</span><span>${STATUS_AR[ship.status] || ship.status}</span></div>` : `<div class="form-grid" style="margin-top:10px">
          <div><label>الناقل</label><select id="sh-provider">${['smsa', 'spl', 'aramex', 'dhl', 'custom'].map(p => `<option value="${p}">${p.toUpperCase()}</option>`).join('')}</select></div>
          <div><label>رقم البوليصة (AWB)</label><input id="sh-awb" dir="ltr" placeholder="اختياري — بعد إنشاء الشحنة"></div>
          <div><label>رابط التتبع</label><input id="sh-url" dir="ltr" placeholder="https://..."></div>
        </div>`}
      </div>
      <div class="modal-foot"><button class="btn-ghost" id="m-cancel">إغلاق</button><button class="btn-primary" id="m-save">حفظ التحديثات</button></div>`);
    $('#m-cancel').onclick = closeModal;
    $('#m-save').onclick = async () => {
      await db.from('orders').update({ status: $('#o-status').value, payment_status: $('#o-pay').value }).eq('id', o.id);
      if (!ship) {
        const awb = $('#sh-awb')?.value.trim(), url = $('#sh-url')?.value.trim(), prov = $('#sh-provider')?.value;
        if (prov && (awb || url)) await db.from('shipments').insert({ order_id: o.id, provider: prov, awb_number: awb || null, tracking_url: url || null, status: awb ? 'created' : 'pending' });
      }
      log('order.update', 'orders', o.id, { status: $('#o-status').value });
      toast('تم تحديث الطلب'); closeModal(); VIEWS.orders(v);
    };
  });
};

/* ---------- Leads ---------- */
VIEWS.leads = async v => {
  v.innerHTML = `<div class="card"><h2>إدارة العملاء المحتملين (Leads)</h2>
    <p class="card-desc">مصدر، اهتمام، ملاحظات، وحالة — مع أتمتة ترحيب داخلية.</p>
    <div id="tbl"></div></div>
    <div class="card"><h2>أحداث Analytics (أحدث)</h2><div id="ev"></div></div>
    <div class="card"><h2>أتمتة تسويق</h2><div id="auto"></div></div>`;
  const LBL = { new: 'جديد', contacted: 'تم التواصل', qualified: 'مؤهل', converted: 'تحوّل لعميل', closed: 'مغلق' };
  const { data: rows } = await db.from('leads').select('*').order('created_at', { ascending: false }).limit(300);
  $('#tbl').innerHTML = tbl(['الاسم','المصدر','الاهتمام','البريد','الحالة','ملاحظات','تاريخ'], (rows || []).map(l =>
    `<tr>
      <td>${esc(l.name)}${l.company?`<br><small>${esc(l.company)}</small>`:''}</td>
      <td>${esc(l.source||'—')}</td>
      <td style="max-width:160px">${esc(l.interest||l.message||'')}</td>
      <td dir="ltr">${esc(l.email||'—')}<br>${esc(l.phone||'')}</td>
      <td><select data-st="${l.id}">${Object.entries(LBL).map(([k,t])=>`<option value="${k}" ${l.status===k?'selected':''}>${t}</option>`).join('')}</select></td>
      <td><input data-notes="${l.id}" value="${esc(l.notes||'')}" style="width:140px" placeholder="ملاحظة" /></td>
      <td style="white-space:nowrap;color:var(--muted)">${new Date(l.created_at).toLocaleDateString('ar-SA')}</td>
    </tr>`).join('') || '<tr><td colspan="7" style="color:var(--muted)">لا عملاء محتملين بعد</td></tr>');
  $$('[data-st]').forEach(s => s.onchange = async () => {
    await db.from('leads').update({ status: s.value, updated_at: new Date().toISOString() }).eq('id', s.dataset.st);
    if (s.value === 'converted') {
      await db.from('marketing_automations').insert({ lead_id: s.dataset.st, kind: 'upgrade_reminder', channel: 'internal', status: 'pending', payload: { reason: 'converted' } }).catch(()=>{});
    }
    toast('تم تحديث الحالة');
  });
  $$('[data-notes]').forEach(inp => inp.onchange = async () => {
    await db.from('leads').update({ notes: inp.value, updated_at: new Date().toISOString() }).eq('id', inp.dataset.notes);
    toast('حُفظت الملاحظة');
  });
  const { data: ev } = await db.from('analytics_events').select('event_name,path,created_at,properties').order('created_at',{ascending:false}).limit(40);
  $('#ev').innerHTML = ev ? tbl(['الحدث','المسار','وقت'], (ev||[]).map(e=>`<tr><td>${esc(e.event_name)}</td><td dir="ltr">${esc(e.path||'')}</td><td>${new Date(e.created_at).toLocaleString('ar-SA')}</td></tr>`).join('')) : '<p style="color:var(--muted)">نفّذ migration 016</p>';
  const { data: auto } = await db.from('marketing_automations').select('*').order('created_at',{ascending:false}).limit(40);
  $('#auto').innerHTML = auto ? tbl(['النوع','القناة','الحالة','موعد'], (auto||[]).map(a=>`<tr><td>${esc(a.kind)}</td><td>${esc(a.channel)}</td><td><span class="pill">${esc(a.status)}</span></td><td>${new Date(a.scheduled_for).toLocaleString('ar-SA')}</td></tr>`).join('') || '<tr><td colspan="4">لا مهام</td></tr>') : '<p style="color:var(--muted)">نفّذ migration 016</p>';
};

/* ---------- Customers ---------- */
VIEWS.customers = async v => {
  v.innerHTML = `<div class="card"><h2>حسابات بوابة العملاء (SaaS)</h2>
    <p class="card-desc">المستخدمون المسجّلون في /customer مع المنظمة والخطة</p><div id="portal"></div></div>
    <div class="card"><h2>عملاء المتجر</h2><div id="shop"></div></div>`;
  const [{ data: portal }, { data: shop }] = await Promise.all([
    db.from('profiles').select('id,email,full_name,role,is_active,default_organization_id,created_at').eq('role','customer').order('created_at',{ascending:false}).limit(200),
    db.from('customers').select('*').order('created_at',{ascending:false}).limit(300),
  ]);
  const orgs = {};
  const orgIds = [...new Set((portal||[]).map(p => p.default_organization_id).filter(Boolean))];
  if (orgIds.length) {
    const { data: orows } = await db.from('organizations').select('id,slug,name').in('id', orgIds);
    (orows||[]).forEach(o => orgs[o.id] = o);
  }
  const subs = {};
  if (orgIds.length) {
    const { data: srows } = await db.from('subscriptions').select('organization_id,status,saas_plans(name_ar,slug)').in('organization_id', orgIds);
    (srows||[]).forEach(s => subs[s.organization_id] = s);
  }
  $('#portal').innerHTML = tbl(['الاسم','البريد','المنظمة','الخطة','الحالة'], (portal||[]).map(p => {
    const o = orgs[p.default_organization_id];
    const s = subs[p.default_organization_id];
    return `<tr><td>${esc(p.full_name||'—')}</td><td dir="ltr">${esc(p.email)}</td><td>${esc(o?.name||o?.slug||'—')}</td><td>${esc(s?.saas_plans?.name_ar||'—')}</td><td><span class="pill ${p.is_active?'ok':''}">${p.is_active?'نشط':'موقوف'}</span></td></tr>`;
  }).join('') || '<tr><td colspan="5" style="color:var(--muted)">لا حسابات عملاء بعد</td></tr>');
  $('#shop').innerHTML = tbl(['الاسم','الجوال','البريد','المدينة','الطلبات','إجمالي الشراء'], (shop||[]).map(c =>
    `<tr><td>${esc(c.full_name)}</td><td dir="ltr">${esc(c.phone||'—')}</td><td dir="ltr">${esc(c.email||'—')}</td><td>${esc(c.city||'—')}</td><td>${c.total_orders||0}</td><td>${money(c.total_spent)}</td></tr>`
  ).join('') || '<tr><td colspan="6" style="color:var(--muted)">لا عملاء متجر بعد</td></tr>');
};

/* ---------- Coupons ---------- */
VIEWS.coupons = async v => {
  v.innerHTML = `<div class="card"><div class="card-head"><div><h2>كوبونات الخصم</h2></div><button class="btn-primary" id="add">+ كوبون</button></div><div id="tbl"></div></div>`;
  const F = [
    { k: 'code', t: 'الكود', req: 1, dir: 'ltr', ph: 'TQ10' },
    { k: 'type', t: 'النوع', type: 'select', options: [{ v: 'percent', t: 'نسبة %' }, { v: 'fixed', t: 'مبلغ ثابت' }, { v: 'free_shipping', t: 'شحن مجاني' }] },
    { k: 'value', t: 'القيمة', type: 'number' },
    { k: 'min_order_amount', t: 'أقل مبلغ للطلب', type: 'number' },
    { k: 'max_uses', t: 'أقصى عدد استخدامات (فارغ = بلا حد)', type: 'number' },
    { k: 'is_active', t: 'مفعّل', type: 'checkbox', default: true },
  ];
  const { data: rows } = await db.from('coupons').select('*').order('created_at', { ascending: false });
  $('#tbl').innerHTML = tbl(['الكود', 'النوع', 'القيمة', 'استُخدم', 'الحالة', 'إجراءات'], (rows || []).map(c =>
    `<tr><td dir="ltr"><b>${esc(c.code)}</b></td><td>${{ percent: '%', fixed: 'ر.س', free_shipping: 'شحن مجاني' }[c.type]}</td><td>${c.type === 'free_shipping' ? '—' : c.value}</td><td>${c.used_count}${c.max_uses ? '/' + c.max_uses : ''}</td><td><span class="pill ${c.is_active ? 'ok' : 'muted'}">${c.is_active ? 'مفعّل' : 'موقوف'}</span></td><td class="actions"><button class="btn-sm" data-edit="${c.id}">تعديل</button><button class="btn-sm btn-danger" data-del="${c.id}">حذف</button></td></tr>`).join(''));
  $('#add').onclick = () => crudModal({ title: 'كوبون جديد', fields: F, onSave: async d => { await db.from('coupons').insert(d); toast('تمت الإضافة'); VIEWS.coupons(v); } });
  $$('[data-edit]').forEach(b => b.onclick = () => { const row = rows.find(r => r.id === b.dataset.edit); crudModal({ title: 'تعديل كوبون', fields: F, row, onSave: async d => { await db.from('coupons').update(d).eq('id', row.id); toast('تم التحديث'); VIEWS.coupons(v); } }); });
  $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm('حذف الكوبون؟')) { await db.from('coupons').delete().eq('id', b.dataset.del); toast('تم الحذف'); VIEWS.coupons(v); } });
};

/* ---------- Shipping ---------- */
VIEWS.shipping = async v => {
  v.innerHTML = `<div class="card"><h2>الشحن والتتبع</h2><p class="card-desc">إعدادات شركات الشحن — أضف مفاتيح API لكل ناقل لتفعيل الإنشاء التلقائي للشحنات (البنية جاهزة للربط).</p><div id="rows"></div></div>
  <div class="card"><h2>إعدادات الشحن العامة</h2><p class="card-desc">تُطبق على صفحة إتمام الطلب.</p><div class="form-grid">
    <div><label>سعر الشحن الثابت (ر.س)</label><input id="flat" type="number"></div>
    <div><label>شحن مجاني عند (ر.س)</label><input id="free" type="number"></div>
    <div><label>الناقل الافتراضي</label><select id="def"><option value="smsa">SMSA</option><option value="spl">SPL</option><option value="aramex">Aramex</option><option value="dhl">DHL</option><option value="custom">مخصص</option></select></div>
  </div><button class="btn-primary" id="save-gen" style="margin-top:14px">حفظ</button></div>`;
  const { data: rows } = await db.from('shipping_settings').select('*').order('provider');
  $('#rows').innerHTML = (rows || []).map(r => `<div class="card" style="background:var(--bg2)">
    <div class="card-head"><h2 style="margin:0">${esc(r.display_name)} <small style="color:var(--muted)" dir="ltr">(${r.provider})</small></h2>
    <label class="check-row" style="margin:0"><input type="checkbox" data-en="${r.id}" ${r.is_enabled ? 'checked' : ''}> مفعّل</label></div>
    <div class="form-grid">
      <div><label>مفتاح API</label><input dir="ltr" type="password" data-key="${r.id}" value="${esc(r.api_key_encrypted || '')}" placeholder="يُضاف لاحقًا — البنية جاهزة"></div>
      <div><label>رابط الـAPI</label><input dir="ltr" data-url="${r.id}" value="${esc(r.api_url || '')}"></div>
      <div><label>تكلفة أساسية (ر.س)</label><input type="number" data-cost="${r.id}" value="${r.base_cost}"></div>
    </div></div>`).join('') + (rows || []).map(r => `<button class="btn-sm btn-primary" style="margin:4px" data-save="${r.id}">حفظ ${esc(r.display_name)}</button>`).join('');
  const { data: gen } = await db.from('site_settings').select('value').eq('key', 'shipping').single();
  if (gen?.value) { $('#flat').value = gen.value.flat_rate ?? 25; $('#free').value = gen.value.free_threshold ?? 500; $('#def').value = gen.value.default_provider || 'smsa'; }
  $$('[data-save]').forEach(b => b.onclick = async () => {
    const id = b.dataset.save, r = rows.find(x => x.id === id);
    await db.from('shipping_settings').update({
      is_enabled: $(`[data-en="${id}"]`).checked,
      api_key_encrypted: $(`[data-key="${id}"]`).value || null,
      api_url: $(`[data-url="${id}"]`).value || null,
      base_cost: Number($(`[data-cost="${id}"]`).value) || 0,
    }).eq('id', id);
    log('shipping.update', 'shipping_settings', id, { provider: r.provider }); toast('تم الحفظ');
  });
  $('#save-gen').onclick = async () => {
    const val = { ...(gen?.value || {}), flat_rate: Number($('#flat').value) || 25, free_threshold: Number($('#free').value) || 500, default_provider: $('#def').value };
    await db.from('site_settings').upsert({ key: 'shipping', value: val });
    toast('تم حفظ إعدادات الشحن');
  };
};

/* ---------- CMS (site settings) ---------- */
const SETTINGS_SCHEMAS = {
  site: { title: 'هوية الموقع', fields: [
    { k: 'name_ar', t: 'اسم الموقع (عربي)' }, { k: 'name_en', t: 'Name (EN)', dir: 'ltr' },
    { k: 'logo_url', t: 'رابط الشعار', dir: 'ltr' },
    { k: 'default_lang', t: 'اللغة الافتراضية', type: 'select', options: [{ v: 'ar', t: 'العربية' }, { v: 'en', t: 'English' }] },
    { k: 'default_theme', t: 'الثيم الافتراضي', type: 'select', options: ['midnight', 'pearl', 'desert', 'ocean', 'forest', 'royal', 'aurora'].map(x => ({ v: x, t: x })) },
    { k: 'contact_email', t: 'بريد التواصل', dir: 'ltr' }, { k: 'phone', t: 'الجوال', dir: 'ltr' }, { k: 'whatsapp', t: 'واتساب', dir: 'ltr' },
    { k: 'city', t: 'المدينة', dir: 'ltr' }, { k: 'country', t: 'الدولة', dir: 'ltr' },
  ]},
  hero: { title: 'القسم الرئيسي (Hero)', fields: [
    { k: 'eyebrow_ar', t: 'العنوان الصغير (عربي)' }, { k: 'eyebrow_en', t: 'Eyebrow (EN)', dir: 'ltr' },
    { k: 'title_ar', t: 'العنوان الرئيسي (عربي)', full: 1 }, { k: 'title_en', t: 'Main title (EN)', full: 1, dir: 'ltr' },
    { k: 'subtitle_ar', t: 'الوصف (عربي)', type: 'textarea', full: 1 }, { k: 'subtitle_en', t: 'Subtitle (EN)', type: 'textarea', full: 1, dir: 'ltr' },
    { k: 'image_url', t: 'صورة Hero', dir: 'ltr' },
    { k: 'cta_primary_ar', t: 'زر رئيسي — النص' }, { k: 'cta_primary_href', t: 'زر رئيسي — الرابط', dir: 'ltr' },
    { k: 'cta_secondary_ar', t: 'زر ثانوي — النص' }, { k: 'cta_secondary_href', t: 'زر ثانوي — الرابط', dir: 'ltr' },
  ]},
  social: { title: 'حسابات التواصل', fields: [
    { k: 'linkedin', t: 'LinkedIn', dir: 'ltr' }, { k: 'github', t: 'GitHub', dir: 'ltr' },
    { k: 'twitter', t: 'X/Twitter', dir: 'ltr' }, { k: 'instagram', t: 'Instagram', dir: 'ltr' },
  ]},
  store: { title: 'إعدادات المتجر', fields: [
    { k: 'enabled', t: 'المتجر مفعّل', type: 'checkbox' },
    { k: 'allow_guest_checkout', t: 'السماح بالطلب بدون حساب', type: 'checkbox' },
    { k: 'cod_enabled', t: 'الدفع عند الاستلام مفعّل', type: 'checkbox' },
    { k: 'bank_transfer_enabled', t: 'التحويل البنكي مفعّل', type: 'checkbox' },
    { k: 'bank_details_ar', t: 'تفاصيل الحساب البنكي (عربي)', type: 'textarea', full: 1 },
    { k: 'low_stock_threshold', t: 'حد التنبيه للمخزون المنخفض', type: 'number' },
  ]},
  theme: { title: 'الثيمات', fields: [
    { k: 'active', t: 'الثيم النشط للموقع', type: 'select', options: ['midnight', 'pearl', 'desert', 'ocean', 'forest', 'royal', 'aurora'].map(x => ({ v: x, t: x })) },
    { k: 'allow_user_switch', t: 'السماح للزوار بتبديل الثيم', type: 'checkbox' },
  ]},
};
VIEWS.cms = async v => {
  v.innerHTML = dbBanner() + Object.entries(SETTINGS_SCHEMAS).map(([key, s]) => `
    <div class="card"><div class="card-head"><div><h2>${s.title}</h2></div><button class="btn-primary btn-sm" data-edit-setting="${key}">تعديل</button></div><div id="prev-${key}"></div></div>`).join('');
  const { data: all } = await db.from('site_settings').select('key, value');
  const map = {}; (all || []).forEach(r => map[r.key] = r.value || {});
  Object.entries(SETTINGS_SCHEMAS).forEach(([key, s]) => {
    const val = map[key] || {};
    $(`#prev-${key}`).innerHTML = `<div class="kv">${s.fields.filter(f => f.type !== 'checkbox').slice(0, 6).map(f => `<span class="k">${f.t}</span><span>${esc(val[f.k] ?? '—')}</span>`).join('')}</div>`;
    $(`[data-edit-setting="${key}"]`).onclick = () => crudModal({
      title: 'تعديل: ' + s.title, fields: s.fields, row: val,
      onSave: async d => {
        const next = { ...val, ...d };
        await db.from('site_settings').upsert({ key, value: next, updated_by: me.id });
        log('settings.update', 'site_settings', key); toast('تم الحفظ — يظهر على الموقع خلال دقائق'); VIEWS.cms(v);
      }
    });
  });
};

/* ---------- Pages ---------- */
VIEWS.pages = async v => {
  v.innerHTML = `<div class="card"><div class="card-head"><div><h2>صفحات الموقع</h2></div><button class="btn-primary" id="add">+ صفحة</button></div><div id="tbl"></div></div>`;
  const F = [
    { k: 'slug', t: 'المعرّف', req: 1, dir: 'ltr', ph: 'about' },
    { k: 'title_ar', t: 'العنوان (عربي)', req: 1 }, { k: 'title_en', t: 'Title (EN)', req: 1, dir: 'ltr' },
    { k: 'status', t: 'الحالة', type: 'select', options: [{ v: 'published', t: 'منشور' }, { v: 'draft', t: 'مسودة' }, { v: 'archived', t: 'مؤرشف' }] },
    { k: 'is_in_nav', t: 'إظهار في القائمة', type: 'checkbox' },
    { k: 'sort_order', t: 'الترتيب', type: 'number', default: 0 },
    { k: 'content', t: 'المحتوى (JSON — أقسام)', type: 'textarea', full: 1, dir: 'ltr', ph: '{"sections":[]}' },
  ];
  const { data: rows } = await db.from('pages').select('*').order('sort_order');
  $('#tbl').innerHTML = tbl(['الصفحة', 'المعرّف', 'في القائمة', 'الحالة', 'إجراءات'], (rows || []).map(p =>
    `<tr><td>${esc(p.title_ar)}</td><td dir="ltr">${esc(p.slug)}</td><td>${p.is_in_nav ? '✓' : '—'}</td><td><span class="pill ${pillCls(p.status)}">${STATUS_AR[p.status]}</span></td><td class="actions"><button class="btn-sm" data-edit="${p.id}">تعديل</button><button class="btn-sm btn-danger" data-del="${p.id}">حذف</button></td></tr>`).join(''));
  $('#add').onclick = () => crudModal({ title: 'صفحة جديدة', fields: F, onSave: async d => { d.content = typeof d.content === 'string' ? JSON.parse(d.content || '{}') : d.content; await db.from('pages').insert(d); toast('تمت الإضافة'); VIEWS.pages(v); } });
  $$('[data-edit]').forEach(b => b.onclick = () => { const row = rows.find(r => r.id === b.dataset.edit); crudModal({ title: 'تعديل صفحة', fields: F, row: { ...row, content: JSON.stringify(row.content || {}, null, 2) }, onSave: async d => { d.content = typeof d.content === 'string' ? JSON.parse(d.content || '{}') : d.content; await db.from('pages').update(d).eq('id', row.id); toast('تم التحديث'); VIEWS.pages(v); } }); });
  $$('[data-del]').forEach(b => b.onclick = async () => { if (confirm('حذف الصفحة؟')) { await db.from('pages').delete().eq('id', b.dataset.del); toast('تم الحذف'); VIEWS.pages(v); } });
};

/* ---------- Media ---------- */
VIEWS.media = async v => {
  v.innerHTML = `<div class="card"><div class="card-head"><div><h2>مكتبة الصور</h2><p class="card-desc">ارفع الصور واستخدم روابطها في الخدمات والمنتجات. (يُرفع إلى Supabase Storage)</p></div>
  <div><input type="file" id="up" accept="image/*" multiple hidden><button class="btn-primary" id="up-btn">⬆ رفع صور</button></div></div>
  <div class="media-grid" id="grid"></div></div>`;
  const load = async () => {
    const { data: rows } = await db.from('media').select('*').order('created_at', { ascending: false }).limit(60);
    $('#grid').innerHTML = (rows || []).map(m => `<div class="media-item">
      <img src="${esc(m.url)}" alt="${esc(m.alt_text || m.file_name)}" loading="lazy">
      <div class="mi-bar"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.file_name)}</span>
      <button class="btn-sm" data-copy="${esc(m.url)}" title="نسخ الرابط">⧉</button></div></div>`).join('') || '<p class="empty">لا توجد صور بعد.</p>';
    $$('[data-copy]').forEach(b => b.onclick = () => { navigator.clipboard.writeText(b.dataset.copy); toast('تم نسخ الرابط'); });
  };
  $('#up-btn').onclick = () => $('#up').click();
  $('#up').onchange = async e => {
    for (const file of e.target.files) {
      const path = `media/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`;
      const { error } = await db.storage.from('media').upload(path, file, { upsert: true });
      if (error) { toast('فشل رفع ' + file.name + ': ' + error.message, false); continue; }
      const { data: { publicUrl } } = db.storage.from('media').getPublicUrl(path);
      await db.from('media').insert({ storage_path: path, url: publicUrl, file_name: file.name, mime_type: file.type, size_bytes: file.size, uploaded_by: me.id });
    }
    toast('تم الرفع'); load();
  };
  load();
};

/* ---------- SEO ---------- */
VIEWS.seo = async v => {
  v.innerHTML = `<div class="card"><h2>SEO وGEO</h2><p class="card-desc">إعدادات محركات البحث ومحركات البحث الذكية (AI Search) — تستهدف السعودية والخليج.</p><div id="prev"></div><button class="btn-primary" id="edit" style="margin-top:14px">تعديل</button></div>
  <div class="card"><h2>حالة التحسين التقني</h2><div class="kv">
    <span class="k">Sitemap</span><span><a href="../sitemap.xml" target="_blank">sitemap.xml</a> — يشمل كل الصفحات</span>
    <span class="k">Robots</span><span><a href="../robots.txt" target="_blank">robots.txt</a></span>
    <span class="k">llms.txt</span><span>ملف GEO لمحركات الذكاء الاصطناعي <a href="../llms.txt" target="_blank">llms.txt</a></span>
    <span class="k">Schema</span><span>Organization + LocalBusiness + Services + Products — تلقائي</span>
    <span class="k">اللغات</span><span>عربي RTL + إنجليزي LTR مع hreflang</span>
  </div></div>`;
  const { data: s } = await db.from('site_settings').select('value').eq('key', 'seo').single();
  const val = s?.value || {};
  $('#prev').innerHTML = `<div class="kv">
    <span class="k">العنوان الافتراضي (عربي)</span><span>${esc(val.default_title_ar || '—')}</span>
    <span class="k">الوصف الافتراضي (عربي)</span><span>${esc(val.default_description_ar || '—')}</span>
    <span class="k">صورة OG</span><span>${val.og_image_url ? '✓ مضبوطة' : '— غير مضبوطة'}</span>
    <span class="k">المدن المستهدفة</span><span>${(val.geo_cities || []).join('، ') || '—'}</span>
    <span class="k">Google Analytics</span><span>${val.ga_measurement_id ? '✓ ' + val.ga_measurement_id : '—'}</span></div>`;
  const F = [
    { k: 'default_title_ar', t: 'عنوان افتراضي (عربي)', full: 1 }, { k: 'default_title_en', t: 'Default title (EN)', full: 1, dir: 'ltr' },
    { k: 'default_description_ar', t: 'وصف افتراضي (عربي)', type: 'textarea', full: 1 }, { k: 'default_description_en', t: 'Default description (EN)', type: 'textarea', full: 1, dir: 'ltr' },
    { k: 'og_image_url', t: 'صورة Open Graph', dir: 'ltr' },
    { k: 'twitter_handle', t: 'حساب X/Twitter', dir: 'ltr' },
    { k: 'gsc_verification', t: 'كود تحقق Google Search Console', dir: 'ltr' },
    { k: 'ga_measurement_id', t: 'Google Analytics ID', dir: 'ltr', ph: 'G-XXXXXXX' },
    { k: 'geo_region', t: 'المنطقة الجغرافية', dir: 'ltr', default: 'SA' },
  ];
  $('#edit').onclick = () => crudModal({ title: 'إعدادات SEO وGEO', fields: F, row: val, onSave: async d => { await db.from('site_settings').upsert({ key: 'seo', value: { ...val, ...d }, updated_by: me.id }); toast('تم الحفظ'); VIEWS.seo(v); } });
};

/* ---------- AI Modules ---------- */
VIEWS.ai = async v => {
  v.innerHTML = `<div class="card"><h2>حالة مزودي الذكاء الاصطناعي</h2>
  <p class="card-desc">المفاتيح تبقى فقط في Vercel Environment Variables. هذه الشاشة تعرض حالة الاتصال دون كشف أي سر.</p>
  <div id="prov-status" class="form-grid" style="margin-top:8px"><div style="color:var(--muted)">جارٍ الفحص…</div></div>
  <div class="form-grid" style="margin-top:14px">
    <div><label>المزود الافتراضي للمنصة</label>
      <select id="ai-prov">
        <option value="google_ai">Google Gemini</option>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Claude (Anthropic)</option>
        <option value="xai">Grok (xAI)</option>
      </select>
    </div>
    <div><label>متغيرات الخادم</label>
      <input dir="ltr" readonly value="GEMINI_API_KEY · OPENAI_API_KEY · ANTHROPIC_API_KEY · XAI_API_KEY">
    </div>
  </div>
  <button class="btn-primary" id="ai-save" style="margin-top:14px">حفظ المزود الافتراضي</button>
  </div>
  <div class="card"><h2>وحدات / موظفو الذكاء الاصطناعي</h2>
  <p class="card-desc">الوكلاء الأربعة لفريق العمل الداخلي. عدّل المزود والنموذج والموجّه ثم احفظ.</p>
  <div id="rows"></div></div>
  <div class="card"><h2>سجل العمليات الأخيرة</h2>
  <p class="card-desc">آخر 30 محادثة من ai_conversations.</p>
  <div id="ai-logs"></div></div>`;

  // Provider status from serverless (no secrets)
  try {
    const { data: { session } } = await db.auth.getSession();
    const token = session?.access_token;
    if (token) {
      const res = await fetch('/api/ai-workforce/providers', { headers: { Authorization: 'Bearer ' + token } });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload.providers) {
        $('#prov-status').innerHTML = payload.providers.map(p => `
          <div class="card" style="background:var(--bg2);padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
              <b>${esc(p.name)}</b>
              <span class="pill ${p.configured ? 'ok' : 'warn'}">${p.configured ? 'متصل' : 'غير مُعد'}</span>
            </div>
            <div style="margin-top:6px;color:var(--muted);font-size:.85rem" dir="ltr">${esc(p.defaultModel)} · ${(p.envVars || []).join(' / ')}</div>
          </div>`).join('');
      } else {
        $('#prov-status').innerHTML = `<div style="color:var(--muted)">تعذر فحص المزودين (${esc(payload.error || res.status)}). تأكد من نشر /api/ai-workforce/providers.</div>`;
      }
    }
  } catch (e) {
    $('#prov-status').innerHTML = `<div style="color:var(--danger)">خطأ فحص المزودين: ${esc(e.message)}</div>`;
  }

  const providerOptions = [
    ['google_ai', 'Gemini'],
    ['openai', 'OpenAI'],
    ['anthropic', 'Claude'],
    ['xai', 'Grok']
  ];
  const { data: rows } = await db.from('ai_agents').select('*').order('created_at');
  if (!rows || !rows.length) {
    $('#rows').innerHTML = `<p style="color:var(--warn)">لا يوجد وكلاء بعد. نفّذ <code>supabase/migrations/010_phase1_activation.sql</code> في Supabase SQL Editor.</p>`;
  } else {
    $('#rows').innerHTML = rows.map(a => `<div class="card" style="background:var(--bg2)">
      <div class="card-head"><h2 style="margin:0">${esc(a.name_ar || a.name)} <small style="color:var(--muted)" dir="ltr">${esc(a.slug)}</small></h2>
      <label class="switch"><input type="checkbox" data-en="${a.id}" ${a.is_enabled ? 'checked' : ''}><span>مفعّل</span></label></div>
      <div class="form-grid">
        <div><label>المزود</label><select data-prov="${a.id}">${providerOptions.map(([k,t]) => `<option value="${k}" ${(a.provider===k || (k==='google_ai' && ['gemini','google'].includes(a.provider)))?'selected':''}>${t}</option>`).join('')}</select></div>
        <div><label>النموذج</label><input dir="ltr" data-model="${a.id}" value="${esc(a.model || '')}" placeholder="gemini-3.6-flash"></div>
        <div><label>Temperature</label><input type="number" step="0.05" min="0" max="1.5" data-temp="${a.id}" value="${a.temperature ?? 0.7}"></div>
        <div style="grid-column:1/-1"><label>System Prompt</label><textarea data-prompt="${a.id}" rows="4">${esc(a.system_prompt || '')}</textarea></div>
      </div>
      <button class="btn-primary btn-sm" data-save="${a.id}" style="margin-top:10px">حفظ الوحدة</button>
    </div>`).join('');
    $$('[data-save]').forEach(b => b.onclick = async () => {
      const id = b.dataset.save;
      await db.from('ai_agents').update({
        is_enabled: $(`[data-en="${id}"]`).checked,
        provider: $(`[data-prov="${id}"]`).value,
        model: $(`[data-model="${id}"]`).value || null,
        temperature: Number($(`[data-temp="${id}"]`).value) || 0.7,
        system_prompt: $(`[data-prompt="${id}"]`).value || null,
      }).eq('id', id);
      log('ai_agent.update', 'ai_agents', id); toast('تم حفظ الوحدة');
    });
  }

  const { data: aiS } = await db.from('site_settings').select('value').eq('key', 'ai').maybeSingle();
  const aiVal = aiS?.value || {};
  if ($('#ai-prov')) $('#ai-prov').value = aiVal.default_provider || 'google_ai';
  $('#ai-save').onclick = async () => {
    const { api_keys, ...safeAiVal } = aiVal;
    await db.from('site_settings').upsert({ key: 'ai', value: { ...safeAiVal, default_provider: $('#ai-prov').value } });
    toast('تم حفظ المزود الافتراضي');
  };

  const { data: conv } = await db.from('ai_conversations').select('id,status,provider,model,created_at,error_message').order('created_at', { ascending: false }).limit(30);
  $('#ai-logs').innerHTML = tbl(['الوقت','الحالة','المزود','النموذج','ملاحظة'], (conv || []).map(c =>
    `<tr><td>${new Date(c.created_at).toLocaleString('ar-SA')}</td>
     <td><span class="pill ${c.status==='completed'?'ok':c.status==='failed'?'danger':'warn'}">${esc(c.status)}</span></td>
     <td dir="ltr">${esc(c.provider || '—')}</td><td dir="ltr">${esc(c.model || '—')}</td>
     <td style="color:var(--muted);max-width:220px;overflow:hidden;text-overflow:ellipsis">${esc(c.error_message || '')}</td></tr>`
  ).join('') || '<tr><td colspan="5" style="color:var(--muted)">لا محادثات بعد</td></tr>');
};



/* ---------- Analytics & Notifications ---------- */
VIEWS.analytics = async v => {
  const ym = new Date().toISOString().slice(0, 7);
  const [profiles, usage, convos, reqs, subs] = await Promise.all([
    db.from('profiles').select('id,role,created_at'),
    db.from('usage_meters').select('ai_requests,period_ym').eq('period_ym', ym),
    db.from('ai_conversations').select('id,agent_id,provider,created_at').order('created_at',{ascending:false}).limit(500),
    db.from('service_requests').select('id,category,status,created_at'),
    db.from('subscriptions').select('id,status,saas_plans(slug,name_ar)'),
  ]);
  const customers = (profiles.data||[]).filter(p => p.role === 'customer').length;
  const aiTotal = (usage.data||[]).reduce((s,r)=>s+(r.ai_requests||0),0);
  const byCat = {};
  (reqs.data||[]).forEach(r => { byCat[r.category] = (byCat[r.category]||0)+1; });
  const byPlan = {};
  (subs.data||[]).forEach(s => { const k = s.saas_plans?.slug||'?'; byPlan[k]=(byPlan[k]||0)+1; });
  v.innerHTML = `<div class="card"><h2>تحليلات المنصة</h2>
    <div class="stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:12px 0">
      <div class="card" style="padding:12px"><div style="color:var(--muted);font-size:.8rem">المستخدمون (عملاء)</div><div style="font-size:1.3rem;font-weight:700">${customers}</div></div>
      <div class="card" style="padding:12px"><div style="color:var(--muted);font-size:.8rem">AI Usage (${ym})</div><div style="font-size:1.3rem;font-weight:700">${aiTotal}</div></div>
      <div class="card" style="padding:12px"><div style="color:var(--muted);font-size:.8rem">محادثات AI (عينة)</div><div style="font-size:1.3rem;font-weight:700">${convos.data?.length||0}</div></div>
      <div class="card" style="padding:12px"><div style="color:var(--muted);font-size:.8rem">طلبات خدمات</div><div style="font-size:1.3rem;font-weight:700">${reqs.data?.length||0}</div></div>
    </div>
    <h3>توزيع طلبات الخدمات</h3>
    ${tbl(['التصنيف','العدد'], Object.entries(byCat).map(([k,n])=>`<tr><td>${esc(k)}</td><td>${n}</td></tr>`).join('') || '<tr><td colspan="2" style="color:var(--muted)">لا بيانات</td></tr>')}
    <h3 style="margin-top:16px">توزيع الخطط</h3>
    ${tbl(['الخطة','مشتركون'], Object.entries(byPlan).map(([k,n])=>`<tr><td>${esc(k)}</td><td>${n}</td></tr>`).join('') || '<tr><td colspan="2" style="color:var(--muted)">لا بيانات</td></tr>')}
    <p style="color:var(--muted);margin-top:12px;font-size:.85rem">Conversion: بوابة العملاء → طلب خدمة / ترقية — راقب الفواتير المعلّقة في اشتراكات SaaS.</p>
  </div>`;
};

VIEWS.notifications = async v => {
  v.innerHTML = `<div class="card"><div class="card-head"><h2 style="margin:0">إشعارات الإدارة</h2>
    <button class="btn-sm" id="mark-all">تعليم الكل كمقروء</button></div><div id="nlist"></div></div>`;
  const { data } = await db.from('notifications').select('*').or('audience.eq.admin,audience.eq.both').order('created_at',{ascending:false}).limit(80);
  $('#nlist').innerHTML = (data||[]).map(n => `<div style="padding:12px 0;border-bottom:1px solid var(--line);opacity:${n.read_at?.5:1}">
    <b>${esc(n.title_ar)}</b> <span class="pill">${esc(n.type)}</span>
    <div style="color:var(--muted);font-size:.9rem">${esc(n.body_ar||'')}</div>
    <small style="color:var(--muted)">${new Date(n.created_at).toLocaleString('ar-SA')}</small>
    ${n.read_at?'':`<button class="btn-sm" data-nr="${n.id}">مقروء</button>`}
  </div>`).join('') || '<p style="color:var(--muted)">لا إشعارات — نفّذ migration 013</p>';
  $$('[data-nr]').forEach(b => b.onclick = async () => {
    await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', b.dataset.nr);
    VIEWS.notifications(v);
  });
  $('#mark-all').onclick = async () => {
    const ids = (data||[]).filter(n=>!n.read_at).map(n=>n.id);
    for (const id of ids) await db.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    toast('تم'); VIEWS.notifications(v);
  };
};


VIEWS.growth = async v => {
  v.innerHTML = `<div class="card"><h2>معمارية النمو (Phase 4)</h2>
    <p class="card-desc">Marketplace + Dropshipping research — بدون شراء تلقائي أو دفع حي.</p>
    <div id="g-stats"></div></div>
    <div class="card"><h2>موردو الدروبشيبينغ</h2><div id="g-sup"></div></div>
    <div class="card"><h2>بحث منتجات (Dropship Research)</h2><div id="g-res"></div></div>
    <div class="card"><h2>Marketplace Listings</h2><div id="g-list"></div></div>
    <div class="card"><h2>Demo Workflows</h2><div id="g-demo"></div></div>`;
  const safe = async (fn) => { try { return await fn(); } catch (e) { return { data: null, error: e }; } };
  const sup = await safe(() => db.from('commerce_suppliers').select('*').order('provider'));
  const res = await safe(() => db.from('dropship_research').select('*').order('created_at',{ascending:false}).limit(30));
  const list = await safe(() => db.from('marketplace_listings').select('*').order('created_at',{ascending:false}).limit(30));
  const demos = await safe(() => db.from('demo_workflows').select('*').order('sort_order'));
  const vendors = await safe(() => db.from('marketplace_vendors').select('*').limit(20));
  $('#g-stats').innerHTML = `<div class="stats" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px">
    <div class="card" style="padding:12px"><div style="color:var(--muted);font-size:.8rem">موردون</div><div style="font-weight:700">${sup.data?.length||0}</div></div>
    <div class="card" style="padding:12px"><div style="color:var(--muted);font-size:.8rem">أبحاث منتجات</div><div style="font-weight:700">${res.data?.length||0}</div></div>
    <div class="card" style="padding:12px"><div style="color:var(--muted);font-size:.8rem">Vendors</div><div style="font-weight:700">${vendors.data?.length||0}</div></div>
    <div class="card" style="padding:12px"><div style="color:var(--muted);font-size:.8rem">Listings</div><div style="font-weight:700">${list.data?.length||0}</div></div>
    <div class="card" style="padding:12px"><div style="color:var(--muted);font-size:.8rem">Demos</div><div style="font-weight:700">${demos.data?.length||0}</div></div>
  </div>`;
  $('#g-sup').innerHTML = (sup.data||[]).length ? tbl(['المورد','الحالة','الوضع'], (sup.data||[]).map(s=>`<tr><td>${esc(s.display_name||s.provider)}</td><td>${esc(s.status)}</td><td>${esc(s.fulfillment_mode)}</td></tr>`).join('')) : '<p style="color:var(--muted)">لا موردين أو الجدول غير متاح</p>';
  $('#g-res').innerHTML = (res.error) ? '<p style="color:var(--muted)">نفّذ migration 014 لجدول dropship_research</p>' :
    tbl(['العنوان','الحالة','تكلفة تقديرية'], (res.data||[]).map(r=>`<tr><td>${esc(r.title)}</td><td>${esc(r.status)}</td><td>${r.estimated_cost??'—'}</td></tr>`).join('') || '<tr><td colspan="3" style="color:var(--muted)">لا أبحاث بعد</td></tr>');
  $('#g-list').innerHTML = (list.error) ? '<p style="color:var(--muted)">نفّذ migration 014</p>' :
    tbl(['العنوان','السعر','الحالة','التنفيذ'], (list.data||[]).map(l=>`<tr><td>${esc(l.title_ar)}</td><td>${money(l.price)}</td><td>${esc(l.status)}</td><td>${esc(l.fulfillment)}</td></tr>`).join('') || '<tr><td colspan="4" style="color:var(--muted)">لا قوائم — المعمارية جاهزة</td></tr>');
  $('#g-demo').innerHTML = (demos.error) ? '<p style="color:var(--muted)">نفّذ migration 014</p>' :
    tbl(['التجربة','التصنيف','الوكيل'], (demos.data||[]).map(d=>`<tr><td>${esc(d.title_ar)}</td><td>${esc(d.category)}</td><td dir="ltr">${esc(d.agent_slug)}</td></tr>`).join(''));
};


VIEWS.blog = async v => {
  v.innerHTML = `<div class="card"><h2>مقالات المدونة</h2>
    <p class="card-desc">المحتوى المنشور يظهر في /blog — أضف مقالات من هنا أو من SQL.</p>
    <button class="btn-sm btn-primary" id="add-post">مقال جديد</button>
    <div id="posts" style="margin-top:12px"></div></div>`;
  const load = async () => {
    const { data, error } = await db.from('blog_posts').select('*').order('published_at',{ascending:false}).limit(50);
    if (error) { $('#posts').innerHTML = '<p style="color:var(--muted)">نفّذ migration 015</p>'; return; }
    $('#posts').innerHTML = tbl(['العنوان','الحالة','تاريخ'], (data||[]).map(p=>`
      <tr><td><a href="/blog/${esc(p.slug)}" target="_blank">${esc(p.title_ar)}</a><br><small dir="ltr">${esc(p.slug)}</small></td>
      <td><span class="pill">${esc(p.status)}</span></td>
      <td>${p.published_at?new Date(p.published_at).toLocaleDateString('ar-SA'):'—'}</td></tr>`).join('')||'<tr><td colspan="3">لا مقالات</td></tr>');
  };
  $('#add-post').onclick = () => crudModal({
    title: 'مقال جديد',
    fields: [
      {key:'slug',label:'Slug',dir:'ltr'},
      {key:'title_ar',label:'العنوان'},
      {key:'excerpt_ar',label:'مقتطف'},
      {key:'body_ar',label:'المحتوى'},
      {key:'seo_title',label:'SEO Title'},
      {key:'seo_description',label:'SEO Description'},
      {key:'status',label:'الحالة'},
    ],
    onSave: async d => {
      d.status = d.status || 'published';
      d.published_at = d.status === 'published' ? new Date().toISOString() : null;
      await db.from('blog_posts').insert(d);
      toast('تمت الإضافة'); load();
    }
  });
  await load();
};


/* ---------- SaaS plans & service requests ---------- */


VIEWS.saas = async v => {
  v.innerHTML = `
  <div class="card"><div class="card-head"><h2 style="margin:0">خطط SaaS</h2>
    <button class="btn-sm btn-primary" id="add-plan">خطة جديدة</button></div>
    <p class="card-desc">تعديل الأسعار والحدود من هنا. الدفع الحقيقي غير مفعّل — التغيير يدوي أو عبر طلب ترقية.</p>
    <div id="plans"></div></div>
  <div class="card"><h2>المشتركون</h2><div id="subs"></div></div>
  <div class="card"><h2>سجل الاشتراكات</h2><div id="events"></div></div>
  <div class="card"><h2>الفواتير / Billing</h2><div id="inv"></div></div>
  <div class="card"><h2>بوابات الدفع (جاهزية فقط)</h2><div id="pay"></div></div>`;

  const planFields = [
    { key: 'slug', label: 'Slug', dir: 'ltr' },
    { key: 'name_ar', label: 'الاسم عربي' },
    { key: 'name_en', label: 'الاسم EN', dir: 'ltr' },
    { key: 'description_ar', label: 'الوصف' },
    { key: 'price_monthly', label: 'سعر شهري', type: 'number' },
    { key: 'price_yearly', label: 'سعر سنوي', type: 'number' },
    { key: 'ai_requests_monthly', label: 'حد AI شهري', type: 'number' },
    { key: 'max_projects', label: 'حد المشاريع', type: 'number' },
    { key: 'max_agents', label: 'حد الوكلاء', type: 'number' },
    { key: 'max_team_members', label: 'حد الأعضاء', type: 'number' },
    { key: 'sort_order', label: 'الترتيب', type: 'number' },
    { key: 'is_public', label: 'ظاهرة للعملاء', type: 'checkbox' },
  ];

  const load = async () => {
    const { data: plans } = await db.from('saas_plans').select('*').order('sort_order');
    $('#plans').innerHTML = tbl(['خطة','شهري','AI','مشاريع','وكلاء','عامة','إجراء'], (plans||[]).map(p =>
      `<tr><td><b>${esc(p.name_ar)}</b><br><small dir="ltr">${esc(p.slug)}</small></td>
       <td>${money(p.price_monthly)}</td><td>${p.ai_requests_monthly}</td><td>${p.max_projects}</td><td>${p.max_agents}</td>
       <td>${p.is_public?'نعم':'لا'}</td>
       <td><button class="btn-sm" data-edit-plan="${p.id}">تعديل</button></td></tr>`).join(''));
    $$('[data-edit-plan]').forEach(b => b.onclick = () => {
      const row = (plans||[]).find(x => x.id === b.dataset.editPlan);
      crudModal({ title: 'تعديل خطة', fields: planFields, row, onSave: async d => {
        d.price_monthly = Number(d.price_monthly)||0; d.price_yearly = Number(d.price_yearly)||0;
        d.ai_requests_monthly = Number(d.ai_requests_monthly)||0;
        d.max_projects = Number(d.max_projects)||1; d.max_agents = Number(d.max_agents)||1;
        d.max_team_members = Number(d.max_team_members)||1; d.sort_order = Number(d.sort_order)||0;
        d.is_public = !!d.is_public; d.updated_at = new Date().toISOString();
        await db.from('saas_plans').update(d).eq('id', row.id);
        toast('تم تحديث الخطة'); load();
      }});
    });

    const { data: subs } = await db.from('subscriptions').select('*, saas_plans(name_ar,slug), organizations(name,slug)').order('created_at',{ascending:false}).limit(100);
    $('#subs').innerHTML = tbl(['منظمة','خطة','حالة','تجديد','تغيير الخطة'], (subs||[]).map(s =>
      `<tr><td>${esc(s.organizations?.name||'')}<br><small dir="ltr">${esc(s.organizations?.slug||s.organization_id)}</small></td>
       <td>${esc(s.saas_plans?.name_ar||'')}</td><td><span class="pill">${esc(s.status)}</span></td>
       <td>${s.current_period_end?new Date(s.current_period_end).toLocaleDateString('ar-SA'):'—'}</td>
       <td><select data-chg="${s.organization_id}">${(plans||[]).map(p=>`<option value="${p.slug}" ${s.saas_plans?.slug===p.slug?'selected':''}>${esc(p.name_ar)}</option>`).join('')}</select>
       <button class="btn-sm" data-apply="${s.organization_id}">تطبيق</button></td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">لا مشتركين</td></tr>');
    $$('[data-apply]').forEach(b => b.onclick = async () => {
      const sel = $(`select[data-chg="${b.dataset.apply}"]`);
      const { error } = await db.rpc('admin_change_subscription_plan', { p_organization_id: b.dataset.apply, p_plan_slug: sel.value, p_note: 'Changed from Admin SaaS panel' });
      if (error) return toast(error.message, false);
      toast('تم تغيير الخطة'); load();
    });

    const { data: events } = await db.from('subscription_events').select('*, saas_plans!subscription_events_to_plan_id_fkey(name_ar)').order('created_at',{ascending:false}).limit(40);
    // fallback simple select if join name fails
    let ev = events;
    if (!ev) {
      const r = await db.from('subscription_events').select('*').order('created_at',{ascending:false}).limit(40);
      ev = r.data;
    }
    $('#events').innerHTML = tbl(['نوع','منظمة','ملاحظة','تاريخ'], (ev||[]).map(e =>
      `<tr><td><span class="pill">${esc(e.event_type)}</span></td><td dir="ltr">${esc(String(e.organization_id||'').slice(0,8))}…</td><td>${esc(e.note||'')}</td><td>${new Date(e.created_at).toLocaleString('ar-SA')}</td></tr>`
    ).join('') || '<tr><td colspan="4" style="color:var(--muted)">لا أحداث بعد — نفّذ migration 012</td></tr>');

    const { data: inv } = await db.from('billing_invoices').select('*').order('created_at',{ascending:false}).limit(40);
    $('#inv').innerHTML = tbl(['مبلغ','حالة','مزود','مرجع','تاريخ'], (inv||[]).map(i =>
      `<tr><td>${money(i.amount)} ${esc(i.currency||'SAR')}</td><td><span class="pill">${esc(i.status)}</span></td><td>${esc(i.provider||'—')}</td><td dir="ltr">${esc(i.provider_ref||'—')}</td><td>${new Date(i.created_at).toLocaleDateString('ar-SA')}</td></tr>`
    ).join('') || '<tr><td colspan="5" style="color:var(--muted)">لا فواتير</td></tr>');

    const { data: pay } = await db.from('payment_providers').select('*').order('slug');
    $('#pay').innerHTML = tbl(['البوابة','مفعّلة','الوضع','ملاحظات'], (pay||[]).map(p =>
      `<tr><td>${esc(p.display_name)} <small dir="ltr">(${esc(p.slug)})</small></td>
       <td><input type="checkbox" data-pay="${p.id}" ${p.enabled?'checked':''} /></td>
       <td>${esc(p.mode)}</td><td style="color:var(--muted);font-size:.85rem">${esc(JSON.stringify(p.config||{}))}</td></tr>`
    ).join('') || '<tr><td colspan="4" style="color:var(--muted)">نفّذ migration 012</td></tr>');
    $$('[data-pay]').forEach(c => c.onchange = async () => {
      await db.from('payment_providers').update({ enabled: c.checked, updated_at: new Date().toISOString() }).eq('id', c.dataset.pay);
      toast('تم التحديث');
    });
  };

  $('#add-plan').onclick = () => crudModal({ title: 'خطة جديدة', fields: planFields, onSave: async d => {
    d.price_monthly = Number(d.price_monthly)||0; d.price_yearly = Number(d.price_yearly)||0;
    d.ai_requests_monthly = Number(d.ai_requests_monthly)||20;
    d.max_projects = Number(d.max_projects)||1; d.max_agents = Number(d.max_agents)||1;
    d.max_team_members = Number(d.max_team_members)||1; d.sort_order = Number(d.sort_order)||50;
    d.is_public = d.is_public !== false;
    await db.from('saas_plans').insert(d);
    toast('تمت إضافة الخطة'); load();
  }});
  await load();
};

VIEWS['service-requests'] = async v => {
  v.innerHTML = `<div class="card"><h2>طلبات خدمات العملاء</h2><p class="card-desc">AI / تسويق / SEO / مواقع / أتمتة / تواصل / IT</p><div id="tbl"></div></div>`;
  const { data: rows } = await db.from('service_requests').select('*').order('created_at',{ascending:false}).limit(100);
  const st = ['new','reviewing','quoted','in_progress','done','canceled'];
  $('#tbl').innerHTML = tbl(['العنوان','التصنيف','الحالة','تواصل','تاريخ'], (rows||[]).map(r =>
    `<tr><td>${esc(r.title)}</td><td>${esc(r.category)}</td>
     <td><select data-id="${r.id}">${st.map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${s}</option>`).join('')}</select></td>
     <td dir="ltr">${esc(r.contact_phone||r.contact_email||'—')}</td>
     <td>${new Date(r.created_at).toLocaleDateString('ar-SA')}</td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">لا طلبات</td></tr>');
  $$('[data-id]').forEach(s => s.onchange = async () => {
    await db.from('service_requests').update({ status: s.value, updated_at: new Date().toISOString() }).eq('id', s.dataset.id);
    toast('تم تحديث الحالة');
  });
};

/* ---------- Users ---------- */

VIEWS.users = async v => {
  v.innerHTML = `<div class="card"><h2>المستخدمون والصلاحيات</h2><p class="card-desc">إدارة أدوار المستخدمين — المالك يملك كل الصلاحيات.</p><div id="tbl"></div></div>`;
  const { data: rows } = await db.from('profiles').select('*').order('created_at', { ascending: false });
  $('#tbl').innerHTML = tbl(['المستخدم', 'البريد', 'الدور', 'الحالة', 'التسجيل'], (rows || []).map(u =>
    `<tr><td>${esc(u.full_name || '—')}</td><td dir="ltr">${esc(u.email)}</td>
     <td><select data-role="${u.id}" ${u.id === me.id ? 'disabled' : ''}>${[['customer', 'عميل'], ['admin', 'أدمن'], ['super_admin', 'مالك']].map(([k, t]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
     <td><span class="pill ${u.is_active ? 'ok' : 'danger'}">${u.is_active ? 'نشط' : 'موقوف'}</span></td>
     <td style="color:var(--muted)">${new Date(u.created_at).toLocaleDateString('ar-SA')}</td></tr>`).join(''));
  $$('[data-role]').forEach(s => s.onchange = async () => { await db.from('profiles').update({ role: s.value }).eq('id', s.dataset.role); log('user.role_change', 'profiles', s.dataset.role, { role: s.value }); toast('تم تحديث الدور'); });
};

/* ---------- Logs ---------- */
VIEWS.logs = async v => {
  v.innerHTML = `<div class="card"><h2>سجل النشاط</h2><p class="card-desc">آخر 200 عملية على المنصة.</p><div id="tbl"></div></div>`;
  const { data: rows } = await db.from('activity_logs').select('*, profiles(email, full_name)').order('created_at', { ascending: false }).limit(200);
  $('#tbl').innerHTML = tbl(['العملية', 'المستخدم', 'الجدول', 'التاريخ'], (rows || []).map(l =>
    `<tr><td dir="ltr">${esc(l.action)}</td><td>${esc(l.profiles?.email || 'نظام')}</td><td dir="ltr">${esc(l.entity || '—')}</td><td style="color:var(--muted);white-space:nowrap">${new Date(l.created_at).toLocaleString('ar-SA')}</td></tr>`).join(''));
};

/* ============================================================
   START
   ============================================================ */
window.addEventListener('DOMContentLoaded', boot);
})();
