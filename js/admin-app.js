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
  v.innerHTML = dbBanner() + `
  <div class="card"><div class="card-head"><div>
    <h2>Tiqnora Commerce AI — لوحة الموردين</h2>
    <p class="card-desc">تكامل الموردين + بحث المنتجات + حاسبة الربح. <b>لا نشر تلقائي</b> و<b>لا شراء تلقائي</b> — كل منتج وطلب يحتاج اعتماد المشرف.</p>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="btn-primary" id="add-source">+ مرشّح مورد</button>
    <button class="btn-sm" id="add-queue">+ طابور استيراد</button>
  </div></div>
  <div id="commerce-summary" class="grid-stats"></div></div>

  <div class="card"><h2>حاسبة الربح السريعة (ر.س)</h2>
    <div class="grid-2" style="gap:12px;align-items:end">
      <label>تكلفة المورد + شحن<input type="number" id="pc-cost" step="0.01" value="40"></label>
      <label>سعر البيع المقترح<input type="number" id="pc-price" step="0.01" value="99"></label>
      <label>رسوم تقديرية %<input type="number" id="pc-fee" step="0.1" value="2.5"></label>
      <button class="btn-primary" id="pc-run">احسب</button>
    </div>
    <p id="pc-out" style="margin-top:12px;color:var(--muted)">—</p>
  </div>

  <div class="card"><h2>AI Product Scout — تحليل منتج منظم</h2>
    <div class="grid-2" style="gap:10px">
      <label>اسم المنتج<input id="sc-name" placeholder="مثال: كاميرا Hikvision"></label>
      <label>المورد<input id="sc-sup" placeholder="CJ / محلي / AliExpress"></label>
      <label>تكلفة الشراء ر.س<input type="number" id="sc-cost" step="0.01" value="150"></label>
      <label>الشحن ر.س<input type="number" id="sc-ship" step="0.01" value="0"></label>
      <label>سعر البيع المقترح ر.س<input type="number" id="sc-price" step="0.01" value="399"></label>
      <label>التصنيف<input id="sc-cat" placeholder="cctv / networking"></label>
    </div>
    <button class="btn-primary" id="scout-run" style="margin-top:10px">تحليل Scout</button>
    <pre id="scout-out" style="white-space:pre-wrap;margin-top:10px;max-height:320px;overflow:auto;background:var(--surface);padding:12px;border-radius:12px;border:1px solid var(--line)">مثال: تكلفة 150 → بيع 399 → ربح 249 — النتيجة المنظمة هنا</pre>
  </div>

  <div class="card"><h2>بحث AI للمنتجات</h2>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <select id="ai-mode"><option value="research">بحث منتج</option><option value="profit">تحليل ربح</option><option value="market_compare">مقارنة سوق</option><option value="import_brief">موجز استيراد</option><option value="content">وصف SEO</option><option value="trend">ترند</option></select>
      <button class="btn-primary" id="ai-run">تشغيل الوكيل</button>
    </div>
    <textarea id="ai-msg" rows="3" style="width:100%" placeholder="مثال: باور بانك 20000mAh للسوق السعودي مع شحن سريع"></textarea>
    <pre id="ai-out" style="white-space:pre-wrap;margin-top:10px;max-height:280px;overflow:auto;background:var(--surface);padding:12px;border-radius:12px;border:1px solid var(--line)">النتيجة تظهر هنا…</pre>
  </div>

  <div class="card"><h2>الموردون والجاهزية</h2><div id="supplier-list">جارٍ التحميل…</div></div>
  <div class="card"><h2>طابور الاستيراد (قبل النشر)</h2><div id="queue-list">جارٍ التحميل…</div></div>
  <div class="card"><h2>مرشحات المنتجات (supplier_products)</h2><div id="candidate-list">جارٍ التحميل…</div></div>
  <div class="card"><h2>طلبات التنفيذ → إعداد طلب المورد</h2><div id="fulfillment-list">جارٍ التحميل…</div></div>
  <div class="card"><h2>سجلات المزامنة</h2><div id="sync-list">جارٍ التحميل…</div></div>
  <div class="card"><h2>مسار الطلب</h2>
    <ol class="clean">
      <li>طلب العميل</li>
      <li>اعتماد المشرف (fulfillment)</li>
      <li>إعداد طلب المورد (supplier_orders)</li>
      <li>تحديث التتبع</li>
      <li>إشعار العميل</li>
    </ol>
    <p style="color:var(--muted)">في هذه المرحلة الإرسال للمورد يدوي/شبه آلي بعد الاعتماد — لا يوجد auto-purchase.</p>
  </div>`;

  const results = await Promise.all([
    db.from('commerce_suppliers').select('*').order('display_name'),
    db.from('supplier_products').select('*, commerce_suppliers(display_name,provider), products(name_ar)').order('created_at',{ascending:false}).limit(100),
    db.from('fulfillment_requests').select('*, orders(order_number,customer_name), commerce_suppliers(display_name)').order('created_at',{ascending:false}).limit(50),
    db.from('product_import_queue').select('*').order('created_at',{ascending:false}).limit(50),
    db.from('supplier_sync_logs').select('*, commerce_suppliers(display_name)').order('started_at',{ascending:false}).limit(30),
    db.from('supplier_orders').select('*, orders(order_number), commerce_suppliers(display_name)').order('created_at',{ascending:false}).limit(30),
  ]);
  const [supRes, candRes, fulRes, qRes, syncRes, soRes] = results;
  if (supRes.error && String(supRes.error.message||'').includes('does not exist')) {
    v.innerHTML = `<div class="card"><h2>Tiqnora Commerce AI</h2><p class="card-desc">نفّذ <code dir="ltr">009_commerce_ai_dropshipping.sql</code> ثم <code dir="ltr">025_supplier_integration_layer.sql</code> في Supabase SQL Editor.</p></div>`;
    return;
  }
  const suppliers = supRes.data || [];
  const candidates = candRes.data || [];
  const requests = fulRes.data || [];
  const queue = qRes.error ? [] : (qRes.data || []);
  const syncs = syncRes.error ? [] : (syncRes.data || []);
  const supplierOrders = soRes.error ? [] : (soRes.data || []);

  $('#commerce-summary').innerHTML = [
    ['الموردون', suppliers.length],
    ['بانتظار مراجعة مرشّح', candidates.filter(x=>x.approval_status==='candidate').length],
    ['طابور استيراد', queue.filter(x=>x.status==='pending_review').length],
    ['تنفيذ بانتظار اعتماد', requests.filter(x=>x.status==='awaiting_approval').length],
  ].map(([t,n])=>`<div class="stat-card"><div class="stat-num">${n}</div><div class="stat-label">${t}</div></div>`).join('');

  $('#supplier-list').innerHTML = suppliers.length
    ? tbl(['المورد','النوع','الدولة','التصنيف','التوصيل','الحالة','API'], suppliers.map(s=>`<tr>
      <td><b>${esc(s.display_name)}</b><br><small dir="ltr">${esc(s.provider)}</small></td>
      <td>${esc(s.supplier_type||'—')}</td>
      <td>${esc(s.country||'—')}</td>
      <td>${esc(s.category||'—')}</td>
      <td>${s.delivery_time_min_days||'?'}–${s.delivery_time_max_days||'?'} ي</td>
      <td><span class="pill ${s.status==='connected'?'ok':'warn'}">${esc(s.status)}</span></td>
      <td>${esc(s.api_connection_status||s.status||'—')}</td></tr>`).join(''))
    : '<p style="color:var(--muted)">لا موردين — نفّذ الهجرات 009/025/026</p>';
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
