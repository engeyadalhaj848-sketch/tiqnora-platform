-- Tiqnora integrations registry. Secrets remain in Vercel, never in the database.
create table if not exists public.integration_connections (
 id uuid primary key default gen_random_uuid(),
 provider text not null check (provider in ('openai','anthropic','google_ai','resend','stripe','whop','smsa','saudi_post','meta','linkedin','tiktok','vapi','retell')),
 display_name text not null,
 enabled boolean not null default false,
 mode text not null default 'sandbox' check (mode in ('sandbox','production')),
 status text not null default 'not_configured' check (status in ('not_configured','connected','error','disabled')),
 metadata jsonb not null default '{}'::jsonb,
 last_checked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(provider)
);
alter table public.integration_connections enable row level security;
drop policy if exists "owners manage integration registry" on public.integration_connections;
create policy "owners manage integration registry" on public.integration_connections for all using (public.is_admin()) with check (public.is_admin());
insert into public.integration_connections (provider, display_name) values ('openai','OpenAI'),('anthropic','Anthropic'),('google_ai','Google AI'),('resend','Resend'),('stripe','Stripe'),('whop','Whop'),('smsa','SMSA Express'),('saudi_post','Saudi Post'),('meta','Meta'),('linkedin','LinkedIn'),('tiktok','TikTok'),('vapi','Vapi'),('retell','Retell') on conflict (provider) do nothing;
