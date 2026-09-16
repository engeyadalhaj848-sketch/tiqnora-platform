-- Phase 5: blog posts for SEO content system
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title_ar text not null,
  title_en text,
  excerpt_ar text,
  excerpt_en text,
  body_ar text not null default '',
  body_en text,
  cover_image text,
  tags text[] default '{}',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  seo_title text,
  seo_description text,
  published_at timestamptz,
  author_name text default 'Tiqnora AI',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_blog_posts_status on public.blog_posts(status, published_at desc);

alter table public.blog_posts enable row level security;
drop policy if exists "blog_public_read" on public.blog_posts;
create policy "blog_public_read" on public.blog_posts for select using (status = 'published' or public.is_admin());
drop policy if exists "blog_admin" on public.blog_posts;
create policy "blog_admin" on public.blog_posts for all using (public.is_admin()) with check (public.is_admin());

insert into public.blog_posts (slug, title_ar, excerpt_ar, body_ar, status, seo_title, seo_description, published_at, tags) values
(
  'how-to-choose-it-partner-saudi',
  'كيف تختار شريك تقنية معلومات مناسب لشركتك في السعودية؟',
  'معايير عملية لاختيار مزود خدمات تقنية يفهم بيئة الأعمال المحلية.',
  E'اختيار شريك تقنية ليس قراراً تقنياً فقط، بل قرار تشغيلي.\n\n## ابدأ من المشكلة لا من الأداة\nحدد ما يعطّل العمل اليوم: الشبكة، الأمان، المواقع، التسويق، أم غياب الأتمتة.\n\n## اطلب نطاقاً مكتوباً\nالعرض الجيد يوضح المخرجات، المدة، وما هو خارج النطاق.\n\n## فضّل الصيانة بعد التسليم\nالنظام بدون دعم يتحول إلى عبء.\n\n## ابدأ بباقة واضحة\nفي Tiqnora نبدأ من احتياج مفهوم وباقة قابلة للتوسع عبر المنصة.',
  'published',
  'كيف تختار شريك تقنية في السعودية | Tiqnora AI',
  'دليل عملي لمعايير اختيار مزود خدمات تقنية وتسويق وأتمتة في السوق السعودي.',
  now(),
  array['تقنية','أعمال','السعودية']
),
(
  'ai-for-saudi-smes',
  'الذكاء الاصطناعي للشركات الصغيرة في السعودية: من أين تبدأ؟',
  'خطوات واقعية لاستخدام AI في التسويق والمحتوى دون تعقيد.',
  E'ليس الهدف استبدال فريقك، بل تسريع المهام المتكررة.\n\n## ابدأ بمهمة واحدة\nمحتوى أسبوعي، ردود أولية، أو أفكار حملات.\n\n## اربط الاستخدام بحدود واضحة\nالخطة المجانية في بوابة عملاء Tiqnora مناسبة للتجربة.\n\n## راجع المخرجات بشرّي\nAI يقترح، والقرار يبقى عندك.\n\n## وسّع بعد قياس الفائدة\nإذا وفّر وقتاً حقيقياً، انتقل لخطة أعلى أو اطلب خدمة من الفريق.',
  'published',
  'الذكاء الاصطناعي للشركات الصغيرة في السعودية | Tiqnora AI',
  'كيف تبدأ الشركات السعودية باستخدام AI عملياً في التسويق والمحتوى.',
  now(),
  array['ذكاء اصطناعي','شركات','تسويق']
),
(
  'seo-basics-for-local-business',
  'أساسيات تحسين الظهور في Google للأنشطة المحلية',
  'عناصر SEO مهمة لصفحات الخدمات في السوق المحلي.',
  E'## صفحة لكل خدمة مهمة\nلا تضع كل شيء في صفحة واحدة فقط.\n\n## عنوان ووصف واضحان\nاذكر المدينة أو المنطقة عند الحاجة.\n\n## محتوى يجيب عن أسئلة العميل\nمثل الأسعار التقريبية، طريقة العمل، ووقت التنفيذ.\n\n## اربط المدونة بالخدمات\nالمقالات تدعم الصفحات التجارية دون حشو.\n\nTiqnora توفّر صفحات خدمات ومدونة جاهزة لهذا المسار.',
  'published',
  'أساسيات SEO للأنشطة المحلية | Tiqnora AI',
  'نصائح عملية لتحسين ظهور صفحات الخدمات في نتائج Google.',
  now(),
  array['SEO','تسويق','محتوى']
)
on conflict (slug) do update set status = 'published', body_ar = excluded.body_ar, updated_at = now();


-- Extra marketing demos for conversion content
insert into public.demo_workflows (slug, title_ar, description_ar, category, agent_slug, steps, sort_order) values
('campaign-ideas', 'أفكار حملات إعلانية', 'ولّد 5 أفكار حملات مع جمهور وميزانية تقديرية بالريال', 'marketing', 'marketing',
 '[{"n":1,"ar":"صف المنتج والمدينة"},{"n":2,"ar":"اطلب أفكار الحملات"},{"n":3,"ar":"اختر فكرة ونفّذها"}]'::jsonb, 15),
('social-posts-batch', 'دفعة منشورات سوشيال', 'اكتب 5 منشورات جاهزة للنشر', 'social', 'social-media',
 '[{"n":1,"ar":"حدد العرض أو المناسبة"},{"n":2,"ar":"اطلب المنشورات"},{"n":3,"ar":"راجع وعدّل قبل النشر"}]'::jsonb, 25)
on conflict (slug) do nothing;
