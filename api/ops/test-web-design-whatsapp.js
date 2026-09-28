import { ycloudRequest } from '../../lib/integrations/ycloud-templates.js';

const SUPABASE_URL=(process.env.SUPABASE_URL||'https://mndyabvlhvrhdbgmepkg.supabase.co').replace(/\/$/,'');
const SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const TARGET='+966561323977';
const MARKER='manual_web_design_test_2026_09_28';

function send(res,status,payload){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
function headers(){
  if(!SERVICE) throw Object.assign(new Error('SUPABASE_SERVICE_ROLE_KEY missing'),{status:503});
  return {apikey:SERVICE,Authorization:'Bearer '+SERVICE,'Content-Type':'application/json'};
}
async function rest(path,{method='GET',body=null,prefer=null}={}){
  const h=headers();
  if(prefer) h.Prefer=prefer;
  const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{
    method,headers:h,...(body==null?{}:{body:JSON.stringify(body)})
  });
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw Object.assign(new Error(data?.message||data?.hint||'Supabase '+r.status),{status:r.status});
  return data;
}
function normalizeE164(value){
  const raw=String(value||'').trim();
  const cleaned=raw.replace(/[^+\d]/g,'');
  if(/^\+[1-9]\d{6,14}$/.test(cleaned)) return cleaned;
  if(/^966\d{9}$/.test(cleaned)) return '+'+cleaned;
  if(/^05\d{8}$/.test(cleaned)) return '+966'+cleaned.slice(1);
  return '';
}

export default async function handler(req,res){
  if(req.method!=='GET') return send(res,405,{error:'Method not allowed'});
  try{
    const prior=await rest(
      'crm_activities?metadata->>kind=eq.'+encodeURIComponent(MARKER)+'&select=id,created_at&limit=1'
    ).catch(()=>[]);
    if(prior?.[0]) return send(res,200,{ok:true,already_sent:true,activity_id:prior[0].id});

    const leads=await rest(
      'leads?or=(phone.eq.%2B966561323977,whatsapp.eq.%2B966561323977)&select=id,name,company_name,custom_fields&limit=5'
    );
    const lead=(leads||[]).find(row=>row?.custom_fields?.send_authorized_channel==='whatsapp');
    if(!lead) return send(res,409,{error:'Authorized test lead not found'});

    const connectionRows=await rest(
      'social_connections?platform=eq.whatsapp&status=eq.active&select=id,external_account_id,settings&order=updated_at.desc&limit=10'
    );
    const connection=(connectionRows||[]).find(row=>
      row?.settings?.provider==='ycloud' &&
      row?.settings?.ycloud_verified===true &&
      row?.settings?.webhook_subscribed===true
    );
    if(!connection) return send(res,409,{error:'Active YCloud WhatsApp connection not found'});
    const from=normalizeE164(connection.external_account_id);
    if(!from) return send(res,409,{error:'Invalid sender number'});

    const text=[
      'مرحبًا 👋 معك Tiqnora AI.',
      'الموقع الاحترافي يساعد نشاطك يظهر بشكل أوضح وموثوق، يعرض خدماتك بطريقة مرتبة، ويوجه الزائر مباشرة للاستفسار عبر واتساب أو طلب عرض سعر.',
      'إذا تحب، نجهز لك تصورًا مبدئيًا لموقع يناسب نشاطك ونوضح لك كيف نحول الزيارات إلى فرص عملاء.',
      'https://www.tiqnora.com/services/web-design'
    ].join('\n\n');

    const apiResult=await ycloudRequest('/v2/whatsapp/messages',{
      method:'POST',
      body:{from,to:TARGET,type:'text',text:{body:text,previewUrl:true}}
    });
    const externalId=String(apiResult?.wamid||apiResult?.id||'').trim();
    if(!externalId) return send(res,502,{error:'YCloud returned no message id'});

    const orgs=await rest('organizations?slug=eq.tiqnora&select=id&limit=1');
    const orgId=orgs?.[0]?.id||null;
    await rest('crm_activities',{
      method:'POST',
      prefer:'return=minimal',
      body:{
        organization_id:orgId,
        lead_id:lead.id,
        activity_type:'system',
        title:'تم إرسال رسالة اختبار تصميم المواقع عبر WhatsApp',
        body:'Website design value proposition test message',
        metadata:{
          kind:MARKER,
          provider:'ycloud',
          recipient:TARGET,
          outbound_external_id:externalId,
          explicit_user_authorization:true
        }
      }
    }).catch(()=>null);

    return send(res,200,{ok:true,sent:true,status:apiResult?.status||'accepted',outbound_external_id:externalId});
  }catch(error){
    return send(res,error.status||500,{ok:false,error:String(error.message||error),code:error.code||null});
  }
}
