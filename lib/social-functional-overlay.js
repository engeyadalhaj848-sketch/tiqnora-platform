import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const require=createRequire(import.meta.url);

function configureArabicFont(){
  if(process.env.TIQNORA_ARABIC_FONT_READY==='1') return;
  const regular=require.resolve('@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-Regular.ttf');
  const bold=require.resolve('@embedpdf/fonts-arabic/fonts/NotoNaskhArabic-Bold.ttf');
  const fontDir=dirname(regular);
  const confPath='/tmp/tiqnora-fontconfig.conf';
  mkdirSync('/tmp/tiqnora-font-cache',{recursive:true});
  const xml='<?xml version="1.0"?>'
    +'<!DOCTYPE fontconfig SYSTEM "fonts.dtd">'
    +'<fontconfig>'
    +'<dir>'+fontDir.replace(/&/g,'&amp;')+'</dir>'
    +'<cachedir>/tmp/tiqnora-font-cache</cachedir>'
    +'<match target="pattern"><test name="family" qual="any"><string>sans-serif</string></test>'
    +'<edit name="family" mode="prepend" binding="strong"><string>Noto Naskh Arabic</string></edit></match>'
    +'</fontconfig>';
  writeFileSync(confPath,xml,'utf8');
  process.env.FONTCONFIG_FILE=confPath;
  process.env.FONTCONFIG_PATH='/tmp';
  process.env.TIQNORA_ARABIC_FONT_READY='1';
  process.env.TIQNORA_ARABIC_FONT_REGULAR=regular;
  process.env.TIQNORA_ARABIC_FONT_BOLD=bold;
}
configureArabicFont();


