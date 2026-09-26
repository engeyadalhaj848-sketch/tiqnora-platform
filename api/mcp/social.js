/**
 * Tiqnora MCP Social Bridge
 * Primary AI path: MCP client (ChatGPT/other MCP host).
 * Gemini stays optional fallback outside this endpoint.
 *
 * Security: Supabase admin session required for tool execution.
 * Publishing is approval-gated; this bridge never bypasses Social Studio approval.
 */
import {
  createCampaign,
  generateContentIdeas,
  generateContentDraft,
  adaptToChannels,
  generateCreativeBrief,
  canPublish
} from '../../lib/v6/social-studio.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mndyabvlhvrhdbgmepkg.supabase.co';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON = process.env.SUPABASE_ANON_KEY || '';

const TOOL_DEFS = [
  { name:'social.create_draft', description:'Create an approval-gated Tiqnora social draft.', inputSchema:{type:'object',properties:{campaign:{type:'object'},idea:{type:'object'},brand_profile:{type:'object'}}} },
  { name:'social.create_variants', description:'Adapt an existing draft for selected social channels.', inputSchema:{type:'object',required:['draft'],properties:{draft:{type:'object'},platforms:{type:'array',items:{type:'string'}},brand_profile:{type:'object'}}} },
  { name:'social.create_creative_brief', description:'Create a brand-safe visual creative brief.', inputSchema:{type:'object',required:['draft'],properties:{draft:{type:'object'},platform:{type:'string'},brand_profile:{type:'object'}}} },
  { name:'social.publish', description:'Queue approved Tiqnora content for provider delivery. Never bypasses approval.', inputSchema:{type:'object',required:['content'],properties:{content:{type:'object'},content_id:{type:'string'},variant_id:{type:'string'},organization_id:{type:'string'},platform:{type:'string'},scheduled_at:{type:'string'}}} },
  { name:'social.status', description:'Return MCP social bridge capability/status.', inputSchema:{type:'object',properties:{}} }
];

function send(res,status,payload){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  return res.end(JSON.stringify(payload));
}

async function verifyAdmin(header){
  if(!SERVICE) return {ok:false,status:503,error:'server_not_configured'};
  const token=String(header||'').match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token) return {ok:false,status:401,error:'admin_auth_required'};
  try{
    const ur=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{Authorization:`Bearer ${token}`,apikey:ANON||SERVICE}});
    const user=await ur.json().catch(()=>null);
    if(!ur.ok||!user?.id) return {ok:false,status:401,error:'invalid_admin_session'};
    const pr=await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,is_active&limit=1`,{headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`}});
    const rows=await pr.json().catch(()=>[]);
    const profile=Array.isArray(rows)?rows[0]:null;
    if(!pr.ok) return {ok:false,status:503,error:'admin_profile_unavailable'};
    if(!profile||profile.is_active===false||!['admin','super_admin'].includes(String(profile.role||''))) return {ok:false,status:403,error:'admin_permission_required'};
    return {ok:true,user,role:profile.role};
  }catch{return {ok:false,status:503,error:'admin_auth_unavailable'};}
}

async function supa(path, options={}){
  if(!SERVICE) throw Object.assign(new Error('server_not_configured'),{status:503});
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SERVICE,Authorization:`Bearer ${SERVICE}`,'Content-Type':'application/json',...(options.headers||{})}});
  const data=await r.json().catch(()=>null);
  if(!r.ok) throw Object.assign(new Error(data?.message||`Supabase ${r.status}`),{status:r.status});
  return data;
}

async function resolveOrganization(requestedId,userId){
  if(requestedId){
    const rows=await supa(`organization_members?organization_id=eq.${encodeURIComponent(requestedId)}&user_id=eq.${encodeURIComponent(userId)}&select=organization_id&limit=1`);
    if(rows?.[0]?.organization_id) return String(rows[0].organization_id);
    throw Object.assign(new Error('organization_access_denied'),{status:403});
  }
  const rows=await supa(`profiles?id=eq.${encodeURIComponent(userId)}&select=default_organization_id&limit=1`);
  if(rows?.[0]?.default_organization_id) return String(rows[0].default_organization_id);
  const orgs=await supa('organizations?slug=eq.tiqnora&select=id&limit=1');
  if(orgs?.[0]?.id) return String(orgs[0].id);
  throw Object.assign(new Error('organization_missing'),{status:409});
}

