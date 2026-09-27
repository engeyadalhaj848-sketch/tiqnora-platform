import { generateStructured } from '../ai/provider.js';
import { validateBrandContent, getDefaultBrandProfile } from './brand-brain.js';

const SUPABASE_URL=(process.env.SUPABASE_URL||'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/,'');
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';

const ASSETS=Object.freeze({
  automation:'https://tiqnora.com/assets/products/tech-automation-1.jpg',
  ai_chatbot:'https://tiqnora.com/assets/products/tech-ai-chatbot-1.jpg',
  seo:'https://tiqnora.com/assets/products/tech-seo-ai-1.jpg',
  business_tech:'https://tiqnora.com/assets/products/tech-aio-desktop-1.jpg',
  brand:'https://tiqnora.com/assets/tiqnora-logo.png'
});

function headers(){
  if(!SERVICE) throw Object.assign(new Error('SUPABASE_SERVICE_ROLE_KEY missing'),{status:503});
  return {apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json'};
}

async function rest(path,{method='GET',body=null,prefer=null}={}){
  const h=headers();
  if(prefer) h.Prefer=prefer;
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    method,
    headers:h,
    ...(body==null?{}:{body:JSON.stringify(body)})
  });
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw Object.assign(new Error(data?.message||data?.hint||`Supabase ${r.status}`),{status:r.status});
  return data;
}

function dayRiyadh(){
  return new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Riyadh'});
}

function dayStartUtc(day){
  return new Date(`${day}T00:00:00+03:00`).toISOString();
}

function cleanTags(tags=[]){
  return [...new Set((Array.isArray(tags)?tags:[]).map(x=>String(x||'').trim()).filter(Boolean).map(x=>x.startsWith('#')?x:`#${x.replace(/\s+/g,'')}`))].slice(0,8);
}

function safeAsset(key){
  return ASSETS[key]||ASSETS.brand;
}

async function organization(){
  const rows=await rest('organizations?slug=eq.tiqnora&select=id,settings&limit=1');
  if(!rows?.[0]) throw Object.assign(new Error('tiqnora_organization_missing'),{status:409});
  return rows[0];
}

async function activePlatforms(organizationId){
  const rows=await rest(
    `social_connections?organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.active&select=platform,external_account_id,updated_at&order=updated_at.desc`
  );
  const out=new Set();
  for(const row of rows||[]){
    const platform=String(row.platform||'').toLowerCase();
    if(platform==='instagram' && String(row.external_account_id||'')==='0') continue;
    out.add(platform);
  }
  return out;
}

async function alreadyPrepared(organizationId,day){
  const rows=await rest(
    `content_items?organization_id=eq.${encodeURIComponent(organizationId)}&created_at=gte.${encodeURIComponent(dayStartUtc(day))}&select=id,title,status,metadata,created_at&order=created_at.desc&limit=50`
  ).catch(()=>[]);
  return (rows||[]).find(row=>row?.metadata?.source==='daily_social_autopilot' && row?.metadata?.autopilot_day===day)||null;
}

async function managerDirective(day){
  const {data,provider,model}=await generateStructured({
    system:[
      'You are Tiqnora AI Chief of Staff coordinating elite marketing, content, social and design agents.',
      'Choose one strong daily social objective for Tiqnora in Saudi Arabia, with Madinah as the local focus.',
      'The goal is qualified inbound demand for websites, WhatsApp/CRM automation, AI agents, social automation, SEO and practical business technology.',
      'Do not use fixed service prices, unverifiable claims, fake results, fake testimonials, or reveal private ownership/management identities.',
      'Prefer one clear business pain and one clear CTA.'
    ].join(' '),
    prompt:`Plan the social priority for ${day}. Return the strongest single directive.`,
    schemaHint:'{"objective":"awareness|lead_generation|education","audience":"string","pain":"string","service_focus":"string","angle":"string","cta":"string","asset_key":"automation|ai_chatbot|seo|business_tech|brand"}',
    allowDeterministic:false
  });
  return {data,provider,model};
}

