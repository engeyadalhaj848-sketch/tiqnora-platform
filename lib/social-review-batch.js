import { generateStructured } from './ai/provider.js';
import { notifySocialApproval } from './social-approval.js';

const SUPABASE_URL=(process.env.SUPABASE_URL||'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/,'');
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';

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
const images={
  web_design:'https://www.tiqnora.com/assets/social/review-web-design.png',
  whatsapp_automation:'https://www.tiqnora.com/assets/social/review-whatsapp-automation.png',
  ai_agents:'https://www.tiqnora.com/assets/social/review-ai-agents.png'
};
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
async function upsertVariant(orgId,itemId,platform,pkg,imageUrl){
  const existing=await rest('content_variants?organization_id=eq.'+encodeURIComponent(orgId)+'&content_id=eq.'+encodeURIComponent(itemId)+'&platform=eq.'+encodeURIComponent(platform)+'&select=*&limit=1').catch(()=>[]);
  const body=pkg[platform]?.body||pkg.instagram.body;
  const hashtags=cleanTags(pkg[platform]?.hashtags||pkg.instagram.hashtags);
  const payload={
    organization_id:orgId,content_id:itemId,platform,
    headline:pkg.title,body,cta:pkg.cta,hashtags,status:'review',
    metadata:{source:'agent_review_batch',image_url:imageUrl,owner_approval_required:true}
  };
  if(existing?.[0]){
    const rows=await rest('content_variants?id=eq.'+encodeURIComponent(existing[0].id),{method:'PATCH',prefer:'return=representation',body:payload});
    return rows?.[0]||existing[0];
  }
  const rows=await rest('content_variants',{method:'POST',prefer:'return=representation',body:payload});
  return rows?.[0];
}
async function ensureQueue(orgId,itemId,variant,platform,imageUrl){
  const active=await rest(
    'publishing_queue?organization_id=eq.'+encodeURIComponent(orgId)+
    '&content_id=eq.'+encodeURIComponent(itemId)+
    '&platform=eq.'+encodeURIComponent(platform)+
    '&status=in.(waiting_approval,queued,processing)&select=*&limit=1'
  ).catch(()=>[]);
  if(active?.[0]) return active[0];
  const rows=await rest('publishing_queue',{method:'POST',prefer:'return=representation',body:{
    organization_id:orgId,content_id:itemId,variant_id:variant?.id||null,platform,
    status:'waiting_approval',scheduled_at:null,requires_approval:true,
    metadata:{source:'agent_review_batch',image_url:imageUrl,owner_approval_required:true,approval_channel:'telegram_group'}
  }});
  return rows?.[0];
}
export async function prepareSocialReviewBatch(){
  const orgs=await rest('organizations?slug=eq.tiqnora&select=id&limit=1');
  const orgId=orgs?.[0]?.id; if(!orgId) throw new Error('tiqnora organization missing');
  const items=await rest(
    'content_items?organization_id=eq.'+encodeURIComponent(orgId)+
    '&metadata->>source=eq.gold_standard_v1&select=*&order=created_at.asc&limit=3'
  );
  const results=[];
  for(const item of items||[]){
    const service=String(item.metadata?.service||'');
    const imageUrl=images[service];
    if(!imageUrl) continue;
    const pkg=await specialistPackage(item);
    const now=new Date().toISOString();
    const updated=await rest('content_items?id=eq.'+encodeURIComponent(item.id),{method:'PATCH',prefer:'return=representation',body:{
      status:'review',title:pkg.title,body:pkg.facebook.body,cta:pkg.cta,hashtags:cleanTags(pkg.facebook.hashtags),
      recommended_asset:imageUrl,
      creative_brief:{...(item.creative_brief||{}),image_url:imageUrl},
      approved_by:null,approved_at:null,
      metadata:{...(item.metadata||{}),source:'gold_standard_v1',review_batch:'agents_now',image_url:imageUrl,owner_approval_required:true,approval_channel:'telegram_group',prepared_at:now,provider:pkg.provider||null,model:pkg.model||null},
      updated_at:now
    }});
    const saved=updated?.[0]||item;
    const queues=[];
    for(const platform of ['facebook','instagram','tiktok']){
      const variant=await upsertVariant(orgId,item.id,platform,pkg,imageUrl);
      const job=await ensureQueue(orgId,item.id,variant,platform,imageUrl);
      if(job) queues.push(job);
    }
    const notification=await notifySocialApproval({organizationId:orgId,contentId:item.id});
    results.push({content_id:item.id,service,title:saved.title,notification,queue_ids:queues.map(x=>x.id)});
  }
  return {ok:true,prepared:results.length,results};
}

export default {prepareSocialReviewBatch};
