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
    return { agents_enabled: [], tasks_created: 0, tasks_existing: 0 };
  }

  const day = dateKeyRiyadh();
  let created = 0;
  let existing = 0;

  const templates = [
    { title: `Daily prospect research — ${day}`, description: 'Discover and score local B2B prospects in Madinah for Tiqnora services. Draft only.' },
    { title: `Daily outreach drafts — ${day}`, description: 'Prepare personalized outreach drafts for top HIGH prospects. Do not send. Approval required.' },
    { title: `Daily pipeline review — ${day}`, description: 'Review open opportunities and recommend next best actions. No external messages.' }
  ];

  const desired = [];
  for (const agent of enabled.slice(0, 6)) {
    for (const tpl of templates) {
      desired.push({
        agent,
        title: `${tpl.title} [${agent.slug || agent.name}]`,
        description: tpl.description
      });
    }
  }

  const existingRows = await rest(
    `ai_tasks?select=id,title&title=like.*${encodeURIComponent(day)}*&limit=200`
  ).catch(() => []);
  const existingTitles = new Set((existingRows || []).map(row => row.title));

  for (const item of desired) {
    if (existingTitles.has(item.title)) {
      existing += 1;
      continue;
    }
    try {
      await rest('ai_tasks', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          organization_id: item.agent.organization_id || null,
          agent_id: item.agent.id,
          title: item.title,
          description: item.description,
          status: 'todo',
          priority: 'normal',
          due_at: new Date(Date.now() + 20 * 60 * 60 * 1000).toISOString()
        })
      });
      created += 1;
      existingTitles.add(item.title);
    } catch (_) {
      /* ignore race */
    }
  }

  return {
    agents_enabled: enabled.map(a => ({ id: a.id, slug: a.slug, name: a.name })),
    tasks_created: created,
    tasks_existing: existing
  };
}