async function executeTool(name,args={},admin=null){
  if(name==='social.status') return {ok:true,primary_provider:'mcp',fallback_provider:'gemini_optional',approval_required:true,tools:TOOL_DEFS.map(t=>t.name)};
  if(name==='social.create_draft'){
    const campaign=createCampaign(args.campaign||{},args.brand_profile||{});
    const idea=args.idea||generateContentIdeas(campaign,args.brand_profile||{},{count:1})[0];
    return generateContentDraft(idea,campaign,args.brand_profile||{});
  }
  if(name==='social.create_variants') return adaptToChannels(args.draft||{},args.platforms||[],args.brand_profile||{});
  if(name==='social.create_creative_brief') return generateCreativeBrief({...(args.draft||{}), platform:args.platform||args.draft?.platform||'instagram'},args.brand_profile||{});
  if(name==='social.publish'){
    const content=args.content||{};
    const gate=canPublish(content);
    if(!gate?.ok) return {ok:false,gate,queued:false,message:'Publishing blocked until human approval requirements are satisfied.'};
    if(!admin?.user?.id) throw Object.assign(new Error('admin_auth_required'),{status:401});
    const platform=String(args.platform||content.platform||'').toLowerCase();
    if(!['instagram','facebook','linkedin','tiktok','whatsapp','telegram'].includes(platform)) throw Object.assign(new Error('unsupported_platform'),{status:400});
    const organizationId=await resolveOrganization(args.organization_id,admin.user.id);
    const rows=await supa('publishing_queue',{
      method:'POST',
      headers:{Prefer:'return=representation'},
      body:JSON.stringify({
        organization_id:organizationId,
        content_id:args.content_id||null,
        variant_id:args.variant_id||null,
        platform,
        status:'queued',
        scheduled_at:args.scheduled_at||null,
        requires_approval:false,
        metadata:{source:'mcp',approved_status:content.status,requested_by:admin.user.id}
      })
    });
    const job=Array.isArray(rows)?rows[0]:null;
    return {ok:true,gate,queued:true,queue_id:job?.id||null,platform,status:job?.status||'queued',delivery:'provider_worker',message:'Approved content queued for provider delivery.'};
  }
  throw Object.assign(new Error('unknown_tool'),{status:404});
}

export default async function handler(req,res){
  if(req.method==='GET') return send(res,200,{name:'tiqnora-social-mcp',version:'0.1.0',transport:'http-jsonrpc',primary_provider:'mcp',fallback_provider:'gemini_optional',approval_required:true});
  if(req.method!=='POST') return send(res,405,{error:'method_not_allowed'});

  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const id=body.id??null;
  if(body.jsonrpc!=='2.0') return send(res,400,{jsonrpc:'2.0',id,error:{code:-32600,message:'Invalid Request'}});

  if(body.method==='initialize') return send(res,200,{jsonrpc:'2.0',id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'tiqnora-social-mcp',version:'0.1.0'}}});
  if(body.method==='tools/list') return send(res,200,{jsonrpc:'2.0',id,result:{tools:TOOL_DEFS}});

  if(body.method==='tools/call'){
    const admin=await verifyAdmin(req.headers.authorization||'');
    if(!admin.ok) return send(res,admin.status,{jsonrpc:'2.0',id,error:{code:-32001,message:admin.error}});
    try{
      const result=await executeTool(body.params?.name,body.params?.arguments||{},admin);
      return send(res,200,{jsonrpc:'2.0',id,result:{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result}});
    }catch(e){
      return send(res,e.status||400,{jsonrpc:'2.0',id,error:{code:-32602,message:e.message||'tool_error'}});
    }
  }
  return send(res,404,{jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}});
}
