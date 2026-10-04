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
      'تصنيف الطلب','حفظ بيانات العميل','متابعة تلقائية','تحويل للمختص'
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
      textEl(790,985,'حفظ بيانات العميل',23,700,'#FFFFFF','middle'),
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
      'موقع احترافي يوضح قيمتك',
      'تجربة متجاوبة',
      'رحلة عميل واضحة',
      'متجر جاهز للنمو'
    ];
    const svg=[
      '<svg width="'+width+'" height="'+height+'" xmlns="http://www.w3.org/2000/svg">',
      '<rect x="70" y="930" width="940" height="285" rx="44" fill="#17130D" fill-opacity=".90" stroke="#D9A441" stroke-opacity=".75" stroke-width="2"/>',
      textEl(930,1000,'موقع احترافي يوضح قيمتك',35,800,'#FFFFFF','end'),
      '<rect x="95" y="1055" width="270" height="70" rx="22" fill="#D9A441" fill-opacity=".18" stroke="#D9A441" stroke-width="1.5"/>',
      textEl(230,1099,'تجربة متجاوبة',23,700,'#F4D58D','middle'),
      '<rect x="405" y="1055" width="270" height="70" rx="22" fill="#FFFFFF" fill-opacity=".08"/>',
      textEl(540,1099,'رحلة عميل واضحة',23,700,'#FFFFFF','middle'),
      '<rect x="715" y="1055" width="270" height="70" rx="22" fill="#D9A441" fill-opacity=".18" stroke="#D9A441" stroke-width="1.5"/>',
      textEl(850,1099,'متجر جاهز للنمو',23,700,'#F4D58D','middle'),
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
