
function escapeXml(value){
  return String(value||'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function textEl(x,y,text,size=24,weight=600,fill='#FFFFFF',anchor='end'){
  return '<text x="'+x+'" y="'+y+'" text-anchor="'+anchor+'" direction="rtl" xml:lang="ar" font-family="DejaVu Sans, Noto Sans Arabic, sans-serif" font-size="'+size+'" font-weight="'+weight+'" fill="'+fill+'">'+escapeXml(text)+'</text>';
}

export function serviceOverlaySpec(service,width=1080,height=1350){
  if(service==='whatsapp_automation'){
    const extraText=[
      'العميل: أبغى متجر إلكتروني',
      'Tiqnora: أهلًا، خلّنا نعرف نشاطك',
      'العميل: مواد بناء',
      'تصنيف الطلب','تسجيل CRM','متابعة تلقائية','تحويل للمختص'
    ];
    const svg=[
      '<svg width="'+width+'" height="'+height+'" xmlns="http://www.w3.org/2000/svg">',
      '<rect x="54" y="170" width="510" height="520" rx="38" fill="#060B1E" fill-opacity=".9" stroke="#00D2FF" stroke-opacity=".65" stroke-width="2"/>',
      textEl(515,228,'محادثة العميل',31,800),
      '<rect x="100" y="270" width="390" height="80" rx="24" fill="#14233F"/>',
      textEl(460,321,'العميل: أبغى متجر إلكتروني',24,600),
      '<rect x="145" y="375" width="365" height="92" rx="24" fill="#0A5CFF"/>',
      textEl(478,418,'Tiqnora: أهلًا، خلّنا نعرف نشاطك',22,700),
      '<rect x="100" y="492" width="300" height="78" rx="24" fill="#14233F"/>',
      textEl(370,541,'العميل: مواد بناء',24,600),
      '<path d="M565 430 C660 430 650 760 720 760" fill="none" stroke="#00D2FF" stroke-width="4" stroke-dasharray="10 10"/>',
      '<circle cx="720" cy="760" r="9" fill="#00D2FF"/>',
      '<rect x="580" y="710" width="420" height="445" rx="42" fill="#060B1E" fill-opacity=".92" stroke="#0A5CFF" stroke-opacity=".65" stroke-width="2"/>',
      textEl(950,772,'رحلة الأتمتة',31,800),
      '<rect x="635" y="820" width="310" height="62" rx="20" fill="#0A5CFF"/>',
      textEl(915,860,'تصنيف الطلب',24,700),
      textEl(790,922,'↓',30,700,'#00D2FF','middle'),
      '<rect x="635" y="945" width="310" height="62" rx="20" fill="#14233F"/>',
      textEl(915,985,'تسجيل CRM',24,700),
      textEl(790,1047,'↓',30,700,'#00D2FF','middle'),
      '<rect x="635" y="1070" width="310" height="62" rx="20" fill="#14233F"/>',
      textEl(915,1110,'متابعة تلقائية',24,700),
      '<rect x="80" y="1175" width="460" height="82" rx="26" fill="#00D2FF" fill-opacity=".16" stroke="#00D2FF" stroke-width="2"/>',
      textEl(500,1227,'تحويل للمختص عند الحاجة',25,800),
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
      '<rect x="70" y="210" width="940" height="850" rx="42" fill="#F8FBFF" fill-opacity=".96" stroke="#00D2FF" stroke-opacity=".6" stroke-width="3"/>',
      '<rect x="70" y="210" width="940" height="90" rx="42" fill="#07152F"/>',
      '<circle cx="122" cy="255" r="8" fill="#00D2FF"/><circle cx="150" cy="255" r="8" fill="#0A5CFF"/>',
      textEl(945,267,'الرئيسية   الخدمات   أعمالنا   تواصل معنا',22,600),
      '<rect x="120" y="342" width="840" height="270" rx="30" fill="#07152F"/>',
      '<rect x="150" y="380" width="320" height="180" rx="24" fill="#0A5CFF" fill-opacity=".2"/>',
      '<rect x="178" y="408" width="264" height="124" rx="18" fill="#00D2FF" fill-opacity=".28"/>',
      textEl(920,425,'موقعك يشرح خدمتك',38,800),
      textEl(920,478,'من أول زيارة',31,800,'#00D2FF'),
      '<rect x="690" y="525" width="230" height="58" rx="20" fill="#0A5CFF"/>',
      textEl(805,564,'اطلب عرضًا',23,700,'#FFFFFF','middle'),
      '<rect x="120" y="655" width="250" height="270" rx="28" fill="#FFFFFF" stroke="#D6E2F2"/>',
      '<rect x="146" y="682" width="198" height="120" rx="18" fill="#0A5CFF" fill-opacity=".16"/>',
      textEl(335,852,'تصميم مواقع',25,700,'#07152F'),
      '<rect x="415" y="655" width="250" height="270" rx="28" fill="#FFFFFF" stroke="#D6E2F2"/>',
      '<rect x="441" y="682" width="198" height="120" rx="18" fill="#00D2FF" fill-opacity=".18"/>',
      textEl(630,852,'متاجر إلكترونية',25,700,'#07152F'),
      '<rect x="710" y="655" width="250" height="270" rx="28" fill="#FFFFFF" stroke="#D6E2F2"/>',
      '<rect x="736" y="682" width="198" height="120" rx="18" fill="#0A5CFF" fill-opacity=".12"/>',
      textEl(925,852,'أتمتة الأعمال',25,700,'#07152F'),
      '<rect x="155" y="955" width="770" height="60" rx="20" fill="#EEF5FF"/>',
      textEl(890,994,'صور + محتوى + أقسام + دعوة واضحة للإجراء',23,600,'#12325F'),
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
    '<rect x="70" y="430" width="400" height="150" rx="30" fill="#060B1E" fill-opacity=".92" stroke="#0A5CFF" stroke-width="2"/>',
    textEl(430,485,'خدمة العملاء',27,800), textEl(430,532,'يرد ويصنّف الاستفسارات',23,600,'#00D2FF'),
    '<rect x="610" y="430" width="400" height="150" rx="30" fill="#060B1E" fill-opacity=".92" stroke="#0A5CFF" stroke-width="2"/>',
    textEl(970,485,'المبيعات',27,800), textEl(970,532,'يتابع الفرص والعملاء',23,600,'#00D2FF'),
    '<rect x="70" y="760" width="400" height="150" rx="30" fill="#060B1E" fill-opacity=".92" stroke="#0A5CFF" stroke-width="2"/>',
    textEl(430,815,'المحتوى',27,800), textEl(430,862,'يجهّز المنشورات والمسودات',23,600,'#00D2FF'),
    '<rect x="610" y="760" width="400" height="150" rx="30" fill="#060B1E" fill-opacity=".92" stroke="#0A5CFF" stroke-width="2"/>',
    textEl(970,815,'العمليات',27,800), textEl(970,862,'ينظّم المهام والمتابعة',23,600,'#00D2FF'),
    '<rect x="325" y="1030" width="430" height="150" rx="30" fill="#060B1E" fill-opacity=".94" stroke="#00D2FF" stroke-width="2"/>',
    textEl(715,1085,'التحليل',27,800), textEl(715,1132,'يلخّص النتائج والخطوة التالية',23,600,'#00D2FF'),
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
