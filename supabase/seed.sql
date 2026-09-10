-- ============================================================
-- TIQNORA AI — Seed: migrate current static content into DB
-- Run AFTER schema.sql
-- ============================================================

-- ---------- SERVICES (from script.js defaultContent) ----------
insert into public.services (slug, category_id, icon, title_ar, title_en, description_ar, description_en, details_ar, details_en, price, period, status, sort_order) values
  ('infrastructure-networks', (select id from public.categories where slug='it-solutions'), '⌘',
   'البنية التحتية والشبكات', 'Infrastructure & Networks',
   'تصميم وتنظيم شبكات LAN/WAN واتصالات الفروع مع توثيق واضح وأساس قابل للتوسع.',
   'Design and organize LAN/WAN networks and branch connectivity with clear documentation.',
   'تقييم الوضع، مخطط الشبكة، إعداد الأجهزة، التقسيم وخطة تحسين.',
   'Current-state review, network map, device setup, segmentation and an improvement plan.',
   2500, 'one_time', 'published', 1),

  ('cctv-security', (select id from public.categories where slug='it-solutions'), '◉',
   'كاميرات المراقبة وأنظمة الأمن', 'CCTV & Security Systems',
   'حلول كاميرات ومراقبة لحماية المواقع والممتلكات مع وصول واضح وآمن.',
   'Surveillance solutions to protect sites and assets with clear, secure access.',
   'تخطيط التغطية، تركيب IP/NVR، إعداد المشاهدة واختبار التسجيل.',
   'Coverage planning, IP/NVR installation, viewing access and recording checks.',
   2800, 'one_time', 'published', 2),

  ('it-support', (select id from public.categories where slug='it-solutions'), '⌂',
   'الدعم وحلول تقنية المعلومات', 'IT Support & Technical Solutions',
   'معالجة أعطال المستخدمين والأجهزة والبرمجيات بطريقة منظمة تقلل التعطّل.',
   'Structured support for user, device and software issues that reduces disruption.',
   'تشخيص، ترتيب الأولويات، توثيق الحل وإرشادات تمنع تكرار المشكلة.',
   'Diagnosis, prioritization, solution notes and guidance to prevent repeat issues.',
   1000, 'monthly', 'published', 3),

  ('servers-admin', (select id from public.categories where slug='it-solutions'), '▣',
   'الخوادم وإدارة الأنظمة', 'Servers & System Administration',
   'إعداد وإدارة Windows وLinux والخدمات التي تعتمد عليها الأعمال.',
   'Support for Windows, Linux and the services your business depends on.',
   'الصلاحيات، النسخ الاحتياطي، المراقبة وتنظيم الوصول للموارد.',
   'Permissions, backups, monitoring and organized resource access.',
   1800, 'monthly', 'published', 4),

  ('access-control', (select id from public.categories where slug='it-solutions'), '⌁',
   'التحكم بالدخول والبصمة', 'Access Control & Biometrics',
   'تركيب وربط أجهزة الدخول والحضور بما يلائم حركة الموقع واحتياج الإدارة.',
   'Access and attendance systems configured around how your site moves.',
   'تحديد النقاط، إعداد المستخدمين، ربط الأبواب واختبار السيناريوهات.',
   'Point planning, users, door connections and entry/exit testing.',
   1800, 'one_time', 'published', 5),

  ('hotel-branch-tech', (select id from public.categories where slug='it-solutions'), '✧',
   'تقنية الفنادق والفروع', 'Hotel & Multi-Branch Technology',
   'تنسيق الأنظمة والاتصالات في البيئات متعددة الغرف أو الفروع.',
   'Coordinate systems and connectivity across rooms, sites and branches.',
   'ربط احتياجات التشغيل بالاتصالات والأنظمة ونقاط الدعم.',
   'Connect operating needs with systems, connectivity and support points.',
   2500, 'one_time', 'published', 6),

  ('pos-systems', (select id from public.categories where slug='it-solutions'), '▤',
   'أنظمة نقاط البيع وإدارة الفروع', 'POS & Multi-Branch Management',
   'تنظيم أنظمة POS والاتصال بين الفروع والأجهزة وتحسين التشغيل اليومي.',
   'Organize POS environments and connections between branches and devices.',
   'فحص الاتصال، إعداد الأجهزة، معالجة الأعطال وتوثيق الإجراءات.',
   'Connectivity checks, device setup, troubleshooting and documented operation.',
   1800, 'one_time', 'published', 7),

  ('website-development', (select id from public.categories where slug='digital-services'), '◒',
   'تصميم وتطوير المواقع والمتجر', 'Website & E-commerce Development',
   'مواقع ومتاجر سريعة وواضحة ومتوافقة مع الجوال تعكس نشاطك.',
   'Fast, clear, mobile-ready websites and stores that reflect your business.',
   'هيكلة المحتوى، تجربة الجوال، الأداء، SEO وربط النماذج.',
   'Content structure, mobile experience, performance, SEO and integrations.',
   3500, 'one_time', 'published', 8),

  ('social-media', (select id from public.categories where slug='digital-services'), '◎',
   'إدارة حسابات التواصل الاجتماعي', 'Social Media Management',
   'خطة محتوى وهوية نشر تساعدك على الظهور باستمرار وبصوت واضح.',
   'A consistent content plan and publishing voice for your brand.',
   'تقويم محتوى، كتابة، تصميمات أساسية، جدولة وتقارير شهرية.',
   'Content calendar, copy, basic creatives, scheduling and monthly reporting.',
   1500, 'monthly', 'published', 9),

  ('digital-marketing', (select id from public.categories where slug='digital-services'), '✦',
   'التسويق الرقمي والحملات', 'Digital Marketing Campaigns',
   'تخطيط حملات رقمية وربط الرسائل بالصفحة أو العرض المناسب.',
   'Plan digital campaigns and connect the message to the right offer.',
   'استراتيجية، محتوى الحملة، صفحات هبوط وقياس التحويلات.',
   'Strategy, campaign content, landing pages and conversion tracking.',
   2500, 'monthly', 'published', 10),

  ('paid-ads', (select id from public.categories where slug='digital-services'), '↗',
   'إدارة الإعلانات المدفوعة', 'Paid Ads Management',
   'إعداد وإدارة حملات Google وMeta مع متابعة الإنفاق والنتائج.',
   'Set up and manage Google and Meta campaigns with spend visibility.',
   'هيكلة الحساب، الاستهداف، الإعلانات، التتبع والتحسين الدوري.',
   'Account structure, targeting, creatives, tracking and regular optimization.',
   1200, 'monthly', 'published', 11),

  ('seo-analytics', (select id from public.categories where slug='digital-services'), '⌕',
   'تحسين محركات البحث والتحليلات', 'SEO & Digital Analytics',
   'تحسين قابل للقياس لظهور الموقع وفهم سلوك الزوار.',
   'Measurable improvements to visibility and visitor understanding.',
   'بحث كلمات، تحسين صفحات، Search Console وAnalytics وتقارير.',
   'Keyword research, on-page improvements, Search Console and Analytics.',
   1200, 'monthly', 'published', 12),

  ('automation-ai', (select id from public.categories where slug='ai-services'), '✺',
   'الأتمتة وحلول الذكاء الاصطناعي', 'Automation & AI Solutions',
   'تحويل الخطوات المتكررة إلى تدفقات عمل أسهل باستخدام AI حيث يفيد فعلًا.',
   'Turn repetitive work into easier workflows using AI where it genuinely helps.',
   'رسم العملية، ربط الأدوات، بناء مساعدين واختبار الصلاحيات.',
   'Map the process, connect tools, build assistants and test permissions.',
   3000, 'one_time', 'published', 13),

  ('maintenance', (select id from public.categories where slug='it-solutions'), '⚙',
   'صيانة الكمبيوتر والطابعات', 'Computer & Printer Maintenance',
   'فحص وإصلاح وتجهيز الأجهزة المكتبية والطابعات للشركات.',
   'Inspect, repair and prepare office computers and printers.',
   'تشخيص الأعطال، تنظيف، تعريفات، إعداد الشبكة وتسليم تقرير مختصر.',
   'Diagnostics, cleaning, drivers, network setup and a short handover report.',
   700, 'one_time', 'published', 14),

  ('digital-audit', (select id from public.categories where slug='ai-services'), '◌',
   'التدقيق والتحليل الرقمي', 'Digital Audit & Business Analysis',
   'صورة عملية عن الأنظمة الحالية وما يمكن تحسينه قبل استثمار كبير.',
   'A practical view of current systems before a major investment.',
   'جمع المتطلبات، ترتيب المخاطر والفرص وتسليم توصيات قابلة للتنفيذ.',
   'Gather requirements, rank risks and opportunities, and deliver actions.',
   900, 'one_time', 'published', 15);

