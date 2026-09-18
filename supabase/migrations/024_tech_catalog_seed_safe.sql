-- SAFE tech catalog seed (no VALUES+status type conflict)
-- Run this file instead of any old 023 paste from chat history.

-- 1) Brands
insert into public.brands (slug, name, status, sort_order)
select 'tiqnora', 'Tiqnora', 'published'::public.content_status, 1
where not exists (select 1 from public.brands where slug = 'tiqnora');

insert into public.brands (slug, name, status, sort_order)
select 'tp-link', 'TP-Link', 'published'::public.content_status, 2
where not exists (select 1 from public.brands where slug = 'tp-link');

insert into public.brands (slug, name, status, sort_order)
select 'hikvision', 'Hikvision', 'published'::public.content_status, 3
where not exists (select 1 from public.brands where slug = 'hikvision');

insert into public.brands (slug, name, status, sort_order)
select 'hp', 'HP', 'published'::public.content_status, 4
where not exists (select 1 from public.brands where slug = 'hp');

insert into public.brands (slug, name, status, sort_order)
select 'lenovo', 'Lenovo', 'published'::public.content_status, 5
where not exists (select 1 from public.brands where slug = 'lenovo');

insert into public.brands (slug, name, status, sort_order)
select 'generic-tech', 'Generic Tech', 'published'::public.content_status, 6
where not exists (select 1 from public.brands where slug = 'generic-tech');

-- 2) Categories (one row each; enum cast on literal)
insert into public.categories (
  slug, type, name_ar, name_en, description_ar, description_en,
  sort_order, status, seo_title_ar, seo_title_en, seo_description_ar, seo_description_en, keywords_ar, keywords_en
)
select
  'computers-laptops', 'product',
  'أجهزة الكمبيوتر واللابتوب', 'Computers & Laptops',
  'لابتوبات وأجهزة مكتبية للأعمال والمنازل.', 'Laptops and desktops for business and home.',
  10, 'published'::public.content_status,
  'أجهزة كمبيوتر ولابتوب | متجر Tiqnora AI', 'Computers & Laptops | Tiqnora AI Store',
  'تسوق لابتوبات وأجهزة كمبيوتر للأعمال في السعودية مع شحن ودعم.', 'Shop business computers and laptops in Saudi Arabia.',
  'لابتوب، كمبيوتر، مكتبي', 'laptop, computer, desktop'
where not exists (select 1 from public.categories where slug = 'computers-laptops');

insert into public.categories (
  slug, type, name_ar, name_en, description_ar, description_en,
  sort_order, status, seo_title_ar, seo_title_en, seo_description_ar, seo_description_en, keywords_ar, keywords_en
)
select
  'networking-equipment', 'product',
  'معدات الشبكات', 'Networking Equipment',
  'راوترات، سويتشات، وكابلات للشبكات المنزلية والمكتبية.', 'Routers, switches and cabling for home and office networks.',
  20, 'published'::public.content_status,
  'معدات شبكات | متجر Tiqnora AI', 'Networking Equipment | Tiqnora AI Store',
  'معدات شبكات وواي فاي للشركات والمنازل في السعودية.', 'Networking and WiFi gear for Saudi homes and offices.',
  'سويتش، راوتر، شبكة', 'switch, router, network'
where not exists (select 1 from public.categories where slug = 'networking-equipment');

insert into public.categories (
  slug, type, name_ar, name_en, description_ar, description_en,
  sort_order, status, seo_title_ar, seo_title_en, seo_description_ar, seo_description_en, keywords_ar, keywords_en
)
select
  'cctv-security', 'product',
  'أنظمة المراقبة والأمن', 'CCTV & Security Systems',
  'كاميرات وأنظمة تسجيل وحلول أمن للمواقع.', 'Cameras, recorders and security solutions for sites.',
  30, 'published'::public.content_status,
  'كاميرات مراقبة وأنظمة أمن | Tiqnora AI', 'CCTV & Security | Tiqnora AI Store',
  'أنظمة مراقبة وأمن للمنازل والشركات في السعودية.', 'CCTV and security systems for Saudi homes and businesses.',
  'كاميرا، NVR، أمن', 'cctv, nvr, security'
