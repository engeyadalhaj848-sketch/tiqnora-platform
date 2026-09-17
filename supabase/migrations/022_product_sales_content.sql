-- Rich sales content for National Day catalog (customer-facing only)
-- Stored in specifications jsonb: benefits_ar, benefits_en, faq

update public.products set
  description_ar = 'ديكور وطني أنيق بإضاءة LED يضفي لمسة احتفالية على المنزل أو المكتب في موسم اليوم الوطني.',
  description_en = 'Patriotic LED map décor that adds a festive touch to home or office for National Day.',
  seo_title_ar = 'إطار خريطة السعودية LED | عرض اليوم الوطني',
  seo_description_ar = 'إطار خريطة السعودية بإضاءة LED — ديكور احتفالي مع شحن داخل المملكة.',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('مظهر احتفالي مميز','إضاءة LED موفرة','هدية مناسبة للموسم'),
    'benefits_en', jsonb_build_array('Festive décor look','Efficient LED lighting','Great seasonal gift'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل يعمل بالكهرباء مباشرة؟','a','نعم، حسب المواصفات المعروضة؛ راجع الملحقات عند الاستلام.'),
      jsonb_build_object('q','هل يناسب كهدية؟','a','نعم، خيار شائع كهديّة موسمية.')
    )
  ),
  updated_at = now()
where slug = 'nd96-saudi-map-frame';

update public.products set
  description_ar = 'بكج كابلات متعدد الأطراف للشحن السريع — عملي للسفر والمكتب والجوالات المختلفة.',
  description_en = 'Multi-tip fast charging cable pack — practical for travel, office, and mixed devices.',
  seo_title_ar = 'بكج كابلات شحن 6 في 1',
  seo_description_ar = 'كابلات شحن متعددة الأطراف — عرض اليوم الوطني من Tiqnora.',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('عدة أطراف في بكج واحد','مناسب للسفر','قيمة عالية بسعر مناسب'),
    'benefits_en', jsonb_build_array('Multiple tips in one pack','Travel friendly','Strong value'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل يدعم الشحن السريع؟','a','حسب توافق الجهاز والشاحن المستخدم.'),
      jsonb_build_object('q','هل يشمل كل الأنواع الشائعة؟','a','البكج مصمم لتغطية الاستخدام اليومي الشائع.')
    )
  ),
  updated_at = now()
where slug = 'nd96-cable-6in1';

update public.products set
  description_ar = 'شريط إضاءة RGB ذكي بطول 5 أمتار مع تحكم بالتطبيق — مثالي لتزيين الغرف والاحتفالات.',
  description_en = '5m smart RGB LED strip with app control — ideal for rooms and celebrations.',
  seo_title_ar = 'شريط إضاءة RGB ذكي 5م | اليوم الوطني',
  seo_description_ar = 'شريط LED ذكي بألوان متعددة وتحكم بالتطبيق.',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('ألوان متعددة قابلة للتخصيص','تحكم سهل بالتطبيق','أجواء احتفالية فورية'),
    'benefits_en', jsonb_build_array('Custom multicolor modes','Easy app control','Instant festive ambiance'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل يحتاج تركيب معقد؟','a','تركيب لاصق بسيط حسب السطح؛ اتبع التعليمات المرفقة.'),
      jsonb_build_object('q','هل يناسب غرفة المعيشة؟','a','نعم، شائع لديكور الصالات وغرف الألعاب.')
    )
  ),
  updated_at = now()
where slug = 'nd96-led-strip-smart';

update public.products set
  description_ar = 'حامل جوال مغناطيسي للسيارة يثبت جهازك بأمان أثناء القيادة مع سهولة التركيب.',
  description_en = 'Magnetic car phone mount for safer driving and easy installation.',
  seo_title_ar = 'حامل جوال سيارة مغناطيسي',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('تثبيت قوي','تركيب سريع','استخدام يومي عملي'),
    'benefits_en', jsonb_build_array('Strong hold','Quick install','Daily driving use'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل يناسب كل الجوالات؟','a','يعمل مع أغلب الجوالات عند استخدام القطعة المغناطيسية المرفقة أو المتوافقة.')
    )
  ),
  updated_at = now()
