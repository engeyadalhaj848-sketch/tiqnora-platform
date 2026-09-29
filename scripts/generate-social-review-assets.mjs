import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

await mkdir('public/assets/social',{recursive:true});

const items=[
 {file:'review-web-design.png',tag:'تصميم مواقع ومتاجر',title:'موقعك مو مجرد واجهة',sub:'خله يشرح قيمتك ويقود العميل للخطوة التالية',kind:'web'},
 {file:'review-whatsapp-automation.png',tag:'أتمتة المحادثات و CRM',title:'لا تخلّي الاستفسار يضيع',sub:'رتّب المحادثة وسجّل العميل وحوّل المهم لفريقك',kind:'chat'},
 {file:'review-ai-agents.png',tag:'وكلاء ذكاء اصطناعي',title:'خلّ فريقك يركز على القرار',sub:'والوكلاء الذكيين يتولّون العمل المتكرر حوله',kind:'agents'}
];

const font='DejaVu Sans,Arial,sans-serif';

function art(kind){
 if(kind==='web') return `
  <rect x="110" y="510" width="860" height="500" rx="42" fill="#F7FAFF"/>
  <rect x="110" y="510" width="860" height="76" rx="42" fill="#0A1533"/>
  <circle cx="160" cy="548" r="8" fill="#00D2FF"/><circle cx="186" cy="548" r="8" fill="#0A5CFF"/>
  <rect x="160" y="640" width="760" height="140" rx="28" fill="#071630"/>
  <rect x="200" y="680" width="250" height="20" rx="10" fill="#FFFFFF"/><rect x="200" y="720" width="160" height="13" rx="7" fill="#9FB7D6"/>
  <rect x="695" y="672" width="170" height="68" rx="22" fill="url(#a)"/>
  <rect x="160" y="835" width="220" height="110" rx="24" fill="#EAF2FF"/><rect x="430" y="835" width="220" height="110" rx="24" fill="#EAF2FF"/><rect x="700" y="835" width="220" height="110" rx="24" fill="#EAF2FF"/>
 `;
 if(kind==='chat') return `
  <rect x="125" y="500" width="400" height="560" rx="55" fill="#0A132D"/><rect x="150" y="530" width="350" height="500" rx="40" fill="#F8FBFF"/>
  <rect x="195" y="640" width="220" height="70" rx="24" fill="#E8F0FF"/><rect x="240" y="745" width="210" height="86" rx="25" fill="url(#a)"/>
  <rect x="195" y="870" width="245" height="78" rx="24" fill="#E8F0FF"/>
  <rect x="635" y="580" width="300" height="360" rx="38" fill="#FFFFFF" fill-opacity=".08" stroke="#FFFFFF" stroke-opacity=".14"/>
  <line x1="700" y1="660" x2="700" y2="850" stroke="#00D2FF" stroke-width="5"/>
  <circle cx="700" cy="680" r="18" fill="#0A5CFF"/><circle cx="700" cy="755" r="18" fill="#00D2FF"/><circle cx="700" cy="830" r="18" fill="#0A5CFF"/>
 `;
 return `
  <circle cx="540" cy="760" r="120" fill="#071630" stroke="#00D2FF" stroke-width="4"/>
  <text x="540" y="775" text-anchor="middle" font-family="${font}" font-size="38" font-weight="800" fill="#FFFFFF">AI</text>
  <line x1="450" y1="680" x2="300" y2="590" stroke="#0A5CFF" stroke-width="5"/><line x1="630" y1="680" x2="780" y2="590" stroke="#00D2FF" stroke-width="5"/>
  <line x1="445" y1="845" x2="290" y2="935" stroke="#00D2FF" stroke-width="5"/><line x1="635" y1="845" x2="790" y2="935" stroke="#0A5CFF" stroke-width="5"/>
  <rect x="155" y="525" width="250" height="115" rx="28" fill="#F8FBFF"/><rect x="675" y="525" width="250" height="115" rx="28" fill="#F8FBFF"/>
  <rect x="145" y="900" width="270" height="115" rx="28" fill="#F8FBFF"/><rect x="665" y="900" width="270" height="115" rx="28" fill="#F8FBFF"/>
 `;
}

function svg(i){
 return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
 <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#060B1E"/><stop offset="1" stop-color="#081A39"/></linearGradient><linearGradient id="a"><stop stop-color="#0A5CFF"/><stop offset="1" stop-color="#00D2FF"/></linearGradient></defs>
 <rect width="1080" height="1350" fill="url(#bg)"/><circle cx="940" cy="180" r="170" fill="#0A5CFF" opacity=".12"/>
 <rect x="70" y="65" width="250" height="64" rx="32" fill="#FFFFFF" fill-opacity=".08"/><circle cx="108" cy="97" r="15" fill="url(#a)"/>
 <text x="145" y="107" font-family="${font}" font-size="27" font-weight="700" fill="#FFFFFF">Tiqnora AI</text>
 <text x="1000" y="250" text-anchor="end" direction="rtl" font-family="${font}" font-size="62" font-weight="800" fill="#FFFFFF">${i.title}</text>
 <text x="1000" y="320" text-anchor="end" direction="rtl" font-family="${font}" font-size="31" fill="#B7C7E1">${i.sub}</text>
 ${art(i.kind)}
 <rect x="70" y="1215" width="940" height="1" fill="#FFFFFF" opacity=".12"/>
 <text x="1000" y="1270" text-anchor="end" direction="rtl" font-family="${font}" font-size="25" font-weight="600" fill="#9CB4D7">${i.tag} • Tiqnora</text>
 </svg>`;
}

for(const item of items){
 await sharp(Buffer.from(svg(item))).png({compressionLevel:9}).toFile('public/assets/social/'+item.file);
 console.log('generated',item.file);
}
