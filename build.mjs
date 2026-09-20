import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const output = 'dist';
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const files = [
  'index.html', 'shop.html', 'product.html', 'checkout.html', 'order-complete.html', 'track.html',
  'national-day.html', 'national-day.css',
  'shipping-policy.html', 'return-policy.html', 'privacy-policy.html', 'terms.html', 'faq.html',
  'admin.html', 'customer.html', 'customer.css', 'blog.html', 'blog-post.html', 'compare.html', 'sales.html', 'marketing.css', 'styles.css', 'script.js', 'admin.css',
  'robots.txt', 'sitemap.xml', 'llms.txt',
];

for (const file of files) {
  if (existsSync(file)) cpSync(file, `${output}/${file}`);
}

if (existsSync('services')) cpSync('services', `${output}/services`, { recursive: true });
if (existsSync('products')) cpSync('products', `${output}/products`, { recursive: true });
if (existsSync('solutions')) cpSync('solutions', `${output}/solutions`, { recursive: true });
if (existsSync('blog')) cpSync('blog', `${output}/blog`, { recursive: true });
for (const dir of ['js', 'admin']) {
  if (existsSync(dir)) cpSync(dir, `${output}/${dir}`, { recursive: true });
}
// Note: api/ stays at repo root for Vercel Serverless — do not copy into dist
// supabase/ and docs/ are not needed in static output

if (existsSync('public/assets')) {
  cpSync('public/assets', `${output}/assets`, { recursive: true });
}
// Also merge root assets/ (e.g. product catalog images) if present
if (existsSync('assets')) {
  cpSync('assets', `${output}/assets`, { recursive: true });
}

// PWA admin assets
if (existsSync('public/admin-manifest.json')) {
  cpSync('public/admin-manifest.json', `${output}/admin-manifest.json`);
}
if (existsSync('public/admin-sw.js')) {
  cpSync('public/admin-sw.js', `${output}/admin-sw.js`);
}
if (existsSync('public/customer-manifest.json')) {
  cpSync('public/customer-manifest.json', `${output}/customer-manifest.json`);
}
if (existsSync('public/customer-sw.js')) {
  cpSync('public/customer-sw.js', `${output}/customer-sw.js`);
}

console.log('Build complete → dist/');
