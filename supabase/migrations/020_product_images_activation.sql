-- National Day products + image URLs (static assets on Vercel)
-- Run after OR instead of partial 018/019 if those were not applied.
-- Images hosted at: https://www.tiqnora.com/assets/products/{slug}-N.jpg
-- License: Unsplash License (free commercial use). No supplier watermarks.

-- Columns (idempotent)
alter table public.products add column if not exists campaign_tags text[] not null default '{}';
alter table public.products add column if not exists supplier_name text;
alter table public.products add column if not exists supplier_url text;
alter table public.products add column if not exists fulfillment_type text not null default 'own_stock';
alter table public.products add column if not exists delivery_note_ar text;
alter table public.products add column if not exists delivery_note_en text;
alter table public.products add column if not exists cost_price numeric(10,2);

-- Categories
insert into public.categories (slug, name_ar, name_en, type, sort_order, status)
select v.slug, v.name_ar, v.name_en, 'product', v.sort_order, 'published'
from (values
  ('national-day', 'عروض اليوم الوطني', 'National Day Offers', 1),
  ('electronics', 'إلكترونيات', 'Electronics', 2),
  ('home-office', 'منزل ومكتب', 'Home & Office', 3),
  ('accessories', 'إكسسوارات', 'Accessories', 4),
  ('best-sellers', 'الأكثر مبيعاً', 'Best Sellers', 5)
) as v(slug, name_ar, name_en, sort_order)
where not exists (select 1 from public.categories c where c.slug = v.slug);

do $$
declare
  cat_nd uuid; cat_el uuid; cat_ho uuid; cat_ac uuid;
  base text := 'https://www.tiqnora.com/assets/products/';
