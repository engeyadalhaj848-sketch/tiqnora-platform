import {
  listYCloudTemplates,
  sendYCloudTemplateMessage
} from '../integrations/ycloud-templates.js';

const SUPABASE_URL=(process.env.SUPABASE_URL||'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/,'');
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';

function headers(){
  if(!SERVICE) throw Object.assign(new Error('SUPABASE_SERVICE_ROLE_KEY missing'),{status:503});
  return {apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json'};
}

async function rest(path,{method='GET',body=null,prefer=null}={}){
  const h=headers();
  if(prefer) h.Prefer=prefer;
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    method,headers:h,...(body==null?{}:{body:JSON.stringify(body)})
  });
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw Object.assign(new Error(data?.message||data?.hint||`Supabase ${r.status}`),{status:r.status});
  return data;
}

function normalizeE164(value){
  const raw=String(value||'').trim();
  if(!raw) return '';
  const cleaned=raw.replace(/[^+\d]/g,'');
  if(/^\+[1-9]\d{6,14}$/.test(cleaned)) return cleaned;
  if(/^966\d{9}$/.test(cleaned)) return '+'+cleaned;
  if(/^05\d{8}$/.test(cleaned)) return '+966'+cleaned.slice(1);
  return '';
}

function dayRiyadh(){
  return new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'});
}

function dayStartUtc(day){
  return new Date(`${day}T00:00:00+03:00`).toISOString();
}

function templateForLead(lead){
  const hay=[lead.industry,lead.interest,lead.company_name,lead.company,lead.notes]
    .map(v=>String(v||'').toLowerCase()).join(' ');
  if(/كهرب|انارة|إنارة|كيبل|electrical/.test(hay)) return 'tiqnora_electrical_intro_ar';
  if(/بناء|خرسان|سباك|construction|building/.test(hay)) return 'tiqnora_building_intro_ar';
  return null;
}

async function organization(){
  const rows=await rest('organizations?slug=eq.tiqnora&select=id,settings&limit=1');
  if(!rows?.[0]) throw Object.assign(new Error('tiqnora_organization_missing'),{status:409});
  return rows[0];
}

async function activeYCloudConnection(orgId){
  const rows=await rest(
    `social_connections?organization_id=eq.${encodeURIComponent(orgId)}&platform=eq.whatsapp&status=eq.active&select=*&order=updated_at.desc&limit=10`
  );
  return (rows||[]).find(row=>
    row?.settings?.provider==='ycloud' &&
    row?.settings?.ycloud_verified===true &&
    row?.settings?.webhook_subscribed===true &&
    row?.capabilities?.messaging===true &&
    row?.settings?.waba_id
  )||null;
}

async function alreadyContactedToday(orgId,day){
  const rows=await rest(
    `crm_activities?organization_id=eq.${encodeURIComponent(orgId)}&created_at=gte.${encodeURIComponent(dayStartUtc(day))}&select=lead_id,metadata&limit=500`
  ).catch(()=>[]);
  return new Set((rows||[])
    .filter(row=>row?.metadata?.kind==='whatsapp_template_sent')
    .map(row=>String(row.lead_id||'')).filter(Boolean));
}

async function ensureConversation({orgId,lead,recipient}){
  const rows=await rest(
    `conversations?organization_id=eq.${encodeURIComponent(orgId)}&platform=eq.whatsapp&lead_id=eq.${encodeURIComponent(lead.id)}&select=*&order=updated_at.desc&limit=1`
  ).catch(()=>[]);
  if(rows?.[0]) return rows[0];
  const created=await rest('conversations',{
    method:'POST',
    prefer:'return=representation',
    body:{
      organization_id:orgId,
      platform:'whatsapp',
      external_thread_id:`whatsapp:${recipient}`,
      lead_id:lead.id,
      assigned_agent:'sales',
      intent:'sales',
      priority:'high',
      status:'open',
      last_message_at:new Date().toISOString(),
      unread_count:0,
      metadata:{provider:'ycloud',source:'scheduled_opt_in_template_outreach'}
    }
  });
  return Array.isArray(created)?created[0]:created;
}

