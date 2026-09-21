/**
 * Tiqnora supplier connectors — secrets only from process.env
 * No auto-purchase. No auto-publish.
 *
 * CJ uses live client in lib/suppliers/cj.js (falls back safely when key missing).
 */

import * as cj from '../../lib/suppliers/cj.js';
import * as aliexpress from '../../lib/suppliers/aliexpress.js';

function env(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : null;
}

function baseConnector(provider, envKeys) {
  const configured = envKeys.every((k) => !!env(k));
  return {
    provider,
    envKeys,
    configured,
    status: configured ? 'connected' : 'not_configured',
    async connect() {
      return this.testConnection();
    },
    async testConnection() {
      if (!configured) {
        return {
          ok: false,
          status: 'not_configured',
          provider,
          message: `Missing env: ${envKeys.filter((k) => !env(k)).join(', ')}`,
          auto_purchase: false,
        };
      }
      return {
        ok: true,
        status: 'connected',
        provider,
        message: 'Credentials present in Vercel env — live API call not forced (manual sync)',
        live_api: false,
        auto_purchase: false,
      };
    },
    async searchProducts(query = '', limit = 10) {
      if (!configured) {
        return { ok: false, status: 'not_configured', products: [], provider };
      }
      const q = String(query || 'tech').slice(0, 80);
      const products = Array.from({ length: Math.min(limit, 5) }).map((_, i) => ({
        supplier_product_id: `${provider}-demo-${i + 1}`,
        title: `${q} sample ${i + 1} (${provider})`,
        cost: 50 + i * 25,
        currency: 'USD',
        stock: 10 + i * 3,
        shipping_estimate: '10-25 days',
        images: [],
        mock: true,
      }));
      return { ok: true, status: 'connected', products, provider, mock: true, auto_purchase: false };
    },
    async getProduct(supplierProductId) {
      if (!configured) return { ok: false, status: 'not_configured', provider };
      return {
        ok: true,
        provider,
        product: {
          supplier_product_id: supplierProductId,
          title: `Product ${supplierProductId}`,
          cost: 100,
          stock: 20,
          shipping_estimate: '7-20 days',
          mock: true,
        },
        auto_purchase: false,
      };
    },
    async getPrice(supplierProductId) {
      const p = await this.getProduct(supplierProductId);
      return {
        ok: p.ok,
        provider,
        supplier_product_id: supplierProductId,
        price: p.product?.cost ?? null,
        currency: 'USD',
        mock: true,
      };
    },
    async getInventory(supplierProductId) {
      const p = await this.getProduct(supplierProductId);
      return {
        ok: p.ok,
        provider,
        supplier_product_id: supplierProductId,
        stock: p.product?.stock ?? 0,
        mock: true,
      };
    },
    async getShippingInfo(supplierProductId) {
      return {
        ok: configured,
        provider,
        supplier_product_id: supplierProductId,
        estimate: configured ? '7-20 business days' : null,
        status: configured ? 'connected' : 'not_configured',
        mock: true,
      };
    },
  };
}

/** Real CJ Dropshipping connector (lib/suppliers/cj.js) */
function cjConnector() {
  const configured = cj.isConfigured();
  return {
    provider: 'cj_dropshipping',
    envKeys: ['CJ_API_KEY'],
    configured,
    status: configured ? 'connected' : 'not_configured',
    async connect() {
      return this.testConnection();
    },
    async testConnection() {
      return cj.testConnection();
    },
    async searchProducts(query = '', limit = 10) {
      if (!configured) {
        // Safe demo list so admin UI still works offline
        return {
          ok: true,
          status: 'not_configured',
          provider: 'cj_dropshipping',
          products: cj.getDemoCatalog(Math.min(limit, 3)),
          mock: true,
          message: 'CJ_API_KEY missing — returning demo catalog for UI testing only',
          auto_purchase: false,
        };
      }
      const live = await cj.searchProducts(query, limit);
      if (live.ok && live.products?.length) return live;
      // Soft fallback
      return {
        ...live,
        products: live.products?.length ? live.products : cj.getDemoCatalog(Math.min(limit, 2)),
        mock: !live.ok || !!live.mock,
        fallback_demo: !live.ok,
      };
    },
    async getProduct(supplierProductId) {
      return cj.getProductDetails(supplierProductId);
    },
    async getPrice(supplierProductId) {
      return cj.getProductPrice(supplierProductId);
    },
    async getInventory(supplierProductId) {
      return cj.getProductInventory(supplierProductId);
    },
    async getShippingInfo(supplierProductId, opts) {
      return cj.getShippingInfo(supplierProductId, opts);
    },
    async getVariants(supplierProductId) {
      return cj.getVariants(supplierProductId);
    },
    async getInventoryByVid(vid) {
      return cj.getInventoryByVid(vid);
    },
    async getFreightByVid(vid, opts) {
      return cj.getFreightByVid(vid, opts);
    },
    async auditProductPipeline(supplierProductId, opts) {
      return cj.auditProductPipeline(supplierProductId, opts);
    },
  };
}

function aliexpressConnector() {
  const configured = aliexpress.isConfigured();
  return {
    provider: 'aliexpress',
    envKeys: ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'],
    configured,
    status: configured ? 'connected' : 'not_configured',
    async connect() {
      return this.testConnection();
    },
    async testConnection() {
      return aliexpress.testConnection();
    },
    async searchProducts(query = '', limit = 10) {
      return aliexpress.searchProducts(query, limit);
    },
    async getProduct(supplierProductId) {
      return aliexpress.getProductDetails(supplierProductId);
    },
    async getPrice(supplierProductId) {
      return aliexpress.getProductPrice(supplierProductId);
    },
    async getInventory(supplierProductId) {
      return aliexpress.getProductInventory(supplierProductId);
    },
    async getShippingInfo(supplierProductId) {
      return aliexpress.getShippingInfo(supplierProductId);
    },
  };
}


export const CONNECTORS = {
  cj_dropshipping: () => cjConnector(),
  aliexpress: () => aliexpressConnector(),
  alibaba: () => baseConnector('alibaba', ['ALIBABA_API_KEY']),
  dsers: () => baseConnector('dsers', ['DSERS_API_KEY']),
};

export function getConnector(provider) {
  const key = String(provider || '').toLowerCase().replace(/-/g, '_');
  const factory = CONNECTORS[key];
  if (!factory) return null;
  return factory();
}

export function listConnectorStatuses() {
  return Object.keys(CONNECTORS).map((provider) => {
    const c = CONNECTORS[provider]();
    return {
      provider,
      status: c.status,
      configured: c.configured,
      env_keys_required: c.envKeys,
      env_keys_present: c.envKeys.filter((k) => !!env(k)),
    };
  });
}
