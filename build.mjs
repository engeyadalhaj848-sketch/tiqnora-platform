import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';

const output = 'dist';
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const file of ['index.html', 'styles.css', 'script.js', 'robots.txt', 'sitemap.xml']) {
  if (existsSync(file)) cpSync(file, `${output}/${file}`);
}

if (existsSync('public/assets')) {
  cpSync('public/assets', `${output}/assets`, { recursive: true });
}
