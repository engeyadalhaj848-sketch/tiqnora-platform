import { createDecipheriv } from 'node:crypto';
import {
  createCampaign,
  generateContentIdeas,
  generateContentDraft,
  adaptToChannels,
  generateCreativeBrief,
  canPublish
} from './social-studio.js';

const SUPABASE_URL=(process.env.SUPABASE_URL||'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/,'');
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const ANON=process.env.SUPABASE_ANON_KEY||'';

export const MCP_SOCIAL_TOOL_DEFS=[
  {name:'social.create_draft',description:'Create an approval-gated Tiqnora social draft.',inputSchema:{type:'object',properties:{campaign:{type:'object'},idea:{type:'object'},brand_profile:{type:'object'}}}},
  {name:'social.create_variants',description:'Adapt an existing draft for selected social channels.',inputSchema:{type:'object',required:['draft'],properties:{draft:{type:'object'},platforms:{type:'array',items:{type:'string'}},brand_profile:{type:'object'}}}},
  {name:'social.create_creative_brief',description:'Create a brand-safe visual creative brief.',inputSchema:{type:'object',required:['draft'],properties:{draft:{type:'object'},platform:{type:'string'},brand_profile:{type:'object'}}}},
  {name:'social.publish',description:'Publish persisted, human-approved Tiqnora content or queue it for the scheduled delivery window.',inputSchema:{type:'object',properties:{content_id:{type:'string'},variant_id:{type:'string'},organization_id:{type:'string'},platform:{type:'string'},scheduled_at:{type:'string'},image_url:{type:'string'}}}},
  {name:'social.status',description:'Return Tiqnora social bridge capability/status.',inputSchema:{type:'object',properties:{}}}
];

function headers(token, service=false){
  const key=service?SERVICE:(ANON||SERVICE);
  const bearer=service?SERVICE:token;
  if(!key||!bearer) throw Object.assign(new Error('server_not_configured'),{status:503});
  return {apikey:key,Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'};
}

async function request(path,{method='GET',body=null,token='',service=false,prefer=null}={}){
  const h=headers(token,service);
  if(prefer) h.Prefer=prefer;
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers:h,...(body==null?{}:{body:JSON.stringify(body)})});
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw Object.assign(new Error(data?.message||data?.hint||`Supabase ${r.status}`),{status:r.status});
  return data;
}

function decrypt(ciphertext,iv,tag){
  const key=Buffer.from(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY||'','base64');
  if(key.length!==32) throw Object.assign(new Error('SOCIAL_TOKEN_ENCRYPTION_KEY invalid'),{status:503});
  const d=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));
  d.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([d.update(Buffer.from(ciphertext,'base64url')),d.final()]).toString();
}

async function resolveOrganization(requestedId,admin){
  if(!admin?.user?.id) throw Object.assign(new Error('admin_auth_required'),{status:401});
  if(requestedId){
    const rows=await request(
      `organization_members?organization_id=eq.${encodeURIComponent(requestedId)}&user_id=eq.${encodeURIComponent(admin.user.id)}&select=organization_id&limit=1`,
      {service:true}
    );
    if(rows?.[0]?.organization_id) return String(rows[0].organization_id);
    const profiles=await request(
      `profiles?id=eq.${encodeURIComponent(admin.user.id)}&default_organization_id=eq.${encodeURIComponent(requestedId)}&select=default_organization_id&limit=1`,
      {service:true}
    );
    if(profiles?.[0]?.default_organization_id) return String(profiles[0].default_organization_id);
    throw Object.assign(new Error('organization_access_denied'),{status:403});
  }
  const profiles=await request(
    `profiles?id=eq.${encodeURIComponent(admin.user.id)}&select=default_organization_id&limit=1`,
    {service:true}
  );
  if(profiles?.[0]?.default_organization_id) return String(profiles[0].default_organization_id);
  const orgs=await request('organizations?slug=eq.tiqnora&select=id&limit=1',{service:true});
  if(orgs?.[0]?.id) return String(orgs[0].id);
  throw Object.assign(new Error('organization_missing'),{status:409});
}

async function loadPersistedContent({organizationId,contentId,variantId}){
  if(variantId){
    const variants=await request(
      `content_variants?id=eq.${encodeURIComponent(variantId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=*&limit=1`,
      {service:true}
    );
    const variant=variants?.[0];
    if(!variant) throw Object.assign(new Error('variant_not_found'),{status:404});
    const items=await request(
      `content_items?id=eq.${encodeURIComponent(variant.content_id)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=*&limit=1`,
      {service:true}
    );
    const item=items?.[0];
    if(!item) throw Object.assign(new Error('content_not_found'),{status:404});
    return {
      item,
      variant,
      publishable:{...item,...variant,status:item.status,platform:variant.platform||item.platform},
      contentId:item.id,
      variantId:variant.id
    };
  }
  if(contentId){
    const items=await request(
      `content_items?id=eq.${encodeURIComponent(contentId)}&organization_id=eq.${encodeURIComponent(organizationId)}&select=*&limit=1`,
      {service:true}
    );
    const item=items?.[0];
    if(!item) throw Object.assign(new Error('content_not_found'),{status:404});
    return {item,variant:null,publishable:item,contentId:item.id,variantId:null};
  }
  throw Object.assign(new Error('persisted_content_required'),{status:400});
}

