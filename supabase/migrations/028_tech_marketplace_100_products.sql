-- TIQNORA 028 — Tech marketplace expansion: 100 draft products (POS, CCTV, Networking, Hotel/Business)
-- Safe to re-run (slug-based upsert via NOT EXISTS).
-- NO auto-publish: is_active = false until admin approves.
-- NO auto-purchase.
-- Images: reuse existing catalog asset paths as placeholders; admin must replace with official model photos before publish.
-- Depends on categories from 023/024/027 and brands.

-- Brands
insert into public.brands (slug, name, status, sort_order)
select v.slug, v.name, 'published'::public.content_status, v.sort_order
from (values
  ('hikvision'::text, 'Hikvision'::text, 10),
  ('dahua'::text, 'Dahua'::text, 11),
  ('tp-link'::text, 'TP-Link'::text, 2),
  ('ubiquiti'::text, 'Ubiquiti'::text, 12),
  ('grandstream'::text, 'Grandstream'::text, 13),
  ('epson'::text, 'Epson'::text, 14),
  ('zebra'::text, 'Zebra'::text, 15),
  ('honeywell'::text, 'Honeywell'::text, 16),
  ('cisco'::text, 'Cisco'::text, 17),
  ('mikrotik'::text, 'MikroTik'::text, 18),
  ('lenovo'::text, 'Lenovo'::text, 5),
  ('hp'::text, 'HP'::text, 4),
  ('dell'::text, 'Dell'::text, 19),
  ('tiqnora'::text, 'Tiqnora'::text, 1),
  ('generic-tech'::text, 'Generic Tech'::text, 6)
) as v(slug, name, sort_order)
where not exists (select 1 from public.brands b where b.slug = v.slug);

-- Ensure vertical categories
insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'pos-systems', 'product', 'أنظمة نقاط البيع', 'POS Systems',
  'كاشير، باركود، طابعات فواتير وأدراج نقدية', 'POS terminals, scanners, printers, cash drawers',
  70, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'pos-systems');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'cctv-security', 'product', 'أنظمة المراقبة والأمن', 'CCTV & Security',
  'كاميرات، NVR، تحكم دخول وبصمة', 'Cameras, NVR, access control, biometrics',
  30, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'cctv-security');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'networking-equipment', 'product', 'معدات الشبكات', 'Networking Equipment',
  'راوترات، سويتشات، نقاط وصول وألياف', 'Routers, switches, APs, fiber',
  20, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'networking-equipment');

insert into public.categories (slug, type, name_ar, name_en, description_ar, description_en, sort_order, status)
select 'hotel-technology', 'product', 'تقنيات الفنادق والأعمال', 'Hotel & Business Technology',
  'هواتف IP، سنترال، سيرفرات، طابعات ولابتوبات', 'IP phones, PBX, servers, printers, laptops',
  71, 'published'::public.content_status
where not exists (select 1 from public.categories c where c.slug = 'hotel-technology');

do $$
declare
  c_pos uuid; c_cctv uuid; c_net uuid; c_hotel uuid;
  base text := '/assets/products/';
  r record;
  margin numeric;
  vat_amt numeric;
  profit numeric;
  bid uuid;
