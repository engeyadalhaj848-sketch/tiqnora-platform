-- TIQNORA 037 — Whop sandbox payments (no auto fulfillment)
-- Extends orders for provider payment fields + webhook idempotency.

alter table public.orders
  add column if not exists payment_provider text,
  add column if not exists provider_payment_id text,
  add column if not exists provider_checkout_id text,
  add column if not exists provider_plan_id text,
  add column if not exists currency text default 'SAR',
  add column if not exists customer_email text,
  add column if not exists shipping_postal_code text,
  add column if not exists shipping_country text default 'SA',
  add column if not exists pricing_review_required boolean not null default false,
  add column if not exists payment_meta jsonb not null default '{}'::jsonb;

create index if not exists idx_orders_provider_payment
  on public.orders (payment_provider, provider_payment_id);
create index if not exists idx_orders_provider_checkout
  on public.orders (provider_checkout_id);

-- Idempotent webhook log (store webhook-id once)
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'whop',
  event_id text not null,
  event_type text,
  order_id uuid references public.orders(id) on delete set null,
  payload_summary jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index if not exists idx_pwe_order on public.payment_webhook_events(order_id);

alter table public.payment_webhook_events enable row level security;

drop policy if exists "payment_webhook_events_admin" on public.payment_webhook_events;
create policy "payment_webhook_events_admin" on public.payment_webhook_events
  for all using (public.is_admin()) with check (public.is_admin());

-- Register Whop in payment_providers if table exists
insert into public.payment_providers (slug, display_name, enabled, mode, config)
select 'whop', 'Whop', false, 'sandbox',
  '{"env_keys":["WHOP_API_KEY","WHOP_ACCOUNT_ID","WHOP_WEBHOOK_SECRET","WHOP_CURRENCY"],"checkout":"embedded","note":"Enable after sandbox tests"}'::jsonb
where exists (select 1 from information_schema.tables where table_schema='public' and table_name='payment_providers')
  and not exists (select 1 from public.payment_providers where slug = 'whop');

comment on table public.payment_webhook_events is 'Idempotency log for payment webhooks; service-role writes only';
