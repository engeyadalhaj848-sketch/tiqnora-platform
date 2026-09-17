import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const output = 'dist';
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const files = [
  'index.html', 'shop.html', 'product.html', 'checkout.html', 'track.html',
  'national-day.html', 'national-day.css',
  'admin.html', 'customer.html', 'customer.css', 'blog.html', 'blog-post.html', 'compare.html', 'sales.html', 'marketing.css', 'styles.css', 'script.js', 'admin.css',
  'robots.txt', 'sitemap.xml', 'llms.txt',
];

for (const file of files) {
  if (existsSync(file)) cpSync(file, `${output}/${file}`);
}

if (existsSync('services')) cpSync('services', `${output}/services`, { recursive: true });
if (existsSync('blog')) cpSync('blog', `${output}/blog`, { recursive: true });
for (const dir of ['js', 'supabase', 'docs', 'admin', 'api']) {
  if (existsSync(dir)) cpSync(dir, `${output}/${dir}`, { recursive: true });
}

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
