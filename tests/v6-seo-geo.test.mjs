import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCanonicalPath,
  buildCanonicalUrl,
  isIndexablePage,
  isAllowedAuditUrl,
  assertSafeAuditUrl,
  buildOrganizationSchema,
  buildProductSchema,
  buildServiceSchema,
  brandSpellingIssues,
  CANONICAL_BRAND
} from '../lib/v6/seo/core.js';
import {
  auditPageRecord,
  runSiteAudit,
  sampleTiqnoraPages,
  filterSitemapUrls
} from '../lib/v6/seo/audit.js';
import {
  buildKeywordMap,
  detectCannibalization,
  generateContentOpportunities
} from '../lib/v6/seo/keywords.js';
import {
  evaluateAiVisibility,
  evaluateLlmsTxt,
  entityClarityReport
} from '../lib/v6/seo/ai-visibility.js';

describe('SEO core', () => {
  it('normalizes .html and trailing slash', () => {
    assert.equal(normalizeCanonicalPath('/services/web-design.html'), '/services/web-design');
    assert.equal(normalizeCanonicalPath('/about/'), '/about');
    assert.equal(buildCanonicalUrl('/services/ai-agents.html'), 'https://www.tiqnora.com/services/ai-agents');
  });

  it('indexability matrix', () => {
    assert.equal(isIndexablePage('/'), true);
    assert.equal(isIndexablePage('/admin'), false);
    assert.equal(isIndexablePage('/checkout'), false);
    assert.equal(isIndexablePage('/services/ai-agents'), true);
    assert.equal(isIndexablePage('/shop', { robots: 'noindex' }), false);
  });

  it('SSRF protection blocks private targets', () => {
    assert.equal(isAllowedAuditUrl('https://www.tiqnora.com/about'), true);
    assert.equal(isAllowedAuditUrl('http://127.0.0.1/secret'), false);
    assert.equal(isAllowedAuditUrl('http://169.254.169.254/latest'), false);
    assert.throws(() => assertSafeAuditUrl('http://localhost/admin'), (e) => e.code === 'ssrf_blocked');
  });

  it('Organization schema has no invented awards/ratings', () => {
    const org = buildOrganizationSchema();
    assert.equal(org.name, 'Tiqnora AI');
    assert.equal(org.aggregateRating, undefined);
    assert.equal(org.award, undefined);
    assert.ok(org['@id'].includes('#organization'));
  });

  it('Service schema has no fixed price offers', () => {
    const s = buildServiceSchema({ name: 'AI Agents', path: '/services/ai-agents' });
    assert.equal(s.offers, undefined);
  });

  it('Product schema omits fake ratings and requires real price fields', () => {
    const p = buildProductSchema({ name: 'Printer', price: null });
    assert.equal(p.aggregateRating, undefined);
    assert.equal(p.offers, undefined);
    const p2 = buildProductSchema({ name: 'X', price: 100, currency: 'SAR' });
    assert.equal(p2.offers.priceCurrency, 'SAR');
  });

  it('flags forbidden brand spellings', () => {
    assert.ok(brandSpellingIssues('Welcome to Teknora').length >= 1);
    assert.equal(brandSpellingIssues('Tiqnora AI').length, 0);
  });
});

describe('SEO audit', () => {
  it('detects .html canonical issue', () => {
    const r = auditPageRecord({
      path: '/services/web-design',
      title: 'Web',
      description: 'd',
      canonical: 'https://www.tiqnora.com/services/web-design.html'
    });
    assert.ok(r.issues.some((i) => i.code === 'canonical_html_extension'));
  });

  it('homepage noindex is critical', () => {
    const r = auditPageRecord({ path: '/', title: 'Home', robots: 'noindex' });
    assert.ok(r.issues.some((i) => i.code === 'homepage_noindex' && i.severity === 'critical'));
  });

  it('sample audit completes offline', () => {
    const audit = runSiteAudit(sampleTiqnoraPages());
    assert.equal(audit.status, 'completed');
    assert.ok(audit.pages_checked >= 10);
    assert.ok(audit.indexable_pages >= 1);
  });

  it('sitemap filter drops admin and keeps clean URLs', () => {
    const urls = filterSitemapUrls([
      'https://www.tiqnora.com/about.html',
      'https://www.tiqnora.com/admin',
      'https://www.tiqnora.com/services/ai-agents'
    ]);
    assert.ok(urls.includes('https://www.tiqnora.com/about'));
    assert.ok(!urls.some((u) => u.includes('/admin')));
    assert.ok(!urls.some((u) => u.endsWith('.html')));
  });
});

describe('Keywords + opportunities', () => {
  it('keyword map has no invented volumes', () => {
    const map = buildKeywordMap();
    assert.ok(map.length >= 5);
    assert.ok(map.every((k) => k.volume == null));
  });

  it('cannibalization detector returns structure', () => {
    const c = detectCannibalization(buildKeywordMap());
    assert.ok(c.by_page);
    assert.ok(Array.isArray(c.conflicts));
  });

  it('content opportunities require approval', () => {
    const opps = generateContentOpportunities({ count: 3 });
    assert.equal(opps.length, 3);
    assert.ok(opps.every((o) => o.requires_approval === true));
  });
});

describe('GEO / AI visibility', () => {
  it('returns checks not magic score', () => {
    const v = evaluateAiVisibility({
      path: '/',
      title: 'Tiqnora AI',
      description: 'منصة',
      h1: 'Tiqnora AI',
      canonical: 'https://www.tiqnora.com/',
      schemas: [{ '@type': 'Organization', name: 'Tiqnora AI' }]
    });
    assert.ok(v.checks_total >= 5);
    assert.ok(v.disclaimer);
    assert.equal(v.score, undefined);
  });

  it('llms.txt validation catches forbidden spelling', () => {
    const bad = evaluateLlmsTxt('Teknora is great');
    assert.equal(bad.ok, false);
  });

  it('entity clarity uses Tiqnora AI', () => {
    const e = entityClarityReport();
    assert.equal(e.canonical_name, 'Tiqnora AI');
    assert.ok(e.forbidden_spellings.includes('Teknora'));
  });
});

describe('SEO offline e2e', () => {
  it('audit → entity → keywords → opportunities → ai visibility', () => {
    const audit = runSiteAudit(sampleTiqnoraPages().slice(0, 10));
    assert.equal(audit.pages_checked, 10);
    const entity = CANONICAL_BRAND;
    assert.equal(entity.name, 'Tiqnora AI');
    const keywords = buildKeywordMap();
    const opps = generateContentOpportunities({ count: 3 });
    assert.equal(opps.length, 3);
    const vis = evaluateAiVisibility(sampleTiqnoraPages()[0]);
    assert.ok(vis.checks_passed >= 1);
    // no auto publish
    assert.ok(opps.every((o) => o.requires_approval));
  });
});
