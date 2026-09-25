-- Realtime admin notifications for inbound social messages/comments.

create or replace function public.trg_social_event_notify_admins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_body text;
begin
  if new.event_type not in ('message.received','comment.created') then
    return new;
  end if;

  if new.platform not in ('whatsapp','instagram','facebook','tiktok','linkedin') then
    return new;
  end if;

  v_title := case
    when new.event_type = 'message.received' then
      case new.platform
        when 'whatsapp' then 'رسالة واتساب جديدة'
        when 'instagram' then 'رسالة إنستغرام جديدة'
        when 'facebook' then 'رسالة فيسبوك جديدة'
        when 'tiktok' then 'رسالة TikTok جديدة'
        when 'linkedin' then 'رسالة LinkedIn جديدة'
        else 'رسالة جديدة'
      end
    else
      case new.platform
        when 'instagram' then 'تعليق إنستغرام جديد'
        when 'facebook' then 'تعليق فيسبوك جديد'
        when 'tiktok' then 'تعليق TikTok جديد'
        when 'linkedin' then 'تعليق LinkedIn جديد'
        else 'تعليق جديد'
      end
  end;

  v_body := concat(
    coalesce(nullif(new.author_name,''), 'عميل'),
    ': ',
    left(coalesce(new.content,''), 180)
  );

  insert into public.notifications
    (user_id, organization_id, audience, type, title_ar, body_ar, link, metadata)
  select
    p.id,
    new.organization_id,
    'admin',
    'social_' || replace(new.event_type,'.','_'),
    v_title,
    v_body,
    '/admin#social-inbox',
    jsonb_build_object(
      'social_event_id', new.id,
      'platform', new.platform,
      'event_type', new.event_type,
      'author_name', new.author_name
    )
  from public.profiles p
  where p.role in ('admin','super_admin')
    and p.is_active = true
    and not exists (
      select 1
      from public.notifications n
      where n.user_id = p.id
        and n.metadata->>'social_event_id' = new.id::text
    );

  return new;
end;
$$;

drop trigger if exists social_event_notify_admins on public.social_events;
create trigger social_event_notify_admins
after insert on public.social_events
for each row execute function public.trg_social_event_notify_admins();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
