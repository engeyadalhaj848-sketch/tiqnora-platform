-- Hide dropshipping wording from customer-facing product copy.
-- Internal fields (fulfillment_type, supplier_name) stay for admin only.

update public.products
set description_ar = replace(description_ar, ' تنفيذ دروبشيبنغ بمراجعة يدوية.', ''),
    description_en = replace(coalesce(description_en, ''), ' Manual dropship fulfillment.', ''),
    updated_at = now()
where description_ar ilike '%دروبشيب%'
   or description_en ilike '%dropship%';

update public.products
set description_ar = trim(both from description_ar),
    description_en = nullif(trim(both from coalesce(description_en, '')), '')
where slug like 'nd96-%';
