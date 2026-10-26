const fail = (status, message) => Object.assign(new Error(message), { status });
const roles = ['customer', 'admin'];
export async function manageUsers({ method, body, auth, base, service, fetchImpl = fetch }) {
  // The verified server-side profile is authoritative, never user_metadata.
  if (auth?.profile?.role !== 'super_admin' || !auth.profile.is_active || !auth.user?.email_confirmed_at)
    throw fail(403, 'إدارة الحسابات متاحة للمالك فقط.');
  if (!service) throw fail(503, 'خدمة إدارة الحسابات غير مهيأة.');
  if (!['POST', 'PATCH'].includes(method)) throw fail(405, 'طريقة الطلب غير مسموحة.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw fail(400, 'طلب غير صالح.');
  const creating = method === 'POST';
  const allowed = creating ? ['email', 'password', 'full_name', 'role'] : ['id', 'password'];
  if (Object.keys(body).some(k => !allowed.includes(k))) throw fail(400, 'حقول غير مسموحة.');
  if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128)
    throw fail(400, 'كلمة المرور يجب أن تكون بين 12 و128 حرفًا.');
  if (!creating && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id || ''))
    throw fail(400, 'معرّف المستخدم غير صالح.');
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = body.role || 'customer';
  if (creating && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !roles.includes(role)
    || typeof body.full_name !== 'string' || body.full_name.length > 120)) throw fail(400, 'تحقق من البريد والاسم والدور.');
  const headers = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' };
  async function request(path, options = {}) {
    const r = await fetchImpl(`${base.replace(/\/$/, '')}${path}`, { ...options, headers: { ...headers, ...options.headers } });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      if ([422, 409].includes(r.status)) throw fail(409, 'البريد مستخدم بالفعل أو كلمة المرور لا تطابق سياسة الأمان.');
      throw fail(502, 'تعذر تنفيذ العملية لدى خدمة الحسابات.');
    }
    return data;
  }
  let id = body.id;
  let confirmationSent = false;
  if (creating) {
    // Do not confirm ownership of an email address on behalf of a newly created user.
    const data = await request('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({
      email, password: body.password, email_confirm: false, user_metadata: { full_name: body.full_name.trim() }
    }) });
    id = data?.id || data?.user?.id;
    if (!id) throw fail(502, 'تعذر التحقق من إنشاء الحساب.');
    try {
      const profiles = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ full_name: body.full_name.trim(), role })
      });
      if (!Array.isArray(profiles) || profiles.length !== 1) throw fail(502, 'تعذر تهيئة ملف المستخدم.');
    } catch {
      // Keep a partially configured account inaccessible; never return false success.
      await request(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ ban_duration: '876000h' }) });
      throw fail(502, 'تم إنشاء حساب موقوف بسبب تعذر تهيئة صلاحياته. راجع الدعم قبل إعادة المحاولة.');
    }
    try {
      await request('/auth/v1/resend', { method: 'POST', body: JSON.stringify({ type: 'signup', email }) });
      confirmationSent = true;
    } catch { /* Account exists; report mail delivery separately, without retrying creation. */ }
  } else {
    const target = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,role`);
    if (!target?.length) throw fail(404, 'المستخدم غير موجود.');
    if (target[0].role === 'super_admin' && id !== auth.user.id) throw fail(403, 'لا يمكن تعديل كلمة مرور مالك آخر.');
    await request(`/auth/v1/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ password: body.password }) });
  }
  let auditRecorded = true;
  try {
    await request('/rest/v1/activity_logs', { method: 'POST', body: JSON.stringify({
      user_id: auth.user.id, action: creating ? 'user.create' : 'user.password_change', entity: 'profiles', entity_id: id,
      details: creating ? { role } : {}
    }) });
  } catch { auditRecorded = false; }
  return { ok: true, id, requires_email_confirmation: creating, confirmation_sent: confirmationSent, audit_recorded: auditRecorded };
}