where slug = 'nd96-car-mag-holder';

update public.products set
  description_ar = 'سماعة أذن لاسلكية TWS بصوت واضح وعلبة شحن مدمجة — للاستماع والمكالمات يومياً.',
  description_en = 'TWS wireless earbuds with clear sound and compact charging case.',
  seo_title_ar = 'سماعة أذن لاسلكية TWS',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('اتصال بلوتوث مستقر','علبة شحن محمولة','راحة للاستخدام اليومي'),
    'benefits_en', jsonb_build_array('Stable Bluetooth','Portable charging case','Everyday comfort'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل تدعم الجوالات الحديثة؟','a','متوافقة مع الأجهزة التي تدعم البلوتوث القياسي.')
    )
  ),
  updated_at = now()
where slug = 'nd96-tws-earbuds';

update public.products set
  description_ar = 'ساعة رياضية ذكية لتتبع النشاط والنوم ومعدل ضربات القلب بأسلوب عملي.',
  description_en = 'Smart sport watch for activity, sleep and heart-rate tracking.',
  seo_title_ar = 'ساعة رياضية ذكية',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('تتبع نشاط يومي','تنبيهات ذكية','تصميم رياضي'),
    'benefits_en', jsonb_build_array('Daily activity tracking','Smart alerts','Sport design'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل تغني عن الساعة الطبية؟','a','أداة مساعدة لنمط الحياة وليست بديلاً عن الاستشارات الطبية.')
    )
  ),
  updated_at = now()
where slug = 'nd96-sport-watch';

update public.products set
  description_ar = 'باور بانك بسعة 20000 مللي أمبير لشحن الجوال والأجهزة أثناء السفر والعمل.',
  description_en = '20000mAh power bank for phones and devices on the go.',
  seo_title_ar = 'باور بانك 20000 مللي أمبير',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('سعة عالية','مناسب للسفر','شحن أجهزة متعددة'),
    'benefits_en', jsonb_build_array('High capacity','Travel ready','Charge multiple devices'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','كم مرة يشحن الجوال تقريباً؟','a','يختلف حسب سعة جوالك والاستخدام؛ السعة الكبيرة مناسبة لرحلات أطول.')
    )
  ),
  updated_at = now()
where slug = 'nd96-powerbank-20k';

update public.products set
  description_ar = 'مقوي إشارة WiFi لتحسين التغطية داخل المنزل متعدد الغرف.',
  description_en = 'WiFi range extender to improve multi-room coverage at home.',
  seo_title_ar = 'مقوي إشارة WiFi',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('تغطية أوسع','إعداد مبسط','حل عملي للمنازل'),
    'benefits_en', jsonb_build_array('Wider coverage','Simple setup','Practical for homes'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل يحتاج فني تركيب؟','a','غالباً يتم الإعداد ذاتياً حسب دليل الجهاز.')
    )
  ),
  updated_at = now()
where slug = 'nd96-wifi-extender';

update public.products set
  description_ar = 'كاميرا مراقبة WiFi مصغرة للمتابعة عن بُعد عبر التطبيق — للاستخدام المنزلي المسؤول.',
  description_en = 'Mini WiFi camera for responsible home remote monitoring via app.',
  seo_title_ar = 'كاميرا مراقبة WiFi مصغرة',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('مراقبة عن بُعد','حجم مدمج','تنبيهات عبر التطبيق'),
    'benefits_en', jsonb_build_array('Remote monitoring','Compact size','App alerts'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل تحتاج إنترنت ثابت؟','a','تعمل عبر شبكة WiFi منزلية مستقرة حسب المواصفات.')
    )
  ),
  updated_at = now()
