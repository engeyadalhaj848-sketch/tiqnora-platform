/**
 * Cron-oriented growth helpers (kept small for fast scheduled runs).
 */
export async function recentProspectCount(rest, hours = 6) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const rows = await rest(
    `prospects?select=id&updated_at=gte.${encodeURIComponent(since)}&limit=20`
  ).catch(() => []);
  return (rows || []).length;
}

export function dateKeyRiyadh() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' });
}

/**
 * Batched daily task ensure (one title scan instead of N lookups).
 */
export async function ensureDailyWorkforceTasksBatched(rest) {
  const agents = await rest('ai_agents?select=id,slug,name,status,is_enabled,organization_id&is_enabled=eq.true&status=eq.active').catch(() => []);
  const enabled = agents || [];
  if (!enabled.length) {
    return { agents_enabled: [], tasks_created: 0, tasks_existing: 0, error: 'no_enabled_agents' };
  }

  const ownerRows = await rest('profiles?select=id&role=eq.super_admin&is_active=eq.true&order=created_at.asc&limit=1').catch(() => []);
  const ownerId = ownerRows?.[0]?.id || null;
  if (!ownerId) {
    return {
      agents_enabled: enabled.map(a => ({ id: a.id, slug: a.slug, name: a.name })),
      tasks_created: 0,
      tasks_existing: 0,
      error: 'no_active_super_admin'
    };
  }

  const day = dateKeyRiyadh();
  let created = 0;
  let existing = 0;

  const templates = {
    sales: {
      title: 'مراجعة فرص المبيعات والعملاء المحتملين',
      description: 'راجع فرص CRM الجديدة في المدينة المنورة، رتّب الأعلى أولوية، وجهّز رسائل مخصصة كمسودات فقط. لا ترسل أي رسالة قبل الموافقة.',
      approval: true
    },
    marketing: {
      title: 'تحليل السوق وخطة التسويق اليومية',
      description: 'حلل عروض السوق واحتياج العملاء المحليين واقترح حملة عملية لليوم مع العرض والرسالة والقنوات ومؤشرات القياس. لا تنشر.',
      approval: false
    },
    'social-media': {
      title: 'خطة السوشيال ميديا اليومية',
      description: 'جهّز خطة اليوم لـ TikTok وInstagram وFacebook وLinkedIn وWhatsApp مع النصوص والهاشتاقات ومواعيد مقترحة. مسودات فقط بدون نشر.',
      approval: true
    },
    content: {
      title: 'كتابة محتوى اليوم',
      description: 'اكتب محتوى عربي احترافي لتيقنورا، نسخة قصيرة للسوشيال، وفكرة مقال تخدم المبيعات والظهور المحلي. مسودة فقط.',
      approval: false
    },
    'image-designer': {
      title: 'تصميم صورة اليوم',
      description: 'حوّل أفضل فكرة محتوى اليوم إلى brief وبرومبت تصميم كامل متوافق مع هوية Tiqnora. لا تنشر.',
      approval: false
    },
    'video-designer': {
      title: 'تصميم فيديو اليوم',
      description: 'جهّز سيناريو فيديو قصير مع hook وshot list ونص الشاشة وCTA لخدمات Tiqnora. لا تنشر.',
      approval: false
    },
    ads: {
      title: 'خطة الإعلانات المدفوعة اليوم',
      description: 'اقترح حملة إعلانية مدفوعة قابلة للتنفيذ مع الجمهور والرسالة والكرياتيف والميزانية المقترحة ومؤشرات القياس. لا تطلق ولا تصرف أي ميزانية بدون الموافقة.',
      approval: true
    },
    channel: {
      title: 'فرص القنوات والشراكات اليوم',
      description: 'حلل فرص القنوات والشراكات المحلية في المدينة المنورة واقترح أفضل خطوات اليوم مع سبب الأولوية. بدون تواصل خارجي.',
      approval: false
    },
    commerce: {
      title: 'مراجعة المتجر والمنتجات اليوم',
      description: 'راجع جاهزية المتجر والمنتجات المنشورة والمخزون والشحن وجودة البيانات. اقترح ما يجب نشره أو إخفاؤه، بدون شراء أو نشر تلقائي.',
      approval: false
    },
    developer: {
      title: 'فحص تقني يومي للمنصة',
      description: 'راجع مؤشرات صحة المنصة والأخطاء والتكاملات والأمان والأداء واقترح إصلاحات مرتبة حسب الأولوية. لا تنفذ تغييرات مدمرة.',
      approval: false
    },
    assistant: {
      title: 'مراجعة تشغيل Tiqnora اليومية',
      description: 'لخّص حالة التشغيل اليوم: المبيعات، العملاء، المهام، المحتوى، التكاملات، المتجر، وأهم 3 أولويات للمالك.',
      approval: false
    }
  };

  const existingRows = await rest(
    `ai_tasks?select=id,title&title=like.*${encodeURIComponent(day)}*&limit=200`
  ).catch(() => []);
  const existingTitles = new Set((existingRows || []).map(row => row.title));

  for (const agent of enabled) {
    const tpl = templates[agent.slug] || {
      title: 'مهمة التشغيل اليومية',
      description: 'راجع مسؤولياتك اليومية في Tiqnora وقدّم مخرجات عملية قابلة للمراجعة. لا تنفذ أي إرسال أو نشر خارجي.',
      approval: false
    };
    const title = `[DAILY ${day}] ${tpl.title}`;
    if (existingTitles.has(title)) {
      existing += 1;
      continue;
    }
    try {
      await rest('ai_tasks', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          organization_id: agent.organization_id || null,
          agent_id: agent.id,
          created_by: ownerId,
          title,
          description: tpl.description,
          status: 'todo',
          priority: 'high',
          due_at: new Date().toISOString(),
          requires_approval: Boolean(tpl.approval),
          goal: 'تشغيل Tiqnora اليوم بمخرجات عملية قابلة للمراجعة',
          context: { launch_day: day, agent_slug: agent.slug, draft_only: true, external_send: false },
          input: { action: 'daily_work', publish: false, send: false, spend: false }
        })
      });
      created += 1;
      existingTitles.add(title);
    } catch (_) {
      /* ignore insert race; the next cron will retry missing tasks */
    }
  }

  return {
    agents_enabled: enabled.map(a => ({ id: a.id, slug: a.slug, name: a.name })),
    tasks_created: created,
    tasks_existing: existing,
    error: null
  };
}
