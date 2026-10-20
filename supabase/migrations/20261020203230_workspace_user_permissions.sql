-- Per-user overrides and role inheritance; verified email membership remains authoritative.
CREATE OR REPLACE FUNCTION public.rose_context(target uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ag record;roledata jsonb;perms text[];uid uuid:=auth.uid();mail text;
begin
 if uid is null then return null;end if;
 target:=coalesce(target,uid);
 perms:=array['conversations.read','conversations.write','contacts.read','contacts.write','campaigns.read','campaigns.write','workflows.read','workflows.write','reports.read','settings.read','settings.write','knowledge.read','knowledge.write'];
 if target=uid then return jsonb_build_object('owner',uid,'isOwner',true,'agentId','self','permissions',perms);end if;
 select lower(email) into mail from auth.users where id=uid and email_confirmed_at is not null;
 select id,data::jsonb as body into ag from public.rose_records where owner=target and kind='agent' and lower(data::jsonb->>'email')=mail and coalesce(data::jsonb->>'archived','false')<>'true' and coalesce(data::jsonb->>'enabled','')<>'معطّل' limit 1;
 if not found then return null;end if;
 if coalesce(ag.body->>'roleId','')<>'' then
 select data::jsonb into roledata from public.rose_records where owner=target and id=ag.body->>'roleId' and kind='role' and coalesce(data::jsonb->>'archived','false')<>'true';
 if not found then return null;end if;
 perms:=string_to_array(roledata->>'permissions',',');
 elsif ag.body->>'systemRole'='مشاهد' then
 perms:=array['conversations.read','contacts.read','campaigns.read','workflows.read','reports.read','settings.read','knowledge.read'];
 elsif coalesce(ag.body->>'systemRole','')<>'مدير' then
 perms:=array['conversations.read','conversations.write','contacts.read','contacts.write','knowledge.read','reports.read'];
 end if;
 if ag.body->>'permissionMode'='مخصصة' then
 perms:=string_to_array(coalesce(ag.body->>'permissions',''),',');
 end if;
 select coalesce(array_agg(trim(p)),array[]::text[]) into perms from unnest(perms) p
 where trim(p)=any(array['conversations.read','conversations.write','contacts.read','contacts.write','campaigns.read','campaigns.write','workflows.read','workflows.write','reports.read','settings.read','settings.write','knowledge.read','knowledge.write']);
 return jsonb_build_object('owner',target,'isOwner',false,'agentId',ag.id,'permissions',coalesce(perms,array[]::text[]));
end;$function$;

CREATE SCHEMA IF NOT EXISTS tiqnora_permissions;
REVOKE ALL ON SCHEMA tiqnora_permissions FROM PUBLIC;
GRANT USAGE ON SCHEMA tiqnora_permissions TO authenticated;

CREATE FUNCTION tiqnora_permissions.social_context(p_permission text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE root uuid; org uuid; ctx jsonb;
BEGIN
 IF auth.uid() IS NULL OR p_permission NOT IN ('conversations.read','conversations.write') THEN RETURN NULL; END IF;
 SELECT id INTO root FROM auth.users WHERE lower(email)='eng.eyadalhaj848@gmail.com' AND email_confirmed_at IS NOT NULL;
 IF root IS NULL THEN RETURN NULL; END IF;
 ctx:=public.rose_context(root);
 IF ctx IS NULL OR NOT (ctx->'permissions') ? 'conversations.read' OR NOT (ctx->'permissions') ? p_permission THEN RETURN NULL; END IF;
 IF p_permission='conversations.write' AND NOT EXISTS (SELECT 1 FROM public.rose_subscriptions s WHERE s.owner=root AND s.status<>'suspended' AND s.expires_at>now()) THEN RETURN NULL; END IF;
 SELECT id INTO org FROM public.organizations WHERE slug='tiqnora';
 IF org IS NULL THEN RETURN NULL; END IF;
 RETURN ctx || jsonb_build_object('organizationId',org);
END $$;
REVOKE ALL ON FUNCTION tiqnora_permissions.social_context(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION tiqnora_permissions.social_context(text) TO authenticated;

CREATE FUNCTION public.rose_social_context(p_permission text DEFAULT 'conversations.read')
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT tiqnora_permissions.social_context(p_permission); $$;
REVOKE ALL ON FUNCTION public.rose_social_context(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rose_social_context(text) TO authenticated;

-- Return only channel-directory fields, never settings, tokens or vault data.
CREATE FUNCTION tiqnora_permissions.channel_directory()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'platform',c.platform,
 'external_account_id',c.external_account_id,'account_name',c.account_name,
 'status',c.status,'capabilities',c.capabilities,'connected_at',c.connected_at)),'[]'::jsonb)
 FROM public.social_connections c WHERE c.organization_id=(tiqnora_permissions.social_context('conversations.read')->>'organizationId')::uuid;
$$;
REVOKE ALL ON FUNCTION tiqnora_permissions.channel_directory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION tiqnora_permissions.channel_directory() TO authenticated;
CREATE FUNCTION public.rose_channel_directory()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT tiqnora_permissions.channel_directory(); $$;
REVOKE ALL ON FUNCTION public.rose_channel_directory() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rose_channel_directory() TO authenticated;

-- Keep authorizations owner-only: staff need channel capabilities, not OAuth metadata.
CREATE POLICY social_events_workspace_read ON public.social_events FOR SELECT TO authenticated
 USING (organization_id=(public.rose_social_context('conversations.read')->>'organizationId')::uuid);
CREATE POLICY organizations_chat_workspace_read ON public.organizations FOR SELECT TO authenticated
 USING (id=(public.rose_social_context('conversations.read')->>'organizationId')::uuid);

CREATE POLICY rose_telegram_bots_team_read ON public.rose_telegram_bots FOR SELECT TO authenticated
 USING (owner=(public.rose_social_context('conversations.read')->>'owner')::uuid);
CREATE POLICY rose_telegram_events_team_read ON public.rose_telegram_events FOR SELECT TO authenticated
 USING (owner=(public.rose_social_context('conversations.read')->>'owner')::uuid);

DROP POLICY rose_social_threads_read ON public.rose_social_threads;
CREATE POLICY rose_social_threads_read ON public.rose_social_threads FOR SELECT TO authenticated
 USING(owner=(public.rose_social_context('conversations.read')->>'owner')::uuid);
DROP POLICY rose_social_threads_write ON public.rose_social_threads;
CREATE POLICY rose_social_threads_write ON public.rose_social_threads FOR INSERT TO authenticated
 WITH CHECK(owner=(public.rose_social_context('conversations.write')->>'owner')::uuid);
DROP POLICY rose_social_notes_read ON public.rose_social_notes;
CREATE POLICY rose_social_notes_read ON public.rose_social_notes FOR SELECT TO authenticated
 USING(owner=(public.rose_social_context('conversations.read')->>'owner')::uuid);
DROP POLICY rose_social_notes_write ON public.rose_social_notes;
CREATE POLICY rose_social_notes_write ON public.rose_social_notes FOR INSERT TO authenticated
 WITH CHECK(owner=(public.rose_social_context('conversations.write')->>'owner')::uuid);
DROP POLICY rose_social_threads_update ON public.rose_social_threads;
CREATE POLICY rose_social_threads_update ON public.rose_social_threads FOR UPDATE TO authenticated
 USING(owner=(public.rose_social_context('conversations.write')->>'owner')::uuid)
 WITH CHECK(owner=(public.rose_social_context('conversations.write')->>'owner')::uuid);
CREATE OR REPLACE FUNCTION public.rose_manage_thread(p_key text, p_action text, p_status text DEFAULT NULL::text, p_assigned boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin
if auth.uid() is null or public.rose_social_context('conversations.write') is null or length(p_key)>600 or length(p_key)=0 then raise exception 'Forbidden';end if;
if p_action not in ('status','assign') or (p_action='status' and (p_status is null or p_status not in ('open','resolved'))) or (p_action='assign' and p_assigned is null) then raise exception 'Invalid action';end if;
insert into public.rose_social_threads(owner,thread_key,status,assigned,updated_at) values((public.rose_social_context('conversations.write')->>'owner')::uuid,p_key,case when p_action='status' then p_status else 'open' end,case when p_action='assign' then p_assigned else false end,now())
on conflict(owner,thread_key) do update set status=case when p_action='status' then excluded.status else public.rose_social_threads.status end,assigned=case when p_action='assign' then excluded.assigned else public.rose_social_threads.assigned end,updated_at=now();end;$function$;

CREATE OR REPLACE FUNCTION public.rose_set_thread_status(p_key text, p_status text, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin
if auth.uid() is null or public.rose_social_context('conversations.write') is null then raise exception 'Forbidden';end if;
if p_key is null or length(p_key) not between 1 and 600 or p_status not in ('open','pending','snoozed','resolved') or (p_status='snoozed' and (p_until is null or p_until<=now() or p_until>now()+interval '30 days')) then raise exception 'Invalid status';end if;
insert into public.rose_social_threads(owner,thread_key,status,assigned,snoozed_until,updated_at) values((public.rose_social_context('conversations.write')->>'owner')::uuid,p_key,p_status,false,case when p_status='snoozed' then p_until else null end,now()) on conflict(owner,thread_key) do update set status=excluded.status,snoozed_until=excluded.snoozed_until,updated_at=now();end;$function$;

CREATE OR REPLACE FUNCTION public.rose_update_thread_details(p_key text, p_patch jsonb, p_version integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin
if auth.uid() is null or public.rose_social_context('conversations.write') is null then raise exception 'Forbidden';end if;
if p_key is null or length(p_key) not between 1 and 600 or jsonb_typeof(p_patch)<>'object' or octet_length(p_patch::text)>6000 or p_version<0 or exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('priority','tags','teamId','contactId','followUpAt')) then raise exception 'Invalid details';end if;
insert into public.rose_social_threads(owner,thread_key,status,assigned,details,details_version,updated_at) values((public.rose_social_context('conversations.write')->>'owner')::uuid,p_key,'open',false,p_patch,1,now()) on conflict(owner,thread_key) do update set details=public.rose_social_threads.details||p_patch,details_version=public.rose_social_threads.details_version+1,updated_at=now() where public.rose_social_threads.details_version=p_version;
if not found then raise exception 'Details conflict';end if;
end;$function$;

CREATE OR REPLACE FUNCTION public.rose_can_record(target uuid, k text, payload text, writing boolean, creating boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ctx jsonb;d jsonb:=payload::jsonb;cat text;perm text;agent text;
begin
 ctx:=public.rose_context(target);if ctx is null then return false;end if;
 if (ctx->>'isOwner')::boolean then return true;end if;
 agent:=ctx->>'agentId';
 if k='profile' then return d->>'userId'=auth.uid()::text;end if;
 if k='presence' then return not writing or d->>'userId'=auth.uid()::text;end if;
 if k='notification' then return (not writing and (d->>'agentId' in (agent,'all'))) or (writing and (ctx->'permissions') ? 'conversations.write');end if;
 if k='audit' and writing then return creating and d->>'actorId'=auth.uid()::text;end if;
 if writing and k in ('agent','role','account','integration') then return false;end if;
 if not writing and k in ('team','inbox','label','canned','closing','attribute','agent','role') and (ctx->'permissions') ? 'conversations.read' then return true;end if;
 cat:=case when k in ('conversation','message','rating','task','file') then 'conversations' when k in ('contact','segment') then 'contacts' when k in ('campaign','template','delivery') then 'campaigns' when k in ('workflow','run') then 'workflows' when k in ('knowledge','assistant') then 'knowledge' when k='audit' then 'reports' else 'settings' end;
 perm:=cat||case when writing then '.write' else '.read' end;
 return (ctx->'permissions') ? perm and (not writing or (ctx->'permissions') ? (cat||'.read'));
end;$function$;

CREATE FUNCTION tiqnora_permissions.can_read_event(e public.social_events)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $$
DECLARE ctx jsonb;peer text;
BEGIN
 ctx:=tiqnora_permissions.social_context('conversations.read');
 IF ctx IS NULL OR e.organization_id IS DISTINCT FROM (ctx->>'organizationId')::uuid THEN RETURN false; END IF;
 IF e.platform<>'whatsapp' THEN RETURN true; END IF;
 peer:=regexp_replace(coalesce(case when lower(e.author_external_id)='tiqnora' then e.raw_payload#>>'{message,to}' else e.author_external_id end,''),'[^0-9]','','g');
 RETURN NOT EXISTS(
 SELECT 1 FROM public.conversations c
 WHERE c.organization_id=e.organization_id AND c.platform='whatsapp'
 AND c.metadata @> '{"private_excluded":true}'::jsonb
 AND (c.id=e.conversation_id OR c.external_thread_id='dm:+'||peer OR
 (peer<>'' AND peer=regexp_replace(coalesce(c.metadata->>'external_user_id',''),'[^0-9]','','g'))));
END $$;
REVOKE ALL ON FUNCTION tiqnora_permissions.can_read_event(public.social_events) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION tiqnora_permissions.can_read_event(public.social_events) TO authenticated;
DROP POLICY social_events_workspace_read ON public.social_events;
CREATE POLICY social_events_workspace_read ON public.social_events FOR SELECT TO authenticated
 USING (tiqnora_permissions.can_read_event(social_events));