where slug = 'nd96-mini-wifi-cam';

update public.products set
  description_ar = 'منظم مكتب خشبي أنيق لترتيب الأدوات والمستلزمات اليومية.',
  description_en = 'Elegant wooden desk organizer for everyday tools.',
  seo_title_ar = 'منظم مكتب خشبي',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('مظهر مرتب','مساحات تخزين عملية','يناسب المكتب المنزلي'),
    'benefits_en', jsonb_build_array('Clean look','Practical storage','Home office friendly'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل الخشب حقيقي؟','a','الخامة حسب مواصفات المنتج المعروضة عند الاستلام.')
    )
  ),
  updated_at = now()
where slug = 'nd96-desk-organizer';

update public.products set
  description_ar = 'موزع USB-C متعدد المنافذ للابتوب: HDMI ومنافذ USB وقارئ بطاقات.',
  description_en = 'USB-C hub with HDMI, USB ports and card reader for laptops.',
  seo_title_ar = 'موزع USB-C 7 في 1',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('منافذ متعددة','مناسب للابتوب الحديث','إنتاجية أعلى'),
    'benefits_en', jsonb_build_array('Multiple ports','Modern laptop ready','Boost productivity'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل يعمل مع ماك وويندوز؟','a','متوافق مع الأجهزة التي تدعم USB-C/Thunderbolt حسب المنفذ.')
    )
  ),
  updated_at = now()
where slug = 'nd96-usbc-hub-7';

update public.products set
  description_ar = 'مروحة رقبة USB تبريد عملي بدون شغل اليدين — للرحلات والفعاليات.',
  description_en = 'Hands-free USB neck fan for travel and outdoor events.',
  seo_title_ar = 'مروحة رقبة USB',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('بدون حمل باليد','خفيفة ومحمولة','مناسبة للأجواء الدافئة'),
    'benefits_en', jsonb_build_array('Hands-free','Lightweight','Warm weather ready'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','كيف تُشحن؟','a','عبر منفذ USB حسب مواصفات الجهاز.')
    )
  ),
  updated_at = now()
where slug = 'nd96-neck-fan';

update public.products set
  description_ar = 'إضاءة مكتب LED قابلة للطي بزاوية قابلة للتعديل للدراسة والعمل.',
  description_en = 'Folding LED desk lamp with adjustable angle for study and work.',
  seo_title_ar = 'إضاءة مكتب LED قابلة للطي',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('إضاءة مريحة للعين','قابلة للطي والتخزين','زاوية مرنة'),
    'benefits_en', jsonb_build_array('Comfortable lighting','Foldable storage','Flexible angle'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل يوجد مستويات إضاءة؟','a','حسب موديل المنتج؛ راجع الوصف عند الاستلام.')
    )
  ),
  updated_at = now()
where slug = 'nd96-desk-lamp-led';

update public.products set
  description_ar = 'مطارة ستانلس 750مل للحفاظ على حرارة المشروب في الرياضة والمكتب.',
  description_en = '750ml stainless bottle for temperature retention at sport and office.',
  seo_title_ar = 'مطارة ستانلس 750مل',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('سعة عملية','متينة للسفر','مناسبة كهدية'),
    'benefits_en', jsonb_build_array('Practical capacity','Travel durable','Gift friendly'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل تحفظ البارد والحار؟','a','مصممة للمساعدة على حفظ الحرارة ضمن الاستخدام اليومي المعتاد.')
    )
  ),
  updated_at = now()
where slug = 'nd96-steel-bottle';

update public.products set
  description_ar = 'مسدس مساج محمول للاسترخاء بعد التمرين أو يوم العمل الطويل.',
  description_en = 'Portable massage gun for recovery after workouts or long days.',
  seo_title_ar = 'مسدس مساج محمول',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('استرخاء عضلي','حجم محمول','استخدام منزلي'),
    'benefits_en', jsonb_build_array('Muscle recovery','Portable size','Home use'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل هو جهاز طبي؟','a','أداة راحة شخصية وليست بديلاً عن العلاج الطبي.')
    )
  ),
  updated_at = now()