async function persistSend({orgId,connection,lead,recipient,templateName,apiResult}){
  const now=new Date().toISOString();
  const externalId=String(apiResult?.wamid||apiResult?.id||'').trim();
  const conversation=await ensureConversation({orgId,lead,recipient});

  const events=await rest('social_events?on_conflict=platform,external_event_id',{
    method:'POST',
    prefer:'resolution=ignore-duplicates,return=representation',
    body:{
      organization_id:orgId,
      connection_id:connection.id,
      platform:'whatsapp',
      event_type:'message.sent',
      external_event_id:externalId,
      author_external_id:'tiqnora',
      author_name:'Tiqnora',
      content:`[template:${templateName}]`,
      occurred_at:now,
      processing_status:'processed',
      lead_id:lead.id,
      contact_id:lead.contact_id||null,
      conversation_id:conversation?.id||null,
      raw_payload:{
        adapter:'tiqnora_outbound',
        provider:'ycloud',
        mode:'template',
        scheduled:true,
        user_authorized:true,
        template_name:templateName,
        status:apiResult?.status||'accepted'
      }
    }
  }).catch(()=>[]);
  const event=Array.isArray(events)?events[0]:events;

  await rest('crm_activities',{
    method:'POST',
    prefer:'return=minimal',
    body:{
      organization_id:orgId,
      lead_id:lead.id,
      activity_type:'system',
      title:'تم إرسال قالب WhatsApp معتمد تلقائيًا',
      body:templateName,
      metadata:{
        kind:'whatsapp_template_sent',
        provider:'ycloud',
        template_name:templateName,
        outbound_external_id:externalId,
        scheduled:true,
        user_authorized:true,
        sales_agent:'sales'
      }
    }
  }).catch(()=>null);

  await rest(`leads?id=eq.${encodeURIComponent(lead.id)}`,{
    method:'PATCH',
    prefer:'return=minimal',
    body:{last_contact_at:now,next_followup_at:new Date(Date.now()+2*24*60*60*1000).toISOString(),assigned_agent:'sales',updated_at:now}
  }).catch(()=>null);

  if(event?.id){
    await rest('social_event_actions',{
      method:'POST',
      prefer:'return=minimal',
      body:{
        organization_id:orgId,
        event_id:event.id,
        action_type:'template_send',
        status:'completed',
        result:{
          provider:'ycloud',
          template_name:templateName,
          to:recipient,
          outbound_external_id:externalId,
          scheduled:true,
          user_authorized:true,
          sales_agent:'sales'
        },
        completed_at:now
      }
    }).catch(()=>null);
  }

  return {external_id:externalId,event_id:event?.id||null};
}

export async function runMorningWhatsAppOutreach({force=false}={}){
  const org=await organization();
  const cfg=org.settings?.whatsapp_outreach||{};
  if(cfg.enabled!==true && !force){
    return {ok:true,enabled:false,sent:0,reason:'disabled'};
  }

  const connection=await activeYCloudConnection(org.id);
  if(!connection){
    return {ok:false,enabled:true,sent:0,reason:'ycloud_not_connected'};
  }

  const liveTemplates=await listYCloudTemplates(connection.settings.waba_id);
  const approved=new Set((liveTemplates||[])
    .filter(t=>String(t.status||'').toUpperCase()==='APPROVED')
    .map(t=>t.name));
  const allowed=new Set(['tiqnora_building_intro_ar','tiqnora_electrical_intro_ar']);
  const maxPerDay=Math.max(1,Math.min(25,Number(cfg.max_per_day)||10));
  const day=dayRiyadh();
  const contacted=await alreadyContactedToday(org.id,day);

  const leads=await rest(
    `leads?organization_id=eq.${encodeURIComponent(org.id)}&select=id,name,company,company_name,contact_name,phone,whatsapp,contact_id,industry,interest,status,notes,lead_score,opportunity_score,custom_fields&order=opportunity_score.desc.nullslast,lead_score.desc.nullslast,created_at.asc&limit=200`
  ).catch(()=>[]);

  const eligible=[];
  const skipped={no_opt_in:0,no_phone:0,unsupported_industry:0,already_contacted:0,template_unapproved:0};
  for(const lead of leads||[]){
    const optedIn=lead?.custom_fields?.whatsapp_opt_in===true || String(lead?.custom_fields?.whatsapp_opt_in||'').toLowerCase()==='true';
    if(!optedIn){ skipped.no_opt_in+=1; continue; }
    const recipient=normalizeE164(lead.whatsapp||lead.phone);
    if(!recipient){ skipped.no_phone+=1; continue; }
    if(contacted.has(String(lead.id))){ skipped.already_contacted+=1; continue; }
    const template=templateForLead(lead);
    if(!template || !allowed.has(template)){ skipped.unsupported_industry+=1; continue; }
    if(!approved.has(template)){ skipped.template_unapproved+=1; continue; }
    eligible.push({lead,recipient,template});
    if(eligible.length>=maxPerDay) break;
  }

  const from=normalizeE164(connection.external_account_id);
  if(!from) return {ok:false,enabled:true,sent:0,reason:'sender_invalid',skipped};

  const results=[];
  for(const item of eligible){
    const companyName=String(item.lead.company_name||item.lead.company||item.lead.contact_name||item.lead.name||'المنشأة').slice(0,120);
    try{
      const apiResult=await sendYCloudTemplateMessage({
        from,
        to:item.recipient,
        name:item.template,
        language:'ar',
        components:[{type:'body',parameters:[{type:'text',text:companyName}]}]
      });
      const externalId=String(apiResult?.wamid||apiResult?.id||'').trim();
      if(!externalId) throw new Error('YCloud accepted the request without a message ID.');
      const persisted=await persistSend({
        orgId:org.id,connection,lead:item.lead,recipient:item.recipient,
        templateName:item.template,apiResult
      });
      results.push({lead_id:item.lead.id,template:item.template,status:'sent',...persisted});
    }catch(error){
      results.push({lead_id:item.lead.id,template:item.template,status:'failed',error:String(error.message||error).slice(0,300)});
    }
  }

  return {
    ok:true,
    enabled:true,
    day,
    max_per_day:maxPerDay,
    eligible:eligible.length,
    sent:results.filter(x=>x.status==='sent').length,
    failed:results.filter(x=>x.status==='failed').length,
    skipped,
    results
  };
}

export default {runMorningWhatsAppOutreach};
