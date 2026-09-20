-- Admin performance indexes (safe IF NOT EXISTS)
-- Run manually in Supabase SQL Editor after review.

create index if not exists idx_orders_created_at_desc
  on public.orders (created_at desc);

create index if not exists idx_orders_status_created
  on public.orders (status, created_at desc);

create index if not exists idx_orders_payment_status
  on public.orders (payment_status);

create index if not exists idx_profiles_role
  on public.profiles (role);

create index if not exists idx_leads_created_at
  on public.leads (created_at desc);

create index if not exists idx_service_requests_status_created
  on public.service_requests (status, created_at desc);

create index if not exists idx_notifications_admin_unread
  on public.notifications (audience, read_at)
  where audience = 'admin';

create index if not exists idx_subscriptions_status
  on public.subscriptions (status);

create index if not exists idx_products_admin_filters
  on public.products (is_active, sort_order);

create index if not exists idx_social_events_received
  on public.social_events (received_at desc);
