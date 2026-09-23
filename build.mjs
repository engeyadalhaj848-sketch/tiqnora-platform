import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';

const output = 'dist';
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const files = [
  'index.html', 'shop.html', 'product.html', 'checkout.html', 'order-complete.html', 'track.html',
  'national-day.html', 'national-day.css',
  'shipping-policy.html', 'return-policy.html', 'privacy-policy.html', 'terms.html', 'faq.html', 'about.html',
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

async function configureTelegramCommandCenter() {
  if (process.env.VERCEL_ENV !== 'production') return;

  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();

  if (!token) {
    console.log('Telegram Command Center setup skipped: TELEGRAM_BOT_TOKEN is not configured.');
    return;
  }

  const secret = createHash('sha256').update(`tiqnora-telegram-webhook:${token}`).digest('hex');
  const api = `https://api.telegram.org/bot${encodeURIComponent(token)}`;

  try {
    const [webhookResponse, commandsResponse] = await Promise.all([
      fetch(`${api}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: 'https://www.tiqnora.com/api/telegram/webhook',
          secret_token: secret,
          allowed_updates: ['message', 'edited_message'],
          drop_pending_updates: false
        })
      }),
      fetch(`${api}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [
            { command: 'start', description: 'فتح مركز أوامر Tiqnora' },
            { command: 'pair', description: 'اقتران حسابك بالمنصة' },
            { command: 'agents', description: 'عرض الوكلاء النشطين' },
            { command: 'auto', description: 'توجيه الطلب تلقائياً' },
            { command: 'status', description: 'حالة المنصة الآن' },
            { command: 'prospects', description: 'أفضل فرص المبيعات' },
            { command: 'tasks', description: 'المهام المفتوحة' },
            { command: 'scan', description: 'البحث الآن عن عملاء' },
            { command: 'run', description: 'تشغيل مهام الوكلاء الآن' },
            { command: 'report', description: 'تقرير فوري' },
            { command: 'help', description: 'شرح الأوامر' }
          ]
        })
      })
    ]);

    const webhook = await webhookResponse.json().catch(() => ({}));
    const commands = await commandsResponse.json().catch(() => ({}));
    if (!webhookResponse.ok || webhook?.ok === false) {
      console.warn('Telegram setWebhook failed:', webhook?.description || webhookResponse.status);
    } else {
      console.log('Telegram webhook configured → https://www.tiqnora.com/api/telegram/webhook');
    }
    if (!commandsResponse.ok || commands?.ok === false) {
      console.warn('Telegram setMyCommands failed:', commands?.description || commandsResponse.status);
    }
  } catch (error) {
    console.warn('Telegram Command Center setup failed:', error.message);
  }
}

await configureTelegramCommandCenter();
console.log('Build complete → dist/');
