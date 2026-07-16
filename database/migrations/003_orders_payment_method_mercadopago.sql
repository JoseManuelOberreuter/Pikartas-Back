-- Permitir payment_method = 'mercadopago' en orders.
-- El CHECK actual (orders_payment_method_check) suele aceptar solo 'webpay'.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IN ('webpay', 'mercadopago'));
