document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('tq-contact-form');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const name = String(values.get('name') || '').trim();
    const phone = String(values.get('phone') || '').trim();
    const service = String(values.get('service') || '').trim();
    const details = String(values.get('details') || '').trim();
    const message = ['السلام عليكم، أرغب في الاستفسار عن خدمات تيكنورا.',
      'الاسم: ' + name, 'رقم التواصل: ' + phone,
      'الخدمة: ' + service, details ? 'تفاصيل المشروع: ' + details : ''].filter(Boolean).join('\n');
    const destination = 'https://wa.me/966551341398?text=' + encodeURIComponent(message);
    window.location.href = destination;
  });
});