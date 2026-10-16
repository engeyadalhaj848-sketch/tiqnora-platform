import test from 'node:test';
import assert from 'node:assert/strict';
import {metaDirectMessageDecision as decide} from '../lib/v6/meta-direct-messages.js';
const now=Date.parse('2026-10-16T13:00:00Z');
const connection={id:'c',platform:'instagram',external_account_id:'account',status:'active'};
const event={platform:'instagram',event_type:'message.received',account_external_id:'account',author_external_id:'customer',content:'Hello',occurred_at:new Date(now-1000).toISOString()};
test('Instagram replies address the connected account and scoped sender',()=>{
 assert.deepEqual(decide(event,connection,[],now),{path:'account/messages',payload:{recipient:{id:'customer'},message:{text:''}}});
});
test('Messenger uses RESPONSE rather than unsolicited messaging',()=>{
 assert.equal(decide({...event,platform:'facebook'},{...connection,platform:'facebook'},[],now).payload.messaging_type,'RESPONSE');
});
test('old or invalid inbound timestamps cannot open the 24-hour window',()=>{
 for(const occurred_at of ['bad',new Date(now-86400000).toISOString(),new Date(now+600000).toISOString()]) assert.equal(decide({...event,occurred_at},connection,[],now).reason,'outside_session_window');
});
test('self messages and echoes cannot trigger a loop',()=>{
 assert.equal(decide({...event,author_external_id:'account'},connection,[],now).reason,'self_message');
 assert.equal(decide({...event,raw_payload:{messaging:{message_type:'message.echo'}}},connection,[],now).reason,'self_message');
});
test('wrong account and inactive connections fail closed',()=>{
 assert.equal(decide(event,{...connection,external_account_id:'other'},[],now).reason,'invalid_connection');
 assert.equal(decide(event,{...connection,status:'expired'},[],now).reason,'invalid_connection');
});
test('attachments without text are left to the team',()=>assert.equal(decide({...event,content:'[attachment]'},connection,[],now).reason,'unsupported_content'));
test('a stop request persists until a newer explicit resumption',()=>{
 const stop={event_type:'message.received',content:'لا أريد رد آلي',received_at:new Date(now-5000).toISOString()};
 assert.equal(decide(event,connection,[stop],now).reason,'human_requested');
 assert.ok(decide({...event,content:'استئناف الرد الآلي'},connection,[stop],now).path);
});
test('a human reply pauses automation but an AI reply does not',()=>{
 const reply={event_type:'message.sent',occurred_at:new Date(now-60000).toISOString(),raw_payload:{mode:'manual_reply'}};
 assert.equal(decide(event,connection,[reply],now).reason,'human_takeover');
 assert.ok(decide(event,connection,[{...reply,raw_payload:{mode:'auto_reply'}}],now).path);
});
test('a truncated history cannot be interpreted as permission to reply',()=>assert.equal(decide(event,connection,Array(100).fill({}),now).reason,'history_truncated'));
