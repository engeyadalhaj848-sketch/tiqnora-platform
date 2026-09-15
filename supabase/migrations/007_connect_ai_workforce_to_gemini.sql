-- Route Tiqnora's internal AI workforce through Google Gemini.
-- Existing role-specific system prompts and temperatures remain unchanged.
update public.ai_agents
set provider = 'google_ai',
    model = 'gemini-3.6-flash',
    api_ready = true,
    status = 'active',
    is_enabled = true,
    updated_at = now()
where slug in ('marketing', 'content', 'social-media', 'developer');
