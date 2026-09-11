import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const output = 'dist';
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const files = [
  'index.html', 'shop.html', 'product.html', 'checkout.html', 'track.html',
  'admin.html', 'styles.css', 'script.js', 'admin.css',
  'robots.txt', 'sitemap.xml', 'llms.txt',
];

for (const file of files) {
  if (existsSync(file)) cpSync(file, `${output}/${file}`);
}

for (const dir of ['js', 'supabase', 'docs', 'admin']) {
  if (existsSync(dir)) cpSync(dir, `${output}/${dir}`, { recursive: true });
}

if (existsSync('public/assets')) {
  cpSync('public/assets', `${output}/assets`, { recursive: true });
}

console.log('Build complete → dist/');
