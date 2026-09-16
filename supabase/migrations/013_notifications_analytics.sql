-- Phase 3: notifications foundation
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  audience text not null default 'user' check (audience in ('user','admin','both')),
  type text not null,
  title_ar text not null,
  body_ar text,
  link text,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user_unread on public.notifications(user_id, created_at desc) where read_at is null;
create index if not exists idx_notifications_audience on public.notifications(audience, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_own_read" on public.notifications;
create policy "notifications_own_read" on public.notifications for select
  using (
    public.is_admin()
    or (user_id = auth.uid())
    or (audience = 'admin' and public.is_admin())
  );

drop policy if exists "notifications_own_update" on public.notifications;
create policy "notifications_own_update" on public.notifications for update
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "notifications_insert_self_or_admin" on public.notifications;
create policy "notifications_insert_insert" on public.notifications for insert
  with check (public.is_admin() or user_id = auth.uid());

-- Helper to notify
create or replace function public.notify_user(
  p_user_id uuid,
  p_org_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_link text default null,
  p_audience text default 'user'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare nid uuid;
begin
  insert into public.notifications (user_id, organization_id, audience, type, title_ar, body_ar, link)
  values (p_user_id, p_org_id, coalesce(p_audience,'user'), p_type, p_title, p_body, p_link)
  returning id into nid;
  return nid;
end;
$$;
grant execute on function public.notify_user(uuid, uuid, text, text, text, text, text) to authenticated;

-- Hook: after service request insert notify admins (via trigger on service_requests)
create or replace function public.trg_service_request_notify()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, organization_id, audience, type, title_ar, body_ar, link, metadata)
  select p.id, new.organization_id, 'admin', 'service_request',
    'طلب خدمة جديد',
    coalesce(new.title, 'طلب خدمة'),
    '/admin#service-requests',
    jsonb_build_object('request_id', new.id, 'category', new.category)
  from public.profiles p
  where p.role in ('admin','super_admin') and p.is_active = true;
  if new.user_id is not null then
    insert into public.notifications (user_id, organization_id, audience, type, title_ar, body_ar, link)
    values (new.user_id, new.organization_id, 'user', 'service_request_ack',
      'تم استلام طلبك', coalesce(new.title,''), '/customer#services');
  end if;
  return new;
end;
$$;
drop trigger if exists service_request_notify on public.service_requests;
create trigger service_request_notify after insert on public.service_requests
  for each row execute function public.trg_service_request_notify();

-- Hook: subscription event notify
create or replace function public.trg_subscription_event_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if new.event_type in ('payment_pending','upgraded','downgraded','canceled') then
    select user_id into uid from public.organization_members
    where organization_id = new.organization_id and role = 'owner' limit 1;
    if uid is not null then
      insert into public.notifications (user_id, organization_id, audience, type, title_ar, body_ar, link, metadata)
      values (uid, new.organization_id, 'user', 'subscription_'||new.event_type,
        case new.event_type
          when 'payment_pending' then 'طلب ترقية مسجّل'
          when 'upgraded' then 'تم ترقية اشتراكك'
          when 'downgraded' then 'تم تغيير خطتك'
          when 'canceled' then 'تم إلغاء الاشتراك'
          else 'تحديث الاشتراك' end,
        coalesce(new.note,''), '/customer#plans',
        jsonb_build_object('event_id', new.id, 'event_type', new.event_type));
    end if;
    insert into public.notifications (user_id, organization_id, audience, type, title_ar, body_ar, link)
    select p.id, new.organization_id, 'admin', 'subscription_'||new.event_type,
      'حدث اشتراك: '||new.event_type, coalesce(new.note,''), '/admin#saas'
    from public.profiles p where p.role in ('admin','super_admin') and p.is_active;
  end if;
  return new;
end;
$$;
drop trigger if exists subscription_event_notify on public.subscription_events;
create trigger subscription_event_notify after insert on public.subscription_events
  for each row execute function public.trg_subscription_event_notify();
