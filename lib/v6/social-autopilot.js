import { generateStructured } from '../ai/provider.js';
import { validateBrandContent, getDefaultBrandProfile } from './brand-brain.js';
import { notifySocialApproval } from '../social-approval.js';

const SUPABASE_URL=(process.env.SUPABASE_URL||'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/,'');
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';

const LEGACY_PLACEHOLDER_ASSETS=Object.freeze([
  '/assets/social/web-design.png',
  '/assets/social/ecommerce.png',
  '/assets/social/web-design.jpg',
  '/assets/social/ecommerce.jpg'
]);

function isLegacyPlaceholderAsset(url){
  const value=String(url||'').toLowerCase();
  return LEGACY_PLACEHOLDER_ASSETS.some(path=>value.includes(path));
}

function approvedAsset(settings,key){
  const assets=settings?.approved_assets;
  if(!assets || typeof assets!=='object') return null;
  const value=String(assets[key]||'').trim();
  if(!/^https:\/\//i.test(value)) return null;
  if(isLegacyPlaceholderAsset(value)) return null;
  return value;
}

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

function slotRiyadh(intervalHours=2){
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Riyadh',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',
    hourCycle:'h23'
  }).formatToParts(new Date());
  const get=type=>parts.find(p=>p.type===type)?.value||'';
  const day=`${get('year')}-${get('month')}-${get('day')}`;
  const hour=Number(get('hour')||0);
  const safeInterval=Math.max(1,Math.min(12,Number(intervalHours)||2));
  const bucket=Math.floor(hour/safeInterval)*safeInterval;
  return {day,slot:`${day}T${String(bucket).padStart(2,'0')}:00`,bucket_hour:bucket,interval_hours:safeInterval};
}

