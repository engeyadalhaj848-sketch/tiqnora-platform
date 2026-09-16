-- Phase 4 growth: demo workflows + marketplace architecture (no live trading)
create table if not exists public.demo_workflows (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title_ar text not null,
  title_en text,
  description_ar text,
  category text not null default 'general',
  steps jsonb not null default '[]'::jsonb,
  agent_slug text,
  is_public boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.demo_workflows (slug, title_ar, title_en, description_ar, category, agent_slug, steps, sort_order) values
('marketing-plan', 'خطة تسويق لمتجر سعودي', 'Saudi store marketing plan', 'ولّد خطة تسويق أسبوعية عبر وكيل التسويق', 'marketing', 'marketing',
 '[{"n":1,"ar":"صف نشاطك ومنتجك"},{"n":2,"ar":"اختر الجمهور والمنطقة"},{"n":3,"ar":"اطلب الخطة من الوكيل"},{"n":4,"ar":"احفظ النتائج في مشروع"}]'::jsonb, 10),
('content-seo', 'محتوى + SEO لصفحة خدمة', 'Service page content + SEO', 'اكتب عنوان ووصف ومحتوى محسّن لمحركات البحث', 'content', 'content',
 '[{"n":1,"ar":"حدد الخدمة والكلمة المفتاحية"},{"n":2,"ar":"اطلب مسودة من وكيل المحتوى"},{"n":3,"ar":"راجع العناوين والـ meta"}]'::jsonb, 20),
('social-calendar', 'تقويم محتوى سوشيال', 'Social content calendar', 'خطة منشورات لأسبوع على إنستغرام ولينكدإن', 'social', 'social-media',
 '[{"n":1,"ar":"حدد المنصات والأهداف"},{"n":2,"ar":"اطلب 7 أفكار منشورات"},{"n":3,"ar":"اختر أفضل 3 للتنفيذ"}]'::jsonb, 30),
('tech-audit', 'مراجعة تقنية سريعة', 'Quick tech audit', 'أسئلة تشخيصية من المساعد التقني', 'developer', 'developer',
 '[{"n":1,"ar":"صف النظام الحالي"},{"n":2,"ar":"اذكر المشاكل"},{"n":3,"ar":"اطلب توصيات مرتبة بالأولوية"}]'::jsonb, 40),
('product-research', 'بحث منتج للدروبشيبينغ', 'Dropship product research', 'أفكار منتجات بدون تنفيذ شراء تلقائي', 'commerce', 'commerce',
 '[{"n":1,"ar":"حدد الفئة والسوق"},{"n":2,"ar":"اطلب أفكار منتجات وهوامش"},{"n":3,"ar":"راجع الموردين يدوياً من الأدمن"}]'::jsonb, 50)
on conflict (slug) do update set title_ar = excluded.title_ar, steps = excluded.steps, description_ar = excluded.description_ar;

-- Marketplace architecture (listings catalog; not a live multi-vendor checkout)
create table if not exists public.marketplace_vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  name text not null,
  status text not null default 'pending' check (status in ('pending','approved','suspended')),
  contact_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references public.marketplace_vendors(id) on delete cascade,
  title_ar text not null,
  title_en text,
  description_ar text,
  price numeric(12,2),
  currency text not null default 'SAR',
  category text,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  fulfillment text not null default 'manual' check (fulfillment in ('manual','dropship','digital','service')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dropshipping research notes (approval-safe; no auto buy)
create table if not exists public.dropship_research (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  category text,
  notes text,
  estimated_cost numeric(12,2),
  estimated_price numeric(12,2),
  supplier_hint text,
  status text not null default 'idea' check (status in ('idea','researching','approved','rejected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.demo_workflows enable row level security;
alter table public.marketplace_vendors enable row level security;
alter table public.marketplace_listings enable row level security;
alter table public.dropship_research enable row level security;

drop policy if exists "demo_public_read" on public.demo_workflows;
create policy "demo_public_read" on public.demo_workflows for select using (is_public = true or public.is_admin());
drop policy if exists "demo_admin" on public.demo_workflows;
create policy "demo_admin" on public.demo_workflows for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "mkt_vendor_admin" on public.marketplace_vendors;
create policy "mkt_vendor_admin" on public.marketplace_vendors for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "mkt_list_admin" on public.marketplace_listings;
create policy "mkt_list_admin" on public.marketplace_listings for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "mkt_list_public" on public.marketplace_listings;
create policy "mkt_list_public" on public.marketplace_listings for select using (status = 'published' or public.is_admin());

drop policy if exists "dropship_member" on public.dropship_research;
create policy "dropship_member" on public.dropship_research for all
  using (public.is_admin() or public.is_org_member(organization_id))
  with check (public.is_admin() or public.is_org_member(organization_id));