async function graphPost(path,token,payload){
  const u=new URL(`https://graph.facebook.com/v22.0/${path}`);
  u.searchParams.set('access_token',token);
  const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.error) throw Object.assign(new Error(d?.error?.message||`Meta ${r.status}`),{status:r.status});
  return d;
}

async function loadText(job){
  if(job.variant_id){
    const rows=await request(
      `content_variants?id=eq.${encodeURIComponent(job.variant_id)}&organization_id=eq.${encodeURIComponent(job.organization_id)}&select=*&limit=1`,
      {service:true}
    );
    if(rows?.[0]) return [rows[0].body,...(rows[0].hashtags||[])].filter(Boolean).join('\n\n');
  }
  if(job.content_id){
    const rows=await request(
      `content_items?id=eq.${encodeURIComponent(job.content_id)}&organization_id=eq.${encodeURIComponent(job.organization_id)}&select=*&limit=1`,
      {service:true}
    );
    if(rows?.[0]) return [rows[0].body,...(rows[0].hashtags||[])].filter(Boolean).join('\n\n');
  }
  return String(job.metadata?.body||'').trim();
}

async function metaToken(org){
  const rows=await request(
    `social_provider_tokens?organization_id=eq.${encodeURIComponent(org)}&provider=eq.meta&select=ciphertext,iv,tag&limit=1`,
    {service:true}
  );
  if(!rows?.[0]) throw Object.assign(new Error('meta_not_connected'),{status:409});
  return decrypt(rows[0].ciphertext,rows[0].iv,rows[0].tag);
}

async function dispatch(job){
  const text=await loadText(job);
  if(!text) throw Object.assign(new Error('empty_content'),{status:400});

  if(job.platform==='facebook'){
    const con=await request(
      `social_connections?organization_id=eq.${encodeURIComponent(job.organization_id)}&platform=eq.facebook&status=eq.active&select=external_account_id,settings&order=updated_at.desc&limit=1`,
      {service:true}
    );
    const page=con?.[0];
    if(!page) throw Object.assign(new Error('facebook_not_connected'),{status:409});
    let token=null;
    const enc=page.settings?.page_access_token_enc;
    if(enc?.ciphertext) token=decrypt(enc.ciphertext,enc.iv,enc.tag);
    if(!token) token=await metaToken(job.organization_id);
    const out=await graphPost(`${page.external_account_id}/feed`,token,{message:text});
    return {external_id:out.id||null};
  }

  if(job.platform==='instagram'){
    const con=await request(
      `social_connections?organization_id=eq.${encodeURIComponent(job.organization_id)}&platform=eq.instagram&status=eq.active&select=external_account_id,settings&order=updated_at.desc&limit=1`,
      {service:true}
    );
    const ig=con?.[0];
    const imageUrl=String(job.metadata?.image_url||'').trim();
    if(!ig) throw Object.assign(new Error('instagram_not_connected'),{status:409});
    if(!imageUrl) throw Object.assign(new Error('instagram_image_required'),{status:400});
    let token=null;
    const enc=ig.settings?.page_access_token_enc;
    if(enc?.ciphertext) token=decrypt(enc.ciphertext,enc.iv,enc.tag);
    if(!token) token=await metaToken(job.organization_id);
    const create=await graphPost(`${ig.external_account_id}/media`,token,{image_url:imageUrl,caption:text});
    const out=await graphPost(`${ig.external_account_id}/media_publish`,token,{creation_id:create.id});
    return {external_id:out.id||null};
  }

  if(job.platform==='tiktok') return {deferred:true,code:'tiktok_media_consent_required',message:'Use the existing TikTok Direct Post flow for creator info, privacy, consent and media upload.'};
  if(job.platform==='whatsapp') return {deferred:true,code:'whatsapp_not_feed',message:'WhatsApp outbound remains conversation/template based; no feed publishing is assumed.'};
  return {deferred:true,code:'provider_worker_pending',message:`${job.platform} provider dispatch is not enabled in this worker yet.`};
}

async function mark(id,patch){
  const rows=await request(
    `publishing_queue?id=eq.${encodeURIComponent(id)}`,
    {method:'PATCH',service:true,prefer:'return=representation',body:{...patch,updated_at:new Date().toISOString()}}
  );
  return Array.isArray(rows)?rows[0]:rows;
}