function cleanTags(tags=[]){
  return [...new Set((Array.isArray(tags)?tags:[]).map(x=>String(x||'').trim()).filter(Boolean).map(x=>x.startsWith('#')?x:`#${x.replace(/\s+/g,'')}`))].slice(0,8);
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

async function alreadyPrepared(organizationId,{day,slot}){
  const rows=await rest(
    `content_items?organization_id=eq.${encodeURIComponent(organizationId)}&created_at=gte.${encodeURIComponent(dayStartUtc(day))}&select=id,title,status,metadata,created_at&order=created_at.desc&limit=100`
  ).catch(()=>[]);
  return (rows||[]).find(row=>
    row?.metadata?.source==='daily_social_autopilot'
    && row?.metadata?.autopilot_slot===slot
  )||null;
}

async function managerDirective(day,slot=null){
  const hour=Number(String(slot||'').slice(11,13)||0);
  const forcedFocus=((Math.floor(hour/2)%2)===0)?'web_design':'ecommerce';
  const {data,provider,model}=await generateStructured({
    system:[
      'You are Tiqnora AI Chief of Staff coordinating elite marketing, content, social and design agents.',
      'Choose one strong social objective for Tiqnora in Saudi Arabia, with Madinah as the local focus.',
      `This two-hour slot is reserved for ${forcedFocus}. Do not switch to another service.`,
      'For web_design, focus on professional business websites. For ecommerce, focus on online stores, buying experience, product discovery and checkout readiness.',
      'Do not use fixed service prices, unverifiable claims, fake results, fake testimonials, or reveal private ownership/management identities.',
      'Prefer one clear business pain and one clear CTA.'
    ].join(' '),
    prompt:`Plan the strongest social priority for ${slot||day}. Avoid repeating the same angle used in nearby posting slots. Return one directive.`,
    schemaHint:'{"objective":"awareness|lead_generation|education","audience":"string","pain":"string","service_focus":"web_design|ecommerce","angle":"string","cta":"string","asset_key":"web_design|ecommerce"}',
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
    schemaHint:'{"hook":"string","core_message":"string","value_points":["string"],"funnel_stage":"awareness|consideration|conversion","cta":"string","kpi":["string"],"asset_key":"web_design|ecommerce"}',
    allowDeterministic:false
  });
  return {data,provider,model};
}

async function socialPackage(directive,brief){
  const {data,provider,model}=await generateStructured({
    system:[
      'You are a joint Tiqnora content + social media team: elite Arabic copywriter, social growth director and brand art director.',
      'Write natural Saudi Arabic. Sound expert and human, not like generic AI marketing.',
      'Facebook can be slightly explanatory; Instagram must be tighter and more visual; TikTok must be hook-first, concise and native to a photo/video caption.',
      'Use at most 5 useful hashtags per platform. No unsupported claims, guarantees, fake urgency, fake testimonials, or fixed service prices.',
      'CTA should invite the reader to discuss their project or request a tailored assessment.',
      'Return an image_brief that can be executed later by the visual agent.'
    ].join(' '),
    prompt:`Directive:\n${JSON.stringify(directive)}\n\nMarketing brief:\n${JSON.stringify(brief)}`,
    schemaHint:'{"title":"string","facebook":{"body":"string","hashtags":["string"]},"instagram":{"body":"string","hashtags":["string"]},"tiktok":{"body":"string","hashtags":["string"]},"cta":"string","asset_key":"web_design|ecommerce","image_brief":"string"}',
    allowDeterministic:false
  });
  return {data,provider,model};
}

function validatePackage(pkg){
  const brand=getDefaultBrandProfile();
  const fb=validateBrandContent(String(pkg?.facebook?.body||''),brand,{require_cta:false});
  const ig=validateBrandContent(String(pkg?.instagram?.body||''),brand,{require_cta:false});
  const tt=validateBrandContent(String(pkg?.tiktok?.body||pkg?.instagram?.body||''),brand,{require_cta:false});
  const facebookBody=String(pkg?.facebook?.body||'').trim();
  const instagramBody=String(pkg?.instagram?.body||'').trim();
  const tiktokBody=String(pkg?.tiktok?.body||pkg?.instagram?.body||'').trim();
  const imageBrief=String(pkg?.image_brief||'').trim();
  const textOk=facebookBody.length>=80
    && instagramBody.length>=55
    && tiktokBody.length>=30;
  const platformSpecific=facebookBody!==instagramBody
    && instagramBody!==tiktokBody;
  const visualSpecific=imageBrief.length>=80
    && !/(wireframe|placeholder|generic template|مربعات تجريبية|قالب تجريبي)/i.test(imageBrief);
  const noGenericFiller=!/(حلول متكاملة|نقلة نوعية|ثورة رقمية|أفضل الحلول|لا تفوّت الفرصة)/i.test(
    [facebookBody,instagramBody,tiktokBody].join(' ')
  );
  return {
    ok:Boolean(textOk&&platformSpecific&&visualSpecific&&noGenericFiller&&fb?.ok&&ig?.ok&&tt?.ok),
    facebook:fb,
    instagram:ig,
    tiktok:tt,
    checks:{textOk,platformSpecific,visualSpecific,noGenericFiller}
  };
}

async function managerQualityReview({directive,brief,pkg,validation,round=0}){
  const {data,provider,model}=await generateStructured({
    system:[
      'You are the Tiqnora AI Chief of Staff and final organic-social quality gate.',
      'Review the work from marketing, content, social and design agents before publication.',
      'Approve only when the message is useful, specific, brand-safe, visually relevant, platform-appropriate and free of unsupported claims.',
      'Reject generic filler, fake urgency, invented statistics, fixed service prices, mismatched visuals, product-catalog photos, stock-market imagery, weak CTAs, wireframes, placeholder UI boxes, repeated legacy templates, unreadable tiny text, or visuals that look unfinished.',
      'If revision is needed, send it back to exactly one specialist: marketing, content, social-media, image-designer, or video-designer.',
      'Your approval is only an internal quality review. The human owner must still approve every post in the Telegram group before any social platform publish can happen. Never treat manager approval as publish authorization.'
    ].join(' '),
    prompt:[
      `Review round: ${round}`,
      `Directive: ${JSON.stringify(directive)}`,
      `Marketing brief: ${JSON.stringify(brief)}`,
      `Social package: ${JSON.stringify(pkg)}`,
      `Deterministic brand validation: ${JSON.stringify(validation)}`
    ].join('\n\n'),
    schemaHint:'{"decision":"approve|revise","target_agent":"marketing|content|social-media|image-designer|video-designer|null","feedback":"string","reason":"string","approved_asset_key":"web_design|ecommerce|null"}',
    allowDeterministic:false
  });
  const decision=String(data?.decision||'revise').toLowerCase()==='approve'?'approve':'revise';
  return {data:{...data,decision},provider,model};
}

async function reviseSocialPackage({directive,brief,pkg,review,round=1}){
  const target=String(review?.target_agent||'social-media');
  const roleMap={
    marketing:'Tiqnora Saudi/GCC B2B Marketing Director',
    content:'Tiqnora senior Arabic copywriter',
    'social-media':'Tiqnora Social Media Director',
    'image-designer':'Tiqnora Brand Art Director',
    'video-designer':'Tiqnora short-form Video Director'
  };
  const {data,provider,model}=await generateStructured({
    system:[
      `You are the ${roleMap[target]||roleMap['social-media']}.`,
      'You are receiving a revision request from the Tiqnora Chief of Staff.',
      'Fix only what is needed while preserving strong approved parts.',
      'Write natural Saudi Arabic, keep at most 5 useful hashtags per platform, use no fixed prices or unverifiable claims.',
      'The image_brief must depict the actual service, follow Tiqnora navy/electric-blue/cyan identity, use one strong focal idea, readable mobile-first typography, and must never use random product photos, stock-market imagery, wireframes, placeholder UI boxes, or generic dashboard blocks.'
    ].join(' '),
    prompt:[
      `Revision round: ${round}`,
      `Manager feedback: ${review?.feedback||review?.reason||'Improve quality and relevance.'}`,
      `Directive: ${JSON.stringify(directive)}`,
      `Marketing brief: ${JSON.stringify(brief)}`,
      `Current package: ${JSON.stringify(pkg)}`
    ].join('\n\n'),
    schemaHint:'{"title":"string","facebook":{"body":"string","hashtags":["string"]},"instagram":{"body":"string","hashtags":["string"]},"tiktok":{"body":"string","hashtags":["string"]},"cta":"string","asset_key":"web_design|ecommerce","image_brief":"string"}',
    allowDeterministic:false
  });
  return {data,provider,model,target_agent:target};
}

async function managerReviewLoop({directive,brief,initialPackage,maxRevisions=2}){
  let pkg=initialPackage;
  const history=[];
  let validation=validatePackage(pkg);

  for(let round=0;round<=maxRevisions;round+=1){
    const review=await managerQualityReview({directive,brief,pkg,validation,round});
    history.push({
      round,
      decision:review.data.decision,
      target_agent:review.data.target_agent||null,
      feedback:review.data.feedback||null,
      reason:review.data.reason||null,
      provider:review.provider,
      model:review.model,
      validation_ok:Boolean(validation.ok)
    });

    if(review.data.decision==='approve' && validation.ok){
      return {approved:true,pkg,validation,history,manager:review};
    }
    if(round===maxRevisions) break;

    const revision=await reviseSocialPackage({
      directive,
      brief,
      pkg,
      review:review.data,
      round:round+1
    });
    history.push({
      round:round+1,
      event:'returned_to_specialist',
      target_agent:revision.target_agent,
      provider:revision.provider,
      model:revision.model
    });
    pkg=revision.data;
    validation=validatePackage(pkg);
  }

  return {approved:false,pkg,validation,history,manager:null};
}

async function persistDailyPost({org,day,slot,directive,brief,pkg,platforms,settings,trace}){
  const now=new Date().toISOString();
  const approvedBy=String(settings?.approved_by||'').trim()||null;
  const ownerApprovalRequired=settings?.owner_approval_required!==false;
  const assetKey=String(pkg.asset_key||brief.asset_key||directive.asset_key||'').trim();
  const selectedAsset=approvedAsset(settings,assetKey);
  if(!selectedAsset){
    throw Object.assign(new Error('social_visual_not_approved'),{
      code:'SOCIAL_VISUAL_NOT_APPROVED',
      asset_key:assetKey||null
    });
  }

  const itemRows=await rest('content_items',{
    method:'POST',
    prefer:'return=representation',
    body:{
      organization_id:org.id,
      status:ownerApprovalRequired?'review':'approved',
      content_type:'social_post',
      title:`[AUTO ${slot||day}] ${String(pkg.title||brief.hook||'Tiqnora Social').slice(0,180)}`,
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
      approved_by:ownerApprovalRequired?null:approvedBy,
      approved_at:ownerApprovalRequired?null:now,
      metadata:{
        source:'daily_social_autopilot',
        autopilot_day:day,
        autopilot_slot:slot||null,
        user_authorized_auto_publish:false,
        owner_approval_required:ownerApprovalRequired,
        approval_channel:'telegram_group',
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
      status:ownerApprovalRequired?'review':'approved',
      metadata:{source:'daily_social_autopilot',autopilot_slot:slot||null,image_url:selectedAsset,owner_approval_required:ownerApprovalRequired}
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
      status:ownerApprovalRequired?'review':'approved',
      metadata:{source:'daily_social_autopilot',autopilot_slot:slot||null,image_url:selectedAsset,owner_approval_required:ownerApprovalRequired}
    });
  }
  if(platforms.has('tiktok')){
    variantPayloads.push({
      organization_id:org.id,content_id:item.id,platform:'tiktok',
      headline:String(pkg.title||'').slice(0,90)||null,
      hook:String(brief.hook||'').slice(0,300)||null,
      body:String(pkg.tiktok?.body||pkg.instagram?.body||'').trim(),
      cta:String(pkg.cta||brief.cta||directive.cta||'').slice(0,220)||null,
      hashtags:cleanTags(pkg.tiktok?.hashtags||pkg.instagram?.hashtags||[]).slice(0,5),
      status:ownerApprovalRequired?'review':'approved',
      metadata:{source:'daily_social_autopilot',autopilot_slot:slot||null,image_url:selectedAsset,owner_approval_required:ownerApprovalRequired}
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
        status:ownerApprovalRequired?'waiting_approval':'queued',
        scheduled_at:now,
        requires_approval:ownerApprovalRequired,
        metadata:{
          source:'daily_social_autopilot',
          autopilot_day:day,
          autopilot_slot:slot||null,
          user_authorized_auto_publish:false,
          owner_approval_required:ownerApprovalRequired,
          approval_channel:'telegram_group',
          image_url:selectedAsset
        }
      }
    });
    const row=Array.isArray(q)?q[0]:q;
    if(row) queues.push(row);
  }

  let approvalNotification=null;
  if(ownerApprovalRequired){
    approvalNotification=await notifySocialApproval({
      organizationId:org.id,
      contentId:item.id
    }).catch(error=>({ok:false,reason:'telegram_approval_notification_failed',error:String(error.message||error).slice(0,300)}));
  }

  return {item,variants,queues,asset:selectedAsset,ownerApprovalRequired,approvalNotification};
}

export async function ensureDailySocialAutopilot({force=false}={}){
  const org=await organization();
  const config=org.settings?.social_autopilot||{};
  if(config.enabled!==true && !force){
    return {ok:true,enabled:false,created:false,reason:'disabled'};
  }

  const cadence=slotRiyadh(config.interval_hours||2);
  const day=cadence.day;
  const slot=cadence.slot;
  if(!force){
    const existing=await alreadyPrepared(org.id,{day,slot});
    if(existing) return {ok:true,enabled:true,created:false,reason:'already_prepared_slot',content_id:existing.id,day,slot,interval_hours:cadence.interval_hours};
  }

  const connected=await activePlatforms(org.id);
  const requested=Array.isArray(config.platforms)?config.platforms:['facebook','instagram'];
  const supported=new Set(requested.filter(p=>['facebook','instagram','tiktok'].includes(String(p).toLowerCase())).map(p=>String(p).toLowerCase()));
  const publishPlatforms=new Set([...supported].filter(p=>connected.has(p)));
  if(!publishPlatforms.size){
    return {ok:false,enabled:true,created:false,reason:'no_supported_connected_platforms',connected:[...connected]};
  }

  const manager=await managerDirective(day,slot);
  const marketing=await marketingBrief(manager.data);
  const social=await socialPackage(manager.data,marketing.data);

  const reviewEnabled=config.manager_review_enabled!==false;
  const revisionLimit=Math.max(0,Math.min(3,Number(config.manager_revision_limit??2)));
  const review=reviewEnabled
    ? await managerReviewLoop({
        directive:manager.data,
        brief:marketing.data,
        initialPackage:social.data,
        maxRevisions:revisionLimit
      })
    : {approved:true,pkg:social.data,validation:validatePackage(social.data),history:[]};

  if(!review.approved){
    return {
      ok:false,
      enabled:true,
      created:false,
      reason:'manager_review_not_approved',
      validation:review.validation,
      manager_review:review.history
    };
  }

  const assetKey=String(review.pkg?.asset_key||marketing.data?.asset_key||manager.data?.asset_key||'').trim();
  const selectedApprovedAsset=approvedAsset(config,assetKey);
  if(config.require_approved_asset!==false && !selectedApprovedAsset){
    return {
      ok:false,
      enabled:true,
      created:false,
      reason:'approved_visual_missing',
      asset_key:assetKey||null,
      message:'Auto-publish blocked until a Gold Standard visual is explicitly approved for this service.',
      manager_review:review.history
    };
  }

  const persisted=await persistDailyPost({
    org,day,slot,
    directive:manager.data,
    brief:marketing.data,
    pkg:review.pkg,
    platforms:publishPlatforms,
    settings:config,
    trace:{
      manager:{provider:manager.provider,model:manager.model},
      marketing:{provider:marketing.provider,model:marketing.model},
      social:{provider:social.provider,model:social.model},
      manager_review:review.history
    }
  });

  return {
    ok:true,
    enabled:true,
    created:true,
    day,
    slot,
    interval_hours:cadence.interval_hours,
    platforms:[...publishPlatforms],
    content_id:persisted.item.id,
    queue_ids:persisted.queues.map(x=>x.id),
    asset:persisted.asset,
    title:persisted.item.title,
    manager_approved:true,
    owner_approval_required:Boolean(persisted.ownerApprovalRequired),
    approval_notification:persisted.approvalNotification,
    manager_review:review.history
  };
}

export default {ensureDailySocialAutopilot};
