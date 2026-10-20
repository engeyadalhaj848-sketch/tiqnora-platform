import test from 'node:test';
import assert from 'node:assert/strict';
import {validWorkspaceReply,workspaceReplyContext,visibleWorkspaceReplyEvent} from '../lib/workspace-reply-auth.js';
import {authenticateAdmin} from '../api/social/oauth/[provider].js';
const event_id='12345678-1234-4234-8234-123456789012';
test('staff reply does not allow arbitrary recipients, proposals or templates',()=>{
 assert.equal(validWorkspaceReply({event_id,message:'hello'}),true);
 for(const extra of [{recipient_id:'other'},{platform:'whatsapp'},{template:{name:'x'}},{action_id:'x'},{organization_id:'x'}])assert.equal(validWorkspaceReply({event_id,message:'hello',...extra}),false);
 assert.equal(validWorkspaceReply({message:'hello'}),false);
});
test('invalid or denied workspace context fails closed',async()=>{
 const input={base:'https://example.invalid',apikey:'public',token:'test'};
 assert.equal(await workspaceReplyContext({...input,fetchImpl:async()=>({ok:false})}),null);
 assert.equal(await workspaceReplyContext({...input,fetchImpl:async()=>({ok:true,json:async()=>null})}),null);
});
test('delegated event lookup uses actor JWT and requires visible incoming event',async()=>{
 const input={base:'https://example.invalid',apikey:'public',token:'actor',eventId:event_id,organizationId:'org'};
 assert.equal(await visibleWorkspaceReplyEvent({...input,fetchImpl:async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer actor');
  assert.match(url,/message.received,comment.created/);
  return {ok:true,json:async()=>[]};
 }}),false);
});

test('delegated staff authorization applies only to reply, never OAuth/admin operations',async()=>{
 const originalFetch=globalThis.fetch,originalKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 process.env.SUPABASE_SERVICE_ROLE_KEY='test-key';
 let calls=0,active=true,granted=true;
 globalThis.fetch=async(url)=>{
  const path=String(url);
  if(path.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'staff'})};
  if(path.includes('/profiles?'))return {ok:true,json:async()=>[{id:'staff',role:'customer',is_active:active}]};
  if(path.endsWith('/rpc/rose_social_context')){calls++;return {ok:true,json:async()=>granted?{owner:'root',organizationId:'org'}:null};}
  throw new Error('Unexpected external request');
 };
 try{
  assert.equal((await authenticateAdmin('Bearer actor')).ok,false);
  assert.equal(calls,0);
  const allowed=await authenticateAdmin('Bearer actor',{allowWorkspaceReply:true});
  assert.equal(allowed.ok,true);assert.equal(allowed.admin.role,'workspace_agent');
  granted=false;
  assert.equal((await authenticateAdmin('Bearer actor',{allowWorkspaceReply:true})).ok,false);
  active=false;granted=true;
  assert.equal((await authenticateAdmin('Bearer actor',{allowWorkspaceReply:true})).ok,false);
 }finally{
  globalThis.fetch=originalFetch;
  if(originalKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=originalKey;
 }
});