-- Extra AI services from the spec (status draft, admin publishes when ready)
insert into public.services (slug, category_id, icon, title_ar, title_en, description_ar, description_en, details_ar, details_en, price, period, status, sort_order) values
  ('ai-agents', (select id from public.categories where slug='ai-services'), '🤖',
   'بناء وكلاء الذكاء الاصطناعي', 'AI Agents',
   'وكلاء أذكياء مخصصون لأعمالك يتعاملون مع العملاء والمهام المتكررة.',
   'Custom intelligent agents that handle customers and repetitive tasks.',
   'تحليل الاحتياج، بناء الوكيل، ربط القنوات واختبار السيناريوهات.',
   'Needs analysis, agent building, channel integration and scenario testing.',
   4500, 'one_time', 'draft', 16),

  ('ai-customer-support', (select id from public.categories where slug='ai-services'), '💬',
   'الدعم العملاء بالذكاء الاصطناعي', 'AI Customer Support',
   'مساعد دعم يعمل 24/7 يجيب عن الأسئلة المتكررة ويحوّل المعقد للفريق.',
   'A 24/7 support assistant that answers FAQs and escalates complex cases.',
   'بناء قاعدة المعرفة، تدريب المساعد، ربط واتساب/الويب وتقارير.',
   'Knowledge base, assistant training, WhatsApp/web integration and reports.',
   3800, 'one_time', 'draft', 17),

  ('ai-sales-assistant', (select id from public.categories where slug='ai-services'), '📈',
   'مساعد المبيعات الذكي', 'AI Sales Assistant',
   'مساعد يتابع العملاء المحتملين ويرشح أفضل الفرص للتواصل.',
   'An assistant that follows leads and surfaces the best opportunities.',
   'ربط CRM، سلاسل المتابعة، تقييم العملاء وتقارير الفرص.',
   'CRM integration, follow-up sequences, lead scoring and opportunity reports.',
   4200, 'one_time', 'draft', 18),

  ('ai-marketing-assistant', (select id from public.categories where slug='ai-services'), '🎯',
   'مساعد التسويق الذكي', 'AI Marketing Assistant',
   'توليد خطط ومحتوى تسويقي بالذكاء الاصطناعي بجودة احترافية.',
   'AI-generated marketing plans and content at professional quality.',
   'استراتيجية، محتوى حملات، صور إعلانية وتحسين مستمر.',
   'Strategy, campaign content, ad creatives and continuous optimization.',
   3600, 'monthly', 'draft', 19),

  ('ai-analytics', (select id from public.categories where slug='ai-services'), '📊',
   'تحليلات الذكاء الاصطناعي', 'AI Analytics',
   'تحليل بيانات أعمالك واقتراح قرارات عملية مبنية على الأرقام.',
   'Analyze your business data and suggest practical, data-driven decisions.',
   'ربط المصادر، لوحات مؤشرات، تنبيهات وتوصيات شهرية.',
   'Source integration, dashboards, alerts and monthly recommendations.',
   3200, 'monthly', 'draft', 20);