where not exists (select 1 from public.categories where slug = 'cctv-security');

insert into public.categories (
  slug, type, name_ar, name_en, description_ar, description_en,
  sort_order, status, seo_title_ar, seo_title_en, seo_description_ar, seo_description_en, keywords_ar, keywords_en
)
select
  'printers-accessories', 'product',
  'الطابعات والملحقات', 'Printers & Accessories',
  'طابعات ليزر وحبر وملحقات مكتبية.', 'Laser and ink printers with office accessories.',
  40, 'published'::public.content_status,
  'طابعات وملحقات | متجر Tiqnora AI', 'Printers & Accessories | Tiqnora AI Store',
  'طابعات ومستلزمات طباعة للمكاتب في السعودية.', 'Printers and supplies for Saudi offices.',
  'طابعة، حبر، تونر', 'printer, ink, toner'
where not exists (select 1 from public.categories where slug = 'printers-accessories');

insert into public.categories (
  slug, type, name_ar, name_en, description_ar, description_en,
  sort_order, status, seo_title_ar, seo_title_en, seo_description_ar, seo_description_en, keywords_ar, keywords_en
)
select
  'smart-office', 'product',
  'تقنيات المكتب الذكي', 'Smart Office Technology',
  'أجهزة اجتماعات وإنتاجية للمكتب الحديث.', 'Meeting and productivity devices for modern offices.',
  50, 'published'::public.content_status,
  'تقنيات مكتب ذكي | Tiqnora AI', 'Smart Office Technology | Tiqnora AI Store',
  'حلول مكتب ذكي واجتماعات عن بعد في السعودية.', 'Smart office and meeting solutions in Saudi Arabia.',
  'مؤتمرات، مكتب، إنتاجية', 'conference, office, productivity'
where not exists (select 1 from public.categories where slug = 'smart-office');

insert into public.categories (
  slug, type, name_ar, name_en, description_ar, description_en,
  sort_order, status, seo_title_ar, seo_title_en, seo_description_ar, seo_description_en, keywords_ar, keywords_en
)
select
  'ai-digital-solutions', 'product',
  'حلول رقمية بالذكاء الاصطناعي', 'AI Digital Solutions',
  'باقات رقمية: دردشة ذكية، أتمتة، ومحتوى تسويقي.', 'Digital packages: AI chat, automation and marketing content.',
  60, 'published'::public.content_status,
  'حلول AI رقمية | Tiqnora AI', 'AI Digital Solutions | Tiqnora AI',
  'باقات ذكاء اصطناعي وأتمتة للشركات في السعودية.', 'AI and automation packages for Saudi businesses.',
  'ذكاء اصطناعي، أتمتة، شات', 'AI, automation, chatbot'
where not exists (select 1 from public.categories where slug = 'ai-digital-solutions');

update public.categories
set status = 'published'::public.content_status, updated_at = now()
where slug in (
  'computers','computers-laptops','networking-equipment','cctv-cameras','cctv-security',
  'printers','printers-accessories','smart-office','ai-digital-solutions'
);

do $$
declare
  base text := 'https://www.tiqnora.com/assets/products/';
  c_comp uuid; c_net uuid; c_sec uuid; c_prt uuid; c_off uuid; c_ai uuid;
  b_len uuid; b_tpl uuid; b_hik uuid; b_hp uuid; b_tiq uuid; b_gen uuid;