function escapeXml(value){
  return String(value||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function textEl(x,y,text,size=24,weight=600,fill='#FFFFFF',anchor='end'){
  return '<text x="'+x+'" y="'+y+'" text-anchor="'+anchor+'" direction="rtl" xml:lang="ar" font-family="Noto Naskh Arabic, sans-serif" font-size="'+size+'" font-weight="'+weight+'" fill="'+fill+'">'+escapeXml(text)+'</text>';
}

export function serviceOverlaySpec(service,width=1080,height=1350){
  if(service==='whatsapp_automation'){
    const extraText=[
      'أبغى متجر إلكتروني',
      'تيكنورا: أهلًا',
      'ما نوع نشاطك؟',
      'نشاطي: مواد بناء',
      'تصنيف الطلب','تسجيل CRM','متابعة تلقائية','تحويل للمختص'
    ];
    const svg=[
      '<svg width="'+width+'" height="'+height+'" xmlns="http://www.w3.org/2000/svg">',
      '<rect x="54" y="170" width="510" height="520" rx="38" fill="#060B1E" fill-opacity=".97" stroke="#00D2FF" stroke-opacity=".65" stroke-width="2"/>',
      textEl(309,228,'محادثة العميل',31,800,'#FFFFFF','middle'),
      '<rect x="100" y="270" width="390" height="80" rx="24" fill="#14233F"/>',
      textEl(295,321,'أبغى متجر إلكتروني',25,700,'#FFFFFF','middle'),
      '<rect x="145" y="375" width="365" height="112" rx="24" fill="#0A5CFF"/>',
      textEl(327,418,'تيكنورا: أهلًا',23,700,'#FFFFFF','middle'),
      textEl(327,455,'ما نوع نشاطك؟',22,600,'#FFFFFF','middle'),
      '<rect x="100" y="512" width="300" height="78" rx="24" fill="#14233F"/>',
      textEl(250,561,'نشاطي: مواد بناء',24,600,'#FFFFFF','middle'),
      '<path d="M565 430 C660 430 650 760 720 760" fill="none" stroke="#00D2FF" stroke-width="4" stroke-dasharray="10 10"/>',
      '<circle cx="720" cy="760" r="9" fill="#00D2FF"/>',
      '<rect x="580" y="710" width="420" height="445" rx="42" fill="#060B1E" fill-opacity=".97" stroke="#0A5CFF" stroke-opacity=".65" stroke-width="2"/>',
      textEl(790,772,'رحلة الأتمتة',31,800,'#FFFFFF','middle'),
      '<rect x="635" y="820" width="310" height="62" rx="20" fill="#0A5CFF"/>',
      textEl(790,860,'تصنيف الطلب',24,700,'#FFFFFF','middle'),
      textEl(790,922,'↓',30,700,'#00D2FF','middle'),
      '<rect x="635" y="945" width="310" height="62" rx="20" fill="#14233F"/>',
      textEl(790,985,'تسجيل في CRM',24,700,'#FFFFFF','middle'),
      textEl(790,1047,'↓',30,700,'#00D2FF','middle'),
      '<rect x="635" y="1070" width="310" height="62" rx="20" fill="#14233F"/>',
      textEl(790,1110,'متابعة تلقائية',24,700,'#FFFFFF','middle'),
      '<rect x="80" y="1175" width="460" height="82" rx="26" fill="#00D2FF" fill-opacity=".16" stroke="#00D2FF" stroke-width="2"/>',
      textEl(310,1227,'تحويل للمختص عند الحاجة',25,800,'#FFFFFF','middle'),
      '</svg>'
    ].join('');
    return {extraText,svg};
  }

  if(service==='web_design'){
    const extraText=[
      'الرئيسية','الخدمات','أعمالنا','تواصل معنا',
      'موقعك يشرح خدمتك من أول زيارة',
      'تصميم مواقع','متاجر إلكترونية','أتمتة الأعمال','اطلب عرضًا'
    ];
    const svg=[
      '<svg width="'+width+'" height="'+height+'" xmlns="http://www.w3.org/2000/svg">',
      '<rect x="70" y="210" width="940" height="850" rx="42" fill="#07152F" fill-opacity=".28" stroke="#00D2FF" stroke-opacity=".75" stroke-width="3"/>',
      '<rect x="70" y="210" width="940" height="90" rx="42" fill="#07152F"/>',
      '<circle cx="122" cy="255" r="8" fill="#00D2FF"/><circle cx="150" cy="255" r="8" fill="#0A5CFF"/>',
      textEl(250,267,'الرئيسية',21,600,'#FFFFFF','middle'),
      textEl(440,267,'الخدمات',21,600,'#FFFFFF','middle'),
      textEl(630,267,'أعمالنا',21,600,'#FFFFFF','middle'),
      textEl(830,267,'تواصل معنا',21,600,'#FFFFFF','middle'),
      '<rect x="560" y="350" width="385" height="235" rx="28" fill="#07152F" fill-opacity=".9"/>',
      '<rect x="135" y="360" width="380" height="215" rx="28" fill="#FFFFFF" fill-opacity=".08" stroke="#00D2FF" stroke-opacity=".35"/>',
      textEl(752,425,'موقعك يشرح خدمتك',34,800,'#FFFFFF','middle'),
      textEl(752,478,'من أول زيارة',30,800,'#00D2FF','middle'),
      '<rect x="690" y="525" width="230" height="58" rx="20" fill="#0A5CFF"/>',
      textEl(805,564,'اطلب عرضًا',23,700,'#FFFFFF','middle'),
      '<rect x="120" y="655" width="250" height="270" rx="28" fill="#07152F" fill-opacity=".86" stroke="#00D2FF" stroke-opacity=".35"/>',
      '<rect x="146" y="682" width="198" height="120" rx="18" fill="#FFFFFF" fill-opacity=".08"/>',
      textEl(245,852,'تصميم مواقع',24,700,'#FFFFFF','middle'),
      '<rect x="415" y="655" width="250" height="270" rx="28" fill="#07152F" fill-opacity=".86" stroke="#00D2FF" stroke-opacity=".35"/>',
      '<rect x="441" y="682" width="198" height="120" rx="18" fill="#FFFFFF" fill-opacity=".08"/>',
      textEl(540,852,'متاجر إلكترونية',23,700,'#FFFFFF','middle'),
      '<rect x="710" y="655" width="250" height="270" rx="28" fill="#07152F" fill-opacity=".86" stroke="#00D2FF" stroke-opacity=".35"/>',
      '<rect x="736" y="682" width="198" height="120" rx="18" fill="#FFFFFF" fill-opacity=".08"/>',
      textEl(835,852,'أتمتة الأعمال',24,700,'#FFFFFF','middle'),
      '<rect x="155" y="955" width="770" height="60" rx="20" fill="#060B1E" fill-opacity=".9"/>',
      textEl(540,994,'صور + محتوى + أقسام + دعوة واضحة للإجراء',22,600,'#FFFFFF','middle'),
      '</svg>'
    ].join('');
    return {extraText,svg};
  }

  const extraText=[
    'مدير الوكلاء',
    'خدمة العملاء — يرد ويصنّف',
    'المبيعات — يتابع الفرص',
    'المحتوى — يجهّز المنشورات',
    'العمليات — ينظم المهام',
    'التحليل — يلخّص النتائج'
  ];
  const svg=[
    '<svg width="'+width+'" height="'+height+'" xmlns="http://www.w3.org/2000/svg">',
    '<rect x="390" y="195" width="300" height="105" rx="34" fill="#0A5CFF" stroke="#00D2FF" stroke-width="3"/>',
    textEl(540,260,'مدير الوكلاء',31,800,'#FFFFFF','middle'),
    '<path d="M540 300 L270 455 M540 300 L810 455 M540 300 L270 790 M540 300 L810 790 M540 300 L540 1040" stroke="#00D2FF" stroke-width="4" stroke-dasharray="12 10" fill="none"/>',
    '<rect x="70" y="430" width="400" height="150" rx="30" fill="#060B1E" fill-opacity=".97" stroke="#0A5CFF" stroke-width="2"/>',
    textEl(270,485,'خدمة العملاء',27,800,'#FFFFFF','middle'), textEl(270,532,'يرد على الاستفسارات',23,600,'#00D2FF','middle'),
    '<rect x="610" y="430" width="400" height="150" rx="30" fill="#060B1E" fill-opacity=".97" stroke="#0A5CFF" stroke-width="2"/>',
    textEl(810,485,'المبيعات',27,800,'#FFFFFF','middle'), textEl(810,532,'يتابع العملاء والفرص',23,600,'#00D2FF','middle'),
    '<rect x="70" y="760" width="400" height="150" rx="30" fill="#060B1E" fill-opacity=".97" stroke="#0A5CFF" stroke-width="2"/>',
    textEl(270,815,'المحتوى',27,800,'#FFFFFF','middle'), textEl(270,862,'يجهّز المنشورات',23,600,'#00D2FF','middle'),
    '<rect x="610" y="760" width="400" height="150" rx="30" fill="#060B1E" fill-opacity=".97" stroke="#0A5CFF" stroke-width="2"/>',
    textEl(810,815,'العمليات',27,800,'#FFFFFF','middle'), textEl(810,862,'ينظّم المهام',23,600,'#00D2FF','middle'),
    '<rect x="325" y="1030" width="430" height="150" rx="30" fill="#060B1E" fill-opacity=".94" stroke="#00D2FF" stroke-width="2"/>',
    textEl(540,1085,'التحليل',27,800,'#FFFFFF','middle'), textEl(540,1132,'يلخّص النتائج',23,600,'#00D2FF','middle'),
    '</svg>'
  ].join('');
  return {extraText,svg};
}

export async function composeServiceExplanation({service,b64,format}){
  if(!b64) throw new Error('functional overlay requires image bytes');
  const sharp=(await import('sharp')).default;
  const width=Number(format?.width)||1080;
  const height=Number(format?.height)||1350;
  const spec=serviceOverlaySpec(service,width,height);
  const out=await sharp(Buffer.from(b64,'base64'))
    .resize(width,height,{fit:'cover'})
    .composite([{input:Buffer.from(spec.svg),top:0,left:0}])
    .png()
    .toBuffer();
  return {b64:out.toString('base64'),extraText:spec.extraText};
}

export default { serviceOverlaySpec, composeServiceExplanation };
