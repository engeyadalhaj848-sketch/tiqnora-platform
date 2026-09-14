/* TIQNORA AI — Admin password recovery + passwordless fallback */
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

  const authErrorAr = (error) => {
    const raw = String(error?.message || error || '').trim();
    const msg = raw.toLowerCase();
    if (!raw) return 'حدث خطأ غير متوقع. حاول مرة أخرى.';
    if (msg.includes('email rate limit exceeded') || msg.includes('over_email_send_rate_limit')) {
      return 'تم بلوغ حد إرسال رسائل استعادة كلمة المرور مؤقتًا. استخدم زر «الدخول برابط إلى البريد» أو حاول لاحقًا.';
    }
    if (msg.includes('for security purposes')) {
      const seconds = raw.match(/after\s+(\d+)\s+seconds?/i)?.[1];
      return seconds
        ? `لأسباب أمنية، انتظر ${seconds} ثانية ثم حاول مرة أخرى.`
        : 'لأسباب أمنية، انتظر قليلًا ثم حاول مرة أخرى.';
    }
    if (msg.includes('rate limit')) return 'تم بلوغ حد المحاولات مؤقتًا. انتظر قليلًا ثم حاول مرة أخرى.';
    if (msg.includes('invalid login credentials')) return 'بيانات الدخول غير صحيحة.';
    return raw;
  };

  const setMessage = (box, text, ok = false) => {
    if (!box) return;
    box.style.color = ok ? '#72e6a6' : '#ff9b9b';
    box.textContent = text;
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
          <button id="tiqnora-reset-cancel" type="button" style="width:100%;padding:11px;margin-top:9px;border:1px solid rgba(255,255,255,.15);border-radius:12px;background:transparent;color:#c7d4e5;font-size:15px;cursor:pointer">إلغاء</button>
        </form>
      </div>`;
    document.body.appendChild(wrap);

    document.getElementById('tiqnora-reset-cancel').addEventListener('click', () => wrap.remove());
    document.getElementById('tiqnora-reset-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const p1 = document.getElementById('tiqnora-new-password').value;
      const p2 = document.getElementById('tiqnora-confirm-password').value;
      const msg = document.getElementById('tiqnora-reset-msg');
      const btn = e.currentTarget.querySelector('button[type="submit"]');
      msg.style.color = '#ff9b9b';
      if (p1.length < 8) { msg.textContent = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.'; return; }
      if (p1 !== p2) { msg.textContent = 'كلمتا المرور غير متطابقتين.'; return; }
      btn.disabled = true; btn.textContent = 'جارٍ الحفظ…';
      const { error } = await db.auth.updateUser({ password: p1 });
      if (error) {
        msg.textContent = authErrorAr(error);
        btn.disabled = false; btn.textContent = 'حفظ كلمة المرور';
        return;
      }
      msg.style.color = '#72e6a6';
      msg.textContent = 'تم تغيير كلمة المرور بنجاح. سيتم إعادتك لتسجيل الدخول.';
      await db.auth.signOut();
      setTimeout(() => { location.href = '/admin.html?password_reset=1'; }, 1200);
    });
  };

  const getLoginParts = (form) => ({
    errBox: form?.querySelector('.form-err'),
    emailInput: form?.querySelector('input[name="email"]'),
  });

  const resolveEmail = (form) => {
    const { emailInput } = getLoginParts(form);
    const email = (emailInput?.value || ownerEmail).trim();
    if (emailInput && !emailInput.value && email) emailInput.value = email;
    return email;
  };

  const installLoginHelpers = () => {
    const form = document.getElementById('login-form');
    if (!form) return;
    const submit = form.querySelector('button[type="submit"]');
    if (!submit) return;

    let forgot = document.getElementById('tiqnora-forgot-password');
    if (!forgot) {
      forgot = document.createElement('button');
      forgot.id = 'tiqnora-forgot-password';
      forgot.type = 'button';
      forgot.className = 'btn-ghost btn-sm';
      forgot.style.cssText = 'width:100%;margin-top:10px';
      forgot.textContent = 'نسيت كلمة المرور؟';
      submit.insertAdjacentElement('afterend', forgot);

      forgot.addEventListener('click', async () => {
        const db = client || await waitForClient();
        const { errBox } = getLoginParts(form);
        const email = resolveEmail(form);
        if (!db) { setMessage(errBox, 'تعذر الاتصال بخدمة تسجيل الدخول.'); return; }
        if (!email) { setMessage(errBox, 'اكتب البريد الإلكتروني أولاً.'); return; }
        forgot.disabled = true; forgot.textContent = 'جارٍ إرسال رابط الاستعادة…';
        const redirectTo = `${location.origin}/admin.html`;
        const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) {
          setMessage(errBox, authErrorAr(error));
          forgot.disabled = false; forgot.textContent = 'نسيت كلمة المرور؟';
          return;
        }
        setMessage(errBox, 'تم إرسال رابط استعادة كلمة المرور إلى بريدك. افتح الرسالة واضغط رابط الاستعادة.', true);
        forgot.textContent = 'تم إرسال رابط الاستعادة';
      });
    }

    if (!document.getElementById('tiqnora-magic-login')) {
      const magic = document.createElement('button');
      magic.id = 'tiqnora-magic-login';
      magic.type = 'button';
      magic.className = 'btn-ghost btn-sm';
      magic.style.cssText = 'width:100%;margin-top:9px;border-color:rgba(76,220,207,.45);color:#7be5dc';
      magic.textContent = 'الدخول برابط إلى البريد — بدون كلمة مرور';
      forgot.insertAdjacentElement('afterend', magic);

      magic.addEventListener('click', async () => {
        const db = client || await waitForClient();
        const { errBox } = getLoginParts(form);
        const email = resolveEmail(form);
        if (!db) { setMessage(errBox, 'تعذر الاتصال بخدمة تسجيل الدخول.'); return; }
        if (!email) { setMessage(errBox, 'اكتب البريد الإلكتروني أولاً.'); return; }
        magic.disabled = true; magic.textContent = 'جارٍ إرسال رابط الدخول…';
        const emailRedirectTo = `${location.origin}/admin.html?magic_login=1`;
        const { error } = await db.auth.signInWithOtp({
          email,
          options: { shouldCreateUser: false, emailRedirectTo },
        });
        if (error) {
          setMessage(errBox, authErrorAr(error));
          magic.disabled = false; magic.textContent = 'الدخول برابط إلى البريد — بدون كلمة مرور';
          return;
        }
        setMessage(errBox, 'تم إرسال رابط دخول آمن إلى بريدك. افتح الرسالة واضغط الرابط، وستدخل لوحة التحكم مباشرة.', true);
        magic.textContent = 'تم إرسال رابط الدخول';
      });
    }
  };

  const installChangePasswordAction = async () => {
    if (document.getElementById('tiqnora-change-password')) return;
    const logout = document.getElementById('logout');
    if (!logout) return;
    const db = client || await waitForClient();
    if (!db) return;
    const { data: { session } } = await db.auth.getSession();
    if (!session) return;

    const btn = document.createElement('button');
    btn.id = 'tiqnora-change-password';
    btn.type = 'button';
    btn.className = 'btn-ghost btn-sm';
    btn.style.cssText = 'width:100%;margin-bottom:8px';
    btn.textContent = 'تغيير كلمة المرور';
    logout.insertAdjacentElement('beforebegin', btn);
    btn.addEventListener('click', showResetForm);
  };

  const observeUi = () => {
    installLoginHelpers();
    installChangePasswordAction();
    const observer = new MutationObserver(() => {
      installLoginHelpers();
      installChangePasswordAction();
    });
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
      if (event === 'SIGNED_IN' && new URLSearchParams(location.search).get('magic_login') === '1') {
        history.replaceState(null, '', '/admin.html#dashboard');
        setTimeout(() => location.reload(), 150);
      }
    });
    if (recoveryMode) setTimeout(showResetForm, 0);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeUi);
  else observeUi();
  initAuthRecovery();
})();