async function marketingBrief(directive){
  const {data,provider,model}=await generateStructured({
    system:[
      'You are Tiqnora elite Saudi/GCC B2B Growth & Marketing Director.',
      'Turn the Chief of Staff directive into a practical organic social campaign brief.',
      'Think in customer problem, value proposition, proof-safe message, hook, CTA, funnel stage and measurement.',
      'No fabricated statistics, rankings, guarantees, customer names, or prices.'
    ].join(' '),
    prompt:`Chief of Staff directive:\n${JSON.stringify(directive)}`,
    schemaHint:'{"hook":"string","core_message":"string","value_points":["string"],"funnel_stage":"awareness|consideration|conversion","cta":"string","kpi":["string"],"asset_key":"automation|ai_chatbot|seo|business_tech|brand"}',
    allowDeterministic:false
  });
  return {data,provider,model};
}

async function socialPackage(directive,brief){
  const {data,provider,model}=await generateStructured({
    system:[
      'You are a joint Tiqnora content + social media team: elite Arabic copywriter, social growth director and brand art director.',
      'Write natural Saudi Arabic. Sound expert and human, not like generic AI marketing.',
      'Facebook can be slightly explanatory; Instagram must be tighter and more visual.',
      'Use at most 5 useful hashtags per platform. No unsupported claims, guarantees, fake urgency, fake testimonials, or fixed service prices.',
      'CTA should invite the reader to discuss their project or request a tailored assessment.',
      'Return an image_brief that can be executed later by the visual agent.'
    ].join(' '),
    prompt:`Directive:\n${JSON.stringify(directive)}\n\nMarketing brief:\n${JSON.stringify(brief)}`,
    schemaHint:'{"title":"string","facebook":{"body":"string","hashtags":["string"]},"instagram":{"body":"string","hashtags":["string"]},"cta":"string","asset_key":"automation|ai_chatbot|seo|business_tech|brand","image_brief":"string"}',
    allowDeterministic:false
  });
  return {data,provider,model};
}

function validatePackage(pkg){
  const brand=getDefaultBrandProfile();
  const fb=validateBrandContent(String(pkg?.facebook?.body||''),brand,{require_cta:false});
  const ig=validateBrandContent(String(pkg?.instagram?.body||''),brand,{require_cta:false});
  const textOk=String(pkg?.facebook?.body||'').trim().length>=60 && String(pkg?.instagram?.body||'').trim().length>=40;
  return {ok:Boolean(textOk&&fb?.ok&&ig?.ok),facebook:fb,instagram:ig};
}