begin
  select id into c_comp from public.categories where slug in ('computers-laptops','computers') order by case when slug='computers-laptops' then 0 else 1 end limit 1;
  select id into c_net from public.categories where slug = 'networking-equipment' limit 1;
  select id into c_sec from public.categories where slug in ('cctv-security','cctv-cameras') order by case when slug='cctv-security' then 0 else 1 end limit 1;
  select id into c_prt from public.categories where slug in ('printers-accessories','printers') order by case when slug='printers-accessories' then 0 else 1 end limit 1;
  select id into c_off from public.categories where slug = 'smart-office' limit 1;
  select id into c_ai from public.categories where slug = 'ai-digital-solutions' limit 1;

  select id into b_len from public.brands where slug = 'lenovo' limit 1;
  select id into b_tpl from public.brands where slug = 'tp-link' limit 1;
  select id into b_hik from public.brands where slug = 'hikvision' limit 1;
  select id into b_hp from public.brands where slug = 'hp' limit 1;
  select id into b_tiq from public.brands where slug = 'tiqnora' limit 1;
  select id into b_gen from public.brands where slug = 'generic-tech' limit 1;

  insert into public.products (
    slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
    price, discount_percent, cost_price, stock_quantity, track_stock, images,
    is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
    campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
  ) values
  -- Computers
  ('tech-laptop-biz','TECH-LAP-15',c_comp,b_len,
   'لابتوب أعمال 15.6 إنش','Business Laptop 15.6\"',
   'لابتوب مكتبي عملي للأعمال والمهام اليومية مع شاشة واسعة وأداء مناسب للمكاتب.',
   'Practical business laptop for daily office workloads with a full-size display.',
   2499,8,1890,25,true,array[base||'tech-laptop-biz-1.jpg'],
   true,true,100,'own_stock','تجهيز 1–3 أيام عمل · شحن داخل المملكة',
   array['best-seller'],'manual','لابتوب، أعمال، كمبيوتر',
   'لابتوب أعمال 15.6 | متجر Tiqnora AI','لابتوب أعمال بشاشة 15.6 للأعمال في السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('مناسب للعمل المكتبي','شاشة 15.6 إنش','أداء يومي موثوق'),
     'benefits_en', jsonb_build_array('Office ready','15.6\" display','Reliable daily performance'),
     'specs', jsonb_build_object('screen','15.6\"','use','business'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل يشمل نظام تشغيل؟','a','حسب التجهيز المعروض عند الطلب؛ يتم التوضيح قبل الشحن.'))
   )),
  ('tech-mini-pc','TECH-MINI-PC',c_comp,b_gen,
   'جهاز ميني PC مكتبي','Office Mini PC',
   'جهاز مكتبي صغير الحجم للمساحات المحدودة مع أداء مناسب للمهام الإدارية.',
   'Compact office mini PC for limited spaces and administrative tasks.',
   1299,10,920,30,true,array[base||'tech-mini-pc-1.jpg'],
   true,false,110,'own_stock','تجهيز 1–3 أيام عمل · شحن داخل المملكة',
   array[]::text[],'manual','ميني بي سي، مكتبي',
   'ميني PC مكتبي | Tiqnora AI','جهاز مكتبي صغير للمكاتب في السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('حجم مدمج','توفير مساحة','مناسب للمكاتب'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل يحتاج شاشة منفصلة؟','a','نعم، عادةً يُوصل بشاشة ولوحة مفاتيح منفصلة.'))
   )),
  ('tech-aio-desktop','TECH-AIO-24',c_comp,b_hp,
   'جهاز الكل في واحد 24 إنش','24\" All-in-One Desktop',
   'جهاز مكتبي متكامل بشاشة مدمجة لمظهر مرتب في المكاتب والاستقبال.',
   'All-in-one desktop with built-in display for tidy office setups.',
   2899,5,2200,15,true,array[base||'tech-aio-desktop-1.jpg'],
   true,true,120,'own_stock','تجهيز 2–4 أيام عمل · شحن داخل المملكة',
   array['featured'],'manual','الكل في واحد، مكتبي',
   'جهاز All-in-One 24 إنش | Tiqnora AI','كمبيوتر مكتبي متكامل للشركات في السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('شاشة مدمجة','مظهر احترافي','توفير مساحة المكتب'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل يناسب الاستقبال؟','a','نعم، شائع لمكاتب الاستقبال والسكرتارية.'))
   )),
  -- Networking
  ('tech-switch-8','TECH-SW-8G',c_net,b_tpl,
   'سويتش جيجابت 8 منافذ','8-Port Gigabit Switch',
   'سويتش شبكة سلكي لتوسيع المنافذ في المكتب أو المنزل بسرعة جيجابت.',
   'Wired gigabit switch to expand ports at office or home.',
   189,12,110,60,true,array[base||'tech-switch-8-1.jpg'],
   true,true,200,'own_stock','تجهيز 1–2 أيام عمل · شحن داخل المملكة',
   array['best-seller'],'manual','سويتش، شبكة',
   'سويتش 8 منافذ جيجابت | Tiqnora AI','سويتش شبكة للمكاتب والمنازل في السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('8 منافذ','سرعة جيجابت','تركيب بسيط'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل يحتاج إعداد معقد؟','a','غالباً Plug & Play للشبكات البسيطة.'))
   )),
  ('tech-wifi6-router','TECH-RTR-W6',c_net,b_tpl,
   'راوتر Wi‑Fi 6 مكتبي','Wi‑Fi 6 Office Router',
   'راوتر حديث لتحسين التغطية وعدد الأجهزة المتصلة في المكتب الصغير.',
   'Modern router for better coverage and more connected devices.',
   449,10,290,40,true,array[base||'tech-wifi6-router-1.jpg'],
   true,true,210,'own_stock','تجهيز 1–3 أيام عمل · شحن داخل المملكة',
   array['featured'],'manual','راوتر، واي فاي',
   'راوتر Wi-Fi 6 | Tiqnora AI','راوتر مكتبي بتقنية Wi-Fi 6 في السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('تقنية Wi-Fi 6','تغطية أفضل','مناسب للمكاتب الصغيرة'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل يدعم الألياف؟','a','يعتمد على منفذ WAN وتوافق مزود الخدمة.'))
   )),
  ('tech-cat6-box','TECH-CAT6-305',c_net,b_gen,
   'بكرة كابل Cat6 305م','Cat6 Cable Box 305m',
   'كابل شبكة Cat6 لمشاريع التمديد والتأسيس داخل المكاتب.',
   'Cat6 networking cable for structured cabling projects.',
   399,5,260,35,true,array[base||'tech-cat6-box-1.jpg'],
   true,false,220,'own_stock','تجهيز 1–3 أيام عمل · شحن داخل المملكة',
   array[]::text[],'manual','كابل، cat6',
   'كابل Cat6 305م | Tiqnora AI','تمديدات شبكات Cat6 للمشاريع في السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('طول مناسب للمشاريع','معيار Cat6','للاستخدام الاحترافي'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل يشمل العُلب والفيش؟','a','البكرة للكابل؛ الملحقات تُطلب بشكل منفصل عند الحاجة.'))
   )),
  -- CCTV
  ('tech-nvr-kit','TECH-NVR-4',c_sec,b_hik,
   'بكج NVR 4 قنوات مع كاميرات','4CH NVR Kit with Cameras',
   'مجموعة مراقبة أساسية للمكاتب والمحال: تسجيل شبكي مع كاميرات متوافقة.',
   'Entry NVR kit for offices and shops with compatible cameras.',
   1899,7,1350,20,true,array[base||'tech-nvr-kit-1.jpg'],
   true,true,300,'own_stock','تجهيز 2–4 أيام عمل · قد يلزم جدولة تركيب',
   array['best-seller','featured'],'manual','NVR، كاميرات، مراقبة',
   'بكج كاميرات NVR 4 قنوات | Tiqnora AI','نظام مراقبة للمكاتب والمحال في السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('4 قنوات','مناسب للمحال','تسجيل مركزي'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل التركيب مشمول؟','a','التركيب خدمة منفصلة يمكن ترتيبها حسب الموقع.'))
   )),
  ('tech-ip-dome','TECH-CAM-DM',c_sec,b_hik,
   'كاميرا IP قبة داخلية','Indoor IP Dome Camera',
   'كاميرا شبكة داخلية لمراقبة الممرات والمكاتب بشكل واضح.',
   'Indoor IP dome camera for corridors and office monitoring.',
   349,10,210,50,true,array[base||'tech-ip-dome-1.jpg'],
   true,false,310,'own_stock','تجهيز 1–3 أيام عمل · شحن داخل المملكة',
   array[]::text[],'manual','كاميرا IP، مراقبة',
   'كاميرا IP قبة | Tiqnora AI','كاميرا مراقبة داخلية للشبكات في السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('مناسبة للداخل','اتصال شبكي','تكامل مع NVR'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل تعمل ليلاً؟','a','حسب مواصفات الإضاءة تحت الحمراء للموديل.'))
   )),
  ('tech-access-kit','TECH-ACS-1',c_sec,b_gen,
   'بكج تحكم دخول أساسي','Basic Access Control Kit',
   'مجموعة أساسية للتحكم بالدخول للأبواب المكتبية حسب التجهيز.',
   'Basic door access control kit for office entries.',
   899,8,620,18,true,array[base||'tech-access-kit-1.jpg'],
   true,false,320,'own_stock','تجهيز 2–5 أيام عمل · التركيب منفصل',
   array[]::text[],'manual','تحكم دخول، أمن',
   'نظام تحكم دخول أساسي | Tiqnora AI','حلول دخول للأبواب المكتبية في السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('تحكم بالدخول','مناسب للمكاتب','قابل للتوسع لاحقاً'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل يحتاج فني؟','a','يُنصح بتركيب متخصص لضمان السلامة والتوافق.'))
   )),
  -- Printers
  ('tech-laser-printer','TECH-PRT-LSR',c_prt,b_hp,
   'طابعة ليزر أحادية','Mono Laser Printer',
   'طابعة ليزر للمستندات المكتبية بسرعة مناسبة للاستخدام اليومي.',
   'Mono laser printer for everyday office documents.',
   799,10,540,28,true,array[base||'tech-laser-printer-1.jpg'],
   true,true,400,'own_stock','تجهيز 1–3 أيام عمل · شحن داخل المملكة',
   array['best-seller'],'manual','طابعة ليزر، مكتب',
   'طابعة ليزر مكتبية | Tiqnora AI','طابعة ليزر للمستندات في السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('طباعة مستندات','مناسبة للمكتب','تكلفة تشغيل معقولة'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل تطبع ملوناً؟','a','هذا الموديل أحادي اللون للمستندات.'))
   )),
  ('tech-ink-tank','TECH-PRT-INK',c_prt,b_hp,
   'طابعة خزان حبر ملونة','Color Ink Tank Printer',
   'طابعة خزانات حبر للطباعة الملونة بتكلفة أقل على المدى المتوسط.',
   'Color ink-tank printer for lower ongoing print costs.',
   999,8,690,22,true,array[base||'tech-ink-tank-1.jpg'],
   true,false,410,'own_stock','تجهيز 1–3 أيام عمل · شحن داخل المملكة',
   array[]::text[],'manual','طابعة حبر، ملون',
   'طابعة خزان حبر | Tiqnora AI','طباعة ملونة اقتصادية للمكاتب.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('طباعة ملونة','خزانات حبر','تكلفة أقل للصفحة'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل تشمل الأحبار؟','a','حسب التجهيز؛ يُوضَّح محتوى الصندوق قبل الشحن.'))
   )),
  ('tech-toner-set','TECH-TNR-SET',c_prt,b_gen,
   'طقم مستلزمات طباعة','Printer Supplies Set',
   'مجموعة مستلزمات طباعة للاستخدام المكتبي حسب التوافق مع الطابعة.',
   'Office printer supplies set — compatibility confirmed before fulfillment.',
   249,15,140,45,true,array[base||'tech-toner-set-1.jpg'],
   true,false,420,'own_stock','تجهيز 1–2 أيام عمل · شحن داخل المملكة',
   array[]::text[],'manual','تونر، مستلزمات',
   'مستلزمات طباعة | Tiqnora AI','مستلزمات طابعات للمكاتب في السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('للمكاتب','توريد عند الطلب','توافق يُراجع قبل الشحن'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل يصلح لكل الطابعات؟','a','لا؛ يُحدد التوافق حسب موديل طابعتك.'))
   )),
  -- Smart office
  ('tech-conf-cam','TECH-CAM-CF',c_off,b_gen,
   'كاميرا اجتماعات فيديو','Video Conference Camera',
   'كاميرا للاجتماعات عن بُعد والعروض التقديمية في غرف الاجتماعات.',
   'Conference camera for remote meetings and presentation rooms.',
   599,10,380,30,true,array[base||'tech-conf-cam-1.jpg'],
   true,true,500,'own_stock','تجهيز 1–3 أيام عمل · شحن داخل المملكة',
   array['featured'],'manual','اجتماعات، كاميرا',
   'كاميرا اجتماعات | Tiqnora AI','حلول اجتماعات فيديو للمكاتب السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('للاجتماعات عن بعد','سهولة الربط','غرف الاجتماعات'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل تعمل مع زوم وتييمز؟','a','عادةً عبر USB مع تطبيقات الاجتماعات الشائعة.'))
   )),
  ('tech-presenter','TECH-PRS-1',c_off,b_gen,
   'مؤشر تقديم لاسلكي','Wireless Presenter',
   'أداة تقديم لاسلكية للعروض والاجتماعات والتنقل بين الشرائح.',
   'Wireless presenter for slides and meeting presentations.',
   129,12,70,55,true,array[base||'tech-presenter-1.jpg'],
   true,false,510,'own_stock','تجهيز 1–2 أيام عمل · شحن داخل المملكة',
   array[]::text[],'manual','تقديم، عروض',
   'مؤشر تقديم لاسلكي | Tiqnora AI','ملحق عروض تقديمية للمكاتب.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('لاسلكي','خفيف','مثالي للعروض'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل يحتاج بلوتوث؟','a','حسب الموديل؛ كثير منها يعمل بمستقبل USB.'))
   )),
  ('tech-desk-dock','TECH-DOCK-USB',c_off,b_gen,
   'محطة توصيل مكتبية USB-C','USB-C Desk Dock',
   'محطة منافذ لتوصيل الشاشة والملحقات باللابتوب في المكتب.',
   'USB-C dock to connect display and peripherals to a laptop.',
   349,10,220,40,true,array[base||'tech-desk-dock-1.jpg'],
   true,true,520,'own_stock','تجهيز 1–3 أيام عمل · شحن داخل المملكة',
   array['best-seller'],'manual','دوك، USB-C',
   'محطة USB-C مكتبية | Tiqnora AI','دوك إنتاجية للابتوب في المكتب.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('منافذ متعددة','ترتيب المكتب','للابتوب الحديث'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل يدعم HDMI؟','a','حسب مواصفات المحطة؛ يُوضح قبل التأكيد.'))
   )),
  -- AI digital
  ('tech-ai-chatbot','TECH-AI-BOT',c_ai,b_tiq,
   'باقة إعداد مساعد ذكي للموقع','AI Chat Assistant Setup Package',
   'باقة رقمية لإعداد مساعد ذكي للرد على استفسارات العملاء عبر قنواتك الرقمية — تنفيذ بمراجعة فريق Tiqnora.',
   'Digital package to set up an AI assistant for customer queries — delivered with Tiqnora review.',
   1499,0,0,999,false,array[base||'tech-ai-chatbot-1.jpg'],
   true,true,600,'own_stock','خدمة رقمية · جدولة خلال 3–7 أيام عمل',
   array['featured','best-seller'],null,'ذكاء اصطناعي، شات، دعم',
   'باقة مساعد AI للموقع | Tiqnora AI','حلول دردشة ذكية للشركات في السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('ردود أسرع للعملاء','تخصيص حسب نشاطك','تنفيذ بإشراف بشري'),
     'faq', jsonb_build_array(
       jsonb_build_object('q','هل هي منتج مادي؟','a','لا، باقة خدمة رقمية تُنفَّذ بعد الاتفاق على النطاق.'),
       jsonb_build_object('q','كم مدة التنفيذ؟','a','عادة 3–7 أيام عمل حسب تعقيد الربط.')
     )
   )),
  ('tech-automation','TECH-AI-AUTO',c_ai,b_tiq,
   'باقة أتمتة عمليات أساسية','Business Automation Starter',
   'باقة لأتمتة مهام متكررة (تنبيهات، نماذج، تدفّق عمل بسيط) بمراجعة استشارية.',
   'Starter automation package for repetitive tasks with consultative delivery.',
   2499,0,0,999,false,array[base||'tech-automation-1.jpg'],
   true,true,610,'own_stock','خدمة رقمية · جدولة خلال 5–10 أيام عمل',
   array['featured'],null,'أتمتة، عمليات',
   'باقة أتمتة أعمال | Tiqnora AI','أتمتة عمليات للشركات السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('تقليل المهام اليدوية','وضوح الإجراءات','قابل للتوسع'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل تشمل تكامل مع كل الأنظمة؟','a','النطاق يُحدد بعد جلسة اكتشاف قصيرة.'))
   )),
  ('tech-seo-ai','TECH-AI-SEO',c_ai,b_tiq,
   'باقة محتوى وتسويق بالAI','AI Content & SEO Package',
   'باقة إعداد محتوى تسويقي وتحسين ظهور رقمي بمساعدة أدوات AI ومراجعة بشرية.',
   'AI-assisted content and SEO package with human review.',
   999,0,0,999,false,array[base||'tech-seo-ai-1.jpg'],
   true,false,620,'own_stock','خدمة رقمية · تسليم تدريجي خلال أسبوعين',
   array[]::text[],null,'محتوى، SEO، تسويق',
   'باقة محتوى SEO بالAI | Tiqnora AI','محتوى وتسويق رقمي للشركات في السعودية.',
   jsonb_build_object(
     'benefits_ar', jsonb_build_array('محتوى أسرع','مراجعة بشرية','تركيز على الظهور المحلي'),
     'faq', jsonb_build_array(jsonb_build_object('q','هل تضمن الترتيب الأول؟','a','لا نضمن ترتيب Google؛ نحسّن الأسس والمحتوى بشكل مهني.'))
   ))
  on conflict (slug) do update set
    name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    description_ar = excluded.description_ar,
    description_en = excluded.description_en,
    price = excluded.price,
    discount_percent = excluded.discount_percent,
    images = excluded.images,
    category_id = excluded.category_id,
    brand_id = excluded.brand_id,
    specifications = excluded.specifications,
    seo_title_ar = excluded.seo_title_ar,
    seo_description_ar = excluded.seo_description_ar,
    keywords_ar = excluded.keywords_ar,
    is_active = true,
    featured = excluded.featured,
    campaign_tags = excluded.campaign_tags,
    delivery_note_ar = excluded.delivery_note_ar,
    fulfillment_type = excluded.fulfillment_type,
    updated_at = now();
end $$;
