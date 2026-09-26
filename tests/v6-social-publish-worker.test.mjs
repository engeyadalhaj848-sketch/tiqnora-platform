import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const worker=readFileSync(new URL('../api/social/publish-worker.js',import.meta.url),'utf8');
test('worker only claims approval-cleared queue rows',()=>{assert.equal(worker.includes('requires_approval=eq.false'),true);assert.equal(worker.includes("status:'processing'"),true);});
test('worker supports Facebook and Instagram Graph publishing',()=>{assert.equal(worker.includes("/feed"),true);assert.equal(worker.includes("/media_publish"),true);assert.equal(worker.includes('instagram_image_required'),true);});
test('worker does not fake TikTok or WhatsApp feed publishing',()=>{assert.equal(worker.includes('tiktok_media_consent_required'),true);assert.equal(worker.includes('whatsapp_not_feed'),true);});
test('worker records provider outcomes',()=>{assert.equal(worker.includes("status:'published'"),true);assert.equal(worker.includes("status:'failed'"),true);assert.equal(worker.includes("status:'waiting_provider'"),true);});
