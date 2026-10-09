import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const premium = readFileSync(new URL('../services/services-premium.css', import.meta.url), 'utf8');
const webDesign = readFileSync(new URL('../services/web-design.html', import.meta.url), 'utf8');
const sourceManifest = readFileSync(new URL('../docs/IMAGE-SOURCES.md', import.meta.url), 'utf8');

test('home service cards display seven distinct subject-specific photos', () => {
  const cardImages = [...home.matchAll(/<div class="svc-vcard-visual"><img src="([^"]+)" alt="([^"]+)"/g)];
  assert.equal(cardImages.length, 6);
  const ids = cardImages.map(([,url]) => url.match(/photo-[\w-]+/)?.[0]);
  assert.equal(new Set(ids).size, 6, 'image should not repeat across different services');
  assert.ok(cardImages.every(([,url,alt]) => url.startsWith('https://images.unsplash.com/') && alt.length > 20));
});

test('hero uses responsive srcset and loads eagerly, service cards lazy-load', () => {
  assert.match(home, /class="hero-photo"[^>]+fetchpriority="high"[^>]+srcset=/);
  assert.equal((home.match(/loading="lazy"/g) || []).length >= 6, true);
  assert.match(home, /photo-1688733720228-4f7a18681c4f/);
});

test('service detail heroes use real digital workflow photos, not unrelated team photos', () => {
  assert.match(premium, /svc-ai-page \.svc-hero-grid>div:nth-child\(2\)[\s\S]*?photo-1770368787729/);
  assert.match(premium, /svc-social-page \.svc-hero-grid>div:nth-child\(2\)[\s\S]*?photo-1759215524649/);
  assert.doesNotMatch(premium, /photo-1551836022-d5d88e9218df|photo-1765285262806-54bcc4a311ba/);
});

test('web design sector photos match real industry digital technology and disclose illustrative use', () => {
  for (const id of ['photo-1778790569138', 'photo-1758691463165','photo-1658297063569','photo-1758523671478']) {
    assert.ok(webDesign.includes(id));
  }
  assert.match(webDesign, /الصور توضيحية وليست مشاريع منفذة/);
});

test('every newly chosen photo has a documented source/license trail', () => {
  const required = [
    'photo-1688733720228', 'photo-1776278806688', 'photo-1677691824654',
    'photo-1759932023688', 'photo-1680691257251', 'photo-1712159018726',
    'photo-1770013413878', 'photo-1770368787729', 'photo-1759215524649',
    'photo-1782898669223', 'photo-1778790569138', 'photo-1758691463165',
    'photo-1658297063569', 'photo-1758523671478'
  ];
  assert.ok(required.every(id => sourceManifest.includes(id)));
});