-- ---------- PACKAGES (from script.js plans) ----------
insert into public.packages (slug, name_ar, name_en, description_ar, description_en, features_ar, features_en, price_monthly, price_range_min, price_range_max, billing_type, is_visible, featured, sort_order) values
  ('starter', 'البداية', 'Starter',
   'للمشاريع الصغيرة التي تحتاج أساسًا مرتبًا.',
   'For small businesses that need a clear foundation.',
   array['موقع تعريفي متجاوب','تهيئة Google الأساسية','دعم شهري خفيف'],
   array['Responsive company website','Google basics setup','Light monthly support'],
   1490, 2000, 7500, 'range', true, false, 1),

  ('growth', 'النمو', 'Growth',
   'لشركة تريد حضورًا رقميًا وتسويقًا مستمرًا.',
   'For a business ready for consistent digital growth.',
   array['كل ما في البداية','إدارة محتوى اجتماعي','حملة إعلانية وتحليلات','دعم تقني شهري'],
   array['Everything in Starter','Social content management','Campaign and analytics','Monthly technical support'],
   2990, 7500, 18750, 'range', true, true, 2),

  ('scale', 'التوسع', 'Scale',
   'للفروع والعمليات التي تحتاج ربطًا وأتمتة.',
   'For branches and operations that need connected automation.',
   array['كل ما في النمو','أتمتة وذكاء اصطناعي','أنظمة فروع وPOS','مراجعة شهرية للأداء'],
   array['Everything in Growth','Automation and AI','Branch and POS systems','Monthly performance review'],
   5990, 18750, null, 'range', true, false, 3);

-- ---------- CMS PAGES ----------
insert into public.pages (slug, title_ar, title_en, status, is_in_nav, sort_order) values
  ('about', 'من نحن', 'About Us', 'published', false, 1),
  ('privacy', 'سياسة الخصوصية', 'Privacy Policy', 'published', false, 2),
  ('terms', 'الشروط والأحكام', 'Terms & Conditions', 'published', false, 3),
  ('faq', 'الأسئلة الشائعة', 'FAQ', 'draft', false, 4);
