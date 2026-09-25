/**
 * Tiqnora V6 — SEO core: canonical URLs, indexability, entity, schema builders.
 * No invented metrics, awards, ratings, or prices.
 */

export const SITE_ORIGIN = 'https://www.tiqnora.com';
export const ALLOWED_ORIGINS = Object.freeze([
  'https://www.tiqnora.com',
  'https://tiqnora.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

export const CANONICAL_BRAND = Object.freeze({
  name: 'Tiqnora AI',
  short_name: 'Tiqnora',
  arabic_name: 'تيقنورا',
  domain: SITE_ORIGIN,
  market: 'Saudi Arabia',
  city: 'المدينة المنورة',
  city_en: 'Madinah',
  phone: '+966551341398',
  logo: `${SITE_ORIGIN}/assets/tiqnora-logo.png`,
  description:
    'Tiqnora AI منصة سعودية لبناء أنظمة رقمية ووكلاء ذكاء اصطناعي وأتمتة نمو الأعمال — مع موافقة بشرية قبل أي إرسال خارجي.'
});

/** Forbidden alternate spellings for structured data / titles */
export const FORBIDDEN_BRAND_SPELLINGS = Object.freeze([
  'Teknora',
  'Technora',
  'Tegnora',
  'Tiknora',
  'TEKNORA'
]);

const PRIVATE_PATH_PREFIXES = [
  '/api/',
  '/admin',
  '/checkout',
  '/track',
  '/customer',
  '/login',
  '/register',
  '/auth'
];

export function normalizeCanonicalPath(pathname = '/') {
  let p = String(pathname || '/').trim();
  if (!p.startsWith('/')) p = `/${p}`;
  // strip query/hash
  p = p.split('?')[0].split('#')[0];
  // remove .html (cleanUrls)
  if (p.endsWith('.html')) p = p.slice(0, -5) || '/';
  // collapse trailing slash except root
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  // lowercase host paths are already path-only
  return p || '/';
}

export function buildCanonicalUrl(pathname = '/', origin = SITE_ORIGIN) {
  const path = normalizeCanonicalPath(pathname);
  const base = String(origin || SITE_ORIGIN).replace(/\/$/, '');
  return path === '/' ? `${base}/` : `${base}${path}`;
}

export function isIndexablePage(pathname = '/', meta = {}) {
  const path = normalizeCanonicalPath(pathname);
  if (PRIVATE_PATH_PREFIXES.some((x) => path === x.replace(/\/$/, '') || path.startsWith(x))) {
    return false;
  }
  const robots = String(meta.robots || '').toLowerCase();
  if (robots.includes('noindex')) return false;
  if (meta.status_code && meta.status_code >= 400) return false;
  return true;
}

/**
 * SSRF-safe: only allow Tiqnora origins (and local for tests).
 */
export function isAllowedAuditUrl(url) {
  try {
    const u = new URL(String(url));
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    const origin = u.origin;
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    // Vercel preview hostnames for this project only
    if (/\.vercel\.app$/i.test(u.hostname) && /tiqnora/i.test(u.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

export function assertSafeAuditUrl(url) {
  if (!isAllowedAuditUrl(url)) {
    const err = new Error('URL not allowed for SEO audit (SSRF protection)');
    err.code = 'ssrf_blocked';
    throw err;
  }
  return true;
}

export function buildOrganizationSchema(entity = CANONICAL_BRAND, options = {}) {
  const sameAs = Array.isArray(options.sameAs)
    ? options.sameAs.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
    : [];
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_ORIGIN}/#organization`,
    name: entity.name || CANONICAL_BRAND.name,
    alternateName: [entity.short_name, entity.arabic_name].filter(Boolean),
    url: entity.domain || SITE_ORIGIN,
    logo: entity.logo || CANONICAL_BRAND.logo,
    description: entity.description || CANONICAL_BRAND.description
  };
  if (entity.phone) org.telephone = entity.phone;
  if (sameAs.length) org.sameAs = sameAs;
  // area served — country level only unless full address known
  org.areaServed = { '@type': 'Country', name: 'Saudi Arabia' };
  return org;
}

export function buildWebSiteSchema(entity = CANONICAL_BRAND) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_ORIGIN}/#website`,
    name: entity.name || CANONICAL_BRAND.name,
    url: SITE_ORIGIN + '/',
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    inLanguage: 'ar'
  };
}

export function buildWebPageSchema({ path = '/', name, description } = {}) {
  const url = buildCanonicalUrl(path);
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: name || CANONICAL_BRAND.name,
    description: description || undefined,
    isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
    about: { '@id': `${SITE_ORIGIN}/#organization` },
    publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    inLanguage: 'ar'
  };
}

export function buildServiceSchema({ name, description, path, areaServed = 'SA' } = {}) {
  if (!name) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name,
    description: description || undefined,
    url: path ? buildCanonicalUrl(path) : undefined,
    provider: { '@id': `${SITE_ORIGIN}/#organization` },
    areaServed
    // no offers.price — Tiqnora does not publish fixed service prices
  };
}

export function buildProductSchema(product = {}) {
  if (!product?.name) return null;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || undefined,
    image: product.image || undefined,
    sku: product.sku || undefined
  };
  // Only real price/availability
  if (product.price != null && product.currency) {
    schema.offers = {
      '@type': 'Offer',
      price: String(product.price),
      priceCurrency: product.currency,
      availability: product.availability || 'https://schema.org/InStock'
    };
  }
  // Never invent aggregateRating
  return schema;
}

export function buildBreadcrumbSchema(items = []) {
  const list = (Array.isArray(items) ? items : [])
    .filter((x) => x && x.name && x.path)
    .map((x, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: x.name,
      item: buildCanonicalUrl(x.path)
    }));
  if (!list.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: list
  };
}

export function brandSpellingIssues(text = '') {
  const issues = [];
  for (const bad of FORBIDDEN_BRAND_SPELLINGS) {
    if (String(text).includes(bad)) {
      issues.push({ code: 'brand_spelling', value: bad });
    }
  }
  return issues;
}

export function buildBrandFactSheet(brandBrain = {}, entity = CANONICAL_BRAND) {
  return {
    brand_name: entity.name,
    short_name: entity.short_name,
    arabic_name: entity.arabic_name,
    website: entity.domain,
    market: entity.market,
    city: entity.city,
    phone: entity.phone || null,
    services: brandBrain.services || [],
    description: entity.description,
    approved_facts: brandBrain.approved_claims || [],
    restricted_claims: brandBrain.restricted_claims || [],
    visual: brandBrain.visual_identity?.colors || {},
    source: 'brand_brain+seo_entity'
  };
}

export default {
  SITE_ORIGIN,
  CANONICAL_BRAND,
  normalizeCanonicalPath,
  buildCanonicalUrl,
  isIndexablePage,
  isAllowedAuditUrl,
  assertSafeAuditUrl,
  buildOrganizationSchema,
  buildWebSiteSchema,
  buildWebPageSchema,
  buildServiceSchema,
  buildProductSchema,
  buildBreadcrumbSchema,
  brandSpellingIssues,
  buildBrandFactSheet
};
