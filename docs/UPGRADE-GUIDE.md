# Tiqnora AI Platform v3 — دليل الترقية والتشغيل

تمت ترقية الموقع من نسخة ثابتة إلى **منصة مُدارة كاملة** بقاعدة بيانات Supabase، مع الحفاظ على كل المزايا السابقة.

## ما الجديد (v3)

| النظام | الوصف |
|---|---|
| قاعدة بيانات Supabase | 22 جدولًا + RLS + Storage + RPC (انظر `supabase/schema.sql`) |
| لوحة تحكم حقيقية | `admin.html` — تسجيل دخول آمن، 17 قسمًا، إدارة كل شيء |
| متجر إ
ي | `shop.html` + `product.html` + سلة + `checkout.html` + طلبات فعلية |
| تتبع الشحنات | `track.html` — للعميل برقم الطلب |
| CMS | إدارة الهوية، الهيرو، التواصل، الثيم، إعدادات المتجر — من اللوحة |
| شحن | إعدادات SMSA / SPL / Aramex / DHL جاهزة لمفاتيح API من اللوحة |
| وحدات AI | 6 وحدات قابلة للتفعيل والضبط من اللوحة (جاهزة للربط) |
| SEO + GEO | Schema.org كامل، hreflang، sitemap شامل، llms.txt، OG/Twitter |
| ثيمات جديدة | royal (Luxury Corporate) وaurora (Dark Future AI) + الخمسة السابقة |

## خطوات التشغيل (مرة واحدة)

1. **قاعدة البيانات:** في Supabase → SQL Editor، نفّذ `supabase/schema.sql` ثم `supabase/seed.sql`.
2. **مفاتيح الاتصال:** من Supabase → Settings → API، انسخ Project URL وanon public key، وضعهما في `js/config.js`.
3. **حساب المالك:** في لوحة التحكم `admin.html`، سجّل حسابًا بالبريد `eng.eyadalhaj848@gmail.com` — يحصل تلقائيًا على صلاحية المالك (super_admin).
4. **النشر:** ارفع التغييرات إلى GitHub — Vercel يعيد النشر تلقائيًا.

> ملاحظة أمان: anon key مصمم للعرض العام — الحماية عبر Row Level Security على مستوى قاعدة البيانات.

## البنية

```
├── index.html            # الموقع الرئيسي (يقرأ من DB مع fallback ثابت)
├── shop.html             # المتجر
├── product.html          # صفحة المنتج
├── checkout.html         # إتمام الطلب
├── track.html            # تتبع الطلب/الشحنة
├── admin.html            # لوحة التحكم (محمية بتسجيل الدخول)
├── js/config.js          # إعدادات الاتصال بـ Supabase
├── js/db.js              # طبقة الوصول للبيانات + cache + fallback
├── js/admin-app.js       # تطبيق لوحة التحكم
├── script.js             # منطق الموقع + i18n + ثيمات
├── supabase/schema.sql   # مخطط قاعدة البيانات الكامل
├── supabase/seed.sql     # ترحيل المحتوى الحالي
└── llms.txt              # تحسين محركات البحث الذكية (GEO)
```

## سلوك الـ Fallback

- بدون تكوين Supabase: الموقع يعمل كاملًا بالمحتوى الثابت المدمج (كما في v2).
- مع تكوين Supabase: المحتوى يُقرأ من قاعدة البيانات، والتعديلات من اللوحة تظهر للجميع خلال دقائق (كاش 5 دقائق).
