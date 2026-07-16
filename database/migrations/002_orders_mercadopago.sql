-- Ejecutar en Supabase SQL Editor si las columnas aún no existen.
-- Campos para Checkout Pro (preference_id) y seguimiento de pagos Mercado Pago.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS mp_preference_id text,
  ADD COLUMN IF NOT EXISTS mp_payment_id text,
  ADD COLUMN IF NOT EXISTS mp_status text;

CREATE INDEX IF NOT EXISTS idx_orders_mp_preference_id ON public.orders (mp_preference_id);
CREATE INDEX IF NOT EXISTS idx_orders_mp_payment_id ON public.orders (mp_payment_id);

COMMENT ON COLUMN public.orders.mp_preference_id IS 'ID de preferencia Checkout Pro (Mercado Pago)';
COMMENT ON COLUMN public.orders.mp_payment_id IS 'ID del pago en Mercado Pago';
COMMENT ON COLUMN public.orders.mp_status IS 'Estado crudo reportado por Mercado Pago (approved, pending, rejected, ...)';
