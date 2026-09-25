/**
 * Deterministic technical SEO audit for Tiqnora pages (offline-safe fixtures + optional fetch).
 */

import {
  normalizeCanonicalPath,
  buildCanonicalUrl,
  isIndexablePage,
  isAllowedAuditUrl,
  assertSafeAuditUrl,
  SITE_ORIGIN,
  brandSpellingIssues,
  CANONICAL_BRAND
} from './core.js';

export function extractMetaFromHtml(html = '', pageUrl = '') {
  const text = String(html || '');
  const pick = (re) => {
    const m = text.match(re);
    return m ? m[1].trim() : null;
  };
  const title = pick(/<title[^>]*>([^<]*)<\/title>/i);
  const description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || pick(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const canonical = pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
    || pick(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
  const robots = pick(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i);
  const h1 = pick(/<h1[^>]*>([^<]*)<\/h1>/i);
  const ogTitle = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i);
  const ldBlocks = [...text.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim());
  let schemas = [];
  for (const block of ldBlocks) {
    try {
      schemas.push(JSON.parse(block));
    } catch {
      schemas.push({ _parse_error: true, raw_length: block.length });
    }
  }
  return {
    url: pageUrl,
    path: normalizeCanonicalPath(new URL(pageUrl || SITE_ORIGIN).pathname),
    title,
    description,
    canonical,
    robots,
    h1,
    og_title: ogTitle,
    schemas,
    html_length: text.length
  };
}

export function auditPageRecord(page = {}) {
  const issues = [];
  const path = normalizeCanonicalPath(page.path || '/');
  const expectedCanonical = buildCanonicalUrl(path);
  const indexable = isIndexablePage(path, page);

  if (indexable && !page.title) {
    issues.push(issue('missing_title', path, 'critical', 'Missing title tag', 'Titles drive SERP clicks', 'Add a unique title', false));
  }
  if (indexable && page.title && (page.title.length < 10 || page.title.length > 65)) {
    issues.push(issue('title_length', path, 'medium', 'Title length warning', 'Extreme lengths may truncate', 'Aim ~15–60 chars', false));
  }
  if (indexable && !page.description) {
    issues.push(issue('missing_description', path, 'high', 'Missing meta description', 'Affects SERP snippet', 'Add unique description', false));
  }
  if (indexable && !page.canonical) {
    issues.push(issue('missing_canonical', path, 'high', 'Missing canonical', 'Risk of duplicate URLs', `Set canonical to ${expectedCanonical}`, true));
  }
  if (page.canonical) {
    const c = String(page.canonical);
    if (c.includes('.html')) {
      issues.push(issue('canonical_html_extension', path, 'high', 'Canonical uses .html', 'cleanUrls expects extensionless URLs', `Use ${expectedCanonical}`, true));
    }
    const normalized = normalizeCanonicalPath(new URL(c, SITE_ORIGIN).pathname);
    if (normalized !== path && indexable) {
      issues.push(issue('canonical_mismatch', path, 'high', 'Canonical path mismatch', 'Signals conflicting preferred URL', `Align to ${expectedCanonical}`, true));
    }
    if (!c.startsWith('https://www.tiqnora.com') && !c.startsWith('https://tiqnora.com')) {
      issues.push(issue('canonical_wrong_host', path, 'critical', 'Canonical points to unexpected host', 'Can deindex production', `Use ${SITE_ORIGIN}`, true));
    }
  }
  if (path === '/' && page.robots && String(page.robots).toLowerCase().includes('noindex')) {
    issues.push(issue('homepage_noindex', path, 'critical', 'Homepage is noindex', 'Blocks primary ranking URL', 'Remove noindex from homepage', true));
  }
  if (indexable && !page.h1) {
    issues.push(issue('missing_h1', path, 'medium', 'Missing H1', 'Weaker topical clarity', 'Add one clear H1', false));
  }

  const blob = [page.title, page.description, page.h1].filter(Boolean).join(' ');
  for (const b of brandSpellingIssues(blob)) {
    issues.push(issue('brand_spelling', path, 'high', `Forbidden brand spelling: ${b.value}`, 'Confuses entity consistency', 'Use Tiqnora AI', true));
  }

  // Schema parse errors
  for (const s of page.schemas || []) {
    if (s && s._parse_error) {
      issues.push(issue('schema_parse_error', path, 'high', 'Invalid JSON-LD', 'Structured data ignored', 'Fix JSON syntax', false));
    }
  }

  return {
    path,
    url: page.url || buildCanonicalUrl(path),
    indexable,
    expected_canonical: expectedCanonical,
    issues,
    title: page.title || null,
    description: page.description || null,
    canonical: page.canonical || null
  };
}

function issue(code, page_path, severity, problem, why_it_matters, recommended_fix, auto_fix_supported) {
  return {
    code,
    page_path,
    severity,
    problem,
    why_it_matters,
    recommended_fix,
    auto_fix_supported: !!auto_fix_supported,
    approval_required: true
  };
}

/** Sample Tiqnora public page fixtures for offline audit */
export function sampleTiqnoraPages() {
  return [
    {
      path: '/',
      title: 'تيقنورا | أنظمة رقمية وذكاء اصطناعي للأعمال',
      description: 'نبني أنظمة رقمية مترابطة: مواقع، وكلاء AI، أتمتة.',
      canonical: 'https://www.tiqnora.com/',
      h1: 'Tiqnora AI',
      robots: 'index,follow',
      schemas: [{ '@type': 'Organization', name: 'Tiqnora AI' }, { '@type': 'WebSite', name: 'Tiqnora AI' }]
    },
    {
      path: '/about',
      title: 'عن Tiqnora AI',
      description: 'شركة تقنية سعودية',
      canonical: 'https://www.tiqnora.com/about',
      h1: 'عن Tiqnora AI',
      schemas: [{ '@type': 'Organization', name: 'Tiqnora AI' }]
    },
    {
      path: '/services/ai-agents',
      title: 'وكلاء ذكاء اصطناعي',
      description: 'وكلاء AI للأعمال',
      canonical: 'https://www.tiqnora.com/services/ai-agents',
      h1: 'AI Agents'
    },
    {
      path: '/services/web-design',
      title: 'تصميم مواقع',
      description: 'تصميم مواقع احترافي',
      // intentional regression fixture for tests can override
      canonical: 'https://www.tiqnora.com/services/web-design',
      h1: 'Web Design'
    },
    {
      path: '/services/social-automation',
      title: 'أتمتة السوشيال',
      description: 'أتمتة المحتوى',
      canonical: 'https://www.tiqnora.com/services/social-automation',
      h1: 'Social Automation'
    },
    {
      path: '/shop',
      title: 'المتجر',
      description: 'منتجات تقنية',
      canonical: 'https://www.tiqnora.com/shop',
      h1: 'Shop'
    },
    {
      path: '/blog',
      title: 'المدونة',
      description: 'مقالات',
      canonical: 'https://www.tiqnora.com/blog',
      h1: 'Blog'
    },
    {
      path: '/faq',
      title: 'الأسئلة الشائعة',
      description: 'FAQ',
      canonical: 'https://www.tiqnora.com/faq',
      h1: 'FAQ'
    },
    {
      path: '/admin',
      title: 'Admin',
      robots: 'noindex',
      canonical: 'https://www.tiqnora.com/admin'
    },
    {
      path: '/checkout',
      title: 'Checkout',
      robots: 'noindex'
    }
  ];
}

export function runSiteAudit(pages = sampleTiqnoraPages()) {
  const list = Array.isArray(pages) ? pages : sampleTiqnoraPages();
  const results = list.map((p) => auditPageRecord(p));
  const issues = results.flatMap((r) => r.issues);
  const severityCount = issues.reduce((acc, i) => {
    acc[i.severity] = (acc[i.severity] || 0) + 1;
    return acc;
  }, {});
  return {
    status: 'completed',
    pages_checked: results.length,
    issues_found: issues.length,
    severity_count: severityCount,
    indexable_pages: results.filter((r) => r.indexable).length,
    pages: results,
    issues,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString()
  };
}

/**
 * Optional live fetch of a single allowed URL (not used in unit tests).
 */
export async function fetchAndAuditPage(url, options = {}) {
  const fetchFn = options.fetchImpl || globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 10000);
  let currentUrl = String(url || '');
  const maxRedirects = Math.min(Math.max(Number(options.maxRedirects ?? 3), 0), 5);

  try {
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
      assertSafeAuditUrl(currentUrl);
      const res = await fetchFn(currentUrl, { signal: controller.signal, redirect: 'manual' });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers?.get?.('location');
        if (!location) {
          throw Object.assign(new Error('Redirect missing location'), { code: 'invalid_redirect' });
        }
        if (redirectCount >= maxRedirects) {
          throw Object.assign(new Error('Too many redirects'), { code: 'too_many_redirects' });
        }
        const nextUrl = new URL(location, currentUrl).toString();
        assertSafeAuditUrl(nextUrl);
        currentUrl = nextUrl;
        continue;
      }

      const lengthHeader = Number(res.headers?.get?.('content-length') || 0);
      if (Number.isFinite(lengthHeader) && lengthHeader > 2_000_000) {
        throw Object.assign(new Error('Response too large'), { code: 'response_too_large' });
      }

      const html = await res.text();
      if (html.length > 2_000_000) {
        throw Object.assign(new Error('Response too large'), { code: 'response_too_large' });
      }
      const meta = extractMetaFromHtml(html, currentUrl);
      meta.status_code = res.status;
      return auditPageRecord(meta);
    }

    throw Object.assign(new Error('Too many redirects'), { code: 'too_many_redirects' });
  } finally {
    clearTimeout(timer);
  }
}

export function filterSitemapUrls(urls = []) {
  return (Array.isArray(urls) ? urls : [])
    .map((u) => {
      try {
        const url = new URL(u, SITE_ORIGIN);
        return buildCanonicalUrl(url.pathname);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((u) => isIndexablePage(new URL(u).pathname))
    .filter((u, i, arr) => arr.indexOf(u) === i);
}

export default {
  extractMetaFromHtml,
  auditPageRecord,
  sampleTiqnoraPages,
  runSiteAudit,
  fetchAndAuditPage,
  filterSitemapUrls
};
