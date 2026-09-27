import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const outreach=readFileSync(new URL('../lib/v6/whatsapp-outreach.js',import.meta.url),'utf8');
const report=readFileSync(new URL('../api/reports/telegram.js',import.meta.url),'utf8');
const vercel=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
const migration=readFileSync(new URL('../supabase/migrations/061_morning_whatsapp_tiktok_business_ready.sql',import.meta.url),'utf8');

test('morning WhatsApp outreach is opt-in gated and template-only',()=>{
  assert.equal(outreach.includes('whatsapp_opt_in'),true);
  assert.equal(outreach.includes("tiqnora_building_intro_ar"),true);
  assert.equal(outreach.includes("tiqnora_electrical_intro_ar"),true);
  assert.equal(outreach.includes("status||'').toUpperCase()==='APPROVED'"),true);
  assert.equal(outreach.includes('max_per_day'),true);
  assert.equal(outreach.includes('user_authorized:true'),true);
});

test('morning report is scheduled for 06:00 Riyadh and growth remains 08:00 Riyadh',()=>{
  const schedules=vercel.crons.filter(x=>x.path==='/api/reports/telegram').map(x=>x.schedule);
  assert.equal(schedules.includes('0 3 * * *'),true);
  assert.equal(schedules.includes('0 5 * * *'),true);
  assert.equal(report.includes("schedule === '0 5 * * *'"),true);
  assert.equal(report.includes('runMorningWhatsAppOutreach()'),true);
});

test('TikTok Accounts API readiness is explicitly tracked for comments and replies',()=>{
  assert.equal(migration.includes("where provider='tiktok'"),true);
  assert.equal(migration.includes("'accounts_api_required', true"),true);
  assert.equal(migration.includes("jsonb_build_array('publish','comments','replies','insights')"),true);
  assert.equal(migration.includes("'needs_authorization'"),true);
});
