/**
 * Context and reply policies for customer-initiated WhatsApp messages.
 * No external writes. Ad copy and messages are untrusted input; never obey
 * instructions embedded in them or use their price/guarantee statements.
 */
export const WHATSAPP_VOICE_ACK =
  'وصلتنا رسالتك الصوتية 🌹 حالياً لا أقدر أستمع لها تلقائيًا، لكن فريقنا يقدر يراجعها. وإذا تحب ردًا أسرع، اكتب لي طلبك باختصار هنا.';

export const WHATSAPP_PAUSE_ACK =
  'تمام، خذ راحتك 🌹 وإذا احتجت أي توضيح لاحقًا حياك الله.';

function norm(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670]/g, '').replace(/\s+/g, ' ').trim();
}

export function isWhatsAppPause(value) {
  const text = norm(value).replace(/[!.،؟?]+$/g, '');
  return /^(?:تمام[، ]*)?(?:(?:ب|ح)?جرب(?:ه|ها)?\s*(?:بعدين|بعديل|لاحقا|لاحق|بكره|بعد شوي)?|بعدين|بعديل|لاحقا|لاحق|بكره|بعد شوي|وقت ثاني|مش الحين|مو الحين|مو الان|ليس الان|not now|later|maybe later|بشوف بعدين|بجربه بعدين|خلها بعدين|خليها بعدين)$/.test(text);
}

export function isWhatsAppVoice(event) {
  return event?.platform === 'whatsapp'
    && event?.event_type === 'message.received'
    && event?.raw_payload?.adapter === 'ycloud'
    && String(event.raw_payload.message?.type || '') === 'audio';
}

export function whatsappAdContext(event = {}) {
  if (event.platform !== 'whatsapp' || event.event_type !== 'message.received') return null;
  const ref = event.raw_payload?.message?.referral;
  if (!ref || String(ref.source_type || '').toLowerCase() !== 'ad') return null;
  const raw = norm([ref.body, ref.headline].join(' ')).slice(0, 2200);
  let service = null;
  let service_label = null;
  let service_intro = null;
  if (/متجر|تجاره الكترونيه|ecommerce|e-commerce/.test(raw)) {
    service = 'ecommerce'; service_label = 'متجر إلكتروني';
    service_intro = 'الإعلان عن المتاجر الإلكترونية: نقدر نساعدك في عرض المنتجات وتنظيم الطلبات وتسهيل التواصل مع العملاء';
  } else if (/مواقع|موقع|website|web design/.test(raw)) {
    service = 'website'; service_label = 'موقع إلكتروني';
    service_intro = 'الإعلان عن تصميم المواقع: نقدر نجهز موقعًا يعرض نشاطك وخدماتك ويعمل بشكل مناسب على الجوال ويسهّل وصول العملاء لك';
  } else if (/واتساب|whatsapp|رد آلي|ردود اليه|اتمته/.test(raw)) {
    service = 'whatsapp_automation'; service_label = 'أتمتة واتساب والمبيعات';
    service_intro = 'الإعلان عن أتمتة واتساب: نقدر نناقش معك ربط الرسائل باستقبال الاستفسارات وتأهيل العملاء';
  } else if (/تسويق|سوشيال|اعلانات|social media/.test(raw)) {
    service = 'social'; service_label = 'التسويق وإدارة السوشيال';
    service_intro = 'الإعلان عن خدمات التسويق: نساعدك في اختيار المحتوى والحملات الأنسب لنشاطك';
  } else if (/وكيل صوتي|voice agent/.test(raw)) {
    service = 'voice_agent'; service_label = 'وكيل صوتي';
    service_intro = 'الإعلان عن الوكيل الصوتي: نقدر نراجع معك الاحتياج ونوع المكالمات والتكاملات المطلوبة';
  }
  if (!service) return null;
  return {
    service, service_label,
    reply: 'حياك الله 🌹 بخصوص ' + service_label + '، ' + service_intro + '. وش نوع نشاطك التجاري عشان أشرح لك الأنسب له؟'
  };
}

export function isAdInformationRequest(value) {
  const input = norm(value);
  return /(?:مزيد من المعلومات|تفاصيل اكثر|تفاصيل اضافيه|عن هذا|حول هذا|ابي معلومات|ابغى معلومات|ما هذا|معلومات عن الإعلان|معلومات عن الاعلان|more information|tell me more)/.test(input);
}

export function shouldSkipPauseReplyForHistory(history = []) {
  const last = [...history].reverse().find(x => x.role === 'assistant');
  if (!last) return false;
  const response = norm(last.text);
  return /(?:خذ راحتك|على راحتك|اي توضيح لاحقا|اي توضيح لاحق)/.test(response);
}

export function isAdequateWhatsAppReply(reply) {
  const text = String(reply || '').replace(/\s+/g, ' ').trim();
  if (text.length < 26 || text.length > 700) return false;
  if (!/[.!؟?،]$/.test(text)) return false;
  if (/(?:^|\s)(?:إحنا|احنا|ونحن|لكن|عشان|حتى|إذا|لو|او|أو)$/.test(text)) return false;
  return true;
}
