import { generateStructured } from './ai/provider.js';
import { notifySocialApproval } from './social-approval.js';
import { DESIGN_FORMATS, generateDesignAsset } from './v6/image-designer.js';
import { composeServiceExplanation } from './social-functional-overlay.js';

const SUPABASE_URL=(process.env.SUPABASE_URL||'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/,'');
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const SOCIAL_BUCKET='social-creatives';
const PRIMARY_FORMAT=DESIGN_FORMATS.find(x=>x.key==='portrait')||DESIGN_FORMATS[0];

const SERVICE_VISUALS=Object.freeze({
  web_design:{
    vertical:'web_design',
    headline_ar:'تصميم مواقع ومتاجر احترافية',
    sub_ar:'تجربة رقمية تليق بعلامتك وتسهّل رحلة العميل'
  },
  whatsapp_automation:{
    vertical:'whatsapp_automation',
    headline_ar:'أتمتة WhatsApp بذكاء',
    sub_ar:'حوّل المحادثات إلى رحلة عميل منظمة وقابلة للمتابعة'
  },
  ai_agents:{
    vertical:'ai_agents',
    headline_ar:'وكلاء ذكاء اصطناعي للأعمال',
    sub_ar:'خفف المهام المتكررة وخَلّ فريقك يركز على القرار والنمو'
  },
  social_automation:{
    vertical:'social_automation',
    headline_ar:'أتمتة السوشيال ميديا',
    sub_ar:'نظّم المحتوى والجدولة والمتابعة مع بقاء قرار النشر عندك'
  },
  voice_agent:{
    vertical:'voice_agent',
    headline_ar:'الوكيل الصوتي الذكي',
    sub_ar:'استقبال الاستفسارات والمتابعة والتحويل لفريقك عند الحاجة'
  },
  integrated_solutions:{
    vertical:'integrated_solutions',
    headline_ar:'حلول رقمية مترابطة',
    sub_ar:'موقع ومحادثات وسوشيال ووكلاء AI ضمن رحلة أوضح'
  }
});

function headers(){
  if(!SERVICE) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return {apikey:SERVICE,Authorization:'Bearer '+SERVICE,'Content-Type':'application/json'};
}
async function rest(path,{method='GET',body=null,prefer=null}={}){
  const h=headers(); if(prefer) h.Prefer=prefer;
  const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{method,headers:h,...(body==null?{}:{body:JSON.stringify(body)})});
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw new Error(data?.message||data?.hint||('Supabase '+r.status));
  return data;
}
function encodeStoragePath(value){
  return String(value||'').split('/').filter(Boolean).map(encodeURIComponent).join('/');
}
async function uploadPublicCreative({itemId,asset}){
  if(!asset?.output_b64) throw new Error('generated creative has no image bytes');
  const path=encodeStoragePath(itemId+'/'+asset.image_job_id+'.png');
  const r=await fetch(SUPABASE_URL+'/storage/v1/object/'+SOCIAL_BUCKET+'/'+path,{
    method:'POST',
    headers:{
      apikey:SERVICE,
      Authorization:'Bearer '+SERVICE,
      'Content-Type':'image/png',
      'x-upsert':'true',
      'Cache-Control':'public, max-age=31536000, immutable'
    },
    body:Buffer.from(asset.output_b64,'base64')
  });
  if(!r.ok){
    const detail=await r.text().catch(()=>'');
    throw new Error('social creative upload failed ('+r.status+'): '+String(detail).slice(0,180));
  }
  return {
    path:itemId+'/'+asset.image_job_id+'.png',
    url:SUPABASE_URL+'/storage/v1/object/public/'+SOCIAL_BUCKET+'/'+path
  };
}
function cleanTags(value){
  return [...new Set((Array.isArray(value)?value:[]).map(x=>String(x||'').trim()).filter(Boolean).map(x=>x.startsWith('#')?x:'#'+x.replace(/\s+/g,'')))].slice(0,5);
}
function fallbackPackage(item){
  const body=String(item.body||'').trim();
  return {
    title:String(item.title||'Tiqnora').replace(/^\[GOLD STANDARD \d+\]\s*/,''),
    facebook:{body,hashtags:cleanTags(item.hashtags)},
    instagram:{body:body.slice(0,900),hashtags:cleanTags(item.hashtags)},
    tiktok:{body:String(item.hook||body).slice(0,500),hashtags:cleanTags(item.hashtags)},
    cta:String(item.cta||'ناقش مشروعك معنا.')
  };
}
async function specialistPackage(item){
  try{
    const service=String(item.metadata?.service||'');
    const out=await generateStructured({
      system:[
        'أنت فريق Tiqnora المكوّن من مدير التسويق وكاتب المحتوى ومدير السوشيال ميديا.',
        'جهّز منشوراً واحداً ممتازاً للمراجعة البشرية قبل النشر.',
        'اكتب بالعربية السعودية الطبيعية وبأسلوب شركة تقنية احترافية.',
        'اجعل كل منصة مختلفة قليلاً: Facebook تفسيري، Instagram مختصر بصري، TikTok خطاف سريع.',
        'ممنوع الأسعار الثابتة والوعود والنتائج المختلقة والجمل التسويقية المبتذلة.',
        'الهدف أن يفهم صاحب النشاط المشكلة والقيمة والخطوة التالية بسرعة.',
        'أعد JSON فقط.'
      ].join(' '),
      prompt:[
        'الخدمة: '+service,
        'العنوان الحالي: '+String(item.title||''),
        'الخطاف الحالي: '+String(item.hook||''),
        'المحتوى المرجعي: '+String(item.body||''),
        'CTA المرجعي: '+String(item.cta||'')
      ].join('\n'),
      schemaHint:'{"title":"string","facebook":{"body":"string","hashtags":["string"]},"instagram":{"body":"string","hashtags":["string"]},"tiktok":{"body":"string","hashtags":["string"]},"cta":"string"}',
      allowDeterministic:false
    });
    const d=out?.data||{};
    if(!d.facebook?.body||!d.instagram?.body||!d.tiktok?.body) return fallbackPackage(item);
    return {
      title:String(d.title||item.title||'').slice(0,180),
      facebook:{body:String(d.facebook.body).trim(),hashtags:cleanTags(d.facebook.hashtags)},
      instagram:{body:String(d.instagram.body).trim(),hashtags:cleanTags(d.instagram.hashtags)},
      tiktok:{body:String(d.tiktok.body).trim(),hashtags:cleanTags(d.tiktok.hashtags)},
      cta:String(d.cta||item.cta||'ناقش مشروعك معنا.').slice(0,300),
      provider:out.provider||null,
      model:out.model||null
    };
  }catch(_){
    return fallbackPackage(item);
  }
}
async function generateCreative(orgId,item,pkg,{functionalOverlay=true}={}){
  const service=String(item.metadata?.service||'');
  const visual=SERVICE_VISUALS[service];
  if(!visual) throw new Error('unsupported social visual service: '+service);

  const revisionBaseJobId=String(item.metadata?.revision_base_image_job_id||'').trim();
  let asset;
  let baseVision;

  if(revisionBaseJobId){
    const jobs=await rest(
      'image_jobs?image_job_id=eq.'+encodeURIComponent(revisionBaseJobId)+
      '&select=image_job_id,output_storage_path,generation_status,quality_gate&limit=1'
    ).catch(()=>[]);
    const base=jobs?.[0];
    baseVision=base?.quality_gate?.vision||{};
    if(!base?.output_storage_path||base?.generation_status!=='succeeded'||baseVision?.ok!==true){
      throw new Error('approved revision base creative unavailable');
    }
    const storagePath=encodeStoragePath(base.output_storage_path);
    const r=await fetch(SUPABASE_URL+'/storage/v1/object/designs/'+storagePath,{
      headers:{apikey:SERVICE,Authorization:'Bearer '+SERVICE}
    });
    if(!r.ok) throw new Error('revision base download failed ('+r.status+')');
    const baseB64=Buffer.from(await r.arrayBuffer()).toString('base64');
    asset={
      image_job_id:revisionBaseJobId+'_rev_'+Date.now().toString(36),
      base_image_job_id:revisionBaseJobId,
      generation_status:'succeeded',
      output_b64:baseB64,
      quality_gate:{base_revision:base?.quality_gate||null}
    };
  }else{
    asset=await generateDesignAsset({
      organizationId:orgId,
      message:[pkg.title,pkg.instagram?.body,pkg.cta].filter(Boolean).join('\n'),
      format:PRIMARY_FORMAT,
      maxRetries:1,
      campaign:{
        name:pkg.title,
        platform:'instagram',
        vertical:visual.vertical,
        headline_ar:visual.headline_ar,
        sub_ar:visual.sub_ar,
        cta_ar:'ناقش مشروعك',
        render_copy:false
      }
    });
    baseVision=asset?.quality_gate?.vision||{};
    if(asset?.generation_status!=='succeeded'||baseVision?.ok!==true){
      throw Object.assign(new Error('image designer quality gate rejected the creative'),{
        image_job_id:asset?.image_job_id||null,
        generation_status:asset?.generation_status||'failed',
        quality_gate:asset?.quality_gate||null
      });
    }
  }

  if(functionalOverlay){
    const explained=await composeServiceExplanation({
      service,
      b64:asset.output_b64,
      format:PRIMARY_FORMAT
    });
    asset.output_b64=explained.b64;
    asset.quality_gate={
      ...(asset.quality_gate||{}),
      functional_overlay:{
        ok:true,
        mode:'deterministic_ui_contract',
        service,
        labels:explained.extraText,
        verified_after_base_vision:true
      }
    };
  }

  const published=await uploadPublicCreative({itemId:item.id,asset});
  return {
    asset,
    imageUrl:published.url,
    publicPath:published.path,
    score:Number(baseVision?.score||0),
    qaProvider:baseVision?.provider||null,
    qaModel:baseVision?.model||null
  };
}
async function upsertVariant(orgId,itemId,platform,pkg,creative){
  const existing=await rest('content_variants?organization_id=eq.'+encodeURIComponent(orgId)+'&content_id=eq.'+encodeURIComponent(itemId)+'&platform=eq.'+encodeURIComponent(platform)+'&select=*&limit=1').catch(()=>[]);
  const body=pkg[platform]?.body||pkg.instagram.body;
  const hashtags=cleanTags(pkg[platform]?.hashtags||pkg.instagram.hashtags);
  const payload={
    organization_id:orgId,content_id:itemId,platform,
    headline:pkg.title,body,cta:pkg.cta,hashtags,status:'review',
    metadata:{
      ...(existing?.[0]?.metadata||{}),
      source:'agent_review_batch',
      image_url:creative.imageUrl,
      image_job_id:creative.asset.image_job_id,
      image_public_path:creative.publicPath,
      image_quality_score:creative.score,
      manager_review_status:'passed',
      owner_approval_required:true
    }
  };
  if(existing?.[0]){
    const rows=await rest('content_variants?id=eq.'+encodeURIComponent(existing[0].id),{method:'PATCH',prefer:'return=representation',body:payload});
    return rows?.[0]||existing[0];
  }
  const rows=await rest('content_variants',{method:'POST',prefer:'return=representation',body:payload});
  return rows?.[0];
}
async function ensureQueue(orgId,itemId,variant,platform,creative){
  const active=await rest(
    'publishing_queue?organization_id=eq.'+encodeURIComponent(orgId)+
    '&content_id=eq.'+encodeURIComponent(itemId)+
    '&platform=eq.'+encodeURIComponent(platform)+
    '&status=in.(waiting_approval,queued,processing)&select=*&limit=1'
  ).catch(()=>[]);
  const metadata={
    ...(active?.[0]?.metadata||{}),
    source:'agent_review_batch',
    image_url:creative.imageUrl,
    image_job_id:creative.asset.image_job_id,
    image_public_path:creative.publicPath,
    image_quality_score:creative.score,
    manager_review_status:'passed',
    owner_approval_required:true,
    approval_channel:'telegram_group',
    owner_approved_via:null,
    owner_approved_at:null
  };
  if(active?.[0]){
    const rows=await rest('publishing_queue?id=eq.'+encodeURIComponent(active[0].id),{
      method:'PATCH',
      prefer:'return=representation',
      body:{
        variant_id:variant?.id||active[0].variant_id||null,
        status:'waiting_approval',
        scheduled_at:null,
        requires_approval:true,
        error_code:null,
        error_message:null,
        metadata
      }
    });
    return rows?.[0]||active[0];
  }
  const rows=await rest('publishing_queue',{method:'POST',prefer:'return=representation',body:{
    organization_id:orgId,content_id:itemId,variant_id:variant?.id||null,platform,
    status:'waiting_approval',scheduled_at:null,requires_approval:true,
    metadata
  }});
  return rows?.[0];
}
async function disableStaleApprovalJobs(orgId,itemId,reason){
  await rest(
    'publishing_queue?organization_id=eq.'+encodeURIComponent(orgId)+
    '&content_id=eq.'+encodeURIComponent(itemId)+
    '&status=in.(waiting_approval,queued,processing)',
    {
      method:'PATCH',
      prefer:'return=minimal',
      body:{
        status:'canceled',
        requires_approval:false,
        error_code:'creative_generation_failed',
        error_message:String(reason||'creative_generation_failed').slice(0,500)
      }
    }
  ).catch(()=>null);
}
export async function prepareSocialReviewBatch({ deliverForApproval = true } = {}){
  const orgs=await rest('organizations?slug=eq.tiqnora&select=id&limit=1');
  const orgId=orgs?.[0]?.id; if(!orgId) throw new Error('tiqnora organization missing');
  const items=await rest(
    'content_items?organization_id=eq.'+encodeURIComponent(orgId)+
    '&metadata->>source=eq.gold_standard_v1&select=*&order=created_at.asc&limit=3'
  );
  const eligible=(items||[]).filter(item=>SERVICE_VISUALS[String(item.metadata?.service||'')]);

  const results=await Promise.all(eligible.map(async item=>{
    const service=String(item.metadata?.service||'');
    const pkg=await specialistPackage(item);
    let creative;
    try{
      creative=await generateCreative(orgId,item,pkg);
    }catch(error){
      await disableStaleApprovalJobs(orgId,item.id,error.message);
      await rest('content_items?id=eq.'+encodeURIComponent(item.id),{
        method:'PATCH',
        prefer:'return=minimal',
        body:{
          status:'changes_requested',
          approved_by:null,
          approved_at:null,
          metadata:{
            ...(item.metadata||{}),
            review_batch:'agents_now',
            manager_review_status:'failed',
            creative_error:String(error.message||error).slice(0,500),
            image_job_id:error.image_job_id||null,
            updated_by_pipeline_at:new Date().toISOString()
          },
          updated_at:new Date().toISOString()
        }
      }).catch(()=>null);
      return {
        content_id:item.id,
        service,
        title:pkg.title,
        ok:false,
        error:String(error.message||error).slice(0,500),
        image_job_id:error.image_job_id||null
      };
    }

    if(!deliverForApproval){
      return {
        content_id:item.id,
        service,
        title:pkg.title,
        ok:true,
        preview_only:true,
        image_job_id:creative.asset.image_job_id,
        image_quality_score:creative.score,
        image_url:creative.imageUrl
      };
    }

    const now=new Date().toISOString();
    const updated=await rest('content_items?id=eq.'+encodeURIComponent(item.id),{method:'PATCH',prefer:'return=representation',body:{
      status:'review',title:pkg.title,body:pkg.facebook.body,cta:pkg.cta,hashtags:cleanTags(pkg.facebook.hashtags),
      recommended_asset:creative.imageUrl,
      creative_brief:{
        ...(item.creative_brief||{}),
        image_url:creative.imageUrl,
        image_job_id:creative.asset.image_job_id,
        image_quality_score:creative.score
      },
      approved_by:null,approved_at:null,
      metadata:{
        ...(item.metadata||{}),
        source:'gold_standard_v1',
        review_batch:'agents_now',
        image_url:creative.imageUrl,
        image_job_id:creative.asset.image_job_id,
        image_public_path:creative.publicPath,
        image_quality_score:creative.score,
        image_qa_provider:creative.qaProvider,
        image_qa_model:creative.qaModel,
        base_image_job_id:creative.asset.base_image_job_id||null,
        revision_base_image_job_id:null,
        manager_review_status:'passed',
        owner_approval_required:true,
        approval_channel:'telegram_group',
        prepared_at:now,
        provider:pkg.provider||null,
        model:pkg.model||null
      },
      updated_at:now
    }});
    const saved=updated?.[0]||item;
    const queues=(await Promise.all(['facebook','instagram','tiktok'].map(async platform=>{
      const variant=await upsertVariant(orgId,item.id,platform,pkg,creative);
      return await ensureQueue(orgId,item.id,variant,platform,creative);
    }))).filter(Boolean);
    const notification=await notifySocialApproval({
      organizationId:orgId,
      contentId:item.id,
      forceNew:true
    });
    return {
      content_id:item.id,
      service,
      title:saved.title,
      ok:true,
      image_job_id:creative.asset.image_job_id,
      image_quality_score:creative.score,
      image_url:creative.imageUrl,
      notification,
      queue_ids:queues.map(x=>x.id)
    };
  }));

  return {
    ok:results.some(x=>x.ok),
    prepared:results.filter(x=>x.ok).length,
    failed:results.filter(x=>!x.ok).length,
    execution:'parallel',
    results
  };
}