begin
  select id into cat_nd from public.categories where slug = 'national-day' limit 1;
  select id into cat_el from public.categories where slug = 'electronics' limit 1;
  select id into cat_ho from public.categories where slug = 'home-office' limit 1;
  select id into cat_ac from public.categories where slug = 'accessories' limit 1;

  insert into public.products (
    slug, sku, category_id, name_ar, name_en, description_ar, description_en,
    price, discount_percent, cost_price, stock_quantity, track_stock, images,
    is_active, featured, sort_order, fulfillment_type, delivery_note_ar,
    campaign_tags, supplier_name, keywords_ar
  ) values
  ('nd96-led-strip-smart','ND96-LED-01',cat_nd,
   'شريط إضاءة RGB ذكي 5م','Smart RGB LED Strip 5m',
   'تحكم بالتطبيق وألوان متعددة — مثالي للديكور والاحتفال.','App-controlled multicolor LED strip for décor and celebrations.',
   129,20,55,80,true,
   array[base||'nd96-led-strip-smart-1.jpg', base||'nd96-led-strip-smart-2.jpg'],
   true,true,10,'dropship','يصل خلال 7–14 يوم عمل',array['national-day','best-seller'],'AliExpress / CJ','اليوم الوطني، إضاءة'),
  ('nd96-powerbank-20k','ND96-PB-20K',cat_el,
   'باور بانك 20000 مللي أمبير','20000mAh Power Bank',
   'شحن سريع للجوالات والأجهزة اللوحية — للسفر والعمل.','Fast-charge power bank for phones and tablets.',
   149,15,70,100,true,
   array[base||'nd96-powerbank-20k-1.jpg', base||'nd96-powerbank-20k-2.jpg'],
   true,true,20,'dropship','يصل خلال 7–12 يوم عمل',array['national-day','best-seller'],'AliExpress','شحن، باور بانك'),
  ('nd96-desk-organizer','ND96-DESK-01',cat_ho,
   'منظم مكتب خشبي','Wooden Desk Organizer',
   'تنظيم أنيق للمكتب المنزلي والشركات الصغيرة.','Elegant desk organizer for home and small offices.',
   89,25,35,60,true,array[base||'nd96-desk-organizer-1.jpg'],
   true,true,30,'dropship','يصل خلال 8–15 يوم عمل',array['national-day'],'Alibaba','مكتب'),
  ('nd96-tws-earbuds','ND96-EAR-BT',cat_el,
   'سماعة أذن لاسلكية TWS','TWS Wireless Earbuds',
   'صوت واضح وعلبة شحن واتصال بلوتوث مستقر.','Clear sound with charging case and stable Bluetooth.',
   119,18,48,120,true,
   array[base||'nd96-tws-earbuds-1.jpg', base||'nd96-tws-earbuds-2.jpg'],
   true,true,15,'dropship','يصل خلال 7–14 يوم عمل',array['national-day','best-seller'],'CJ Dropshipping','سماعة'),
  ('nd96-neck-fan','ND96-FAN-N',cat_ac,
   'مروحة رقبة USB','USB Neck Fan',
   'تبريد عملي بدون حمل باليد — للرحلات والفعاليات.','Hands-free cooling for travel and outdoor events.',
   69,20,28,90,true,array[base||'nd96-neck-fan-1.jpg'],
   true,true,40,'dropship','يصل خلال 7–12 يوم عمل',array['national-day'],'AliExpress','مروحة'),
  ('nd96-mini-wifi-cam','ND96-CAM-M',cat_el,
   'كاميرا مراقبة WiFi مصغرة','Mini WiFi Security Camera',
   'مراقبة عن بُعد عبر التطبيق — للاستخدام المنزلي المسؤول.','Remote app monitoring for responsible home use.',
   199,12,95,70,true,array[base||'nd96-mini-wifi-cam-1.jpg'],
   true,true,25,'dropship','يصل خلال 8–15 يوم عمل',array['national-day','best-seller'],'AliExpress','كاميرا'),
  ('nd96-usbc-hub-7','ND96-HUB-7',cat_el,
   'موزع USB-C 7 في 1','USB-C Hub 7-in-1',
   'HDMI وUSB وقارئ بطاقات للابتوب الحديث.','HDMI, USB and card reader for modern laptops.',
   139,15,62,75,true,array[base||'nd96-usbc-hub-7-1.jpg'],
   true,true,35,'dropship','يصل خلال 7–14 يوم عمل',array['national-day'],'AliExpress','USB-C'),
  ('nd96-desk-lamp-led','ND96-LAMP-D',cat_ho,
   'إضاءة مكتب LED قابلة للطي','Folding LED Desk Lamp',
   'إضاءة مريحة للدراسة والعمل بزاوية قابلة للتعديل.','Comfortable adjustable lighting for study and work.',
   99,20,40,85,true,array[base||'nd96-desk-lamp-led-1.jpg'],
   true,true,45,'dropship','يصل خلال 7–14 يوم عمل',array['national-day'],'CJ Dropshipping','إضاءة'),
  ('nd96-car-mag-holder','ND96-HOLD-C',cat_ac,
   'حامل جوال سيارة مغناطيسي','Magnetic Car Phone Mount',
   'تثبيت قوي وآمن للجوال أثناء القيادة.','Strong magnetic mount for safer driving use.',
   49,15,18,150,true,array[base||'nd96-car-mag-holder-1.jpg'],
   true,true,12,'dropship','يصل خلال 6–12 يوم عمل',array['national-day','best-seller'],'AliExpress','سيارة'),
  ('nd96-steel-bottle','ND96-BOTTLE',cat_ac,
   'مطارة ستانلس 750مل','750ml Stainless Bottle',
   'حفظ حرارة المشروب للرياضة والمكتب.','Temperature retention for sport and office.',
   79,20,32,95,true,array[base||'nd96-steel-bottle-1.jpg'],
   true,true,50,'dropship','يصل خلال 8–14 يوم عمل',array['national-day'],'Alibaba','مطارة'),
  ('nd96-massage-gun','ND96-MASS-G',cat_ac,
   'مسدس مساج محمول','Portable Massage Gun',
   'استرخاء العضلات بعد التمرين أو يوم عمل طويل.','Muscle recovery after workouts or long days.',
   179,15,85,55,true,array[base||'nd96-massage-gun-1.jpg'],
   true,true,55,'dropship','يصل خلال 8–15 يوم عمل',array['national-day'],'CJ Dropshipping','مساج'),
  ('nd96-mini-projector','ND96-PROJ-M',cat_el,
   'بروجيكتور صغير HD','Mini HD Projector',
   'عرض منزلي للأفلام والعروض بحجم مدمج.','Compact projector for home movies and presentations.',
   349,10,180,40,true,array[base||'nd96-mini-projector-1.jpg'],
   true,true,60,'dropship','يصل خلال 10–18 يوم عمل',array['national-day'],'AliExpress','بروجيكتور'),
  ('nd96-mech-keyboard','ND96-KEY-M',cat_el,
   'لوحة مفاتيح ميكانيكية RGB','RGB Mechanical Keyboard',
   'كتابة مريحة مع إضاءة قابلة للتخصيص.','Comfortable typing with customizable lighting.',
   189,12,95,50,true,
   array[base||'nd96-mech-keyboard-1.jpg', base||'nd96-mech-keyboard-2.jpg'],
   true,true,65,'dropship','يصل خلال 8–15 يوم عمل',array['national-day'],'AliExpress','كيبورد'),
  ('nd96-sport-watch','ND96-WATCH-S',cat_el,
   'ساعة رياضية ذكية','Smart Sport Watch',
   'تتبع النشاط والنوم ومعدل ضربات القلب.','Activity, sleep and heart-rate tracking.',
   159,15,75,80,true,
   array[base||'nd96-sport-watch-1.jpg', base||'nd96-sport-watch-2.jpg'],
   true,true,18,'dropship','يصل خلال 7–14 يوم عمل',array['national-day','best-seller'],'CJ Dropshipping','ساعة'),
  ('nd96-clean-kit','ND96-CLEAN-K',cat_ac,
   'طقم تنظيف إلكترونيات 5 قطع','5-Piece Electronics Clean Kit',
   'تنظيف الشاشات والسماعات ولوحات المفاتيح.','Clean screens, earbuds and keyboards safely.',
   55,20,22,120,true,array[base||'nd96-clean-kit-1.jpg'],
   true,true,70,'dropship','يصل خلال 6–12 يوم عمل',array['national-day'],'AliExpress','تنظيف'),
  ('nd96-laptop-bag','ND96-BAG-L',cat_ho,
   'شنطة لابتوب 15.6 إنش','15.6" Laptop Bag',
   'حماية مبطنة مع جيب مستندات.','Padded protection with document pocket.',
   109,15,45,70,true,array[base||'nd96-laptop-bag-1.jpg'],
   true,true,75,'dropship','يصل خلال 8–14 يوم عمل',array['national-day'],'Alibaba','شنطة'),
  ('nd96-wifi-extender','ND96-ROUTER-T',cat_el,
   'مقوي إشارة WiFi','WiFi Range Extender',
   'تحسين التغطية في المنازل متعددة الغرف.','Improve coverage in multi-room homes.',
   129,15,58,65,true,array[base||'nd96-wifi-extender-1.jpg'],
   true,true,22,'dropship','يصل خلال 7–14 يوم عمل',array['national-day','best-seller'],'AliExpress','واي فاي'),
  ('nd96-saudi-map-frame','ND96-SAUD-F',cat_ho,
   'إطار خريطة السعودية بإضاءة LED','Saudi Map LED Frame',
   'ديكور وطني مميز لموسم اليوم الوطني.','Patriotic LED décor for National Day season.',
   95,25,38,100,true,array[base||'nd96-saudi-map-frame-1.jpg'],
   true,true,5,'dropship','يصل خلال 7–14 يوم عمل',array['national-day','best-seller'],'AliExpress','اليوم الوطني'),
  ('nd96-cable-6in1','ND96-CABLE-G',cat_ac,
   'بكج كابلات شحن 6 في 1','6-in-1 Fast Cable Pack',
   'عدة أطراف شحن في بكج واحد.','Multi-tip charging pack for travel and office.',
   49,15,20,200,true,array[base||'nd96-cable-6in1-1.jpg'],
   true,true,8,'dropship','يصل خلال 6–12 يوم عمل',array['national-day','best-seller'],'CJ Dropshipping','كابل'),
  ('nd96-laptop-stand','ND96-STAND-M',cat_ho,
   'ستاند لابتوب ألمنيوم','Aluminum Laptop Stand',
   'رفع الشاشة لوضعية مريحة وتقليل الحرارة.','Ergonomic height and better cooling.',
   99,15,42,80,true,array[base||'nd96-laptop-stand-1.jpg'],
   true,true,80,'dropship','يصل خلال 7–14 يوم عمل',array['national-day'],'Alibaba','ستاند')
  on conflict (slug) do update set
    name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    description_ar = excluded.description_ar,
    description_en = excluded.description_en,
    price = excluded.price,
    discount_percent = excluded.discount_percent,
    cost_price = excluded.cost_price,
    images = excluded.images,
    featured = excluded.featured,
    is_active = true,
    fulfillment_type = 'dropship',
    campaign_tags = excluded.campaign_tags,
    supplier_name = excluded.supplier_name,
    delivery_note_ar = excluded.delivery_note_ar,
    category_id = excluded.category_id,
    updated_at = now();
end $$;

-- Note: Supabase Storage bucket optional later.
-- Static CDN path via Vercel is sufficient for MVP launch.