async function persistDailyPost({org,day,directive,brief,pkg,platforms,settings,trace}){
  const now=new Date().toISOString();
  const approvedBy=String(settings?.approved_by||'').trim()||null;
  const selectedAsset=safeAsset(pkg.asset_key||brief.asset_key||directive.asset_key);

  const itemRows=await rest('content_items',{
    method:'POST',
    prefer:'return=representation',
    body:{
      organization_id:org.id,
      status:'approved',
      content_type:'social_post',
      title:`[AUTO ${day}] ${String(pkg.title||brief.hook||'Tiqnora Daily').slice(0,180)}`,
      hook:String(brief.hook||'').slice(0,500)||null,
      body:String(pkg.facebook.body||'').trim(),
      cta:String(pkg.cta||brief.cta||directive.cta||'ناقش مشروعك معنا').slice(0,300),
      hashtags:cleanTags(pkg.facebook.hashtags),
      language:'ar',
      tone:'professional_saudi',
      platform:'facebook',
      funnel_stage:brief.funnel_stage||null,
      angle:directive.angle||null,
      recommended_asset:selectedAsset,
      creative_brief:{image_url:selectedAsset,image_brief:pkg.image_brief||null,asset_key:pkg.asset_key||null},
      brand_validation:{ok:true,source:'daily_social_autopilot'},
      approved_by:approvedBy,
      approved_at:now,
      metadata:{
        source:'daily_social_autopilot',
        autopilot_day:day,
        user_authorized_auto_publish:true,
        collaboration:['manager','marketing','content','social-media','image-designer'],
        providers:trace,
        image_url:selectedAsset
      }
    }
  });
  const item=Array.isArray(itemRows)?itemRows[0]:itemRows;
  if(!item?.id) throw new Error('content_item_insert_failed');

  const variantPayloads=[];
  if(platforms.has('facebook')){
    variantPayloads.push({
      organization_id:org.id,content_id:item.id,platform:'facebook',
      headline:String(pkg.title||'').slice(0,240)||null,
      hook:String(brief.hook||'').slice(0,500)||null,
      body:String(pkg.facebook.body||'').trim(),
      cta:String(pkg.cta||brief.cta||directive.cta||'').slice(0,300)||null,
      hashtags:cleanTags(pkg.facebook.hashtags),
      status:'approved',
      metadata:{source:'daily_social_autopilot',image_url:selectedAsset}
    });
  }
  if(platforms.has('instagram')){
    variantPayloads.push({
      organization_id:org.id,content_id:item.id,platform:'instagram',
      headline:String(pkg.title||'').slice(0,240)||null,
      hook:String(brief.hook||'').slice(0,500)||null,
      body:String(pkg.instagram.body||'').trim(),
      cta:String(pkg.cta||brief.cta||directive.cta||'').slice(0,300)||null,
      hashtags:cleanTags(pkg.instagram.hashtags),
      status:'approved',
      metadata:{source:'daily_social_autopilot',image_url:selectedAsset}
    });
  }

  const variants=variantPayloads.length
    ? await rest('content_variants',{method:'POST',prefer:'return=representation',body:variantPayloads})
    : [];

  const queues=[];
  for(const variant of variants||[]){
    const q=await rest('publishing_queue',{
      method:'POST',
      prefer:'return=representation',
      body:{
        organization_id:org.id,
        content_id:item.id,
        variant_id:variant.id,
        platform:variant.platform,
        status:'queued',
        scheduled_at:now,
        requires_approval:false,
        metadata:{
          source:'daily_social_autopilot',
          autopilot_day:day,
          user_authorized_auto_publish:true,
          image_url:selectedAsset
        }
      }
    });
    const row=Array.isArray(q)?q[0]:q;
    if(row) queues.push(row);
  }

  return {item,variants,queues,asset:selectedAsset};
}

export async function ensureDailySocialAutopilot({force=false}={}){
  const org=await organization();
  const config=org.settings?.social_autopilot||{};
  if(config.enabled!==true && !force){
    return {ok:true,enabled:false,created:false,reason:'disabled'};
  }

  const day=dayRiyadh();
  if(!force){
    const existing=await alreadyPrepared(org.id,day);
    if(existing) return {ok:true,enabled:true,created:false,reason:'already_prepared',content_id:existing.id,day};
  }

  const connected=await activePlatforms(org.id);
  const requested=Array.isArray(config.platforms)?config.platforms:['facebook','instagram'];
  const supported=new Set(requested.filter(p=>['facebook','instagram'].includes(String(p).toLowerCase())).map(p=>String(p).toLowerCase()));
  const publishPlatforms=new Set([...supported].filter(p=>connected.has(p)));
  if(!publishPlatforms.size){
    return {ok:false,enabled:true,created:false,reason:'no_supported_connected_platforms',connected:[...connected]};
  }

  const manager=await managerDirective(day);
  const marketing=await marketingBrief(manager.data);
  const social=await socialPackage(manager.data,marketing.data);
  const validation=validatePackage(social.data);
  if(!validation.ok){
    return {ok:false,enabled:true,created:false,reason:'brand_validation_failed',validation};
  }

  const persisted=await persistDailyPost({
    org,day,
    directive:manager.data,
    brief:marketing.data,
    pkg:social.data,
    platforms:publishPlatforms,
    settings:config,
    trace:{
      manager:{provider:manager.provider,model:manager.model},
      marketing:{provider:marketing.provider,model:marketing.model},
      social:{provider:social.provider,model:social.model}
    }
  });

  return {
    ok:true,
    enabled:true,
    created:true,
    day,
    platforms:[...publishPlatforms],
    content_id:persisted.item.id,
    queue_ids:persisted.queues.map(x=>x.id),
    asset:persisted.asset,
    title:persisted.item.title
  };
}

export default {ensureDailySocialAutopilot};
