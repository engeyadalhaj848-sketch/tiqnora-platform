# Tiqnora AI — Phase 1 Activation Guide

## ما تم إصلاحه في الكود (يحتاج Push + Deploy)

1. `supabase/migrations/010_phase1_activation.sql` — تفعيل الوكلاء + org + commerce + shipping + OAuth vault
2. `api/ai-workforce/chat.js` — إصلاح نموذج Gemini الافتراضي إلى `gemini-2.5-flash` + دعم Grok (xAI)
3. `api/ai-workforce/providers.js` — حالة اتصال المزودين بدون كشف المفاتيح
4. `api/reports/telegram.js` — تقرير يومي يشمل استخدام AI والوكلاء
5. `js/admin-app.js` — شاشة AI Settings محسّنة (مزودون + سجل محادثات)
6. PWA للإدارة: `admin-manifest.json` + `admin-sw.js` + meta في `admin.html`
7. `admin.css` — تحسينات Mobile First
8. `sitemap.xml` — توسيع الصفحات + hreflang
9. `.env.example` + `build.mjs` ينسخ أصول PWA

## خطوات المالك (إلزامية — لا يمكن تنفيذها من خارج حسابك)

### أ) Supabase SQL Editor

1. افتح مشروع `mndyabvlhvrhdbgmepkg`
2. نفّذ بالترتيب إن لم تُنفَّذ سابقاً: 002 → 009
3. نفّذ **`010_phase1_activation.sql`** كاملاً
4. (اختياري بعد تسجيل دخول أدمن) نفّذ:
   ```sql
   select public.phase1_status();
   ```

### ب) Vercel Environment Variables (Production)

أضف (بدون مسافات زائدة):

| Variable | مطلوب؟ |
|----------|--------|
| `GEMINI_API_KEY` | نعم لتفعيل الوكلاء |
| `GEMINI_MODEL` | اختياري = `gemini-2.5-flash` |
| `OPENAI_API_KEY` | اختياري |
| `ANTHROPIC_API_KEY` | اختياري |
| `XAI_API_KEY` | اختياري (Grok) |
| `TELEGRAM_BOT_TOKEN` | نعم للتقارير |
| `TELEGRAM_CHAT_ID` | نعم للتقارير |
| `CRON_SECRET` | مُستحسن |
| `SUPABASE_URL` | مُستحسن |
| `SUPABASE_ANON_KEY` | مُستحسن |
| `SUPABASE_SERVICE_ROLE_KEY` | مُستحسن لتقارير أعمق |

ثم **Redeploy**.

### ج) حساب المالك

1. افتح https://www.tiqnora.com/admin
2. سجّل بـ `eng.eyadalhaj848@gmail.com` (أو البريد في ownerEmails)
3. إن ظهر «حسابك ليس أدمن» نفّذ في SQL:
   ```sql
   update public.profiles
   set role = 'super_admin', is_active = true
   where lower(email) = 'eng.eyadalhaj848@gmail.com';
   ```

### د) اختبار الوكلاء

1. Admin → AI / Workforce
2. تأكد أن 4 وكلاء ظاهرون ومفعّلون
3. افتح `/admin/ai-workforce/` وجرّب رسالة لكل وكيل

### هـ) Telegram

- Cron مضبوط في `vercel.json`: يومياً 18:00 UTC → `/api/reports/telegram`
- اختبار يدوي بعد ضبط التوكن:
  ```
  curl -X POST https://www.tiqnora.com/api/reports/telegram \
    -H "Authorization: Bearer $CRON_SECRET"
  ```

### و) تثبيت اللوحة على الجوال (PWA)

1. افتح `/admin` من متصفح الجوال (Chrome/Safari)
2. «إضافة إلى الشاشة الرئيسية»
3. يعمل بوضع standalone

## ما لا يمكن تنفيذه من هذه الجلسة

- Push إلى GitHub الخاص بك (لا يوجد وصول كتابة)
- تشغيل SQL على مشروعك (لا يوجد service role)
- ضبط متغيرات Vercel
- تسجيل دخول كالمالك

بعد Push من جهازك ستظهر التغييرات تلقائياً على Vercel إن كان المشروع مربوطاً.
