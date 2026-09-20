-- 040_whop_payment_method_cleanup.sql
-- Safe cleanup: Whop paid orders incorrectly defaulted to payment_method=cod
-- Do NOT touch real COD / bank_transfer orders.

-- Preview (run first):
-- SELECT id, order_number, payment_provider, payment_method, payment_status, status, created_at
-- FROM public.orders
-- WHERE payment_provider = 'whop'
--   AND payment_status = 'paid'
--   AND payment_method = 'cod';

UPDATE public.orders
SET payment_method = 'credit_card',
    updated_at = now()
WHERE payment_provider = 'whop'
  AND payment_status = 'paid'
  AND payment_method = 'cod';

-- Optional preview of unpaid Whop attempts left as-is (no delete):
-- SELECT id, order_number, payment_status, status, provider_checkout_id, created_at
-- FROM public.orders
-- WHERE payment_provider = 'whop'
--   AND payment_status = 'unpaid'
--   AND status = 'pending'
--   AND provider_checkout_id IS NULL
-- ORDER BY created_at DESC
-- LIMIT 50;