export async function processPublishingJob(job){
  try{
    await mark(job.id,{status:'processing',attempts:Number(job.attempts||0)+1,error_code:null,error_message:null});
    const out=await dispatch(job);
    if(out.deferred){
      await mark(job.id,{status:'waiting_provider',error_code:out.code,error_message:out.message});
      return {id:job.id,platform:job.platform,status:'waiting_provider',code:out.code,message:out.message};
    }
    await mark(job.id,{status:'published',external_id:out.external_id||null,published_at:new Date().toISOString(),error_code:null,error_message:null});
    return {id:job.id,platform:job.platform,status:'published',external_id:out.external_id||null};
  }catch(error){
    await mark(job.id,{status:'failed',error_code:'provider_error',error_message:String(error.message||error).slice(0,500)}).catch(()=>null);
    return {id:job.id,platform:job.platform,status:'failed',error:String(error.message||error)};
  }
}

export async function processPublishingQueue({limit=10,now=new Date().toISOString()}={}){
  const safeLimit=Math.max(1,Math.min(20,Number(limit)||10));
  const jobs=await request(
    `publishing_queue?status=eq.queued&requires_approval=eq.false&or=(scheduled_at.is.null,scheduled_at.lte.${encodeURIComponent(now)})&select=*&order=created_at.asc&limit=${safeLimit}`,
    {service:true}
  );
  const results=[];
  for(const job of jobs||[]) results.push(await processPublishingJob(job));
  return {ok:true,processed:results.length,results};
}

export async function executeMcpSocialTool(name,args={},admin=null){
  if(name==='social.status') return {ok:true,primary_provider:'mcp',fallback_provider:'gemini_optional',approval_required:true,tools:MCP_SOCIAL_TOOL_DEFS.map(t=>t.name)};

  if(name==='social.create_draft'){
    const campaign=createCampaign(args.campaign||{},args.brand_profile||{});
    const idea=args.idea||generateContentIdeas(campaign,args.brand_profile||{},{count:1})[0];
    return generateContentDraft(idea,campaign,args.brand_profile||{});
  }

  if(name==='social.create_variants') return adaptToChannels(args.draft||{},args.platforms||[],args.brand_profile||{});
  if(name==='social.create_creative_brief') return generateCreativeBrief({...(args.draft||{}),platform:args.platform||args.draft?.platform||'instagram'},args.brand_profile||{});

  if(name==='social.publish'){
    if(!admin?.user?.id) throw Object.assign(new Error('admin_auth_required'),{status:401});
    const organizationId=await resolveOrganization(args.organization_id,admin);
    const persisted=await loadPersistedContent({
      organizationId,
      contentId:String(args.content_id||'').trim()||null,
      variantId:String(args.variant_id||'').trim()||null
    });
    const gate=canPublish(persisted.publishable);
    if(!gate?.ok) return {ok:false,gate,queued:false,message:'Publishing blocked until the persisted content has human approval.'};

    const platform=String(args.platform||persisted.publishable.platform||'').toLowerCase();
    if(!['instagram','facebook','linkedin','tiktok','whatsapp','telegram'].includes(platform)) {
      throw Object.assign(new Error('unsupported_platform'),{status:400});
    }

    const scheduledAt=args.scheduled_at||persisted.item?.scheduled_at||null;
    const imageUrl=String(
      args.image_url||
      persisted.variant?.metadata?.image_url||
      persisted.item?.metadata?.image_url||
      persisted.item?.creative_brief?.image_url||
      ''
    ).trim()||null;

    const rows=await request('publishing_queue',{
      method:'POST',
      service:true,
      prefer:'return=representation',
      body:{
        organization_id:organizationId,
        content_id:persisted.contentId,
        variant_id:persisted.variantId,
        platform,
        status:'queued',
        scheduled_at:scheduledAt,
        requires_approval:false,
        metadata:{source:'mcp',approved_status:persisted.item.status,requested_by:admin.user.id,image_url:imageUrl}
      }
    });
    const job=Array.isArray(rows)?rows[0]:rows;
    if(!job?.id) throw Object.assign(new Error('publishing_queue_insert_failed'),{status:500});

    const due=!scheduledAt || new Date(scheduledAt).getTime()<=Date.now();
    if(due){
      const delivery=await processPublishingJob(job);
      return {ok:delivery.status==='published',gate,queued:delivery.status!=='published',queue_id:job.id,platform,delivery};
    }
    return {ok:true,gate,queued:true,queue_id:job.id,platform,status:'queued',delivery:'scheduled_queue',scheduled_at:scheduledAt};
  }

  throw Object.assign(new Error('unknown_tool'),{status:404});
}