function packageFromExistingVariants(item,variants=[]){
  const byPlatform=Object.fromEntries((variants||[]).map(v=>[String(v.platform||'').toLowerCase(),v]));
  const fb=byPlatform.facebook||{};
  const ig=byPlatform.instagram||fb;
  const tt=byPlatform.tiktok||ig;
  return {
    title:String(item.title||'Tiqnora').slice(0,180),
    facebook:{body:String(fb.body||item.body||'').trim(),hashtags:cleanTags(fb.hashtags||item.hashtags)},
    instagram:{body:String(ig.body||item.body||'').trim(),hashtags:cleanTags(ig.hashtags||item.hashtags)},
    tiktok:{body:String(tt.body||item.hook||item.body||'').trim(),hashtags:cleanTags(tt.hashtags||item.hashtags)},
    cta:String(ig.cta||fb.cta||item.cta||'ناقش مشروعك معنا.').slice(0,300),
    provider:'owner_reference',
    model:'owner_social_pack_2026_10_03'
  };
}

export async function prepareOwnerSocialPack({deliverForApproval=true}={}){
  const orgs=await rest('organizations?slug=eq.tiqnora&select=id&limit=1');
  const orgId=orgs?.[0]?.id;
  if(!orgId) throw new Error('tiqnora organization missing');

  const items=await rest(
    'content_items?organization_id=eq.'+encodeURIComponent(orgId)+
    '&metadata->>source=eq.owner_social_pack_2026_10_03&select=*&order=created_at.asc&limit=6'
  );
  const eligible=(items||[]).filter(item=>SERVICE_VISUALS[String(item.metadata?.service||'')]);

  const results=[];
  for(const item of eligible){
    const service=String(item.metadata?.service||'');
    const variants=await rest(
      'content_variants?organization_id=eq.'+encodeURIComponent(orgId)+
      '&content_id=eq.'+encodeURIComponent(item.id)+
      '&select=*&order=platform.asc'
    ).catch(()=>[]);
    const pkg=packageFromExistingVariants(item,variants);
    let creative;
    try{
      creative=await generateCreative(orgId,item,pkg,{functionalOverlay:false});
    }catch(error){
      await rest('content_items?id=eq.'+encodeURIComponent(item.id),{
        method:'PATCH',
        prefer:'return=minimal',
        body:{
          metadata:{
            ...(item.metadata||{}),
            publish_blocked:true,
            manager_review_status:'failed',
            creative_error:String(error.message||error).slice(0,500),
            image_job_id:error.image_job_id||null,
            updated_by_pipeline_at:new Date().toISOString()
          },
          updated_at:new Date().toISOString()
        }
      }).catch(()=>null);
      results.push({content_id:item.id,service,ok:false,error:String(error.message||error).slice(0,500)});
      continue;
    }

    if(!deliverForApproval){
      results.push({
        content_id:item.id,service,ok:true,preview_only:true,
        image_url:creative.imageUrl,image_job_id:creative.asset.image_job_id,
        image_quality_score:creative.score
      });
      continue;
    }

    const now=new Date().toISOString();
    await rest('content_items?id=eq.'+encodeURIComponent(item.id),{
      method:'PATCH',
      prefer:'return=minimal',
      body:{
        status:'review',
        recommended_asset:creative.imageUrl,
        creative_brief:{
          ...(item.creative_brief||{}),
          image_url:creative.imageUrl,
          image_job_id:creative.asset.image_job_id,
          image_quality_score:creative.score,
          owner_reference_pack:'2026-10-03'
        },
        approved_by:null,
        approved_at:null,
        metadata:{
          ...(item.metadata||{}),
          image_url:creative.imageUrl,
          image_job_id:creative.asset.image_job_id,
          image_public_path:creative.publicPath,
          image_quality_score:creative.score,
          image_qa_provider:creative.qaProvider,
          image_qa_model:creative.qaModel,
          manager_review_status:'passed',
          publish_blocked:false,
          publish_block_reason:null,
          owner_approval_required:true,
          approval_channel:'telegram_group',
          user_authorized_auto_publish:false,
          prepared_at:now,
          generated_from_owner_reference:true
        },
        updated_at:now
      }
    });

    const queues=[];
    for(const platform of ['facebook','instagram','tiktok']){
      const variant=await upsertVariant(orgId,item.id,platform,pkg,creative);
      const q=await ensureQueue(orgId,item.id,variant,platform,creative);
      if(q) queues.push(q);
    }
    const notification=await notifySocialApproval({organizationId:orgId,contentId:item.id,forceNew:true});
    results.push({
      content_id:item.id,service,ok:true,image_url:creative.imageUrl,
      image_job_id:creative.asset.image_job_id,image_quality_score:creative.score,
      notification,queue_ids:queues.map(x=>x.id)
    });
  }

  return {
    ok:results.some(x=>x.ok),
    prepared:results.filter(x=>x.ok).length,
    delivered:results.filter(x=>x.notification?.ok).length,
    failed:results.filter(x=>!x.ok).length,
    source:'owner_social_pack_2026_10_03',
    auto_publish:false,
    results
  };
}

