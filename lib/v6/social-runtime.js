import { createDecipheriv } from 'node:crypto';
import {
  createCampaign,
  generateContentIdeas,
  generateContentDraft,
  adaptToChannels,
  generateCreativeBrief,
  canPublish
} from './social-studio.js';
import { getTikTokBusinessAccess, tiktokBusinessPost, tiktokBusinessGet } from './tiktok-business.js';

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

const META_REQUIRED_SCOPES = {
  facebook: ['pages_show_list','pages_read_engagement','pages_manage_posts'],
  instagram: ['instagram_basic','instagram_content_publish']
};
const TRANSIENT_META_ERRORS = /media id is not available|media processing|temporar|timeout|rate limit|error code: 2|network/i;
const PERMANENT_META_ERRORS = /permission|requires .*pages_manage_posts|invalid.*token|unsupported/i;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function metaError(message,{status=502,code='provider_error',details=null}={}){
  return Object.assign(new Error(message),{status,code,details});
}
function normalizeScopes(scopes){
  return new Set(Array.isArray(scopes) ? scopes : String(scopes||'').split(',').map(x=>x.trim()).filter(Boolean));
}
function requiredMetaScopes(platform){
  return META_REQUIRED_SCOPES[platform]||[];
}
function canonicalImageUrl(value){
  const url=String(value||'').trim();
  return url.replace(/^https:\/\/tiqnora\.com\//i,'https://www.tiqnora.com/');
}
function retryDelayMs(attempt){
  return Math.min(60000,2000*Math.pow(2,Math.max(0,attempt-1)));
}
function classifyMetaError(error){
  const message=String(error?.message||error||'Meta provider error');
  if(error?.code==='reauthorization_required'||PERMANENT_META_ERRORS.test(message)) return {transient:false,code:error?.code||'reauthorization_required',message};
  return {transient:TRANSIENT_META_ERRORS.test(message)||Number(error?.status)>=500,code:error?.code||'provider_error',message};
}

async function graphPost(path,token,payload){
  const u=new URL('https://graph.facebook.com/v22.0/'+path);
  u.searchParams.set('access_token',token);
  const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.error) throw metaError(d?.error?.message||('Meta '+r.status),{status:r.status,details:d?.error||d});
  return d;
}
async function graphGet(path,token){
  const u=new URL('https://graph.facebook.com/v22.0/'+path);
  u.searchParams.set('access_token',token);
  const r=await fetch(u,{headers:{'Cache-Control':'no-cache'}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok||d.error) throw metaError(d?.error?.message||('Meta '+r.status),{status:r.status,details:d?.error||d});
  return d;
}
async function waitForInstagramContainer(containerId,token,{attempts=25,delayMs=1000}={}){
  let last=null;
  for(let attempt=0;attempt<attempts;attempt+=1){
    const state=await graphGet(containerId+'?fields=status_code,status',token);
    const code=String(state?.status_code||'').toUpperCase();
    last={status_code:code||null,status:state?.status||null,attempt:attempt+1};
    if(code==='FINISHED'||code==='PUBLISHED') return last;
    if(code==='ERROR'||code==='EXPIRED') throw metaError(state?.status||('Instagram media processing '+code.toLowerCase()),{status:502,code:'instagram_container_failed',details:last});
    if(attempt<attempts-1) await sleep(Math.min(4000,delayMs*Math.pow(1.15,attempt)));
  }
  throw metaError('Instagram media processing timed out',{status:504,code:'instagram_container_timeout',details:last});
}
function formatPostText(row={}){
  const body=String(row.body||'').trim();
  const cta=String(row.cta||'').trim();
  const tags=(Array.isArray(row.hashtags)?row.hashtags:[])
    .map(tag=>String(tag||'').trim())
    .filter(Boolean)
    .join(' ');
  return [body,cta,tags].filter(Boolean).join('\n\n').trim();
}
async function loadText(job){
  if(job.variant_id){
    const rows=await request('content_variants?id=eq.'+encodeURIComponent(job.variant_id)+'&organization_id=eq.'+encodeURIComponent(job.organization_id)+'&select=*&limit=1',{service:true});
    if(rows?.[0]) return formatPostText(rows[0]);
  }
  if(job.content_id){
    const rows=await request('content_items?id=eq.'+encodeURIComponent(job.content_id)+'&organization_id=eq.'+encodeURIComponent(job.organization_id)+'&select=*&limit=1',{service:true});
    if(rows?.[0]) return formatPostText(rows[0]);
  }
  return String(job.metadata?.body||'').trim();
}
async function metaToken(org,platform){
  const rows=await request('social_provider_tokens?organization_id=eq.'+encodeURIComponent(org)+'&provider=eq.meta&select=ciphertext,iv,tag,scopes&limit=1',{service:true});
  const row=rows?.[0];
  if(!row) throw metaError('Meta is not connected',{status:409,code:'meta_not_connected'});
  const granted=normalizeScopes(row.scopes);
  const missing=requiredMetaScopes(platform).filter(scope=>!granted.has(scope));
  if(missing.length) throw metaError('Meta reauthorization required: missing '+missing.join(', '),{status:409,code:'reauthorization_required',details:{missing_scopes:missing,granted_scopes:[...granted]}});
  return {token:decrypt(row.ciphertext,row.iv,row.tag),scopes:[...granted]};
}

async function publishTikTokPhoto(job,text){
  const imageUrl=canonicalImageUrl(job.metadata?.image_url);
  if(!imageUrl) throw metaError('TikTok image is required',{status:400,code:'tiktok_image_required'});
  const credentials=await getTikTokBusinessAccess(job.organization_id);
  const granted=normalizeScopes(credentials.scopes);
  if(!granted.has('video.publish')){
    throw metaError('TikTok reauthorization required: missing video.publish',{
      status:409,
      code:'tiktok_business_reauthorization_required',
      details:{granted_scopes:[...granted]}
    });
  }

  const out=await tiktokBusinessPost('business/photo/publish/',credentials.accessToken,{
    business_id:credentials.businessId,
    photo_images:[imageUrl],
    photo_cover_index:0,
    post_info:{
      caption:String(text||'').slice(0,4000),
      privacy_level:'PUBLIC_TO_EVERYONE',
      is_brand_organic:true,
      is_branded_content:false
    }
  });

  const publishId=String(out?.data?.publish_id||out?.data?.share_id||'').trim();
  if(!publishId) throw metaError('TikTok did not return a publish ID',{status:502,code:'tiktok_publish_id_missing',details:out});

  let providerStatus='SUBMITTED';
  let postId='';
  for(let attempt=0;attempt<5;attempt+=1){
    if(attempt>0) await sleep(1500);
    try{
      const state=await tiktokBusinessGet('business/publish/status/',credentials.accessToken,{
        business_id:credentials.businessId,
        publish_id:publishId
      });
      const data=state?.data||{};
      providerStatus=String(data.status||providerStatus).toUpperCase();
      if(providerStatus==='FAILED'){
        throw metaError(data.reason||data.fail_reason||'TikTok publishing failed',{
          status:502,
          code:'tiktok_publish_failed',
          details:data
        });
      }
      if(providerStatus==='PUBLISH_COMPLETE'){
        postId=String(data?.post_ids?.[0]||data?.item_id||'').trim();
        break;
      }
    }catch(error){
      if(error?.code==='tiktok_publish_failed') throw error;
    }
  }

  return {
    external_id:postId||publishId,
    diagnostics:{
      provider:'tiktok_business',
      platform:'tiktok',
      publish_id:publishId,
      provider_status:providerStatus,
      image_url:imageUrl,
      confirmation_pending:providerStatus!=='PUBLISH_COMPLETE'
    }
  };
}
async function mark(id,patch){
  const rows=await request('publishing_queue?id=eq.'+encodeURIComponent(id),{method:'PATCH',service:true,prefer:'return=representation',body:{...patch,updated_at:new Date().toISOString()}});
  return Array.isArray(rows)?rows[0]:rows;
}
async function saveDiagnostics(job,diagnostics){
  return mark(job.id,{metadata:{...(job.metadata||{}),publishing_diagnostics:diagnostics}});
}
async function dispatch(job){
  const text=await loadText(job);
  if(!text) throw metaError('empty_content',{status:400,code:'empty_content'});
  if(job.platform==='facebook'){
    const credentials=await metaToken(job.organization_id,'facebook');
    const con=await request('social_connections?organization_id=eq.'+encodeURIComponent(job.organization_id)+'&platform=eq.facebook&status=eq.active&external_account_id=neq.0&select=external_account_id,settings&order=updated_at.desc&limit=1',{service:true});
    const page=con?.[0];
    if(!page) throw metaError('facebook_not_connected',{status:409,code:'facebook_not_connected'});
    const enc=page.settings?.page_access_token_enc;
    const token=enc?.ciphertext?decrypt(enc.ciphertext,enc.iv,enc.tag):credentials.token;
    const imageUrl=canonicalImageUrl(job.metadata?.image_url);
    const out=imageUrl
      ? await graphPost(page.external_account_id+'/photos',token,{url:imageUrl,caption:text,published:true})
      : await graphPost(page.external_account_id+'/feed',token,{message:text});
    return {external_id:out.post_id||out.id||null,diagnostics:{provider:'meta',platform:'facebook',image_url:imageUrl||null,granted_scopes:credentials.scopes}};
  }
  if(job.platform==='instagram'){
    const credentials=await metaToken(job.organization_id,'instagram');
    const con=await request('social_connections?organization_id=eq.'+encodeURIComponent(job.organization_id)+'&platform=eq.instagram&status=eq.active&external_account_id=neq.0&select=external_account_id,settings&order=updated_at.desc&limit=1',{service:true});
    const ig=con?.[0];
    const imageUrl=canonicalImageUrl(job.metadata?.image_url);
    if(!ig) throw metaError('instagram_not_connected',{status:409,code:'instagram_not_connected'});
    if(!imageUrl) throw metaError('instagram_image_required',{status:400,code:'instagram_image_required'});
    const enc=ig.settings?.page_access_token_enc;
    const token=enc?.ciphertext?decrypt(enc.ciphertext,enc.iv,enc.tag):credentials.token;
    let containerId=String(job.metadata?.instagram_container_id||'').trim();
    if(!containerId){
      const create=await graphPost(ig.external_account_id+'/media',token,{image_url:imageUrl,caption:text});
      containerId=String(create?.id||'').trim();
      if(!containerId) throw metaError('Instagram media container was not created',{status:502,code:'instagram_container_missing'});
      await saveDiagnostics(job,{provider:'meta',platform:'instagram',image_url:imageUrl,container_id:containerId,container_status:'CREATED'});
      job.metadata={...(job.metadata||{}),instagram_container_id:containerId};
    }
    const container=await waitForInstagramContainer(containerId,token);
    await saveDiagnostics(job,{provider:'meta',platform:'instagram',image_url:imageUrl,container_id:containerId,container_status:container.status_code,container_detail:container.status});
    let lastError=null;
    for(let publishAttempt=1;publishAttempt<=4;publishAttempt+=1){
      try{
        const out=await graphPost(ig.external_account_id+'/media_publish',token,{creation_id:containerId});
        return {external_id:out.id||null,diagnostics:{provider:'meta',platform:'instagram',image_url:imageUrl,container_id:containerId,container_status:container.status_code,publish_attempt:publishAttempt}};
      }catch(error){
        lastError=error;
        if(!/media id is not available/i.test(String(error.message||''))||publishAttempt===4) throw error;
        await sleep(2000*publishAttempt);
      }
    }
    throw lastError;
  }
  if(job.platform==='tiktok') return publishTikTokPhoto(job,text);
  if(job.platform==='whatsapp') return {deferred:true,code:'whatsapp_not_feed',message:'WhatsApp outbound remains conversation/template based; no feed publishing is assumed.'};
  return {deferred:true,code:'provider_worker_pending',message:job.platform+' provider dispatch is not enabled in this worker yet.'};
}
export async function processPublishingJob(job){
  const attempts=Number(job.attempts||0)+1;
  try{
    await mark(job.id,{status:'processing',attempts,error_code:null,error_message:null});
    const out=await dispatch(job);
    if(out.deferred){
      await mark(job.id,{status:'waiting_provider',error_code:out.code,error_message:out.message});
      return {id:job.id,platform:job.platform,status:'waiting_provider',code:out.code,message:out.message};
    }
    await mark(job.id,{status:'published',external_id:out.external_id||null,published_at:new Date().toISOString(),error_code:null,error_message:null,metadata:{...(job.metadata||{}),publishing_diagnostics:out.diagnostics||null}});
    return {id:job.id,platform:job.platform,status:'published',external_id:out.external_id||null};
  }catch(error){
    const outcome=classifyMetaError(error);
    const diagnostics={...(job.metadata?.publishing_diagnostics||{}),last_error:outcome.message,meta_error:error?.details||null,attempts};
    if(outcome.transient&&attempts<5){
      const scheduled_at=new Date(Date.now()+retryDelayMs(attempts)).toISOString();
      await mark(job.id,{status:'queued',scheduled_at,error_code:'transient_provider_error',error_message:outcome.message.slice(0,500),metadata:{...(job.metadata||{}),publishing_diagnostics:diagnostics}});
      return {id:job.id,platform:job.platform,status:'queued',retry_at:scheduled_at,error:outcome.message};
    }
    await mark(job.id,{status:'failed',error_code:outcome.code,error_message:outcome.message.slice(0,500),metadata:{...(job.metadata||{}),publishing_diagnostics:diagnostics}}).catch(()=>null);
    return {id:job.id,platform:job.platform,status:'failed',error:outcome.message};
  }
}
export async function processPublishingQueue({limit=10,now=new Date().toISOString()}={}){
  const safeLimit=Math.max(1,Math.min(20,Number(limit)||10));
  const jobs=await request('publishing_queue?status=eq.queued&requires_approval=eq.false&or=(scheduled_at.is.null,scheduled_at.lte.'+encodeURIComponent(now)+')&select=*&order=created_at.asc&limit='+safeLimit,{service:true});
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
