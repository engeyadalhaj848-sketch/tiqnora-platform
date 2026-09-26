/**
 * Tiqnora social publishing worker.
 * Claims approval-gated publishing_queue rows and dispatches supported providers.
 * Text-first Meta publishing is live. TikTok video jobs are handed to the existing
 * consent/privacy-aware Direct Post flow; WhatsApp feed/status publishing is not
 * treated as a social feed.
 */
import { createDecipheriv } from 'node:crypto';

const BASE=process.env.SUPABASE_URL||'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';

function send(res,s,b){res.statusCode=s;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');return res.end(JSON.stringify(b));}
async function sb(path,opt={}){
 if(!SERVICE) throw Object.assign(new Error('server_not_configured'),{status:503});
 const r=await fetch(`${BASE}/rest/v1/${path}`,{...opt,headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json',...(opt.headers||{})}});
 const d=await r.json().catch(()=>null); if(!r.ok) throw Object.assign(new Error(d?.message||`Supabase ${r.status}`),{status:r.status}); return d;
}
function decrypt(ciphertext,iv,tag){
 const key=Buffer.from(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY||'','base64'); if(key.length!==32) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY invalid');
 const d=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url')); d.setAuthTag(Buffer.from(tag,'base64url'));
 return Buffer.concat([d.update(Buffer.from(ciphertext,'base64url')),d.final()]).toString();
}
async function graphPost(path,token,payload){
 const u=new URL(`https://graph.facebook.com/v22.0/${path}`); u.searchParams.set('access_token',token);
 const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const d=await r.json().catch(()=>({})); if(!r.ok||d.error) throw new Error(d?.error?.message||`Meta ${r.status}`); return d;
}
async function loadText(job){
 if(job.variant_id){const v=await sb(`content_variants?id=eq.${encodeURIComponent(job.variant_id)}&organization_id=eq.${encodeURIComponent(job.organization_id)}&select=*&limit=1`);if(v?.[0]) return [v[0].body,...(v[0].hashtags||[])].filter(Boolean).join('\n\n');}
 if(job.content_id){const c=await sb(`content_items?id=eq.${encodeURIComponent(job.content_id)}&organization_id=eq.${encodeURIComponent(job.organization_id)}&select=*&limit=1`);if(c?.[0]) return [c[0].body,...(c[0].hashtags||[])].filter(Boolean).join('\n\n');}
 return String(job.metadata?.body||'').trim();
}
async function metaToken(org){
 const rows=await sb(`social_provider_tokens?organization_id=eq.${encodeURIComponent(org)}&provider=eq.meta&select=ciphertext,iv,tag&limit=1`);
 if(!rows?.[0]) throw new Error('meta_not_connected'); return decrypt(rows[0].ciphertext,rows[0].iv,rows[0].tag);
}
async function dispatch(job){
 const text=await loadText(job); if(!text) throw new Error('empty_content');
 if(job.platform==='facebook'){
   const con=await sb(`social_connections?organization_id=eq.${encodeURIComponent(job.organization_id)}&platform=eq.facebook&status=eq.active&select=external_account_id,settings&order=updated_at.desc&limit=1`);
   const page=con?.[0]; if(!page) throw new Error('facebook_not_connected');
   let token=null; const enc=page.settings?.page_access_token_enc;
   if(enc?.ciphertext) token=decrypt(enc.ciphertext,enc.iv,enc.tag); if(!token) token=await metaToken(job.organization_id);
   const out=await graphPost(`${page.external_account_id}/feed`,token,{message:text}); return {external_id:out.id||null};
 }
 if(job.platform==='instagram'){
   const con=await sb(`social_connections?organization_id=eq.${encodeURIComponent(job.organization_id)}&platform=eq.instagram&status=eq.active&select=external_account_id,settings&order=updated_at.desc&limit=1`);
   const ig=con?.[0]; const imageUrl=job.metadata?.image_url; if(!ig) throw new Error('instagram_not_connected'); if(!imageUrl) throw new Error('instagram_image_required');
   let token=null; const enc=ig.settings?.page_access_token_enc; if(enc?.ciphertext) token=decrypt(enc.ciphertext,enc.iv,enc.tag); if(!token) token=await metaToken(job.organization_id);
   const create=await graphPost(`${ig.external_account_id}/media`,token,{image_url:imageUrl,caption:text});
   const out=await graphPost(`${ig.external_account_id}/media_publish`,token,{creation_id:create.id}); return {external_id:out.id||null};
 }
 if(job.platform==='tiktok') return {deferred:true,code:'tiktok_media_consent_required',message:'Use existing TikTok Direct Post flow for creator info, privacy, consent and media upload.'};
 if(job.platform==='whatsapp') return {deferred:true,code:'whatsapp_not_feed',message:'WhatsApp outbound remains conversation/template based; no feed publishing is assumed.'};
 return {deferred:true,code:'provider_worker_pending',message:`${job.platform} provider dispatch is not enabled in this worker yet.`};
}
async function mark(id,patch){return sb(`publishing_queue?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({...patch,updated_at:new Date().toISOString()})});}

export default async function handler(req,res){
 if(!['GET','POST'].includes(req.method)) return send(res,405,{error:'method_not_allowed'});
 const secret=process.env.CRON_SECRET; const auth=String(req.headers.authorization||'');
 if(secret&&auth!==`Bearer ${secret}`) return send(res,401,{error:'unauthorized'});
 try{
   const now=new Date().toISOString();
   const jobs=await sb(`publishing_queue?status=eq.queued&requires_approval=eq.false&or=(scheduled_at.is.null,scheduled_at.lte.${encodeURIComponent(now)})&select=*&order=created_at.asc&limit=5`);
   const results=[];
   for(const job of jobs||[]){
     try{
       await mark(job.id,{status:'processing',attempts:Number(job.attempts||0)+1});
       const out=await dispatch(job);
       if(out.deferred){await mark(job.id,{status:'waiting_provider',error_code:out.code,error_message:out.message});results.push({id:job.id,platform:job.platform,status:'waiting_provider',code:out.code});continue;}
       await mark(job.id,{status:'published',external_id:out.external_id||null,published_at:new Date().toISOString(),error_code:null,error_message:null});
       results.push({id:job.id,platform:job.platform,status:'published',external_id:out.external_id||null});
     }catch(e){
       await mark(job.id,{status:'failed',error_code:'provider_error',error_message:String(e.message||e).slice(0,500)}).catch(()=>null);
       results.push({id:job.id,platform:job.platform,status:'failed',error:String(e.message||e)});
     }
   }
   return send(res,200,{ok:true,processed:results.length,results});
 }catch(e){return send(res,e.status||500,{error:e.message||'worker_error'});}
}