where slug = 'nd96-massage-gun';

update public.products set
  description_ar = 'بروجيكتور صغير بدقة HD لعرض الأفلام والعروض في المنزل.',
  description_en = 'Compact HD projector for home movies and presentations.',
  seo_title_ar = 'بروجيكتور صغير HD',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('حجم مدمج','تجربة عرض منزلية','سهل النقل'),
    'benefits_en', jsonb_build_array('Compact size','Home theater vibe','Easy to move'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل يحتاج شاشة خاصة؟','a','يمكن العرض على جدار فاتح أو شاشة حسب الإضاءة المحيطة.')
    )
  ),
  updated_at = now()
where slug = 'nd96-mini-projector';

update public.products set
  description_ar = 'لوحة مفاتيح ميكانيكية بإضاءة RGB لتجربة كتابة مريحة ومظهر مميز.',
  description_en = 'RGB mechanical keyboard for comfortable typing and a bold look.',
  seo_title_ar = 'لوحة مفاتيح ميكانيكية RGB',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('إحساس كتابة مريح','إضاءة قابلة للتخصيص','للعمل والألعاب'),
    'benefits_en', jsonb_build_array('Comfortable typing feel','Custom lighting','Work and play'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل هي سلكية أم لاسلكية؟','a','راجع مواصفات الموديل المعروض عند التجهيز.')
    )
  ),
  updated_at = now()
where slug = 'nd96-mech-keyboard';

update public.products set
  description_ar = 'طقم تنظيف إلكترونيات من 5 قطع للشاشات والسماعات ولوحات المفاتيح.',
  description_en = '5-piece electronics cleaning kit for screens, earbuds and keyboards.',
  seo_title_ar = 'طقم تنظيف إلكترونيات 5 قطع',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('عناية يومية بالأجهزة','بكج متكامل','إضافة مثالية للسلة'),
    'benefits_en', jsonb_build_array('Daily device care','Complete kit','Great cart add-on'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل آمن على الشاشات؟','a','مصمم للاستخدام اللطيف؛ اتبع الإرشادات المرفقة.')
    )
  ),
  updated_at = now()
where slug = 'nd96-clean-kit';

update public.products set
  description_ar = 'شنطة لابتوب 15.6 إنش بحماية مبطنة وجيب للمستندات.',
  description_en = '15.6\" laptop bag with padded protection and document pocket.',
  seo_title_ar = 'شنطة لابتوب 15.6 إنش',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('حماية مبطنة','جيب مستندات','مناسبة للطلاب والموظفين'),
    'benefits_en', jsonb_build_array('Padded protection','Document pocket','Students and professionals'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل تناسب 15.6؟','a','مصممة لأجهزة حتى مقاس 15.6 إنش تقريباً.')
    )
  ),
  updated_at = now()
where slug = 'nd96-laptop-bag';

update public.products set
  description_ar = 'ستاند لابتوب من الألمنيوم لرفع الشاشة وتحسين التهوية ووضعية الجلوس.',
  description_en = 'Aluminum laptop stand for better height, cooling and posture.',
  seo_title_ar = 'ستاند لابتوب ألمنيوم',
  specifications = jsonb_build_object(
    'benefits_ar', jsonb_build_array('وضعية مريحة','تبريد أفضل','تصميم معدني أنيق'),
    'benefits_en', jsonb_build_array('Ergonomic height','Better airflow','Sleek metal design'),
    'faq', jsonb_build_array(
      jsonb_build_object('q','هل يناسب كل اللابتوبات؟','a','يناسب الأحجام الشائعة للمكاتب المنزلية والعمل.')
    )
  ),
  updated_at = now()
where slug = 'nd96-laptop-stand';
