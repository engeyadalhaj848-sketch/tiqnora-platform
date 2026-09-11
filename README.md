# Tiqnora AI Platform

منصة أعمال تقنية سعودية متكاملة — موقع ثنائي اللغة (عربي RTL / إنجليزي LTR) + متجر إلكتروني + لوحة تحكم مُدارة بالكامل عبر Supabase.

## البنية

- **موقع ثابت سريع** (بدون إطار عمل) يُنشر على Vercel
- **Supabase** كخلفية كاملة: قاعدة بيانات + مصادقة + تخزين + RLS
- **لوحة تحكم** في `admin.html`: 18 قسمًا — خدمات، منتجات، طلبات، شحن، AI، CMS، SEO، مستخدمون، سجلات
- **Tiqnora AI Workforce** في `/admin/ai-workforce/`: أربعة موظفين داخليين، محادثات، مهام، وذاكرة مؤسسية محمية
- **متجر**: تصفح، سلة، إتمام طلب، تتبع شحنة
- **نظام fallback**: الموقع يعمل كاملًا حتى بدون قاعدة بيانات

## التشغيل السريع

1. نفّذ `supabase/schema.sql` ثم `supabase/seed.sql` في Supabase SQL Editor
2. نفّذ ملفات `supabase/migrations/` بالترتيب، وآخرها `003_ai_workforce.sql`
3. ضع Project URL وanon key في `js/config.js`
4. أنشئ حساب المالك من `admin.html` (البريد في `ownerEmails` يحصل على صلاحية المالك تلقائيًا)
5. أضف `OPENAI_API_KEY` أو `ANTHROPIC_API_KEY` كمتغير خادم في Vercel لتفعيل ردود الموظفين
6. `npm run build` ثم انشر مجلد `dist/`

مفاتيح مزودي الذكاء الاصطناعي لا تُحفظ في المستودع أو المتصفح أو `site_settings`. نقطة الخادم في `api/ai-workforce/chat.js` تتحقق من جلسة Supabase ودور الأدمن قبل إرسال أي طلب للمزود.

التفاصيل الكاملة في `docs/UPGRADE-GUIDE.md`.

## المحتوى والتعديل

كل المحتوى (خدمات، باقات، منتجات، هوية، SEO، ثيمات) يُدار من لوحة التحكم — بدون لمس الكود. الموقع يقرأ من قاعدة البيانات مع كاش 5 دقائق، ويرجع للمحتوى المدمج عند تعطل الاتصال.

## الثيمات

7 ثيمات: midnight (افتراضي) · pearl · desert · ocean · forest · royal (Luxury Corporate) · aurora (Dark Future AI)
