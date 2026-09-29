import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

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
  if(!r.ok) throw Object.assign(new Error(data?.message||data?.hint||`Supabase ${r.status}`),{status:r.status,details:data});
  return data;
}

function decrypt(ciphertext,iv,tag){
  const key=Buffer.from(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY||'','base64');
  if(key.length!==32) throw Object.assign(new Error('SOCIAL_TOKEN_ENCRYPTION_KEY invalid'),{status:503});
  const d=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));
  d.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([d.update(Buffer.from(ciphertext,'base64url')),d.final()]).toString();
}

function encrypt(value){
  const key=Buffer.from(process.env.SOCIAL_TOKEN_ENCRYPTION_KEY||'','base64');
  if(key.length!==32) throw Object.assign(new Error('SOCIAL_TOKEN_ENCRYPTION_KEY invalid'),{status:503});
  const iv=randomBytes(12);
  const c=createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([c.update(String(value)),c.final()]);
  return {
    ciphertext:ciphertext.toString('base64url'),
    iv:iv.toString('base64url'),
    tag:c.getAuthTag().toString('base64url')
  };
}

function apiError(message,{status=502,code='tiktok_business_error',details=null}={}){
  return Object.assign(new Error(message),{status,code,details});
}

async function tokenRow(organizationId){
  const rows=await rest(
    'social_provider_tokens?organization_id=eq.'+encodeURIComponent(organizationId)
    +'&provider=eq.tiktok_business'
    +'&select=id,ciphertext,iv,tag,refresh_ciphertext,refresh_iv,refresh_tag,scopes,open_id,expires_at,refresh_expires_at&limit=1'
  );
  return rows?.[0]||null;
}

async function refresh(row){
  const appId=String(process.env.TIKTOK_BUSINESS_APP_ID||'').trim();
  const appSecret=String(process.env.TIKTOK_BUSINESS_APP_SECRET||'').trim();
  if(!appId||!appSecret) throw apiError('TikTok Business credentials missing',{status:503,code:'credentials_missing'});
  if(!row?.refresh_ciphertext) throw apiError('TikTok Business reauthorization required',{status:409,code:'reauthorization_required'});

  const refreshToken=decrypt(row.refresh_ciphertext,row.refresh_iv,row.refresh_tag);
  const r=await fetch('https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/refresh_token/',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      client_id:appId,
      client_secret:appSecret,
      grant_type:'refresh_token',
      refresh_token:refreshToken
    })
  });
  const payload=await r.json().catch(()=>({}));
  const data=payload?.data||{};
  if(!r.ok||Number(payload?.code||0)!==0||!data.access_token){
    throw apiError(payload?.message||`TikTok token refresh failed (${r.status})`,{
      status:r.status||502,code:'refresh_failed',details:payload
    });
  }

  const a=encrypt(data.access_token);
  const nextRefresh=String(data.refresh_token||refreshToken);
  const rr=encrypt(nextRefresh);
  const patch={
    ...a,
    refresh_ciphertext:rr.ciphertext,
    refresh_iv:rr.iv,
    refresh_tag:rr.tag,
    scopes:data.scope||row.scopes||null,
    open_id:data.open_id||row.open_id||null,
    expires_at:data.expires_in?new Date(Date.now()+Number(data.expires_in)*1000).toISOString():null,
    refresh_expires_at:data.refresh_token_expires_in?new Date(Date.now()+Number(data.refresh_token_expires_in)*1000).toISOString():row.refresh_expires_at||null,
    updated_at:new Date().toISOString()
  };
  await rest('social_provider_tokens?id=eq.'+encodeURIComponent(row.id),{method:'PATCH',body:patch});
  return {accessToken:String(data.access_token),businessId:String(data.open_id||row.open_id||''),scopes:String(patch.scopes||'')};
}

export async function getTikTokBusinessAccess(organizationId){
  const row=await tokenRow(organizationId);
  if(!row) throw apiError('TikTok Business Accounts API not connected',{status:409,code:'not_connected'});
  const businessId=String(row.open_id||'').trim();
  if(!businessId) throw apiError('TikTok Business account ID missing',{status:409,code:'business_id_missing'});
  const exp=row.expires_at?new Date(row.expires_at).getTime():0;
  if(exp && exp<=Date.now()+10*60*1000) return refresh(row);
  return {accessToken:decrypt(row.ciphertext,row.iv,row.tag),businessId,scopes:String(row.scopes||'')};
}

export async function tiktokBusinessPost(path,accessToken,payload){
  const r=await fetch('https://business-api.tiktok.com/open_api/v1.3/'+String(path||'').replace(/^\//,''),{
    method:'POST',
    headers:{'Access-Token':accessToken,'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok||Number(data?.code||0)!==0){
    throw apiError(data?.message||`TikTok Business API ${r.status}`,{status:r.status||502,code:'provider_error',details:data});
  }
  return data;
}

export async function tiktokBusinessGet(path,accessToken,params={}){
  const u=new URL('https://business-api.tiktok.com/open_api/v1.3/'+String(path||'').replace(/^\//,''));
  for(const [k,v] of Object.entries(params)) if(v!==undefined&&v!==null&&String(v)!=='') u.searchParams.set(k,String(v));
  const r=await fetch(u,{headers:{'Access-Token':accessToken,'Cache-Control':'no-cache'}});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||Number(data?.code||0)!==0){
    throw apiError(data?.message||`TikTok Business API ${r.status}`,{status:r.status||502,code:'provider_error',details:data});
  }
  return data;
}