export async function deliverExistingSocialReviewBatch(){
  const orgs=await rest('organizations?slug=eq.tiqnora&select=id&limit=1');
  const orgId=orgs?.[0]?.id;
  if(!orgId) throw new Error('tiqnora organization missing');

  const items=await rest(
    'content_items?organization_id=eq.'+encodeURIComponent(orgId)+
    '&metadata->>source=eq.gold_standard_v1&select=*&order=created_at.asc&limit=3'
  );

  const eligible=(items||[]).filter(item=>{
    const service=String(item.metadata?.service||'');
    const imageUrl=String(item.metadata?.image_url||item.recommended_asset||item.creative_brief?.image_url||'').trim();
    return SERVICE_VISUALS[service]
      && item.status==='review'
      && item.metadata?.manager_review_status==='passed'
      && Boolean(imageUrl);
  });

  const results=await Promise.all(eligible.map(async item=>{
    const jobs=await rest(
      'publishing_queue?organization_id=eq.'+encodeURIComponent(orgId)+
      '&content_id=eq.'+encodeURIComponent(item.id)+
      '&requires_approval=eq.true&status=eq.waiting_approval&select=id,platform,metadata'
    ).catch(()=>[]);

    if(!jobs.length){
      return {
        content_id:item.id,
        service:String(item.metadata?.service||''),
        ok:false,
        reason:'approval_queue_missing'
      };
    }

    try{
      const notification=await notifySocialApproval({
        organizationId:orgId,
        contentId:item.id,
        forceNew:true
      });
      return {
        content_id:item.id,
        service:String(item.metadata?.service||''),
        ok:Boolean(notification?.ok),
        notification,
        queue_count:jobs.length
      };
    }catch(error){
      return {
        content_id:item.id,
        service:String(item.metadata?.service||''),
        ok:false,
        reason:'telegram_delivery_failed',
        error:String(error.message||error).slice(0,300)
      };
    }
  }));

  return {
    ok:results.some(x=>x.ok),
    ready:eligible.length,
    delivered:results.filter(x=>x.ok).length,
    failed:results.filter(x=>!x.ok).length,
    reused_existing:true,
    results
  };
}

export default {prepareSocialReviewBatch,prepareOwnerSocialPack,deliverExistingSocialReviewBatch};