begin
  select id into c_pos from public.categories where slug = 'pos-systems' limit 1;
  select id into c_cctv from public.categories where slug in ('cctv-security','cctv-cameras') order by case when slug='cctv-security' then 0 else 1 end limit 1;
  select id into c_net from public.categories where slug = 'networking-equipment' limit 1;
  select id into c_hotel from public.categories where slug = 'hotel-technology' limit 1;



  select id into bid from public.brands where slug = 'epson' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-terminal-15-touch') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-terminal-15-touch', 'POS-T15', c_pos, bid,
      'شاشة لمس نقاط بيع 15 إنش', '15" Touch POS Terminal',
      'جهاز نقاط بيع بشاشة لمس 15 إنش مناسب للمطاعم والمحلات.', '15" touch POS terminal for restaurants and retail.',
      1899, 0, 1250, 0, true,
      array[base || 'tech-aio-desktop-1.jpg'],
      false, false, 1000, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'شاشة لمس نقاط بيع 15 إنش | متجر Tiqnora AI', 'اشتر شاشة لمس نقاط بيع 15 إنش في السعودية مع دعم فني وضريبة موضحة. جهاز نقاط بيع بشاشة لمس 15 إنش مناسب للمطاعم والمحلات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 247.7,
        'estimated_profit', 649,
        'margin_pct', 34.2,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('شاشة لمس نقاط بيع 15 إنش','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('15" Touch POS Terminal','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-T15',
          'brand', 'epson',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-T15','brand','epson')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-terminal-restaurant') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-terminal-restaurant', 'POS-REST-01', c_pos, bid,
      'نظام كاشير مطاعم', 'Restaurant POS System',
      'نظام كاشير مخصص للمطاعم مع دعم طلبات الطاولات.', 'Restaurant-focused POS setup for table service.',
      2199, 0, 1450, 0, true,
      array[base || 'tech-aio-desktop-1.jpg'],
      false, false, 1001, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'نظام كاشير مطاعم | متجر Tiqnora AI', 'اشتر نظام كاشير مطاعم في السعودية مع دعم فني وضريبة موضحة. نظام كاشير مخصص للمطاعم مع دعم طلبات الطاولات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 286.83,
        'estimated_profit', 749,
        'margin_pct', 34.1,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('نظام كاشير مطاعم','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Restaurant POS System','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-REST-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-REST-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-terminal-supermarket') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-terminal-supermarket', 'POS-SMKT-01', c_pos, bid,
      'كاشير سوبرماركت', 'Supermarket POS Terminal',
      'محطة بيع للسوبرماركت مع دعم باركود وطابعة فواتير.', 'Supermarket POS station with barcode and receipt support.',
      2499, 0, 1680, 0, true,
      array[base || 'tech-aio-desktop-1.jpg'],
      false, false, 1002, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'كاشير سوبرماركت | متجر Tiqnora AI', 'اشتر كاشير سوبرماركت في السعودية مع دعم فني وضريبة موضحة. محطة بيع للسوبرماركت مع دعم باركود وطابعة فواتير.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 325.96,
        'estimated_profit', 819,
        'margin_pct', 32.8,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('كاشير سوبرماركت','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Supermarket POS Terminal','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-SMKT-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-SMKT-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'epson' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-barcode-1d') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-barcode-1d', 'POS-BC-1D', c_pos, bid,
      'قارئ باركود سلكي 1D', 'Wired 1D Barcode Scanner',
      'قارئ باركود سلكي للقراءة السريعة عند الصندوق.', 'Wired 1D barcode scanner for checkout counters.',
      189, 0, 95, 0, true,
      array[base || 'tech-access-kit-1.jpg'],
      false, false, 1003, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'قارئ باركود سلكي 1D | متجر Tiqnora AI', 'اشتر قارئ باركود سلكي 1D في السعودية مع دعم فني وضريبة موضحة. قارئ باركود سلكي للقراءة السريعة عند الصندوق.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 24.65,
        'estimated_profit', 94,
        'margin_pct', 49.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('قارئ باركود سلكي 1D','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Wired 1D Barcode Scanner','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-BC-1D',
          'brand', 'epson',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-BC-1D','brand','epson')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-barcode-2d') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-barcode-2d', 'POS-BC-2D', c_pos, bid,
      'قارئ باركود ثنائي الأبعاد', '2D Barcode Scanner',
      'يدعم QR والباركود ثنائي الأبعاد للفواتير الإلكترونية.', '2D/QR barcode scanner for e-invoicing workflows.',
      349, 0, 190, 0, true,
      array[base || 'tech-access-kit-1.jpg'],
      false, false, 1004, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'قارئ باركود ثنائي الأبعاد | متجر Tiqnora AI', 'اشتر قارئ باركود ثنائي الأبعاد في السعودية مع دعم فني وضريبة موضحة. يدعم QR والباركود ثنائي الأبعاد للفواتير الإلكترونية.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 45.52,
        'estimated_profit', 159,
        'margin_pct', 45.6,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('قارئ باركود ثنائي الأبعاد','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('2D Barcode Scanner','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-BC-2D',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-BC-2D','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-barcode-wireless') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-barcode-wireless', 'POS-BC-WL', c_pos, bid,
      'قارئ باركود لاسلكي', 'Wireless Barcode Scanner',
      'قارئ لاسلكي للمخازن ونقاط الجرد.', 'Wireless scanner for stock rooms and inventory.',
      429, 0, 240, 0, true,
      array[base || 'tech-access-kit-1.jpg'],
      false, false, 1005, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'قارئ باركود لاسلكي | متجر Tiqnora AI', 'اشتر قارئ باركود لاسلكي في السعودية مع دعم فني وضريبة موضحة. قارئ لاسلكي للمخازن ونقاط الجرد.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 55.96,
        'estimated_profit', 189,
        'margin_pct', 44.1,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('قارئ باركود لاسلكي','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Wireless Barcode Scanner','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-BC-WL',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-BC-WL','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'epson' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-receipt-printer-80') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-receipt-printer-80', 'POS-RP-80', c_pos, bid,
      'طابعة فواتير حرارية 80 مم', '80mm Thermal Receipt Printer',
      'طابعة فواتير حرارية عرض 80 مم لنقاط البيع.', '80mm thermal receipt printer for POS counters.',
      399, 0, 220, 0, true,
      array[base || 'tech-laser-printer-1.jpg'],
      false, false, 1006, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'طابعة فواتير حرارية 80 مم | متجر Tiqnora AI', 'اشتر طابعة فواتير حرارية 80 مم في السعودية مع دعم فني وضريبة موضحة. طابعة فواتير حرارية عرض 80 مم لنقاط البيع.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 52.04,
        'estimated_profit', 179,
        'margin_pct', 44.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('طابعة فواتير حرارية 80 مم','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('80mm Thermal Receipt Printer','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-RP-80',
          'brand', 'epson',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-RP-80','brand','epson')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-receipt-printer-58') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-receipt-printer-58', 'POS-RP-58', c_pos, bid,
      'طابعة فواتير 58 مم', '58mm Receipt Printer',
      'طابعة مدمجة للفواتير الصغيرة والأكشاك.', 'Compact 58mm receipt printer for kiosks.',
      249, 0, 130, 0, true,
      array[base || 'tech-laser-printer-1.jpg'],
      false, false, 1007, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'طابعة فواتير 58 مم | متجر Tiqnora AI', 'اشتر طابعة فواتير 58 مم في السعودية مع دعم فني وضريبة موضحة. طابعة مدمجة للفواتير الصغيرة والأكشاك.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 32.48,
        'estimated_profit', 119,
        'margin_pct', 47.8,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('طابعة فواتير 58 مم','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('58mm Receipt Printer','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-RP-58',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-RP-58','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-cash-drawer') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-cash-drawer', 'POS-CD-STD', c_pos, bid,
      'درج نقدي معدني', 'Metal Cash Drawer',
      'درج نقدي يُربط بطابعة الفواتير عند البيع.', 'Metal cash drawer linked to receipt printer.',
      329, 0, 180, 0, true,
      array[base || 'tech-desk-dock-1.jpg'],
      false, false, 1008, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'درج نقدي معدني | متجر Tiqnora AI', 'اشتر درج نقدي معدني في السعودية مع دعم فني وضريبة موضحة. درج نقدي يُربط بطابعة الفواتير عند البيع.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 42.91,
        'estimated_profit', 149,
        'margin_pct', 45.3,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('درج نقدي معدني','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Metal Cash Drawer','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-CD-STD',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-CD-STD','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'epson' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-customer-display') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-customer-display', 'POS-CDISP', c_pos, bid,
      'شاشة عميل لنقطة البيع', 'POS Customer Display',
      'شاشة عرض السعر للعميل عند الصندوق.', 'Customer-facing price display for checkout.',
      279, 0, 150, 0, true,
      array[base || 'tech-desk-dock-1.jpg'],
      false, false, 1009, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'شاشة عميل لنقطة البيع | متجر Tiqnora AI', 'اشتر شاشة عميل لنقطة البيع في السعودية مع دعم فني وضريبة موضحة. شاشة عرض السعر للعميل عند الصندوق.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 36.39,
        'estimated_profit', 129,
        'margin_pct', 46.2,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('شاشة عميل لنقطة البيع','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('POS Customer Display','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-CDISP',
          'brand', 'epson',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-CDISP','brand','epson')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-all-in-one-kit') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-all-in-one-kit', 'POS-KIT-AIO', c_pos, bid,
      'باقة كاشير متكاملة', 'All-in-One POS Kit',
      'باقة جهاز + باركود + طابعة + درج نقدي.', 'Bundle: terminal, scanner, printer, cash drawer.',
      3499, 0, 2400, 0, true,
      array[base || 'tech-aio-desktop-1.jpg'],
      false, false, 1010, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'باقة كاشير متكاملة | متجر Tiqnora AI', 'اشتر باقة كاشير متكاملة في السعودية مع دعم فني وضريبة موضحة. باقة جهاز + باركود + طابعة + درج نقدي.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 456.39,
        'estimated_profit', 1099,
        'margin_pct', 31.4,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('باقة كاشير متكاملة','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('All-in-One POS Kit','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-KIT-AIO',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-KIT-AIO','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-handheld') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-handheld', 'POS-HH-01', c_pos, bid,
      'جهاز نقاط بيع محمول', 'Handheld POS Device',
      'جهاز محمول للبيع الميداني والتوصيل.', 'Handheld POS for field sales and delivery.',
      1299, 0, 850, 0, true,
      array[base || 'tech-mini-pc-1.jpg'],
      false, false, 1011, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'جهاز نقاط بيع محمول | متجر Tiqnora AI', 'اشتر جهاز نقاط بيع محمول في السعودية مع دعم فني وضريبة موضحة. جهاز محمول للبيع الميداني والتوصيل.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 169.43,
        'estimated_profit', 449,
        'margin_pct', 34.6,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('جهاز نقاط بيع محمول','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Handheld POS Device','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-HH-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-HH-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'epson' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-kitchen-printer') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-kitchen-printer', 'POS-KP-01', c_pos, bid,
      'طابعة مطبخ شبكية', 'Network Kitchen Printer',
      'طابعة طلبات للمطبخ في المطاعم.', 'Network kitchen order printer for restaurants.',
      459, 0, 260, 0, true,
      array[base || 'tech-laser-printer-1.jpg'],
      false, false, 1012, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'طابعة مطبخ شبكية | متجر Tiqnora AI', 'اشتر طابعة مطبخ شبكية في السعودية مع دعم فني وضريبة موضحة. طابعة طلبات للمطبخ في المطاعم.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 59.87,
        'estimated_profit', 199,
        'margin_pct', 43.4,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('طابعة مطبخ شبكية','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Network Kitchen Printer','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-KP-01',
          'brand', 'epson',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-KP-01','brand','epson')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-scale-barcode') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-scale-barcode', 'POS-SC-01', c_pos, bid,
      'ميزان إلكتروني مع باركود', 'Electronic Scale with Barcode',
      'ميزان للمحلات يدعم طباعة ملصق الوزن.', 'Retail scale with barcode label support.',
      899, 0, 560, 0, true,
      array[base || 'tech-desk-dock-1.jpg'],
      false, false, 1013, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'ميزان إلكتروني مع باركود | متجر Tiqnora AI', 'اشتر ميزان إلكتروني مع باركود في السعودية مع دعم فني وضريبة موضحة. ميزان للمحلات يدعم طباعة ملصق الوزن.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 117.26,
        'estimated_profit', 339,
        'margin_pct', 37.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('ميزان إلكتروني مع باركود','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Electronic Scale with Barcode','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-SC-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-SC-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-msr-reader') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-msr-reader', 'POS-MSR', c_pos, bid,
      'قارئ بطاقة مغناطيسية', 'Magnetic Stripe Reader',
      'قارئ بطاقات للدفع والعضويات.', 'Magnetic card reader for payments/membership.',
      199, 0, 100, 0, true,
      array[base || 'tech-access-kit-1.jpg'],
      false, false, 1014, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'قارئ بطاقة مغناطيسية | متجر Tiqnora AI', 'اشتر قارئ بطاقة مغناطيسية في السعودية مع دعم فني وضريبة موضحة. قارئ بطاقات للدفع والعضويات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 25.96,
        'estimated_profit', 99,
        'margin_pct', 49.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('قارئ بطاقة مغناطيسية','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Magnetic Stripe Reader','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-MSR',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-MSR','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'epson' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-touch-monitor-15') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-touch-monitor-15', 'POS-MON-15', c_pos, bid,
      'شاشة لمس 15 إنش للكاشير', '15" POS Touch Monitor',
      'شاشة لمس مستقلة لربطها بوحدة كاشير.', 'Standalone 15" touch monitor for POS PCs.',
      699, 0, 420, 0, true,
      array[base || 'tech-aio-desktop-1.jpg'],
      false, false, 1015, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'شاشة لمس 15 إنش للكاشير | متجر Tiqnora AI', 'اشتر شاشة لمس 15 إنش للكاشير في السعودية مع دعم فني وضريبة موضحة. شاشة لمس مستقلة لربطها بوحدة كاشير.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 91.17,
        'estimated_profit', 279,
        'margin_pct', 39.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('شاشة لمس 15 إنش للكاشير','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('15" POS Touch Monitor','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-MON-15',
          'brand', 'epson',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-MON-15','brand','epson')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-receipt-paper-80') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-receipt-paper-80', 'POS-PAP-80', c_pos, bid,
      'لفائف ورق حراري 80 مم (كرتون)', '80mm Thermal Paper Carton',
      'كرتون لفائف حرارية لنقاط البيع.', 'Carton of 80mm thermal rolls for POS.',
      149, 0, 80, 0, true,
      array[base || 'tech-toner-set-1.jpg'],
      false, false, 1016, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'لفائف ورق حراري 80 مم (كرتون) | متجر Tiqnora AI', 'اشتر لفائف ورق حراري 80 مم (كرتون) في السعودية مع دعم فني وضريبة موضحة. كرتون لفائف حرارية لنقاط البيع.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 19.43,
        'estimated_profit', 69,
        'margin_pct', 46.3,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('لفائف ورق حراري 80 مم (كرتون)','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('80mm Thermal Paper Carton','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-PAP-80',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-PAP-80','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-label-printer') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-label-printer', 'POS-LBL-01', c_pos, bid,
      'طابعة ملصقات باركود', 'Barcode Label Printer',
      'طابعة ملصقات للأسعار والجرد.', 'Barcode label printer for pricing and inventory.',
      549, 0, 320, 0, true,
      array[base || 'tech-laser-printer-1.jpg'],
      false, false, 1017, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'طابعة ملصقات باركود | متجر Tiqnora AI', 'اشتر طابعة ملصقات باركود في السعودية مع دعم فني وضريبة موضحة. طابعة ملصقات للأسعار والجرد.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 71.61,
        'estimated_profit', 229,
        'margin_pct', 41.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('طابعة ملصقات باركود','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Barcode Label Printer','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-LBL-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-LBL-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'epson' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-mini-pc-pos') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-mini-pc-pos', 'POS-MPC-01', c_pos, bid,
      'ميني PC مخصص للكاشير', 'POS Mini PC Unit',
      'وحدة حاسب صغيرة لتشغيل برنامج الكاشير.', 'Mini PC unit to run POS software.',
      999, 0, 650, 0, true,
      array[base || 'tech-mini-pc-1.jpg'],
      false, false, 1018, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'ميني PC مخصص للكاشير | متجر Tiqnora AI', 'اشتر ميني PC مخصص للكاشير في السعودية مع دعم فني وضريبة موضحة. وحدة حاسب صغيرة لتشغيل برنامج الكاشير.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 130.3,
        'estimated_profit', 349,
        'margin_pct', 34.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('ميني PC مخصص للكاشير','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('POS Mini PC Unit','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-MPC-01',
          'brand', 'epson',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-MPC-01','brand','epson')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-wifi-receipt') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-wifi-receipt', 'POS-RP-WIFI', c_pos, bid,
      'طابعة فواتير واي فاي', 'WiFi Receipt Printer',
      'طابعة فواتير لاسلكية للأجهزة اللوحية.', 'WiFi receipt printer for tablet POS.',
      479, 0, 280, 0, true,
      array[base || 'tech-laser-printer-1.jpg'],
      false, false, 1019, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'طابعة فواتير واي فاي | متجر Tiqnora AI', 'اشتر طابعة فواتير واي فاي في السعودية مع دعم فني وضريبة موضحة. طابعة فواتير لاسلكية للأجهزة اللوحية.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 62.48,
        'estimated_profit', 199,
        'margin_pct', 41.5,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('طابعة فواتير واي فاي','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('WiFi Receipt Printer','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-RP-WIFI',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-RP-WIFI','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-barcode-desktop') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-barcode-desktop', 'POS-BC-DSK', c_pos, bid,
      'محطة باركود مكتبية', 'Desktop Barcode Station',
      'محطة ثابتة لقراءة الباركود بكثافة عالية.', 'Desktop high-throughput barcode station.',
      599, 0, 360, 0, true,
      array[base || 'tech-access-kit-1.jpg'],
      false, false, 1020, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'محطة باركود مكتبية | متجر Tiqnora AI', 'اشتر محطة باركود مكتبية في السعودية مع دعم فني وضريبة موضحة. محطة ثابتة لقراءة الباركود بكثافة عالية.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 78.13,
        'estimated_profit', 239,
        'margin_pct', 39.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('محطة باركود مكتبية','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Desktop Barcode Station','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-BC-DSK',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-BC-DSK','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'epson' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-customer-pole') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-customer-pole', 'POS-POLE', c_pos, bid,
      'شاشة عميل عمودية', 'Customer Pole Display',
      'شاشة عميل على حامل عمودي للصندوق.', 'Pole-mounted customer display.',
      259, 0, 140, 0, true,
      array[base || 'tech-desk-dock-1.jpg'],
      false, false, 1021, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'شاشة عميل عمودية | متجر Tiqnora AI', 'اشتر شاشة عميل عمودية في السعودية مع دعم فني وضريبة موضحة. شاشة عميل على حامل عمودي للصندوق.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 33.78,
        'estimated_profit', 119,
        'margin_pct', 45.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('شاشة عميل عمودية','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Customer Pole Display','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-POLE',
          'brand', 'epson',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-POLE','brand','epson')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-cash-drawer-wide') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-cash-drawer-wide', 'POS-CD-W', c_pos, bid,
      'درج نقدي عريض 5 خانات', 'Wide 5-Slot Cash Drawer',
      'درج نقدي بعرض أكبر للفئات النقدية.', 'Wide cash drawer with 5 bill slots.',
      379, 0, 210, 0, true,
      array[base || 'tech-desk-dock-1.jpg'],
      false, false, 1022, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'درج نقدي عريض 5 خانات | متجر Tiqnora AI', 'اشتر درج نقدي عريض 5 خانات في السعودية مع دعم فني وضريبة موضحة. درج نقدي بعرض أكبر للفئات النقدية.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 49.43,
        'estimated_profit', 169,
        'margin_pct', 44.6,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('درج نقدي عريض 5 خانات','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Wide 5-Slot Cash Drawer','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-CD-W',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-CD-W','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-android-terminal') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-android-terminal', 'POS-AND-01', c_pos, bid,
      'كاشير أندرويد', 'Android POS Terminal',
      'جهاز نقاط بيع بنظام أندرويد للتطبيقات الحديثة.', 'Android-based POS terminal for modern apps.',
      1599, 0, 1050, 0, true,
      array[base || 'tech-aio-desktop-1.jpg'],
      false, false, 1023, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'كاشير أندرويد | متجر Tiqnora AI', 'اشتر كاشير أندرويد في السعودية مع دعم فني وضريبة موضحة. جهاز نقاط بيع بنظام أندرويد للتطبيقات الحديثة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 208.57,
        'estimated_profit', 549,
        'margin_pct', 34.3,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('كاشير أندرويد','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Android POS Terminal','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-AND-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-AND-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'epson' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'pos-self-checkout-kiosk') and c_pos is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'pos-self-checkout-kiosk', 'POS-SCO-01', c_pos, bid,
      'كشك دفع ذاتي أساسي', 'Basic Self-Checkout Kiosk',
      'كشك مبسط للدفع الذاتي في المحلات.', 'Entry self-checkout kiosk for retail floors.',
      8999, 0, 6500, 0, true,
      array[base || 'tech-aio-desktop-1.jpg'],
      false, false, 1024, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_pos', 'نقاط بيع، كاشير، POS',
      'كشك دفع ذاتي أساسي | متجر Tiqnora AI', 'اشتر كشك دفع ذاتي أساسي في السعودية مع دعم فني وضريبة موضحة. كشك مبسط للدفع الذاتي في المحلات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 1173.78,
        'estimated_profit', 2499,
        'margin_pct', 27.8,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('كشك دفع ذاتي أساسي','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Basic Self-Checkout Kiosk','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'pos',
          'sku', 'POS-SCO-01',
          'brand', 'epson',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','POS-SCO-01','brand','epson')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'hikvision' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-hik-dome-4mp') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-hik-dome-4mp', 'CCTV-HK-D4', c_cctv, bid,
      'كاميرا هايك فيجن قبة 4 ميجا', 'Hikvision 4MP Dome Camera',
      'كاميرا قبة داخلية/خارجية بدقة 4 ميجابكسل للمراقبة.', '4MP dome camera for indoor/outdoor surveillance.',
      429, 0, 260, 0, true,
      array[base || 'tech-ip-dome-1.jpg'],
      false, false, 2000, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'كاميرا هايك فيجن قبة 4 ميجا | متجر Tiqnora AI', 'اشتر كاميرا هايك فيجن قبة 4 ميجا في السعودية مع دعم فني وضريبة موضحة. كاميرا قبة داخلية/خارجية بدقة 4 ميجابكسل للمراقبة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 55.96,
        'estimated_profit', 169,
        'margin_pct', 39.4,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('كاميرا هايك فيجن قبة 4 ميجا','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Hikvision 4MP Dome Camera','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-HK-D4',
          'brand', 'hikvision',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-HK-D4','brand','hikvision')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'hikvision' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-hik-bullet-4mp') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-hik-bullet-4mp', 'CCTV-HK-B4', c_cctv, bid,
      'كاميرا هايك فيجن رصاصة 4 ميجا', 'Hikvision 4MP Bullet Camera',
      'كاميرا رصاصة بمدى رؤية أوضح للمحيط الخارجي.', '4MP bullet camera for perimeter monitoring.',
      459, 0, 280, 0, true,
      array[base || 'tech-ip-dome-1.jpg'],
      false, false, 2001, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'كاميرا هايك فيجن رصاصة 4 ميجا | متجر Tiqnora AI', 'اشتر كاميرا هايك فيجن رصاصة 4 ميجا في السعودية مع دعم فني وضريبة موضحة. كاميرا رصاصة بمدى رؤية أوضح للمحيط الخارجي.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 59.87,
        'estimated_profit', 179,
        'margin_pct', 39.0,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('كاميرا هايك فيجن رصاصة 4 ميجا','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Hikvision 4MP Bullet Camera','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-HK-B4',
          'brand', 'hikvision',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-HK-B4','brand','hikvision')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'hikvision' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-hik-ptz') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-hik-ptz', 'CCTV-HK-PTZ', c_cctv, bid,
      'كاميرا هايك فيجن متحركة PTZ', 'Hikvision PTZ Camera',
      'كاميرا متحركة للتحكم عن بعد وتغطية أوسع.', 'PTZ camera for remote pan/tilt coverage.',
      1899, 0, 1280, 0, true,
      array[base || 'tech-ip-dome-1.jpg'],
      false, false, 2002, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'كاميرا هايك فيجن متحركة PTZ | متجر Tiqnora AI', 'اشتر كاميرا هايك فيجن متحركة PTZ في السعودية مع دعم فني وضريبة موضحة. كاميرا متحركة للتحكم عن بعد وتغطية أوسع.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 247.7,
        'estimated_profit', 619,
        'margin_pct', 32.6,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('كاميرا هايك فيجن متحركة PTZ','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Hikvision PTZ Camera','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-HK-PTZ',
          'brand', 'hikvision',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-HK-PTZ','brand','hikvision')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'dahua' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-dahua-dome-4mp') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-dahua-dome-4mp', 'CCTV-DH-D4', c_cctv, bid,
      'كاميرا داهوا قبة 4 ميجا', 'Dahua 4MP Dome Camera',
      'كاميرا قبة داهوا للمكاتب والمحلات.', 'Dahua 4MP dome for offices and shops.',
      399, 0, 240, 0, true,
      array[base || 'tech-ip-dome-1.jpg'],
      false, false, 2003, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'كاميرا داهوا قبة 4 ميجا | متجر Tiqnora AI', 'اشتر كاميرا داهوا قبة 4 ميجا في السعودية مع دعم فني وضريبة موضحة. كاميرا قبة داهوا للمكاتب والمحلات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 52.04,
        'estimated_profit', 159,
        'margin_pct', 39.8,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('كاميرا داهوا قبة 4 ميجا','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Dahua 4MP Dome Camera','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-DH-D4',
          'brand', 'dahua',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-DH-D4','brand','dahua')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'dahua' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-dahua-bullet') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-dahua-bullet', 'CCTV-DH-B4', c_cctv, bid,
      'كاميرا داهوا رصاصة', 'Dahua Bullet Camera',
      'كاميرا رصاصة خارجية من داهوا.', 'Dahua outdoor bullet camera.',
      419, 0, 250, 0, true,
      array[base || 'tech-ip-dome-1.jpg'],
      false, false, 2004, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'كاميرا داهوا رصاصة | متجر Tiqnora AI', 'اشتر كاميرا داهوا رصاصة في السعودية مع دعم فني وضريبة موضحة. كاميرا رصاصة خارجية من داهوا.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 54.65,
        'estimated_profit', 169,
        'margin_pct', 40.3,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('كاميرا داهوا رصاصة','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Dahua Bullet Camera','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-DH-B4',
          'brand', 'dahua',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-DH-B4','brand','dahua')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-nvr-8ch') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-nvr-8ch', 'CCTV-NVR-8', c_cctv, bid,
      'جهاز NVR 8 قنوات', '8-Channel NVR',
      'مسجل شبكة 8 قنوات مع دعم أقراص صلبة.', '8-channel network video recorder.',
      899, 0, 560, 0, true,
      array[base || 'tech-nvr-kit-1.jpg'],
      false, false, 2005, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'جهاز NVR 8 قنوات | متجر Tiqnora AI', 'اشتر جهاز NVR 8 قنوات في السعودية مع دعم فني وضريبة موضحة. مسجل شبكة 8 قنوات مع دعم أقراص صلبة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 117.26,
        'estimated_profit', 339,
        'margin_pct', 37.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('جهاز NVR 8 قنوات','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('8-Channel NVR','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-NVR-8',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-NVR-8','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-nvr-16ch') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-nvr-16ch', 'CCTV-NVR-16', c_cctv, bid,
      'جهاز NVR 16 قناة', '16-Channel NVR',
      'مسجل 16 قناة للمشاريع المتوسطة.', '16-channel NVR for mid-size projects.',
      1499, 0, 980, 0, true,
      array[base || 'tech-nvr-kit-1.jpg'],
      false, false, 2006, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'جهاز NVR 16 قناة | متجر Tiqnora AI', 'اشتر جهاز NVR 16 قناة في السعودية مع دعم فني وضريبة موضحة. مسجل 16 قناة للمشاريع المتوسطة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 195.52,
        'estimated_profit', 519,
        'margin_pct', 34.6,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('جهاز NVR 16 قناة','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('16-Channel NVR','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-NVR-16',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-NVR-16','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-nvr-4ch-kit') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-nvr-4ch-kit', 'CCTV-KIT-4', c_cctv, bid,
      'باقة مراقبة 4 كاميرات + NVR', '4-Camera NVR Kit',
      'باقة كاملة للكاميرات والمسجل للمنازل والمحلات.', 'Complete 4-camera + NVR starter kit.',
      2199, 0, 1450, 0, true,
      array[base || 'tech-nvr-kit-1.jpg'],
      false, false, 2007, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'باقة مراقبة 4 كاميرات + NVR | متجر Tiqnora AI', 'اشتر باقة مراقبة 4 كاميرات + NVR في السعودية مع دعم فني وضريبة موضحة. باقة كاملة للكاميرات والمسجل للمنازل والمحلات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 286.83,
        'estimated_profit', 749,
        'margin_pct', 34.1,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('باقة مراقبة 4 كاميرات + NVR','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('4-Camera NVR Kit','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-KIT-4',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-KIT-4','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-dvr-8ch') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-dvr-8ch', 'CCTV-DVR-8', c_cctv, bid,
      'جهاز DVR 8 قنوات', '8-Channel DVR',
      'مسجل تناظري/هجين 8 قنوات.', '8-channel hybrid DVR recorder.',
      699, 0, 420, 0, true,
      array[base || 'tech-nvr-kit-1.jpg'],
      false, false, 2008, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'جهاز DVR 8 قنوات | متجر Tiqnora AI', 'اشتر جهاز DVR 8 قنوات في السعودية مع دعم فني وضريبة موضحة. مسجل تناظري/هجين 8 قنوات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 91.17,
        'estimated_profit', 279,
        'margin_pct', 39.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('جهاز DVR 8 قنوات','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('8-Channel DVR','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-DVR-8',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-DVR-8','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-access-control-kit') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-access-control-kit', 'CCTV-AC-01', c_cctv, bid,
      'باقة تحكم دخول أساسية', 'Basic Access Control Kit',
      'باقة قارئ + قفل إلكتروني + وحدة تحكم.', 'Reader + electric lock + controller kit.',
      1299, 0, 820, 0, true,
      array[base || 'tech-access-kit-1.jpg'],
      false, false, 2009, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'باقة تحكم دخول أساسية | متجر Tiqnora AI', 'اشتر باقة تحكم دخول أساسية في السعودية مع دعم فني وضريبة موضحة. باقة قارئ + قفل إلكتروني + وحدة تحكم.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 169.43,
        'estimated_profit', 479,
        'margin_pct', 36.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('باقة تحكم دخول أساسية','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Basic Access Control Kit','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-AC-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-AC-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-fingerprint') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-fingerprint', 'CCTV-FP-01', c_cctv, bid,
      'جهاز بصمة حضور وانصراف', 'Fingerprint Time Attendance',
      'جهاز بصمة لإدارة الحضور في المنشآت.', 'Fingerprint attendance device for workplaces.',
      549, 0, 320, 0, true,
      array[base || 'tech-access-kit-1.jpg'],
      false, false, 2010, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'جهاز بصمة حضور وانصراف | متجر Tiqnora AI', 'اشتر جهاز بصمة حضور وانصراف في السعودية مع دعم فني وضريبة موضحة. جهاز بصمة لإدارة الحضور في المنشآت.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 71.61,
        'estimated_profit', 229,
        'margin_pct', 41.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('جهاز بصمة حضور وانصراف','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Fingerprint Time Attendance','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-FP-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-FP-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-fingerprint-access') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-fingerprint-access', 'CCTV-FP-AC', c_cctv, bid,
      'بصمة مع تحكم بالباب', 'Fingerprint Door Access',
      'جهاز بصمة لفتح الأبواب مع سجل أحداث.', 'Fingerprint door access with event logs.',
      699, 0, 410, 0, true,
      array[base || 'tech-access-kit-1.jpg'],
      false, false, 2011, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'بصمة مع تحكم بالباب | متجر Tiqnora AI', 'اشتر بصمة مع تحكم بالباب في السعودية مع دعم فني وضريبة موضحة. جهاز بصمة لفتح الأبواب مع سجل أحداث.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 91.17,
        'estimated_profit', 289,
        'margin_pct', 41.3,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('بصمة مع تحكم بالباب','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Fingerprint Door Access','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-FP-AC',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-FP-AC','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-video-intercom') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-video-intercom', 'CCTV-VI-01', c_cctv, bid,
      'انتركم مرئي للشقق', 'Video Door Intercom',
      'انتركم بفيديو للمداخل والشقق.', 'Video door intercom for apartments.',
      899, 0, 540, 0, true,
      array[base || 'tech-conf-cam-1.jpg'],
      false, false, 2012, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'انتركم مرئي للشقق | متجر Tiqnora AI', 'اشتر انتركم مرئي للشقق في السعودية مع دعم فني وضريبة موضحة. انتركم بفيديو للمداخل والشقق.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 117.26,
        'estimated_profit', 359,
        'margin_pct', 39.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('انتركم مرئي للشقق','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Video Door Intercom','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-VI-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-VI-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-poe-switch-8') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-poe-switch-8', 'CCTV-POE-8', c_cctv, bid,
      'سويتش PoE 8 منافذ للكاميرات', '8-Port PoE Switch for Cameras',
      'سويتش يغذي كاميرات IP عبر الشبكة.', '8-port PoE switch to power IP cameras.',
      449, 0, 270, 0, true,
      array[base || 'tech-switch-8-1.jpg'],
      false, false, 2013, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'سويتش PoE 8 منافذ للكاميرات | متجر Tiqnora AI', 'اشتر سويتش PoE 8 منافذ للكاميرات في السعودية مع دعم فني وضريبة موضحة. سويتش يغذي كاميرات IP عبر الشبكة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 58.57,
        'estimated_profit', 179,
        'margin_pct', 39.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('سويتش PoE 8 منافذ للكاميرات','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('8-Port PoE Switch for Cameras','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-POE-8',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-POE-8','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-hdd-4tb') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-hdd-4tb', 'CCTV-HDD-4T', c_cctv, bid,
      'قرص صلب مراقبة 4 تيرا', '4TB Surveillance HDD',
      'قرص مخصص للتسجيل المستمر في NVR.', '4TB drive rated for continuous NVR recording.',
      549, 0, 360, 0, true,
      array[base || 'tech-nvr-kit-1.jpg'],
      false, false, 2014, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'قرص صلب مراقبة 4 تيرا | متجر Tiqnora AI', 'اشتر قرص صلب مراقبة 4 تيرا في السعودية مع دعم فني وضريبة موضحة. قرص مخصص للتسجيل المستمر في NVR.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 71.61,
        'estimated_profit', 189,
        'margin_pct', 34.4,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('قرص صلب مراقبة 4 تيرا','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('4TB Surveillance HDD','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-HDD-4T',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-HDD-4T','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'hikvision' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-hik-colorvu') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-hik-colorvu', 'CCTV-HK-CV', c_cctv, bid,
      'كاميرا ColorVu ليلية ملونة', 'Hikvision ColorVu Camera',
      'كاميرا برؤية ليلية ملونة أوضح.', 'Color night-vision style surveillance camera.',
      599, 0, 360, 0, true,
      array[base || 'tech-ip-dome-1.jpg'],
      false, false, 2015, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'كاميرا ColorVu ليلية ملونة | متجر Tiqnora AI', 'اشتر كاميرا ColorVu ليلية ملونة في السعودية مع دعم فني وضريبة موضحة. كاميرا برؤية ليلية ملونة أوضح.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 78.13,
        'estimated_profit', 239,
        'margin_pct', 39.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('كاميرا ColorVu ليلية ملونة','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Hikvision ColorVu Camera','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-HK-CV',
          'brand', 'hikvision',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-HK-CV','brand','hikvision')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-wireless-kit') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-wireless-kit', 'CCTV-WL-KIT', c_cctv, bid,
      'باقة كاميرات لاسلكية', 'Wireless Camera Kit',
      'باقة كاميرات لاسلكية للتركيب السريع.', 'Wireless camera kit for quick installs.',
      1599, 0, 1050, 0, true,
      array[base || 'tech-nvr-kit-1.jpg'],
      false, false, 2016, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'باقة كاميرات لاسلكية | متجر Tiqnora AI', 'اشتر باقة كاميرات لاسلكية في السعودية مع دعم فني وضريبة موضحة. باقة كاميرات لاسلكية للتركيب السريع.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 208.57,
        'estimated_profit', 549,
        'margin_pct', 34.3,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('باقة كاميرات لاسلكية','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Wireless Camera Kit','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-WL-KIT',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-WL-KIT','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-face-terminal') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-face-terminal', 'CCTV-FACE', c_cctv, bid,
      'جهاز تعرف على الوجه', 'Face Recognition Terminal',
      'جهاز دخول بالوجه للبوابات والمكاتب.', 'Face recognition access terminal.',
      1899, 0, 1250, 0, true,
      array[base || 'tech-access-kit-1.jpg'],
      false, false, 2017, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'جهاز تعرف على الوجه | متجر Tiqnora AI', 'اشتر جهاز تعرف على الوجه في السعودية مع دعم فني وضريبة موضحة. جهاز دخول بالوجه للبوابات والمكاتب.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 247.7,
        'estimated_profit', 649,
        'margin_pct', 34.2,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('جهاز تعرف على الوجه','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Face Recognition Terminal','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-FACE',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-FACE','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-siren-light') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-siren-light', 'CCTV-SIR', c_cctv, bid,
      'سيرين وضوء تحذيري', 'Alarm Siren & Strobe',
      'وحدة تنبيه صوتية وضوئية تربط بنظام الأمن.', 'Siren and strobe for security systems.',
      179, 0, 95, 0, true,
      array[base || 'tech-access-kit-1.jpg'],
      false, false, 2018, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'سيرين وضوء تحذيري | متجر Tiqnora AI', 'اشتر سيرين وضوء تحذيري في السعودية مع دعم فني وضريبة موضحة. وحدة تنبيه صوتية وضوئية تربط بنظام الأمن.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 23.35,
        'estimated_profit', 84,
        'margin_pct', 46.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('سيرين وضوء تحذيري','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Alarm Siren & Strobe','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-SIR',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-SIR','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-junction-box') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-junction-box', 'CCTV-JB', c_cctv, bid,
      'صندوق توصيل كاميرا', 'Camera Junction Box',
      'صندوق حماية لتوصيلات الكاميرا.', 'Weather junction box for camera cabling.',
      79, 0, 35, 0, true,
      array[base || 'tech-cat6-box-1.jpg'],
      false, false, 2019, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'صندوق توصيل كاميرا | متجر Tiqnora AI', 'اشتر صندوق توصيل كاميرا في السعودية مع دعم فني وضريبة موضحة. صندوق حماية لتوصيلات الكاميرا.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 10.3,
        'estimated_profit', 44,
        'margin_pct', 55.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('صندوق توصيل كاميرا','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Camera Junction Box','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-JB',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-JB','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-cable-cat6-305') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-cable-cat6-305', 'CCTV-C6-305', c_cctv, bid,
      'بكرة كابل شبكة Cat6 305م', 'Cat6 Cable Drum 305m',
      'بكرة كابل لتمديد كاميرات IP.', '305m Cat6 drum for IP camera runs.',
      499, 0, 320, 0, true,
      array[base || 'tech-cat6-box-1.jpg'],
      false, false, 2020, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'بكرة كابل شبكة Cat6 305م | متجر Tiqnora AI', 'اشتر بكرة كابل شبكة Cat6 305م في السعودية مع دعم فني وضريبة موضحة. بكرة كابل لتمديد كاميرات IP.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 65.09,
        'estimated_profit', 179,
        'margin_pct', 35.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('بكرة كابل شبكة Cat6 305م','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Cat6 Cable Drum 305m','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-C6-305',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-C6-305','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-monitor-22') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-monitor-22', 'CCTV-MON-22', c_cctv, bid,
      'شاشة مراقبة 22 إنش', '22" Surveillance Monitor',
      'شاشة لمتابعة البث المباشر في غرفة المراقبة.', '22" monitor for security control rooms.',
      699, 0, 430, 0, true,
      array[base || 'tech-aio-desktop-1.jpg'],
      false, false, 2021, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'شاشة مراقبة 22 إنش | متجر Tiqnora AI', 'اشتر شاشة مراقبة 22 إنش في السعودية مع دعم فني وضريبة موضحة. شاشة لمتابعة البث المباشر في غرفة المراقبة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 91.17,
        'estimated_profit', 269,
        'margin_pct', 38.5,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('شاشة مراقبة 22 إنش','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('22" Surveillance Monitor','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-MON-22',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-MON-22','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-nvr-32ch') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-nvr-32ch', 'CCTV-NVR-32', c_cctv, bid,
      'جهاز NVR 32 قناة', '32-Channel NVR',
      'مسجل للمشاريع الكبيرة والمجمعات.', '32-channel NVR for larger sites.',
      2899, 0, 1950, 0, true,
      array[base || 'tech-nvr-kit-1.jpg'],
      false, false, 2022, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'جهاز NVR 32 قناة | متجر Tiqnora AI', 'اشتر جهاز NVR 32 قناة في السعودية مع دعم فني وضريبة موضحة. مسجل للمشاريع الكبيرة والمجمعات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 378.13,
        'estimated_profit', 949,
        'margin_pct', 32.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('جهاز NVR 32 قناة','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('32-Channel NVR','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-NVR-32',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-NVR-32','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'hikvision' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-hik-turret') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-hik-turret', 'CCTV-HK-TR', c_cctv, bid,
      'كاميرا هايك فيجن برج', 'Hikvision Turret Camera',
      'كاميرا برج بزاوية مرنة للتركيب.', 'Turret camera with flexible mounting angle.',
      449, 0, 270, 0, true,
      array[base || 'tech-ip-dome-1.jpg'],
      false, false, 2023, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'كاميرا هايك فيجن برج | متجر Tiqnora AI', 'اشتر كاميرا هايك فيجن برج في السعودية مع دعم فني وضريبة موضحة. كاميرا برج بزاوية مرنة للتركيب.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 58.57,
        'estimated_profit', 179,
        'margin_pct', 39.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('كاميرا هايك فيجن برج','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Hikvision Turret Camera','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-HK-TR',
          'brand', 'hikvision',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-HK-TR','brand','hikvision')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'dahua' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'cctv-dahua-ptz-mini') and c_cctv is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'cctv-dahua-ptz-mini', 'CCTV-DH-PTZ', c_cctv, bid,
      'كاميرا داهوا PTZ ميني', 'Dahua Mini PTZ',
      'كاميرا متحركة مدمجة للتغطية الموضعية.', 'Compact PTZ for targeted coverage.',
      999, 0, 640, 0, true,
      array[base || 'tech-ip-dome-1.jpg'],
      false, false, 2024, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_cctv', 'كاميرات، مراقبة، NVR، أمن',
      'كاميرا داهوا PTZ ميني | متجر Tiqnora AI', 'اشتر كاميرا داهوا PTZ ميني في السعودية مع دعم فني وضريبة موضحة. كاميرا متحركة مدمجة للتغطية الموضعية.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 130.3,
        'estimated_profit', 359,
        'margin_pct', 35.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('كاميرا داهوا PTZ ميني','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Dahua Mini PTZ','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'cctv',
          'sku', 'CCTV-DH-PTZ',
          'brand', 'dahua',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','CCTV-DH-PTZ','brand','dahua')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'tp-link' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-tplink-router-ax3000') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-tplink-router-ax3000', 'NET-TP-AX3', c_net, bid,
      'راوتر TP-Link AX3000', 'TP-Link AX3000 WiFi 6 Router',
      'راوتر واي فاي 6 للمكاتب والمنازل.', 'WiFi 6 AX3000 router for offices and homes.',
      449, 0, 280, 0, true,
      array[base || 'tech-wifi6-router-1.jpg'],
      false, false, 3000, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'راوتر TP-Link AX3000 | متجر Tiqnora AI', 'اشتر راوتر TP-Link AX3000 في السعودية مع دعم فني وضريبة موضحة. راوتر واي فاي 6 للمكاتب والمنازل.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 58.57,
        'estimated_profit', 169,
        'margin_pct', 37.6,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('راوتر TP-Link AX3000','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('TP-Link AX3000 WiFi 6 Router','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-TP-AX3',
          'brand', 'tp-link',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-TP-AX3','brand','tp-link')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'tp-link' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-tplink-switch-24') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-tplink-switch-24', 'NET-TP-SW24', c_net, bid,
      'سويتش TP-Link 24 منفذ', 'TP-Link 24-Port Switch',
      'سويتش سلكي 24 منفذ لتوزيع الشبكة.', '24-port unmanaged/managed switch option.',
      599, 0, 360, 0, true,
      array[base || 'tech-switch-8-1.jpg'],
      false, false, 3001, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'سويتش TP-Link 24 منفذ | متجر Tiqnora AI', 'اشتر سويتش TP-Link 24 منفذ في السعودية مع دعم فني وضريبة موضحة. سويتش سلكي 24 منفذ لتوزيع الشبكة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 78.13,
        'estimated_profit', 239,
        'margin_pct', 39.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('سويتش TP-Link 24 منفذ','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('TP-Link 24-Port Switch','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-TP-SW24',
          'brand', 'tp-link',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-TP-SW24','brand','tp-link')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'tp-link' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-tplink-ap-omada') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-tplink-ap-omada', 'NET-TP-AP', c_net, bid,
      'نقطة وصول TP-Link Omada', 'TP-Link Omada Access Point',
      'نقطة وصول سقفيّة للتغطية المؤسسية.', 'Ceiling AP for business WiFi coverage.',
      499, 0, 310, 0, true,
      array[base || 'tech-wifi6-router-1.jpg'],
      false, false, 3002, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'نقطة وصول TP-Link Omada | متجر Tiqnora AI', 'اشتر نقطة وصول TP-Link Omada في السعودية مع دعم فني وضريبة موضحة. نقطة وصول سقفيّة للتغطية المؤسسية.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 65.09,
        'estimated_profit', 189,
        'margin_pct', 37.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('نقطة وصول TP-Link Omada','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('TP-Link Omada Access Point','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-TP-AP',
          'brand', 'tp-link',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-TP-AP','brand','tp-link')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'ubiquiti' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-ubiquiti-ap-u6') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-ubiquiti-ap-u6', 'NET-UB-U6', c_net, bid,
      'نقطة وصول Ubiquiti U6', 'Ubiquiti UniFi U6 Access Point',
      'نقطة وصول UniFi لأداء عالي في المكاتب.', 'UniFi U6 AP for high-performance offices.',
      799, 0, 520, 0, true,
      array[base || 'tech-wifi6-router-1.jpg'],
      false, false, 3003, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'نقطة وصول Ubiquiti U6 | متجر Tiqnora AI', 'اشتر نقطة وصول Ubiquiti U6 في السعودية مع دعم فني وضريبة موضحة. نقطة وصول UniFi لأداء عالي في المكاتب.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 104.22,
        'estimated_profit', 279,
        'margin_pct', 34.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('نقطة وصول Ubiquiti U6','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Ubiquiti UniFi U6 Access Point','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-UB-U6',
          'brand', 'ubiquiti',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-UB-U6','brand','ubiquiti')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'ubiquiti' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-ubiquiti-switch-8') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-ubiquiti-switch-8', 'NET-UB-SW8', c_net, bid,
      'سويتش UniFi 8 منافذ', 'UniFi 8-Port Switch',
      'سويتش UniFi صغير للفروع.', 'Compact UniFi 8-port switch.',
      699, 0, 450, 0, true,
      array[base || 'tech-switch-8-1.jpg'],
      false, false, 3004, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'سويتش UniFi 8 منافذ | متجر Tiqnora AI', 'اشتر سويتش UniFi 8 منافذ في السعودية مع دعم فني وضريبة موضحة. سويتش UniFi صغير للفروع.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 91.17,
        'estimated_profit', 249,
        'margin_pct', 35.6,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('سويتش UniFi 8 منافذ','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('UniFi 8-Port Switch','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-UB-SW8',
          'brand', 'ubiquiti',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-UB-SW8','brand','ubiquiti')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-switch-poe-24') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-switch-poe-24', 'NET-POE-24', c_net, bid,
      'سويتش PoE 24 منفذ', '24-Port PoE Switch',
      'سويتش PoE لنقاط الوصول والكاميرات.', '24-port PoE switch for APs and cameras.',
      1299, 0, 860, 0, true,
      array[base || 'tech-switch-8-1.jpg'],
      false, false, 3005, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'سويتش PoE 24 منفذ | متجر Tiqnora AI', 'اشتر سويتش PoE 24 منفذ في السعودية مع دعم فني وضريبة موضحة. سويتش PoE لنقاط الوصول والكاميرات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 169.43,
        'estimated_profit', 439,
        'margin_pct', 33.8,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('سويتش PoE 24 منفذ','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('24-Port PoE Switch','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-POE-24',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-POE-24','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-router-business') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-router-business', 'NET-RTR-BIZ', c_net, bid,
      'راوتر أعمال متعدد WAN', 'Business Multi-WAN Router',
      'راوتر بمسارات متعددة لاستقرار الإنترنت.', 'Multi-WAN business router for uptime.',
      899, 0, 560, 0, true,
      array[base || 'tech-wifi6-router-1.jpg'],
      false, false, 3006, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'راوتر أعمال متعدد WAN | متجر Tiqnora AI', 'اشتر راوتر أعمال متعدد WAN في السعودية مع دعم فني وضريبة موضحة. راوتر بمسارات متعددة لاستقرار الإنترنت.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 117.26,
        'estimated_profit', 339,
        'margin_pct', 37.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('راوتر أعمال متعدد WAN','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Business Multi-WAN Router','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-RTR-BIZ',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-RTR-BIZ','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'mikrotik' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-mikrotik-hex') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-mikrotik-hex', 'NET-MK-HEX', c_net, bid,
      'راوتر MikroTik hEX', 'MikroTik hEX Router',
      'راوتر MikroTik مرن لإعدادات متقدمة.', 'Flexible MikroTik hEX for advanced routing.',
      349, 0, 210, 0, true,
      array[base || 'tech-wifi6-router-1.jpg'],
      false, false, 3007, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'راوتر MikroTik hEX | متجر Tiqnora AI', 'اشتر راوتر MikroTik hEX في السعودية مع دعم فني وضريبة موضحة. راوتر MikroTik مرن لإعدادات متقدمة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 45.52,
        'estimated_profit', 139,
        'margin_pct', 39.8,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('راوتر MikroTik hEX','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('MikroTik hEX Router','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-MK-HEX',
          'brand', 'mikrotik',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-MK-HEX','brand','mikrotik')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-ap-outdoor') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-ap-outdoor', 'NET-AP-OUT', c_net, bid,
      'نقطة وصول خارجية', 'Outdoor Access Point',
      'تغطية خارجية للفناء والمواقف.', 'Outdoor AP for yards and parking areas.',
      699, 0, 430, 0, true,
      array[base || 'tech-wifi6-router-1.jpg'],
      false, false, 3008, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'نقطة وصول خارجية | متجر Tiqnora AI', 'اشتر نقطة وصول خارجية في السعودية مع دعم فني وضريبة موضحة. تغطية خارجية للفناء والمواقف.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 91.17,
        'estimated_profit', 269,
        'margin_pct', 38.5,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('نقطة وصول خارجية','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Outdoor Access Point','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-AP-OUT',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-AP-OUT','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-rack-12u') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-rack-12u', 'NET-RACK-12', c_net, bid,
      'خزانة سيرفر 12U', '12U Network Rack',
      'خزانة معدنية لترتيب السويتشات والأجهزة.', '12U rack cabinet for network gear.',
      899, 0, 560, 0, true,
      array[base || 'tech-desk-dock-1.jpg'],
      false, false, 3009, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'خزانة سيرفر 12U | متجر Tiqnora AI', 'اشتر خزانة سيرفر 12U في السعودية مع دعم فني وضريبة موضحة. خزانة معدنية لترتيب السويتشات والأجهزة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 117.26,
        'estimated_profit', 339,
        'margin_pct', 37.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('خزانة سيرفر 12U','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('12U Network Rack','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-RACK-12',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-RACK-12','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-patch-panel-24') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-patch-panel-24', 'NET-PP-24', c_net, bid,
      'لوحة توزيع 24 منفذ', '24-Port Patch Panel',
      'لوحة تنظيم كابلات الشبكة في الراك.', '24-port patch panel for rack cabling.',
      199, 0, 110, 0, true,
      array[base || 'tech-cat6-box-1.jpg'],
      false, false, 3010, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'لوحة توزيع 24 منفذ | متجر Tiqnora AI', 'اشتر لوحة توزيع 24 منفذ في السعودية مع دعم فني وضريبة موضحة. لوحة تنظيم كابلات الشبكة في الراك.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 25.96,
        'estimated_profit', 89,
        'margin_pct', 44.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('لوحة توزيع 24 منفذ','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('24-Port Patch Panel','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-PP-24',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-PP-24','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-cat6-box') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-cat6-box', 'NET-C6-BOX', c_net, bid,
      'علبة كابل Cat6 305م', 'Cat6 Cable Box 305m',
      'علبة كابل نحاس للتمديدات الهيكلية.', 'Cat6 305m box for structured cabling.',
      429, 0, 280, 0, true,
      array[base || 'tech-cat6-box-1.jpg'],
      false, false, 3011, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'علبة كابل Cat6 305م | متجر Tiqnora AI', 'اشتر علبة كابل Cat6 305م في السعودية مع دعم فني وضريبة موضحة. علبة كابل نحاس للتمديدات الهيكلية.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 55.96,
        'estimated_profit', 149,
        'margin_pct', 34.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('علبة كابل Cat6 305م','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Cat6 Cable Box 305m','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-C6-BOX',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-C6-BOX','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-fiber-media') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-fiber-media', 'NET-FB-MC', c_net, bid,
      'محول وسائط ألياف', 'Fiber Media Converter',
      'تحويل بين الألياف والنحاس.', 'Fiber-to-copper media converter.',
      249, 0, 140, 0, true,
      array[base || 'tech-cat6-box-1.jpg'],
      false, false, 3012, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'محول وسائط ألياف | متجر Tiqnora AI', 'اشتر محول وسائط ألياف في السعودية مع دعم فني وضريبة موضحة. تحويل بين الألياف والنحاس.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 32.48,
        'estimated_profit', 109,
        'margin_pct', 43.8,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('محول وسائط ألياف','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Fiber Media Converter','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-FB-MC',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-FB-MC','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-sfp-module') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-sfp-module', 'NET-SFP-1G', c_net, bid,
      'وحدة SFP 1 جيجا', '1G SFP Transceiver Module',
      'وحدة ألياف لمنفذ SFP في السويتش.', '1G SFP module for switch fiber ports.',
      179, 0, 95, 0, true,
      array[base || 'tech-cat6-box-1.jpg'],
      false, false, 3013, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'وحدة SFP 1 جيجا | متجر Tiqnora AI', 'اشتر وحدة SFP 1 جيجا في السعودية مع دعم فني وضريبة موضحة. وحدة ألياف لمنفذ SFP في السويتش.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 23.35,
        'estimated_profit', 84,
        'margin_pct', 46.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('وحدة SFP 1 جيجا','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('1G SFP Transceiver Module','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-SFP-1G',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-SFP-1G','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-router-4g-backup') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-router-4g-backup', 'NET-4G-BK', c_net, bid,
      'راوتر احتياطي 4G/5G', '4G/5G Backup Router',
      'احتياطي إنترنت عبر الشريحة عند انقطاع الخط.', 'Cellular backup router for failover.',
      699, 0, 430, 0, true,
      array[base || 'tech-wifi6-router-1.jpg'],
      false, false, 3014, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'راوتر احتياطي 4G/5G | متجر Tiqnora AI', 'اشتر راوتر احتياطي 4G/5G في السعودية مع دعم فني وضريبة موضحة. احتياطي إنترنت عبر الشريحة عند انقطاع الخط.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 91.17,
        'estimated_profit', 269,
        'margin_pct', 38.5,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('راوتر احتياطي 4G/5G','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('4G/5G Backup Router','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-4G-BK',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-4G-BK','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-mesh-wifi') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-mesh-wifi', 'NET-MESH-3', c_net, bid,
      'نظام Mesh منزلي/مكتبي', 'Mesh WiFi System (3-pack)',
      'تغطية متجانسة عبر وحدات Mesh.', '3-pack mesh system for even coverage.',
      899, 0, 560, 0, true,
      array[base || 'tech-wifi6-router-1.jpg'],
      false, false, 3015, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'نظام Mesh منزلي/مكتبي | متجر Tiqnora AI', 'اشتر نظام Mesh منزلي/مكتبي في السعودية مع دعم فني وضريبة موضحة. تغطية متجانسة عبر وحدات Mesh.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 117.26,
        'estimated_profit', 339,
        'margin_pct', 37.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('نظام Mesh منزلي/مكتبي','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Mesh WiFi System (3-pack)','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-MESH-3',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-MESH-3','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-switch-8-giga') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-switch-8-giga', 'NET-SW8-G', c_net, bid,
      'سويتش 8 منافذ جيجابت', '8-Port Gigabit Switch',
      'سويتش صغير للمكاتب المنزلية.', 'Compact 8-port gigabit switch.',
      149, 0, 80, 0, true,
      array[base || 'tech-switch-8-1.jpg'],
      false, false, 3016, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'سويتش 8 منافذ جيجابت | متجر Tiqnora AI', 'اشتر سويتش 8 منافذ جيجابت في السعودية مع دعم فني وضريبة موضحة. سويتش صغير للمكاتب المنزلية.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 19.43,
        'estimated_profit', 69,
        'margin_pct', 46.3,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('سويتش 8 منافذ جيجابت','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('8-Port Gigabit Switch','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-SW8-G',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-SW8-G','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-firewall-smb') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-firewall-smb', 'NET-FW-SMB', c_net, bid,
      'جدار ناري للشركات الصغيرة', 'SMB Firewall Appliance',
      'حماية محيطية للشبكات الصغيرة.', 'Entry firewall appliance for SMBs.',
      1899, 0, 1250, 0, true,
      array[base || 'tech-mini-pc-1.jpg'],
      false, false, 3017, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'جدار ناري للشركات الصغيرة | متجر Tiqnora AI', 'اشتر جدار ناري للشركات الصغيرة في السعودية مع دعم فني وضريبة موضحة. حماية محيطية للشبكات الصغيرة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 247.7,
        'estimated_profit', 649,
        'margin_pct', 34.2,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('جدار ناري للشركات الصغيرة','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('SMB Firewall Appliance','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-FW-SMB',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-FW-SMB','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-cable-mgmt') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-cable-mgmt', 'NET-CM-01', c_net, bid,
      'منظم كابلات للراك', 'Rack Cable Management',
      'لوحة تنظيم الكابلات داخل الخزانة.', 'Rack cable management bar/panel.',
      129, 0, 65, 0, true,
      array[base || 'tech-desk-dock-1.jpg'],
      false, false, 3018, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'منظم كابلات للراك | متجر Tiqnora AI', 'اشتر منظم كابلات للراك في السعودية مع دعم فني وضريبة موضحة. لوحة تنظيم الكابلات داخل الخزانة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 16.83,
        'estimated_profit', 64,
        'margin_pct', 49.6,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('منظم كابلات للراك','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Rack Cable Management','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-CM-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-CM-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-ups-1kva') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-ups-1kva', 'NET-UPS-1K', c_net, bid,
      'UPS 1 كيلو فولت أمبير', '1kVA UPS Backup',
      'حماية انقطاع الكهرباء للأجهزة الشبكية.', '1kVA UPS for network equipment.',
      699, 0, 430, 0, true,
      array[base || 'tech-desk-dock-1.jpg'],
      false, false, 3019, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'UPS 1 كيلو فولت أمبير | متجر Tiqnora AI', 'اشتر UPS 1 كيلو فولت أمبير في السعودية مع دعم فني وضريبة موضحة. حماية انقطاع الكهرباء للأجهزة الشبكية.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 91.17,
        'estimated_profit', 269,
        'margin_pct', 38.5,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('UPS 1 كيلو فولت أمبير','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('1kVA UPS Backup','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-UPS-1K',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-UPS-1K','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-ap-controller') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-ap-controller', 'NET-AP-CTL', c_net, bid,
      'متحكم نقاط وصول', 'Wireless Access Controller',
      'إدارة مركزية لنقاط الوصول.', 'Central controller for access points.',
      1499, 0, 980, 0, true,
      array[base || 'tech-mini-pc-1.jpg'],
      false, false, 3020, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'متحكم نقاط وصول | متجر Tiqnora AI', 'اشتر متحكم نقاط وصول في السعودية مع دعم فني وضريبة موضحة. إدارة مركزية لنقاط الوصول.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 195.52,
        'estimated_profit', 519,
        'margin_pct', 34.6,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('متحكم نقاط وصول','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Wireless Access Controller','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-AP-CTL',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-AP-CTL','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'tp-link' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-tplink-deco') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-tplink-deco', 'NET-TP-DECO', c_net, bid,
      'TP-Link Deco Mesh', 'TP-Link Deco Mesh Pack',
      'باقة Mesh سهلة الإعداد.', 'Easy-setup TP-Link Deco mesh pack.',
      799, 0, 500, 0, true,
      array[base || 'tech-wifi6-router-1.jpg'],
      false, false, 3021, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'TP-Link Deco Mesh | متجر Tiqnora AI', 'اشتر TP-Link Deco Mesh في السعودية مع دعم فني وضريبة موضحة. باقة Mesh سهلة الإعداد.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 104.22,
        'estimated_profit', 299,
        'margin_pct', 37.4,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('TP-Link Deco Mesh','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('TP-Link Deco Mesh Pack','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-TP-DECO',
          'brand', 'tp-link',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-TP-DECO','brand','tp-link')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'cisco' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-cisco-sg') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-cisco-sg', 'NET-CS-SG', c_net, bid,
      'سويتش سيسكو للأعمال الصغيرة', 'Cisco Small Business Switch',
      'سويتش موثوق للفروع الصغيرة.', 'Cisco small-business class switch.',
      1299, 0, 860, 0, true,
      array[base || 'tech-switch-8-1.jpg'],
      false, false, 3022, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'سويتش سيسكو للأعمال الصغيرة | متجر Tiqnora AI', 'اشتر سويتش سيسكو للأعمال الصغيرة في السعودية مع دعم فني وضريبة موضحة. سويتش موثوق للفروع الصغيرة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 169.43,
        'estimated_profit', 439,
        'margin_pct', 33.8,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('سويتش سيسكو للأعمال الصغيرة','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Cisco Small Business Switch','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-CS-SG',
          'brand', 'cisco',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-CS-SG','brand','cisco')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-fiber-patch') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-fiber-patch', 'NET-FB-PC', c_net, bid,
      'كيبل ألياف جاهز', 'Fiber Patch Cord',
      'كيبل ألياف للربط بين الأجهزة.', 'Pre-terminated fiber patch cord.',
      89, 0, 40, 0, true,
      array[base || 'tech-cat6-box-1.jpg'],
      false, false, 3023, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'كيبل ألياف جاهز | متجر Tiqnora AI', 'اشتر كيبل ألياف جاهز في السعودية مع دعم فني وضريبة موضحة. كيبل ألياف للربط بين الأجهزة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 11.61,
        'estimated_profit', 49,
        'margin_pct', 55.1,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('كيبل ألياف جاهز','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Fiber Patch Cord','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-FB-PC',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-FB-PC','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'net-rack-shelf') and c_net is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'net-rack-shelf', 'NET-RACK-SH', c_net, bid,
      'رف راك ثابت', 'Fixed Rack Shelf',
      'رف لوضع الراوترات والأجهزة غير المثبتة.', 'Fixed shelf for non-rackmount devices.',
      149, 0, 75, 0, true,
      array[base || 'tech-desk-dock-1.jpg'],
      false, false, 3024, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_it', 'شبكات، راوتر، سويتش، واي فاي',
      'رف راك ثابت | متجر Tiqnora AI', 'اشتر رف راك ثابت في السعودية مع دعم فني وضريبة موضحة. رف لوضع الراوترات والأجهزة غير المثبتة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 19.43,
        'estimated_profit', 74,
        'margin_pct', 49.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('رف راك ثابت','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Fixed Rack Shelf','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'net',
          'sku', 'NET-RACK-SH',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','NET-RACK-SH','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'grandstream' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-gs-phone-grp') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-gs-phone-grp', 'HTL-GS-GRP', c_hotel, bid,
      'هاتف IP Grandstream', 'Grandstream IP Phone',
      'هاتف مكتبي IP للمكاتب والاستقبال.', 'Desk IP phone for offices and reception.',
      349, 0, 200, 0, true,
      array[base || 'tech-conf-cam-1.jpg'],
      false, false, 4000, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'هاتف IP Grandstream | متجر Tiqnora AI', 'اشتر هاتف IP Grandstream في السعودية مع دعم فني وضريبة موضحة. هاتف مكتبي IP للمكاتب والاستقبال.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 45.52,
        'estimated_profit', 149,
        'margin_pct', 42.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('هاتف IP Grandstream','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Grandstream IP Phone','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-GS-GRP',
          'brand', 'grandstream',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-GS-GRP','brand','grandstream')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'grandstream' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-gs-phone-wifi') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-gs-phone-wifi', 'HTL-GS-WIFI', c_hotel, bid,
      'هاتف IP لاسلكي Grandstream', 'Grandstream WiFi IP Phone',
      'هاتف لاسلكي للتنقل داخل المنشأة.', 'WiFi IP handset for on-site mobility.',
      499, 0, 300, 0, true,
      array[base || 'tech-conf-cam-1.jpg'],
      false, false, 4001, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'هاتف IP لاسلكي Grandstream | متجر Tiqnora AI', 'اشتر هاتف IP لاسلكي Grandstream في السعودية مع دعم فني وضريبة موضحة. هاتف لاسلكي للتنقل داخل المنشأة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 65.09,
        'estimated_profit', 199,
        'margin_pct', 39.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('هاتف IP لاسلكي Grandstream','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Grandstream WiFi IP Phone','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-GS-WIFI',
          'brand', 'grandstream',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-GS-WIFI','brand','grandstream')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-pbx-ippbx') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-pbx-ippbx', 'HTL-PBX-01', c_hotel, bid,
      'سنترال IP صغير', 'Small IP PBX System',
      'سنترال IP للفروع والفنادق الصغيرة.', 'Compact IP PBX for branches and small hotels.',
      2499, 0, 1650, 0, true,
      array[base || 'tech-mini-pc-1.jpg'],
      false, false, 4002, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'سنترال IP صغير | متجر Tiqnora AI', 'اشتر سنترال IP صغير في السعودية مع دعم فني وضريبة موضحة. سنترال IP للفروع والفنادق الصغيرة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 325.96,
        'estimated_profit', 849,
        'margin_pct', 34.0,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('سنترال IP صغير','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Small IP PBX System','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-PBX-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-PBX-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-wifi-controller') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-wifi-controller', 'HTL-WIFI-CTL', c_hotel, bid,
      'متحكم واي فاي فندقي', 'Hotel WiFi Controller',
      'إدارة ضيوف الواي فاي وصلاحيات الدخول.', 'Guest WiFi controller for hospitality.',
      1899, 0, 1250, 0, true,
      array[base || 'tech-wifi6-router-1.jpg'],
      false, false, 4003, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'متحكم واي فاي فندقي | متجر Tiqnora AI', 'اشتر متحكم واي فاي فندقي في السعودية مع دعم فني وضريبة موضحة. إدارة ضيوف الواي فاي وصلاحيات الدخول.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 247.7,
        'estimated_profit', 649,
        'margin_pct', 34.2,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('متحكم واي فاي فندقي','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Hotel WiFi Controller','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-WIFI-CTL',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-WIFI-CTL','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-ap-hotel') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-ap-hotel', 'HTL-AP-01', c_hotel, bid,
      'نقطة وصول غرف فندقية', 'Hotel Room Access Point',
      'نقطة وصول مناسبة لتغطية الغرف والممرات.', 'AP suited for rooms and corridors.',
      549, 0, 340, 0, true,
      array[base || 'tech-wifi6-router-1.jpg'],
      false, false, 4004, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'نقطة وصول غرف فندقية | متجر Tiqnora AI', 'اشتر نقطة وصول غرف فندقية في السعودية مع دعم فني وضريبة موضحة. نقطة وصول مناسبة لتغطية الغرف والممرات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 71.61,
        'estimated_profit', 209,
        'margin_pct', 38.1,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('نقطة وصول غرف فندقية','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Hotel Room Access Point','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-AP-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-AP-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-iptv-encoder') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-iptv-encoder', 'HTL-IPTV-ENC', c_hotel, bid,
      'جهاز بث IPTV أساسي', 'Basic IPTV Encoder',
      'وحدة لبث قنوات/محتوى عبر شبكة الفندق.', 'Basic encoder for hotel IPTV distribution.',
      3299, 0, 2200, 0, true,
      array[base || 'tech-mini-pc-1.jpg'],
      false, false, 4005, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'جهاز بث IPTV أساسي | متجر Tiqnora AI', 'اشتر جهاز بث IPTV أساسي في السعودية مع دعم فني وضريبة موضحة. وحدة لبث قنوات/محتوى عبر شبكة الفندق.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 430.3,
        'estimated_profit', 1099,
        'margin_pct', 33.3,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('جهاز بث IPTV أساسي','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Basic IPTV Encoder','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-IPTV-ENC',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-IPTV-ENC','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-smart-lock') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-smart-lock', 'HTL-LOCK-01', c_hotel, bid,
      'قفل باب فندقي إلكتروني', 'Electronic Hotel Door Lock',
      'قفل إلكتروني لبطاقات الغرف.', 'Electronic lock for hotel key cards.',
      799, 0, 480, 0, true,
      array[base || 'tech-access-kit-1.jpg'],
      false, false, 4006, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'قفل باب فندقي إلكتروني | متجر Tiqnora AI', 'اشتر قفل باب فندقي إلكتروني في السعودية مع دعم فني وضريبة موضحة. قفل إلكتروني لبطاقات الغرف.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 104.22,
        'estimated_profit', 319,
        'margin_pct', 39.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('قفل باب فندقي إلكتروني','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Electronic Hotel Door Lock','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-LOCK-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-LOCK-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-door-encoder') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-door-encoder', 'HTL-KEY-ENC', c_hotel, bid,
      'جهاز ترميز بطاقات الغرف', 'Hotel Key Card Encoder',
      'ترميز بطاقات الدخول للغرف.', 'Encoder for guest door key cards.',
      1499, 0, 980, 0, true,
      array[base || 'tech-access-kit-1.jpg'],
      false, false, 4007, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'جهاز ترميز بطاقات الغرف | متجر Tiqnora AI', 'اشتر جهاز ترميز بطاقات الغرف في السعودية مع دعم فني وضريبة موضحة. ترميز بطاقات الدخول للغرف.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 195.52,
        'estimated_profit', 519,
        'margin_pct', 34.6,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('جهاز ترميز بطاقات الغرف','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Hotel Key Card Encoder','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-KEY-ENC',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-KEY-ENC','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-server-tower') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-server-tower', 'HTL-SRV-T', c_hotel, bid,
      'سيرفر برجي للأعمال', 'Business Tower Server',
      'سيرفر للمكاتب والفنادق الصغيرة.', 'Tower server for SMB and small hotels.',
      5999, 0, 4200, 0, true,
      array[base || 'tech-mini-pc-1.jpg'],
      false, false, 4008, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'سيرفر برجي للأعمال | متجر Tiqnora AI', 'اشتر سيرفر برجي للأعمال في السعودية مع دعم فني وضريبة موضحة. سيرفر للمكاتب والفنادق الصغيرة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 782.48,
        'estimated_profit', 1799,
        'margin_pct', 30.0,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('سيرفر برجي للأعمال','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Business Tower Server','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-SRV-T',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-SRV-T','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-server-rack') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-server-rack', 'HTL-SRV-R', c_hotel, bid,
      'سيرفر راك 1U', '1U Rack Server',
      'سيرفر مركب في خزانة للمشاريع.', '1U rack server for project installs.',
      8999, 0, 6500, 0, true,
      array[base || 'tech-mini-pc-1.jpg'],
      false, false, 4009, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'سيرفر راك 1U | متجر Tiqnora AI', 'اشتر سيرفر راك 1U في السعودية مع دعم فني وضريبة موضحة. سيرفر مركب في خزانة للمشاريع.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 1173.78,
        'estimated_profit', 2499,
        'margin_pct', 27.8,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('سيرفر راك 1U','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('1U Rack Server','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-SRV-R',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-SRV-R','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'hp' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-laser-printer') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-laser-printer', 'HTL-PRN-LS', c_hotel, bid,
      'طابعة ليزر مكتبية', 'Office Laser Printer',
      'طابعة ليزر للمستندات والاستقبال.', 'Mono/color laser printer for front desk.',
      899, 0, 560, 0, true,
      array[base || 'tech-laser-printer-1.jpg'],
      false, false, 4010, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'طابعة ليزر مكتبية | متجر Tiqnora AI', 'اشتر طابعة ليزر مكتبية في السعودية مع دعم فني وضريبة موضحة. طابعة ليزر للمستندات والاستقبال.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 117.26,
        'estimated_profit', 339,
        'margin_pct', 37.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('طابعة ليزر مكتبية','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Office Laser Printer','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-PRN-LS',
          'brand', 'hp',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-PRN-LS','brand','hp')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'hp' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-mfp-printer') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-mfp-printer', 'HTL-PRN-MFP', c_hotel, bid,
      'طابعة متعددة الوظائف', 'Multifunction Office Printer',
      'طباعة ونسخ ومسح للمستندات.', 'Print/copy/scan multifunction printer.',
      1499, 0, 980, 0, true,
      array[base || 'tech-laser-printer-1.jpg'],
      false, false, 4011, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'طابعة متعددة الوظائف | متجر Tiqnora AI', 'اشتر طابعة متعددة الوظائف في السعودية مع دعم فني وضريبة موضحة. طباعة ونسخ ومسح للمستندات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 195.52,
        'estimated_profit', 519,
        'margin_pct', 34.6,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('طابعة متعددة الوظائف','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Multifunction Office Printer','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-PRN-MFP',
          'brand', 'hp',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-PRN-MFP','brand','hp')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'lenovo' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-laptop-biz-14') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-laptop-biz-14', 'HTL-LAP-14', c_hotel, bid,
      'لابتوب أعمال 14 إنش', '14" Business Laptop',
      'لابتوب خفيف للمهام الإدارية.', 'Lightweight 14" business laptop.',
      2799, 0, 2100, 0, true,
      array[base || 'tech-laptop-biz-1.jpg'],
      false, false, 4012, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'لابتوب أعمال 14 إنش | متجر Tiqnora AI', 'اشتر لابتوب أعمال 14 إنش في السعودية مع دعم فني وضريبة موضحة. لابتوب خفيف للمهام الإدارية.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 365.09,
        'estimated_profit', 699,
        'margin_pct', 25.0,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('لابتوب أعمال 14 إنش','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('14" Business Laptop','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-LAP-14',
          'brand', 'lenovo',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-LAP-14','brand','lenovo')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'lenovo' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-laptop-biz-15') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-laptop-biz-15', 'HTL-LAP-15', c_hotel, bid,
      'لابتوب أعمال 15.6 إنش', '15.6" Business Laptop',
      'لابتوب بشاشة أوسع للعمل المكتبي.', '15.6" business laptop for office work.',
      2999, 0, 2250, 0, true,
      array[base || 'tech-laptop-biz-1.jpg'],
      false, false, 4013, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'لابتوب أعمال 15.6 إنش | متجر Tiqnora AI', 'اشتر لابتوب أعمال 15.6 إنش في السعودية مع دعم فني وضريبة موضحة. لابتوب بشاشة أوسع للعمل المكتبي.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 391.17,
        'estimated_profit', 749,
        'margin_pct', 25.0,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('لابتوب أعمال 15.6 إنش','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('15.6" Business Laptop','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-LAP-15',
          'brand', 'lenovo',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-LAP-15','brand','lenovo')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-conference-cam') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-conference-cam', 'HTL-CAM-CF', c_hotel, bid,
      'كاميرا غرف اجتماعات', 'Meeting Room Camera',
      'كاميرا للاجتماعات في قاعات الفندق/المكتب.', 'Camera for hotel/office meeting rooms.',
      799, 0, 480, 0, true,
      array[base || 'tech-conf-cam-1.jpg'],
      false, false, 4014, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'كاميرا غرف اجتماعات | متجر Tiqnora AI', 'اشتر كاميرا غرف اجتماعات في السعودية مع دعم فني وضريبة موضحة. كاميرا للاجتماعات في قاعات الفندق/المكتب.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 104.22,
        'estimated_profit', 319,
        'margin_pct', 39.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('كاميرا غرف اجتماعات','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Meeting Room Camera','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-CAM-CF',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-CAM-CF','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-speakerphone') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-speakerphone', 'HTL-SPK-01', c_hotel, bid,
      'سماعة اجتماعات مكتبية', 'Conference Speakerphone',
      'سماعة مكالمات جماعية لغرف الاجتماعات.', 'Conference speakerphone for meeting rooms.',
      599, 0, 360, 0, true,
      array[base || 'tech-conf-cam-1.jpg'],
      false, false, 4015, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'سماعة اجتماعات مكتبية | متجر Tiqnora AI', 'اشتر سماعة اجتماعات مكتبية في السعودية مع دعم فني وضريبة موضحة. سماعة مكالمات جماعية لغرف الاجتماعات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 78.13,
        'estimated_profit', 239,
        'margin_pct', 39.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('سماعة اجتماعات مكتبية','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Conference Speakerphone','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-SPK-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-SPK-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-ups-hotel') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-ups-hotel', 'HTL-UPS-2K', c_hotel, bid,
      'UPS 2 كيلو للأنظمة الحرجة', '2kVA UPS for Critical Systems',
      'حماية لأجهزة السنترال والشبكة.', '2kVA UPS for PBX and network gear.',
      1299, 0, 820, 0, true,
      array[base || 'tech-desk-dock-1.jpg'],
      false, false, 4016, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'UPS 2 كيلو للأنظمة الحرجة | متجر Tiqnora AI', 'اشتر UPS 2 كيلو للأنظمة الحرجة في السعودية مع دعم فني وضريبة موضحة. حماية لأجهزة السنترال والشبكة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 169.43,
        'estimated_profit', 479,
        'margin_pct', 36.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('UPS 2 كيلو للأنظمة الحرجة','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('2kVA UPS for Critical Systems','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-UPS-2K',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-UPS-2K','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-guest-tablet') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-guest-tablet', 'HTL-TAB-01', c_hotel, bid,
      'جهاز لوحي لخدمات الضيوف', 'Guest Service Tablet',
      'تابلت لطلبات الغرف والخدمات.', 'Tablet for in-room guest services.',
      1299, 0, 850, 0, true,
      array[base || 'tech-laptop-biz-1.jpg'],
      false, false, 4017, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'جهاز لوحي لخدمات الضيوف | متجر Tiqnora AI', 'اشتر جهاز لوحي لخدمات الضيوف في السعودية مع دعم فني وضريبة موضحة. تابلت لطلبات الغرف والخدمات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 169.43,
        'estimated_profit', 449,
        'margin_pct', 34.6,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('جهاز لوحي لخدمات الضيوف','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Guest Service Tablet','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-TAB-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-TAB-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-nas-storage') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-nas-storage', 'HTL-NAS-4B', c_hotel, bid,
      'وحدة تخزين NAS', 'NAS Storage Unit',
      'تخزين مركزي للنسخ الاحتياطي والملفات.', 'NAS unit for backup and shared files.',
      2499, 0, 1680, 0, true,
      array[base || 'tech-nvr-kit-1.jpg'],
      false, false, 4018, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'وحدة تخزين NAS | متجر Tiqnora AI', 'اشتر وحدة تخزين NAS في السعودية مع دعم فني وضريبة موضحة. تخزين مركزي للنسخ الاحتياطي والملفات.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 325.96,
        'estimated_profit', 819,
        'margin_pct', 32.8,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('وحدة تخزين NAS','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('NAS Storage Unit','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-NAS-4B',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-NAS-4B','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-label-badge') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-label-badge', 'HTL-BDG', c_hotel, bid,
      'طابعة بطاقات موظفين', 'Staff Badge Printer',
      'طباعة بطاقات التعريف للموظفين.', 'ID badge printer for staff cards.',
      999, 0, 640, 0, true,
      array[base || 'tech-laser-printer-1.jpg'],
      false, false, 4019, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'طابعة بطاقات موظفين | متجر Tiqnora AI', 'اشتر طابعة بطاقات موظفين في السعودية مع دعم فني وضريبة موضحة. طباعة بطاقات التعريف للموظفين.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 130.3,
        'estimated_profit', 359,
        'margin_pct', 35.9,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('طابعة بطاقات موظفين','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Staff Badge Printer','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-BDG',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-BDG','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-voip-gateway') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-voip-gateway', 'HTL-GW-FXO', c_hotel, bid,
      'بوابة VoIP', 'VoIP Gateway (FXO)',
      'ربط السنترال بخطوط الهاتف التقليدية.', 'FXO VoIP gateway for analog lines.',
      899, 0, 560, 0, true,
      array[base || 'tech-mini-pc-1.jpg'],
      false, false, 4020, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'بوابة VoIP | متجر Tiqnora AI', 'اشتر بوابة VoIP في السعودية مع دعم فني وضريبة موضحة. ربط السنترال بخطوط الهاتف التقليدية.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 117.26,
        'estimated_profit', 339,
        'margin_pct', 37.7,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('بوابة VoIP','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('VoIP Gateway (FXO)','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-GW-FXO',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-GW-FXO','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-switch-hotel') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-switch-hotel', 'HTL-SW-24', c_hotel, bid,
      'سويتش توزيع فندقي', 'Hotel Distribution Switch',
      'سويتش لتوزيع الشبكة على الطوابق.', 'Distribution switch for hotel floors.',
      1099, 0, 700, 0, true,
      array[base || 'tech-switch-8-1.jpg'],
      false, false, 4021, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'سويتش توزيع فندقي | متجر Tiqnora AI', 'اشتر سويتش توزيع فندقي في السعودية مع دعم فني وضريبة موضحة. سويتش لتوزيع الشبكة على الطوابق.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 143.35,
        'estimated_profit', 399,
        'margin_pct', 36.3,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('سويتش توزيع فندقي','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Hotel Distribution Switch','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-SW-24',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-SW-24','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-projector') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-projector', 'HTL-PRJ', c_hotel, bid,
      'بروجكتر قاعات', 'Meeting Room Projector',
      'جهاز عرض للقاعات والتدريب.', 'Projector for halls and training rooms.',
      1899, 0, 1250, 0, true,
      array[base || 'tech-conf-cam-1.jpg'],
      false, false, 4022, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'بروجكتر قاعات | متجر Tiqnora AI', 'اشتر بروجكتر قاعات في السعودية مع دعم فني وضريبة موضحة. جهاز عرض للقاعات والتدريب.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 247.7,
        'estimated_profit', 649,
        'margin_pct', 34.2,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('بروجكتر قاعات','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Meeting Room Projector','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-PRJ',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-PRJ','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-digital-signage') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-digital-signage', 'HTL-DS-01', c_hotel, bid,
      'شاشة إعلانات رقمية', 'Digital Signage Display',
      'شاشة للمحتوى الإعلاني في الاستقبال.', 'Digital signage display for lobbies.',
      2499, 0, 1680, 0, true,
      array[base || 'tech-aio-desktop-1.jpg'],
      false, false, 4023, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'شاشة إعلانات رقمية | متجر Tiqnora AI', 'اشتر شاشة إعلانات رقمية في السعودية مع دعم فني وضريبة موضحة. شاشة للمحتوى الإعلاني في الاستقبال.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 325.96,
        'estimated_profit', 819,
        'margin_pct', 32.8,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('شاشة إعلانات رقمية','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Digital Signage Display','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-DS-01',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-DS-01','brand','generic-tech')
      )
    );
  end if;


  select id into bid from public.brands where slug = 'generic-tech' limit 1;
  if bid is null then select id into bid from public.brands where slug = 'generic-tech' limit 1; end if;
  if not exists (select 1 from public.products where slug = 'htl-room-controller') and c_hotel is not null then
    insert into public.products (
      slug, sku, category_id, brand_id, name_ar, name_en, description_ar, description_en,
      price, discount_percent, cost_price, stock_quantity, track_stock, images,
      is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
      campaign_tags, supplier_name, keywords_ar, seo_title_ar, seo_description_ar, specifications
    ) values (
      'htl-room-controller', 'HTL-RM-CTL', c_hotel, bid,
      'وحدة تحكم غرفة أساسية', 'Basic Room Control Unit',
      'تحكم مبسط لإضاءة/أجهزة الغرفة.', 'Basic room automation control unit.',
      1499, 0, 980, 0, true,
      array[base || 'tech-desk-dock-1.jpg'],
      false, false, 4024, 'own_stock',
      'بعد الاعتماد: تجهيز 2–5 أيام عمل · شحن داخل المملكة · الأسعار تشمل تقدير ضريبة 15٪',
      array['draft-catalog','tech-marketplace']::text[],
      'local_saudi_hotel', 'فنادق، أعمال، سنترال، سيرفر',
      'وحدة تحكم غرفة أساسية | متجر Tiqnora AI', 'اشتر وحدة تحكم غرفة أساسية في السعودية مع دعم فني وضريبة موضحة. تحكم مبسط لإضاءة/أجهزة الغرفة.',
      jsonb_build_object(
        'vat_rate', 0.15,
        'vat_amount_estimate', 195.52,
        'estimated_profit', 519,
        'margin_pct', 34.6,
        'shipping_ar', 'شحن داخل السعودية بعد اعتماد المنتج ونوفر المخزون',
        'image_status', 'placeholder_reuse_pending_official',
        'image_note_ar', 'استبدل الصورة بصورة رسمية للموديل من المصنّع/المورد قبل النشر',
        'benefits_ar', jsonb_build_array('وحدة تحكم غرفة أساسية','مناسب للسوق السعودي','يتطلب اعتماد المشرف قبل النشر'),
        'benefits_en', jsonb_build_array('Basic Room Control Unit','Saudi market ready','Admin approval required'),
        'specs', jsonb_build_object(
          'category', 'hotel',
          'sku', 'HTL-RM-CTL',
          'brand', 'generic-tech',
          'warranty_note_ar', 'الضمان حسب سياسة المورد بعد التأكيد'
        ),
        'faq', jsonb_build_array(
          jsonb_build_object('q', 'هل المنتج منشور للبيع الآن؟', 'a', 'لا — مسودة بانتظار اعتماد المشرف واستبدال الصورة الرسمية.'),
          jsonb_build_object('q', 'هل السعر شامل الضريبة؟', 'a', 'السعر المعروض تقدير تجزئة؛ ضريبة 15٪ تقديرية ضمن التحليل التجاري.'),
          jsonb_build_object('q', 'ما مدة التوريد؟', 'a', 'بعد الاعتماد وتأكيد المخزون عادة 2–5 أيام عمل داخل المملكة.')
        ),
        'schema_hint', jsonb_build_object('@type','Product','sku','HTL-RM-CTL','brand','generic-tech')
      )
    );
  end if;


end $$;

-- Helpful indexes (idempotent)
create index if not exists idx_products_slug on public.products(slug);
create index if not exists idx_products_active_sort on public.products(is_active, sort_order);

comment on column public.products.is_active is 'false = draft pending admin publish approval';
