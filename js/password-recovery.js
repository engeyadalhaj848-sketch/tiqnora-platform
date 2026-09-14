/* TIQNORA AI — Admin password recovery helper */
(() => {
  const cfg = window.TIQNORA_CONFIG || {};
  const ownerEmail = (cfg.ownerEmails || [])[0] || '';
  let client = null;
  let recoveryMode = /(?:^|[&#?])type=recovery(?:&|$)/i.test(location.hash + '&' + location.search);

  const waitForClient = async () => {
    for (let i = 0; i < 120; i++) {
      client = window.TiqnoraDB?.raw || null;
      if (client) return client;
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  };

  const showResetForm = async () => {
    if (document.getElementById('tiqnora-password-reset')) return;
    const db = client || await waitForClient();
    if (!db) return;

    const wrap = document.createElement('div');
    wrap.id = 'tiqnora-password-reset';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#07111f;display:grid;place-items:center;padding:20px;font-family:IBM Plex Sans Arabic,Arial,sans-serif;direction:rtl';
    wrap.innerHTML = `
      <div style="width:min(440px,100%);background:#0c1a2b;border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:28px;color:#fff;box-shadow:0 24px 70px rgba(0,0,0,.35)">
        <h1 style="margin:0 0 8px;font-size:1.45rem">تعيين كلمة مرور جديدة</h1>
        <p style="margin:0 0 20px;color:#9fb0c5;line-height:1.7">اكتب كلمة مرور جديدة لحساب مالك Tiqnora AI.</p>
        <form id="tiqnora-reset-form">
          <label style="display:block;margin:0 0 7px">كلمة المرور الجديدة</label>
          <input id="tiqnora-new-password" type="password" minlength="8" required autocomplete="new-password" style="box-sizing:border-box;width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#07111f;color:#fff;font-size:16px" />
          <label style="display:block;margin:14px 0 7px">تأكيد كلمة المرور</label>
          <input id="tiqnora-confirm-password" type="password" minlength="8" required autocomplete="new-password" style="box-sizing:border-box;width:100%;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.16);background:#07111f;color:#fff;font-size:16px" />
          <div id="tiqnora-reset-msg" style="min-height:24px;margin-top:10px;color:#ff9b9b;font-size:.9rem"></div>
          <button type="submit" style="width:100%;padding:12px;border:0;border-radius:12px;background:#fff;color:#07111f;font-weight:700;font-size:16px;cursor:pointer">حفظ كلمة المرور</button>
        </form>
      </div>`;
    document.body.appendChild(wrap);

    document.getElementById('tiqnora-reset-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const p1 = document.getElementById('tiqnora-new-password').value;
      const p2 = document.getElementById('tiqnora-confirm-password').value;
      const msg = document.getElementById('tiqnora-reset-msg');
      const btn = e.currentTarget.querySelector('button');
      msg.style.color = '#ff9b9b';
      if (p1.length < 8) { msg.textContent = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.'; return; }
      if (p1 !== p2) { msg.textContent = 'كلمتا المرور غير متطابقتين.'; return; }
      btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
      const { error } = await db.auth.updateUser({ password: p1 });
      if (error) {
        msg.textContent = error.message || 'تعذر تحديث كلمة المرور.';
        btn.disabled = false; btn.textContent = 'حفظ كلمة المرور';
        return;
      }
      msg.style.color = '#72e6a6';
      msg.textContent = 'تم تغيير كلمة المرور بنجاح. سيتم إعادتك لتسجيل الدخول.';
      await db.auth.signOut();
      setTimeout(() => { location.href = '/admin.html?password_reset=1'; }, 1200);
    });
  };

  const installForgotButton = async () => {
    const form = document.getElementById('login-form');
    if (!form || document.getElementById('tiqnora-forgot-password')) return;
    const submit = form.querySelector('button[type="submit"]');
    if (!submit) return;
    const btn = document.createElement('button');
    btn.id = 'tiqnora-forgot-password';
    btn.type = 'button';
    btn.className = 'btn-ghost btn-sm';
    btn.style.cssText = 'width:100%;margin-top:10px';
    btn.textContent = 'نسيت كلمة المرور؟';
    submit.insertAdjacentElement('afterend', btn);

    btn.addEventListener('click', async () => {
      const db = client || await waitForClient();
      const errBox = form.querySelector('.form-err');
      const emailInput = form.querySelector('input[name="email"]');
      const email = (emailInput?.value || ownerEmail).trim();
      if (!db) { if (errBox) errBox.textContent = 'تعذر الاتصال بخدمة تسجيل الدخول.'; return; }
      if (!email) { if (errBox) errBox.textContent = 'اكتب البريد الإلكتروني أولاً.'; return; }
      if (emailInput && !emailInput.value) emailInput.value = email;
      btn.disabled = true; btn.textContent = 'جارٍ إرسال رابط الاستعادة…';
      const redirectTo = `${location.origin}/admin.html`;
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) {
        if (errBox) errBox.textContent = error.message || 'تعذر إرسال رابط الاستعادة.';
        btn.disabled = false; btn.textContent = 'نسيت كلمة المرور؟';
        return;
      }
      if (errBox) {
        errBox.style.color = '#72e6a6';
        errBox.textContent = 'تم إرسال رابط استعادة كلمة المرور إلى بريدك. افتح الرسالة واضغط رابط الاستعادة.';
      }
      btn.textContent = 'تم إرسال رابط الاستعادة';
    });
  };

  const observeLogin = () => {
    installForgotButton();
    const observer = new MutationObserver(() => installForgotButton());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  const initAuthRecovery = async () => {
    const db = await waitForClient();
    if (!db) return;
    db.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryMode = true;
        setTimeout(showResetForm, 0);
      }
    });
    if (recoveryMode) setTimeout(showResetForm, 0);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeLogin);
  else observeLogin();
  initAuthRecovery();
})();
