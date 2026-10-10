import { cpSync, existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import jpeg from 'jpeg-js';

const output = 'dist';
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const files = [
  'index.html', 'shop.html', 'product.html', 'cart.html', 'checkout.html', 'pay.html', 'order-complete.html', 'track.html',
  'national-day.html', 'national-day.css',
  'shipping-policy.html', 'return-policy.html', 'privacy-policy.html', 'terms.html', 'faq.html', 'about.html',
  'admin.html', 'customer.html', 'customer.css', 'blog.html', 'blog-post.html', 'compare.html', 'sales.html', 'proposal.html', 'marketing.css', 'styles.css', 'shop-store.css', 'script.js', 'admin.css',
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

function generateTikTokSafeSocialJpeg(kind = 'web_design') {
  const width = 1080;
  const height = 1350;
  const rgba = Buffer.alloc(width * height * 4);
  const fill = (x0, y0, x1, y1, rgb) => {
    for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1) {
      for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 1) {
        const i = (y * width + x) * 4;
        rgba[i] = rgb[0]; rgba[i + 1] = rgb[1]; rgba[i + 2] = rgb[2]; rgba[i + 3] = 255;
      }
    }
  };
  for (let y = 0; y < height; y += 1) fill(0, y, width, y + 1, [6, 11 + Math.floor(y / 110), 30 + Math.floor(y / 70)]);
  const navy=[18,31,65], white=[247,251,255], blue=[10,92,255], cyan=[0,210,255], pale=[225,240,255], line=[80,110,155];
  fill(0,0,18,height,blue); fill(width-18,0,width,height,cyan); fill(100,150,980,930,white); fill(100,150,980,245,navy);
  if(kind==='ecommerce'){
    for(let row=0;row<2;row+=1) for(let col=0;col<3;col+=1){
      const x=145+col*270,y=300+row*300;
      fill(x,y,x+215,y+245,pale); fill(x+32,y+28,x+183,y+155,(row+col)%2?cyan:blue);
      fill(x+30,y+182,x+170,y+196,line); fill(x+30,y+210,x+125,y+221,[130,160,195]);
    }
    fill(650,850,980,1170,navy); fill(725,940,915,955,cyan); fill(760,970,900,985,white);
  } else {
    fill(155,310,600,470,navy); fill(665,310,925,470,pale);
    for(let row=0;row<2;row+=1) for(let col=0;col<3;col+=1){
      const x=150+col*260,y=535+row*205;
      fill(x,y,x+205,y+160,pale); fill(x+22,y+22,x+183,y+78,(row+col)%2?cyan:blue);
      fill(x+25,y+105,x+170,y+114,line); fill(x+25,y+128,x+145,y+137,[130,160,195]);
    }
    fill(730,825,980,1180,white); fill(755,885,955,1010,blue);
  }
  fill(75,1180,650,1190,cyan); fill(75,1225,500,1235,blue);
  return jpeg.encode({data:rgba,width,height},90).data;
}

mkdirSync(`${output}/assets/social`, { recursive: true });
for (const kind of ['web_design','ecommerce']) {
  const name = kind === 'web_design' ? 'web-design' : 'ecommerce';
  const image = generateTikTokSafeSocialJpeg(kind);
  await import('node:fs').then(({ writeFileSync }) => writeFileSync(`${output}/assets/social/${name}.jpg`, image));
}

if (existsSync('public/tiktokKwQOiO2m2sBXlRJ0sdIrr4OU2TgPYsrz.txt')) {
  cpSync('public/tiktokKwQOiO2m2sBXlRJ0sdIrr4OU2TgPYsrz.txt', `${output}/tiktokKwQOiO2m2sBXlRJ0sdIrr4OU2TgPYsrz.txt`);
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
            { command: 'daily', description: 'تشغيل فريق Tiqnora اليومي' },
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


function verifyBrowserScriptSyntax() {
  for (const file of ['js/admin-app.js', 'js/social-inbox-admin.js']) {
    if (!existsSync(file)) continue;
    try {
      new vm.Script(readFileSync(file, 'utf8'), { filename: file });
      console.log(`Syntax OK → ${file}`);
    } catch (error) {
      console.error(`Syntax FAILED → ${file}: ${error.message}`);
      throw error;
    }
  }
}

verifyBrowserScriptSyntax();

await configureTelegramCommandCenter();
console.log('Build complete → dist/');
