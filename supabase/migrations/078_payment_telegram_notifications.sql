-- Tiqnora payment receipt Telegram outbox.
-- Append-only enqueue on a gateway-confirmed payment transition; duplicate webhooks cannot enqueue twice.
CREATE TABLE IF NOT EXISTS public.payment_telegram_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','skipped')),
  attempts int NOT NULL DEFAULT 0,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_telegram_notifications_queue
  ON public.payment_telegram_notifications (status, created_at)
  WHERE status <> 'sent';
ALTER TABLE public.payment_telegram_notifications ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.payment_telegram_notifications IS
  'Private service-role-only notification outbox for verified Whop payments.';

CREATE OR REPLACE FUNCTION public.enqueue_verified_whop_telegram_payment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status = 'paid'
     AND OLD.payment_status IS DISTINCT FROM 'paid'
     AND NEW.payment_provider = 'whop'
     AND NEW.provider_payment_id IS NOT NULL
     AND NULLIF(NEW.payment_meta->>'paid_at', '') IS NOT NULL
     AND (NEW.payment_meta->>'last_event') IN ('payment.succeeded', 'payment.created') THEN
    INSERT INTO public.payment_telegram_notifications (order_id)
    VALUES (NEW.id)
    ON CONFLICT (order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_whop_payment_telegram_receipt ON public.orders;
CREATE TRIGGER enqueue_whop_payment_telegram_receipt
AFTER UPDATE OF payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enqueue_verified_whop_telegram_payment();
